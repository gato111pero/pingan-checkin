'use client';

import { useEffect, useState } from 'react';

interface Status {
  id: string;
  email: string;
  name: string;
  emails: string[];
  lastCheckin: string | null;
  createdAt: string;
  alerted: boolean;
  safeUntil: string;
  hoursLeft: number;
  isAdmin: boolean;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  emails: string[];
  lastCheckin: string | null;
  createdAt: string;
  alerted: boolean;
}

type Phase = 'loading' | 'auth' | 'setup' | 'dashboard';

function fmt(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  });
}

function fmtCountdown(hours: number): string {
  if (hours <= 0) return '已逾期';
  const totalSec = Math.floor(hours * 3600);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d >= 1) return `${d} 天 ${h} 小时 ${m} 分`;
  if (h >= 1) return `${h} 小时 ${m} 分 ${s} 秒`;
  return `${m} 分 ${s} 秒`;
}

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [emails, setEmails] = useState<string[]>(['', '', '']);
  const [editOpen, setEditOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [adminUsers, setAdminUsers] = useState<AdminUser[] | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);

  async function api(path: string, opts: RequestInit = {}) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((opts.headers as Record<string, string>) || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (data.error) throw new Error(data.error);
    return data;
  }

  // 初始化：读取本地 token
  useEffect(() => {
    const t = localStorage.getItem('pa_token');
    if (t) setToken(t);
    else setPhase('auth');
  }, []);

  // token 变化时拉取状态
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch('/api/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setStatus(data);
        setPhase(data.emails && data.emails.length > 0 ? 'dashboard' : 'setup');
      } catch {
        localStorage.removeItem('pa_token');
        setToken(null);
        setPhase('auth');
      }
    })();
  }, [token]);

  // 倒计时每秒刷新
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  function setEmailAt(i: number, value: string) {
    setEmails((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const data = await api(authMode === 'login' ? '/api/login' : '/api/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('pa_token', data.token);
      setToken(data.token);
      setMsg(authMode === 'login' ? '✅ 登录成功' : '✅ 注册成功');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {
      /* 忽略 */
    }
    localStorage.removeItem('pa_token');
    setToken(null);
    setStatus(null);
    setMsg('');
    setError('');
    setPhase('auth');
  }

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api('/api/update', {
        method: 'POST',
        body: JSON.stringify({ name, emails }),
      });
      const data = await api('/api/status');
      setStatus(data);
      setPhase('dashboard');
      setMsg('✅ 设置成功！每天点一次「签到」即可。');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckin() {
    if (!token) return;
    setError('');
    setMsg('✅ 签到成功！');
    const prevStatus = status;
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            lastCheckin: new Date().toISOString(),
            alerted: false,
            safeUntil: new Date(Date.now() + 48 * 3600_000).toISOString(),
            hoursLeft: 48,
          }
        : prev
    );
    try {
      const data = await api('/api/checkin', { method: 'POST', body: '{}' });
      if (data.lastCheckin) {
        setStatus((prev) => (prev ? { ...prev, lastCheckin: data.lastCheckin } : prev));
      }
    } catch (err) {
      setStatus(prevStatus);
      setMsg('');
      setError((err as Error).message);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await api('/api/update', {
        method: 'POST',
        body: JSON.stringify({ name, emails }),
      });
      const data = await api('/api/status');
      setStatus(data);
      setEditOpen(false);
      setMsg('✅ 联系人已更新');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleTestEmail() {
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const data = await api('/api/test-email', { method: 'POST', body: '{}' });
      setMsg(`✅ 测试邮件已发送到 ${data.to}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadAdminUsers() {
    setAdminBusy(true);
    setError('');
    try {
      const data = await api('/api/admin/users');
      setAdminUsers(data.users);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function runAlertCheck() {
    setAdminBusy(true);
    setError('');
    setMsg('');
    try {
      const data = await api('/api/admin/check', { method: 'POST' });
      const okCount = data.results.filter((r: { ok: boolean }) => r.ok).length;
      setMsg(`✅ 检查完成：共 ${data.checked} 人待处理，成功发送 ${okCount} 封预警邮件`);
      const usersData = await api('/api/admin/users');
      setAdminUsers(usersData.users);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdminBusy(false);
    }
  }

  function openEdit() {
    if (status) {
      setName(status.name || '');
      setEmails([
        status.emails[0] || '',
        status.emails[1] || '',
        status.emails[2] || '',
      ]);
      setEditOpen(true);
      setError('');
      setMsg('');
    }
  }

  const liveHours = status?.safeUntil
    ? Math.max(0, (new Date(status.safeUntil).getTime() - now) / 3600000)
    : status?.hoursLeft ?? 0;

  const emailFields = (requiredFirst: boolean) => (
    <>
      {emails.map((emailVal, i) => (
        <div className="field" key={i}>
          <label>
            紧急联系人邮箱 {i + 1}
            {i === 0 ? '（必填）' : '（可选）'}
          </label>
          <input
            type="email"
            value={emailVal}
            onChange={(e) => setEmailAt(i, e.target.value)}
            placeholder={i === 0 ? '例如：friend@example.com' : '可不填'}
            required={i === 0}
          />
        </div>
      ))}
    </>
  );

  if (phase === 'loading') {
    return (
      <div className="container">
        <div className="header">
          <div className="logo">🕊️</div>
          <h1>平安签到</h1>
        </div>
        <p className="hint" style={{ textAlign: 'center', marginTop: 32 }}>
          加载中…
        </p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <div className="logo">🕊️</div>
        <h1>平安签到</h1>
        <p>设置紧急联系人，每天签到一次。<br />连续两天未签到，自动通知联系人。</p>
      </div>

      {error && <div className="error">{error}</div>}
      {msg && <div className="msg">{msg}</div>}

      {phase === 'auth' && (
        <div className="card">
          <h2>{authMode === 'login' ? '登录' : '注册账号'}</h2>
          <form onSubmit={handleAuthSubmit}>
            <div className="field">
              <label>邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="field">
              <label>密码{authMode === 'login' ? '' : '（至少 6 位）'}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="密码"
                minLength={6}
                required
              />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? '请稍候…' : authMode === 'login' ? '登录' : '注册'}
            </button>
            <p className="hint" style={{ textAlign: 'center', marginTop: 12 }}>
              <button
                type="button"
                className="small-link"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setError('');
                  setMsg('');
                }}
              >
                {authMode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
              </button>
            </p>
          </form>
        </div>
      )}

      {phase === 'setup' && (
        <div className="card">
          <h2>设置紧急联系人</h2>
          <form onSubmit={handleSetup}>
            <div className="field">
              <label>你的昵称（可选）</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：小明"
                maxLength={50}
              />
            </div>
            {emailFields(true)}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存并开始'}
            </button>
            <p className="hint">预警将由服务器定时执行，即使你电脑关机也会照常触发。</p>
          </form>
          <div style={{ marginTop: 12 }}>
            <button className="small-link" type="button" onClick={handleLogout}>
              退出登录
            </button>
          </div>
        </div>
      )}

      {phase === 'dashboard' && status && !editOpen && (
        <>
          <div className="card">
            {status.alerted && (
              <div className="alert-banner">
                ⚠️ 已连续两天未签到，系统已向你的联系人发送预警邮件。点击签到后将解除预警。
              </div>
            )}
            <div
              className={`countdown ${
                status.alerted ? 'danger' : liveHours <= 12 ? 'warn' : 'safe'
              }`}
            >
              <span className="big">
                {status.alerted ? '已触发预警' : fmtCountdown(liveHours)}
              </span>
              {!status.alerted && '距离触发预警剩余时间'}
            </div>
            <button className="btn checkin-btn" onClick={handleCheckin}>
              ✅ 我今日平安，签到
            </button>
          </div>

          <div className="card">
            <h2>签到状态</h2>
            <div className="status-grid">
              <div className="stat">
                <div className="label">上次签到时间</div>
                <div className="value">{fmt(status.lastCheckin)}</div>
              </div>
              <div className="stat">
                <div className="label">已设置联系人</div>
                <div className="value">{status.emails.length} 位</div>
              </div>
            </div>
            <ul className="contact-list">
              {status.emails.map((e) => (
                <li key={e}>
                  <span className="dot" />
                  {e}
                </li>
              ))}
            </ul>
            <div className="row-between">
              <button className="small-link" onClick={openEdit}>
                修改昵称 / 联系人
              </button>
              <button className="small-link" onClick={handleTestEmail} disabled={busy}>
                发送测试邮件
              </button>
            </div>
            <div className="id-box">当前账号：{status.email}</div>
          </div>

          {status.isAdmin && (
            <div className="card">
              <h2>管理后台</h2>
              <div className="row-between">
                <button className="small-link" onClick={loadAdminUsers} disabled={adminBusy}>
                  {adminUsers ? '刷新用户列表' : '查看所有用户'}
                </button>
                <button className="small-link" onClick={runAlertCheck} disabled={adminBusy}>
                  手动执行预警检查
                </button>
              </div>
              {adminUsers &&
                (adminUsers.length === 0 ? (
                  <p className="hint">暂无用户</p>
                ) : (
                  <ul className="contact-list">
                    {adminUsers.map((u) => (
                      <li key={u.id} style={{ display: 'block' }}>
                        <div>
                          <strong>{u.email || '(无邮箱)'}</strong>
                          {u.name ? ` · ${u.name}` : ''}
                          {u.alerted ? ' · ⚠️已预警' : ''}
                        </div>
                        <div className="hint">
                          联系人 {u.emails.length} 位 · 上次签到 {fmt(u.lastCheckin)}
                        </div>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          )}

          <button className="btn secondary" onClick={handleLogout}>
            退出登录
          </button>
        </>
      )}

      {phase === 'dashboard' && status && editOpen && (
        <div className="card">
          <h2>修改昵称 / 联系人</h2>
          <form onSubmit={handleUpdate}>
            <div className="field">
              <label>你的昵称（可选）</label>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
            </div>
            {emailFields(true)}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存修改'}
            </button>
            <div style={{ marginTop: 12 }}>
              <button className="small-link" type="button" onClick={() => setEditOpen(false)}>
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="footer">
        平安签到 · 每天签到一次守护你
        <br />
        预警逻辑：连续 48 小时未签到即通知联系人
      </div>
    </div>
  );
}
