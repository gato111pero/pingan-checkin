const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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
        name TEXT NOT NULL DEFAULT '',
        emails TEXT NOT NULL DEFAULT '[]',
        last_checkin TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        alerted BOOLEAN NOT NULL DEFAULT false,
        alert_sent_at TIMESTAMPTZ
      )
    `.then(() => undefined);
  }
  return tableReady;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

app.post('/api/setup', (req, res) =>
  handle(async () => {
    const body = req.body || {};
    const name = String(body.name || '').trim().slice(0, 50);
    const emails = normalizeEmails(body.emails);
    const id = crypto.randomUUID();
    await ensureTable();
    await sql`INSERT INTO users (id, name, emails, created_at) VALUES (${id}, ${name}, ${JSON.stringify(emails)}, now())`;
    res.json({ id, name, emails });
  }, req, res)
);

app.post('/api/checkin', (req, res) =>
  handle(async () => {
    const id = String((req.body || {}).id || '').trim();
    if (!id) return res.status(400).json({ error: '缺少 id' });
    await ensureTable();
    const updated = await sql`
      UPDATE users SET last_checkin = now(), alerted = false, alert_sent_at = NULL
      WHERE id = ${id} RETURNING last_checkin
    `;
    if (updated.length === 0) return res.status(404).json({ error: '未找到该用户' });
    const lastCheckin = updated[0].last_checkin
      ? new Date(updated[0].last_checkin).toISOString()
      : null;
    res.json({ ok: true, lastCheckin });
  }, req, res)
);

app.get('/api/status', (req, res) =>
  handle(async () => {
    const id = String(req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: '缺少 id' });
    await ensureTable();
    const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (rows.length === 0) return res.status(404).json({ error: '未找到该用户' });
    const u = rows[0];
    const lastCheckin = u.last_checkin ? new Date(u.last_checkin) : null;
    const createdAt = new Date(u.created_at);
    const baseline = lastCheckin || createdAt;
    const safeUntil = new Date(baseline.getTime() + ALERT_AFTER_HOURS * 3600000);
    const hoursLeft = Math.max(0, (safeUntil.getTime() - Date.now()) / 3600000);
    res.json({
      id: u.id,
      name: u.name,
      emails: JSON.parse(String(u.emails || '[]')),
      lastCheckin: lastCheckin ? lastCheckin.toISOString() : null,
      createdAt: createdAt.toISOString(),
      alerted: !!u.alerted,
      safeUntil: safeUntil.toISOString(),
      hoursLeft,
    });
  }, req, res)
);

app.post('/api/update', (req, res) =>
  handle(async () => {
    const body = req.body || {};
    const id = String(body.id || '').trim();
    const name = String(body.name || '').trim().slice(0, 50);
    const emails = normalizeEmails(body.emails);
    if (!id) return res.status(400).json({ error: '缺少 id' });
    await ensureTable();
    const updated = await sql`
      UPDATE users SET name = ${name}, emails = ${JSON.stringify(emails)}
      WHERE id = ${id} RETURNING id
    `;
    if (updated.length === 0) return res.status(404).json({ error: '未找到该用户' });
    res.json({ ok: true, id, name, emails });
  }, req, res)
);

app.post('/api/test-email', (req, res) =>
  handle(async () => {
    const id = String((req.body || {}).id || '').trim();
    if (!id) return res.status(400).json({ error: '缺少 id' });
    await ensureTable();
    const rows = await sql`SELECT emails FROM users WHERE id = ${id}`;
    if (rows.length === 0) return res.status(404).json({ error: '未找到该用户' });
    const emails = JSON.parse(String(rows[0].emails || '[]'));
    if (emails.length === 0) return res.status(400).json({ error: '尚未设置联系人邮箱' });
    await sendTestEmail(emails[0]);
    res.json({ ok: true, to: emails[0] });
  }, req, res)
);

function startServer(port = 3377) {
  return new Promise((resolve) => {
    const server = app.listen(port, '127.0.0.1', () => {
      resolve({ port, url: `http://127.0.0.1:${port}` });
    });
    server.on('error', (err) => {
      // 端口被占用时自动尝试下一个端口
      if (err && err.code === 'EADDRINUSE') {
        resolve(startServer(port + 1));
      }
    });
  });
}

module.exports = { startServer };
