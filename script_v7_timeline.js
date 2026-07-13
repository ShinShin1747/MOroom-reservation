'use strict';

const APP_VERSION = '20260713-v13-admin-facility';

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
  emailLoading: false,
  emailLoaded: false,
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
  els.emailReloadBtn.addEventListener('click', () => loadEmailReservations({ force: true }));
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
      if (isEmailView() && !state.emailLoaded && !state.emailLoading) {
        window.setTimeout(() => loadEmailReservations({ force: false }), 0);
      }
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
  if (isSpecialScheduleView()) {
    renderTimeline();
  } else {
    renderEquipmentWeekBoard();
  }
  renderReservationList();
}

function updateViewVisibility() {
  const email = isEmailView();
  const expanded = email || isSpecialScheduleView();

  els.calendarToolbar.classList.toggle('is-hidden', email);
  els.calendarWrap.classList.toggle('is-hidden', email);
  els.calendarWrap.classList.toggle('equipment-board-mode', !email && !isSpecialScheduleView());
  els.emailContentView.classList.toggle('is-hidden', !email);
  els.formPanel.classList.toggle('is-hidden', expanded);
  els.reservationPanel.classList.toggle('is-hidden', expanded);
  els.viewLegend.classList.toggle('is-hidden', email);
  els.mainViewPanel.classList.toggle('expanded-view', expanded);
  document.body.classList.toggle('expanded-view-active', expanded);

  if (email) els.weekTitle.textContent = 'メール内容';
}

function renderEquipmentWeekBoard() {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  const items = filteredReservations().sort(sortByDateTime);
  els.weekTitle.textContent = `${state.view}：${formatDate(dates[0])} ～ ${formatDate(dates[6])}`;
  renderLegend(items);

  const heads = dates.map(date => {
    const key = formatDate(date);
    const todayClass = key === formatDate(new Date()) ? ' today' : '';
    return `<div class="equipment-board-day-head${todayClass}"><span class="dow">${weekday(date)}</span><span class="date-label">${formatDateShort(date)}</span></div>`;
  }).join('');

  const columns = dates.map(date => {
    const key = formatDate(date);
    const todayClass = key === formatDate(new Date()) ? ' today' : '';
    const dayItems = items.filter(item => item.date === key).sort(sortByTimeThenEquipment);
    const cards = dayItems.length
      ? dayItems.map(renderEquipmentCard).join('')
      : '<div class="equipment-day-empty">予約なし</div>';
    return `<div class="equipment-day-column${todayClass}" data-date="${key}">${cards}</div>`;
  }).join('');

  els.timeline.innerHTML = `
    <div class="equipment-week-board">
      <div class="equipment-board-header">${heads}</div>
      <div class="equipment-board-body">${columns}</div>
    </div>`;

  els.timeline.querySelectorAll('[data-reservation-id]').forEach(button => {
    button.addEventListener('click', () => fillForm(button.dataset.reservationId));
  });

  els.calendarWrap.scrollTop = 0;
  state.initialScrollDone = false;
}

function renderEquipmentCard(r) {
  const purpose = displayPurpose(r);
  const purposeClass = reservationPurposeClass(r);
  const purposeLabel = r.maintenanceKind === 'epi' ? 'エピ' : isMaintenanceReservation(r) ? 'メンテ' : purpose;
  const title = [
    `${r.start}-${r.finish}`,
    r.name,
    purpose,
    r.remark,
  ].filter(Boolean).join(' / ');

  return `<button type="button" class="equipment-event ${purposeClass}"
    data-reservation-id="${escapeHtml(r.id)}"
    title="${escapeHtml(title)}">
      <span class="equipment-event-time">${escapeHtml(r.start)}-${escapeHtml(r.finish)}</span>
      <span class="equipment-event-name">${escapeHtml(r.name)}</span>
      ${purposeLabel ? `<span class="equipment-event-purpose">${escapeHtml(purposeLabel)}</span>` : ''}
      ${r.maintenanceKind === 'maintenance' && purpose ? `<span class="equipment-event-detail">${escapeHtml(purpose)}</span>` : ''}
      ${r.remark ? `<span class="equipment-event-remark">${escapeHtml(r.remark)}</span>` : ''}
    </button>`;
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
    els.viewLegend.innerHTML = `
      <span class="legend-item purpose-legend purpose-epi"><span class="legend-dot"></span>エピ</span>
      <span class="legend-item purpose-legend purpose-maintenance"><span class="legend-dot"></span>メンテ</span>`;
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
    <button type="button" class="reservation-card ${reservationPurposeClass(r)}" data-reservation-id="${escapeHtml(r.id)}">
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

async function loadEmailReservations(options = {}) {
  const { force = false } = options;

  if (!hasApi()) {
    setEmailStatus('メール内容は共有モードでのみ利用できます。', true);
    return;
  }
  if (state.emailLoading) return;

  state.emailLoading = true;
  els.emailReloadBtn.disabled = true;
  const originalText = els.emailReloadBtn.textContent;
  els.emailReloadBtn.textContent = '読み込み中...';
  setEmailStatus('メールを読み込み中です。Gmailの初回取得は少し時間がかかる場合があります。', false);

  try {
    const result = await apiCall({
      action: 'emailList',
      emailPass: els.emailViewPass.value || '',
      limit: '120',
      force: force ? '1' : '0',
    }, 45000);

    if (!result || result.ok === false) {
      const message = result?.error || 'メール内容の読み込みに失敗しました。';
      if (/不明な操作|emailList/i.test(message)) {
        throw new Error('Apps Script側がメール表示に未対応です。apps_script_backend.gsを更新して再デプロイしてください。');
      }
      throw new Error(message);
    }

    const rawMessages = extractEmailMessages(result);
    state.emails = normalizeEmailMessages(rawMessages);
    state.emailLoaded = true;
    renderEmailList();

    const versionText = result.version ? ` / Backend: ${result.version}` : '';
    if (state.emails.length) {
      setEmailStatus(`${state.emails.length}件を読み込みました。${versionText}`, false);
    } else {
      setEmailStatus(`対象メールは見つかりませんでした。Apps Scriptを公開したGoogleアカウントに対象メールが届いているか確認してください。${versionText}`, false);
    }
  } catch (error) {
    setEmailStatus(error.message, true);
    if (!state.emails.length) {
      els.emailList.innerHTML = '<div class="empty-card">メールを取得できませんでした。Apps Scriptの再デプロイとGmail権限を確認してください。</div>';
    }
  } finally {
    state.emailLoading = false;
    els.emailReloadBtn.disabled = false;
    els.emailReloadBtn.textContent = originalText;
  }
}

function extractEmailMessages(result) {
  const candidates = [
    result.emailMessages,
    result.emailReservations,
    result.emails,
    result.messages,
    result.data?.emailMessages,
    result.data?.emails,
    result.data?.messages,
    Array.isArray(result.data) ? result.data : null,
  ];
  return candidates.find(Array.isArray) || [];
}

function renderEmailList() {
  if (!state.emails.length) {
    els.emailList.innerHTML = '<div class="empty-card">「メールを読み込み」を押してください。</div>';
    return;
  }

  els.emailList.innerHTML = state.emails.map(item => {
    const metaParts = [item.receivedAt, item.from].filter(Boolean);
    const destination = [item.to ? `To: ${item.to}` : '', item.cc ? `Cc: ${item.cc}` : ''].filter(Boolean).join(' / ');

    return `
      <article class="email-card">
        <h3>${escapeHtml(item.subject || '件名なし')}</h3>
        <div class="email-meta">${escapeHtml(metaParts.join(' / '))}</div>
        ${destination ? `<div class="email-destination">${escapeHtml(destination)}</div>` : ''}
        ${item.summary ? `<p><strong>まとめ：</strong>${escapeHtml(item.summary)}</p>` : ''}
        ${item.snippet ? `<p>${escapeHtml(item.snippet)}</p>` : ''}
        ${item.body ? `<details><summary>本文全文を表示</summary><div class="email-body">${escapeHtml(item.body)}</div></details>` : ''}
        ${safeHttpUrl(item.url) ? `<p><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Gmailで開く</a></p>` : ''}
      </article>`;
  }).join('');
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
    emailId: String(item.emailId || item.messageId || item.id || ''),
    threadId: String(item.threadId || ''),
    receivedAt: String(item.receivedAt || item.date || item.timestamp || ''),
    from: String(item.from || item.sender || ''),
    to: String(item.to || ''),
    cc: String(item.cc || ''),
    subject: String(item.subject || item.title || ''),
    summary: String(item.summary || item.digest || ''),
    snippet: String(item.snippet || item.preview || ''),
    body: String(item.body || item.plainBody || item.text || ''),
    url: String(item.url || item.gmailUrl || item.link || ''),
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

function reservationPurposeClass(r) {
  if (r.maintenanceKind === 'epi' || r.maintenanceTypesArray.includes(EPI_TYPE)) return 'purpose-epi';
  if (isMaintenanceReservation(r)) return 'purpose-maintenance';
  return 'purpose-other';
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


/* ==========================================================================
   管理室連絡・付帯設備メンテ／ガス交換 月間予定
   ========================================================================== */

'use strict';

const SHARED_ADMIN_TAB_NAME = '管理室からの連絡';
const SHARED_FACILITY_TAB_NAME = '付帯設備メンテ・ガス交換';
const SHARED_CACHE_KEY = 'moroom_shared_information_cache_v1';
const SHARED_LOCAL_KEY = 'moroom_shared_information_local_v1';
const SHARED_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const sharedState = {
  view: '',
  notices: [],
  facilities: [],
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  jsonpSeq: 0,
  loading: false,
  refreshTimer: null,
};

const sharedEls = {};

document.addEventListener('DOMContentLoaded', initSharedInformation);

function initSharedInformation() {
  mapSharedElements();
  if (!sharedEls.tabs || !sharedEls.noticeView || !sharedEls.facilityView) return;

  sharedEls.noticeForm.noValidate = true;
  sharedEls.facilityForm.noValidate = true;

  appendSharedTabs();
  observeSharedTabs();
  bindSharedEvents();
  resetNoticeForm();
  resetFacilityForm();

  const cached = readSharedCache();
  if (cached) {
    sharedState.notices = normalizeNotices(cached.notices || []);
    sharedState.facilities = normalizeFacilities(cached.facilities || []);
    renderSharedInformation();
    setSharedStatus('前回データを表示中・共有データを更新中', false);
  } else {
    renderSharedInformation();
  }

  window.setTimeout(() => loadSharedInformation({ background: Boolean(cached) }), 0);
  sharedState.refreshTimer = window.setInterval(
    () => loadSharedInformation({ background: true }),
    SHARED_REFRESH_INTERVAL_MS
  );
}

function mapSharedElements() {
  Object.assign(sharedEls, {
    tabs: document.getElementById('equipmentTabs'),
    banner: document.getElementById('importantNoticeBanner'),

    noticeView: document.getElementById('adminNoticeView'),
    noticeReload: document.getElementById('adminNoticeReloadBtn'),
    noticeStatus: document.getElementById('adminNoticeStatus'),
    noticeList: document.getElementById('adminNoticeList'),
    noticeForm: document.getElementById('adminNoticeForm'),
    noticeMode: document.getElementById('adminNoticeMode'),
    noticeId: document.getElementById('adminNoticeId'),
    noticeTitle: document.getElementById('adminNoticeTitleInput'),
    noticeContent: document.getElementById('adminNoticeContent'),
    noticeTargetType: document.getElementById('adminNoticeTargetType'),
    noticeTargetDetailLabel: document.getElementById('adminNoticeTargetDetailLabel'),
    noticeTargetDetail: document.getElementById('adminNoticeTargetDetail'),
    noticePriority: document.getElementById('adminNoticePriority'),
    noticeStartDate: document.getElementById('adminNoticeStartDate'),
    noticeEndDate: document.getElementById('adminNoticeEndDate'),
    noticePoster: document.getElementById('adminNoticePoster'),
    noticePass: document.getElementById('adminNoticePass'),
    noticeReset: document.getElementById('adminNoticeResetBtn'),

    facilityView: document.getElementById('facilityScheduleView'),
    facilityReload: document.getElementById('facilityReloadBtn'),
    facilityPrevMonth: document.getElementById('facilityPrevMonth'),
    facilityThisMonth: document.getElementById('facilityThisMonth'),
    facilityMonthPicker: document.getElementById('facilityMonthPicker'),
    facilityNextMonth: document.getElementById('facilityNextMonth'),
    facilityStatus: document.getElementById('facilityStatus'),
    facilityMonthTitle: document.getElementById('facilityMonthTitle'),
    facilityCalendar: document.getElementById('facilityCalendar'),
    facilityForm: document.getElementById('facilityForm'),
    facilityMode: document.getElementById('facilityMode'),
    facilityId: document.getElementById('facilityId'),
    facilityCategory: document.getElementById('facilityCategory'),
    facilityTitle: document.getElementById('facilityTitleInput'),
    facilityTarget: document.getElementById('facilityTarget'),
    facilityStartDate: document.getElementById('facilityStartDate'),
    facilityEndDate: document.getElementById('facilityEndDate'),
    facilityStartTime: document.getElementById('facilityStartTime'),
    facilityFinishTime: document.getElementById('facilityFinishTime'),
    facilityContent: document.getElementById('facilityContent'),
    facilityPoster: document.getElementById('facilityPoster'),
    facilityPass: document.getElementById('facilityPass'),
    facilityReset: document.getElementById('facilityResetBtn'),
  });
}

function appendSharedTabs() {
  if (sharedEls.tabs.querySelector('[data-shared-view]')) return;

  const noticeButton = document.createElement('button');
  noticeButton.type = 'button';
  noticeButton.className = 'admin-notice-tab';
  noticeButton.dataset.sharedView = 'notices';
  noticeButton.textContent = SHARED_ADMIN_TAB_NAME;
  if (sharedState.view === 'notices') noticeButton.classList.add('active');

  const facilityButton = document.createElement('button');
  facilityButton.type = 'button';
  facilityButton.className = 'facility-schedule-tab';
  facilityButton.dataset.sharedView = 'facilities';
  facilityButton.textContent = SHARED_FACILITY_TAB_NAME;
  if (sharedState.view === 'facilities') facilityButton.classList.add('active');

  sharedEls.tabs.append(noticeButton, facilityButton);
}


function observeSharedTabs() {
  const observer = new MutationObserver(() => {
    if (!sharedEls.tabs.querySelector('[data-shared-view]')) appendSharedTabs();
  });
  observer.observe(sharedEls.tabs, { childList: true });
}

function bindSharedEvents() {
  sharedEls.tabs.addEventListener('click', event => {
    const sharedButton = event.target.closest('[data-shared-view]');
    if (sharedButton) {
      activateSharedView(sharedButton.dataset.sharedView);
      return;
    }

    const originalButton = event.target.closest('[data-view]');
    if (originalButton) deactivateSharedView();
  });

  sharedEls.noticeReload.addEventListener('click', () => loadSharedInformation({ background: false }));
  sharedEls.facilityReload.addEventListener('click', () => loadSharedInformation({ background: false }));
  sharedEls.noticeForm.addEventListener('submit', submitNoticeForm);
  sharedEls.facilityForm.addEventListener('submit', submitFacilityForm);
  sharedEls.noticeReset.addEventListener('click', resetNoticeForm);
  sharedEls.facilityReset.addEventListener('click', resetFacilityForm);
  sharedEls.noticeTargetType.addEventListener('change', updateNoticeTargetDetailVisibility);

  sharedEls.noticeList.addEventListener('click', event => {
    const card = event.target.closest('[data-notice-id]');
    if (card) fillNoticeForm(card.dataset.noticeId);
  });

  sharedEls.facilityCalendar.addEventListener('click', event => {
    const item = event.target.closest('[data-facility-id]');
    if (item) fillFacilityForm(item.dataset.facilityId);
  });

  sharedEls.facilityPrevMonth.addEventListener('click', () => moveFacilityMonth(-1));
  sharedEls.facilityNextMonth.addEventListener('click', () => moveFacilityMonth(1));
  sharedEls.facilityThisMonth.addEventListener('click', () => {
    const now = new Date();
    sharedState.month = new Date(now.getFullYear(), now.getMonth(), 1);
    renderFacilityCalendar();
  });
  sharedEls.facilityMonthPicker.addEventListener('change', () => {
    const match = String(sharedEls.facilityMonthPicker.value || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return;
    sharedState.month = new Date(Number(match[1]), Number(match[2]) - 1, 1);
    renderFacilityCalendar();
  });
}

function activateSharedView(view) {
  sharedState.view = view;
  document.body.classList.add('shared-info-active');
  sharedEls.noticeView.classList.toggle('is-hidden', view !== 'notices');
  sharedEls.facilityView.classList.toggle('is-hidden', view !== 'facilities');

  sharedEls.tabs.querySelectorAll('button').forEach(button => {
    const active = button.dataset.sharedView === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  if (view === 'notices') renderNoticeList();
  if (view === 'facilities') renderFacilityCalendar();
}

function deactivateSharedView() {
  sharedState.view = '';
  document.body.classList.remove('shared-info-active');
  sharedEls.noticeView.classList.add('is-hidden');
  sharedEls.facilityView.classList.add('is-hidden');
  sharedEls.tabs.querySelectorAll('[data-shared-view]').forEach(button => {
    button.classList.remove('active');
    button.removeAttribute('aria-current');
  });
}

async function loadSharedInformation(options = {}) {
  const background = Boolean(options.background);
  if (sharedState.loading) return;
  sharedState.loading = true;

  if (!background) setSharedStatus('共有情報を読み込み中...', false);

  try {
    let result;
    if (hasSharedApi()) {
      result = await sharedApiCall({ action: 'sharedList' }, 15000);
    } else {
      result = readSharedLocalStore();
    }

    if (!result || result.ok === false) {
      const apiError = (result && result.error) || '共有情報の読み込みに失敗しました。';
      if (/不明な操作/.test(apiError)) {
        throw new Error('Apps Scriptが旧版です。apps_script_backend.gsの内容で全置換し、「新バージョン」で再デプロイしてください。');
      }
      throw new Error(apiError);
    }

    sharedState.notices = normalizeNotices(result.notices || []);
    sharedState.facilities = normalizeFacilities(result.facilities || []);
    writeSharedCache({ notices: sharedState.notices, facilities: sharedState.facilities });
    renderSharedInformation();
    setSharedStatus(
      `読み込み完了（連絡 ${sharedState.notices.length}件／予定 ${sharedState.facilities.length}件）`,
      false
    );
  } catch (error) {
    renderSharedInformation();
    setSharedStatus(error.message, true);
  } finally {
    sharedState.loading = false;
  }
}

function renderSharedInformation() {
  renderImportantNoticeBanner();
  renderNoticeList();
  renderFacilityCalendar();
}

function renderImportantNoticeBanner() {
  const today = formatLocalDate(new Date());
  const active = sharedState.notices
    .filter(notice => (
      ['重要', '緊急'].includes(notice.priority) &&
      notice.startDate <= today &&
      notice.endDate >= today
    ))
    .sort((a, b) => {
      const rank = { 緊急: 0, 重要: 1 };
      return (rank[a.priority] - rank[b.priority]) || b.startDate.localeCompare(a.startDate);
    });

  if (!active.length) {
    sharedEls.banner.classList.add('is-hidden');
    sharedEls.banner.innerHTML = '';
    return;
  }

  sharedEls.banner.innerHTML = `
    <div class="important-notice-heading">管理室からの重要連絡</div>
    <div class="important-notice-items">
      ${active.map(notice => `
        <article class="important-notice-item priority-${priorityClass(notice.priority)}">
          <div class="important-notice-meta">
            <span class="priority-badge">${escapeSharedHtml(notice.priority)}</span>
            <span>${escapeSharedHtml(noticeTargetText(notice))}</span>
            <span>${escapeSharedHtml(notice.startDate)} ～ ${escapeSharedHtml(notice.endDate)}</span>
          </div>
          <strong>${escapeSharedHtml(notice.title)}</strong>
          <p>${formatMultiline(notice.content)}</p>
          <small>投稿者：${escapeSharedHtml(notice.poster)}</small>
        </article>
      `).join('')}
    </div>`;
  sharedEls.banner.classList.remove('is-hidden');
}

function renderNoticeList() {
  const today = formatLocalDate(new Date());
  const notices = [...sharedState.notices].sort((a, b) => {
    const aActive = a.startDate <= today && a.endDate >= today ? 0 : a.startDate > today ? 1 : 2;
    const bActive = b.startDate <= today && b.endDate >= today ? 0 : b.startDate > today ? 1 : 2;
    const priorityRank = { 緊急: 0, 重要: 1, 通常: 2 };
    return (aActive - bActive) ||
      (priorityRank[a.priority] - priorityRank[b.priority]) ||
      b.startDate.localeCompare(a.startDate);
  });

  if (!notices.length) {
    sharedEls.noticeList.innerHTML = '<div class="shared-empty">登録されている管理室連絡はありません。</div>';
    return;
  }

  sharedEls.noticeList.innerHTML = notices.map(notice => {
    const state = notice.startDate > today ? '掲載予定' : notice.endDate < today ? '掲載終了' : '掲載中';
    return `
      <button type="button" class="shared-card notice-card priority-${priorityClass(notice.priority)}" data-notice-id="${escapeSharedHtml(notice.id)}">
        <span class="shared-card-topline">
          <span class="priority-badge">${escapeSharedHtml(notice.priority)}</span>
          <span class="publication-state">${state}</span>
        </span>
        <strong>${escapeSharedHtml(notice.title)}</strong>
        <span class="shared-card-target">対象：${escapeSharedHtml(noticeTargetText(notice))}</span>
        <span class="shared-card-period">${escapeSharedHtml(notice.startDate)} ～ ${escapeSharedHtml(notice.endDate)}</span>
        <span class="shared-card-content">${formatMultiline(notice.content)}</span>
        <small>投稿者：${escapeSharedHtml(notice.poster)}</small>
      </button>`;
  }).join('');
}

function renderFacilityCalendar() {
  if (!sharedEls.facilityCalendar) return;

  const year = sharedState.month.getFullYear();
  const month = sharedState.month.getMonth();
  sharedEls.facilityMonthPicker.value = `${year}-${String(month + 1).padStart(2, '0')}`;
  sharedEls.facilityMonthTitle.textContent = `${year}年${month + 1}月`;

  const first = new Date(year, month, 1);
  const gridStart = addLocalDays(first, -first.getDay());
  const today = formatLocalDate(new Date());
  const weekdayHeads = ['日', '月', '火', '水', '木', '金', '土']
    .map(day => `<div class="facility-weekday">${day}</div>`)
    .join('');

  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = addLocalDays(gridStart, index);
    const key = formatLocalDate(date);
    const isOtherMonth = date.getMonth() !== month;
    const dayItems = sharedState.facilities
      .filter(item => item.startDate <= key && item.endDate >= key)
      .sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99') || a.title.localeCompare(b.title));

    const itemsHtml = dayItems.map(item => {
      const time = item.startTime
        ? `${item.startTime}${item.finishTime ? `-${item.finishTime}` : ''}`
        : '';
      return `
        <button type="button" class="facility-event category-${facilityCategoryClass(item.category)}"
          data-facility-id="${escapeSharedHtml(item.id)}"
          title="${escapeSharedHtml(`${item.category} / ${item.title} / ${item.target}`)}">
          ${time ? `<span class="facility-event-time">${escapeSharedHtml(time)}</span>` : ''}
          <span class="facility-event-title">${escapeSharedHtml(item.title)}</span>
          <span class="facility-event-target">${escapeSharedHtml(item.target)}</span>
        </button>`;
    }).join('');

    return `
      <div class="facility-day${isOtherMonth ? ' other-month' : ''}${key === today ? ' today' : ''}">
        <div class="facility-date-number">${date.getDate()}</div>
        <div class="facility-day-events">${itemsHtml}</div>
      </div>`;
  }).join('');

  sharedEls.facilityCalendar.innerHTML = weekdayHeads + cells;
}

async function submitNoticeForm(event) {
  event.preventDefault();
  const payload = getNoticePayload();
  const error = validateNoticePayload(payload);
  if (error) {
    setNoticeMessage(error, true);
    return;
  }

  try {
    setNoticeMessage('保存中...', false);
    const result = hasSharedApi()
      ? await sharedApiCall(payload, 15000)
      : localSharedAction(payload);
    if (!result || result.ok === false) throw new Error((result && result.error) || '保存に失敗しました。');
    setNoticeMessage(result.message || '保存しました。', false);
    resetNoticeForm();
    await loadSharedInformation({ background: true });
  } catch (saveError) {
    setNoticeMessage(saveError.message, true);
  }
}

async function submitFacilityForm(event) {
  event.preventDefault();
  const payload = getFacilityPayload();
  const error = validateFacilityPayload(payload);
  if (error) {
    setFacilityMessage(error, true);
    return;
  }

  try {
    setFacilityMessage('保存中...', false);
    const result = hasSharedApi()
      ? await sharedApiCall(payload, 15000)
      : localSharedAction(payload);
    if (!result || result.ok === false) throw new Error((result && result.error) || '保存に失敗しました。');
    setFacilityMessage(result.message || '保存しました。', false);
    resetFacilityForm();
    await loadSharedInformation({ background: true });
  } catch (saveError) {
    setFacilityMessage(saveError.message, true);
  }
}

function getNoticePayload() {
  const mode = sharedEls.noticeMode.value;
  return {
    action: `notice${capitalizeMode(mode)}`,
    id: sharedEls.noticeId.value.trim(),
    title: sharedEls.noticeTitle.value.trim(),
    content: sharedEls.noticeContent.value.trim(),
    targetType: sharedEls.noticeTargetType.value,
    targetDetail: sharedEls.noticeTargetType.value === '全体' ? '' : sharedEls.noticeTargetDetail.value.trim(),
    priority: sharedEls.noticePriority.value,
    startDate: sharedEls.noticeStartDate.value,
    endDate: sharedEls.noticeEndDate.value,
    poster: sharedEls.noticePoster.value.trim(),
    pass: sharedEls.noticePass.value,
  };
}

function getFacilityPayload() {
  const mode = sharedEls.facilityMode.value;
  return {
    action: `facility${capitalizeMode(mode)}`,
    id: sharedEls.facilityId.value.trim(),
    category: sharedEls.facilityCategory.value,
    title: sharedEls.facilityTitle.value.trim(),
    target: sharedEls.facilityTarget.value.trim(),
    startDate: sharedEls.facilityStartDate.value,
    endDate: sharedEls.facilityEndDate.value,
    startTime: sharedEls.facilityStartTime.value,
    finishTime: sharedEls.facilityFinishTime.value,
    content: sharedEls.facilityContent.value.trim(),
    poster: sharedEls.facilityPoster.value.trim(),
    pass: sharedEls.facilityPass.value,
  };
}

function validateNoticePayload(payload) {
  const deleting = payload.action === 'noticeDelete';
  if (deleting) {
    if (!payload.id || !payload.pass) return '削除する連絡を選択し、管理パスワードを入力してください。';
    return '';
  }
  if (payload.action === 'noticeEdit' && !payload.id) return '変更する連絡を一覧から選択してください。';
  if (!payload.title || !payload.content || !payload.targetType || !payload.priority ||
      !payload.startDate || !payload.endDate || !payload.poster || !payload.pass) {
    return '必須項目を入力してください。';
  }
  if (payload.targetType !== '全体' && !payload.targetDetail) return '対象の詳細を入力してください。';
  if (payload.startDate > payload.endDate) return '掲載終了日は掲載開始日以降にしてください。';
  return '';
}

function validateFacilityPayload(payload) {
  const deleting = payload.action === 'facilityDelete';
  if (deleting) {
    if (!payload.id || !payload.pass) return '削除する予定を選択し、管理パスワードを入力してください。';
    return '';
  }
  if (payload.action === 'facilityEdit' && !payload.id) return '変更する予定を月間表から選択してください。';
  if (!payload.category || !payload.title || !payload.target || !payload.startDate ||
      !payload.endDate || !payload.poster || !payload.pass) {
    return '必須項目を入力してください。';
  }
  if (payload.startDate > payload.endDate) return '終了日は開始日以降にしてください。';
  if (Boolean(payload.startTime) !== Boolean(payload.finishTime)) return '時刻を入力する場合は、開始時刻と終了時刻の両方を入力してください。';
  if (payload.startTime && payload.startDate === payload.endDate && payload.startTime >= payload.finishTime) {
    return '終了時刻は開始時刻より後にしてください。';
  }
  return '';
}

function fillNoticeForm(id) {
  const notice = sharedState.notices.find(item => item.id === id);
  if (!notice) return;
  sharedEls.noticeMode.value = 'edit';
  sharedEls.noticeId.value = notice.id;
  sharedEls.noticeTitle.value = notice.title;
  sharedEls.noticeContent.value = notice.content;
  sharedEls.noticeTargetType.value = notice.targetType;
  sharedEls.noticeTargetDetail.value = notice.targetDetail;
  sharedEls.noticePriority.value = notice.priority;
  sharedEls.noticeStartDate.value = notice.startDate;
  sharedEls.noticeEndDate.value = notice.endDate;
  sharedEls.noticePoster.value = notice.poster;
  sharedEls.noticePass.value = '';
  updateNoticeTargetDetailVisibility();
  sharedEls.noticeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setNoticeMessage('選択した連絡を変更できます。削除する場合は操作を「削除」にしてください。', false);
}

function fillFacilityForm(id) {
  const item = sharedState.facilities.find(entry => entry.id === id);
  if (!item) return;
  sharedEls.facilityMode.value = 'edit';
  sharedEls.facilityId.value = item.id;
  sharedEls.facilityCategory.value = item.category;
  sharedEls.facilityTitle.value = item.title;
  sharedEls.facilityTarget.value = item.target;
  sharedEls.facilityStartDate.value = item.startDate;
  sharedEls.facilityEndDate.value = item.endDate;
  sharedEls.facilityStartTime.value = item.startTime;
  sharedEls.facilityFinishTime.value = item.finishTime;
  sharedEls.facilityContent.value = item.content;
  sharedEls.facilityPoster.value = item.poster;
  sharedEls.facilityPass.value = '';
  sharedEls.facilityForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setFacilityMessage('選択した予定を変更できます。削除する場合は操作を「削除」にしてください。', false);
}

function resetNoticeForm() {
  sharedEls.noticeForm.reset();
  const today = new Date();
  sharedEls.noticeMode.value = 'new';
  sharedEls.noticeId.value = '';
  sharedEls.noticeTargetType.value = '全体';
  sharedEls.noticePriority.value = '通常';
  sharedEls.noticeStartDate.value = formatLocalDate(today);
  sharedEls.noticeEndDate.value = formatLocalDate(addLocalDays(today, 30));
  sharedEls.noticePass.value = '';
  updateNoticeTargetDetailVisibility();
  setNoticeMessage('連絡内容を入力してください。', false);
}

function resetFacilityForm() {
  sharedEls.facilityForm.reset();
  const today = formatLocalDate(new Date());
  sharedEls.facilityMode.value = 'new';
  sharedEls.facilityId.value = '';
  sharedEls.facilityCategory.value = '付帯設備メンテ';
  sharedEls.facilityStartDate.value = today;
  sharedEls.facilityEndDate.value = today;
  sharedEls.facilityPass.value = '';
  setFacilityMessage('予定を入力してください。', false);
}

function updateNoticeTargetDetailVisibility() {
  const needsDetail = sharedEls.noticeTargetType.value !== '全体';
  sharedEls.noticeTargetDetailLabel.classList.toggle('is-hidden', !needsDetail);
  sharedEls.noticeTargetDetail.required = needsDetail;
  if (!needsDetail) sharedEls.noticeTargetDetail.value = '';
  sharedEls.noticeTargetDetail.placeholder = sharedEls.noticeTargetType.value === '特定装置'
    ? '例：MOVPE #7'
    : '例：除害装置、排気設備';
}

function moveFacilityMonth(delta) {
  sharedState.month = new Date(
    sharedState.month.getFullYear(),
    sharedState.month.getMonth() + delta,
    1
  );
  renderFacilityCalendar();
}

function normalizeNotices(rows) {
  return rows.map(row => ({
    id: String(row.id || '').trim(),
    title: String(row.title || '').trim(),
    content: String(row.content || '').trim(),
    targetType: ['全体', '特定装置', '付帯設備'].includes(String(row.targetType || '')) ? String(row.targetType) : '全体',
    targetDetail: String(row.targetDetail || '').trim(),
    priority: ['通常', '重要', '緊急'].includes(String(row.priority || '')) ? String(row.priority) : '通常',
    startDate: normalizeSharedDate(row.startDate),
    endDate: normalizeSharedDate(row.endDate),
    poster: String(row.poster || '').trim(),
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || ''),
  })).filter(row => row.id && row.title && row.startDate && row.endDate);
}

function normalizeFacilities(rows) {
  return rows.map(row => ({
    id: String(row.id || '').trim(),
    category: ['付帯設備メンテ', 'ガス交換'].includes(String(row.category || '')) ? String(row.category) : '付帯設備メンテ',
    title: String(row.title || '').trim(),
    target: String(row.target || '').trim(),
    startDate: normalizeSharedDate(row.startDate),
    endDate: normalizeSharedDate(row.endDate),
    startTime: normalizeSharedTime(row.startTime),
    finishTime: normalizeSharedTime(row.finishTime),
    content: String(row.content || '').trim(),
    poster: String(row.poster || '').trim(),
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || ''),
  })).filter(row => row.id && row.title && row.startDate && row.endDate);
}

function normalizeSharedDate(value) {
  const text = String(value || '').trim().replace(/\//g, '-');
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return '';
  return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
}

function normalizeSharedTime(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
}

function noticeTargetText(notice) {
  return notice.targetType === '全体'
    ? '全体'
    : `${notice.targetType}：${notice.targetDetail || '未指定'}`;
}

function priorityClass(priority) {
  if (priority === '緊急') return 'emergency';
  if (priority === '重要') return 'important';
  return 'normal';
}

function facilityCategoryClass(category) {
  return category === 'ガス交換' ? 'gas' : 'maintenance';
}

function capitalizeMode(mode) {
  if (mode === 'edit') return 'Edit';
  if (mode === 'delete') return 'Delete';
  return 'New';
}

function setSharedStatus(text, isError) {
  setNoticeMessage(text, isError);
  setFacilityMessage(text, isError);
}

function setNoticeMessage(text, isError) {
  sharedEls.noticeStatus.textContent = `メッセージ：${text}`;
  sharedEls.noticeStatus.classList.toggle('error', Boolean(isError));
}

function setFacilityMessage(text, isError) {
  sharedEls.facilityStatus.textContent = `メッセージ：${text}`;
  sharedEls.facilityStatus.classList.toggle('error', Boolean(isError));
}

function hasSharedApi() {
  return typeof API_URL !== 'undefined' && /^https:\/\//.test(String(API_URL || '').trim());
}

function sharedApiCall(params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const callbackName = `__moroomSharedJsonp_${Date.now()}_${sharedState.jsonpSeq++}`;
    const script = document.createElement('script');
    const query = new URLSearchParams({ ...params, callback: callbackName, _: String(Date.now()) });
    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      delete window[callbackName];
      script.remove();
    };

    window[callbackName] = data => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Google Apps Scriptとの通信に失敗しました。'));
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Google Apps Scriptからの応答がタイムアウトしました。'));
    }, timeoutMs || 15000);

    script.src = `${String(API_URL).replace(/\?+$/, '')}?${query.toString()}`;
    document.head.appendChild(script);
  });
}

function readSharedCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHARED_CACHE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.notices) || !Array.isArray(parsed.facilities)) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function writeSharedCache(value) {
  try {
    localStorage.setItem(SHARED_CACHE_KEY, JSON.stringify(value));
  } catch (error) {
    // 保存容量やブラウザ設定で失敗しても、画面表示は継続する。
  }
}

function readSharedLocalStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHARED_LOCAL_KEY) || 'null');
    if (parsed && Array.isArray(parsed.notices) && Array.isArray(parsed.facilities)) {
      return { ok: true, notices: parsed.notices, facilities: parsed.facilities };
    }
  } catch (error) {
    // 破損データは初期化する。
  }
  return { ok: true, notices: [], facilities: [] };
}

function writeSharedLocalStore(store) {
  localStorage.setItem(SHARED_LOCAL_KEY, JSON.stringify(store));
}

function localSharedAction(payload) {
  const store = readSharedLocalStore();
  const now = new Date().toISOString();

  if (payload.action.startsWith('notice')) {
    const rows = store.notices;
    if (payload.action === 'noticeNew') {
      const record = { ...payload, id: makeLocalSharedId('N'), passHash: payload.pass, createdAt: now, updatedAt: now };
      delete record.action;
      delete record.pass;
      rows.push(record);
      writeSharedLocalStore(store);
      return { ok: true, message: '管理室連絡を登録しました。' };
    }
    const index = rows.findIndex(row => row.id === payload.id);
    if (index < 0) return { ok: false, error: '対象の管理室連絡が見つかりません。' };
    if (rows[index].passHash !== payload.pass) return { ok: false, error: '管理パスワードが違います。' };
    if (payload.action === 'noticeDelete') {
      rows.splice(index, 1);
      writeSharedLocalStore(store);
      return { ok: true, message: '管理室連絡を削除しました。' };
    }
    const updated = { ...rows[index], ...payload, updatedAt: now };
    delete updated.action;
    delete updated.pass;
    rows[index] = updated;
    writeSharedLocalStore(store);
    return { ok: true, message: '管理室連絡を更新しました。' };
  }

  const rows = store.facilities;
  if (payload.action === 'facilityNew') {
    const record = { ...payload, id: makeLocalSharedId('F'), passHash: payload.pass, createdAt: now, updatedAt: now };
    delete record.action;
    delete record.pass;
    rows.push(record);
    writeSharedLocalStore(store);
    return { ok: true, message: '付帯設備・ガス交換予定を登録しました。' };
  }
  const index = rows.findIndex(row => row.id === payload.id);
  if (index < 0) return { ok: false, error: '対象の予定が見つかりません。' };
  if (rows[index].passHash !== payload.pass) return { ok: false, error: '管理パスワードが違います。' };
  if (payload.action === 'facilityDelete') {
    rows.splice(index, 1);
    writeSharedLocalStore(store);
    return { ok: true, message: '付帯設備・ガス交換予定を削除しました。' };
  }
  const updated = { ...rows[index], ...payload, updatedAt: now };
  delete updated.action;
  delete updated.pass;
  rows[index] = updated;
  writeSharedLocalStore(store);
  return { ok: true, message: '付帯設備・ガス交換予定を更新しました。' };
}

function makeLocalSharedId(prefix) {
  return prefix + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function formatLocalDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function addLocalDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatMultiline(value) {
  return escapeSharedHtml(value).replace(/\n/g, '<br>');
}

function escapeSharedHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
