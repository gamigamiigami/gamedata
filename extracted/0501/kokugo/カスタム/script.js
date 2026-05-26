import wordData from './worddata.js';

/* ===============================
   Firebase lazy getters
=============================== */
function getDb() { return window.firebaseDB; }
function getFbModules() { return window.firebaseModules; }

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
  const { getDocs, collection } = getFbModules();
  try {
    const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js");
    const snap = await getDocs(collection(db, getCollectionName()));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
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
   グローバル変数の定義
=============================== */
const TIME_LIMIT = 60;
const FALL_SPEED = 20;
const SPAWN_INTERVAL = 2000;
const PENALTY_TIME = 3;
const ROW_HEIGHT = 30;
const SORTING_AREA_ROWS = 3;
const SORTING_AREA_HEIGHT = ROW_HEIGHT * SORTING_AREA_ROWS;

let remainingTime = TIME_LIMIT;
let score = 0;
let currentCombo = 0;
let maxCombo = 0;
let fallingWords = [];
let landedWords = [];
let lastSpawnTime = Date.now();
let gameOver = false;
let gameLoopId;
let timerIntervalId;
let lastFrameTime = Date.now();
let wordIdCounter = 0;
let selectedTypes = new Set();
let bonusEnabled = false;

/* ===============================
   DOM取得
=============================== */
const playArea = document.getElementById('playArea');
const timerDisplay = document.getElementById('timer');
const scoreDisplay = document.getElementById('score');
const comboDisplay = document.getElementById('combo');
const maxComboDisplay = document.getElementById('maxCombo');
const startScreen = document.getElementById('startScreen');
const gameScreen = document.getElementById('gameScreen');
const returnButton = document.getElementById('returnButton');
const startButton = document.getElementById('startButton');
const bonusToggleButton = document.getElementById('bonusToggleButton');
const typeCheckboxesContainer = document.getElementById('typeCheckboxes');

/* ===============================
   品詞の種類を取得
=============================== */
const availableTypes = [...new Set(wordData.map(item => item.type))];

/* ===============================
   ローカルランキング
=============================== */
function getLocalKey() {
  return "rankings品詞カスタム" + (bonusEnabled ? "" : "_nobonus");
}

function getCollectionName() {
  return "ranks品詞カスタム" + (bonusEnabled ? "" : "_nobonus");
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
  const db = getDb();
  if (!db) {
    tbody.innerHTML = "<tr><td colspan='3'>Firebase未接続</td></tr>";
    return;
  }
  const { getDocs, query, collection, orderBy, limit } = getFbModules();
  try {
    const qSnap = await getDocs(
      query(collection(db, getCollectionName()), orderBy("score", "desc"), limit(300))
    );
    tbody.innerHTML = "";
    const seenDevices = new Set();
    let count = 0;
    for (const docSnap of qSnap.docs) {
      const { player, score, deviceId } = docSnap.data();
      if (deviceId && seenDevices.has(deviceId)) continue;
      if (deviceId) seenDevices.add(deviceId);
      count++;
      if (count > 30) break;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${count}</td><td>${player}</td><td>${score}</td>`;
      tbody.appendChild(tr);
    }
    if (count === 0) tbody.innerHTML = "<tr><td colspan='3'>データなし</td></tr>";
  } catch (e) {
    tbody.innerHTML = "<tr><td colspan='3'>取得エラー</td></tr>";
    console.error("Firestore 読み込みエラー:", e);
  }
}

/* ===============================
   EmailJS 通知設定
   ↓ EmailJS (emailjs.com) で取得した値を入力してください
=============================== */
const _EJS_PK  = "njxurV_IW84nYD01w";    // アカウント → Account → Public Key
const _EJS_SVC = "service_0eqi1dy";    // Email Services → Service ID
const _EJS_TPL = "template_6c3mcbm";   // Email Templates → Template ID

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

  const db = getDb();
  if (db) {
    const { addDoc, collection } = getFbModules();
    addDoc(collection(db, "violations"), {
      name:       username,
      game:       "品詞カスタム",
      date:       new Date().toISOString(),
      deviceId:   deviceId,
      deviceInfo: deviceInfo,
    }).catch(() => {});
  }

  _loadEmailJS().then(() => {
    emailjs.send(_EJS_SVC, _EJS_TPL, {
      bad_name:    username,
      game:        "品詞カスタム",
      device_id:   deviceId,
      device_info: deviceInfo,
      date:        dateStr,
    }).catch(() => {});
  }).catch(() => {});
}

async function saveGlobalScore(username, score) {
  if (containsBadWord(username)) {
    logViolation(username);
    return;
  }
  const db = getDb();
  if (!db) return;
  const { addDoc, collection } = getFbModules();
  const today    = new Date().toISOString().slice(0, 10);
  const deviceId = localStorage.getItem("deviceId");
  try {
    await addDoc(collection(db, getCollectionName()), {
      player:   username,
      score:    score,
      date:     today,
      deviceId: deviceId
    });
  } catch (e) {
    console.error("Firestore 保存エラー:", e);
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
function createTypeCheckboxes() {
  typeCheckboxesContainer.innerHTML = '';
  availableTypes.forEach(type => {
    const div = document.createElement('div');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `type-${type}`;
    checkbox.value = type;
    checkbox.checked = true;

    const label = document.createElement('label');
    label.htmlFor = `type-${type}`;
    label.textContent = type;

    div.appendChild(checkbox);
    div.appendChild(label);
    typeCheckboxesContainer.appendChild(div);

    selectedTypes.add(type);

    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedTypes.add(type);
      } else {
        selectedTypes.delete(type);
      }
    });
  });
}

/* ===============================
   ゲーム関連の関数
=============================== */
function generateUniqueId() {
  return "word_" + wordIdCounter++;
}

function updateTimerDisplay() {
  timerDisplay.textContent = "Time: " + remainingTime;
}

function updateScoreDisplay() {
  scoreDisplay.textContent = "Score: " + score;
}

function updateComboDisplay() {
  comboDisplay.textContent = "Combo: " + currentCombo;
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
  const sortingOverlay = document.createElement("div");
  sortingOverlay.id = "sortingAreaOverlay";

  Array.from(selectedTypes).forEach((category) => {
    const column = document.createElement("div");
    column.classList.add("sorting-column");
    column.dataset.category = category;
    column.innerHTML = `<span class="sorting-label">${category}</span>`;
    sortingOverlay.appendChild(column);
  });

  return sortingOverlay;
}

function getDecisionLineY() {
  const baseLine = playArea.clientHeight - SORTING_AREA_HEIGHT;
  if (landedWords.length === 0) return baseLine;
  const highestLandedY = Math.min(...landedWords.map((lw) => lw.y));
  return Math.min(baseLine, highestLandedY);
}

function spawnWord(presetX) {
  const filteredWords = wordData.filter(word => selectedTypes.has(word.type));
  if (filteredWords.length === 0) return;

  const data = filteredWords[Math.floor(Math.random() * filteredWords.length)];
  const wordDiv = document.createElement("div");
  wordDiv.classList.add("word");
  wordDiv.textContent = data.word;
  wordDiv.dataset.type = data.type;
  wordDiv.id = generateUniqueId();
  wordDiv.dataset.locked = "false";
  wordDiv.dataset.penalized = "false";
  wordDiv.style.whiteSpace = "nowrap";
  wordDiv.style.position = "absolute";
  wordDiv.style.left = "0px";
  wordDiv.style.top = "-30px";
  wordDiv.style.visibility = "hidden";

  playArea.appendChild(wordDiv);
  const measuredWidth = wordDiv.offsetWidth;

  const margin = 10;
  let x;
  const maxAttempts = 10;
  let attempts = 0;

  if (presetX !== undefined) {
    x = presetX;
    if (x < margin) x = margin;
    if (x + measuredWidth > playArea.clientWidth - margin) {
      x = playArea.clientWidth - measuredWidth - margin;
    }
    let overlap = false;
    for (const word of fallingWords) {
      if (x < word.x + word.element.offsetWidth && x + measuredWidth > word.x) {
        overlap = true;
        break;
      }
    }
    if (overlap) presetX = undefined;
  }

  if (presetX === undefined) {
    do {
      x = margin + Math.random() * (playArea.clientWidth - measuredWidth - 2 * margin);
      let overlap = false;
      for (const word of fallingWords) {
        if (x < word.x + word.element.offsetWidth && x + measuredWidth > word.x) {
          overlap = true;
          break;
        }
      }
      if (!overlap) break;
      attempts++;
    } while (attempts < maxAttempts);
  }

  wordDiv.style.left = x + "px";
  wordDiv.style.visibility = "visible";
  wordDiv.style.top = "-30px";

  wordDiv.addEventListener("mousedown", handleMouseDown);
  wordDiv.addEventListener("touchstart", handleTouchStart);

  fallingWords.push({ element: wordDiv, x: x, y: -30, speed: FALL_SPEED });
}

function lockWord(wordElem, dropCategory) {
  if (wordElem.dataset.locked === "true") return;
  wordElem.dataset.locked = "true";

  const correct = wordElem.dataset.type === dropCategory;
  if (correct) {
    wordElem.classList.add("correct");
    score += selectedTypes.size * 20;
    if (bonusEnabled) remainingTime += 1;
    currentCombo++;
    if (currentCombo > maxCombo) maxCombo = currentCombo;
    updateComboDisplay();
    updateTimerDisplay();
    updateScoreDisplay();
    setTimeout(() => { wordElem.remove(); }, 500);
  }
  fallingWords = fallingWords.filter((w) => w.element !== wordElem);
}

function showPenaltyEffect(x, y) {
  const effect = document.createElement("div");
  effect.classList.add("penalty-effect");
  effect.textContent = "-3s";
  effect.style.left = x + "px";
  effect.style.top = y + "px";
  playArea.appendChild(effect);
  setTimeout(() => { effect.remove(); }, 1000);
}

/* ===============================
   ドラッグ＆ドロップ処理
=============================== */
let currentDrag = null;

function handleMouseDown(e) {
  const wordElem = e.currentTarget;
  if (wordElem.dataset.locked === "true") return;
  e.preventDefault();
  const rect = wordElem.getBoundingClientRect();
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
  if (top >= getDecisionLineY() && wordElem.dataset.locked === "false") {
    const dropX = parseInt(wordElem.style.left) + wordElem.offsetWidth / 2;
    const columnWidth = playArea.clientWidth / selectedTypes.size;
    const columnIndex = Math.floor(dropX / columnWidth);
    const dropCategory = Array.from(selectedTypes)[columnIndex];
    if (wordElem.dataset.type === dropCategory) {
      lockWord(wordElem, dropCategory);
    } else if (wordElem.dataset.penalized !== "true") {
      wordElem.classList.add("wrong");
      remainingTime -= PENALTY_TIME;
      updateTimerDisplay();
      wordElem.dataset.penalized = "true";
      currentCombo = 0;
      updateComboDisplay();
      showPenaltyEffect(parseInt(wordElem.style.left) + wordElem.offsetWidth / 2, parseInt(wordElem.style.top) - 20);
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
      const columnWidth = playArea.clientWidth / selectedTypes.size;
      const columnIndex = Math.floor(dropX / columnWidth);
      const dropCategory = Array.from(selectedTypes)[columnIndex];

      if (word.element.dataset.type === dropCategory) {
        lockWord(word.element, dropCategory);
        return;
      } else {
        if (word.element.dataset.penalized !== "true") {
          word.element.classList.add("wrong");
          remainingTime -= PENALTY_TIME;
          updateTimerDisplay();
          word.element.dataset.penalized = "true";
          showPenaltyEffect(word.x + word.element.offsetWidth / 2, newY - 20);
          currentCombo = 0;
          updateComboDisplay();
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
    }
    word.y = newY;
    word.element.style.top = word.y + "px";
  });

  fallingWords = fallingWords.filter((word) => !word.landed && !word.remove);

  const sortingOverlay = document.getElementById("sortingAreaOverlay");
  if (sortingOverlay) {
    const currentDecisionLine = getDecisionLineY();
    sortingOverlay.style.top = currentDecisionLine + "px";
    sortingOverlay.style.height = playArea.clientHeight - currentDecisionLine + "px";
  }

  if (now - lastSpawnTime > SPAWN_INTERVAL) {
    let spawnCount = 1 + Math.floor(score / 1500);
    if (spawnCount > 1) {
      const wordWidth = 50;
      const totalSpace = playArea.clientWidth - wordWidth;
      const spacing = totalSpace / (spawnCount - 1);
      for (let i = 0; i < spawnCount; i++) {
        spawnWord(i * spacing);
      }
    } else {
      spawnWord();
    }
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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(gameLoopId);
  fallingWords.forEach((word) => { word.element.style.opacity = 0.5; });

  const username = getPlayerName();
  saveLocalScore(username, score);
  saveGlobalScore(username, score);

  gameScreen.style.display = "none";
  startScreen.style.display = "block";
  showLocalRanking();
}

function initGame() {
  if (selectedTypes.size === 0) {
    alert("少なくとも1つの品詞を選択してください！");
    return;
  }

  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);
  remainingTime = TIME_LIMIT;
  score = 0;
  currentCombo = 0;
  maxCombo = 0;
  updateComboDisplay();
  fallingWords = [];
  landedWords = [];
  lastSpawnTime = Date.now() - 1900;
  lastFrameTime = Date.now();
  gameOver = false;

  playArea.innerHTML = "";
  playArea.appendChild(createSortingArea());
  updateTimerDisplay();
  updateScoreDisplay();
  gameLoopId = requestAnimationFrame(gameLoop);
  gameLoop();
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
  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);
  gameScreen.style.display = "none";
  startScreen.style.display = "block";
});

startButton.addEventListener("click", () => { initGame(); });

document.getElementById("backButton").addEventListener("click", () => {
  window.history.back();
});

bonusToggleButton.addEventListener("click", () => {
  bonusEnabled = !bonusEnabled;
  bonusToggleButton.textContent = bonusEnabled ? "ボーナス: ON" : "ボーナス: OFF";
  if (rankingState === "local") {
    displayLocalRanking();
  } else if (rankingState === "global") {
    displayGlobalRanking();
  }
});

document.getElementById("rankingToggleButton").addEventListener("click", () => {
  if (rankingState === "local") {
    showGlobalRanking();
  } else {
    showLocalRanking();
  }
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

/* ===============================
   初期化
=============================== */
createTypeCheckboxes();
showLocalRanking();
