// 共有予約として使う場合は、Google Apps Script Web App URL をここに貼ってください。
// 例: const API_URL = "https://script.google.com/macros/s/xxxxx/exec";
// 空欄のままだと、各PCのブラウザ内だけに保存されます。全員共有にはなりません。
const API_URL = "";

// 使用する装置名。ここに書いた装置だけが予約画面に表示されます。
// 実際にAPI_URLを設定して使っている場合は、既存のAPI_URLを消さずにこの配列だけ更新してください。
const EQUIPMENTS = [
  "MOVPE 豊田中研",
  "MOVPE #4",
  "MOVPE #5",
  "MOVPE #7",
  "MOVPE #11",
  "MOVPE #12",
  "全体のメンテ"
];

// メンテ情報欄のチェック項目。
const MAINTENANCE_TYPES = [
  "除害停止メンテ",
  "重故障メンテ",
  "エピ"
];
