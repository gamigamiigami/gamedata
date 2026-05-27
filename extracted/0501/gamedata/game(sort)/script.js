

// ★ Firestore インポートと初期化は元コードのまま ---
// import { collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
// const db = window.firebaseDB;

(function ensureDeviceId() {
  // 端末ごとに一意の ID を localStorage に保存
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = "dev-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem("deviceId", id);
  }
})();

document.addEventListener("DOMContentLoaded", () => {
  const toggleButton       = document.getElementById("rankingToggleButton");
  const table1             = document.getElementById("ranking-table");
  const table2             = document.getElementById("alt-ranking-table");
  const resetRankingButton = document.getElementById("resetRankingButton");
  const changeNameButton   = document.getElementById("changeNameButton");

  // グローバルリセットボタンを動的生成（グローバルランキング表示中のみ表示）
  const globalResetBtn = document.createElement("button");
  globalResetBtn.id = "globalResetButton";
  globalResetBtn.textContent = "グローバルリセット";
  globalResetBtn.style.cssText = "display:none; padding:5px 10px; margin-top:10px; font-size:14px; cursor:pointer;";
  resetRankingButton.parentNode.appendChild(globalResetBtn);
  globalResetBtn.addEventListener("click", globalResetRanking);

  // ポーズボタンをヘッダーに動的生成
  const header = document.getElementById("header");
  if (header) {
    const pauseBtn = document.createElement("button");
    pauseBtn.id = "pauseButton";
    pauseBtn.textContent = "⏸";
    pauseBtn.style.cssText = "padding:4px 10px; font-size:16px; cursor:pointer; background:#555; color:#fff; border:1px solid #999; border-radius:4px;";
    pauseBtn.addEventListener("click", pauseGame);
    header.appendChild(pauseBtn);
  }

  // ポーズオーバーレイを動的生成
  const pauseOverlay = document.createElement("div");
  pauseOverlay.id = "pauseOverlay";
  pauseOverlay.style.cssText = "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:#000; align-items:center; justify-content:center; z-index:200;";
  pauseOverlay.innerHTML = `
    <div style="background:#333; border:2px solid #fed000; border-radius:12px; padding:40px 60px; text-align:center;">
      <p style="font-size:24px; margin:0 0 20px; color:#fed000;">一時停止中</p>
      <button id="resumeButton" style="padding:10px 30px; font-size:18px; cursor:pointer; background:#fed000; color:#000; border:none; border-radius:6px; font-weight:bold;">▶ 再開</button>
    </div>`;
  document.body.appendChild(pauseOverlay);
  pauseOverlay.querySelector("#resumeButton").addEventListener("click", resumeGame);

  // 結果画面を動的生成
  const resultScreen = document.createElement("div");
  resultScreen.id = "resultScreen";
  resultScreen.style.cssText = "display:none; text-align:center; padding:20px; margin-top:40px; color:#fff;";
  resultScreen.innerHTML = `
    <h2 style="color:#fed000;">ゲーム結果</h2>
    <div id="resultStats" style="font-size:20px; margin:20px 0; line-height:2;">
      <p>スコア: <span id="resultScore" style="font-weight:bold; color:#fed000; font-size:26px;"></span></p>
      <p>最大コンボ: <span id="resultMaxCombo" style="font-weight:bold; color:#fed000; font-size:26px;"></span></p>
      <p>間違えた問題: <span id="resultWrongCount" style="font-weight:bold; color:#fed000; font-size:26px;"></span> 問</p>
    </div>
    <div id="wrongListContainer" style="max-height:280px; overflow-y:auto; margin:10px auto; width:90%; max-width:500px; background:#333; border-radius:8px; padding:12px 16px; text-align:left;">
      <h3 style="color:#fed000; margin:0 0 10px; text-align:center;">間違えた単語</h3>
      <ul id="wrongList" style="list-style:none; padding:0; margin:0;"></ul>
    </div>
    <div style="display:flex; flex-direction:column; align-items:center; gap:10px; margin-top:16px;">
      <button id="reviewButton" style="padding:10px 25px; font-size:16px; cursor:pointer; background:#fed000; color:#000; border:none; border-radius:6px; font-weight:bold;">📝 復習モード</button>
      <button id="resultReturnButton" style="padding:10px 25px; font-size:16px; cursor:pointer; border-radius:6px;">スタートに戻る</button>
    </div>`;
  document.body.appendChild(resultScreen);
  resultScreen.querySelector("#reviewButton").addEventListener("click", startReviewMode);
  resultScreen.querySelector("#resultReturnButton").addEventListener("click", () => {
    resultScreen.style.display = "none";
    document.getElementById("startScreen").style.display = "block";
    unlockZoom();
    updateRankings();
    displayRanking();
  });

  let showingAlt = false;
  if (table2) table2.style.display = "none";

  toggleButton.addEventListener("click", async () => {
    showingAlt = !showingAlt;

    if (showingAlt) {
      await displayAltRanking();
    }

    table1.style.display             = showingAlt ? "none"    : "table";
    table2.style.display             = showingAlt ? "table"   : "none";
    toggleButton.textContent         = showingAlt ? "グローバルランキング" : "My ベストスコア";
    resetRankingButton.style.display = showingAlt ? "none"    : "inline-block";
    globalResetBtn.style.display     = showingAlt ? "inline-block" : "none";
    if (changeNameButton) changeNameButton.style.display = showingAlt ? "none" : "inline-block";
  });
});

// --- Firestore 操作用関数等 ---
function getDb() { return window.firebaseDB; }
function getModules() { return window.firebaseModules; }

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

  const db = getDb();
  if (!db) { alert("Firebase未接続"); return; }
  const { getDocs, collection } = getModules();
  try {
    const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js");
    const snap = await getDocs(collection(db, getFirestoreCollectionName()));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    alert("グローバルランキングをリセットしました");
    await window.displayAltRanking();
  } catch (e) {
    alert("リセット失敗: " + e.message);
    console.error(e);
  }
}

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
let isPaused = false;

function pauseGame() {
  if (isPaused || gameOver) return;
  isPaused = true;
  cancelAnimationFrame(gameLoopId);
  clearInterval(timerIntervalId);
  const ol = document.getElementById("pauseOverlay");
  if (ol) { ol.style.display = "flex"; }
}

function resumeGame() {
  if (!isPaused) return;
  isPaused = false;
  lastFrameTime = Date.now();
  lastSpawnTime = Date.now();
  const ol = document.getElementById("pauseOverlay");
  if (ol) { ol.style.display = "none"; }
  gameLoopId = requestAnimationFrame(gameLoop);
  startTimer();
}

/* ===============================
   間違い記録・結果・復習
=============================== */
let wrongAnswers = [];
let reviewMode = false;
let reviewQueue = [];
let reviewIndex = 0;

function showResultScreen() {
  const gs = document.getElementById("gameScreen");
  const rs = document.getElementById("resultScreen");
  if (gs) gs.style.display = "none";
  if (!rs) return;

  const el = (id) => rs.querySelector("#" + id) || document.getElementById(id);
  el("resultScore").textContent = score;
  el("resultMaxCombo").textContent = maxCombo;
  el("resultWrongCount").textContent = wrongAnswers.length;

  const ul = el("wrongList");
  ul.innerHTML = "";
  const wrongMap = new Map();
  wrongAnswers.forEach(wa => {
    if (wrongMap.has(wa.word)) wrongMap.get(wa.word).count++;
    else wrongMap.set(wa.word, { ...wa, count: 1 });
  });
  wrongMap.forEach(wa => {
    const li = document.createElement("li");
    li.style.cssText = "padding:6px 4px; border-bottom:1px solid #555; font-size:16px;";
    const countStr = wa.count > 1 ? ` <span style="color:#f90;font-weight:bold;">×${wa.count}</span>` : "";
    li.innerHTML = `「${wa.word}」→ <strong>${wa.correctType}</strong>${countStr}`;
    ul.appendChild(li);
  });

  const reviewBtn = el("reviewButton");
  if (reviewBtn) reviewBtn.style.display = wrongAnswers.length > 0 ? "inline-block" : "none";
  rs.style.display = "block";
}

function startReviewMode() {
  reviewMode = true;
  reviewQueue = [...wrongAnswers];
  reviewIndex = 0;

  const rs = document.getElementById("resultScreen");
  if (rs) rs.style.display = "none";
  gameOver = false;
  fallingWords = [];
  landedWords = [];

  const gs = document.getElementById("gameScreen");
  if (gs) gs.style.display = "block";

  playArea.innerHTML = "";
  playArea.appendChild(createSortingArea());

  const timerDisplay  = document.getElementById("timer");
  const scoreDisplay  = document.getElementById("score");
  const comboDisplay  = document.getElementById("combo");
  const maxComboDisplay = document.getElementById("maxCombo");
  const returnButton  = document.getElementById("returnButton");
  if (timerDisplay) timerDisplay.textContent = "復習モード";
  if (comboDisplay) comboDisplay.textContent = "";
  if (maxComboDisplay) maxComboDisplay.textContent = "";
  if (returnButton) { returnButton.textContent = "復習を終える"; returnButton._reviewMode = true; }

  showNextReviewWord();
}

function showNextReviewWord() {
  playArea.querySelectorAll(".word").forEach(w => w.remove());
  fallingWords = [];

  const scoreDisplay = document.getElementById("score");
  const returnButton = document.getElementById("returnButton");

  if (reviewIndex >= reviewQueue.length) {
    reviewMode = false;
    if (returnButton) { returnButton.textContent = "Return to START"; returnButton._reviewMode = false; }
    const gs = document.getElementById("gameScreen");
    const ss = document.getElementById("startScreen");
    if (gs) gs.style.display = "none";
    if (ss) ss.style.display = "block";
    unlockZoom();
    updateRankings();
    displayRanking();
    alert("復習完了！全問正解しました！");
    return;
  }

  if (scoreDisplay) scoreDisplay.textContent = `${reviewIndex + 1} / ${reviewQueue.length}`;

  const item = reviewQueue[reviewIndex];
  const wordDiv = document.createElement("div");
  wordDiv.classList.add("word");
  wordDiv.textContent = item.word;
  wordDiv.dataset.type = item.correctType;
  wordDiv.id = "review_" + reviewIndex;
  wordDiv.dataset.locked = "false";
  wordDiv.dataset.penalized = "false";
  wordDiv.style.cssText = "white-space:nowrap; position:absolute; visibility:hidden; top:-30px; left:0;";
  playArea.appendChild(wordDiv);

  const w = wordDiv.offsetWidth;
  const x = (playArea.clientWidth - w) / 2;
  const y = Math.floor(playArea.clientHeight * 0.25);
  wordDiv.style.left = x + "px";
  wordDiv.style.top  = y + "px";
  wordDiv.style.visibility = "visible";

  fallingWords = [{ element: wordDiv, x, y, speed: 0 }];
  wordDiv.addEventListener("mousedown", handleMouseDown);
  wordDiv.addEventListener("touchstart", handleTouchStart);
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

// ゲームタイトル取得
const title = document.querySelector("h1").textContent.trim();

// ★ ボーナスON/OFFの設定 ★
let bonusEnabled = false;
const bonusToggleButton = document.getElementById("bonusToggleButton");

// ローカルストレージのキーをボーナス有無で切り替える
function getRankingKey() {
  return "rankings" + title + (bonusEnabled ? "" : "_nobonus");
}

// Firestore のコレクション名を切り替え
function getFirestoreCollectionName() {
  return "ranks" + title + (bonusEnabled ? "" : "_nobonus");
}

// Firestore から上位 N 件を取得して #alt-ranking-table に描画
window.displayAltRanking = async function(limitNum = 30) {
  const tbody       = document.querySelector("#alt-ranking-table tbody");
  tbody.innerHTML   = "<tr><td colspan='3'>読み込み中...</td></tr>";
  const seenDevices = new Set();
  const db = getDb();
  if (!db) {
    tbody.innerHTML = "<tr><td colspan='3'>Firebase未接続</td></tr>";
    return;
  }
  const { getDocs, query, collection, orderBy, limit } = getModules();
  try {
    const qSnap = await getDocs(
      query(
        collection(db, getFirestoreCollectionName()),
        orderBy("score", "desc"),
        limit(limitNum * 100) // 重複排除用に多めに取得
      )
    );
    tbody.innerHTML = "";
    let count = 0;
    for (const docSnap of qSnap.docs) {
      const { player, score, deviceId } = docSnap.data();
      if (seenDevices.has(deviceId)) continue;
      seenDevices.add(deviceId);
      count++;
      if (count > limitNum) break;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${count}</td>
        <td>${player}</td>
        <td>${score}</td>
      `;
      tbody.appendChild(tr);
    }
    if (count === 0) tbody.innerHTML = "<tr><td colspan='3'>データなし</td></tr>";
  } catch (e) {
    tbody.innerHTML = "<tr><td colspan='3'>取得エラー</td></tr>";
    console.error("Firestore 読み込みエラー:", e);
  }
};

/* ===============================
   EmailJS 通知設定
   ↓ EmailJS (emailjs.com) で取得した値を入力してください
=============================== */
const _EJS_PK  = "njxurV_IW84nYD01w";    // アカウント → Account → Public Key
const _EJS_SVC = "service_0eqi1dy";    // Email Services → Service ID
const _EJS_TPL = "template_gp9y1ai";   // Email Templates → Template ID

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

// 禁止ワード使用を violations コレクションに記録し、メール通知（ユーザーには通知しない）
async function logViolation(username) {
  const deviceId   = localStorage.getItem("deviceId") || "unknown";
  const deviceInfo = `${screen.width}×${screen.height} / ${navigator.userAgent}`;
  const dateStr    = new Date().toLocaleString("ja-JP");

  // Firestore に記録
  const db = getDb();
  if (db) {
    const { addDoc, collection } = getModules();
    addDoc(collection(db, "violations"), {
      name:       username,
      game:       title,
      date:       new Date().toISOString(),
      deviceId:   deviceId,
      deviceInfo: deviceInfo,
    }).catch(() => {});
  }

  // メール通知（EmailJS）
  _loadEmailJS().then(() => {
    emailjs.send(_EJS_SVC, _EJS_TPL, {
      bad_name:    username,
      game:        title,
      device_id:   deviceId,
      device_info: deviceInfo,
      date:        dateStr,
    }).catch(() => {});
  }).catch(() => {});
}

// Firestore にスコアを保存（deviceId も添付）
async function saveToFirebase(username, score) {
  if (containsBadWord(username)) {
    logViolation(username);
    return;
  }
  const today    = new Date().toISOString().slice(0, 10);
  const deviceId = localStorage.getItem("deviceId");
  const db = getDb();
  if (!db) return;
  const { addDoc, collection } = getModules();
  try {
    await addDoc(collection(db, getFirestoreCollectionName()), {
      date:     today,
      player:   username,
      score:    score,
      deviceId: deviceId
    });
  } catch (e) {
    console.error("Firestore 保存エラー:", e);
  }
}

// 特別エントリ定義
const specialEntries = [
  { username: "👆👆👆👆Sランク👆👆👆👆", score: 6000, time: new Date("2025-02-15").getTime() },
  { username: "👆👆👆👆Aランク👆👆👆👆", score: 4000, time: new Date("2025-02-15").getTime() },
  { username: "👆👆👆👆Bランク👆👆👆👆", score: 2000, time: new Date("2025-02-15").getTime() },
  { username: "👆👆👆👆Cランク👆👆👆👆", score: 1000, time: new Date("2025-02-15").getTime() },
  { username: "👆👆👆👆Dランク👆👆👆👆", score:    0, time: new Date("2025-02-15").getTime() },
];

// 特別エントリか判定
function isSpecial(entry) {
  return specialEntries.some(
    special =>
      entry.username === special.username &&
      entry.score    === special.score
  );
}

function updateRankings() {
  const key      = getRankingKey();
  let   rankings = JSON.parse(localStorage.getItem(key)) || [];

  specialEntries.forEach(special => {
    const exists = rankings.some(
      entry =>
        entry.username === special.username &&
        entry.score    === special.score
    );
    if (!exists) rankings.push(special);
  });

  rankings.sort((a,b) => b.score - a.score || b.time - a.time);

  const specials  = rankings.filter(isSpecial);
  const normals   = rankings.filter(e => !isSpecial(e)).slice(0,10);
  const combined  = [...specials, ...normals];
  combined.sort((a,b) => b.score - a.score || b.time - a.time);

  localStorage.setItem(key, JSON.stringify(combined));
}

function displayRanking() {
  const key   = getRankingKey();
  const tbody = document.querySelector("#ranking-table tbody");
  tbody.innerHTML = "";

  let rankings = JSON.parse(localStorage.getItem(key)) || [];
  rankings.sort((a,b) => b.score - a.score || b.time - a.time);

  rankings.forEach(entry => {
    const tr       = document.createElement("tr");
    const dateCell = document.createElement("td");
    if (isSpecial(entry)) {
      dateCell.textContent = "";
      tr.classList.add("special-entry");
    } else {
      const d = new Date(entry.time);
      dateCell.textContent = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }
    const nameCell  = document.createElement("td"); nameCell.textContent  = entry.username;
    const scoreCell = document.createElement("td"); scoreCell.textContent = entry.score;

    tr.append(dateCell, nameCell, scoreCell);
    tbody.appendChild(tr);
  });
}

// リセットボタン処理
const resetRankingButton = document.getElementById("resetRankingButton");
resetRankingButton.addEventListener("click", () => {
  if (confirm("ベストスコアをリセットしますか？")) {
    localStorage.removeItem(getRankingKey());
    updateRankings();
    displayRanking();
  }
});



/* ===============================
   ゲーム設定
=============================== */
const TIME_LIMIT = 60; // 制限時間（秒）
const SPAWN_INTERVAL = 2000; // 出現間隔（ms）
const PENALTY_TIME = 3; // ペナルティ秒数
const ROW_HEIGHT = 30;
const SORTING_AREA_ROWS = 3;
const SORTING_AREA_HEIGHT = ROW_HEIGHT * SORTING_AREA_ROWS;

let FALL_SPEED = 50; // initGameで再計算



/* ===============================
   ゲーム状態変数
=============================== */
let remainingTime = TIME_LIMIT;
let score = 0;

// ★ COMBO関連はここで1回だけ宣言
let currentCombo = 0;
let maxCombo = 0;

let fallingWords = [];
let landedWords = [];
let lastSpawnTime = Date.now();
let lastFrameTime = Date.now();
let gameOver = false;

let gameLoopId;
let timerIntervalId;

let wordIdCounter = 0;
function generateUniqueId() {
  return "word_" + wordIdCounter++;
}


/* ===============================
   外部データ保持
=============================== */
let currentWordData = [];
let categories = [];


/* ===============================
   DOM取得
=============================== */
const playArea = document.getElementById("playArea");
const timerDisplay = document.getElementById("timer");
const scoreDisplay = document.getElementById("score");
const comboDisplay = document.getElementById("combo");
const maxComboDisplay = document.getElementById("maxCombo");
const startScreen = document.getElementById("startScreen");
const gameScreen = document.getElementById("gameScreen");
const returnButton = document.getElementById("returnButton");
const startButton = document.getElementById("startButton");


/* ===============================
   ボーナスON / OFF 切り替え
=============================== */
if (bonusToggleButton) {
  bonusToggleButton.addEventListener("click", () => {
    bonusEnabled = !bonusEnabled;

    bonusToggleButton.textContent =
      bonusEnabled ? "ボーナス: ON" : "ボーナス: OFF";

    // ランキング表示を即更新
    const altTable = document.getElementById("alt-ranking-table");
    const showingAlt = altTable && altTable.style.display === "table";

    if (showingAlt) {
      displayAltRanking();
    } else {
      updateRankings();
      displayRanking();
    }
  });
}



/* ===============================
   ゲーム初期化（外部公開）
=============================== */
export function initGame(wordData) {
  currentWordData = wordData;
  categories = [...new Set(currentWordData.map(item => item.type))];
  FALL_SPEED = Math.min(300 / categories.length, 50);

  resetAndLockZoom();

  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);

  remainingTime = TIME_LIMIT;
  score = 0;
  currentCombo = 0;
  maxCombo = 0;
  wrongAnswers = [];
  isPaused = false;
  reviewMode = false;

  updateComboDisplay();

  fallingWords = [];
  landedWords = [];

  lastSpawnTime = Date.now() - 1900;
  lastFrameTime = Date.now();
  gameOver = false;

  const rs = document.getElementById("resultScreen");
  if (rs) rs.style.display = "none";
  const rb = document.getElementById("returnButton");
  if (rb) { rb.textContent = "Return to START"; rb._reviewMode = false; }

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
   UIイベント
=============================== */
returnButton.addEventListener("click", () => {
  if (reviewMode) {
    reviewMode = false;
    returnButton.textContent = "Return to START";
    gameScreen.style.display = "none";
    startScreen.style.display = "block";
    unlockZoom();
    updateRankings();
    displayRanking();
    return;
  }
  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);

  gameScreen.style.display = "none";
  startScreen.style.display = "block";
  unlockZoom();

  showUpdatedMedal();
});

document.getElementById("backButton").addEventListener("click", () => {
  window.location.href = "../index.html";
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


/* ===============================
   初期表示
=============================== */
showUpdatedMedal();
updateRankings();
displayRanking();


/* ===============================
   表示更新
=============================== */
function updateTimerDisplay() {
  timerDisplay.textContent = `Time: ${remainingTime}`;
}

function updateScoreDisplay() {
  scoreDisplay.textContent = `Score: ${score}`;
}

function updateComboDisplay() {
  comboDisplay.textContent = `Combo: ${currentCombo}`;
  maxComboDisplay.textContent = `Max: ${maxCombo}`;

  if (currentCombo > 0 && currentCombo % 15 === 0) {
    comboDisplay.classList.add("combo-effect-50");
    setTimeout(() => comboDisplay.classList.remove("combo-effect-50"), 700);
  } else if (currentCombo > 0 && currentCombo % 5 === 0) {
    comboDisplay.classList.add("combo-effect");
    setTimeout(() => comboDisplay.classList.remove("combo-effect"), 500);
  }
}


/* ===============================
   仕分けエリア生成
=============================== */
function createSortingArea() {
  const overlay = document.createElement("div");
  overlay.id = "sortingAreaOverlay";

  categories.forEach(category => {
    const column = document.createElement("div");
    column.classList.add("sorting-column");
    column.dataset.category = category;
    column.innerHTML = `<span class="sorting-label">${category}</span>`;
    overlay.appendChild(column);
  });

  return overlay;
}


/* ===============================
   判定ラインY座標
=============================== */
function getDecisionLineY() {
  const baseLine = playArea.clientHeight - SORTING_AREA_HEIGHT;
  if (landedWords.length === 0) return baseLine;

  const highest = Math.min(...landedWords.map(w => w.y));
  return Math.min(baseLine, highest);
}


/* ===============================
   単語 / 画像 共通生成（画像ロード待ち対応）
=============================== */
function spawnWord(presetX) {
  const data =
    currentWordData[Math.floor(Math.random() * currentWordData.length)];

  const wordDiv = document.createElement("div");
  wordDiv.classList.add("word");
  wordDiv.dataset.type = data.type;
  wordDiv.id = generateUniqueId();
  wordDiv.dataset.locked = "false";
  wordDiv.dataset.penalized = "false";

  wordDiv.style.position = "absolute";
  wordDiv.style.top = "-30px";
  wordDiv.style.visibility = "hidden";

  let contentReadyPromise;

  // === 表示内容の分岐 ===
  if (data.img) {
    const img = document.createElement("img");
    img.src = data.img;
    img.alt = data.word || data.type;
    img.draggable = false;
    img.style.width = "60px";
    img.style.pointerEvents = "none";

    wordDiv.appendChild(img);

    // ★ 画像読み込み完了を待つ
    contentReadyPromise = new Promise(resolve => {
      if (img.complete) {
        resolve();
      } else {
        img.onload = resolve;
        img.onerror = resolve; // エラーでも進める
      }
    });
  } else {
    wordDiv.textContent = data.word;
    wordDiv.style.whiteSpace = "nowrap";
    contentReadyPromise = Promise.resolve();
  }

  playArea.appendChild(wordDiv);

  // === 画像 or 文字の準備完了後に配置＆落下開始 ===
  contentReadyPromise.then(() => {
    const width = wordDiv.offsetWidth;
    const margin = 10;
    let x;

    do {
      x =
        margin +
        Math.random() * (playArea.clientWidth - width - margin * 2);
    } while (
      fallingWords.some(
        w => x < w.x + w.element.offsetWidth && x + width > w.x
      )
    );

    wordDiv.style.left = `${x}px`;
    wordDiv.style.visibility = "visible";

    wordDiv.addEventListener("mousedown", handleMouseDown);
    wordDiv.addEventListener("touchstart", handleTouchStart);

    fallingWords.push({
      element: wordDiv,
      x,
      y: -30,
      speed: FALL_SPEED,
    });
  });
}


/* ===============================
   正解時ロック処理
=============================== */

function lockWord(wordElem, dropCategory) {
  if (wordElem.dataset.locked === "true") return;
  wordElem.dataset.locked = "true";

  const correct = wordElem.dataset.type === dropCategory;
  if (correct) {
    wordElem.classList.add("correct");
    score += 100;
    if (bonusEnabled) {
      remainingTime += 1;
    }
    // COMBO処理：正解なら＋1して更新
    currentCombo++;
    if (currentCombo > maxCombo) {
      maxCombo = currentCombo;
    }
    updateComboDisplay();
    updateTimerDisplay();
    updateScoreDisplay();
    setTimeout(() => {
      wordElem.remove();
    }, 500);
  }
  fallingWords = fallingWords.filter((w) => w.element !== wordElem);
}

/* ===============================
   ペナルティエフェクト表示関数
=============================== */
function showPenaltyEffect(x, y) {
  const effect = document.createElement("div");
  effect.classList.add("penalty-effect");
  effect.textContent = "-3s";
  effect.style.left = x + "px";
  effect.style.top = y + "px";
  playArea.appendChild(effect);
  setTimeout(() => {
    effect.remove();
  }, 1000);
}

/* ===============================
   ドラッグ＆ドロップ処理
=============================== */
let currentDrag = null;

function handleMouseDown(e) {
  const wordElem = e.currentTarget;
  if (wordElem.dataset.locked === "true") return;
  if (wordElem.dataset.penalized === "true") return;
  e.preventDefault();
  const rect = wordElem.getBoundingClientRect();
  const playAreaRect = playArea.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;

  currentDrag = { element: wordElem, offsetX, offsetY };
  wordElem.classList.add("dragging");
}

function handleMouseMove(e) {
  if (!currentDrag) return;
  const playAreaRect = playArea.getBoundingClientRect();
  let newX = e.clientX - playAreaRect.left - currentDrag.offsetX;
  let newY = e.clientY - playAreaRect.top - currentDrag.offsetY;

  const wordElem = currentDrag.element;
  const elemWidth = wordElem.offsetWidth;
  const elemHeight = wordElem.offsetHeight;
  newX = Math.max(0, Math.min(newX, playArea.clientWidth - elemWidth));
  newY = Math.max(0, Math.min(newY, playArea.clientHeight - elemHeight));

  wordElem.style.left = newX + "px";
  wordElem.style.top = newY + "px";

  const fallingWord = fallingWords.find((w) => w.element === wordElem);
  if (fallingWord) {
    fallingWord.x = newX;
    fallingWord.y = newY;
  }
}

function handleMouseUp(e) {
  if (!currentDrag) return;
  const wordElem = currentDrag.element;
  wordElem.classList.remove("dragging");
  const top = parseInt(wordElem.style.top);

  if (reviewMode) {
    if (top >= getDecisionLineY() && wordElem.dataset.locked === "false") {
      const dropX = parseInt(wordElem.style.left) + wordElem.offsetWidth / 2;
      const columnWidth = playArea.clientWidth / categories.length;
      const columnIndex = Math.floor(dropX / columnWidth);
      const dropCategory = categories[columnIndex];
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
    const columnWidth = playArea.clientWidth / categories.length;
    const columnIndex = Math.floor(dropX / columnWidth);
    const dropCategory = categories[columnIndex];

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
      wrongAnswers.push({ word: wordElem.textContent, correctType: wordElem.dataset.type });
    }
  }
  currentDrag = null;
}

function handleTouchStart(e) {
  const touch = e.touches[0];
  e.preventDefault();
  const simulatedEvent = {
    currentTarget: e.currentTarget,
    clientX: touch.clientX,
    clientY: touch.clientY,
    preventDefault: e.preventDefault.bind(e),
  };
  handleMouseDown(simulatedEvent);
}

function handleTouchMove(e) {
  if (!currentDrag) return;
  const touch = e.touches[0];
  const simulatedEvent = {
    clientX: touch.clientX,
    clientY: touch.clientY,
  };
  handleMouseMove(simulatedEvent);
}

function handleTouchEnd(e) {
  if (!currentDrag) return;
  const touch = e.changedTouches[0];
  const simulatedEvent = {
    clientX: touch.clientX,
    clientY: touch.clientY,
  };
  handleMouseUp(simulatedEvent);
}

document.addEventListener("mousemove", handleMouseMove);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("touchmove", handleTouchMove, { passive: false });
document.addEventListener("touchend", handleTouchEnd);

/* ===============================
   ゲームループ
=============================== */
function gameLoop() {
  if (gameOver) return;
  const now = Date.now();
  const delta = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  fallingWords.forEach((word) => {
    if (word.element.dataset.locked === "true") return;
    let currentSpeed = FALL_SPEED + 10 * Math.floor(score / 500);
    let newY = word.y + currentSpeed * delta;
    const wordHeight = word.element.offsetHeight;
    const decisionLineY = getDecisionLineY();

    if (newY >= decisionLineY) {
      const dropX = word.x + word.element.offsetWidth / 2;
      const columnWidth = playArea.clientWidth / categories.length;
      const columnIndex = Math.floor(dropX / columnWidth);
      const dropCategory = categories[columnIndex];

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
          const effectX = word.x + word.element.offsetWidth / 2;
          const effectY = newY - 20;
          showPenaltyEffect(effectX, effectY);
          currentCombo = 0;
          updateComboDisplay();
          wrongAnswers.push({ word: word.element.textContent, correctType: word.element.dataset.type });
        }
        let landingY = playArea.clientHeight - wordHeight;
        landedWords.forEach((lw) => {
          const wordLeft = word.x;
          const wordRight = word.x + word.element.offsetWidth;
          const lwLeft = lw.x;
          const lwRight = lw.x + lw.element.offsetWidth;
          if (!(wordRight < lwLeft || wordLeft > lwRight)) {
            const candidate = lw.y - wordHeight;
            if (candidate < landingY) landingY = candidate;
          }
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
    } else {
      if (newY > playArea.clientHeight) {
        word.element.remove();
        word.remove = true;
        return;
      }
    }
    word.y = newY;
    word.element.style.top = word.y + "px";
  });

  fallingWords = fallingWords.filter((word) => !word.landed && !word.remove);

  const sortingOverlay = document.getElementById("sortingAreaOverlay");
  if (sortingOverlay) {
    let currentDecisionLine = getDecisionLineY();
    sortingOverlay.style.top = currentDecisionLine + "px";
    sortingOverlay.style.height =
      playArea.clientHeight - currentDecisionLine + "px";
  }

  if (now - lastSpawnTime > SPAWN_INTERVAL) {
    let spawnCount = 1 + Math.floor(score / 1500);
    if (spawnCount > 1) {
      const wordWidth = 50;
      const totalSpace = playArea.clientWidth - wordWidth;
      const spacing = totalSpace / (spawnCount - 1);
      for (let i = 0; i < spawnCount; i++) {
        const presetX = i * spacing;
        spawnWord(presetX);
      }
    } else {
      spawnWord();
    }
    lastSpawnTime = now;
  }

  gameLoopId = requestAnimationFrame(gameLoop);
}

/* ===============================
   タイマー処理
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
   ゲーム終了処理
=============================== */
function endGame() {
  gameOver = true;
  cancelAnimationFrame(gameLoopId);
  clearInterval(timerIntervalId);
  fallingWords.forEach((word) => {
    word.element.style.opacity = 0.5;
  });

  if (score >= 1000) {
    incrementPlayCount();
  }

  // ✅ 名前を記憶して、2回目以降は聞かない
let username = localStorage.getItem("playerName");

if (!username) {
  let inputName = "";
  while (!inputName) {
    inputName = prompt("あなたの名前を入力してください（全角8文字・半角16文字以内）") || "";

    if (displayWidth(inputName) > 16) {
      alert("全角8文字（半角16文字）以内で入力してください。");
      inputName = "";
    }
  }

  username = inputName;
  localStorage.setItem("playerName", username);
}


  saveScore(username, score);
  saveToFirebase(username, score);

  showResultScreen();
}

/* ===============================
   スコア保存とランキング更新
=============================== */
function saveScore(username, score) {
  let rankings = JSON.parse(localStorage.getItem(getRankingKey())) || [];
  rankings.push({ username, score, time: Date.now() });

  specialEntries.forEach((special) => {
    const exists = rankings.some(
      (entry) =>
        entry.username === special.username && entry.score === special.score
    );
    if (!exists) {
      rankings.push(special);
    }
  });

  rankings.sort((a, b) => {
    if (b.score === a.score) return a.time - b.time;
    return b.score - a.score;
  });

  const specials = rankings.filter(isSpecial);
  const normals = rankings.filter((entry) => !isSpecial(entry));
  const topNormals = normals.slice(0, 10);

  const combined = specials.concat(topNormals);
  combined.sort((a, b) => {
    if (b.score === a.score) return a.time - b.time;
    return b.score - a.score;
  });

  localStorage.setItem(getRankingKey(), JSON.stringify(combined));
  displayRanking();
}

/* ===============================
   プレイ回数とメダル管理用の関数
=============================== */
// プレイ回数を更新する関数
function incrementPlayCount() {
  let playCount = parseInt(localStorage.getItem("playCount" + title)) || 0;
  playCount++;
  localStorage.setItem("playCount" + title, playCount);
}

// メダル画像を更新する関数play
function updateMedalDisplay(playCount) {
  const medalImage = document.getElementById("medalImage");
  let medalSrc = "";

  console.log("updateMedalDisplay: playCount =", playCount);

  if (playCount >= 30) {
    medalSrc = "/images/medals/medal_gold.png";
  } else if (playCount >= 15) {
    medalSrc = "/images/medals/medal_silver.png";
  } else if (playCount >= 5) {
    medalSrc = "/images/medals/medal_bronze.png";
  } else if (playCount >= 0) {
    medalSrc = "/images/medals/0.png";
  }


  if (medalSrc) {
    medalImage.src = medalSrc;
    medalImage.style.display = "inline-block";
    console.log("→ 表示する:", medalSrc);
  } else {
    medalImage.style.display = "none";
    console.log("→ 非表示");
  }
}

function showUpdatedMedal() {
  const playCount = parseInt(localStorage.getItem("playCount" + title)) || 0;
  updateMedalDisplay(playCount);
}
