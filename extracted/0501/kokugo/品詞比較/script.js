import wordData from './worddata.js';

/* ===============================
   Supabase / 学校ログイン
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
    const { error } = await supabase
      .from('global_rankings')
      .delete()
      .eq('game_key', getCollectionName());
    if (error) throw error;
    alert("グローバルランキングをリセットしました");
    displayGlobalRanking();
  } catch (e) {
    alert("リセット失敗: " + e.message);
    console.error(e);
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
   文の中のターゲット語をハイライト
=============================== */
function buildTileHTML(sentence, word) {
  const idx = sentence.indexOf(word);
  if (idx === -1) return sentence;
  return (
    sentence.slice(0, idx) +
    `<span class="target-word">${word}</span>` +
    sentence.slice(idx + word.length)
  );
}

/* ===============================
   品詞の列順（品詞プラスと同じ優先順位）
=============================== */
const TYPE_ORDER = ["助詞","助動詞","感動詞","接続詞","連体詞","副詞","名詞","形容動詞","形容詞","動詞"];

// wordData（ペア配列）から使用する品詞を抽出
const _seenTypes = new Set();
wordData.forEach(pair => { _seenTypes.add(pair.a.type); _seenTypes.add(pair.b.type); });
const selectedTypes = new Set(TYPE_ORDER.filter(t => _seenTypes.has(t)));

/* ===============================
   グローバル変数
=============================== */
const TIME_LIMIT   = 60;
const FALL_SPEED   = 15;
const SPAWN_INTERVAL = 5000;
const PENALTY_TIME = 3;
const ROW_HEIGHT   = 30;
const SORTING_AREA_ROWS   = 3;
const SORTING_AREA_HEIGHT = ROW_HEIGHT * SORTING_AREA_ROWS;
const BASE_SCORE   = 100;
const PAIR_BONUS   = 150;

let remainingTime = TIME_LIMIT;
let score = 0;
let currentCombo = 0;
let maxCombo = 0;
let pairCompleteCount = 0;
let fallingWords = [];
let landedWords = [];
let lastSpawnTime = Date.now();
let gameOver = false;
let gameLoopId;
let timerIntervalId;
let lastFrameTime = Date.now();
let wordIdCounter = 0;
let pairIdCounter = 0;
let bonusEnabled = false;

let wrongAnswers = [];
let isPaused = false;
let reviewMode = false;
let reviewQueue = [];
let reviewIndex = 0;

// pairId -> { correctCount, resolvedCount }
const pairTracker = new Map();

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

// タブ切り替え時に自動ポーズ。復帰時は自動再開（スマホ通知等の誤ポーズ防止）
let _tabPaused = false;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (!isPaused && !gameOver) { pauseGame(); _tabPaused = true; }
  } else if (_tabPaused) {
    _tabPaused = false;
    resumeGame();
  }
});

/* ===============================
   結果画面
=============================== */
function showResultScreen() {
  gameScreen.style.display = "none";
  document.getElementById("resultScore").textContent = score;
  document.getElementById("resultMaxCombo").textContent = maxCombo;
  document.getElementById("resultPairCount").textContent = pairCompleteCount;
  document.getElementById("resultWrongCount").textContent = wrongAnswers.length;

  const ul = document.getElementById("wrongList");
  ul.innerHTML = "";
  const wrongMap = new Map();
  wrongAnswers.forEach(wa => {
    const key = wa.sentence + "|" + wa.word;
    if (wrongMap.has(key)) wrongMap.get(key).count++;
    else wrongMap.set(key, { ...wa, count: 1 });
  });
  wrongMap.forEach(wa => {
    const li = document.createElement("li");
    const sentenceHTML = buildTileHTML(wa.sentence, wa.word);
    const countStr = wa.count > 1 ? ` <span style="color:#f90;font-weight:bold;">×${wa.count}</span>` : "";
    li.innerHTML = `<span class="wrong-sentence">${sentenceHTML}</span> → <strong>${wa.correctType}</strong>${countStr}`;
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
  landedWords = [];

  playArea.innerHTML = "";
  playArea.appendChild(createSortingArea());

  timerDisplay.textContent = "復習モード";
  comboDisplay.textContent = "";
  maxComboDisplay.textContent = "";
  returnButton.textContent = "復習を終える";

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
  wordDiv.innerHTML = buildTileHTML(item.sentence, item.word);
  wordDiv.dataset.type = item.correctType;
  wordDiv.dataset.word = item.word;
  wordDiv.dataset.sentence = item.sentence;
  wordDiv.dataset.pairId = "-1";
  wordDiv.id = generateUniqueId();
  wordDiv.dataset.locked = "false";
  wordDiv.dataset.penalized = "false";
  wordDiv.style.whiteSpace = "nowrap";
  wordDiv.style.position = "absolute";
  wordDiv.style.visibility = "hidden";
  wordDiv.style.top = "-30px";
  wordDiv.style.left = "0px";
  playArea.appendChild(wordDiv);

  const w = wordDiv.offsetWidth;
  const x = (playArea.clientWidth - w) / 2;
  const y = Math.floor(playArea.clientHeight * 0.25);
  wordDiv.style.left = x + "px";
  wordDiv.style.top = y + "px";
  wordDiv.style.visibility = "visible";

  fallingWords = [{ element: wordDiv, x, y, speed: 0 }];
  wordDiv.addEventListener("mousedown", handleMouseDown);
  wordDiv.addEventListener("touchstart", handleTouchStart);
}

function endReviewMode(completed) {
  reviewMode = false;
  returnButton.textContent = "Return to START";
  gameScreen.style.display = "none";
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
   ローカルランキング
=============================== */
function getLocalKey() {
  return "rankings品詞比較" + (bonusEnabled ? "" : "_nobonus");
}

function getCollectionName() {
  return "ranks品詞比較" + (bonusEnabled ? "" : "_nobonus");
}

const specialEntries = [
  { username: "👆👆👆👆Sランク👆👆👆👆", score: 6000, time: new Date("2025-02-15T00:00:00").getTime() },
  { username: "👆👆👆👆Aランク👆👆👆👆", score: 4000, time: new Date("2025-02-15T00:00:00").getTime() },
  { username: "👆👆👆👆Bランク👆👆👆👆", score: 2000, time: new Date("2025-02-15T00:00:00").getTime() },
  { username: "👆👆👆👆Cランク👆👆👆👆", score: 1000, time: new Date("2025-02-15T00:00:00").getTime() },
  { username: "👆👆👆👆Dランク👆👆👆👆", score: 0,    time: new Date("2025-02-15T00:00:00").getTime() },
];

function isSpecial(entry) {
  return specialEntries.some(s => s.username === entry.username && s.score === entry.score);
}

function saveLocalScore(username, score) {
  const key = getLocalKey();
  let rankings = JSON.parse(localStorage.getItem(key)) || [];
  rankings.push({ username, score, time: Date.now() });
  specialEntries.forEach(s => {
    if (!rankings.some(e => e.username === s.username && e.score === s.score)) {
      rankings.push(s);
    }
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
    if (!rankings.some(e => e.username === s.username && e.score === s.score)) {
      rankings.push(s);
    }
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

/* ===============================
   グローバルランキング (Firestore)
=============================== */
async function displayGlobalRanking() {
  const tbody = document.querySelector("#alt-ranking-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "<tr><td colspan='3'>読み込み中...</td></tr>";
  const supabase   = getSupabase();
  const schoolCode = getSchoolCode();
  if (!supabase) {
    tbody.innerHTML = "<tr><td colspan='3'>DB未接続</td></tr>";
    return;
  }
  try {
    let q;
    if (schoolCode) {
      q = supabase.from('school_rankings')
        .select('player, score, device_id')
        .eq('school_code', schoolCode)
        .eq('game_key', getCollectionName())
        .order('score', { ascending: false })
        .limit(3000);
    } else {
      q = supabase.from('global_rankings')
        .select('player, score, device_id')
        .eq('game_key', getCollectionName())
        .order('score', { ascending: false })
        .limit(3000);
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
    console.error("Supabase 読み込みエラー:", e);
  }
}

/* ===============================
   EmailJS 通知設定
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
      name: username, game: "品詞比較",
      date: new Date().toISOString(), device_id: deviceId, device_info: deviceInfo,
    }).then(() => {}).catch(() => {});
  }

  _loadEmailJS().then(() => {
    emailjs.send(_EJS_SVC, _EJS_TPL, {
      bad_name: username, game: "品詞比較",
      device_id: deviceId, device_info: deviceInfo, date: dateStr,
    }).catch(() => {});
  }).catch(() => {});
}

async function saveGlobalScore(username, score) {
  if (containsBadWord(username)) { logViolation(username); return; }
  const supabase   = getSupabase();
  const schoolCode = getSchoolCode();
  if (!supabase) return;
  const today    = new Date().toISOString().slice(0, 10);
  const deviceId = localStorage.getItem("deviceId");
  try {
    const { error } = await supabase.from('global_rankings').insert({
      game_key: getCollectionName(), date: today, player: username, score, device_id: deviceId
    });
    if (error) console.error("Supabase 保存エラー:", error);
    if (schoolCode) {
      const { error: e2 } = await supabase.from('school_rankings').insert({
        school_code: schoolCode, game_key: getCollectionName(), date: today, player: username, score, device_id: deviceId
      });
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
   ゲーム関連の関数
=============================== */
function generateUniqueId() { return "word_" + wordIdCounter++; }

function updateTimerDisplay()  { timerDisplay.textContent  = "Time: " + remainingTime; }
function updateScoreDisplay()  { scoreDisplay.textContent  = "Score: " + score; }
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
  const overlay  = document.createElement("div");
  overlay.id = "sortingAreaOverlay";
  const labelBar = document.createElement("div");
  labelBar.id = "sortingLabelBar";

  Array.from(selectedTypes).forEach(category => {
    const col = document.createElement("div");
    col.classList.add("sorting-column");
    col.dataset.category = category;
    overlay.appendChild(col);

    const cell = document.createElement("div");
    cell.classList.add("sorting-label-cell");
    cell.textContent = category;
    labelBar.appendChild(cell);
  });

  const frag = document.createDocumentFragment();
  frag.appendChild(overlay);
  frag.appendChild(labelBar);
  return frag;
}

function getDecisionLineY() {
  // 判定ラインは仕分けエリア上端で固定（誤答ブロックは積まず即フェードアウト）
  return playArea.clientHeight - SORTING_AREA_HEIGHT;
}

function showPenaltyEffect(x, y) {
  const effect = document.createElement("div");
  effect.classList.add("penalty-effect");
  effect.textContent = "-3s";
  effect.style.left = x + "px";
  effect.style.top  = y + "px";
  playArea.appendChild(effect);
  setTimeout(() => effect.remove(), 1000);
}

function showPairBonusEffect(x, y) {
  const effect = document.createElement("div");
  effect.className  = "pair-bonus-effect";
  effect.textContent = `ペア完成! +${PAIR_BONUS}`;
  effect.style.left  = Math.max(0, x - 60) + "px";
  effect.style.top   = Math.max(0, y) + "px";
  playArea.appendChild(effect);
  setTimeout(() => effect.remove(), 1200);
}

/* ===============================
   ペア追跡
=============================== */
function onTileCorrect(pairId, wordElem) {
  const pt = pairTracker.get(pairId);
  if (!pt) return;
  pt.correctCount++;
  pt.resolvedCount++;
  if (pt.correctCount === 2) {
    score += PAIR_BONUS;
    pairCompleteCount++;
    updateScoreDisplay();
    const left = parseInt(wordElem.style.left) || 0;
    const top  = parseInt(wordElem.style.top)  || 0;
    showPairBonusEffect(left, top - 30);
  }
  if (pt.resolvedCount >= 2) pairTracker.delete(pairId);
}

function onTileWrong(pairId) {
  const pt = pairTracker.get(pairId);
  if (!pt) return;
  pt.resolvedCount++;
  if (pt.resolvedCount >= 2) pairTracker.delete(pairId);
}

/* ===============================
   タイル生成・スポーン
=============================== */
function createTileDiv(data, pairId, colorClass) {
  const wordDiv = document.createElement("div");
  wordDiv.classList.add("word");
  if (colorClass) wordDiv.classList.add(colorClass);
  wordDiv.innerHTML = buildTileHTML(data.sentence, data.word);
  wordDiv.dataset.type     = data.type;
  wordDiv.dataset.word     = data.word;
  wordDiv.dataset.sentence = data.sentence;
  wordDiv.dataset.pairId   = pairId;
  wordDiv.id = generateUniqueId();
  wordDiv.dataset.locked   = "false";
  wordDiv.dataset.penalized = "false";
  wordDiv.style.whiteSpace = "nowrap";
  wordDiv.style.position   = "absolute";
  wordDiv.style.left = "0px";
  wordDiv.style.top  = "-50px";
  wordDiv.style.visibility = "hidden";
  return wordDiv;
}

function placeTile(wordDiv, preferX) {
  playArea.appendChild(wordDiv);
  const measuredWidth = wordDiv.offsetWidth;
  const margin = 8;
  let x = preferX;

  // Clamp to play area
  if (x < margin) x = margin;
  if (x + measuredWidth > playArea.clientWidth - margin) {
    x = playArea.clientWidth - measuredWidth - margin;
  }

  // Check overlap with existing falling words
  let attempts = 0;
  let overlap = true;
  while (overlap && attempts < 8) {
    overlap = fallingWords.some(w =>
      x < w.x + w.element.offsetWidth && x + measuredWidth > w.x
    );
    if (overlap) {
      x = margin + Math.random() * (playArea.clientWidth - measuredWidth - 2 * margin);
      attempts++;
    }
  }

  wordDiv.style.left = x + "px";
  wordDiv.style.visibility = "visible";
  wordDiv.style.top = "-50px";

  wordDiv.addEventListener("mousedown", handleMouseDown);
  wordDiv.addEventListener("touchstart", handleTouchStart);

  fallingWords.push({ element: wordDiv, x, y: -50, speed: FALL_SPEED });
}

function spawnPair() {
  if (wordData.length === 0) return;

  const pair     = wordData[Math.floor(Math.random() * wordData.length)];
  const pairId   = pairIdCounter++;
  const colorClass = `pair-color-${pairId % 5}`;
  pairTracker.set(pairId, { correctCount: 0, resolvedCount: 0 });

  const divA = createTileDiv(pair.a, pairId, colorClass);
  const divB = createTileDiv(pair.b, pairId, colorClass);

  const halfW = playArea.clientWidth / 2;
  placeTile(divA, halfW * 0.08);
  placeTile(divB, halfW + halfW * 0.08);
}

/* ===============================
   タイルをロック（正解時）
=============================== */
function lockWord(wordElem, dropCategory) {
  if (wordElem.dataset.locked === "true") return;
  wordElem.dataset.locked = "true";

  const correct = wordElem.dataset.type === dropCategory;
  if (correct) {
    wordElem.classList.add("correct");
    score += BASE_SCORE;
    if (bonusEnabled) remainingTime += 1;
    currentCombo++;
    if (currentCombo > maxCombo) maxCombo = currentCombo;
    updateComboDisplay();
    updateTimerDisplay();
    updateScoreDisplay();

    const pairId = parseInt(wordElem.dataset.pairId);
    if (!isNaN(pairId) && pairId >= 0) onTileCorrect(pairId, wordElem);

    setTimeout(() => wordElem.remove(), 500);
  }
  fallingWords = fallingWords.filter(w => w.element !== wordElem);
}

/* ===============================
   黄色単語の中心X座標（playArea基準）を返す
=============================== */
function getTargetWordX(wordElem) {
  const targetSpan = wordElem.querySelector('.target-word');
  const paRect = playArea.getBoundingClientRect();
  if (targetSpan) {
    const spRect = targetSpan.getBoundingClientRect();
    const cx = spRect.left + spRect.width / 2 - paRect.left;
    return Math.max(0, Math.min(cx, playArea.clientWidth - 1));
  }
  return parseInt(wordElem.style.left) + wordElem.offsetWidth / 2;
}

/* ===============================
   ドラッグ＆ドロップ処理
=============================== */
let currentDrag = null;

function handleMouseDown(e) {
  const wordElem = e.currentTarget;
  if (wordElem.dataset.locked    === "true") return;
  if (wordElem.dataset.penalized === "true") return;
  e.preventDefault();
  const rect = wordElem.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  const targetSpan = wordElem.querySelector('.target-word');
  let targetOffsetX = wordElem.offsetWidth / 2;
  if (targetSpan) {
    const spanRect = targetSpan.getBoundingClientRect();
    targetOffsetX = spanRect.left - rect.left + spanRect.width / 2;
  }
  currentDrag = { element: wordElem, offsetX, offsetY, targetOffsetX };
  wordElem.classList.add("dragging");
}

function handleMouseMove(e) {
  if (!currentDrag) return;
  const playAreaRect = playArea.getBoundingClientRect();
  let newX = e.clientX - playAreaRect.left - currentDrag.offsetX;
  let newY = e.clientY - playAreaRect.top  - currentDrag.offsetY;
  const wordElem  = currentDrag.element;
  const elemHeight = wordElem.offsetHeight;
  const tox = currentDrag.targetOffsetX;
  newX = Math.max(-tox, Math.min(newX, playArea.clientWidth - tox));
  newY = Math.max(0, Math.min(newY, playArea.clientHeight - elemHeight));
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
      const dropX = getTargetWordX(wordElem);
      const colW  = playArea.clientWidth / selectedTypes.size;
      const colIdx = Math.max(0, Math.min(Math.floor(dropX / colW), selectedTypes.size - 1));
      const dropCategory = Array.from(selectedTypes)[colIdx];
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
    const dropX = getTargetWordX(wordElem);
    const colW  = playArea.clientWidth / selectedTypes.size;
    const colIdx = Math.max(0, Math.min(Math.floor(dropX / colW), selectedTypes.size - 1));
    const dropCategory = Array.from(selectedTypes)[colIdx];

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
      showPenaltyEffect(
        parseInt(wordElem.style.left) + wordElem.offsetWidth / 2,
        parseInt(wordElem.style.top) - 20
      );
      wrongAnswers.push({ sentence: wordElem.dataset.sentence, word: wordElem.dataset.word, correctType: wordElem.dataset.type });
      const pairId = parseInt(wordElem.dataset.pairId);
      if (!isNaN(pairId) && pairId >= 0) onTileWrong(pairId);
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
   ゲームループとタイマー処理
=============================== */
function gameLoop() {
  if (gameOver) return;
  const now   = Date.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.1); // タブ切替後のワープ防止
  lastFrameTime = now;

  fallingWords.forEach(word => {
    if (word.element.dataset.locked === "true") return;
    if (currentDrag && currentDrag.element === word.element) return;

    let currentSpeed = FALL_SPEED + 8 * Math.floor(score / 500);
    let newY = word.y + currentSpeed * delta;
    const wordHeight    = word.element.offsetHeight;
    const decisionLineY = getDecisionLineY();

    if (newY >= decisionLineY) {
      const dropX    = word.x + word.element.offsetWidth / 2;
      const colW     = playArea.clientWidth / selectedTypes.size;
      const colIdx   = Math.floor(dropX / colW);
      const dropCat  = Array.from(selectedTypes)[colIdx];

      if (word.element.dataset.type === dropCat) {
        lockWord(word.element, dropCat);
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
          wrongAnswers.push({ sentence: word.element.dataset.sentence, word: word.element.dataset.word, correctType: word.element.dataset.type });
          const pairId = parseInt(word.element.dataset.pairId);
          if (!isNaN(pairId) && pairId >= 0) onTileWrong(pairId);
        }

        word.element.classList.add("fading");
        word.landed = true;
        setTimeout(() => { word.element.remove(); }, 500);
        return;
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
    sortingOverlay.style.height = playArea.clientHeight - dl + "px";
  }

  if (now - lastSpawnTime > SPAWN_INTERVAL) {
    spawnPair();
    lastSpawnTime = now;
  }

  gameLoopId = requestAnimationFrame(gameLoop);
}

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

function getPlayerName() {
  let name = localStorage.getItem("playerName");
  if (!name) {
    while (true) {
      name = prompt("プレイヤー名を入力してください（全角8文字・半角16文字以内）") || "名無し";
      if (displayWidth(name) > 16) alert("全角8文字（半角16文字）以内で入力してください");
      else break;
    }
    localStorage.setItem("playerName", name);
  }
  return name;
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(gameLoopId);
  clearInterval(timerIntervalId);
  fallingWords.forEach(word => { word.element.style.opacity = 0.5; });

  const username = getPlayerName();
  saveLocalScore(username, score);
  saveGlobalScore(username, score);

  showResultScreen();
}

function initGame() {
  resetAndLockZoom();

  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);
  remainingTime    = TIME_LIMIT;
  score            = 0;
  currentCombo     = 0;
  maxCombo         = 0;
  pairCompleteCount = 0;
  wrongAnswers     = [];
  isPaused         = false;
  reviewMode       = false;
  updateComboDisplay();
  fallingWords     = [];
  landedWords      = [];
  pairTracker.clear();
  lastSpawnTime    = Date.now() - 4500;
  lastFrameTime    = Date.now();
  gameOver         = false;

  returnButton.textContent = "Return to START";
  document.getElementById("resultScreen").style.display = "none";

  playArea.innerHTML = "";
  playArea.appendChild(createSortingArea());
  updateTimerDisplay();
  updateScoreDisplay();
  gameLoopId = requestAnimationFrame(gameLoop);
  startTimer();
  gameScreen.style.display = "block";
  startScreen.style.display = "none";
}

/* ===============================
   イベントリスナーの設定
=============================== */
document.addEventListener("mousemove", handleMouseMove);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("touchmove", handleTouchMove, { passive: false });
document.addEventListener("touchend", handleTouchEnd);

returnButton.addEventListener("click", () => {
  if (reviewMode) { endReviewMode(false); return; }
  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);
  gameScreen.style.display = "none";
  startScreen.style.display = "block";
  unlockZoom();
});

startButton.addEventListener("click", () => initGame());

document.getElementById("backButton").addEventListener("click", () => window.history.back());

bonusToggleButton.addEventListener("click", () => {
  bonusEnabled = !bonusEnabled;
  bonusToggleButton.textContent = bonusEnabled ? "ボーナス: ON" : "ボーナス: OFF";
  if (rankingState === "local") displayLocalRanking();
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
    if (newName.trim() === "") alert("空の名前は使えません");
    else if (displayWidth(newName) > 16) alert("全角8文字（半角16文字）以内で入力してください");
    else break;
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
showLocalRanking();
