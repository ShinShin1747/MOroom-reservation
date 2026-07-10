'use strict';

const APP_VERSION = '20260710-v9-runtime-fix';

const OVERALL_TAB_NAME = '全体表示';
const MAINTENANCE_TAB_NAME = 'メンテ情報';
const EMAIL_CONTENT_TAB_NAME = 'メール内容';
const EPI_TYPE = 'エピ';
const DEFAULT_EQUIPMENTS = ['MOVPE 豊田中研', 'MOVPE #4', 'MOVPE #5', 'MOVPE #7', 'MOVPE #10', 'MOVPE #11', 'MOVPE #12'];
const DEFAULT_MAINTENANCE_TYPES = ['原料交換', '重故障', '除害停止', '定常メンテ'];
const ACTUAL_EQUIPMENTS = Array.from(new Set(
  (typeof EQUIPMENTS !== 'undefined' && Array.isArray(EQUIPMENTS) ? EQUIPMENTS : DEFAULT_EQUIPMENTS)
    .map(v => String(v || '').trim())
    .filter(Boolean)
));
const ACTIVE_MAINTENANCE_TYPES = Array.from(new Set(
  (typeof MAINTENANCE_DETAIL_TYPES !== 'undefined' && Array.isArray(MAINTENANCE_DETAIL_TYPES)
    ? MAINTENANCE_DETAIL_TYPES
    : DEFAULT_MAINTENANCE_TYPES)
    .map(canonicalMaintenanceType)
    .filter(Boolean)
));
const VIEW_TABS = [...ACTUAL_EQUIPMENTS, OVERALL_TAB_NAME, MAINTENANCE_TAB_NAME, EMAIL_CONTENT_TAB_NAME];
const CACHE_KEY = 'moroom_reservations_cache_v8';
const LOCAL_KEY = 'equipmentReservations';
const HOUR_HEIGHT = 50;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const state = {
  view: ACTUAL_EQUIPMENTS[0] || OVERALL_TAB_NAME,
  formEquipment: ACTUAL_EQUIPMENTS[0] || '',
  weekStart: startOfWeek(new Date()),
  reservations: [],
  emails: [],
  jsonpSeq: 0,
  cacheLoaded: false,
  initialScrollDone: false,
  refreshTimer: null,
};

const els = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
  mapElements();
  renderEquipmentControls();
  bindEvents();
  setDefaultFormValues();
  els.dataMode.textContent = hasApi() ? 'Google Apps Script / Google Sheets' : 'このブラウザ内のみ';

  const cached = readCache();
  if (cached.length) {
    state.reservations = cached;
    state.cacheLoaded = true;
    renderAll();
    setStatus('前回データを表示中・共有データを更新中', 'ok');
  } else {
    renderAll();
    setStatus('共有データを読み込み中...', '');
  }

  setTimeout(() => loadReservations({ background: cached.length > 0 }), 0);
  renderEmailList();
  state.refreshTimer = window.setInterval(() => loadReservations({ background: true }), REFRESH_INTERVAL_MS);
}

function mapElements() {
  Object.assign(els, {
    mainViewPanel: document.getElementById('mainViewPanel'),
    formPanel: document.getElementById('formPanel'),
    reservationPanel: document.getElementById('reservationPanel'),
    status: document.getElementById('status'),
    dataMode: document.getElementById('dataMode'),
    tabs: document.getElementById('equipmentTabs'),
    equipment: document.getElementById('equipment'),
    weekTitle: document.getElementById('weekTitle'),
    monthPicker: document.getElementById('monthPicker'),
    calendarToolbar: document.getElementById('calendarToolbar'),
    calendarWrap: document.getElementById('calendarWrap'),
    timeline: document.getElementById('timeline'),
    viewLegend: document.getElementById('viewLegend'),
    emailContentView: document.getElementById('emailContentView'),
    emailReloadBtn: document.getElementById('emailReloadBtn'),
    emailStatus: document.getElementById('emailStatus'),
    emailList: document.getElementById('emailContentList'),
    emailViewPass: document.getElementById('emailViewPass'),
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
  });
}

function bindEvents() {
  document.getElementById('prevWeek').addEventListener('click', () => moveWeek(-7));
  document.getElementById('todayBtn').addEventListener('click', () => {
    state.weekStart = startOfWeek(new Date());
    state.initialScrollDone = false;
    renderAll();
  });
  document.getElementById('nextWeek').addEventListener('click', () => moveWeek(7));
  document.getElementById('reloadBtn').addEventListener('click', () => loadReservations({ background: false, force: true }));
  els.monthPicker.addEventListener('change', () => jumpToMonth(els.monthPicker.value));
  els.emailReloadBtn.addEventListener('click', loadEmailReservations);
  els.form.addEventListener('submit', handleSubmit);
  els.equipment.addEventListener('change', () => {
    state.formEquipment = els.equipment.value;
    state.view = els.equipment.value;
    updateActiveTab();
    renderAll();
  });
  els.maintenanceKind.forEach(input => input.addEventListener('change', updateMaintenanceDetailVisibility));
  els.mode.addEventListener('change', updateFormMode);
}

function renderEquipmentControls() {
  els.tabs.innerHTML = VIEW_TABS.map(tab => {
    const classes = [
      tab === state.view ? 'active' : '',
      tab === OVERALL_TAB_NAME ? 'overall-tab' : '',
      tab === MAINTENANCE_TAB_NAME ? 'maintenance-tab' : '',
      tab === EMAIL_CONTENT_TAB_NAME ? 'email-content-tab' : '',
    ].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" data-view="${escapeHtml(tab)}">${escapeHtml(tab)}</button>`;
  }).join('');

  els.tabs.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      state.view = button.dataset.view;
      if (ACTUAL_EQUIPMENTS.includes(state.view)) {
        state.formEquipment = state.view;
        els.equipment.value = state.view;
      }
      updateActiveTab();
      renderAll();
    });
  });

  els.equipment.innerHTML = ACTUAL_EQUIPMENTS
    .map(eq => `<option value="${escapeHtml(eq)}">${escapeHtml(eq)}</option>`)
    .join('');
  els.equipment.value = state.formEquipment;
}

function updateActiveTab() {
  els.tabs.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === state.view);
  });
}

function setDefaultFormValues() {
  els.form.reset();
  els.mode.value = 'new';
  els.id.value = '';
  els.date.value = formatDate(new Date());
  els.start.value = '09:00';
  els.finish.value = '10:00';
  if (!ACTUAL_EQUIPMENTS.includes(state.formEquipment)) state.formEquipment = ACTUAL_EQUIPMENTS[0] || '';
  els.equipment.value = state.formEquipment;
  setMaintenanceSelection('', []);
  updateFormMode();
}

function updateFormMode() {
  const deleting = els.mode.value === 'delete';
  els.form.classList.toggle('delete-mode', deleting);
}

async function loadReservations(options = {}) {
  const { background = false } = options;
  if (!background) setStatus('共有データを読み込み中...', '');

  try {
    let result;
    if (hasApi()) {
      result = await apiCall({ action: 'list' }, 12000);
    } else {
      result = { ok: true, reservations: readLocalReservations() };
    }

    if (!result || result.ok === false) throw new Error(result?.error || '予約の読み込みに失敗しました。');
    const normalized = normalizeReservations(result.reservations || []);
    state.reservations = normalized;
    writeCache(normalized);
    renderAll();
    setStatus(`読み込み完了（${normalized.length}件）`, 'ok');
  } catch (error) {
    if (state.reservations.length) {
      renderAll();
      setStatus('前回データを表示中（共有データ更新に失敗）', 'error');
      if (!background) setMessage(error.message, true);
    } else {
      setStatus('読み込みエラー', 'error');
      setMessage(error.message, true);
    }
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
    setStatus('保存中...', '');
    const result = hasApi() ? await apiCall(payload, 15000) : localAction(payload);
    if (!result || result.ok === false) throw new Error(result?.error || '保存に失敗しました。');
    setMessage(result.message || '保存しました。', false);
    setDefaultFormValues();
    await loadReservations({ background: false, force: true });
  } catch (error) {
    setMessage(error.message, true);
    setStatus('保存エラー', 'error');
  }
}

function getFormPayload() {
  const kind = getMaintenanceKind();
  const details = getSelectedMaintenanceTypes();
  const maintenanceTypes = kind === 'epi' ? EPI_TYPE : details.join('、');
  return {
    action: els.mode.value,
    id: els.id.value.trim(),
    equipment: els.equipment.value,
    name: els.name.value.trim(),
    date: els.date.value,
    start: els.start.value,
    finish: els.finish.value,
    maintenanceKind: kind,
    maintenanceTypes,
    usage: maintenanceTypes,
    remark: els.remark.value.trim(),
    pass: els.pass.value,
  };
}

function validatePayload(p) {
  if (!p.action) return '操作を選択してください。';
  if ((p.action === 'edit' || p.action === 'delete') && !p.id) return '変更・削除する予約を一覧または予約表から選択してください。';
  if (!ACTUAL_EQUIPMENTS.includes(p.equipment)) return '装置を選択してください。';
  if (!p.name || !p.date || !p.start || !p.finish || !p.pass) return '必須項目を入力してください。';
  if (p.start >= p.finish) return '終了時刻は開始時刻より後にしてください。';
  if (p.action !== 'delete') {
    if (!['maintenance', 'epi'].includes(p.maintenanceKind)) return '使用目的はメンテまたはエピを選択してください。';
    if (p.maintenanceKind === 'maintenance' && !p.maintenanceTypes) return 'メンテ内容を1つ以上選択してください。';
  }
  return '';
}

function renderAll() {
  syncMonthPicker();
  updateViewVisibility();
  if (isEmailView()) {
    renderEmailList();
    return;
  }
  renderTimeline();
  renderReservationList();
}

function updateViewVisibility() {
  const email = isEmailView();
  els.calendarToolbar.classList.toggle('is-hidden', email);
  els.calendarWrap.classList.toggle('is-hidden', email);
  els.emailContentView.classList.toggle('is-hidden', !email);
  els.formPanel.classList.toggle('is-hidden', email);
  els.reservationPanel.classList.toggle('is-hidden', email || isSpecialScheduleView());
  els.viewLegend.classList.toggle('is-hidden', email);
  if (email) els.weekTitle.textContent = 'メール内容';
}

function renderTimeline() {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  const items = filteredReservations();
  const titlePrefix = isOverallView() ? '全体表示' : isMaintenanceView() ? 'メンテ情報' : state.view;
  els.weekTitle.textContent = `${titlePrefix}：${formatDate(dates[0])} ～ ${formatDate(dates[6])}`;
  renderLegend(items);

  const tracks = dates.map(date => {
    const key = formatDate(date);
    const dayItems = items.filter(item => item.date === key).sort(sortByTimeThenEquipment);
    const laidOut = layoutOverlaps(dayItems);
    const todayClass = key === formatDate(new Date()) ? ' today' : '';
    return `<div class="day-track${todayClass}" data-date="${key}">${laidOut.map(renderTimelineEvent).join('')}</div>`;
  }).join('');

  const hourLabels = Array.from({ length: 25 }, (_, hour) => {
    const top = hour * HOUR_HEIGHT;
    return `<span class="time-label" style="top:${top}px">${String(hour).padStart(2, '0')}:00</span>`;
  }).join('');

  const dayHeads = dates.map(date => {
    const key = formatDate(date);
    const todayClass = key === formatDate(new Date()) ? ' today' : '';
    return `<div class="timeline-day-head${todayClass}"><span class="dow">${weekday(date)}</span><span class="date-label">${formatDateShort(date)}</span></div>`;
  }).join('');

  const lastUse = dates.map(date => {
    const dayItems = items.filter(item => item.date === formatDate(date));
    return `<div class="last-use-cell">${lastUseHtml(dayItems)}</div>`;
  }).join('');

  const emptyText = isMaintenanceView()
    ? 'この週のメンテ予約はありません。'
    : isOverallView()
      ? 'この週の予約はありません。'
      : 'この装置の予約はありません。';

  els.timeline.innerHTML = `
    <div class="timeline-header">
      <div class="timeline-corner">時間</div>
      ${dayHeads}
    </div>
    <div class="timeline-body">
      <div class="time-axis">${hourLabels}</div>
      ${tracks}
      ${items.length ? '' : `<div class="timeline-empty">${escapeHtml(emptyText)}</div>`}
    </div>
    <div class="last-use-grid">
      <div class="last-use-label">最終使用</div>
      ${lastUse}
    </div>`;

  els.timeline.querySelectorAll('[data-reservation-id]').forEach(button => {
    button.addEventListener('click', () => fillForm(button.dataset.reservationId));
  });

  if (!state.initialScrollDone) {
    requestAnimationFrame(() => {
      els.calendarWrap.scrollTop = 7 * HOUR_HEIGHT;
      state.initialScrollDone = true;
    });
  }
}

function layoutOverlaps(items) {
  const normalized = items
    .map(reservation => ({
      reservation,
      startMinute: parseTimeMinutes(reservation.start),
      finishMinute: parseTimeMinutes(reservation.finish),
    }))
    .filter(item => item.startMinute !== null && item.finishMinute !== null && item.finishMinute > item.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute || a.finishMinute - b.finishMinute || a.reservation.equipment.localeCompare(b.reservation.equipment));

  const clusters = [];
  let current = [];
  let clusterEnd = -1;
  for (const item of normalized) {
    if (!current.length || item.startMinute < clusterEnd) {
      current.push(item);
      clusterEnd = Math.max(clusterEnd, item.finishMinute);
    } else {
      clusters.push(current);
      current = [item];
      clusterEnd = item.finishMinute;
    }
  }
  if (current.length) clusters.push(current);

  const output = [];
  for (const cluster of clusters) {
    const laneEnds = [];
    const withLanes = cluster.map(item => {
      let lane = laneEnds.findIndex(end => end <= item.startMinute);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = item.finishMinute;
      return { ...item, lane };
    });
    const laneCount = Math.max(1, laneEnds.length);
    withLanes.forEach(item => output.push({ ...item, laneCount }));
  }
  return output;
}

function renderTimelineEvent(item) {
  const r = item.reservation;
  const top = (item.startMinute / 60) * HOUR_HEIGHT;
  const height = Math.max(27, ((item.finishMinute - item.startMinute) / 60) * HOUR_HEIGHT - 3);
  const width = 100 / item.laneCount;
  const left = item.lane * width;
  const gap = 2;
  const color = equipmentColor(r.equipment);
  const showEquipment = isOverallView() || isMaintenanceView();
  const purpose = displayPurpose(r);
  const title = [
    `${r.start}-${r.finish}`,
    r.equipment,
    r.name,
    purpose,
    r.remark,
  ].filter(Boolean).join(' / ');

  return `<button type="button" class="timeline-event"
    data-reservation-id="${escapeHtml(r.id)}"
    title="${escapeHtml(title)}"
    style="--event-color:${color};top:${top}px;height:${height}px;left:calc(${left}% + ${gap}px);width:calc(${width}% - ${gap * 2}px)">
      <span class="event-time">${escapeHtml(r.start)}-${escapeHtml(r.finish)}</span>
      ${showEquipment ? `<span class="event-equipment">${escapeHtml(r.equipment)}</span>` : ''}
      <span class="event-name">${escapeHtml(r.name)}</span>
      ${purpose ? `<span class="event-purpose">${escapeHtml(purpose)}</span>` : ''}
      ${r.remark ? `<span class="event-remark">${escapeHtml(r.remark)}</span>` : ''}
    </button>`;
}

function renderLegend(items) {
  if (!isOverallView() && !isMaintenanceView()) {
    els.viewLegend.innerHTML = '';
    return;
  }
  const used = ACTUAL_EQUIPMENTS.filter(eq => items.some(item => item.equipment === eq));
  els.viewLegend.innerHTML = used.map(eq => `
    <span class="legend-item" style="--event-color:${equipmentColor(eq)}">
      <span class="legend-dot"></span>${escapeHtml(eq)}
    </span>`).join('');
}

function renderReservationList() {
  if (isSpecialScheduleView() || isEmailView()) return;
  const items = filteredReservations().sort(sortByDateTime);
  if (!items.length) {
    els.list.innerHTML = '<div class="empty-card">この装置の予約はありません。</div>';
    return;
  }
  els.list.innerHTML = items.map(r => `
    <button type="button" class="reservation-card" data-reservation-id="${escapeHtml(r.id)}" style="--event-color:${equipmentColor(r.equipment)}">
      <span class="card-time">${escapeHtml(r.date)} ${escapeHtml(r.start)}-${escapeHtml(r.finish)}</span>
      <span>${escapeHtml(r.name)}</span>
      ${displayPurpose(r) ? `<span>${escapeHtml(displayPurpose(r))}</span>` : ''}
      ${r.remark ? `<span>${escapeHtml(r.remark)}</span>` : ''}
      <span class="card-meta">予約ID: ${escapeHtml(r.id)}</span>
    </button>`).join('');
  els.list.querySelectorAll('[data-reservation-id]').forEach(button => {
    button.addEventListener('click', () => fillForm(button.dataset.reservationId));
  });
}

function fillForm(id) {
  const r = state.reservations.find(item => item.id === id);
  if (!r) return;
  state.formEquipment = r.equipment;
  state.view = r.equipment;
  els.mode.value = 'edit';
  els.id.value = r.id;
  els.equipment.value = r.equipment;
  els.name.value = r.name;
  els.date.value = r.date;
  els.start.value = r.start;
  els.finish.value = r.finish;
  els.remark.value = r.remark || '';
  els.pass.value = '';
  setMaintenanceSelection(r.maintenanceKind, r.maintenanceTypesArray);
  updateActiveTab();
  renderAll();
  updateFormMode();
  setMessage('選択した予約をフォームへ読み込みました。', false);
  els.formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function filteredReservations() {
  const start = formatDate(state.weekStart);
  const end = formatDate(addDays(state.weekStart, 6));
  return state.reservations.filter(r => {
    if (r.date < start || r.date > end) return false;
    if (isOverallView()) return ACTUAL_EQUIPMENTS.includes(r.equipment);
    if (isMaintenanceView()) return isMaintenanceReservation(r);
    return r.equipment === state.view;
  });
}

async function loadEmailReservations() {
  if (!hasApi()) {
    setEmailStatus('メール内容は共有モードでのみ利用できます。', true);
    return;
  }
  setEmailStatus('メールを読み込み中...', false);
  try {
    const result = await apiCall({
      action: 'emailList',
      emailPass: els.emailViewPass.value || '',
    }, 15000);
    if (!result || result.ok === false) throw new Error(result?.error || 'メール内容の読み込みに失敗しました。');
    state.emails = normalizeEmailMessages(result.emailMessages || result.emailReservations || []);
    renderEmailList();
    setEmailStatus(`${state.emails.length}件を読み込みました。`, false);
  } catch (error) {
    setEmailStatus(error.message, true);
  }
}

function renderEmailList() {
  if (!state.emails.length) {
    els.emailList.innerHTML = '<div class="empty-card">「メールを読み込み」を押してください。</div>';
    return;
  }
  els.emailList.innerHTML = state.emails.map(item => `
    <article class="email-card">
      <h3>${escapeHtml(item.subject || '件名なし')}</h3>
      <div class="email-meta">${escapeHtml(item.receivedAt)} / ${escapeHtml(item.from)}</div>
      ${item.summary ? `<p><strong>まとめ：</strong>${escapeHtml(item.summary)}</p>` : ''}
      ${item.snippet ? `<p>${escapeHtml(item.snippet)}</p>` : ''}
      ${item.body ? `<details><summary>本文全文を表示</summary><div class="email-body">${escapeHtml(item.body)}</div></details>` : ''}
      ${safeHttpUrl(item.url) ? `<p><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Gmailで開く</a></p>` : ''}
    </article>`).join('');
}

function normalizeReservations(items) {
  return (Array.isArray(items) ? items : []).map(raw => {
    const usage = String(raw.usage || '');
    const types = normalizeMaintenanceTypes(raw.maintenanceTypes || usage);
    let kind = String(raw.maintenanceKind || '').toLowerCase();
    if (!['maintenance', 'epi'].includes(kind)) {
      kind = types.includes(EPI_TYPE) || usage.includes(EPI_TYPE) ? 'epi' : types.some(type => type !== EPI_TYPE) ? 'maintenance' : '';
    }
    const details = kind === 'epi' ? [EPI_TYPE] : types.filter(type => type !== EPI_TYPE);
    return {
      id: String(raw.id || '').trim(),
      equipment: String(raw.equipment || '').trim(),
      name: String(raw.name || '').trim(),
      date: normalizeDateValue(raw.date),
      start: normalizeTimeValue(raw.start),
      finish: normalizeTimeValue(raw.finish),
      maintenanceKind: kind,
      maintenanceTypesArray: details,
      maintenanceTypes: details.join('、'),
      usage,
      remark: String(raw.remark || '').trim(),
    };
  }).filter(r => r.id && r.equipment && r.date && r.start && r.finish);
}

function normalizeMaintenanceTypes(value) {
  const text = Array.isArray(value) ? value.join('、') : String(value || '');
  const found = [];
  if (/エピ/i.test(text)) found.push(EPI_TYPE);
  for (const type of ACTIVE_MAINTENANCE_TYPES) {
    if (text.includes(type)) found.push(type);
  }
  if (/原料(交換)?/.test(text) && !found.includes('原料交換')) found.push('原料交換');
  if (/重故障/.test(text) && !found.includes('重故障')) found.push('重故障');
  if (/除害/.test(text) && !found.includes('除害停止')) found.push('除害停止');
  if (/定常/.test(text) && !found.includes('定常メンテ')) found.push('定常メンテ');
  if (/メンテ/.test(text) && !found.some(v => v !== EPI_TYPE)) found.push('メンテ');
  return Array.from(new Set(found));
}

function canonicalMaintenanceType(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/原料/.test(text)) return '原料交換';
  if (/重故障/.test(text)) return '重故障';
  if (/除害/.test(text)) return '除害停止';
  if (/定常/.test(text)) return '定常メンテ';
  return text;
}

function normalizeEmailMessages(items) {
  return (Array.isArray(items) ? items : []).map(item => ({
    emailId: String(item.emailId || item.id || ''),
    receivedAt: String(item.receivedAt || ''),
    from: String(item.from || ''),
    subject: String(item.subject || ''),
    summary: String(item.summary || ''),
    snippet: String(item.snippet || ''),
    body: String(item.body || ''),
    url: String(item.url || ''),
  }));
}

function setMaintenanceSelection(kind, types) {
  const normalizedTypes = Array.isArray(types) ? types : normalizeMaintenanceTypes(types);
  const resolvedKind = kind === 'epi' || normalizedTypes.includes(EPI_TYPE)
    ? 'epi'
    : kind === 'maintenance' || normalizedTypes.some(type => type !== EPI_TYPE)
      ? 'maintenance'
      : '';
  els.maintenanceKind.forEach(input => { input.checked = input.value === resolvedKind; });
  els.maintenanceDetails.forEach(input => { input.checked = normalizedTypes.includes(input.value); });
  updateMaintenanceDetailVisibility();
}

function updateMaintenanceDetailVisibility() {
  const show = getMaintenanceKind() === 'maintenance';
  els.maintenanceDetailPanel.classList.toggle('is-hidden', !show);
  if (!show) els.maintenanceDetails.forEach(input => { input.checked = false; });
}

function getMaintenanceKind() {
  return els.maintenanceKind.find(input => input.checked)?.value || '';
}

function getSelectedMaintenanceTypes() {
  return els.maintenanceDetails.filter(input => input.checked).map(input => input.value);
}

function displayPurpose(r) {
  if (r.maintenanceKind === 'epi') return EPI_TYPE;
  if (r.maintenanceTypes) return r.maintenanceTypes;
  return r.usage || '';
}

function isMaintenanceReservation(r) {
  return r.maintenanceKind === 'maintenance' || r.maintenanceTypesArray.some(type => type !== EPI_TYPE);
}

function isOverallView() { return state.view === OVERALL_TAB_NAME; }
function isMaintenanceView() { return state.view === MAINTENANCE_TAB_NAME; }
function isEmailView() { return state.view === EMAIL_CONTENT_TAB_NAME; }
function isSpecialScheduleView() { return isOverallView() || isMaintenanceView(); }
function hasApi() { return typeof API_URL !== 'undefined' && String(API_URL || '').trim() !== ''; }

function apiCall(params, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const callbackName = `moroomJsonp_${Date.now()}_${state.jsonpSeq++}`;
    const url = new URL(API_URL);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value ?? ''));
    url.searchParams.set('callback', callbackName);
    url.searchParams.set('_', Date.now().toString());

    const script = document.createElement('script');
    let finished = false;
    const timeout = window.setTimeout(() => finish(() => reject(new Error('共有データの応答が遅いためタイムアウトしました。前回データはそのまま表示します。'))), timeoutMs);

    function finish(callback) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
      callback();
    }

    window[callbackName] = data => finish(() => resolve(data));
    script.onerror = () => finish(() => reject(new Error('共有データへ接続できませんでした。')));
    script.src = url.toString();
    document.head.appendChild(script);
  });
}

function localAction(payload) {
  const items = readLocalReservations();
  if (payload.action === 'new') {
    if (items.some(item => isOverlap(item, payload))) return { ok: false, error: '同じ装置・日付・時間帯で予約が重複しています。' };
    items.push({ ...payload, id: makeId(), passHash: payload.pass });
    writeLocalReservations(items);
    return { ok: true, message: '予約を作成しました。' };
  }

  const index = items.findIndex(item => String(item.id) === payload.id);
  if (index < 0) return { ok: false, error: '対象予約が見つかりません。' };
  if (items[index].passHash !== payload.pass) return { ok: false, error: 'パスワードが違います。' };
  if (payload.action === 'delete') {
    items.splice(index, 1);
    writeLocalReservations(items);
    return { ok: true, message: '予約を削除しました。' };
  }
  if (items.some((item, i) => i !== index && isOverlap(item, payload))) return { ok: false, error: '同じ装置・日付・時間帯で予約が重複しています。' };
  items[index] = { ...items[index], ...payload, passHash: payload.pass };
  writeLocalReservations(items);
  return { ok: true, message: '予約を更新しました。' };
}

function isOverlap(a, b) {
  return String(a.equipment) === String(b.equipment)
    && normalizeDateValue(a.date) === normalizeDateValue(b.date)
    && normalizeTimeValue(b.start) < normalizeTimeValue(a.finish)
    && normalizeTimeValue(b.finish) > normalizeTimeValue(a.start);
}

function readLocalReservations() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); }
  catch { return []; }
}
function writeLocalReservations(items) { localStorage.setItem(LOCAL_KEY, JSON.stringify(items)); }

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return normalizeReservations(parsed.reservations || []);
  } catch {
    return [];
  }
}
function writeCache(items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), reservations: items }));
  } catch {
    // Storage can be unavailable in private/restricted modes. The app still works without cache.
  }
}

function lastUseHtml(items) {
  const valid = items.filter(item => item.finish);
  if (!valid.length) return '<span>—</span>';
  const latest = valid.reduce((max, item) => item.finish > max ? item.finish : max, valid[0].finish);
  const equipment = Array.from(new Set(valid.filter(item => item.finish === latest).map(item => item.equipment))).join('、');
  return `<strong>${escapeHtml(latest)}</strong><span>${escapeHtml(equipment)}</span>`;
}

function equipmentColor(equipment) {
  const palette = ['#2f6da8', '#2d8659', '#8d5b20', '#7d4da1', '#b2455d', '#2c7f86', '#766d25', '#495c91'];
  const index = Math.max(0, ACTUAL_EQUIPMENTS.indexOf(equipment));
  return palette[index % palette.length];
}

function moveWeek(days) {
  state.weekStart = addDays(state.weekStart, days);
  state.initialScrollDone = false;
  renderAll();
}

function jumpToMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return;
  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return;
  state.weekStart = startOfWeek(date);
  state.initialScrollDone = false;
  renderAll();
}

function syncMonthPicker() {
  els.monthPicker.value = formatMonth(addDays(state.weekStart, 3));
}

function startOfWeek(date) {
  const d = new Date(date);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function formatMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function formatDateShort(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
function weekday(date) {
  return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
}
function normalizeDateValue(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[-/]?(\d{1,2})[-/]?(\d{1,2})/);
  if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : formatDate(date);
}
function normalizeTimeValue(value) {
  const text = String(value || '').trim();
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function parseTimeMinutes(value) {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
}
function sortByTimeThenEquipment(a, b) {
  return (a.start + a.finish + a.equipment).localeCompare(b.start + b.finish + b.equipment, 'ja');
}
function sortByDateTime(a, b) {
  return (a.date + a.start + a.finish).localeCompare(b.date + b.start + b.finish, 'ja');
}
function makeId() {
  return `R${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[char]);
}
function setMessage(text, isError) {
  els.message.textContent = `メッセージ：${text}`;
  els.message.className = `message ${isError ? 'error' : 'ok'}`;
}
function setEmailStatus(text, isError) {
  els.emailStatus.textContent = `メッセージ：${text}`;
  els.emailStatus.className = `message ${isError ? 'error' : 'ok'}`;
}
function setStatus(text, kind) {
  els.status.textContent = text;
  els.status.className = `status ${kind || ''}`.trim();
}
