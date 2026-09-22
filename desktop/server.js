const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { neon } = require('@neondatabase/serverless');
const nodemailer = require('nodemailer');

const ALERT_AFTER_HOURS = 48;

function loadConfig() {
  const candidates = [
    path.join(process.resourcesPath || '', 'config.json'), // 打包后
    path.join(__dirname, 'config.json'), // 开发时
  ];
  for (const p of candidates) {
    try {
      const c = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (c && c.databaseUrl && c.smtp) return c;
    } catch (_) {
      /* 尝试下一个路径 */
    }
  }
  throw new Error('缺少 config.json（需包含 databaseUrl 与 smtp 配置）');
}

const config = loadConfig();
const sql = neon(config.databaseUrl);

// 预热数据库 + 定期心跳，避免 Neon 免费版计算实例休眠带来的冷启动延迟
function warmup() {
  sql`SELECT 1`.catch(() => {});
}
warmup();
setInterval(warmup, 4 * 60 * 1000);

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        password_hash TEXT,
        name TEXT NOT NULL DEFAULT '',
        emails TEXT NOT NULL DEFAULT '[]',
        last_checkin TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        alerted BOOLEAN NOT NULL DEFAULT false,
        alert_sent_at TIMESTAMPTZ
      )
    `
      .then(() => sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`)
      .then(() => sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`)
      .then(() =>
        sql`
          CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `
      )
      .then(() => undefined)
      .catch((e) => {
        tableReady = null; // 失败则允许下次重试
        throw e;
      });
  }
  return tableReady;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return EMAIL_RE.test(email);
}

function normalizeEmails(input) {
  const raw = Array.isArray(input) ? input.map(String) : [];
  const seen = new Set();
  const result = [];
  for (const item of raw) {
    const email = item.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) throw new Error(`邮箱格式不正确：${email}`);
    if (!seen.has(email)) {
      seen.add(email);
      result.push(email);
    }
  }
  if (result.length === 0) throw new Error('请至少填写一个联系人邮箱');
  if (result.length > 3) throw new Error('最多只能设置 3 个联系人邮箱');
  return result;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: { user: config.smtp.user, pass: config.smtp.pass },
});

async function sendTestEmail(to) {
  await transporter.sendMail({
    from: `平安签到 <${config.smtp.from || config.smtp.user}>`,
    to,
    subject: '✅【平安签到】测试邮件',
    text: '这是一封来自「平安签到」的测试邮件，说明邮件发送功能已配置成功。',
  });
}

async function sendAlertEmail({ to, name, lastCheckin }) {
  const display = name ? `「${name}」` : '您关注的人';
  const lastText = lastCheckin
    ? `上次签到时间：${lastCheckin.toLocaleString('zh-CN', { hour12: false })}`
    : '对方在设置后尚未完成过签到';
  await transporter.sendMail({
    from: `平安签到 <${config.smtp.from || config.smtp.user}>`,
    to: to.join(', '),
    subject: `⚠️【平安签到】预警：${display}已连续两天未签到`,
    text: [
      '您好，',
      '',
      '这是一封由「平安签到」自动发送的预警邮件。',
      '',
      `${display} 已连续两天（48 小时）未完成每日签到，可能遇到了意外情况。`,
      '',
      lastText,
      '',
      '请尽快通过电话或其他方式联系确认其安全。',
      '',
      '—— 平安签到（系统自动发送，请勿直接回复）',
    ].join('\n'),
  });
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function handle(fn, req, res) {
  try {
    await fn(req, res);
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || String(e) });
  }
}

// 认证：从 Authorization 头提取 token，查找对应用户
async function getUserByToken(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  await ensureTable();
  const rows = await sql`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ${token}
  `;
  return rows.length ? rows[0] : null;
}

function isAdmin(user) {
  if (!user) return false;
  const adminEmail = (config.adminEmail || '').trim().toLowerCase();
  if (!adminEmail) return false;
  return String(user.email || '').toLowerCase() === adminEmail;
}

async function runAlertCheck() {
  await ensureTable();
  const rows = await sql`
    SELECT * FROM users
    WHERE alerted = false
      AND COALESCE(last_checkin, created_at) < now() - (${ALERT_AFTER_HOURS} || ' hours')::interval
  `;
  const results = [];
  for (const u of rows) {
    const emails = JSON.parse(String(u.emails || '[]'));
    if (emails.length === 0) continue;
    try {
      await sendAlertEmail({
        to: emails,
        name: u.name || undefined,
        lastCheckin: u.last_checkin ? new Date(u.last_checkin) : null,
      });
      await sql`UPDATE users SET alerted = true, alert_sent_at = now() WHERE id = ${u.id}`;
      results.push({ id: u.id, email: u.email || '', ok: true });
    } catch (e) {
      results.push({ id: u.id, email: u.email || '', ok: false, error: (e && e.message) || String(e) });
    }
  }
  return { checked: rows.length, results };
}

app.post('/api/register', (req, res) =>
  handle(async () => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const password = String((req.body || {}).password || '');
    if (!isValidEmail(email)) return res.status(400).json({ error: '邮箱格式不正确' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
    await ensureTable();
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) return res.status(409).json({ error: '该邮箱已注册，请直接登录' });
    const id = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    await sql`INSERT INTO users (id, email, password_hash, created_at) VALUES (${id}, ${email}, ${passwordHash}, now())`;
    const token = generateToken();
    await sql`INSERT INTO sessions (token, user_id, created_at) VALUES (${token}, ${id}, now())`;
    res.json({ token, user: { id, email, name: '', emails: [] } });
  }, req, res)
);

app.post('/api/login', (req, res) =>
  handle(async () => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const password = String((req.body || {}).password || '');
    if (!isValidEmail(email) || !password) return res.status(400).json({ error: '请输入邮箱和密码' });
    await ensureTable();
    const rows = await sql`SELECT * FROM users WHERE email = ${email}`;
    if (rows.length === 0) return res.status(401).json({ error: '邮箱或密码错误' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.status(401).json({ error: '邮箱或密码错误' });
    const token = generateToken();
    await sql`INSERT INTO sessions (token, user_id, created_at) VALUES (${token}, ${user.id}, now())`;
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, emails: JSON.parse(String(user.emails || '[]')) },
    });
  }, req, res)
);

app.post('/api/logout', (req, res) =>
  handle(async () => {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (token) await sql`DELETE FROM sessions WHERE token = ${token}`;
    res.json({ ok: true });
  }, req, res)
);

app.post('/api/checkin', (req, res) =>
  handle(async () => {
    const user = await getUserByToken(req);
    if (!user) return res.status(401).json({ error: '未登录' });
    await ensureTable();
    const updated = await sql`
      UPDATE users SET last_checkin = now(), alerted = false, alert_sent_at = NULL
      WHERE id = ${user.id} RETURNING last_checkin
    `;
    const lastCheckin = updated[0] && updated[0].last_checkin
      ? new Date(updated[0].last_checkin).toISOString()
      : null;
    res.json({ ok: true, lastCheckin });
  }, req, res)
);

app.get('/api/status', (req, res) =>
  handle(async () => {
    await ensureTable();
    const user = await getUserByToken(req);
    if (!user) return res.status(401).json({ error: '未登录' });
    const lastCheckin = user.last_checkin ? new Date(user.last_checkin) : null;
    const createdAt = new Date(user.created_at);
    const baseline = lastCheckin || createdAt;
    const safeUntil = new Date(baseline.getTime() + ALERT_AFTER_HOURS * 3600000);
    const hoursLeft = Math.max(0, (safeUntil.getTime() - Date.now()) / 3600000);
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      emails: JSON.parse(String(user.emails || '[]')),
      lastCheckin: lastCheckin ? lastCheckin.toISOString() : null,
      createdAt: createdAt.toISOString(),
      alerted: !!user.alerted,
      safeUntil: safeUntil.toISOString(),
      hoursLeft,
      isAdmin: isAdmin(user),
    });
  }, req, res)
);

app.post('/api/update', (req, res) =>
  handle(async () => {
    const user = await getUserByToken(req);
    if (!user) return res.status(401).json({ error: '未登录' });
    const body = req.body || {};
    const name = String(body.name || '').trim().slice(0, 50);
    const emails = normalizeEmails(body.emails);
    await ensureTable();
    await sql`UPDATE users SET name = ${name}, emails = ${JSON.stringify(emails)} WHERE id = ${user.id}`;
    res.json({ ok: true, id: user.id, name, emails });
  }, req, res)
);

app.post('/api/test-email', (req, res) =>
  handle(async () => {
    const user = await getUserByToken(req);
    if (!user) return res.status(401).json({ error: '未登录' });
    await ensureTable();
    const emails = JSON.parse(String(user.emails || '[]'));
    if (emails.length === 0) return res.status(400).json({ error: '尚未设置联系人邮箱' });
    await sendTestEmail(emails[0]);
    res.json({ ok: true, to: emails[0] });
  }, req, res)
);

app.get('/api/admin/users', (req, res) =>
  handle(async () => {
    const user = await getUserByToken(req);
    if (!user) return res.status(401).json({ error: '未登录' });
    if (!isAdmin(user)) return res.status(403).json({ error: '无权限' });
    await ensureTable();
    const rows = await sql`SELECT id, email, name, emails, last_checkin, created_at, alerted FROM users ORDER BY created_at DESC`;
    const users = rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      emails: JSON.parse(String(u.emails || '[]')),
      lastCheckin: u.last_checkin ? new Date(u.last_checkin).toISOString() : null,
      createdAt: new Date(u.created_at).toISOString(),
      alerted: !!u.alerted,
    }));
    res.json({ users });
  }, req, res)
);

app.post('/api/admin/check', (req, res) =>
  handle(async () => {
    const user = await getUserByToken(req);
    if (!user) return res.status(401).json({ error: '未登录' });
    if (!isAdmin(user)) return res.status(403).json({ error: '无权限' });
    const result = await runAlertCheck();
    res.json(result);
  }, req, res)
);

function startServer(port = 3377) {
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      resolve({ port, url: `http://127.0.0.1:${port}` });
    });
    server.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        resolve(startServer(port + 1));
      }
    });
  });
}

module.exports = { startServer };
