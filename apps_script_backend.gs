// Google Apps Script backend for MOroom reservation site.
// Version: strict-overlap-v3
//
// 重要:
// - Apps Script のコードエディタにそのまま貼ってください。
// - function myFunction() { ... } の中には入れないでください。
// - 既存データがある場合、setup() は再実行しないでください。
// - 貼り替え後は「デプロイを管理」→ 鉛筆 →「新バージョン」→ デプロイしてください。
//
// この版で直すこと:
// - 同じ装置・同じ日付・重なる時間帯の二重予約を必ず拒否する。
// - Google Sheets が日付/時刻を勝手に型変換しても、YYYY-MM-DD / HH:mm に正規化して表示できるようにする。
// - action=debug で、現在Apps Scriptが見ているシートと予約件数を確認できるようにする。

const BACKEND_VERSION = 'strict-overlap-email-content-tab-v5';
const SHEET_NAME = 'Reservations';

const HEADERS = [
  'id',
  'equipment',
  'name',
  'date',
  'start',
  'finish',
  'usageTime',
  'usage',
  'remark',
  'passHash',
  'createdAt',
  'updatedAt',
  'maintenanceTypes'
];

const ALLOWED_EQUIPMENTS = [
  'MOVPE 豊田中研',
  'MOVPE #4',
  'MOVPE #5',
  'MOVPE #7',
  'MOVPE #10',
  'MOVPE #11',
  'MOVPE #12'
];

const ALLOWED_MAINTENANCE_TYPES = [
  'エピ',
  '原料交換',
  '重故障',
  '除害停止',
  '定常メンテ'
];

// Gmail / Google Groups mail content settings.
// このWebアプリを公開状態で使う場合、ここにパスワードを入れるとメール表示だけを保護できます。
// 例: const EMAIL_VIEW_PASSWORD = 'your-password';
// 空欄の場合、サイトを開ける人はメールまとめも読めます。
const EMAIL_GROUP_ADDRESS = 'users_movpe7@googlegroups.com';
const EMAIL_GROUP_LIST_ID = 'users_movpe7.googlegroups.com';
const EMAIL_VIEW_PASSWORD = '';
const EMAIL_MAX_THREADS = 500;
const EMAIL_MAX_MESSAGES = 1000;
const EMAIL_BODY_CHAR_LIMIT = 5000;
const EMAIL_SEARCH_QUERIES = [
  'to:' + EMAIL_GROUP_ADDRESS,
  'cc:' + EMAIL_GROUP_ADDRESS,
  'list:' + EMAIL_GROUP_LIST_ID,
  '"' + EMAIL_GROUP_ADDRESS + '"'
];


function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  formatAsText_(sheet);
}

function doGet(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const p = e.parameter || {};
    const action = String(p.action || 'list');

    let result;

    if (action === 'list') {
      result = listReservations();
    } else if (action === 'new') {
      result = createReservation(p);
    } else if (action === 'edit') {
      result = editReservation(p);
    } else if (action === 'delete') {
      result = deleteReservation(p);
    } else if (action === 'emailList') {
      result = listEmailReservations_(p);
    } else if (action === 'debug') {
      result = debugInfo_();
    } else {
      result = {
        ok: false,
        error: '不明な操作です。'
      };
    }

    return output_(result, p.callback);
  } catch (err) {
    return output_(
      {
        ok: false,
        error: String(err && err.message ? err.message : err),
        version: BACKEND_VERSION
      },
      (e.parameter || {}).callback
    );
  } finally {
    lock.releaseLock();
  }
}

function listReservations() {
  const reservations = getReservationObjects_()
    .map(({ passHash, ...rest }) => rest);

  return {
    ok: true,
    version: BACKEND_VERSION,
    reservations
  };
}

function createReservation(p) {
  const data = normalize_(p);
  const error = validate_(data, false);

  if (error) {
    return {
      ok: false,
      version: BACKEND_VERSION,
      error
    };
  }

  const rows = getReservationObjects_();
  const conflict = rows.find(r => overlaps_(r, data));

  if (conflict) {
    return {
      ok: false,
      version: BACKEND_VERSION,
      error: '同じ装置・日付・時間帯で予約が重複しています。既存予約: ' + conflict.date + ' ' + conflict.start + '-' + conflict.finish + ' / ' + conflict.name,
      conflict: publicReservation_(conflict)
    };
  }

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
    maintenanceTypes: data.maintenanceTypes
  };

  appendRecord_(record);

  return {
    ok: true,
    version: BACKEND_VERSION,
    message: '予約を作成しました。',
    id: record.id
  };
}

function editReservation(p) {
  const data = normalize_(p);
  const error = validate_(data, true);

  if (error) {
    return {
      ok: false,
      version: BACKEND_VERSION,
      error
    };
  }

  const sheet = getSheet_();
  const rows = getReservationObjects_();
  const idx = rows.findIndex(r => r.id === data.id);

  if (idx < 0) {
    return {
      ok: false,
      version: BACKEND_VERSION,
      error: '対象予約が見つかりません。'
    };
  }

  if (rows[idx].passHash !== hash_(data.pass)) {
    return {
      ok: false,
      version: BACKEND_VERSION,
      error: 'パスワードが違います。'
    };
  }

  const conflict = rows.find((r, i) => i !== idx && overlaps_(r, data));

  if (conflict) {
    return {
      ok: false,
      version: BACKEND_VERSION,
      error: '同じ装置・日付・時間帯で予約が重複しています。既存予約: ' + conflict.date + ' ' + conflict.start + '-' + conflict.finish + ' / ' + conflict.name,
      conflict: publicReservation_(conflict)
    };
  }

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
    updatedAt: new Date().toISOString()
  };

  const range = sheet.getRange(idx + 2, 1, 1, HEADERS.length);
  range.setNumberFormat('@');
  range.setValues([HEADERS.map(h => String(updated[h] || ''))]);

  return {
    ok: true,
    version: BACKEND_VERSION,
    message: '予約を更新しました。'
  };
}

function deleteReservation(p) {
  const id = String(p.id || '').trim();
  const pass = String(p.pass || '');

  if (!id || !pass) {
    return {
      ok: false,
      version: BACKEND_VERSION,
      error: 'IDとパスワードが必要です。'
    };
  }

  const sheet = getSheet_();
  const rows = getReservationObjects_();
  const idx = rows.findIndex(r => r.id === id);

  if (idx < 0) {
    return {
      ok: false,
      version: BACKEND_VERSION,
      error: '対象予約が見つかりません。'
    };
  }

  if (rows[idx].passHash !== hash_(pass)) {
    return {
      ok: false,
      version: BACKEND_VERSION,
      error: 'パスワードが違います。'
    };
  }

  sheet.deleteRow(idx + 2);

  return {
    ok: true,
    version: BACKEND_VERSION,
    message: '予約を削除しました。'
  };
}

function normalize_(p) {
  return {
    id: String(p.id || '').trim(),
    equipment: normalizeEquipment_(p.equipment),
    name: String(p.name || '').trim(),
    date: normalizeDateString_(p.date),
    start: normalizeTimeString_(p.start),
    finish: normalizeTimeString_(p.finish),
    usageTime: String(p.usageTime || '').trim(),
    usage: String(p.usage || '').trim(),
    remark: String(p.remark || '').trim(),
    maintenanceTypes: normalizeMaintenanceTypes_(p.maintenanceTypes || ''),
    pass: String(p.pass || '')
  };
}

function validate_(d, needsId) {
  if (needsId && !d.id) {
    return 'IDが必要です。';
  }

  if (ALLOWED_EQUIPMENTS.indexOf(d.equipment) === -1) {
    return '登録されていない装置名です。メンテ情報タブは表示専用です。装置欄では実際の装置を選んでください。';
  }

  if (!d.equipment || !d.name || !d.date || !d.start || !d.finish || !d.pass) {
    return '必須項目を入力してください。パスワードも必要です。';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
    return '日付の形式が不正です。';
  }

  if (!/^\d{2}:\d{2}$/.test(d.start) || !/^\d{2}:\d{2}$/.test(d.finish)) {
    return '時刻の形式が不正です。';
  }

  if (timeToMinutes_(d.start) === null || timeToMinutes_(d.finish) === null) {
    return '時刻の形式が不正です。';
  }

  if (timeToMinutes_(d.start) >= timeToMinutes_(d.finish)) {
    return '終了時刻は開始時刻より後にしてください。';
  }

  if (!d.maintenanceTypes) {
    return '使用目的は、メンテまたはエピのどちらかを必ず選択してください。メンテの場合は原料交換・重故障・除害停止・定常メンテから1つ以上選択してください。';
  }

  return '';
}

function overlaps_(a, b) {
  const aStart = timeToMinutes_(a.start);
  const aFinish = timeToMinutes_(a.finish);
  const bStart = timeToMinutes_(b.start);
  const bFinish = timeToMinutes_(b.finish);

  if (aStart === null || aFinish === null || bStart === null || bFinish === null) {
    return false;
  }

  return (
    normalizeEquipment_(a.equipment) === normalizeEquipment_(b.equipment) &&
    normalizeDateString_(a.date) === normalizeDateString_(b.date) &&
    bStart < aFinish &&
    bFinish > aStart
  );
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error('SpreadsheetApp.getActiveSpreadsheet() が取得できません。このApps ScriptはGoogleスプレッドシートに紐づけて作成してください。');
  }

  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  ensureHeaders_(sheet);

  return sheet;
}

function ensureHeaders_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);

  let current = sheet
    .getRange(1, 1, 1, lastCol)
    .getDisplayValues()[0]
    .map(v => String(v || ''));

  if (!current[0]) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    formatAsText_(sheet);
    return;
  }

  // 旧版のシートでは finish の次が usage だったため、その間に usageTime 列を追加する。
  if (current[0] === 'id' && current[5] === 'finish' && current[6] === 'usage') {
    sheet.insertColumnAfter(6);
    current = sheet
      .getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1))
      .getDisplayValues()[0]
      .map(v => String(v || ''));
  }

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  formatAsText_(sheet);
}

function formatAsText_(sheet) {
  const maxRows = Math.max(sheet.getMaxRows(), 1);
  sheet.getRange(1, 1, maxRows, HEADERS.length).setNumberFormat('@');
}

function getReservationObjects_() {
  const rows = getRows_();

  return rows
    .map(rowToObject_)
    .filter(r => r.id && r.equipment && r.date && r.start && r.finish);
}

function getRows_() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const valueRows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const displayRows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getDisplayValues();

  return valueRows.map((row, rowIndex) => row.map((value, colIndex) => ({
    value: value,
    display: displayRows[rowIndex][colIndex]
  })));
}

function appendRecord_(record) {
  const sheet = getSheet_();
  const rowNumber = sheet.getLastRow() + 1;
  const range = sheet.getRange(rowNumber, 1, 1, HEADERS.length);

  range.setNumberFormat('@');
  range.setValues([HEADERS.map(h => String(record[h] || ''))]);
}

function rowToObject_(row) {
  const obj = {};

  HEADERS.forEach((h, i) => {
    obj[h] = normalizeCell_(h, row[i]);
  });

  obj.equipment = normalizeEquipment_(obj.equipment);
  obj.date = normalizeDateString_(obj.date);
  obj.start = normalizeTimeString_(obj.start);
  obj.finish = normalizeTimeString_(obj.finish);
  obj.maintenanceTypes = normalizeMaintenanceTypes_(obj.maintenanceTypes || '');

  if (!obj.usageTime) {
    obj.usageTime = durationText_(obj.start, obj.finish);
  }

  return obj;
}

function normalizeCell_(header, cell) {
  const value = cell && Object.prototype.hasOwnProperty.call(cell, 'value') ? cell.value : cell;
  const display = cell && Object.prototype.hasOwnProperty.call(cell, 'display') ? cell.display : '';

  if (value instanceof Date) {
    const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';

    if (header === 'date') {
      return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
    }

    if (header === 'start' || header === 'finish') {
      return Utilities.formatDate(value, tz, 'HH:mm');
    }

    return Utilities.formatDate(value, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
  }

  if (typeof value === 'number') {
    if (header === 'start' || header === 'finish') {
      const totalMinutes = Math.round(value * 24 * 60);
      const h = Math.floor(totalMinutes / 60) % 24;
      const m = totalMinutes % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }

    return String(value).trim();
  }

  const raw = String(value || '').trim();
  const shown = String(display || '').trim();

  return raw || shown;
}

function normalizeEquipment_(value) {
  return String(value || '')
    .replace(/ＭＯＶＰＥ/g, 'MOVPE')
    .replace(/＃/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDateString_(value) {
  const raw = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const slash = raw.match(/^(\d{4})[\/\.年-](\d{1,2})[\/\.月-](\d{1,2})日?$/);

  if (slash) {
    return [
      slash[1],
      String(slash[2]).padStart(2, '0'),
      String(slash[3]).padStart(2, '0')
    ].join('-');
  }

  const parsed = new Date(raw);

  if (!Number.isNaN(parsed.getTime())) {
    const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
    return Utilities.formatDate(parsed, tz, 'yyyy-MM-dd');
  }

  return raw;
}

function normalizeTimeString_(value) {
  const raw = String(value || '').trim();

  const hhmm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);

  if (hhmm) {
    return String(hhmm[1]).padStart(2, '0') + ':' + hhmm[2];
  }

  const jp = raw.match(/^(\d{1,2})時(?:(\d{1,2})分?)?$/);

  if (jp) {
    return String(jp[1]).padStart(2, '0') + ':' + String(jp[2] || '0').padStart(2, '0');
  }

  return raw;
}

function normalizeMaintenanceTypes_(value) {
  const allowed = ALLOWED_MAINTENANCE_TYPES;
  const seen = {};

  const parts = String(value || '')
    .split(/[、,，]/)
    .map(v => canonicalMaintenanceType_(v.trim()))
    .filter(v => allowed.indexOf(v) !== -1)
    .filter(v => {
      if (seen[v]) {
        return false;
      }

      seen[v] = true;
      return true;
    });

  if (parts.indexOf('エピ') !== -1) {
    return 'エピ';
  }

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
    '原料': '原料交換'
  };

  return map[v] || v;
}

function hash_(value) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );

  return Utilities.base64Encode(raw);
}

function makeId_() {
  return (
    'R' +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}

function durationText_(start, finish) {
  const s = timeToMinutes_(start);
  const f = timeToMinutes_(finish);

  if (s === null || f === null || f <= s) {
    return '';
  }

  const diff = f - s;
  const h = Math.floor(diff / 60);
  const m = diff % 60;

  if (h && m) {
    return h + '時間' + m + '分';
  }

  if (h) {
    return h + '時間';
  }

  return m + '分';
}

function timeToMinutes_(value) {
  const raw = String(value || '').trim();

  if (!/^\d{2}:\d{2}$/.test(raw)) {
    return null;
  }

  const parts = raw.split(':').map(Number);

  if (parts[0] < 0 || parts[0] > 23 || parts[1] < 0 || parts[1] > 59) {
    return null;
  }

  return parts[0] * 60 + parts[1];
}



function listEmailReservations_(p) {
  const passError = validateEmailViewPassword_(p.emailPass || '');
  if (passError) {
    return {
      ok: false,
      version: BACKEND_VERSION,
      error: passError
    };
  }

  const threadsById = {};
  EMAIL_SEARCH_QUERIES.forEach(query => {
    try {
      const threads = GmailApp.search(query, 0, EMAIL_MAX_THREADS);
      threads.forEach(thread => {
        threadsById[thread.getId()] = thread;
      });
    } catch (err) {
      // Gmailの検索構文差異で一部クエリが失敗しても、他のクエリで続行する。
    }
  });

  const messages = [];
  Object.keys(threadsById).forEach(threadId => {
    const thread = threadsById[threadId];
    thread.getMessages().forEach(message => {
      if (messages.length >= EMAIL_MAX_MESSAGES) return;
      if (isMovpeGroupMessage_(message)) {
        messages.push(message);
      }
    });
  });

  messages.sort((a, b) => b.getDate().getTime() - a.getDate().getTime());

  const emailMessages = messages.slice(0, EMAIL_MAX_MESSAGES).map(messageToEmailMessage_);

  return {
    ok: true,
    version: BACKEND_VERSION,
    groupAddress: EMAIL_GROUP_ADDRESS,
    query: EMAIL_SEARCH_QUERIES.join(' OR '),
    count: emailMessages.length,
    emailMessages: emailMessages,
    // 旧フロントとの互換用
    emailReservations: emailMessages
  };
}

function validateEmailViewPassword_(value) {
  if (!EMAIL_VIEW_PASSWORD) return '';
  if (String(value || '') === String(EMAIL_VIEW_PASSWORD)) return '';
  return 'メール表示パスワードが違います。';
}

function isMovpeGroupMessage_(message) {
  const target = EMAIL_GROUP_ADDRESS.toLowerCase();
  const listId = EMAIL_GROUP_LIST_ID.toLowerCase();
  const fields = [
    message.getTo(),
    message.getCc(),
    message.getBcc(),
    message.getReplyTo(),
    message.getFrom(),
    message.getSubject()
  ].join('\n').toLowerCase();

  if (fields.indexOf(target) !== -1) return true;

  // Google Groups経由のメールでは本文やヘッダ表示にグループアドレス/リストIDが残る場合がある。
  const bodyHead = String(message.getPlainBody() || '').slice(0, 3000).toLowerCase();
  return bodyHead.indexOf(target) !== -1 || bodyHead.indexOf(listId) !== -1;
}

function messageToEmailMessage_(message) {
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  const subject = String(message.getSubject() || '');
  const from = String(message.getFrom() || '');
  const to = String(message.getTo() || '');
  const cc = String(message.getCc() || '');
  const body = cleanEmailBody_(message.getPlainBody() || '');
  const receivedAt = Utilities.formatDate(message.getDate(), tz, 'yyyy-MM-dd HH:mm');
  const messageIdHeader = getMessageHeaderSafe_(message, 'Message-ID');

  return {
    emailId: message.getId(),
    threadId: message.getThread().getId(),
    receivedAt: receivedAt,
    from: from,
    to: to,
    cc: cc,
    subject: subject,
    summary: makeEmailSummary_(subject, body),
    snippet: body.slice(0, 500),
    body: body.slice(0, EMAIL_BODY_CHAR_LIMIT),
    url: 'https://mail.google.com/mail/u/0/#search/rfc822msgid:' + encodeURIComponent(messageIdHeader || message.getId())
  };
}

function makeEmailSummary_(subject, body) {
  const lines = String(body || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^>/.test(line))
    .filter(line => !/^(From|Sent|To|Cc|Subject|Date|差出人|送信者|宛先|件名|日時|日付)[:：]/i.test(line))
    .filter(line => !/Google Groups|googlegroups|unsubscribe|配信停止|このメールは/i.test(line));

  const text = lines.slice(0, 6).join(' / ');
  if (text) return text.slice(0, 800);
  return String(subject || '').slice(0, 800);
}

function getMessageHeaderSafe_(message, name) {
  try {
    return String(message.getHeader(name) || '');
  } catch (err) {
    return '';
  }
}

function cleanEmailBody_(body) {
  return String(body || '')
    .replace(/\r/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function pad2_(value) {
  return String(value || '0').padStart(2, '0');
}

function publicReservation_(r) {
  return {
    id: r.id,
    equipment: r.equipment,
    name: r.name,
    date: r.date,
    start: r.start,
    finish: r.finish,
    maintenanceTypes: r.maintenanceTypes || '',
    remark: r.remark || ''
  };
}

function debugInfo_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSheet_();
  const rows = getReservationObjects_();

  return {
    ok: true,
    version: BACKEND_VERSION,
    spreadsheetName: ss ? ss.getName() : '',
    spreadsheetId: ss ? ss.getId() : '',
    sheetName: sheet.getName(),
    rowCount: rows.length,
    lastReservations: rows.slice(-10).map(publicReservation_),
    emailGroupAddress: EMAIL_GROUP_ADDRESS,
    emailSearchQueries: EMAIL_SEARCH_QUERIES
  };
}

function output_(data, callback) {
  const json = JSON.stringify(data);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
