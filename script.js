// 互斥排班：指定成員不可同一天排班
const mutuallyExclusivePairs = [
];
// 儲存互斥對到 localStorage
function saveExclusions() {
  localStorage.setItem("mutuallyExclusivePairs", JSON.stringify(mutuallyExclusivePairs));
}

// 從 localStorage 讀回互斥對
function loadExclusions() {
  const raw = localStorage.getItem("mutuallyExclusivePairs");
  if (raw) {
    const arr = JSON.parse(raw);
    mutuallyExclusivePairs.length = 0;       // 清空原本
    arr.forEach(pair => mutuallyExclusivePairs.push(pair));
  }
}
// 填充 A、B 下拉選單
function refreshExclusionOptions() {
  const staffItems = document.querySelectorAll("#staff-list > ul li");
  if (staffItems.length === 0 && mutuallyExclusivePairs.length > 0) {
    mutuallyExclusivePairs.length = 0;
    saveExclusions();
  }

  const p1 = document.getElementById("excl-person1");
  const p2 = document.getElementById("excl-person2");
  [p1, p2].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '<option value="">-- 請選擇 --</option>';
    document.querySelectorAll("#staff-list > ul li").forEach(li => {
      const opt = document.createElement("option");
      opt.value = li.textContent;
      opt.textContent = li.textContent;
      sel.appendChild(opt);
    });
  });
}

// 處理交換與驗證邏輯 (複用給拖放和觸控)
function handleDrop(dstCell) {
  if (!dragSrcCell || dragSrcCell === dstCell) return;
  // 收集來源/目標資訊
  const srcCell = dragSrcCell;
  const srcName = srcCell.textContent.trim();
  const dstName = dstCell.textContent.trim();

  // 執行交換
  srcCell.textContent = dstName;
  dstCell.textContent = srcName;

  // 檢查函式：回傳錯誤訊息或 null
  function validate(cell, name) {
    const date = cell.parentElement.querySelector("td:first-child").textContent.split(" ")[0];
    const zone = document.querySelectorAll("#schedule thead th")[cell.cellIndex].textContent;
    // 禁用格檢查
    if (forbiddenCells.has(`${date}|${zone}`)) return `${name} 在 ${date} ${zone} 已被禁止`;
    // 權限檢查
    const role = name.split(" ")[0];
    if (!zonePermissions[role].includes(zone)) return `${name} 無法排入 ${zone}`;
    // 休假檢查
    const off = reservedOffDates[name] || { weekdays: [], weekends: [] };
    if (off.weekdays.includes(date) || off.weekends.includes(date)) return `${name} 已設定 ${date} 為休假`;
    // 連續排班檢查
    const [y, m, d] = date.split("-").map(n => parseInt(n, 10));
    for (const offset of [-1,1]) {
      const nd = new Date(y, m-1, d+offset);
      const ndStr = `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}-${String(nd.getDate()).padStart(2,"0")}`;
      const neighRow = Array.from(scheduleTableBody.querySelectorAll("tr"))
        .find(r => r.querySelector("td:first-child").textContent.split(" ")[0] === ndStr);
      if (neighRow && Array.from(neighRow.querySelectorAll("td")).slice(1)
          .some(c => c.textContent.trim() === name)) {
        return `${name} 不能連續兩天`;
      }
    }
    // 上限檢查
    const limit = roleAssignmentLimits[role] || Infinity;
    const count = Array.from(scheduleTableBody.querySelectorAll("tr"))
      .reduce((sum, r) => sum + Array.from(r.querySelectorAll("td")).slice(1)
        .filter(c => c.textContent.trim() === name).length, 0);
    if (count > limit) return `${name} 超過本月上限`;
    // 互斥檢查：同一天同一行若已有互斥對象，則排不進來
    const rowNames = Array.from(cell.parentElement.querySelectorAll("td"))
     .slice(1)
     .map(c => c.textContent.trim())
     .filter(n => n);
    for (const [a, b] of mutuallyExclusivePairs) {
      if (name === a && rowNames.includes(b)) {
        return `${a} 與 ${b} 不能同一天排班`;
      }
      if (name === b && rowNames.includes(a)) {
        return `${b} 與 ${a} 不能同一天排班`;
      }
    }

    // --- 插入：同日多區域檢查（同一天同人不可重複） ---
    const rowCells = cell.parentElement.querySelectorAll("td");
    for (let i = 1; i < rowCells.length; i++) {
      if (i !== cell.cellIndex && rowCells[i].textContent.trim() === name) {
        return `${name} 今日已在其他區域值班`;
      }
    }
    // --- 插入：完整週末保留數檢查：需至少保留2個完整週末 ---
    let freeWeekends = 0;
    weekendPairs.forEach(([sat, sun]) => {
      const satRow = Array.from(scheduleTableBody.querySelectorAll("tr"))
        .find(r => r.querySelector("td:first-child").textContent.split(" ")[0] === sat);
      const sunRow = sun && Array.from(scheduleTableBody.querySelectorAll("tr"))
        .find(r => r.querySelector("td:first-child").textContent.split(" ")[0] === sun);
      let worked = false;
      [satRow, sunRow].forEach(r => {
        if (r) {
          Array.from(r.querySelectorAll("td")).slice(1)
            .forEach(c => { if (c.textContent.trim() === name) worked = true; });
        }
      });
      if (!worked) freeWeekends++;
    });
    // 如果此次移動後會導致 freeWeekends < 2，則不允許
    // (假設此 cell 就是本週末其中一天)
    const isWeekend = weekendPairs.some(([sat, sun]) => sat === date || sun === date);
    if (isWeekend) {
      // 如果這個週末對原本是 free，freeWeekends-- 再比較
      const [sat, sun] = weekendPairs.find(p => p.includes(date));
      let thisWorkedBefore = false;
      [sat, sun].forEach(d => {
        const r = Array.from(scheduleTableBody.querySelectorAll("tr"))
          .find(r => r.querySelector("td:first-child").textContent.split(" ")[0] === d);
        if (r) {
          Array.from(r.querySelectorAll("td")).slice(1)
            .forEach(c => { if (c.textContent.trim() === name) thisWorkedBefore = true; });
        }
      });
      const potentialFree = thisWorkedBefore ? freeWeekends - 1 : freeWeekends;
      if (potentialFree < 2) {
        return `${name} 的空週末扣掉這個排班後會少於 2 個`;
      }
    }
    // --- 插入結束 ---
    return null;
  }

  // 分別驗證來源與目標
  const err1 = srcName ? validate(dstCell, srcName) : null;
  const err2 = dstName ? validate(srcCell, dstName) : null;
  if (err1 || err2) {
    // 驗證失敗，還原
    srcCell.textContent = srcName;
    dstCell.textContent = dstName;
    alert(err1 || err2);
  }

  // 清除狀態與樣式
  srcCell.style.opacity = "";
  dragSrcCell = null;
  dragSrcName = null;
  isDragging = false;
  renderWeekendSummary();
}
console.log("script.js 已經載入！")
let selectedName = "";

// 被禁止填入的格子集，以 "YYYY-MM-DD|ZoneName" 為 key
const forbiddenCells = new Set();
// 是否正在設定禁用格模式
let selectionMode = false;

let dragSrcCell = null;
let dragSrcName = null;
let isDragging = false;

// 儲存各人之預班（休假）日期：{ “姓名”: { weekday: “YYYY-MM-DD”, weekend: “YYYY-MM-DD” } }
const reservedOffDates = {};

// Google 表單 CSV 端點
const formResponsesUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRPocoAGk192dQEPlLTeDMuqLlwVVNu6adYu0uY1NMxlStUkK6pDY-JC_PR-dFiu0dc0WKENAab7TwI/pub?output=csv";

// 簡易 CSV 解析，支援引號內含逗號
function parseCSVLine(line) {
  const re = /("(?:[^"]|"")*"|[^,]*)(,|$)/g;
  const result = [];
  let match;
  while ((match = re.exec(line))) {
    let field = match[1];
    if (field.startsWith('"') && field.endsWith('"')) {
      field = field.slice(1, -1).replace(/""/g, '"');
    }
    result.push(field);
    if (match[2] === "") break;
  }
  return result;
}

// 隨機打亂陣列（Fisher-Yates 洗牌）
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// 讀取 Google 表單 CSV 並初始化人員清單與預班設定
async function loadFormResponses() {
  try {
    const res = await fetch(formResponsesUrl);
    const csvText = await res.text();
    // 將 CSV 內容拆行
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return;
    // 第一行作為欄位名稱
    const headers = parseCSVLine(lines[0]);
    // 找到表單中「平日預不值班」與「假日預不值班」欄位的索引，若無法靠文字抓到就用固定欄位(D=3, E=4)
    let weekdayColIndex = headers.findIndex(h => h.includes("平日預不值班"));
    if (weekdayColIndex < 0) weekdayColIndex = 3;  // D 欄，索引從 0 開始
    let weekendColIndex = headers.findIndex(h => h.includes("假日預不值班"));
    if (weekendColIndex < 0) weekendColIndex = 4;  // E 欄
    console.log("Parsed CSV headers:", headers);
    console.log("weekdayColIndex:", weekdayColIndex, "weekendColIndex:", weekendColIndex);
    // 確保 staff-list <ul> 存在
    const staffListDiv = document.getElementById("staff-list");
    let staffUl = document.querySelector("#staff-list ul");
    if (!staffUl) {
      staffUl = document.createElement("ul");
      staffListDiv.appendChild(staffUl);
    }
    // 依序處理每一列回覆
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      console.log(`Row ${i}: cols =`, cols);
      const entry = {};
      headers.forEach((h, idx) => entry[h] = cols[idx] || "");
      // 使用對應表單欄位名稱，例如 '姓名'、'職級'
      const name = entry["姓名"] || entry["Name"] || "";
      const role = entry["職級"] || entry["Role"] || "";
      if (!name || !role) continue;
      const fullName = `${role} ${name}`;
      // 加入人員清單（若尚未存在）
      if (!Array.from(staffUl.children).some(li => li.textContent === fullName)) {
        const li = document.createElement("li");
        li.textContent = fullName;
        staffUl.appendChild(li);
      }
      // 讀取並標準化「平日預不值班」與「假日預不值班」欄位
      const weekdays = [];
      if (weekdayColIndex !== -1 && cols[weekdayColIndex]) {
        const raw = cols[weekdayColIndex];
        const [y, m, d] = raw.split("/").map(s => s.padStart(2, "0"));
        weekdays.push(`${y}-${m}-${d}`);
      }
      const weekends = [];
      if (weekendColIndex !== -1 && cols[weekendColIndex]) {
        const raw = cols[weekendColIndex];
        const [y, m, d] = raw.split("/").map(s => s.padStart(2, "0"));
        weekends.push(`${y}-${m}-${d}`);
      }
      reservedOffDates[fullName] = { weekdays, weekends };
      console.log(`Reserved off for ${fullName}:`, reservedOffDates[fullName]);
    }
    // 資料載入完成後，更新下拉選單與預班清單
    refreshOffStaffOptions();
    renderOffDaysList();
    refreshExclusionOptions();
    renderExclusionList();
  } catch (err) {
    console.error("載入表單回覆失敗", err);
  }
}

// 預班（休假）清單渲染函數
function renderOffDaysList() {
  const container = document.getElementById("off-days-list");
  if (!container) return;
  container.innerHTML = "";

  const entries = Object.entries(reservedOffDates);
  // 根據職稱優先順序排序預班清單
  const order = ["PGY1","PGY2","R1","R2","R3","F1","F2","VS"];
  entries.sort((a, b) => {
    const roleA = a[0].split(" ")[0].toUpperCase();
    const roleB = b[0].split(" ")[0].toUpperCase();
    let idxA = order.indexOf(roleA);
    let idxB = order.indexOf(roleB);
    if (idxA === -1) idxA = order.length;
    if (idxB === -1) idxB = order.length;
    return idxA - idxB;
  });
  if (entries.length === 0) {
    container.textContent = "尚無預班日期";
    return;
  }

  entries.forEach(([name, dates]) => {
    const allDates = Array.isArray(dates.offDates) ? dates.offDates : [];
    const weekdays = [], weekends = [];
    allDates.forEach(d => {
      const dow = new Date(d).getDay();
      if (dow === 0 || dow === 6) weekends.push(d);
      else weekdays.push(d);
    });

    const wkHtml = weekdays.length
      ? weekdays.map(d => `<span class="off-date weekday" data-name="${name}" data-date="${d}">${d}</span>`).join('、')
      : '無';
    const weHtml = weekends.length
      ? weekends.map(d => `<span class="off-date weekend" data-name="${name}" data-date="${d}">${d}</span>`).join('、')
      : '無';

    const p = document.createElement("p");
    p.innerHTML = `${name}：平日休 ${wkHtml}；週末休 ${weHtml}`;
    container.appendChild(p);
  });
}

// 渲染互斥排班列表
function renderExclusionList() {
  const container = document.getElementById("exclusion-list");
  if (!container) return;
  container.innerHTML = "";
  mutuallyExclusivePairs.forEach(([a, b], idx) => {
    const div = document.createElement("div");
    div.innerHTML = `<span>${a}</span> 🔒 <span>${b}</span>`;
    // 雙擊移除
    div.addEventListener("dblclick", () => {
      if (confirm(`移除 ${a} 與 ${b} 的互斥設定？`)) {
        mutuallyExclusivePairs.splice(idx, 1);
        saveExclusions();
        renderExclusionList();
      }
    });
    container.appendChild(div);
  });
  if (mutuallyExclusivePairs.length === 0) {
    container.textContent = "尚無互斥設定";
  }
}

// 更新「預班（休假）設定」的選擇清單
function refreshOffStaffOptions() {
  const offSelect = document.getElementById("off-staff-select");
  if (!offSelect) return;
  offSelect.innerHTML = '<option value="">-- 請選擇 --</option>';
  document.querySelectorAll("#staff-list > ul li").forEach(li => {
    const opt = document.createElement("option");
    opt.value = li.textContent;
    opt.textContent = li.textContent;
    offSelect.appendChild(opt);
    refreshExclusionOptions();
  });
}

// 根據職稱優先順序排序側邊人員列表
function sortStaffList() {
  const ul = document.querySelector("#staff-list > ul");
  if (!ul) return;
  const items = Array.from(ul.children);
  const order = ["PGY1","PGY2","R1","R2","R3","F1","F2","VS"];
  items.sort((a, b) => {
    const roleA = a.textContent.split(" ")[0].toUpperCase();
    const roleB = b.textContent.split(" ")[0].toUpperCase();
    let idxA = order.indexOf(roleA);
    let idxB = order.indexOf(roleB);
    if (idxA === -1) idxA = order.length;
    if (idxB === -1) idxB = order.length;
    return idxA - idxB;
  });
  items.forEach(li => ul.appendChild(li));
}


// 目前選擇的月份
let currentMonth = 5;

// 節日資料庫，放在全域，只宣告一次
let holidayDatabase = {};

// 目前選擇的年份
let currentYear = 2025;

async function loadHolidayData(year) {
  try {
    const apiUrl = `https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data/${year}.json`;
    const response = await fetch(apiUrl);
    const holidays = await response.json();
    console.log("✅ 從 API 成功載入");

    holidayDatabase = {};
    holidays.forEach(h => {
      if (h.isHoliday) {
        holidayDatabase[h.date] = h.description;
      }
    });
  } catch (error) {
    console.warn("⚠️ API 載入失敗，改抓本地檔案");

    try {
      const localUrl = `holiday${year}.json`;
      const response = await fetch(localUrl);
      const holidays = await response.json();
      holidayDatabase = {};
      holidays.forEach(h => {
        if (h.isHoliday) {
          holidayDatabase[h.date] = h.description;
        }
      });
    } catch (localError) {
      console.error("❌ 本地備援也失敗", localError);
    }
  }
}
/**
 * 綁定「預班（休假）設定」面板的 change / click 事件
 * @param {flatpickr.Instance} offDayPicker - flatpickr 多選日曆實例
 */
function bindOffDayEvents(offDayPicker) {
  // 1. 人員下拉選擇切換時，把 reservedOffDates 內的日期丟到 flatpickr
  document
    .getElementById("off-staff-select")
    .addEventListener("change", e => {
      const name = e.target.value;
      const off = reservedOffDates[name] || { weekdays: [], weekends: [] };
      // Merge 兩組日期
      const dates = (off.offDates  
                     || ((off.weekdays||[]).concat(off.weekends||[])))  
                   .map(d => d.trim());
      offDayPicker.setDate(dates, true);
    });

  // 2. 按「儲存」時，把 flatpickr 選的日期寫回 reservedOffDates，並 render
  document
    .getElementById("set-off-days")
    .addEventListener("click", () => {
      const name = document.getElementById("off-staff-select").value;
      if (!name) {
        return alert("請先選擇人員");
      }
      const dates = offDayPicker.selectedDates.map(d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      });
      reservedOffDates[name] = { offDates: dates };
      renderOffDaysList();
      alert(`${name} 的預班日期已更新`);
    });
}

 //切換「設定禁用格」模式，並更新按鈕文字
function toggleSelectionMode() {
  selectionMode = !selectionMode;
  const btn = document.getElementById("set-disabled-button");
  if (!btn) return;
  btn.textContent = selectionMode ? "結束設定禁用" : "設定禁用格";
}
/**
 * 讀取目前排班表，產生 CSV 格式並下載
 */
function exportToCSV() {
  // 1. 取得 header row
  const headers = Array.from(document.querySelectorAll("#schedule thead th"))
    .map(th => `"${th.textContent.trim()}"`)
    .join(",");
  // 2. 取得 body rows
  const rows = Array.from(document.querySelectorAll("#schedule tbody tr"))
    .map(tr =>
      Array.from(tr.querySelectorAll("td"))
        .map(td => `"${td.textContent.trim()}"`)
        .join(",")
    );
  // 3. 組成檔案內容
  const csvContent = [headers, ...rows].join("\n");
  // 4. 觸發下載
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `schedule_${currentYear}_${String(currentMonth).padStart(2,"0")}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
/**
 * 用 SheetJS (XLSX.js) 讀取 table，並下載成 .xlsx
 */
function exportToExcel() {
  const table = document.getElementById("schedule");
  // 把 table 轉成 workbook
  const wb = XLSX.utils.table_to_book(table, { sheet: "排班" });
  // 下載檔案
  XLSX.writeFile(
    wb,
    `schedule_${currentYear}_${String(currentMonth).padStart(2,"0")}.xlsx`
  );
}
// 🛠 等到網頁載入完，先抓台灣假日，再產生排班表
window.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM loaded");
   loadExclusions();
  // 自動設定為下一個月份
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth() + 2; // JS 月份從0開始，加2代表明年或下個月
  if (month > 12) {
    month = 1;
    year++;
  }
  currentYear = year;
  currentMonth = month;
  // 更新選單顯示為下一個月份
  const yearInput = document.getElementById("year");
  const monthInput = document.getElementById("month");
  if (yearInput) yearInput.value = currentYear;
  if (monthInput) monthInput.value = currentMonth;
  // 加入手掌抓取游標樣式
  const style = document.createElement("style");
  style.textContent = `
    body {
      font-family: 'LXGW WenKai Mono TC', monospace;
    }
    /* Staff list grab cursor */
    #staff-list ul li {
      cursor: grab;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background-color 0.2s;
      font-family: 'LXGW WenKai Mono TC', monospace;
    }
    #staff-list ul li:active {
      cursor: grabbing;
      background-color: #f0f0f0;
    }
    #staff-list ul li:hover {
      background-color: #fafafa;
    }

    /* Schedule table styling */
    #schedule {
      font-family: 'LXGW WenKai Mono TC', monospace;
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 1em;
    }
    #schedule th,
    #schedule td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: center;
      font-family: 'LXGW WenKai Mono TC', monospace;
    }
    #schedule th {
      background-color:rgb(255, 255, 253);
      font-weight: bold;
    }
    #schedule tbody tr:nth-child(even) {
      background-color:rgb(249, 249, 248);
    }
    #schedule tbody tr:hover {
      background-color:rgb(253, 253, 253);
    }

    /* Draggable cell cursors */
    #schedule tbody td[draggable="true"] {
      cursor: grab;
    }
    #schedule tbody td[draggable="true"]:active,
    #schedule tbody td[draggable][dragging="true"] {
      cursor: grabbing;
    }

    /* Buttons styling */
    button {
      margin: 0 4px 4px 0;
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      background-color:rgb(224, 244, 255);
      color: #696969;
      font-size: 0.9em;
      transition: background-color 0.2s;
      cursor: pointer;
      font-family: 'LXGW WenKai Mono TC', monospace;
    }
    button:hover {
      background-color:rgb(224, 244, 255);
    }

    /* 下拉選單文字大小 */
    select {
      font-size: 16pt;
      font-family: 'LXGW WenKai Mono TC', monospace;
    }

    /* Panels styling */
    #staff-list,
    #off-days,
    #version-controls {
      background-color: #fff;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 1em;
      margin-bottom: 1em;
      font-family: 'LXGW WenKai Mono TC', monospace;
    }

    /* Headings in panels */
    #off-days h3,
    #version-controls h3,
    #weekend-summary h3,
    h1, h2, h3, h4, h5, h6 {
      margin-top: 0;
      margin-bottom: 0.5em;
      font-size: 1.1em;
      color: #333;
      font-family: 'LXGW WenKai Mono TC', monospace;
    }

    /* 主標題背景 */
    header, .header, body > h1 {
      background-color: #f5fffa;
      color: #696969;
      padding: 0.5em;
      border-radius: 4px;
      font-family: 'LXGW WenKai Mono TC', monospace;
    }
  `;
  // 加入 LXGW WenKai Mono TC 字體
  const fontLink = document.createElement("link");
  fontLink.rel = "stylesheet";
  fontLink.href = "https://cdn.jsdelivr.net/gh/lxgw/LXGWWenKai@latest/dist/font-css/LXGW WenKai Mono TC.css";
  document.head.appendChild(fontLink);
  document.head.appendChild(style);
   // ← 將這三行放進來，就不會跑錯
  await loadFormResponses();
  await loadHolidayData(currentYear);
  generateSchedule(currentYear, currentMonth);

  const offDayPicker = flatpickr("#off-days-picker", {
  mode: "multiple",
  dateFormat: "Y-m-d",
  onChange(selectedDates, dateStr, instance) {
    if (selectedDates.length > 8) {
      instance.setDate(selectedDates.slice(0, 8), true);
      alert("最多只能選擇 8 天");
      }
    }
  });
    bindOffDayEvents(offDayPicker);
  // 當人員下拉選擇改變時，將該人已有的預班日帶入日曆
  document.getElementById("off-staff-select").addEventListener("change", e => {
    const name = e.target.value;
    const off = reservedOffDates[name] || { offDates: [] };
    // 若你之前的資料結構是 { weekdays: [], weekends: [] }，
    // 可以改成 offDates: [...兩者合併...]，或這裡做合併：
    const dates = off.offDates ||
                  ((off.weekdays || []).concat(off.weekends || []));
    offDayPicker.setDate(dates, true);
  });

   // 最後，預設呼叫一次，顯示現有資料
  refreshOffStaffOptions();
  renderOffDaysList();

  // 綁定自動排班按鈕事件
  document.getElementById("auto-schedule").addEventListener("click", autoAssign);
  document.getElementById("generate-button").addEventListener("click", () => generateSchedule(currentYear, currentMonth));
  document.getElementById("set-disabled-button").addEventListener("click", toggleSelectionMode);
  document.getElementById("export-excel").addEventListener("click", exportToExcel);
  document.getElementById("export-csv").addEventListener("click", exportToCSV);
  // ---- 新增版本儲存/載入功能 ----
  const staffListDiv = document.getElementById("staff-list");
  const versionsDiv = document.createElement("div");
  versionsDiv.id = "version-controls";
  versionsDiv.style.margin = "1em 0";
  versionsDiv.innerHTML = `
    <h3>排班版本</h3>
    ${[1,2,3].map(v =>
      `<div>
        <button class="save-version" data-version="${v}">儲存版本 ${v}</button>
        <button class="load-version" data-version="${v}">載入版本 ${v}</button>
      </div>`
    ).join("")}
  `;
    // （D）最後，插入週末 & 本月排班摘要面板
  if (staffListDiv && !document.getElementById("weekend-summary")) {
    const summaryDiv = document.createElement("div");
    summaryDiv.id = "weekend-summary";
    summaryDiv.style.marginTop  = "1em";
    summaryDiv.style.fontSize   = "0.9em";
    staffListDiv.appendChild(summaryDiv);
  }

  // 將排班版本區塊移到排班表下方
  const scheduleTable = document.getElementById("schedule");
  scheduleTable.insertAdjacentElement("afterend", versionsDiv);
 // 新增匯出CSV按鈕
  const exportBtn = document.createElement("button");
  exportBtn.id = "export-csv-button";
  exportBtn.textContent = "匯出排班 (CSV)";
  // 將按鈕插入在排班表下方
  scheduleTable.insertAdjacentElement("afterend", exportBtn);
  exportBtn.addEventListener("click", () => {
    // 取得表格標題
    const headers = Array.from(document.querySelectorAll("#schedule thead th"))
      .map(th => `"${th.textContent.trim()}"`)
      .join(",");
    // 取得所有列資料
    const rows = Array.from(document.querySelectorAll("#schedule tbody tr")).map(row => {
      return Array.from(row.querySelectorAll("td")).map(td =>
        `"${td.textContent.trim()}"`
      ).join(",");
    });
    const csvContent = [headers, ...rows].join("\n");
    // 產生下載連結
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule_${currentYear}_${String(currentMonth).padStart(2,"0")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  // 新增匯出Excel按鈕
  const exportXlsxBtn = document.createElement("button");
  exportXlsxBtn.id = "export-xlsx-button";
  exportXlsxBtn.textContent = "匯出排班 (Excel)";
  scheduleTable.insertAdjacentElement("afterend", exportXlsxBtn);

  exportXlsxBtn.addEventListener("click", () => {
    // 使用 SheetJS 將 table 轉成 workbook
    const wb = XLSX.utils.table_to_book(document.getElementById("schedule"), { sheet: "排班" });
    // 下載 xlsx 檔
    XLSX.writeFile(wb, `schedule_${currentYear}_${String(currentMonth).padStart(2,"0")}.xlsx`);
  });
  // 儲存／載入排班版本到 localStorage
versionsDiv.addEventListener("click", e => {
  const btn = e.target;
  const v = btn.dataset.version;
  const key = `schedule_v${v}`;
  // 只處理我們定義的按鈕
  if (!btn.classList.contains("save-version") && !btn.classList.contains("load-version")) {
    return;
  }

  if (btn.classList.contains("save-version")) {
    // 1) 收集 staff 清單
    const staff = Array.from(
      document.querySelectorAll("#staff-list ul li")
    ).map(li => li.textContent);

    // 2) 收集休假設定 off
    const off = JSON.parse(JSON.stringify(reservedOffDates));

    // 3) 收集互斥設定 excl
    const excl = JSON.parse(JSON.stringify(mutuallyExclusivePairs));

    // 4) 收集排班表 rows
    const rows = Array.from(
      document.querySelectorAll("#schedule tbody tr")
    ).map(tr =>
      Array.from(tr.querySelectorAll("td"))
        .map(td => td.textContent.trim())
    );

    // 5) 一起存進 localStorage
    localStorage.setItem(key, JSON.stringify({ staff, off, excl, rows }));
    alert(`✅ 已儲存版本 ${v}`);

  } else if (btn.classList.contains("load-version")) {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return alert(`⚠️ 版本 ${v} 尚未儲存`);
    }

    // 解構出所有狀態
    const { staff, off, excl, rows } = JSON.parse(raw);

    // —— 還原人員清單 ——
    const staffUl = document.querySelector("#staff-list > ul");
    staffUl.innerHTML = "";
    staff.forEach(name => {
      const li = document.createElement("li");
      li.textContent = name;
      staffUl.appendChild(li);
    });

    // —— 還原休假設定 off ——
    // 先清空原有，再灌入新值
    Object.keys(reservedOffDates).forEach(k => delete reservedOffDates[k]);
    Object.assign(reservedOffDates, off);

    // —— 還原互斥設定 excl ——
    mutuallyExclusivePairs.length = 0;
    excl.forEach(pair => mutuallyExclusivePairs.push(pair));

    // —— 還原排班表 rows ——
    const tbody = document.querySelector("#schedule tbody");
    tbody.innerHTML = "";
    rows.forEach(cols => {
      const tr = document.createElement("tr");
      cols.forEach(text => {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    // —— 重新啟用互動功能 & 更新 UI ——
    enableDragDrop();
    sortStaffList();
    refreshOffStaffOptions();
    renderOffDaysList();
    refreshExclusionOptions();
    renderExclusionList();
    renderWeekendSummary();

    alert(`✅ 已載入版本 ${v}`);
  }
});

  // 新增互斥排班設定面板
  const exclDiv = document.createElement("div");
  exclDiv.id = "exclusion-panel";
  exclDiv.style.margin = "1em 0";
  exclDiv.innerHTML = `
    <h3>互斥排班設定</h3>
    <label>人員 A：
      <select id="excl-person1"><option value="">-- 請選擇 --</option></select>
    </label>
    <label>人員 B：
      <select id="excl-person2"><option value="">-- 請選擇 --</option></select>
    </label>
    <button id="add-exclusion">🔒 綁定</button>
    <div id="exclusion-list" style="margin-top:0.5em;font-size:0.9em"></div>
  `;
  staffListDiv.appendChild(exclDiv);
  refreshExclusionOptions();
  renderExclusionList();

  document.getElementById("add-exclusion").addEventListener("click", () => {
    const a = document.getElementById("excl-person1").value;
    const b = document.getElementById("excl-person2").value;
    if (!a || !b || a === b) {
      return alert("請選擇兩個不同的人員");
    }
    if (mutuallyExclusivePairs.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a))) {
      return alert("此互斥設定已存在");
    }
    mutuallyExclusivePairs.push([a, b]);
    saveExclusions();
    renderExclusionList();
    alert(`已設定 ${a} 與 ${b} 不可同一天排班`);
  });

  // 在 staff-list 底下插入排班摘要
  if (staffListDiv && !document.getElementById("weekend-summary")) {
    const summaryDiv = document.createElement("div");
    summaryDiv.id = "weekend-summary";
    summaryDiv.style.marginTop = "1em";
    summaryDiv.style.fontSize = "0.9em";
    staffListDiv.appendChild(summaryDiv);
    renderWeekendSummary();
  }

  // 確保載入後重新渲染一次排班摘要
  renderWeekendSummary();
  sortStaffList();
  refreshOffStaffOptions();
  renderOffDaysList();
  refreshExclusionOptions();
  renderExclusionList();
  renderWeekendSummary();
  // ——— 新增：週末 & 本月排班摘要面板 ———
  if (staffListDiv) {
    // 如果還沒建立過，就動態掛一個 <div id="weekend-summary">
    let summaryDiv = document.getElementById("weekend-summary");
    if (!summaryDiv) {
      summaryDiv = document.createElement("div");
      summaryDiv.id = "weekend-summary";
      summaryDiv.style.marginTop = "1em";
      summaryDiv.style.fontSize = "0.9em";
      staffListDiv.appendChild(summaryDiv);
    }
    // 呼叫一次，渲染初始摘要
    renderWeekendSummary();
  }
});

// 選取目前網頁上已經存在的元素
const scheduleCells = document.querySelectorAll("#schedule td");

// (已改為事件委派模式，不再需要每個staff綁定click/dblclick)

const staffList = document.querySelector("#staff-list ul");

// 事件委派：點擊li就設定選取人員，並標記選取樣式
staffList.addEventListener("click", (event) => {
  if (event.target.tagName === "LI") {
    const clickedName = event.target.textContent;
    // 如果點擊的就是目前已選取的人，則取消選取
    if (selectedName === clickedName) {
      selectedName = "";
      // 清除所有項目背景與排班格游標
      document.querySelectorAll("#staff-list > ul li").forEach(li => {
        li.style.backgroundColor = "";
      });
      document.querySelectorAll("#schedule tbody td:not(:first-child)").forEach(cell => {
        cell.style.cursor = "";
      });
    } else {
      // 否則選取此人
      selectedName = clickedName;
      document.querySelectorAll("#staff-list > ul li").forEach(li => {
        li.style.backgroundColor = "";
      });
      event.target.style.backgroundColor = "#FFD1DC";
      document.querySelectorAll("#schedule tbody td:not(:first-child)").forEach(cell => {
        cell.style.cursor = "grab";
      });
    }
  }
});

// 事件委派：雙擊li就詢問是否刪除
staffList.addEventListener("dblclick", (event) => {
  if (event.target.tagName === "LI") {
    if (confirm(`確定要刪除 ${event.target.textContent} 嗎？`)) {
      if (event.target.textContent === selectedName) {
        selectedName = "";
      }
      event.target.remove();
    }
  }
});




const scheduleTableBody = document.querySelector("#schedule tbody");

// 定義區域權限 mapping
const zonePermissions = {
  "PGY1": ["6W"],
  "PGY2": ["6W", "Zone A", "Zone B"],
  "R1": ["6W", "Zone A", "Zone B", "MICU1"],
  "R2": ["6W", "Zone A", "Zone B", "MICU1", "MICU2"],
  "R3": ["6W", "Zone A", "Zone B", "MICU1", "MICU2"],
  "F1": ["6W", "Zone A", "Zone B", "MICU1", "MICU2", "總值"],
  "F2": ["6W", "Zone A", "Zone B", "MICU1", "MICU2", "總值"],
  "VS": ["6W", "Zone A", "Zone B", "MICU1", "MICU2", "總值"]
};
// 每個職稱每月最大值班次數限制
const roleAssignmentLimits = {
  "PGY1": 8,
  "PGY2": 8,
  "R1": 8,
  "R2": 8,
  "R3": 7,
  "F1": 6,
  "F2": 5,
  "Vs": 2
};
// 每個職稱的區域優先順序
const roleZonePriority = {
  "PGY1": ["6W"],
  "PGY2": ["6W","Zone A","Zone B"],
  "R1": ["Zone A","Zone B","6W"],
  "R2": ["Zone A","Zone B","MICU1","MICU2","6W"],
  "R3": ["Zone A","Zone B","MICU1","MICU2","6W"],
  "F1": ["MICU1","MICU2","Zone A","Zone B","總值","6W"],
  "F2": ["MICU1","MICU2","Zone A","Zone B","總值","6W"],
  "VS": ["總值"]
};
function countFullWeekendAssignments(name) {
  let count = 0;
  const rows = Array.from(scheduleTableBody.querySelectorAll("tr"));

  weekendPairs.forEach(([sat, sun]) => {
    const satRow = rows.find(r => r.querySelector("td").textContent.startsWith(sat));
    const sunRow = sun ? rows.find(r => r.querySelector("td").textContent.startsWith(sun)) : null;

    if (satRow && sunRow) {
      const satCells = Array.from(satRow.querySelectorAll("td")).slice(1);
      const sunCells = Array.from(sunRow.querySelectorAll("td")).slice(1);

      const satWorked = satCells.some(c => c.textContent === name);
      const sunWorked = sunCells.some(c => c.textContent === name);

      if (satWorked && sunWorked) {
        count++;
      }
    }
  });

  return count;
}
// 儲存週末日期對 (週六與週日)
let weekendPairs = [];

scheduleTableBody.addEventListener("click", (event) => {
  // 若正在拖曳，忽略 click 以防誤觸手動排班檢查
  if (isDragging) return;
  // 如果在禁用設定模式，點擊格子切換禁用狀態
  if (selectionMode && event.target.tagName === "TD" && event.target.cellIndex !== 0) {
    const date = event.target.parentElement.querySelector("td:first-child").textContent.split(" ")[0];
    const zone = document.querySelectorAll("#schedule thead th")[event.target.cellIndex].textContent;
    const key = `${date}|${zone}`;
    if (forbiddenCells.has(key)) {
      forbiddenCells.delete(key);
      event.target.style.backgroundColor = "";
    } else {
      forbiddenCells.add(key);
      event.target.style.backgroundColor = "#f8d7da"; // 淺紅標記
    }
    return; // 不進行後續排班邏輯
  }
  // 普通模式下，若此格被禁用則阻擋填入
  if (!selectionMode && event.target.tagName === "TD" && event.target.cellIndex !== 0) {
    const date = event.target.parentElement.querySelector("td:first-child").textContent.split(" ")[0];
    const zone = document.querySelectorAll("#schedule thead th")[event.target.cellIndex].textContent;
    const key = `${date}|${zone}`;
    if (forbiddenCells.has(key)) {
      alert(`${date} ${zone} 已被設定為禁止填入`);
      return;
    }
  }
  if (event.target.tagName === "TD" && event.target.cellIndex !== 0) {
    // cellIndex !== 0 是避免點到「日期欄」
    if (selectedName !== "") {
      // 休假檢查：若無設定則視為可排
      const dateCellOff = event.target.parentElement.querySelector("td:first-child");
      const dateStrOff = dateCellOff.textContent.split(" ")[0];
    
      // —— 阻擋檢查結束 ——
      // 1. 收集所有排班表的列，以便後續「防連續值班」檢查使用
      const rows = Array.from(scheduleTableBody.querySelectorAll("tr"));
      const entry = reservedOffDates[selectedName] || {};
      const allOff = Array.isArray(entry.offDates)
        ? entry.offDates
        : [
            ...(Array.isArray(entry.weekdays) ? entry.weekdays : []),
            ...(Array.isArray(entry.weekends) ? entry.weekends : [])
          ];
      if (allOff.includes(dateStrOff)) {
        alert(`${selectedName} 已設定 ${dateStrOff} 為休假日，無法排班`);
        return;
      }

      // 取得欄位名稱
      const columnIndex = event.target.cellIndex;
      const headerCells = document.querySelectorAll("#schedule thead th");
      let zoneName = "";
      for (let i = 0; i < headerCells.length; i++) {
        if (i === columnIndex) {
          zoneName = headerCells[i].textContent;
          break;
        }
      }
      // 從 selectedName 取得職稱
      const role = selectedName.split(" ")[0];
      if (zonePermissions[role] && !zonePermissions[role].includes(zoneName)) {
        alert(`${role} 無法排入 ${zoneName}`);
        return;
      }
      const dateCell = event.target.parentElement.querySelector("td:first-child");
      const dateStr = dateCell.textContent.split(" ")[0];
      // 🔒 防連續值班：檢查前後一天是否已排該人
      const [y, m, d] = dateStr.split("-").map(n => parseInt(n, 10));
      // 需要檢查的 offset：-1 = 前一天，+1 = 後一天
      for (const offset of [-1, 1]) {
        const neigh = new Date(y, m - 1, d + offset);
        const neighStr =
          neigh.getFullYear() + "-" +
          String(neigh.getMonth() + 1).padStart(2, "0") + "-" +
          String(neigh.getDate()).padStart(2, "0");
        // 找到對應那一天的 row
        const neighRow = Array.from(scheduleTableBody.querySelectorAll("tr")).find(r => {
          const cellDate = r.querySelector("td:first-child")
                            .textContent.trim().split(" ")[0];
          return cellDate === neighStr;
        });
        if (neighRow) {
          const worked = Array.from(neighRow.querySelectorAll("td"))
            .slice(1)  // 跳過日期欄
            .some(cell => cell.textContent.trim() === selectedName.trim());
          if (worked) {
            alert(`${selectedName} 不能連續兩天值班`);
            return;
          }
        }
      }
     
      // —— 新版：週末「空週末」檢查——
      const currentPair = weekendPairs.find(p => p.includes(dateStr));
      if (currentPair) {
        // 撈出所有列以便計算
        const allRows = Array.from(scheduleTableBody.querySelectorAll("tr"));
        let freeWeekends = 0;

        // 計算目前所有週末對中，哪些是完全 free（週六＋週日都沒排 selectedName）
        weekendPairs.forEach(([satDate, sunDate]) => {
          const satRow = allRows.find(r => r.querySelector("td").textContent.startsWith(satDate));
          const sunRow = sunDate
            ? allRows.find(r => r.querySelector("td").textContent.startsWith(sunDate))
            : null;
          let worked = false;
          [satRow, sunRow].forEach(row => {
            if (row) {
              Array.from(row.querySelectorAll("td"))
                .slice(1)
                .forEach(cell => {
                  if (cell.textContent === selectedName) worked = true;
                });
            }
          });
          if (!worked) freeWeekends++;
        });

        // 判斷這個要點的 weekend pair，本來是不是 free？
        const [satDate, sunDate] = currentPair;
        const satRow0 = allRows.find(r => r.querySelector("td").textContent.startsWith(satDate));
        const sunRow0 = sunDate
          ? allRows.find(r => r.querySelector("td").textContent.startsWith(sunDate))
          : null;
        let thisWeekendIsFree = true;
        [satRow0, sunRow0].forEach(row => {
          if (row) {
            Array.from(row.querySelectorAll("td"))
              .slice(1)
              .forEach(cell => {
                if (cell.textContent === selectedName) thisWeekendIsFree = false;
              });
          }
        });

        // 如果本週末目前是 free，一旦排班就要扣一個 freeWeekends
        const potentialFree = thisWeekendIsFree ? freeWeekends - 1 : freeWeekends;
        if (potentialFree < 2) {
          alert(`${selectedName} 的空週末扣掉這個排班後會少於 2 個，無法排此週末`);
          return;
        }
      }
      // —— 新版檢查結束 ——              
 
      // 🔒 防單日多區域：同一行不能排同一人到不同區域
      const rowCells = Array.from(event.target.parentElement.querySelectorAll("td")).slice(1);
      if (rowCells.some(cell => cell.textContent === selectedName)) {
        alert(`${selectedName} 今日已排過一區域，不能再排其他區域`);
        return;
      }

      // 🛑 檢查每月排班次數上限
      const limit = roleAssignmentLimits[role] || Infinity;
      // 計算已排次數
      const assignedCount = Array.from(scheduleTableBody.querySelectorAll("tr"))
        .reduce((sum, row) => {
          const cells = Array.from(row.querySelectorAll("td")).slice(1);
          return sum + cells.filter(c => c.textContent.trim() === selectedName.trim()).length;
        }, 0);
      if (assignedCount >= limit) {
        alert(`${selectedName} 本月已達 ${limit} 次排班上限`);
        return;
      }

      event.target.textContent = selectedName;
      renderWeekendSummary();
    }
  }
});

scheduleTableBody.addEventListener("dblclick", (event) => {
  if (event.target.tagName === "TD" && event.target.cellIndex !== 0) {
    if (event.target.textContent !== "") {
      if (confirm("確定要清空這個格子嗎？")) {
        // 清空前先更新完整週末計數
        const clearedName = event.target.textContent;

        // 取得欄位名稱
        const columnIndex = event.target.cellIndex;
        const headerCells = document.querySelectorAll("#schedule thead th");
        let zoneName = "";
        for (let i = 0; i < headerCells.length; i++) {
          if (i === columnIndex) {
            zoneName = headerCells[i].textContent;
            break;
          }
        }
        // 取得該欄位的索引，確保與header對齊
        let colIndex = -1;
        const headers = document.querySelectorAll("#schedule thead th");
        for (let i = 0; i < headers.length; i++) {
          if (headers[i].textContent === zoneName) {
            colIndex = i;
            break;
          }
        }
        if (colIndex === -1) return;

        const dateCell = event.target.parentElement.querySelector("td:first-child");
        const dateStr = dateCell.textContent.split(" ")[0];

        // 找出週末日期對中包含此日期的對
        for (const pair of weekendPairs) {
          if (pair.includes(dateStr)) {
            const [satDate, sunDate] = pair;
            const rows = Array.from(scheduleTableBody.querySelectorAll("tr"));
            const satRow = rows.find(r => r.querySelector("td").textContent.startsWith(satDate));
            const sunRow = rows.find(r => r.querySelector("td").textContent.startsWith(sunDate));
            if (satRow && sunRow) {
              const satCell = satRow.querySelectorAll("td")[colIndex];
              const sunCell = sunRow.querySelectorAll("td")[colIndex];
              // 如果該完整週末兩天都是該人，清空其中一天會讓完整週末數減少1
              // 這段原本是依賴 staffWeekendCount，移除後不再更新計數
            }
            break;
          }
        }

        event.target.textContent = "";
        renderWeekendSummary();
      }
    }
  }
});

// 這邊是新增人員的功能
const addStaffButton = document.getElementById("add-staff-button");
addStaffButton.addEventListener("click", () => {
  const roleSelect = document.getElementById("staff-role");
  const newStaffNameInput = document.getElementById("new-staff-name");

  const role = roleSelect.value.trim();
  const name = newStaffNameInput.value.trim();

  if (role !== "" && name !== "") {
    const fullName = `${role} ${name}`;
  
    let staffList = document.querySelector("#staff-list ul");
    if (!staffList) {
      // 如果ul不存在，手動新增一個ul放人員清單
      const newUl = document.createElement("ul");
      document.getElementById("staff-list").prepend(newUl);
      staffList = newUl;
    }
  
    const newStaff = document.createElement("li");
    newStaff.textContent = fullName;
    staffList.appendChild(newStaff);

    // 同步更新「預班（休假）設定」的選擇清單
    const offSelect = document.getElementById("off-staff-select");
    if (offSelect) {
      refreshOffStaffOptions();
      refreshExclusionOptions();
    }
  
    // (不需要個別綁定，新li自動透過事件委派被監聽)
  
    newStaffNameInput.value = ""; // 清空姓名輸入框
    roleSelect.selectedIndex = 0; // 重置職稱選單
    renderWeekendSummary();
  }
});
// 🛠月份切換按鈕功能
document.getElementById("generate-button").addEventListener("click", async () => {
  const year = parseInt(document.getElementById("year").value);
  const month = parseInt(document.getElementById("month").value);
  currentYear = year;
  currentMonth = month;
  await loadHolidayData(currentYear); // ⚠️ 重新 fetch 該年份假日資料
  generateSchedule(currentYear, month);
});
function computeWeekendPairs(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  // 建立所有週末日期清單（僅週六與週日）
  const allWeekendDates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dateObj = new Date(year, month - 1, day);
    if (dateObj.getDay() === 6 || dateObj.getDay() === 0) {
      allWeekendDates.push({ dateStr, dayOfWeek: dateObj.getDay() });
    }
  }
  // 依序配對完整週末：週六+隔天週日，其他單日週末也納入
  const pairs = [];
  let idx = 0;
  while (idx < allWeekendDates.length) {
    const current = allWeekendDates[idx];
    const next = allWeekendDates[idx + 1];
    if (
      next &&
      new Date(next.dateStr) - new Date(current.dateStr) === 24 * 60 * 60 * 1000
    ) {
      pairs.push([current.dateStr, next.dateStr]);
      idx += 2;
    } else {
      pairs.push([current.dateStr, null]);
      idx += 1;
    }
  }
  return pairs;
}

function generateSchedule(year, month) {
  const tbody = document.querySelector("#schedule tbody");
  tbody.innerHTML = "";

  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dateCell.textContent = dateStr;

    const dateKey = dateStr.replace(/-/g, "");

    console.log("目前日期:", dateKey, "查到節日:", holidayDatabase[dateKey]);

    if (holidayDatabase[dateKey]) {
      dateCell.style.color = "red";
      dateCell.textContent += ` (${holidayDatabase[dateKey]})`;
    }

    row.appendChild(dateCell);

    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6 || holidayDatabase[dateKey]) {
      row.style.backgroundColor = "#e9967a";
    }

    const zones = ["6W", "Zone A", "Zone B", "MICU1", "MICU2", "總值"];
    zones.forEach(() => {
      const cell = document.createElement("td");
      row.appendChild(cell);
    });

    tbody.appendChild(row);
    // enableDragDrop(); // 移除：拖放功能呼叫移到所有列建立完後
  }

  // 啟用拖放功能（所有列建立完後一次呼叫）
  enableDragDrop();

  // 產生週末配對
  weekendPairs = computeWeekendPairs(year, month);

  // 立即重算一次週末摘要，避免進入頁面預設為最大值
  setTimeout(renderWeekendSummary, 0);
  // 啟用拖放功能（已移除拖放）
}

function renderWeekendSummary() {
  const weekendSummaryDiv = document.getElementById("weekend-summary");
  if (!weekendSummaryDiv) return;

  // 重新計算 weekendPairs 以確保與顯示一致
  weekendPairs = computeWeekendPairs(currentYear, currentMonth);

  // 清空內容：確保每次都清空舊的清單再更新
  weekendSummaryDiv.innerHTML = "";

  // 取得所有人員名稱
  const staffListItems = document.querySelectorAll("#staff-list > ul li");
  const staffNames = Array.from(staffListItems).map(li => li.textContent);

  if (staffNames.length === 0) {
    weekendSummaryDiv.textContent = "尚無人員資料";
    return;
  }

  // 取得排班表所有列
  const rows = Array.from(scheduleTableBody.querySelectorAll("tr"));

  // 取得欄位名稱
  const headers = document.querySelectorAll("#schedule thead th");

  // 先計算總週末數
  const totalWeekends = weekendPairs.length;

  // 建立一個物件記錄每人保留的完整週末數
  const reservedCounts = {};
  staffNames.forEach(name => {
    reservedCounts[name] = 0;
  });

  // 對每個週末配對，檢查每個人是否保留該完整或單日週末
  weekendPairs.forEach(pair => {
    const [satDate, sunDate] = pair;
    const satRow = rows.find(r => r.querySelector("td").textContent.startsWith(satDate));
    const sunRow = sunDate ? rows.find(r => r.querySelector("td").textContent.startsWith(sunDate)) : null;

    staffNames.forEach(name => {
      if (satRow && sunRow) {
        // 完整週末
        let isReserved = true;
        for (let colIndex = 1; colIndex < headers.length; colIndex++) {
          const satCell = satRow.querySelectorAll("td")[colIndex];
          const sunCell = sunRow.querySelectorAll("td")[colIndex];
          if (satCell.textContent === name || sunCell.textContent === name) {
            isReserved = false;
            break;
          }
        }
        if (isReserved) reservedCounts[name]++;
      } else if (satRow && !sunRow) {
        // 單日週六：只要該週六所有欄位都不是 name，就算保留一次
        let isReserved = true;
        for (let colIndex = 1; colIndex < headers.length; colIndex++) {
          if (satRow.querySelectorAll("td")[colIndex].textContent === name) {
            isReserved = false;
            break;
          }
        }
        if (isReserved) reservedCounts[name]++;
      } else if (!satRow && sunRow) {
        // 單日週日：只要該週日所有欄位都不是 name，就算保留一次
        let isReserved = true;
        for (let colIndex = 1; colIndex < headers.length; colIndex++) {
          if (sunRow.querySelectorAll("td")[colIndex].textContent === name) {
            isReserved = false;
            break;
          }
        }
        if (isReserved) reservedCounts[name]++;
      }
    });
  });

  // 建立清單顯示每人保留完整週末數，並顯示總週末數與本月排班次數
  const ul = document.createElement("ul");
  for (const [name, weekendFreeCount] of Object.entries(reservedCounts)) {
    const role = name.split(" ")[0];
    const limit = roleAssignmentLimits[role] || Infinity;
    // compute assigned count:
    const assignedCount = Array.from(scheduleTableBody.querySelectorAll("tr"))
      .reduce((sum, row) => {
        const cells = Array.from(row.querySelectorAll("td")).slice(1);
        return sum + cells.filter(c => c.textContent.trim() === name).length;
      }, 0);
    const remaining = limit - assignedCount;
    const li = document.createElement("li");
    li.textContent = `${name}：週末尚未排班 ${weekendFreeCount}/${totalWeekends}；本月排班 ${assignedCount}/${limit}（剩餘 ${remaining}）`;
    ul.appendChild(li);
  }
  weekendSummaryDiv.innerHTML = "<h3>週末 & 本月排班次數</h3>";
  weekendSummaryDiv.appendChild(ul);
}

// 新增自動排班功能
function autoAssign() {
  // 清空既有排班
  scheduleTableBody.querySelectorAll("tr").forEach(row => {
    Array.from(row.querySelectorAll("td")).slice(1).forEach(cell => cell.textContent = "");
  });
  // 重算週末配對
  weekendPairs = computeWeekendPairs(currentYear, currentMonth);

  // 取得人員與計次初始
  const staffItems = document.querySelectorAll("#staff-list > ul li");
  const staffNames = Array.from(staffItems).map(li => li.textContent);
  const assignedCount = {};
  staffNames.forEach(name => assignedCount[name] = 0);
  // track last assigned date for each person to prevent consecutive-day shifts
  const lastAssignedDate = {};

  // 建立欄位對應表：標題到 index
  const headerCells = Array.from(document.querySelectorAll("#schedule thead th"));
  const headers = headerCells.map(th => th.textContent);

  // 逐日、staff-centric分配，依照職稱優先區域
  scheduleTableBody.querySelectorAll("tr").forEach(row => {
    const dateStr = row.querySelector("td:first-child").textContent.split(" ")[0];
    // 先清空當日 assignment tracker
    const assignedToday = new Set();
    // Map zone name to its TD element
    const cells = Array.from(row.querySelectorAll("td")).slice(1);
    const zoneCells = {};
    headers.slice(1).forEach((zoneName, idx) => {
      zoneCells[zoneName] = cells[idx];
    });
    // Staff-centric assignment: least-assigned first
    const sortedStaff = staffNames.slice().sort((a, b) => assignedCount[a] - assignedCount[b]);
    sortedStaff.forEach(name => {
      if (assignedCount[name] >= (roleAssignmentLimits[name.split(" ")[0]] || Infinity)) return;
      if (assignedToday.has(name)) return;
      // skip if off or consecutive day
      const off = reservedOffDates[name] || {};
      if ((off.weekdays || []).includes(dateStr) || (off.weekends || []).includes(dateStr)) return;
      const prev = new Date(dateStr);
      prev.setDate(prev.getDate() - 1);
      const prevStr = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,"0")}-${String(prev.getDate()).padStart(2,"0")}`;
      if (lastAssignedDate[name] === prevStr) return;
      // pick first available zone in priority order
      const role = name.split(" ")[0];
      const priorities = roleZonePriority[role] || headers.slice(1);
     for (const zoneName of priorities) {
        // ★ Debug: 印出優先順序
        console.log(`trying zone: ${zoneName} for ${name} on ${dateStr}`)

        // 總值須最後填：若非總值區域仍有空格，先跳過總值
        if (zoneName === "總值") {
          const otherZones = headers.slice(1).filter(z => z !== "總值");
          // 檢查整個月：只要任一其他區域（Zone A/Zone B/MICU1/MICU2）在任何一天還有空格，就先跳過總值
          let monthHasEmpty = false;
          otherZones.forEach(z => {
            // 找到該欄在整張表的所有 cell
            const colIndex = headers.indexOf(z);
            Array.from(scheduleTableBody.querySelectorAll("tr")).forEach(r => {
              const cell = r.querySelectorAll("td")[colIndex];
              if (cell && cell.textContent.trim() === "") {
                monthHasEmpty = true;
              }
            });
          });
          console.log("總值月檢查", otherZones, "hasEmptyInMonth", monthHasEmpty);
          if (monthHasEmpty) continue;
        }
        // 若此格被禁用，略過
        const key = `${dateStr}|${zoneName}`;
        if (forbiddenCells.has(key)) continue;
        // 互斥檢查
        const assignedNames = Object.values(zoneCells)
          .map(c => c.textContent.trim())
          .filter(n => n);
        let blocked = false;
        for (const [a, b] of mutuallyExclusivePairs) {
          if (name === a && assignedNames.includes(b)) blocked = true;
          if (name === b && assignedNames.includes(a)) blocked = true;
        }
        if (blocked) continue;
        const cell = zoneCells[zoneName];
        if (cell && cell.textContent.trim() === "") {
          cell.textContent = name;
          assignedCount[name]++;
          assignedToday.add(name);
          lastAssignedDate[name] = dateStr;
          break;
        }
      }
    });
  });
  // 重新渲染週末 & 本月排班次數摘要
  renderWeekendSummary();
}  // 關閉 autoAssign 函式
function enableDragDrop() {
  document.querySelectorAll("#schedule tbody tr").forEach(row => {
    Array.from(row.querySelectorAll("td")).slice(1).forEach(cell => {
      cell.draggable = true;
      // touch / pointer 支援
      cell.addEventListener("pointerdown", e => {
        if (e.pointerType === "touch") {
          const name = cell.textContent.trim();
          if (!name) return;
          dragSrcCell = cell;
          dragSrcName = name;
          cell.style.opacity = "0.5";
          cell.setAttribute("dragging", "true");
          isDragging = true;
        }
      });
      cell.addEventListener("pointerup", e => {
        if (e.pointerType === "touch" && dragSrcCell) {
          // 找到手指抬起時的元素
          const elem = document.elementFromPoint(e.clientX, e.clientY);
          const targetCell = elem && elem.closest && elem.closest("td");
          if (targetCell && targetCell.cellIndex !== 0) {
            handleDrop(targetCell);
          }
          // 清除拖曳狀態
          dragSrcCell.removeAttribute("dragging");
          dragSrcCell.style.opacity = "";
          isDragging = false;
          dragSrcCell = null;
          dragSrcName = null;
        }
      });
      cell.addEventListener("dragstart", e => {
        const name = cell.textContent.trim();
        if (!name) { e.preventDefault(); return; }
        dragSrcCell = cell;
        dragSrcName = name;
        cell.style.opacity = "0.5";
        cell.setAttribute("dragging", "true");
        isDragging = true;
      });
      cell.addEventListener("dragend", () => {
        cell.removeAttribute("dragging");
        if (dragSrcCell) dragSrcCell.style.opacity = "";
        isDragging = false;
      });
      cell.addEventListener("dragover", e => e.preventDefault());
      cell.addEventListener("drop", e => {
        e.preventDefault(); e.stopPropagation();
        handleDrop(cell);
      });
    });
  });
}