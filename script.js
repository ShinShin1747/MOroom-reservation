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
  usage: document.getElementById('usage'),
  remark: document.getElementById('remark'),
  pass: document.getElementById('pass'),
};

init();

function init() {
  els.dataMode.textContent = API_URL ? 'Google Apps Script / Google Sheets' : 'localStorage only';
  els.status.textContent = API_URL ? 'Shared mode' : 'Local test mode';
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
}

async function loadReservations() {
  setStatus('Loading...', false);
  try {
    const result = API_URL
      ? await apiCall({ action: 'list' })
      : { ok: true, reservations: readLocalReservations() };
    if (!result.ok) throw new Error(result.error || 'Failed to load reservations.');
    state.reservations = normalizeReservations(result.reservations || []);
    renderAll();
    setStatus('Loaded', true);
  } catch (error) {
    setMessage(error.message, true);
    setStatus('Load error', false);
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
    setStatus('Saving...', false);
    let result;
    if (API_URL) {
      result = await apiCall(payload);
    } else {
      result = localAction(payload);
    }
    if (!result.ok) throw new Error(result.error || 'Failed to save.');
    setMessage(result.message || 'Saved.', false);
    els.form.reset();
    setDefaultFormValues();
    await loadReservations();
  } catch (error) {
    setMessage(error.message, true);
    setStatus('Save error', false);
  }
}

function getFormPayload() {
  return {
    action: els.mode.value,
    id: els.id.value.trim(),
    equipment: els.equipment.value,
    name: els.name.value.trim(),
    date: els.date.value,
    start: els.start.value,
    finish: els.finish.value,
    usage: els.usage.value.trim(),
    remark: els.remark.value.trim(),
    pass: els.pass.value,
  };
}

function validatePayload(p) {
  if (!p.action) return 'Modeを選んでください。';
  if ((p.action === 'edit' || p.action === 'delete') && !p.id) return 'Edit/DeleteにはReservation IDが必要です。一覧から予約をクリックしてください。';
  if (!p.equipment || !p.name || !p.date || !p.start || !p.finish || !p.usage || !p.pass) return '必須項目を入力してください。';
  if (p.start >= p.finish) return 'FinishはStartより後にしてください。';
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
    if (!items.length) return '<td><div class="day-empty">No reservation</div></td>';
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
      <div class="card-meta">${escapeHtml(r.equipment)} / ${escapeHtml(r.usage)}</div>
      ${r.remark ? `<div>${escapeHtml(r.remark)}</div>` : ''}
      <div class="card-meta">ID: ${escapeHtml(r.id)}</div>
    </article>`).join('');
  els.list.querySelectorAll('[data-id]').forEach(card => card.addEventListener('click', () => fillForm(card.dataset.id)));
}

function eventHtml(r) {
  return `<button type="button" class="event" data-id="${escapeHtml(r.id)}">
    <strong>${escapeHtml(r.start)}-${escapeHtml(r.finish)}</strong>
    <span>${escapeHtml(r.name)} / ${escapeHtml(r.usage)}</span><br>
    <small>ID: ${escapeHtml(r.id)}</small>
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
  els.usage.value = r.usage;
  els.remark.value = r.remark || '';
  els.pass.value = '';
  setMessage('選択した予約をフォームに読み込みました。編集または削除できます。', false);
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
      reject(new Error('API response timeout. Google Apps Script URLを確認してください。'));
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
      reject(new Error('API request failed.'));
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
  if (reservations[idx].passHash !== p.pass) return { ok: false, error: 'Passが違います。' };
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
    usage: String(r.usage || ''),
    remark: String(r.remark || ''),
  })).filter(r => r.id && r.equipment && r.date && r.start && r.finish);
}
function isOverlap(a, b) {
  return a.equipment === b.equipment && a.date === b.date && b.start < a.finish && b.finish > a.start;
}
function sortByTime(a, b) { return (a.start + a.finish).localeCompare(b.start + b.finish); }
function moveWeek(days) { state.weekStart = addDays(state.weekStart, days); renderAll(); }
function startOfWeek(date) { const d = new Date(date); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0,0,0,0); return d; }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function weekday(date) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()]; }
function makeId() { return 'R' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function setMessage(text, isError) { els.message.textContent = 'Message: ' + text; els.message.className = 'message ' + (isError ? 'error' : 'ok'); }
function setStatus(text, ok) { els.status.textContent = text; els.status.style.borderColor = ok ? 'rgba(155,231,194,0.8)' : 'rgba(255,255,255,0.3)'; }
