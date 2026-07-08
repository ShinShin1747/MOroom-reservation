const MAINTENANCE_TAB_NAME = 'メンテ情報';
const LEGACY_MAINTENANCE_TAB_NAME = '全体のメンテ';
const MAINTENANCE_EPI_TYPE = 'エピ';
const DEFAULT_EQUIPMENTS = ['MOVPE 豊田中研', 'MOVPE #4', 'MOVPE #5', 'MOVPE #7', 'MOVPE #11', 'MOVPE #12'];
const DEFAULT_MAINTENANCE_DETAIL_TYPES = ['原料交換', '重故障', '除害停止', '定常メンテ'];
const CONFIG_EQUIPMENTS = (typeof EQUIPMENTS !== 'undefined' && Array.isArray(EQUIPMENTS)) ? EQUIPMENTS : DEFAULT_EQUIPMENTS;
const ACTUAL_EQUIPMENT_LIST = Array.from(new Set(CONFIG_EQUIPMENTS.filter(isActualEquipment)));
const VIEW_TAB_LIST = Array.from(new Set([...ACTUAL_EQUIPMENT_LIST, MAINTENANCE_TAB_NAME]));
const MAINTENANCE_DETAIL_TYPE_LIST = (typeof MAINTENANCE_DETAIL_TYPES !== 'undefined' && Array.isArray(MAINTENANCE_DETAIL_TYPES) && MAINTENANCE_DETAIL_TYPES.length)
  ? MAINTENANCE_DETAIL_TYPES.map(canonicalMaintenanceType).filter(Boolean)
  : DEFAULT_MAINTENANCE_DETAIL_TYPES;
const MAINTENANCE_VALUE_LIST = Array.from(new Set([MAINTENANCE_EPI_TYPE, ...MAINTENANCE_DETAIL_TYPE_LIST]));

const state = {
  equipment: ACTUAL_EQUIPMENT_LIST[0] || MAINTENANCE_TAB_NAME,
  formEquipment: ACTUAL_EQUIPMENT_LIST[0] || '',
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
  monthPicker: document.getElementById('monthPicker'),
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
  remark: document.getElementById('remark'),
  pass: document.getElementById('pass'),
  maintenanceKind: Array.from(document.querySelectorAll('input[name="maintenanceKind"]')),
  maintenanceDetails: Array.from(document.querySelectorAll('input[name="maintenanceDetails"]')),
  maintenanceDetailPanel: document.getElementById('maintenanceDetailPanel'),
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
  if (els.monthPicker) {
    els.monthPicker.addEventListener('change', () => jumpToMonth(els.monthPicker.value));
  }
  document.getElementById('reloadBtn').addEventListener('click', loadReservations);
  els.form.addEventListener('submit', handleSubmit);
  els.equipment.addEventListener('change', () => {
    state.formEquipment = els.equipment.value;
    state.equipment = els.equipment.value;
    renderAll();
  });
  els.maintenanceKind.forEach(input => input.addEventListener('change', updateMaintenanceDetailVisibility));
}

function renderEquipmentControls() {
  els.tabs.innerHTML = '';
  els.equipment.innerHTML = '';

  for (const eq of VIEW_TAB_LIST) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = eq;
    tab.className = eq === state.equipment ? 'active' : '';
    if (eq === MAINTENANCE_TAB_NAME) tab.classList.add('maintenance-tab');
    tab.addEventListener('click', () => {
      state.equipment = eq;
      if (isActualEquipment(eq)) state.formEquipment = eq;
      renderEquipmentControls();
      renderAll();
    });
    els.tabs.appendChild(tab);
  }

  for (const eq of ACTUAL_EQUIPMENT_LIST) {
    const option = document.createElement('option');
    option.value = eq;
    option.textContent = eq;
    els.equipment.appendChild(option);
  }

  if (!ACTUAL_EQUIPMENT_LIST.includes(state.formEquipment)) state.formEquipment = ACTUAL_EQUIPMENT_LIST[0] || '';
  els.equipment.value = state.formEquipment;
}

function setDefaultFormValues() {
  const today = formatDate(new Date());
  els.mode.value = 'new';
  els.date.value = today;
  els.start.value = '09:00';
  els.finish.value = '10:00';
  if (!ACTUAL_EQUIPMENT_LIST.includes(state.formEquipment)) state.formEquipment = ACTUAL_EQUIPMENT_LIST[0] || '';
  els.equipment.value = state.formEquipment;
  setMaintenanceTypes('');
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
  return {
    action: els.mode.value,
    id: els.id.value.trim(),
    equipment: els.equipment.value,
    name: els.name.value.trim(),
    date: els.date.value,
    start: els.start.value,
    finish: els.finish.value,
    maintenanceKind: getMaintenanceKind(),
    maintenanceTypes: getSelectedMaintenanceTypes(),
    usage: '',
    remark: els.remark.value.trim(),
    pass: els.pass.value,
  };
}

function validatePayload(p) {
  if (!p.action) return '操作を選んでください。';
  if ((p.action === 'edit' || p.action === 'delete') && !p.id) return '予約変更・予約削除には予約IDが必要です。一覧から予約をクリックしてください。';
  if (!ACTUAL_EQUIPMENT_LIST.includes(p.equipment)) return '登録されていない装置名です。メンテ情報タブは表示専用です。装置欄では実際の装置を選んでください。';
  if (!p.equipment || !p.name || !p.date || !p.start || !p.finish || !p.pass) return '必須項目を入力してください。パスワードも必要です。';
  if (p.start >= p.finish) return '終了時刻は開始時刻より後にしてください。';
  if (p.action !== 'delete') {
    if (p.maintenanceKind !== 'maintenance' && p.maintenanceKind !== 'epi') return '使用目的は、メンテまたはエピのどちらかを必ず選択してください。';
    if (p.maintenanceKind === 'maintenance' && !p.maintenanceTypes) return 'メンテを選択した場合は、原料交換・重故障・除害停止・定常メンテから1つ以上選択してください。';
  }
  return '';
}

function renderAll() {
  renderEquipmentControls();
  renderCalendar();
  renderList();
}

function renderCalendar() {
  const dates = [...Array(7)].map((_, i) => addDays(state.weekStart, i));
  syncMonthPicker();
  const maintenanceView = isMaintenanceView();
  els.weekTitle.textContent = maintenanceView
    ? `メンテ情報：${formatDate(dates[0])} ~ ${formatDate(dates[6])}`
    : `${formatDate(dates[0])} ~ ${formatDate(dates[6])}`;
  els.calendarHead.innerHTML = '<tr>' + dates.map(d => `<th>${weekday(d)}<br>${formatDate(d)}</th>`).join('') + '</tr>';
  const cells = dates.map(d => {
    const date = formatDate(d);
    const items = filteredReservations().filter(r => r.date === date).sort(sortByEquipmentThenTime);
    if (!items.length) return `<td><div class="day-empty">${maintenanceView ? 'メンテ情報なし' : '予約なし'}</div></td>`;
    return '<td>' + items.map(eventHtml).join('') + '</td>';
  }).join('');
  els.calendarBody.innerHTML = `<tr>${cells}</tr>`;
  els.calendarBody.querySelectorAll('[data-id]').forEach(btn => btn.addEventListener('click', () => fillForm(btn.dataset.id)));
}

function renderList() {
  const maintenanceView = isMaintenanceView();
  const items = filteredReservations().sort(sortByDateEquipmentTime);
  if (!items.length) {
    els.list.innerHTML = `<div class="hint">${maintenanceView ? 'メンテ情報が登録された予約はありません。' : 'この装置の予約はありません。'}</div>`;
    return;
  }
  els.list.innerHTML = items.map(r => `
    <article class="card${reservationStatusClass(r, 'card')}" data-id="${escapeHtml(r.id)}">
      <div class="card-title">${escapeHtml(r.date)} ${escapeHtml(r.start)}-${escapeHtml(r.finish)}</div>
      <div class="card-line"><span class="label">装置</span><span>${escapeHtml(r.equipment)}</span></div>
      <div class="card-line"><span class="label">名前</span><span>${escapeHtml(r.name)}</span></div>
      ${r.maintenanceTypes ? `<div class="card-line"><span class="label">使用目的</span><span class="maintenance-tags">${maintenanceTagsHtml(r.maintenanceTypes)}</span></div>` : ''}
      ${r.remark ? `<div class="card-line"><span class="label">備考</span><span>${escapeHtml(r.remark)}</span></div>` : ''}
      <div class="card-meta">予約ID: ${escapeHtml(r.id)}</div>
    </article>`).join('');
  els.list.querySelectorAll('[data-id]').forEach(card => card.addEventListener('click', () => fillForm(card.dataset.id)));
}

function eventHtml(r) {
  const maintenanceView = isMaintenanceView();
  return `<button type="button" class="event${reservationStatusClass(r, 'event')}" data-id="${escapeHtml(r.id)}">
    <strong class="event-time">${escapeHtml(r.start)}-${escapeHtml(r.finish)}</strong>
    ${maintenanceView ? `<span class="event-value event-equipment">${eventText(r.equipment)}</span>` : ''}
    <span class="event-value">${eventText(r.name)}</span>
    ${r.maintenanceTypes ? `<span class="event-badges">${maintenanceTagsHtml(r.maintenanceTypes)}</span>` : ''}
    ${r.remark ? `<span class="event-value event-remark">${eventText(r.remark)}</span>` : ''}
    <small class="event-id">予約ID: ${escapeHtml(r.id)}</small>
  </button>`;
}

function fillForm(id) {
  const r = state.reservations.find(x => x.id === id);
  if (!r) return;
  els.mode.value = 'edit';
  els.id.value = r.id;
  els.equipment.value = r.equipment;
  state.formEquipment = r.equipment;
  state.equipment = r.equipment;
  els.name.value = r.name;
  els.date.value = r.date;
  els.start.value = r.start;
  els.finish.value = r.finish;
  els.remark.value = r.remark || '';
  setMaintenanceTypes(r.maintenanceTypes || '');
  els.pass.value = '';
  setMessage('選択した予約をフォームに読み込みました。予約変更または予約削除ができます。', false);
  renderAll();
}

function filteredReservations() {
  const start = formatDate(state.weekStart);
  const end = formatDate(addDays(state.weekStart, 6));
  return state.reservations.filter(r => {
    if (r.date < start || r.date > end) return false;
    if (isMaintenanceView()) return isMaintenanceOnlyReservation(r);
    return r.equipment === state.equipment;
  });
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
    maintenanceTypes: normalizeMaintenanceTypes(r.maintenanceTypes || ''),
    usage: String(r.usage || ''),
    remark: String(r.remark || ''),
  })).filter(r => r.id && r.equipment && r.date && r.start && r.finish);
}
function isOverlap(a, b) {
  return a.equipment === b.equipment && a.date === b.date && b.start < a.finish && b.finish > a.start;
}
function sortByTime(a, b) { return (a.start + a.finish).localeCompare(b.start + b.finish); }
function sortByEquipmentThenTime(a, b) { return (a.equipment + a.start + a.finish).localeCompare(b.equipment + b.start + b.finish); }
function sortByDateEquipmentTime(a, b) { return (a.date + a.equipment + a.start + a.finish).localeCompare(b.date + b.equipment + b.start + b.finish); }
function jumpToMonth(value) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return;
  const firstDay = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(firstDay.getTime())) return;
  state.weekStart = startOfWeek(firstDay);
  renderAll();
}
function syncMonthPicker() {
  if (!els.monthPicker) return;
  els.monthPicker.value = formatMonth(addDays(state.weekStart, 3));
}
function moveWeek(days) { state.weekStart = addDays(state.weekStart, days); renderAll(); }
function startOfWeek(date) { const d = new Date(date); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0,0,0,0); return d; }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function formatMonth(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
function weekday(date) { return ['日','月','火','水','木','金','土'][date.getDay()]; }
function makeId() { return 'R' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase(); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function eventText(value) { return escapeHtml(value).replace(/([、。，．,;；/／・])/g, '$1<br>'); }
function setMessage(text, isError) { els.message.textContent = 'メッセージ：' + text; els.message.className = 'message ' + (isError ? 'error' : 'ok'); }
function setStatus(text, ok) { els.status.textContent = text; els.status.style.borderColor = ok ? 'rgba(155,231,194,0.8)' : 'rgba(255,255,255,0.3)'; }

function getMaintenanceKind() {
  const selected = els.maintenanceKind.find(input => input.checked);
  return selected ? selected.value : '';
}

function getSelectedMaintenanceTypes() {
  const kind = getMaintenanceKind();
  if (kind === 'epi') return MAINTENANCE_EPI_TYPE;
  if (kind !== 'maintenance') return '';
  return els.maintenanceDetails
    .filter(input => input.checked)
    .map(input => canonicalMaintenanceType(input.value))
    .filter(v => MAINTENANCE_DETAIL_TYPE_LIST.includes(v))
    .join('、');
}

function setMaintenanceTypes(value) {
  const normalized = normalizeMaintenanceTypes(value);
  const values = normalized.split('、').filter(Boolean);
  const hasEpi = values.includes(MAINTENANCE_EPI_TYPE);
  const details = values.filter(v => v !== MAINTENANCE_EPI_TYPE);

  setMaintenanceKind(hasEpi ? 'epi' : (details.length ? 'maintenance' : ''));
  els.maintenanceDetails.forEach(input => {
    input.checked = details.includes(canonicalMaintenanceType(input.value));
  });
  updateMaintenanceDetailVisibility();
}

function setMaintenanceKind(kind) {
  els.maintenanceKind.forEach(input => {
    input.checked = input.value === kind;
  });
}

function updateMaintenanceDetailVisibility() {
  const showDetails = getMaintenanceKind() === 'maintenance';
  if (els.maintenanceDetailPanel) els.maintenanceDetailPanel.classList.toggle('is-hidden', !showDetails);
  if (!showDetails) {
    els.maintenanceDetails.forEach(input => input.checked = false);
  }
}

function normalizeMaintenanceTypes(value) {
  const allowed = new Set(MAINTENANCE_VALUE_LIST.map(canonicalMaintenanceType));
  const parts = String(value || '')
    .split(/[、,，]/)
    .map(v => canonicalMaintenanceType(v.trim()))
    .filter(v => allowed.has(v));

  if (parts.includes(MAINTENANCE_EPI_TYPE)) return MAINTENANCE_EPI_TYPE;
  return Array.from(new Set(parts)).join('、');
}

function maintenanceTagsHtml(value) {
  return normalizeMaintenanceTypes(value).split('、').filter(Boolean).map(v => {
    const cls = v === MAINTENANCE_EPI_TYPE ? ' maintenance-tag-epi' : '';
    return `<span class="maintenance-tag${cls}">${escapeHtml(v)}</span>`;
  }).join('');
}

function reservationStatusClass(r, prefix) {
  const types = normalizeMaintenanceTypes(r.maintenanceTypes || '').split('、').filter(Boolean);
  if (!types.length) return '';
  if (types.includes(MAINTENANCE_EPI_TYPE)) return ` ${prefix}-epi`;
  return ` ${prefix}-maintenance`;
}

function canonicalMaintenanceType(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  const map = {
    '除害停止メンテ': '除害停止',
    '重故障メンテ': '重故障',
    'メンテ': '重故障',
    '定常': '定常メンテ',
    '通常メンテ': '定常メンテ',
    '原料': '原料交換',
  };
  return map[v] || v;
}

function isActualEquipment(value) {
  return value && value !== MAINTENANCE_TAB_NAME && value !== LEGACY_MAINTENANCE_TAB_NAME;
}

function isMaintenanceView() {
  return state.equipment === MAINTENANCE_TAB_NAME;
}

function isMaintenanceOnlyReservation(r) {
  const types = normalizeMaintenanceTypes(r.maintenanceTypes || '').split('、').filter(Boolean);
  return types.length > 0 && !types.includes(MAINTENANCE_EPI_TYPE);
}
