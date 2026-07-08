// Google Apps Script backend for the GitHub Pages reservation site.
// 1) Googleスプレッドシートを作成する。
// 2) 拡張機能 > Apps Script にこのコードを貼る。
// 3) 初回だけ setup() を1回実行する。
//    既に予約データが入っている場合は setup() を実行しないでください。データが消えます。
// 4) デプロイ > 新しいデプロイ > ウェブアプリ
//    次のユーザーとして実行: 自分
//    アクセスできるユーザー: 全員
// 5) 発行された Web App URL を config.js の API_URL に貼る。

const SHEET_NAME = 'Reservations';
const HEADERS = ['id', 'equipment', 'name', 'date', 'start', 'finish', 'usageTime', 'usage', 'remark', 'passHash', 'createdAt', 'updatedAt', 'maintenanceTypes'];
const ALLOWED_EQUIPMENTS = ['MOVPE 豊田中研', 'MOVPE #4', 'MOVPE #5', 'MOVPE #7', 'MOVPE #11', 'MOVPE #12'];
const ALLOWED_MAINTENANCE_TYPES = ['エピ', '原料交換', '重故障', '除害停止', '定常メンテ'];

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  sheet.clear();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
}

function doGet(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = e.parameter || {};
    const action = p.action || 'list';
    let result;
    if (action === 'list') result = listReservations();
    else if (action === 'new') result = createReservation(p);
    else if (action === 'edit') result = editReservation(p);
    else if (action === 'delete') result = deleteReservation(p);
    else result = { ok: false, error: '不明な操作です。' };
    return output_(result, p.callback);
  } catch (err) {
    return output_({ ok: false, error: String(err.message || err) }, (e.parameter || {}).callback);
  } finally {
    lock.releaseLock();
  }
}

function listReservations() {
  const rows = getRows_();
  const reservations = rows.map(rowToObject_).map(({ passHash, ...rest }) => rest);
  return { ok: true, reservations };
}

function createReservation(p) {
  const data = normalize_(p);
  const error = validate_(data, false);
  if (error) return { ok: false, error };
  const rows = getRows_().map(rowToObject_);
  if (rows.some(r => overlaps_(r, data))) return { ok: false, error: '同じ装置・日付・時間帯で予約が重複しています。' };
  const now = new Date().toISOString();
  const record = {
    id: makeId_(),
    equipment: data.equipment,
    name: data.name,
    date: data.date,
    start: data.start,
    finish: data.finish,
    usageTime: data.usageTime || durationText_(data.start, data.finish),
    usage: data.usage,
    remark: data.remark,
    passHash: hash_(data.pass),
    createdAt: now,
    updatedAt: now,
    maintenanceTypes: data.maintenanceTypes,
  };
  getSheet_().appendRow(HEADERS.map(h => record[h] || ''));
  return { ok: true, message: '予約を作成しました。', id: record.id };
}

function editReservation(p) {
  const data = normalize_(p);
  const error = validate_(data, true);
  if (error) return { ok: false, error };
  const sheet = getSheet_();
  const rows = getRows_().map(rowToObject_);
  const idx = rows.findIndex(r => r.id === data.id);
  if (idx < 0) return { ok: false, error: '対象予約が見つかりません。' };
  if (rows[idx].passHash !== hash_(data.pass)) return { ok: false, error: 'パスワードが違います。' };
  if (rows.some((r, i) => i !== idx && overlaps_(r, data))) return { ok: false, error: '同じ装置・日付・時間帯で予約が重複しています。' };
  const updated = {
    ...rows[idx],
    equipment: data.equipment,
    name: data.name,
    date: data.date,
    start: data.start,
    finish: data.finish,
    usageTime: data.usageTime || durationText_(data.start, data.finish),
    usage: data.usage,
    remark: data.remark,
    maintenanceTypes: data.maintenanceTypes,
    updatedAt: new Date().toISOString(),
  };
  sheet.getRange(idx + 2, 1, 1, HEADERS.length).setValues([HEADERS.map(h => updated[h] || '')]);
  return { ok: true, message: '予約を更新しました。' };
}

function deleteReservation(p) {
  const id = String(p.id || '').trim();
  const pass = String(p.pass || '');
  if (!id || !pass) return { ok: false, error: 'IDとパスワードが必要です。' };
  const sheet = getSheet_();
  const rows = getRows_().map(rowToObject_);
  const idx = rows.findIndex(r => r.id === id);
  if (idx < 0) return { ok: false, error: '対象予約が見つかりません。' };
  if (rows[idx].passHash !== hash_(pass)) return { ok: false, error: 'パスワードが違います。' };
  sheet.deleteRow(idx + 2);
  return { ok: true, message: '予約を削除しました。' };
}

function normalize_(p) {
  return {
    id: String(p.id || '').trim(),
    equipment: String(p.equipment || '').trim(),
    name: String(p.name || '').trim(),
    date: String(p.date || '').trim(),
    start: String(p.start || '').trim(),
    finish: String(p.finish || '').trim(),
    usageTime: String(p.usageTime || '').trim(),
    usage: String(p.usage || '').trim(),
    remark: String(p.remark || '').trim(),
    maintenanceTypes: normalizeMaintenanceTypes_(p.maintenanceTypes || ''),
    pass: String(p.pass || ''),
  };
}

function validate_(d, needsId) {
  if (needsId && !d.id) return 'IDが必要です。';
  if (ALLOWED_EQUIPMENTS.indexOf(d.equipment) === -1) return '登録されていない装置名です。メンテ情報タブは表示専用です。装置欄では実際の装置を選んでください。';
  if (!d.equipment || !d.name || !d.date || !d.start || !d.finish || !d.pass) return '必須項目を入力してください。パスワードも必要です。';
  if (d.start >= d.finish) return '終了時刻は開始時刻より後にしてください。';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return '日付の形式が不正です。';
  if (!/^\d{2}:\d{2}$/.test(d.start) || !/^\d{2}:\d{2}$/.test(d.finish)) return '時刻の形式が不正です。';
  return '';
}

function overlaps_(a, b) {
  return a.equipment === b.equipment && a.date === b.date && b.start < a.finish && b.finish > a.start;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  let current = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || ''));
  if (!current[0]) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    return;
  }
  // 旧版のシートでは finish の次が usage だったため、その間に usageTime 列を追加する。
  if (current[0] === 'id' && current[5] === 'finish' && current[6] === 'usage') {
    sheet.insertColumnAfter(6);
    current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(v => String(v || ''));
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
}

function getRows_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
}

function rowToObject_(row) {
  const obj = {};
  HEADERS.forEach((h, i) => obj[h] = String(row[i] || ''));
  if (!obj.usageTime) obj.usageTime = durationText_(obj.start, obj.finish);
  obj.maintenanceTypes = normalizeMaintenanceTypes_(obj.maintenanceTypes || '');
  return obj;
}

function normalizeMaintenanceTypes_(value) {
  const allowed = ALLOWED_MAINTENANCE_TYPES;
  const seen = {};
  const parts = String(value || '')
    .split(/[、,，]/)
    .map(v => canonicalMaintenanceType_(v.trim()))
    .filter(v => allowed.indexOf(v) !== -1)
    .filter(v => {
      if (seen[v]) return false;
      seen[v] = true;
      return true;
    });
  if (parts.indexOf('エピ') !== -1) return 'エピ';
  return parts.join('、');
}

function canonicalMaintenanceType_(value) {
  const v = String(value || '').trim();
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

function hash_(value) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(raw);
}

function makeId_() {
  return 'R' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function durationText_(start, finish) {
  const s = timeToMinutes_(start);
  const f = timeToMinutes_(finish);
  if (s === null || f === null || f <= s) return '';
  const diff = f - s;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h && m) return h + '時間' + m + '分';
  if (h) return h + '時間';
  return m + '分';
}

function timeToMinutes_(value) {
  if (!/^\d{2}:\d{2}$/.test(value || '')) return null;
  const parts = value.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

function output_(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
