'use client';

import { useCallback, useEffect, useState } from 'react';

interface Status {
  id: string;
  name: string;
  emails: string[];
  lastCheckin: string | null;
  createdAt: string;
  alerted: boolean;
  safeUntil: string;
  hoursLeft: number;
}

type Phase = 'loading' | 'setup' | 'save-link' | 'dashboard';

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
  const [id, setId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // 表单状态
  const [name, setName] = useState('');
  const [emails, setEmails] = useState<string[]>(['', '', '']);
  const [editOpen, setEditOpen] = useState(false);

  const checkinUrl =
    typeof window !== 'undefined' && id ? `${window.location.origin}/?id=${id}` : '';

  const fetchStatus = useCallback(async (uid: string) => {
    try {
      const res = await fetch(`/api/status?id=${encodeURIComponent(uid)}`);
      if (res.status === 404) {
        localStorage.removeItem('pa_id');
        setId(null);
        setPhase('setup');
        return;
      }
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setPhase('setup');
        return;
      }
      setStatus(data);
      setPhase('dashboard');
    } catch {
      setError('网络错误，请稍后重试');
      setPhase('setup');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('id');
    const stored = localStorage.getItem('pa_id');
    const uid = fromUrl || stored;
    if (fromUrl) localStorage.setItem('pa_id', fromUrl);
    if (uid) {
      setId(uid);
      fetchStatus(uid);
    } else {
      setPhase('setup');
    }
  }, [fetchStatus]);

  // 每秒刷新一次，驱动倒计时实时走动
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

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, emails }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      localStorage.setItem('pa_id', data.id);
      setId(data.id);
      setStatus({
        id: data.id,
        name: data.name,
        emails: data.emails,
        lastCheckin: null,
        createdAt: new Date().toISOString(),
        alerted: false,
        safeUntil: new Date(Date.now() + 48 * 3600_000).toISOString(),
        hoursLeft: 48,
      });
      setPhase('save-link');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckin() {
    if (!id) return;
    setError('');
    setMsg('✅ 签到成功！');
    const prevStatus = status;
    // 立即乐观更新，反馈无需等待接口返回
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
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      // 用服务器返回的时间戳校正
      if (data.lastCheckin) {
        setStatus((prev) => (prev ? { ...prev, lastCheckin: data.lastCheckin } : prev));
      }
    } catch (e) {
      setStatus(prevStatus);
      setMsg('');
      setError((e as Error).message || '网络错误，请稍后重试');
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await fetch('/api/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, emails }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setMsg('✅ 联系人已更新');
      setEditOpen(false);
      await fetchStatus(id);
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handleTestEmail() {
    if (!id) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const res = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setMsg(`✅ 测试邮件已发送到 ${data.to}`);
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(checkinUrl);
      setMsg('✅ 签到链接已复制，请妥善保存');
    } catch {
      setMsg(checkinUrl);
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

  function startOver() {
    localStorage.removeItem('pa_id');
    setId(null);
    setStatus(null);
    setName('');
    setEmails(['', '', '']);
    setEditOpen(false);
    setError('');
    setMsg('');
    setPhase('setup');
  }

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

  const liveHours = status?.safeUntil
    ? Math.max(0, (new Date(status.safeUntil).getTime() - now) / 3600000)
    : status?.hoursLeft ?? 0;

  return (
    <div className="container">
      <div className="header">
        <div className="logo">🕊️</div>
        <h1>平安签到</h1>
        <p>设置紧急联系人，每天签到一次。<br />连续两天未签到，自动通知联系人。</p>
      </div>

      {error && <div className="error">{error}</div>}
      {msg && <div className="msg">{msg}</div>}

      {phase === 'setup' && (
        <div className="card">
          <h2>开始设置</h2>
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

            {emails.map((email, i) => (
              <div className="field" key={i}>
                <label>
                  紧急联系人邮箱 {i + 1}
                  {i === 0 ? '（必填）' : '（可选）'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmailAt(i, e.target.value)}
                  placeholder={i === 0 ? '例如：friend@example.com' : '可不填'}
                  required={i === 0}
                />
              </div>
            ))}

            <button className="btn" type="submit" disabled={busy}>
              {busy ? '保存中…' : '保存并生成签到链接'}
            </button>
            <p className="hint">
              无需注册、无需密码。系统会为你生成一个专属签到链接，请务必保存好。
            </p>
          </form>
        </div>
      )}

      {phase === 'save-link' && (
        <div className="card">
          <h2>🎉 已创建成功</h2>
          <p className="hint" style={{ marginBottom: 16 }}>
            下面是你专属的签到链接。请<b>立即复制并收藏</b>，以后每天打开它签到即可。
            链接丢失将无法找回！
          </p>
          <div className="url-highlight">{checkinUrl}</div>
          <button className="btn" onClick={copyLink}>
            📋 复制签到链接
          </button>
          <div className="divider">已保存好链接？</div>
          <button className="btn secondary" onClick={() => fetchStatus(id!)}>
            进入签到
          </button>
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

            <button className="btn checkin-btn" onClick={handleCheckin} disabled={busy}>
              {busy ? '签到中…' : '✅ 我今日平安，签到'}
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
              {status.emails.map((email) => (
                <li key={email}>
                  <span className="dot" />
                  {email}
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
          </div>

          <div className="card">
            <h2>我的签到链接</h2>
            <div className="link-box">
              <input readOnly value={checkinUrl} />
              <button onClick={copyLink}>复制</button>
            </div>
            <p className="hint">
              请收藏这个链接，每天打开点击签到。也可在本设备直接访问首页，系统会自动记住你。
            </p>
          </div>

          <button className="btn secondary" onClick={startOver}>
            重新设置
          </button>
        </>
      )}

      {phase === 'dashboard' && status && editOpen && (
        <div className="card">
          <h2>修改昵称 / 联系人</h2>
          <form onSubmit={handleUpdate}>
            <div className="field">
              <label>你的昵称（可选）</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
              />
            </div>
            {emails.map((email, i) => (
              <div className="field" key={i}>
                <label>
                  紧急联系人邮箱 {i + 1}
                  {i === 0 ? '（必填）' : '（可选）'}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmailAt(i, e.target.value)}
                  required={i === 0}
                />
              </div>
            ))}
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
        平安签到 · 无需注册 · 每天签到一次守护你
        <br />
        预警逻辑：连续 48 小时未签到即通知联系人
      </div>
    </div>
  );
}
