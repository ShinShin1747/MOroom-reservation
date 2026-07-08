const state = {
  equipment: EQUIPMENTS[0],
  weekStart: startOfWeek(new Date()),
  reservations: [],
  jsonpSeq: 0,
};

const els = {
  status: document.getElementById('status'),
  dataMode: document.getElementById('dataMode'),
  tabs: document.getElementById('equipmentTabs'),
  equipment: document.getElementById('equipment'),
  weekTitle: document.getElementById('weekTitle'),
  calendarHead: document.querySelector('#calendarTable thead'),
  calendarBody: document.querySelector('#calendarTable tbody'),
  list: document.getElementById('reservationList'),
  form: document.getElementById('reservationForm'),
  message: document.getElementById('message'),
  mode: document.getElementById('mode'),
  id: document.getElementById('reservationId'),
  name: document.getElementById('name'),
  date: document.getElementById('date'),
  start: document.getElementById('start'),
  finish: document.getElementById('finish'),
  usageTime: document.getElementById('usageTime'),
  usage: document.getElementById('usage'),
  remark: document.getElementById('remark'),
  pass: document.getElementById('pass'),
};

init();

function init() {
  els.dataMode.textContent = API_URL ? 'Google Apps Script / Google Sheets' : 'このブラウザ内のみ';
  els.status.textContent = API_URL ? '共有モード' : 'ローカル確認モード';
  renderEquipmentControls();
  bindEvents();
  setDefaultFormValues();
  loadReservations();
}

function bindEvents() {
  document.getElementById('prevWeek').addEventListener('click', () => moveWeek(-7));
  document.getElementById('todayBtn').addEventListener('click', () => { state.weekStart = startOfWeek(new Date()); renderAll(); });
  document.getElementById('nextWeek').addEventListener('click', () => moveWeek(7));
  document.getElementById('reloadBtn').addEventListener('click', loadReservations);
  els.form.addEventListener('submit', handleSubmit);
  els.equipment.addEventListener('change', () => { state.equipment = els.equipment.value; renderAll(); });
  els.start.addEventListener('change', () => updateUsageTimeField(false));
  els.finish.addEventListener('change', () => updateUsageTimeField(false));
}

function renderEquipmentControls() {
  els.tabs.innerHTML = '';
  els.equipment.innerHTML = '';
  for (const eq of EQUIPMENTS) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = eq;
    tab.className = eq === state.equipment ? 'active' : '';
    tab.addEventListener('click', () => {
      state.equipment = eq;
      els.equipment.value = eq;
      renderEquipmentControls();
      renderAll();
    });
    els.tabs.appendChild(tab);

    const option = document.createElement('option');
    option.value = eq;
    option.textContent = eq;
    els.equipment.appendChild(option);
  }
  els.equipment.value = state.equipment;
}

function setDefaultFormValues() {
  const today = formatDate(new Date());
  els.date.value = today;
  els.start.value = '09:00';
  els.finish.value = '10:00';
  els.equipment.value = state.equipment;
  updateUsageTimeField(true);
}

async function loadReservations() {
  setStatus('読み込み中...', false);
  try {
    const result = API_URL
      ? await apiCall({ action: 'list' })
      : { ok: true, reservations: readLocalReservations() };
    if (!result.ok) throw new Error(result.error || '予約の読み込みに失敗しました。');
    state.reservations = normalizeReservations(result.reservations || []);
    renderAll();
    setStatus('読み込み完了', true);
  } catch (error) {
    setMessage(error.message, true);
    setStatus('読み込みエラー', false);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const payload = getFormPayload();
  const validationError = validatePayload(payload);
  if (validationError) {
    setMessage(validationError, true);
    return;
  }
  try {
    setStatus('保存中...', false);
    let result;
    if (API_URL) {
      result = await apiCall(payload);
    } else {
      result = localAction(payload);
    }
    if (!result.ok) throw new Error(result.error || '保存に失敗しました。');
    setMessage(result.message || '保存しました。', false);
    els.form.reset();
    setDefaultFormValues();
    await loadReservations();
  } catch (error) {
    setMessage(error.message, true);
    setStatus('保存エラー', false);
  }
}

function getFormPayload() {
  const autoDuration = durationText(els.start.value, els.finish.value);
  return {
    action: els.mode.value,
    id: els.id.value.trim(),
    equipment: els.equipment.value,
    name: els.name.value.trim(),
    date: els.date.value,
    start: els.start.value,
    finish: els.finish.value,
    usageTime: els.usageTime.value.trim() || autoDuration,
    usage: els.usage.value.trim(),
    remark: els.remark.value.trim(),
    pass: els.pass.value,
  };
}

function validatePayload(p) {
  if (!p.action) return '操作を選んでください。';
  if ((p.action === 'edit' || p.action === 'delete') && !p.id) return '予約変更・予約削除には予約IDが必要です。一覧から予約をクリックしてください。';
  if (!EQUIPMENTS.includes(p.equipment)) return '登録されていない装置名です。';
  if (!p.equipment || !p.name || !p.date || !p.start || !p.finish || !p.usage || !p.pass) return '必須項目を入力してください。パスワードも必要です。';
  if (p.start >= p.finish) return '終了時刻は開始時刻より後にしてください。';
  return '';
}

function renderAll() {
  renderEquipmentControls();
  renderCalendar();
  renderList();
}

function renderCalendar() {
  const dates = [...Array(7)].map((_, i) => addDays(state.weekStart, i));
  els.weekTitle.textContent = `${formatDate(dates[0])} ~ ${formatDate(dates[6])}`;
  els.calendarHead.innerHTML = '<tr>' + dates.map(d => `<th>${weekday(d)}<br>${formatDate(d)}</th>`).join('') + '</tr>';
  const cells = dates.map(d => {
    const date = formatDate(d);
    const items = filteredReservations().filter(r => r.date === date).sort(sortByTime);
    if (!items.length) return '<td><div class="day-empty">予約なし</div></td>';
    return '<td>' + items.map(eventHtml).join('') + '</td>';
  }).join('');
  els.calendarBody.innerHTML = `<tr>${cells}</tr>`;
  els.calendarBody.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => fillForm(btn.dataset.id)));
}

function renderList() {
  const items = filteredReservations().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  if (!items.length) {
    els.list.innerHTML = '<div class="hint">この装置の予約はありません。</div>';
    return;
  }
  els.list.innerHTML = items.map(r => `
    <article class="card" data-id="${escapeHtml(r.id)}">
      <div class="card-title"><span>${escapeHtml(r.date)} ${escapeHtml(r.start)}-${escapeHtml(r.finish)}</span><span>${escapeHtml(r.name)}</span></div>
      <div class="card-meta">${escapeHtml(r.equipment)} / 使用時間：${escapeHtml(displayUsageTime(r))}</div>
      <div class="card-meta">使用目的：${escapeHtml(r.usage)}</div>
      ${r.remark ? `<div>${escapeHtml(r.remark)}</div>` : ''}
      <div class="card-meta">予約ID: ${escapeHtml(r.id)}</div>
    </article>`).join('');
  els.list.querySelectorAll('[data-id]').forEach(card => card.addEventListener('click', () => fillForm(card.dataset.id)));
}

function eventHtml(r) {
  return `<button type="button" class="event" data-id="${escapeHtml(r.id)}">
    <strong>${escapeHtml(r.start)}-${escapeHtml(r.finish)}（${escapeHtml(displayUsageTime(r))}）</strong>
    <span>${escapeHtml(r.name)} / ${escapeHtml(r.usage)}</span><br>
    <small>予約ID: ${escapeHtml(r.id)}</small>
  </button>`;
}

function fillForm(id) {
  const r = state.reservations.find(x => x.id === id);
  if (!r) return;
  els.mode.value = 'edit';
  els.id.value = r.id;
  els.equipment.value = r.equipment;
  state.equipment = r.equipment;
  els.name.value = r.name;
  els.date.value = r.date;
  els.start.value = r.start;
  els.finish.value = r.finish;
  els.usageTime.value = r.usageTime || durationText(r.start, r.finish);
  els.usageTime.dataset.autoValue = durationText(r.start, r.finish);
  els.usage.value = r.usage;
  els.remark.value = r.remark || '';
  els.pass.value = '';
  setMessage('選択した予約をフォームに読み込みました。予約変更または予約削除ができます。', false);
  renderAll();
}

function filteredReservations() {
  const start = formatDate(state.weekStart);
  const end = formatDate(addDays(state.weekStart, 6));
  return state.reservations.filter(r => r.equipment === state.equipment && r.date >= start && r.date <= end);
}

function apiCall(params) {
  return new Promise((resolve, reject) => {
    const callbackName = `jsonpCallback_${Date.now()}_${state.jsonpSeq++}`;
    const url = new URL(API_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v ?? ''));
    url.searchParams.set('callback', callbackName);
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('API応答がタイムアウトしました。Google Apps ScriptのURLを確認してください。'));
    }, 15000);
    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('APIへの接続に失敗しました。'));
    };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function localAction(p) {
  const reservations = readLocalReservations();
  if (p.action === 'new') {
    const overlap = reservations.some(r => isOverlap(r, p));
    if (overlap) return { ok: false, error: '同じ装置・日付・時間帯で予約が重複しています。' };
    reservations.push({ ...p, id: makeId(), passHash: p.pass, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    writeLocalReservations(reservations);
    return { ok: true, message: '予約を作成しました。' };
  }
  const idx = reservations.findIndex(r => r.id === p.id);
  if (idx < 0) return { ok: false, error: '対象予約が見つかりません。' };
  if (reservations[idx].passHash !== p.pass) return { ok: false, error: 'パスワードが違います。' };
  if (p.action === 'delete') {
    reservations.splice(idx, 1);
    writeLocalReservations(reservations);
    return { ok: true, message: '予約を削除しました。' };
  }
  const overlap = reservations.some((r, i) => i !== idx && isOverlap(r, p));
  if (overlap) return { ok: false, error: '同じ装置・日付・時間帯で予約が重複しています。' };
  reservations[idx] = { ...reservations[idx], ...p, passHash: p.pass, updatedAt: new Date().toISOString() };
  writeLocalReservations(reservations);
  return { ok: true, message: '予約を更新しました。' };
}

function readLocalReservations() {
  return JSON.parse(localStorage.getItem('equipmentReservations') || '[]');
}
function writeLocalReservations(items) {
  localStorage.setItem('equipmentReservations', JSON.stringify(items));
}
function normalizeReservations(items) {
  return items.map(r => ({
    id: String(r.id || ''),
    equipment: String(r.equipment || ''),
    name: String(r.name || ''),
    date: String(r.date || ''),
    start: String(r.start || ''),
    finish: String(r.finish || ''),
    usageTime: String(r.usageTime || ''),
    usage: String(r.usage || ''),
    remark: String(r.remark || ''),
  })).map(r => ({ ...r, usageTime: r.usageTime || durationText(r.start, r.finish) }))
     .filter(r => r.id && r.equipment && r.date && r.start && r.finish);
}
function isOverlap(a, b) {
  return a.equipment === b.equipment && a.date === b.date && b.start < a.finish && b.finish > a.start;
}
function sortByTime(a, b) { return (a.start + a.finish).localeCompare(b.start + b.finish); }
function moveWeek(days) { state.weekStart = addDays(state.weekStart, days); renderAll(); }
function startOfWeek(date) { const d = new Date(date); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0,0,0,0); return d; }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function weekday(date) { return ['日','月','火','水','木','金','土'][date.getDay()]; }
function makeId() { return 'R' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function setMessage(text, isError) { els.message.textContent = 'メッセージ：' + text; els.message.className = 'message ' + (isError ? 'error' : 'ok'); }
function setStatus(text, ok) { els.status.textContent = text; els.status.style.borderColor = ok ? 'rgba(155,231,194,0.8)' : 'rgba(255,255,255,0.3)'; }
function displayUsageTime(r) { return r.usageTime || durationText(r.start, r.finish) || '-'; }
function durationText(start, finish) {
  const s = timeToMinutes(start);
  const f = timeToMinutes(finish);
  if (s === null || f === null || f <= s) return '';
  const diff = f - s;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h && m) return `${h}時間${m}分`;
  if (h) return `${h}時間`;
  return `${m}分`;
}
function timeToMinutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
function updateUsageTimeField(force) {
  const currentAuto = els.usageTime.dataset.autoValue || '';
  const nextAuto = durationText(els.start.value, els.finish.value);
  if (force || !els.usageTime.value || els.usageTime.value === currentAuto) {
    els.usageTime.value = nextAuto;
  }
  els.usageTime.dataset.autoValue = nextAuto;
}
