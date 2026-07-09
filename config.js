// 共有予約として使う場合は、Google Apps Script Web App URL をここに貼ってください。
// 空欄のままだと、各PCのブラウザ内だけに保存されます。全員共有にはなりません。
const API_URL = "https://script.google.com/macros/s/AKfycbyHchmc0kSAb9lDh9qmamsjY_21Z9PI5KzdWeQ0_QuuPScIlXj1cDn59bZUmqqXZRR-/exec";

// 使用する装置名。
// ここに書いた装置だけが予約フォームと通常の装置タブに表示されます。
// 「メンテ情報」タブは script_v5.js 側で自動追加されるため、ここには入れないでください。
const EQUIPMENTS = [
  "MOVPE 豊田中研",
  "MOVPE #4",
  "MOVPE #5",
  "MOVPE #7",
  "MOVPE #10",
  "MOVPE #11",
  "MOVPE #12"
];

// メンテを選択したときに表示する詳細項目。
const MAINTENANCE_DETAIL_TYPES = [
  "原料交換",
  "重故障",
  "除害停止",
  "定常メンテ"
];

// 旧版互換用。通常は編集不要です。
const MAINTENANCE_TYPES = [
  "エピ",
  ...MAINTENANCE_DETAIL_TYPES
];
