const TOKEN_KEY = 'pa_token';
const ALERT_HOURS = 48;

const appEl = document.getElementById('app');
const bannersEl = document.getElementById('banners');

const state = {
  token: null,
  status: null,
  phase: 'loading', // 'auth' | 'setup' | 'dashboard' | 'loading'
  authMode: 'login', // 'login' | 'register'
  editing: false,
  busy: false,
  name: '',
  emails: ['', '', ''],
  email: '',
  password: '',
  adminUsers: null,
  adminBusy: false,
};

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('zh-CN', { hour12: false });
}

function fmtCountdown(hours) {
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

function setBanner(type, text) {
  bannersEl.innerHTML = text
    ? `<div class="${type === 'error' ? 'error' : 'msg'}">${escapeHtml(text)}</div>`
    : '';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (data.error) {
    const e = new Error(data.error);
    e.status = res.status;
    throw e;
  }
  return data;
}

async function loadStatus() {
  const data = await api('/api/status');
  state.status = data;
  state.name = data.name || '';
  state.emails = [data.emails[0] || '', data.emails[1] || '', data.emails[2] || ''];
  state.phase = data.emails && data.emails.length > 0 ? 'dashboard' : 'setup';
  render();
}

// ---------- 登录 / 注册 ----------
async function handleAuthSubmit(e) {
  e.preventDefault();
  if (state.busy) return;
  state.busy = true;
  setBanner(null, '');
  render();
  try {
    const path = state.authMode === 'login' ? '/api/login' : '/api/register';
    const data = await api(path, {
      method: 'POST',
      body: JSON.stringify({ email: state.email, password: state.password }),
    });
    state.token = data.token;
    localStorage.setItem(TOKEN_KEY, state.token);
    setBanner('msg', state.authMode === 'login' ? '✅ 登录成功' : '✅ 注册成功');
    await loadStatus();
  } catch (err) {
    setBanner('error', err.message);
    render();
  } finally {
    state.busy = false;
    render();
  }
}

async function handleLogout() {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch (_) {
    /* 忽略登出失败 */
  }
  localStorage.removeItem(TOKEN_KEY);
  state.token = null;
  state.status = null;
  state.email = '';
  state.password = '';
  state.phase = 'auth';
  setBanner(null, '');
  render();
}

// ---------- 设置联系人 ----------
async function handleSetup(e) {
  e.preventDefault();
  if (state.busy) return;
  state.busy = true;
  setBanner(null, '');
  render();
  try {
    await api('/api/update', {
      method: 'POST',
      body: JSON.stringify({ name: state.name, emails: state.emails }),
    });
    setBanner('msg', '✅ 设置成功！每天点一次「签到」即可。');
    await loadStatus();
  } catch (err) {
    setBanner('error', err.message);
    render();
  } finally {
    state.busy = false;
    render();
  }
}

// ---------- 签到 ----------
async function handleCheckin() {
  if (!state.token) return;
  const prevStatus = state.status;
  setBanner('msg', '✅ 签到成功！');
  if (state.status) {
    state.status = {
      ...state.status,
      lastCheckin: new Date().toISOString(),
      alerted: false,
      safeUntil: new Date(Date.now() + ALERT_HOURS * 3600000).toISOString(),
      hoursLeft: ALERT_HOURS,
    };
  }
  render();
  try {
    const data = await api('/api/checkin', { method: 'POST', body: '{}' });
    if (data.lastCheckin && state.status) {
      state.status = { ...state.status, lastCheckin: data.lastCheckin };
      render();
    }
  } catch (err) {
    state.status = prevStatus;
    if (err.status === 401) {
      return handleLogout();
    }
    setBanner('error', '签到失败：' + err.message);
    render();
  }
}

async function handleUpdate(e) {
  e.preventDefault();
  if (state.busy) return;
  state.busy = true;
  setBanner(null, '');
  render();
  try {
    await api('/api/update', {
      method: 'POST',
      body: JSON.stringify({ name: state.name, emails: state.emails }),
    });
    setBanner('msg', '✅ 联系人已更新');
    state.editing = false;
    await loadStatus();
  } catch (err) {
    setBanner('error', err.message);
    render();
  } finally {
    state.busy = false;
    render();
  }
}

async function handleTestEmail() {
  if (state.busy) return;
  state.busy = true;
  setBanner(null, '');
  render();
  try {
    const data = await api('/api/test-email', { method: 'POST', body: '{}' });
    setBanner('msg', `✅ 测试邮件已发送到 ${data.to}`);
  } catch (err) {
    setBanner('error', err.message);
  } finally {
    state.busy = false;
    render();
  }
}

async function loadAdminUsers() {
  state.adminBusy = true;
  setBanner(null, '');
  render();
  try {
    const data = await api('/api/admin/users');
    state.adminUsers = data.users;
  } catch (err) {
    setBanner('error', err.message);
  } finally {
    state.adminBusy = false;
    render();
  }
}

async function runAlertCheck() {
  state.adminBusy = true;
  setBanner(null, '');
  render();
  try {
    const data = await api('/api/admin/check', { method: 'POST' });
    const okCount = data.results.filter((r) => r.ok).length;
    setBanner('msg', `✅ 检查完成：共 ${data.checked} 人待处理，成功发送 ${okCount} 封预警邮件`);
    const usersData = await api('/api/admin/users');
    state.adminUsers = usersData.users;
  } catch (err) {
    setBanner('error', err.message);
  } finally {
    state.adminBusy = false;
    render();
  }
}

function openEdit() {
  if (!state.status) return;
  state.name = state.status.name || '';
  state.emails = [state.status.emails[0] || '', state.status.emails[1] || '', state.status.emails[2] || ''];
  state.editing = true;
  setBanner(null, '');
  render();
}

function cancelEdit() {
  state.editing = false;
  render();
}

function emailField(i, required) {
  return `
    <div class="field">
      <label>紧急联系人邮箱 ${i + 1}${required ? '（必填）' : '（可选）'}</label>
      <input type="email" id="email-${i}" value="${escapeHtml(state.emails[i] || '')}"
        placeholder="${i === 0 ? '例如：friend@example.com' : '可不填'}" ${required ? 'required' : ''} />
    </div>`;
}

function bindNameAndEmails() {
  document.getElementById('name-input').addEventListener('input', (e) => (state.name = e.target.value));
  for (let i = 0; i < 3; i++) {
    document.getElementById(`email-${i}`).addEventListener('input', (e) => {
      state.emails[i] = e.target.value;
    });
  }
}

function renderAuth() {
  const isLogin = state.authMode === 'login';
  appEl.innerHTML = `
    <div class="card">
      <h2>${isLogin ? '登录' : '注册账号'}</h2>
      <form id="auth-form">
        <div class="field">
          <label>邮箱</label>
          <input type="email" id="email-input" value="${escapeHtml(state.email)}" placeholder="you@example.com" required />
        </div>
        <div class="field">
          <label>密码${isLogin ? '' : '（至少 6 位）'}</label>
          <input type="password" id="password-input" placeholder="密码" minlength="6" required />
        </div>
        <button class="btn" type="submit" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? '请稍候…' : isLogin ? '登录' : '注册'}
        </button>
        <p class="hint" style="text-align:center;margin-top:12px">
          <button type="button" class="small-link" id="toggle-auth">
            ${isLogin ? '没有账号？去注册' : '已有账号？去登录'}
          </button>
        </p>
      </form>
    </div>`;

  document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
  document.getElementById('email-input').addEventListener('input', (e) => (state.email = e.target.value));
  document.getElementById('password-input').addEventListener('input', (e) => (state.password = e.target.value));
  document.getElementById('toggle-auth').addEventListener('click', () => {
    state.authMode = isLogin ? 'register' : 'login';
    setBanner(null, '');
    render();
  });
}

function renderSetup() {
  appEl.innerHTML = `
    <div class="card">
      <h2>设置紧急联系人</h2>
      <form id="setup-form">
        <div class="field">
          <label>你的昵称（可选）</label>
          <input id="name-input" value="${escapeHtml(state.name)}" placeholder="例如：小明" maxlength="50" />
        </div>
        ${emailField(0, true)}
        ${emailField(1, false)}
        ${emailField(2, false)}
        <button class="btn" type="submit" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? '保存中…' : '保存并开始'}
        </button>
        <p class="hint">预警将由服务器定时执行，即使你电脑关机也会照常触发。</p>
      </form>
      <div style="margin-top:12px"><button class="small-link" type="button" id="logout-btn">退出登录</button></div>
    </div>`;

  document.getElementById('setup-form').addEventListener('submit', handleSetup);
  bindNameAndEmails();
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
}

function renderDashboard() {
  const s = state.status;
  const countdownClass = s.alerted ? 'danger' : s.hoursLeft <= 12 ? 'warn' : 'safe';
  const countdownText = s.alerted ? '已触发预警' : fmtCountdown(s.hoursLeft);

  appEl.innerHTML = `
    <div class="card">
      ${s.alerted ? '<div class="alert-banner">⚠️ 已连续两天未签到，系统已向联系人发送预警邮件。签到后将解除预警。</div>' : ''}
      <div class="countdown ${countdownClass}" id="countdown">
        <span class="big" id="countdown-big">${countdownText}</span>
        <span id="countdown-label">${s.alerted ? '' : '距离触发预警剩余时间'}</span>
      </div>
      <button class="btn checkin-btn" id="checkin-btn">
        ✅ 我今日平安，签到
      </button>
    </div>

    <div class="card">
      <h2>签到状态</h2>
      <div class="status-grid">
        <div class="stat"><div class="label">上次签到时间</div><div class="value">${fmt(s.lastCheckin)}</div></div>
        <div class="stat"><div class="label">已设置联系人</div><div class="value">${s.emails.length} 位</div></div>
      </div>
      <ul class="contact-list">
        ${s.emails.map((e) => `<li><span class="dot"></span>${escapeHtml(e)}</li>`).join('')}
      </ul>
      <div class="row-between">
        <button class="small-link" id="edit-btn">修改昵称 / 联系人</button>
        <button class="small-link" id="test-btn">发送测试邮件</button>
      </div>
      <div class="id-box">当前账号：${escapeHtml(s.email || '')}</div>
    </div>

    ${s.isAdmin ? `
    <div class="card">
      <h2>管理后台</h2>
      <div class="row-between">
        <button class="small-link" id="admin-users-btn" ${state.adminBusy ? 'disabled' : ''}>${state.adminUsers ? '刷新用户列表' : '查看所有用户'}</button>
        <button class="small-link" id="admin-check-btn" ${state.adminBusy ? 'disabled' : ''}>手动执行预警检查</button>
      </div>
      ${state.adminUsers ? (state.adminUsers.length === 0 ? '<p class="hint">暂无用户</p>' : `<ul class="contact-list">${state.adminUsers.map((u) => `<li style="display:block"><div><strong>${escapeHtml(u.email || '(无邮箱)')}</strong>${u.name ? ' · ' + escapeHtml(u.name) : ''}${u.alerted ? ' · ⚠️已预警' : ''}</div><div class="hint">联系人 ${u.emails.length} 位 · 上次签到 ${fmt(u.lastCheckin)}</div></li>`).join('')}</ul>`) : ''}
    </div>` : ''}

    <button class="btn secondary" id="logout-btn">退出登录</button>`;

  document.getElementById('checkin-btn').addEventListener('click', handleCheckin);
  document.getElementById('edit-btn').addEventListener('click', openEdit);
  document.getElementById('test-btn').addEventListener('click', handleTestEmail);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  if (s.isAdmin) {
    document.getElementById('admin-users-btn').addEventListener('click', loadAdminUsers);
    document.getElementById('admin-check-btn').addEventListener('click', runAlertCheck);
  }
}

function renderEdit() {
  appEl.innerHTML = `
    <div class="card">
      <h2>修改昵称 / 联系人</h2>
      <form id="update-form">
        <div class="field">
          <label>你的昵称（可选）</label>
          <input id="name-input" value="${escapeHtml(state.name)}" maxlength="50" />
        </div>
        ${emailField(0, true)}
        ${emailField(1, false)}
        ${emailField(2, false)}
        <button class="btn" type="submit" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? '保存中…' : '保存修改'}
        </button>
        <div style="margin-top:12px"><button class="small-link" type="button" id="cancel-btn">取消</button></div>
      </form>
    </div>`;

  document.getElementById('update-form').addEventListener('submit', handleUpdate);
  bindNameAndEmails();
  document.getElementById('cancel-btn').addEventListener('click', cancelEdit);
}

function render() {
  if (state.phase === 'loading') {
    appEl.innerHTML = '<p class="hint" style="text-align:center;margin-top:32px">加载中…</p>';
  } else if (state.phase === 'auth') {
    renderAuth();
  } else if (state.phase === 'setup') {
    renderSetup();
  } else if (state.phase === 'dashboard') {
    if (state.editing) renderEdit();
    else renderDashboard();
  }
}

function tick() {
  const bigEl = document.getElementById('countdown-big');
  const cd = document.getElementById('countdown');
  if (!bigEl || !cd || !state.status) return;
  if (state.status.alerted) {
    bigEl.textContent = '已触发预警';
    cd.className = 'countdown danger';
    return;
  }
  const safeUntil = state.status.safeUntil ? new Date(state.status.safeUntil).getTime() : null;
  if (!safeUntil) return;
  const hoursLeft = Math.max(0, (safeUntil - Date.now()) / 3600000);
  bigEl.textContent = fmtCountdown(hoursLeft);
  cd.className = 'countdown ' + (hoursLeft <= 0 ? 'danger' : hoursLeft <= 12 ? 'warn' : 'safe');
}

function init() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    state.token = token;
    state.phase = 'loading';
    render();
    loadStatus().catch((err) => {
      if (err.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        state.token = null;
      } else {
        setBanner('error', err.message);
      }
      state.phase = 'auth';
      render();
    });
  } else {
    state.phase = 'auth';
    render();
  }
}

init();
setInterval(tick, 1000);
