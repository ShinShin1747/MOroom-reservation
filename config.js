const API_URL = "https://script.google.com/macros/s/AKfycbyO42lPjrljEUsoRaE9R6oesuON-bOQxmDMbRZoGnswcW0zGJ4mzDSDxlnPrnxGW5CW/exec";

const EQUIPMENTS = [
  "MOVPE 豊田中研",
  "MOVPE #4",
  "MOVPE #5",
  "MOVPE #7",
  "MOVPE #10",
  "MOVPE #11",
  "MOVPE #12"
];

const MAINTENANCE_DETAIL_TYPES = [
  "原料交換",
  "重故障",
  "除害停止",
  "定常メンテ"
];

const MAINTENANCE_TYPES = [
  "エピ",
  ...MAINTENANCE_DETAIL_TYPES
];
