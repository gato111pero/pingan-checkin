const STORAGE_KEY = 'pa_id';
const ALERT_HOURS = 48;

const appEl = document.getElementById('app');
const bannersEl = document.getElementById('banners');

const state = {
  id: null,
  status: null,
  editing: false,
  busy: false,
  name: '',
  emails: ['', '', ''],
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

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (data.error) throw new Error(data.error);
  return data;
}

async function loadStatus(id) {
  const data = await api(`/api/status?id=${encodeURIComponent(id)}`);
  state.status = data;
  render();
}

async function handleSetup(e) {
  e.preventDefault();
  if (state.busy) return;
  state.busy = true;
  setBanner(null, '');
  render();
  try {
    const data = await api('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: state.name, emails: state.emails }),
    });
    localStorage.setItem(STORAGE_KEY, data.id);
    state.id = data.id;
    await loadStatus(data.id);
    setBanner('msg', '✅ 设置成功！每天点一次「签到」即可。');
  } catch (err) {
    setBanner('error', err.message);
    render();
  } finally {
    state.busy = false;
    render();
  }
}

async function handleCheckin() {
  if (!state.id) return;
  const prevStatus = state.status;
  // 立即乐观反馈，无需等待接口返回
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
    const data = await api('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: state.id }),
    });
    // 用服务器返回的时间戳校正
    if (data.lastCheckin && state.status) {
      state.status = { ...state.status, lastCheckin: data.lastCheckin };
      render();
    }
  } catch (err) {
    state.status = prevStatus; // 失败则回滚
    setBanner('error', '签到失败：' + err.message);
    render();
  }
}

async function handleUpdate(e) {
  e.preventDefault();
  if (state.busy || !state.id) return;
  state.busy = true;
  setBanner(null, '');
  render();
  try {
    const data = await api('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: state.id, name: state.name, emails: state.emails }),
    });
    setBanner('msg', '✅ 联系人已更新');
    state.editing = false;
    await loadStatus(state.id);
  } catch (err) {
    setBanner('error', err.message);
    render();
  } finally {
    state.busy = false;
    render();
  }
}

async function handleTestEmail() {
  if (state.busy || !state.id) return;
  state.busy = true;
  setBanner(null, '');
  render();
  try {
    const data = await api('/api/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: state.id }),
    });
    setBanner('msg', `✅ 测试邮件已发送到 ${data.to}`);
  } catch (err) {
    setBanner('error', err.message);
  } finally {
    state.busy = false;
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

async function copyId() {
  try {
    await navigator.clipboard.writeText(state.id || '');
    setBanner('msg', '账号 ID 已复制');
  } catch (_) {
    setBanner('msg', state.id || '');
  }
}

function startOver() {
  localStorage.removeItem(STORAGE_KEY);
  state.id = null;
  state.status = null;
  state.editing = false;
  state.name = '';
  state.emails = ['', '', ''];
  setBanner(null, '');
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

function renderSetup() {
  appEl.innerHTML = `
    <div class="card">
      <h2>开始设置</h2>
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
        <p class="hint">无需注册、无需密码。数据保存在云端数据库，预警由服务器定时执行。</p>
      </form>
    </div>`;

  document.getElementById('setup-form').addEventListener('submit', handleSetup);
  document.getElementById('name-input').addEventListener('input', (e) => (state.name = e.target.value));
  for (let i = 0; i < 3; i++) {
    document.getElementById(`email-${i}`).addEventListener('input', (e) => {
      state.emails[i] = e.target.value;
    });
  }
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
      <button class="btn checkin-btn" id="checkin-btn" ${state.busy ? 'disabled' : ''}>
        ${state.busy ? '签到中…' : '✅ 我今日平安，签到'}
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
        <button class="small-link" id="test-btn" ${state.busy ? 'disabled' : ''}>发送测试邮件</button>
      </div>
      <div class="id-box">账号 ID：${escapeHtml(state.id || '')} <button class="small-link" id="copy-id-btn">复制</button></div>
    </div>

    <button class="btn secondary" id="reset-btn">重新设置</button>`;

  document.getElementById('checkin-btn').addEventListener('click', handleCheckin);
  document.getElementById('edit-btn').addEventListener('click', openEdit);
  document.getElementById('test-btn').addEventListener('click', handleTestEmail);
  document.getElementById('copy-id-btn').addEventListener('click', copyId);
  document.getElementById('reset-btn').addEventListener('click', startOver);
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
  document.getElementById('name-input').addEventListener('input', (e) => (state.name = e.target.value));
  for (let i = 0; i < 3; i++) {
    document.getElementById(`email-${i}`).addEventListener('input', (e) => {
      state.emails[i] = e.target.value;
    });
  }
  document.getElementById('cancel-btn').addEventListener('click', cancelEdit);
}

function render() {
  if (state.id && state.editing) {
    renderEdit();
  } else if (state.id && state.status) {
    renderDashboard();
  } else if (state.id) {
    appEl.innerHTML = '<p class="hint" style="text-align:center;margin-top:32px">加载中…</p>';
  } else {
    renderSetup();
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
  const id = localStorage.getItem(STORAGE_KEY);
  if (id) {
    state.id = id;
    render();
    loadStatus(id).catch((err) => {
      if (err.message.includes('未找到')) {
        localStorage.removeItem(STORAGE_KEY);
        state.id = null;
        render();
      } else {
        setBanner('error', err.message);
        render();
      }
    });
  } else {
    render();
  }
}

init();
setInterval(tick, 1000);
