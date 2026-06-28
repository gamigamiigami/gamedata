import wordData from './worddata.js';

/* ===============================
   Firebase lazy getters
=============================== */
function getSupabase() { return window.supabaseClient; }
function getSchoolCode() { return localStorage.getItem('schoolCode') || null; }

/* ===============================
   パスワード認証（SHA-256）
=============================== */
const _AH = "bfd86db114080042e8d40ec387b2cd01ed7a9d261c2d503c17e1e724a7b303a4";
async function _verifyPw(input) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("") === _AH;
}

/* ===============================
   禁止ワードフィルター
=============================== */
const _BAD = [
  "ちんちん","ちんこ","まんこ","ちんぽ","ちんぽこ","おちんちん","おちんぽ","ちんまん",
  "うんこ","うんち","くそやろう","くそったれ",
  "しね","死ね","ころせ","殺せ","しにさらせ","死にさらせ",
  "セックス","えっち","エッチ","レイプ","わいせつ",
  "fuck","shit","bitch","dick","pussy","nigger","nigga","cunt","asshole","motherfuck","whore","slut","cock",
];
function containsBadWord(text) {
  const t = text.toLowerCase();
  return _BAD.some(w => t.includes(w.toLowerCase()));
}

/* ===============================
   グローバルランキングリセット（管理者用）
=============================== */
async function globalResetRanking() {
  const pw = prompt("管理者パスワードを入力してください：");
  if (pw === null) return;
  const ok = await _verifyPw(pw);
  if (!ok) { alert("パスワードが違います"); return; }
  if (!confirm("グローバルランキングをリセットします。\nこの操作は取り消せません。よろしいですか？")) return;
  const supabase = getSupabase();
  if (!supabase) { alert("DB未接続"); return; }
  try {
    const { error } = await supabase.from('global_rankings').delete().eq('game_key', getCollectionName());
    if (error) throw error;
    alert("グローバルランキングをリセットしました");
    displayGlobalRanking();
  } catch (e) {
    alert("リセット失敗: " + e.message);
  }
}

/* ===============================
   deviceId
=============================== */
(function ensureDeviceId() {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = "dev-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem("deviceId", id);
  }
})();

/* ===============================
   EmailJS 違反通知
=============================== */
const _EJS_PK  = "njxurV_IW84nYD01w";
const _EJS_SVC = "service_0eqi1dy";
const _EJS_TPL = "template_gp9y1ai";
let _ejsReady = false;
async function _loadEmailJS() {
  if (_ejsReady) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    s.onload = () => { emailjs.init({ publicKey: _EJS_PK }); _ejsReady = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
async function logViolation(username) {
  const deviceId   = localStorage.getItem("deviceId") || "unknown";
  const deviceInfo = `${screen.width}×${screen.height} / ${navigator.userAgent}`;
  const dateStr    = new Date().toLocaleString("ja-JP");
  const supabase = getSupabase();
  if (supabase) {
    supabase.from('violations').insert({
      name: username, game: "英語不規則動詞",
      date: new Date().toISOString(), device_id: deviceId, device_info: deviceInfo,
    }).then(() => {}).catch(() => {});
  }
  _loadEmailJS().then(() => {
    emailjs.send(_EJS_SVC, _EJS_TPL, {
      bad_name: username, game: "英語不規則動詞",
      device_id: deviceId, device_info: deviceInfo, date: dateStr,
    }).catch(() => {});
  }).catch(() => {});
}

/* ===============================
   文字幅計算（全角=2, 半角=1）
=============================== */
function displayWidth(str) {
  let w = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    w += (
      (cp >= 0x1100 && cp <= 0x115F) ||
      (cp >= 0x2E80 && cp <= 0xA4CF && cp !== 0x303F) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE10 && cp <= 0xFE19) ||
      (cp >= 0xFE30 && cp <= 0xFE6F) ||
      (cp >= 0xFF01 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||
      cp >= 0x1F300
    ) ? 2 : 1;
  }
  return w;
}

/* ===============================
   ゲーム定数
=============================== */
const TIME_LIMIT          = 60;
const SPAWN_INTERVAL      = 3200;
const PENALTY_TIME        = 3;
const ROW_HEIGHT          = 30;
const SORTING_AREA_ROWS   = 3;
const SORTING_AREA_HEIGHT = ROW_HEIGHT * SORTING_AREA_ROWS;
const FALL_SPEED          = 22;

// 単語の長さに応じた速度倍率（長い単語ほど少し遅い）
function getWordSpeed(word) {
  const len = word.length;
  if (len <= 3) return 1.00;
  if (len <= 5) return 0.92;
  if (len <= 7) return 0.85;
  if (len <= 9) return 0.78;
  return 0.70;
}

// 仕分け列：3形式
const SORT_CATEGORIES = [
  { id: "原形",   label: "原形\n(Base)" },
  { id: "過去形",  label: "過去形\n(Past)" },
  { id: "過去分詞", label: "過去分詞\n(P.P.)" },
];

/* ===============================
   ゲーム状態変数
=============================== */
let remainingTime = TIME_LIMIT;
let score = 0;
let currentCombo = 0;
let maxCombo = 0;
let fallingWords = [];
let landedWords  = [];
let lastSpawnTime = Date.now();
let gameOver = false;
let gameLoopId;
let timerIntervalId;
let lastFrameTime = Date.now();
let wordIdCounter = 0;
let selectedCategories = new Set();
let bonusEnabled = false;
let meaningMode = false;

// 間違い・ポーズ・復習
let wrongAnswers = [];
let isPaused     = false;
let reviewMode   = false;
let reviewQueue  = [];
let reviewIndex  = 0;

/* ===============================
   ズームリセット
=============================== */
function resetAndLockZoom() {
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}
function unlockZoom() {
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1.0');
}

/* ===============================
   ポーズ
=============================== */
function pauseGame() {
  if (isPaused || gameOver || reviewMode) return;
  isPaused = true;
  cancelAnimationFrame(gameLoopId);
  clearInterval(timerIntervalId);
  document.getElementById("pauseOverlay").classList.add("active");
}
function resumeGame() {
  if (!isPaused) return;
  isPaused = false;
  lastFrameTime = Date.now();
  lastSpawnTime = Date.now();
  document.getElementById("pauseOverlay").classList.remove("active");
  gameLoopId = requestAnimationFrame(gameLoop);
  startTimer();
}

/* ===============================
   単語表示更新（意味モード）
=============================== */
function updateWordDisplay(elem) {
  const word    = elem.dataset.word;
  const meaning = elem.dataset.meaning;
  if (meaningMode && meaning) {
    elem.innerHTML = `${word}<br><small class="meaning-hint">(${meaning})</small>`;
  } else {
    elem.textContent = word;
  }
}

/* ===============================
   結果画面
=============================== */
function showResultScreen() {
  gameScreen.style.display = "none";
  document.getElementById("resultScore").textContent      = score;
  document.getElementById("resultMaxCombo").textContent   = maxCombo;
  document.getElementById("resultWrongCount").textContent = wrongAnswers.length;

  const ul = document.getElementById("wrongList");
  ul.innerHTML = "";
  const wrongMap = new Map();
  wrongAnswers.forEach(wa => {
    if (wrongMap.has(wa.word)) wrongMap.get(wa.word).count++;
    else wrongMap.set(wa.word, { ...wa, count: 1 });
  });
  wrongMap.forEach(wa => {
    const li = document.createElement("li");
    const countStr = wa.count > 1 ? ` <span class="wrong-count">×${wa.count}</span>` : "";
    li.innerHTML = `<span class="wrong-word">${wa.word}</span> → <strong>${wa.correctType}</strong> <span class="wrong-note">(${wa.base} / ${wa.meaning})</span>${countStr}`;
    ul.appendChild(li);
  });

  document.getElementById("reviewButton").style.display =
    wrongAnswers.length > 0 ? "inline-block" : "none";
  document.getElementById("resultScreen").style.display = "block";
}

/* ===============================
   復習モード
=============================== */
function startReviewMode() {
  reviewMode = true;
  reviewQueue = [...wrongAnswers];
  reviewIndex = 0;

  document.getElementById("resultScreen").style.display = "none";
  gameScreen.style.display = "block";
  gameOver = false;
  fallingWords = [];
  landedWords  = [];

  playArea.innerHTML = "";
  playArea.appendChild(createSortingArea());

  timerDisplay.textContent    = "復習モード";
  comboDisplay.textContent    = "";
  maxComboDisplay.textContent = "";
  returnButton.textContent    = "復習を終える";

  showNextReviewWord();
}

function showNextReviewWord() {
  playArea.querySelectorAll(".word").forEach(w => w.remove());
  fallingWords = [];

  if (reviewIndex >= reviewQueue.length) {
    endReviewMode(true);
    return;
  }

  scoreDisplay.textContent = `${reviewIndex + 1} / ${reviewQueue.length}`;

  const item = reviewQueue[reviewIndex];
  const wordDiv = document.createElement("div");
  wordDiv.classList.add("word");
  wordDiv.dataset.word    = item.word;
  wordDiv.dataset.meaning = item.meaning;
  wordDiv.dataset.type    = item.correctType;
  wordDiv.dataset.base    = item.base;
  wordDiv.id = "rev_" + reviewIndex;
  wordDiv.dataset.locked    = "false";
  wordDiv.dataset.penalized = "false";
  wordDiv.style.cssText = "white-space:nowrap; position:absolute; visibility:hidden; top:-30px; left:0;";
  updateWordDisplay(wordDiv);
  playArea.appendChild(wordDiv);

  const w = wordDiv.offsetWidth;
  const x = (playArea.clientWidth - w) / 2;
  const y = Math.floor(playArea.clientHeight * 0.25);
  wordDiv.style.left       = x + "px";
  wordDiv.style.top        = y + "px";
  wordDiv.style.visibility = "visible";

  fallingWords = [{ element: wordDiv, x, y, speed: 0 }];
  wordDiv.addEventListener("mousedown", handleMouseDown);
  wordDiv.addEventListener("touchstart", handleTouchStart);
}

function endReviewMode(completed) {
  reviewMode = false;
  returnButton.textContent = "Return to START";
  gameScreen.style.display  = "none";
  startScreen.style.display = "block";
  showLocalRanking();
  unlockZoom();
  if (completed) alert("復習完了！全問正解しました！");
}

/* ===============================
   DOM取得
=============================== */
const playArea        = document.getElementById('playArea');
const timerDisplay    = document.getElementById('timer');
const scoreDisplay    = document.getElementById('score');
const comboDisplay    = document.getElementById('combo');
const maxComboDisplay = document.getElementById('maxCombo');
const startScreen     = document.getElementById('startScreen');
const gameScreen      = document.getElementById('gameScreen');
const returnButton    = document.getElementById('returnButton');
const startButton     = document.getElementById('startButton');
const bonusToggleButton = document.getElementById('bonusToggleButton');

/* ===============================
   カテゴリ一覧
=============================== */
const availableCategories = [...new Set(wordData.map(item => item.category))];

/* ===============================
   ランキング
=============================== */
function getLocalKey()       { return "ranksEnglishIrregular" + (bonusEnabled ? "" : "_nobonus"); }
function getCollectionName() { return "ranksEnglishIrregular" + (bonusEnabled ? "" : "_nobonus"); }

const specialEntries = [
  { username: "👆👆👆👆Sランク👆👆👆👆", score: 5000, time: new Date("2025-02-15").getTime() },
  { username: "👆👆👆👆Aランク👆👆👆👆", score: 3000, time: new Date("2025-02-15").getTime() },
  { username: "👆👆👆👆Bランク👆👆👆👆", score: 1500, time: new Date("2025-02-15").getTime() },
  { username: "👆👆👆👆Cランク👆👆👆👆", score: 800,  time: new Date("2025-02-15").getTime() },
  { username: "👆👆👆👆Dランク👆👆👆👆", score: 0,    time: new Date("2025-02-15").getTime() },
];
function isSpecial(entry) {
  return specialEntries.some(s => s.username === entry.username && s.score === entry.score);
}

function saveLocalScore(username, sc) {
  const key = getLocalKey();
  let rankings = JSON.parse(localStorage.getItem(key)) || [];
  rankings.push({ username, score: sc, time: Date.now() });
  specialEntries.forEach(s => {
    if (!rankings.some(e => e.username === s.username && e.score === s.score)) rankings.push(s);
  });
  rankings.sort((a, b) => b.score - a.score || a.time - b.time);
  const specials = rankings.filter(isSpecial);
  const normals  = rankings.filter(e => !isSpecial(e)).slice(0, 10);
  const combined = [...specials, ...normals];
  combined.sort((a, b) => b.score - a.score || a.time - b.time);
  localStorage.setItem(key, JSON.stringify(combined));
  displayLocalRanking();
}

function displayLocalRanking() {
  const tbody = document.querySelector("#ranking-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const key = getLocalKey();
  let rankings = JSON.parse(localStorage.getItem(key)) || [];
  specialEntries.forEach(s => {
    if (!rankings.some(e => e.username === s.username && e.score === s.score)) rankings.push(s);
  });
  rankings.sort((a, b) => b.score - a.score || a.time - b.time);
  rankings.forEach(entry => {
    const tr = document.createElement("tr");
    if (isSpecial(entry)) tr.classList.add("rank-border-row");
    const dateCell = document.createElement("td");
    if (isSpecial(entry)) {
      dateCell.textContent = entry.username;
      dateCell.colSpan = 3;
      dateCell.style.textAlign = "center";
      tr.appendChild(dateCell);
    } else {
      const d = new Date(entry.time);
      dateCell.textContent = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
      const nameCell  = document.createElement("td"); nameCell.textContent  = entry.username;
      const scoreCell = document.createElement("td"); scoreCell.textContent = entry.score;
      tr.append(dateCell, nameCell, scoreCell);
    }
    tbody.appendChild(tr);
  });
}

async function displayGlobalRanking() {
  const tbody = document.querySelector("#alt-ranking-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='3'>読み込み中...</td></tr>";
  const supabase   = getSupabase();
  const schoolCode = getSchoolCode();
  if (!supabase) { tbody.innerHTML = "<tr><td colspan='3'>DB未接続</td></tr>"; return; }
  try {
    let q;
    if (schoolCode) {
      q = supabase.from('school_rankings').select('player, score, device_id')
        .eq('school_code', schoolCode).eq('game_key', getCollectionName())
        .order('score', { ascending: false }).limit(3000);
    } else {
      q = supabase.from('global_rankings').select('player, score, device_id')
        .eq('game_key', getCollectionName())
        .order('score', { ascending: false }).limit(3000);
    }
    const { data, error } = await q;
    if (error) throw error;
    tbody.innerHTML = "";
    const seenDevices = new Set();
    let count = 0;
    for (const row of (data || [])) {
      if (row.device_id && seenDevices.has(row.device_id)) continue;
      if (row.device_id) seenDevices.add(row.device_id);
      count++;
      if (count > 30) break;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${count}</td><td>${row.player}</td><td>${row.score}</td>`;
      tbody.appendChild(tr);
    }
    if (count === 0) {
      const label = schoolCode ? '学校内のデータなし' : 'データなし';
      tbody.innerHTML = `<tr><td colspan='3'>${label}</td></tr>`;
    }
  } catch (e) {
    tbody.innerHTML = "<tr><td colspan='3'>取得エラー</td></tr>";
  }
}

async function saveGlobalScore(username, sc) {
  if (containsBadWord(username)) { logViolation(username); return; }
  const supabase   = getSupabase();
  const schoolCode = getSchoolCode();
  if (!supabase) return;
  const today    = new Date().toISOString().slice(0, 10);
  const deviceId = localStorage.getItem("deviceId");
  try {
    const { error } = await supabase.from('global_rankings').insert({ game_key: getCollectionName(), date: today, player: username, score: sc, device_id: deviceId });
    if (error) console.error("Supabase 保存エラー:", error);
    if (schoolCode) {
      const { error: e2 } = await supabase.from('school_rankings').insert({ school_code: schoolCode, game_key: getCollectionName(), date: today, player: username, score: sc, device_id: deviceId });
      if (e2) console.error("学校ランキング保存エラー:", e2);
    }
  } catch (e) {
    console.error("Supabase 保存エラー:", e);
  }
}

/* ===============================
   ランキング切り替え
=============================== */
let rankingState = "none";

function showLocalRanking() {
  document.getElementById("ranking-table").style.display = "table";
  document.getElementById("alt-ranking-table").style.display = "none";
  document.getElementById("resetRankingButton").style.display = "inline-block";
  document.getElementById("changeNameButton").style.display = "inline-block";
  const gr = document.getElementById("globalResetButton");
  if (gr) gr.style.display = "none";
  displayLocalRanking();
  rankingState = "local";
  document.getElementById("rankingToggleButton").textContent = "グローバルランキング";
}

function showGlobalRanking() {
  document.getElementById("ranking-table").style.display = "none";
  document.getElementById("alt-ranking-table").style.display = "table";
  document.getElementById("resetRankingButton").style.display = "none";
  document.getElementById("changeNameButton").style.display = "none";
  const gr = document.getElementById("globalResetButton");
  if (gr) gr.style.display = "inline-block";
  displayGlobalRanking();
  rankingState = "global";
  document.getElementById("rankingToggleButton").textContent = "My ベストスコア";
}

/* ===============================
   チェックボックス生成
=============================== */
function createCategoryCheckboxes() {
  const container = document.getElementById('categoryCheckboxes');
  container.innerHTML = '';
  availableCategories.forEach(cat => {
    const div      = document.createElement('div');
    const checkbox = document.createElement('input');
    checkbox.type    = 'checkbox';
    checkbox.id      = `cat-${cat}`;
    checkbox.value   = cat;
    checkbox.checked = true;
    const label    = document.createElement('label');
    label.htmlFor  = `cat-${cat}`;
    label.textContent = cat;
    div.appendChild(checkbox);
    div.appendChild(label);
    container.appendChild(div);
    selectedCategories.add(cat);
    checkbox.addEventListener('change', e => {
      if (e.target.checked) selectedCategories.add(cat);
      else selectedCategories.delete(cat);
    });
  });
}

/* ===============================
   ゲーム関数
=============================== */
function generateUniqueId() { return "word_" + wordIdCounter++; }

function updateTimerDisplay() { timerDisplay.textContent = "Time: " + remainingTime; }
function updateScoreDisplay() { scoreDisplay.textContent = "Score: " + score; }
function updateComboDisplay() {
  comboDisplay.textContent    = "Combo: " + currentCombo;
  maxComboDisplay.textContent = "Max: " + maxCombo;
  if (currentCombo > 0 && currentCombo % 50 === 0) {
    comboDisplay.classList.add("combo-effect-50");
    setTimeout(() => comboDisplay.classList.remove("combo-effect-50"), 700);
  } else if (currentCombo > 0 && currentCombo % 10 === 0) {
    comboDisplay.classList.add("combo-effect");
    setTimeout(() => comboDisplay.classList.remove("combo-effect"), 500);
  }
}

function createSortingArea() {
  const overlay = document.createElement("div");
  overlay.id = "sortingAreaOverlay";
  overlay.style.height = SORTING_AREA_HEIGHT + "px";
  SORT_CATEGORIES.forEach(({ id, label }) => {
    const col = document.createElement("div");
    col.classList.add("sorting-column");
    col.dataset.category = id;
    col.innerHTML = `<span class="sorting-label">${label.replace('\n', '<br>')}</span>`;
    overlay.appendChild(col);
  });
  return overlay;
}

function getDecisionLineY() {
  const baseLine = playArea.clientHeight - SORTING_AREA_HEIGHT;
  if (landedWords.length === 0) return baseLine;
  return Math.min(baseLine, Math.min(...landedWords.map(lw => lw.y)));
}

function spawnWord(presetX) {
  const filtered = wordData.filter(w => selectedCategories.has(w.category));
  if (filtered.length === 0) return;
  const data = filtered[Math.floor(Math.random() * filtered.length)];

  const wordDiv = document.createElement("div");
  wordDiv.classList.add("word");
  wordDiv.dataset.word    = data.word;
  wordDiv.dataset.meaning = data.meaning;
  wordDiv.dataset.base    = data.base;
  wordDiv.dataset.type    = data.type;
  wordDiv.id = generateUniqueId();
  wordDiv.dataset.locked    = "false";
  wordDiv.dataset.penalized = "false";
  wordDiv.style.whiteSpace  = "nowrap";
  wordDiv.style.position    = "absolute";
  wordDiv.style.left        = "0px";
  wordDiv.style.top         = "-50px";
  wordDiv.style.visibility  = "hidden";
  updateWordDisplay(wordDiv);
  playArea.appendChild(wordDiv);

  const measuredWidth = wordDiv.offsetWidth;
  const margin = 10;
  let x;
  const maxAttempts = 10;
  let attempts = 0;

  if (presetX !== undefined) {
    x = Math.max(margin, Math.min(presetX, playArea.clientWidth - measuredWidth - margin));
    const overlap = fallingWords.some(w => x < w.x + w.element.offsetWidth && x + measuredWidth > w.x);
    if (overlap) presetX = undefined;
  }
  if (presetX === undefined) {
    do {
      x = margin + Math.random() * (playArea.clientWidth - measuredWidth - 2 * margin);
      const overlap = fallingWords.some(w => x < w.x + w.element.offsetWidth && x + measuredWidth > w.x);
      if (!overlap) break;
      attempts++;
    } while (attempts < maxAttempts);
  }

  wordDiv.style.left       = x + "px";
  wordDiv.style.visibility = "visible";
  wordDiv.style.top        = "-50px";

  wordDiv.addEventListener("mousedown", handleMouseDown);
  wordDiv.addEventListener("touchstart", handleTouchStart);

  const speedMult = getWordSpeed(data.word);
  fallingWords.push({ element: wordDiv, x, y: -50, speed: FALL_SPEED * speedMult, speedMult });
}

function lockWord(wordElem, dropCategory) {
  if (wordElem.dataset.locked === "true") return;
  wordElem.dataset.locked = "true";
  const correct = wordElem.dataset.type === dropCategory;
  if (correct) {
    wordElem.classList.add("correct");
    score += selectedCategories.size * 20;
    if (bonusEnabled) remainingTime += 1;
    currentCombo++;
    if (currentCombo > maxCombo) maxCombo = currentCombo;
    updateComboDisplay();
    updateTimerDisplay();
    updateScoreDisplay();
    setTimeout(() => { wordElem.remove(); }, 500);
  }
  fallingWords = fallingWords.filter(w => w.element !== wordElem);
}

function showPenaltyEffect(x, y) {
  const effect = document.createElement("div");
  effect.classList.add("penalty-effect");
  effect.textContent = "−3s";
  effect.style.left = x + "px";
  effect.style.top  = y + "px";
  playArea.appendChild(effect);
  setTimeout(() => { effect.remove(); }, 1000);
}

/* ===============================
   ドラッグ＆ドロップ
=============================== */
let currentDrag = null;

function handleMouseDown(e) {
  const wordElem = e.currentTarget;
  if (wordElem.dataset.locked === "true") return;
  if (wordElem.dataset.penalized === "true") return;
  e.preventDefault();
  const rect   = wordElem.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  currentDrag = { element: wordElem, offsetX, offsetY };
  wordElem.classList.add("dragging");
}

function handleMouseMove(e) {
  if (!currentDrag) return;
  const playAreaRect = playArea.getBoundingClientRect();
  let newX = e.clientX - playAreaRect.left - currentDrag.offsetX;
  let newY = e.clientY - playAreaRect.top  - currentDrag.offsetY;
  const wordElem = currentDrag.element;
  newX = Math.max(0, Math.min(newX, playArea.clientWidth  - wordElem.offsetWidth));
  newY = Math.max(0, Math.min(newY, playArea.clientHeight - wordElem.offsetHeight));
  wordElem.style.left = newX + "px";
  wordElem.style.top  = newY + "px";
  const fw = fallingWords.find(w => w.element === wordElem);
  if (fw) { fw.x = newX; fw.y = newY; }
}

function handleMouseUp(e) {
  if (!currentDrag) return;
  const wordElem = currentDrag.element;
  wordElem.classList.remove("dragging");
  const top = parseInt(wordElem.style.top);

  if (reviewMode) {
    if (top >= getDecisionLineY() && wordElem.dataset.locked === "false") {
      const dropX = parseInt(wordElem.style.left) + wordElem.offsetWidth / 2;
      const columnWidth = playArea.clientWidth / SORT_CATEGORIES.length;
      const dropCategory = SORT_CATEGORIES[Math.floor(dropX / columnWidth)].id;
      if (wordElem.dataset.type === dropCategory) {
        wordElem.classList.add("correct");
        wordElem.dataset.locked = "true";
        setTimeout(() => { reviewIndex++; showNextReviewWord(); }, 500);
      } else {
        wordElem.classList.add("wrong");
        setTimeout(() => wordElem.classList.remove("wrong"), 500);
        const fw = fallingWords[0];
        if (fw) {
          const x = (playArea.clientWidth - wordElem.offsetWidth) / 2;
          const y = Math.floor(playArea.clientHeight * 0.25);
          fw.x = x; fw.y = y;
          wordElem.style.left = x + "px";
          wordElem.style.top  = y + "px";
        }
      }
    }
    currentDrag = null;
    return;
  }

  if (top >= getDecisionLineY() && wordElem.dataset.locked === "false") {
    const dropX = parseInt(wordElem.style.left) + wordElem.offsetWidth / 2;
    const columnWidth = playArea.clientWidth / SORT_CATEGORIES.length;
    const dropCategory = SORT_CATEGORIES[Math.floor(dropX / columnWidth)].id;
    if (wordElem.dataset.type === dropCategory && wordElem.dataset.penalized !== "true") {
      lockWord(wordElem, dropCategory);
    } else if (wordElem.dataset.penalized !== "true") {
      wordElem.classList.add("wrong");
      wordElem.style.pointerEvents = "none";
      currentDrag = null;
      remainingTime -= PENALTY_TIME;
      updateTimerDisplay();
      wordElem.dataset.penalized = "true";
      currentCombo = 0;
      updateComboDisplay();
      showPenaltyEffect(parseInt(wordElem.style.left) + wordElem.offsetWidth / 2, top - 20);
      wrongAnswers.push({
        word: wordElem.dataset.word,
        correctType: wordElem.dataset.type,
        meaning: wordElem.dataset.meaning,
        base: wordElem.dataset.base,
      });
    }
  }
  currentDrag = null;
}

function handleTouchStart(e) {
  const touch = e.touches[0];
  e.preventDefault();
  handleMouseDown({ currentTarget: e.currentTarget, clientX: touch.clientX, clientY: touch.clientY, preventDefault: e.preventDefault.bind(e) });
}
function handleTouchMove(e) {
  if (!currentDrag) return;
  const touch = e.touches[0];
  handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
}
function handleTouchEnd(e) {
  if (!currentDrag) return;
  const touch = e.changedTouches[0];
  handleMouseUp({ clientX: touch.clientX, clientY: touch.clientY });
}

/* ===============================
   ゲームループ
=============================== */
function gameLoop() {
  if (gameOver) return;
  const now   = Date.now();
  const delta = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  fallingWords.forEach(word => {
    if (word.element.dataset.locked === "true") return;
    const currentSpeed = word.speed + 2 * Math.floor(score / 600) * (word.speedMult || 1);
    let newY = word.y + currentSpeed * delta;
    const wordHeight    = word.element.offsetHeight;
    const decisionLineY = getDecisionLineY();

    if (newY >= decisionLineY) {
      const dropX = word.x + word.element.offsetWidth / 2;
      const columnWidth = playArea.clientWidth / SORT_CATEGORIES.length;
      const dropCategory = SORT_CATEGORIES[Math.floor(dropX / columnWidth)].id;

      if (word.element.dataset.type === dropCategory) {
        lockWord(word.element, dropCategory);
        return;
      } else {
        if (word.element.dataset.penalized !== "true") {
          word.element.classList.add("wrong");
          word.element.style.pointerEvents = "none";
          if (currentDrag && currentDrag.element === word.element) {
            word.element.classList.remove("dragging");
            currentDrag = null;
          }
          remainingTime -= PENALTY_TIME;
          updateTimerDisplay();
          word.element.dataset.penalized = "true";
          showPenaltyEffect(word.x + word.element.offsetWidth / 2, newY - 20);
          currentCombo = 0;
          updateComboDisplay();
          wrongAnswers.push({
            word: word.element.dataset.word,
            correctType: word.element.dataset.type,
            meaning: word.element.dataset.meaning,
            base: word.element.dataset.base,
          });
        }
        let landingY = playArea.clientHeight - wordHeight;
        landedWords.forEach(lw => {
          const wL = word.x, wR = word.x + word.element.offsetWidth;
          const lL = lw.x,  lR = lw.x + lw.element.offsetWidth;
          if (!(wR < lL || wL > lR)) landingY = Math.min(landingY, lw.y - wordHeight);
        });
        if (newY >= landingY) {
          newY = landingY;
          word.y = newY;
          word.element.style.top = word.y + "px";
          word.element.dataset.locked = "true";
          landedWords.push({ element: word.element, x: word.x, y: newY });
          word.landed = true;
          return;
        }
      }
    }
    word.y = newY;
    word.element.style.top = word.y + "px";
  });

  fallingWords = fallingWords.filter(w => !w.landed && !w.remove);

  const sortingOverlay = document.getElementById("sortingAreaOverlay");
  if (sortingOverlay) {
    const dl = getDecisionLineY();
    sortingOverlay.style.top    = dl + "px";
    sortingOverlay.style.height = (playArea.clientHeight - dl) + "px";
  }

  if (now - lastSpawnTime > SPAWN_INTERVAL) {
    let spawnCount = 1 + Math.floor(score / 1600);
    if (spawnCount > 1) {
      const wordWidth  = 80;
      const totalSpace = playArea.clientWidth - wordWidth;
      const spacing    = totalSpace / (spawnCount - 1);
      for (let i = 0; i < spawnCount; i++) spawnWord(i * spacing);
    } else {
      spawnWord();
    }
    lastSpawnTime = now;
  }

  gameLoopId = requestAnimationFrame(gameLoop);
}

/* ===============================
   タイマー
=============================== */
function startTimer() {
  timerIntervalId = setInterval(() => {
    remainingTime--;
    updateTimerDisplay();
    if (remainingTime <= 0) {
      clearInterval(timerIntervalId);
      endGame();
    }
  }, 1000);
}

/* ===============================
   プレイヤー名
=============================== */
function getPlayerName() {
  let name = localStorage.getItem("playerName");
  if (!name) {
    while (true) {
      name = prompt("プレイヤー名を入力してください（全角8文字・半角16文字以内）") || "名無し";
      if (displayWidth(name) > 16) {
        alert("全角8文字（半角16文字）以内で入力してください");
      } else {
        break;
      }
    }
    localStorage.setItem("playerName", name);
  }
  return name;
}

/* ===============================
   ゲーム終了
=============================== */
function endGame() {
  gameOver = true;
  cancelAnimationFrame(gameLoopId);
  clearInterval(timerIntervalId);
  fallingWords.forEach(w => { w.element.style.opacity = 0.5; });

  const username = getPlayerName();
  saveLocalScore(username, score);
  saveGlobalScore(username, score);
  showResultScreen();
}

/* ===============================
   ゲーム初期化
=============================== */
function initGame() {
  if (selectedCategories.size === 0) {
    alert("少なくとも1つのカテゴリを選択してください！");
    return;
  }

  // 意味モードをスタート画面のチェックボックスから取得
  const meaningCheck = document.getElementById("meaningModeCheck");
  meaningMode = meaningCheck ? meaningCheck.checked : false;

  resetAndLockZoom();

  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);

  remainingTime = TIME_LIMIT;
  score         = 0;
  currentCombo  = 0;
  maxCombo      = 0;
  wrongAnswers  = [];
  isPaused      = false;
  reviewMode    = false;
  fallingWords  = [];
  landedWords   = [];
  lastSpawnTime = Date.now() - (SPAWN_INTERVAL - 300);
  lastFrameTime = Date.now();
  gameOver      = false;

  returnButton.textContent = "Return to START";
  document.getElementById("resultScreen").style.display = "none";

  updateComboDisplay();
  playArea.innerHTML = "";
  playArea.appendChild(createSortingArea());
  updateTimerDisplay();
  updateScoreDisplay();

  gameLoopId = requestAnimationFrame(gameLoop);
  startTimer();
  gameScreen.style.display  = "block";
  startScreen.style.display = "none";
}

/* ===============================
   イベントリスナー
=============================== */
document.addEventListener("mousemove", handleMouseMove);
document.addEventListener("mouseup",   handleMouseUp);
document.addEventListener("touchmove", handleTouchMove, { passive: false });
document.addEventListener("touchend",  handleTouchEnd);

returnButton.addEventListener("click", () => {
  if (reviewMode) { endReviewMode(false); return; }
  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);
  gameScreen.style.display  = "none";
  startScreen.style.display = "block";
  unlockZoom();
});

startButton.addEventListener("click", () => { initGame(); });

document.getElementById("backButton").addEventListener("click", () => {
  window.history.back();
});

bonusToggleButton.addEventListener("click", () => {
  bonusEnabled = !bonusEnabled;
  bonusToggleButton.textContent = bonusEnabled ? "ボーナス: ON" : "ボーナス: OFF";
  if (rankingState === "local")  displayLocalRanking();
  else if (rankingState === "global") displayGlobalRanking();
});

document.getElementById("rankingToggleButton").addEventListener("click", () => {
  if (rankingState === "local") showGlobalRanking();
  else showLocalRanking();
});

document.getElementById("resetRankingButton").addEventListener("click", () => {
  if (confirm("ローカルランキングをリセットしますか？")) {
    localStorage.removeItem(getLocalKey());
    displayLocalRanking();
  }
});

document.getElementById("changeNameButton").addEventListener("click", () => {
  let newName;
  while (true) {
    newName = prompt("新しい名前を入力してください（全角8文字・半角16文字以内）");
    if (newName === null) return;
    if (newName.trim() === "") {
      alert("空の名前は使えません");
    } else if (displayWidth(newName) > 16) {
      alert("全角8文字（半角16文字）以内で入力してください");
    } else {
      break;
    }
  }
  localStorage.setItem("playerName", newName);
  alert(`名前を「${newName}」に変更しました`);
});

document.getElementById("globalResetButton").addEventListener("click", globalResetRanking);
document.getElementById("pauseButton").addEventListener("click", pauseGame);
document.getElementById("resumeButton").addEventListener("click", resumeGame);
document.getElementById("reviewButton").addEventListener("click", startReviewMode);
document.getElementById("resultReturnButton").addEventListener("click", () => {
  document.getElementById("resultScreen").style.display = "none";
  startScreen.style.display = "block";
  showLocalRanking();
  unlockZoom();
});

/* ===============================
   初期化
=============================== */
createCategoryCheckboxes();
showLocalRanking();
