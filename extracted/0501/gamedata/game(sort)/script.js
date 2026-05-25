

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

  let showingAlt = false;
  if (table2) table2.style.display = "none";

  toggleButton.addEventListener("click", async () => {
    showingAlt = !showingAlt;

    if (showingAlt) {
      await displayAltRanking();
    }

    table1.style.display             = showingAlt ? "none"  : "table";
    table2.style.display             = showingAlt ? "table" : "none";
    toggleButton.textContent         = showingAlt ? "グローバルランキング" : "My ベストスコア";
    resetRankingButton.style.display = showingAlt ? "none" : "inline-block";
  });
});

// --- Firestore 操作用関数等 ---

import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
const db = window.firebaseDB;

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
  tbody.innerHTML   = "";
  const seenDevices = new Set();
  try {
    const qSnap = await getDocs(
      query(
        collection(db, getFirestoreCollectionName()),
        orderBy("score", "desc"),
        limit(limitNum * 100) // 重複排除用に多めに取得
      )
    );
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
  } catch (e) {
    console.error("Firestore 読み込みエラー:", e);
  }
};

// Firestore にスコアを保存（deviceId も添付）
async function saveToFirebase(username, score) {
  const today    = new Date().toISOString().slice(0, 10);
  const deviceId = localStorage.getItem("deviceId");
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
  // 外部から渡されたデータを保持
  currentWordData = wordData;

  // カテゴリ生成
  categories = [...new Set(currentWordData.map(item => item.type))];

  // 落下速度をカテゴリ数に応じて調整
  FALL_SPEED = Math.min(300 / categories.length, 50);

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
   UIイベント
=============================== */
returnButton.addEventListener("click", () => {
  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);

  gameScreen.style.display = "none";
  startScreen.style.display = "block";

  showUpdatedMedal();
});

startButton.addEventListener("click", () => {
  initGame(currentWordData);
});

document.getElementById("backButton").addEventListener("click", () => {
  window.location.href = "../index.html";
});


document.getElementById("changeNameButton").addEventListener("click", () => {
  let newName;

  while (true) {
    newName = prompt("新しい名前を入力してください（20文字以内）");
    if (newName === null) return;

    if (newName.trim() === "") {
      alert("空の名前は使えません");
    } else if (newName.length > 20) {
      alert("20文字以内で入力してください");
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
  if (top >= getDecisionLineY() && wordElem.dataset.locked === "false") {
    const dropX = parseInt(wordElem.style.left) + wordElem.offsetWidth / 2;
    const columnWidth = playArea.clientWidth / categories.length;
    const columnIndex = Math.floor(dropX / columnWidth);
    const dropCategory = categories[columnIndex];

    if (wordElem.dataset.type === dropCategory) {
      lockWord(wordElem, dropCategory);
    } else if (wordElem.dataset.penalized !== "true") {
      wordElem.classList.add("wrong");
      remainingTime -= PENALTY_TIME;
      updateTimerDisplay();
      wordElem.dataset.penalized = "true";
      // 誤答時はCOMBOをリセット
      currentCombo = 0;
      updateComboDisplay();
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
          remainingTime -= PENALTY_TIME;
          updateTimerDisplay();
          word.element.dataset.penalized = "true";
          const effectX = word.x + word.element.offsetWidth / 2;
          const effectY = newY - 20;
          showPenaltyEffect(effectX, effectY);
          // 誤答時はCOMBOをリセット
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
  fallingWords.forEach((word) => {
    word.element.style.opacity = 0.5;
  });
  alert("GAME OVER!\nスコア: " + score);

  if (score >= 1000) {
    incrementPlayCount();
  }

  // ✅ 名前を記憶して、2回目以降は聞かない
let username = localStorage.getItem("playerName");

if (!username) {
  let inputName = "";
  while (!inputName) {
    inputName = prompt("あなたの名前を入力してください（20文字以内）") || "";
    
    if (inputName.length > 20) {
      alert("20文字以内で入力してください。");
      inputName = "";
    }
  }

  username = inputName;
  localStorage.setItem("playerName", username);
}


  saveScore(username, score);
  saveToFirebase(username, score);
  console.log("Saving score for:", username, "Score:", score);

  gameScreen.style.display = "none";
  startScreen.style.display = "block";

  showUpdatedMedal();

  const table1 = document.getElementById("ranking-table");
  const table2 = document.getElementById("alt-ranking-table");
  const toggleButton = document.getElementById("rankingToggleButton");
  const resetRankingButton = document.getElementById("resetRankingButton");

  table1.style.display = "table";
  table2.style.display = "none";
  toggleButton.textContent = "My ベストスコア";
  resetRankingButton.style.display = "inline-block";
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
