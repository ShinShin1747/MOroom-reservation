// Google Apps Script backend for the GitHub Pages reservation site.
// 1) Create a Google Spreadsheet.
// 2) Extensions > Apps Script にこのコードを貼る。
// 3) setup() を1回実行する。
// 4) Deploy > New deployment > Web app
//    Execute as: Me
//    Who has access: Anyone
// 5) 発行された Web App URL を config.js の API_URL に貼る。

const SHEET_NAME = 'Reservations';
const HEADERS = ['id', 'equipment', 'name', 'date', 'start', 'finish', 'usage', 'remark', 'passHash', 'createdAt', 'updatedAt'];

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
    else result = { ok: false, error: 'Unknown action.' };
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
    usage: data.usage,
    remark: data.remark,
    passHash: hash_(data.pass),
    createdAt: now,
    updatedAt: now,
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
  if (rows[idx].passHash !== hash_(data.pass)) return { ok: false, error: 'Passが違います。' };
  if (rows.some((r, i) => i !== idx && overlaps_(r, data))) return { ok: false, error: '同じ装置・日付・時間帯で予約が重複しています。' };
  const updated = {
    ...rows[idx],
    equipment: data.equipment,
    name: data.name,
    date: data.date,
    start: data.start,
    finish: data.finish,
    usage: data.usage,
    remark: data.remark,
    updatedAt: new Date().toISOString(),
  };
  sheet.getRange(idx + 2, 1, 1, HEADERS.length).setValues([HEADERS.map(h => updated[h] || '')]);
  return { ok: true, message: '予約を更新しました。' };
}

function deleteReservation(p) {
  const id = String(p.id || '').trim();
  const pass = String(p.pass || '');
  if (!id || !pass) return { ok: false, error: 'IDとPassが必要です。' };
  const sheet = getSheet_();
  const rows = getRows_().map(rowToObject_);
  const idx = rows.findIndex(r => r.id === id);
  if (idx < 0) return { ok: false, error: '対象予約が見つかりません。' };
  if (rows[idx].passHash !== hash_(pass)) return { ok: false, error: 'Passが違います。' };
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
    usage: String(p.usage || '').trim(),
    remark: String(p.remark || '').trim(),
    pass: String(p.pass || ''),
  };
}

function validate_(d, needsId) {
  if (needsId && !d.id) return 'IDが必要です。';
  if (!d.equipment || !d.name || !d.date || !d.start || !d.finish || !d.usage || !d.pass) return '必須項目を入力してください。';
  if (d.start >= d.finish) return 'FinishはStartより後にしてください。';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'Dateの形式が不正です。';
  if (!/^\d{2}:\d{2}$/.test(d.start) || !/^\d{2}:\d{2}$/.test(d.finish)) return '時刻の形式が不正です。';
  return '';
}

function overlaps_(a, b) {
  return a.equipment === b.equipment && a.date === b.date && b.start < a.finish && b.finish > a.start;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sheet;
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
  return obj;
}

function hash_(value) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(raw);
}

function makeId_() {
  return 'R' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function output_(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
