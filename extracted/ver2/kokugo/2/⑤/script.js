// ランキングボーダーの定義
const specialEntries = [
  {
    username: "👆👆👆👆Sランク👆👆👆👆",
    score: 6000,
    time: new Date("2025-02-15T00:00:00").getTime(),
  },
  {
    username: "👆👆👆👆Aランク👆👆👆👆",
    score: 4000,
    time: new Date("2025-02-15T00:00:00").getTime(),
  },
  {
    username: "👆👆👆👆Bランク👆👆👆👆",
    score: 2000,
    time: new Date("2025-02-15T00:00:00").getTime(),
  },
  {
    username: "👆👆👆👆Cランク👆👆👆👆",
    score: 1000,
    time: new Date("2025-02-15T00:00:00").getTime(),
  },
  {
    username: "👆👆👆👆Dランク👆👆👆👆",
    score: 0,
    time: new Date("2025-02-15T00:00:00").getTime(),
  },
];

// HTML の <h1> からゲームタイトルを取得（余分な空白を削除）
const title = document.querySelector("h1").textContent.trim();

// 特別エントリかどうかを判定する関数
function isSpecial(entry) {
  return specialEntries.some(
    (special) =>
      entry.username === special.username && entry.score === special.score
  );
}

function updateRankings() {
  let rankings = JSON.parse(localStorage.getItem("rankings" + title)) || [];

  // 特別エントリを追加
  specialEntries.forEach((special) => {
    const exists = rankings.some(
      (entry) =>
        entry.username === special.username && entry.score === special.score
    );
    if (!exists) {
      rankings.push(special);
    }
  });

  // ソート
  rankings.sort((a, b) => {
    if (b.score === a.score) return a.time - b.time;
    return b.score - a.score;
  });

  // 特別エントリと通常エントリに分離して、通常エントリは上位10件
  const specials = rankings.filter(isSpecial);
  const normals = rankings.filter((entry) => !isSpecial(entry));
  const topNormals = normals.slice(0, 10);

  // 結合して再ソート
  const combined = specials.concat(topNormals);
  combined.sort((a, b) => {
    if (b.score === a.score) return a.time - b.time;
    return b.score - a.score;
  });

  localStorage.setItem("rankings" + title, JSON.stringify(combined));
}

// ランキングを表示する関数
function displayRanking() {
  const rankingTableBody = document.querySelector("#ranking-table tbody");
  rankingTableBody.innerHTML = "";
  let rankings = JSON.parse(localStorage.getItem("rankings" + title)) || [];

  rankings.sort((a, b) => {
    if (b.score === a.score) return a.time - b.time;
    return b.score - a.score;
  });

  rankings.forEach((entry) => {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    if (isSpecial(entry)) {
      dateCell.textContent = "";
      row.classList.add("special-entry");
    } else {
      const d = new Date(entry.time);
      dateCell.textContent = `${d.getFullYear()}/${
        d.getMonth() + 1
      }/${d.getDate()}`;
    }
    const nameCell = document.createElement("td");
    nameCell.textContent = entry.username;
    const scoreCell = document.createElement("td");
    scoreCell.textContent = entry.score;

    row.appendChild(dateCell);
    row.appendChild(nameCell);
    row.appendChild(scoreCell);
    rankingTableBody.appendChild(row);
  });
}

// 初回表示
updateRankings();
displayRanking();

// ランキングリセット処理
const resetRankingButton = document.getElementById("resetRankingButton");
resetRankingButton.addEventListener("click", () => {
  if (confirm("ベストスコアをリセットしますか？")) {
    localStorage.removeItem("rankings" + title);
    updateRankings();
    displayRanking();
  }
});

/* ===============================
   ゲーム設定
=============================== */
const TIME_LIMIT = 60; // 制限時間（秒）
let remainingTime = TIME_LIMIT;
let score = 0;
const FALL_SPEED = 20; // 落下速度（ピクセル/秒）
const SPAWN_INTERVAL = 2000; // 単語出現間隔（ミリ秒）
const PENALTY_TIME = 3; // 誤答時ペナルティ秒数

// 仕分けエリア設定
const ROW_HEIGHT = 30;
const SORTING_AREA_ROWS = 3;
const SORTING_AREA_HEIGHT = ROW_HEIGHT * SORTING_AREA_ROWS; // 90px

/* ===============================
   ゲーム状態変数
=============================== */
let fallingWords = [];
let landedWords = [];
let lastSpawnTime = Date.now();
let gameOver = false;
let gameLoopId;
let timerIntervalId;
let lastFrameTime = Date.now();
let wordIdCounter = 0;
function generateUniqueId() {
  return "word_" + wordIdCounter++;
}

/* ===============================
   DOM 要素の取得
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

// ★ ボーナスON/OFFの設定 ★
let bonusEnabled = false; // 初期状態はOFF
const bonusToggleButton = document.getElementById("bonusToggleButton");
bonusToggleButton.addEventListener("click", () => {
  bonusEnabled = !bonusEnabled;
  bonusToggleButton.textContent = bonusEnabled
    ? "ボーナス: ON"
    : "ボーナス: OFF";
});

/* ===============================
   タイマー・スコア・COMBO表示更新
=============================== */
function updateTimerDisplay() {
  timerDisplay.textContent = "Time: " + remainingTime;
}
function updateScoreDisplay() {
  scoreDisplay.textContent = "Score: " + score;
}
function updateComboDisplay() {
  comboDisplay.textContent = "Combo: " + currentCombo;
  maxComboDisplay.textContent = "Max: " + maxCombo;

  // COMBO数10回、50回ごとにエフェクトを適用
  // ※50回優先（50の倍数の場合は15用エフェクト）
  if (currentCombo > 0 && currentCombo % 50 === 0) {
    comboDisplay.classList.add("combo-effect-50");
    setTimeout(() => comboDisplay.classList.remove("combo-effect-50"), 700);
  } else if (currentCombo > 0 && currentCombo % 10 === 0) {
    comboDisplay.classList.add("combo-effect");
    setTimeout(() => comboDisplay.classList.remove("combo-effect"), 500);
  }
}

/* ===============================
   仕分けエリアのカテゴリを取得
=============================== */
import wordData from "./wordData.js";
const categories = [...new Set(wordData.map((item) => item.type))];

function createSortingArea() {
  const sortingOverlay = document.createElement("div");
  sortingOverlay.id = "sortingAreaOverlay";
  categories.forEach((category) => {
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

/* ===============================
   単語生成関数（カテゴリ数に応じた配置）
=============================== */
function spawnWord(presetX) {
  const data = wordData[Math.floor(Math.random() * wordData.length)];
  const wordDiv = document.createElement("div");
  wordDiv.classList.add("word");
  wordDiv.textContent = data.word;
  wordDiv.dataset.type = data.type;
  wordDiv.id = generateUniqueId();
  wordDiv.dataset.locked = "false";
  wordDiv.dataset.penalized = "false";

  // 【１】 単語が改行されないように指定
  wordDiv.style.whiteSpace = "nowrap";

  // 初期位置の設定（後で計測用に一時的に表示）
  wordDiv.style.position = "absolute";
  wordDiv.style.left = "0px";
  wordDiv.style.top = "-30px";
  wordDiv.style.visibility = "hidden"; // 一時的に非表示

  // 一度 playArea に追加して、実際の幅を計測する
  playArea.appendChild(wordDiv);
  const measuredWidth = wordDiv.offsetWidth;

  // 【２】 両端対策用のマージン（例：10px）
  const margin = 10;
  let x;
  const maxAttempts = 10;
  let attempts = 0;

  if (presetX !== undefined) {
    x = presetX;
    // 左右のマージン内に収まるように調整
    if (x < margin) {
      x = margin;
    }
    if (x + measuredWidth > playArea.clientWidth - margin) {
      x = playArea.clientWidth - measuredWidth - margin;
    }
    // presetX 指定時でも、既存単語との重なりをチェック
    let overlap = false;
    for (const word of fallingWords) {
      const otherX = word.x;
      const otherWidth = word.element.offsetWidth;
      if (x < otherX + otherWidth && x + measuredWidth > otherX) {
        overlap = true;
        break;
      }
    }
    // 重なっている場合はランダム処理に切り替え
    if (overlap) {
      presetX = undefined;
    }
  }

  if (presetX === undefined) {
    // presetX がない場合は、左右マージンを考慮したランダムな x を求める
    do {
      x =
        margin +
        Math.random() * (playArea.clientWidth - measuredWidth - 2 * margin);
      let overlap = false;
      for (const word of fallingWords) {
        const otherX = word.x;
        const otherWidth = word.element.offsetWidth;
        // 矩形の重なり判定
        if (x < otherX + otherWidth && x + measuredWidth > otherX) {
          overlap = true;
          break;
        }
      }
      if (!overlap) break;
      attempts++;
    } while (attempts < maxAttempts);
  }

  // 最終的な x 座標を設定し、単語を表示
  wordDiv.style.left = x + "px";
  wordDiv.style.visibility = "visible";
  wordDiv.style.top = "-30px";

  // イベントリスナーの登録
  wordDiv.addEventListener("mousedown", handleMouseDown);
  wordDiv.addEventListener("touchstart", handleTouchStart);

  // fallingWords 配列に追加
  fallingWords.push({ element: wordDiv, x: x, y: -30, speed: FALL_SPEED });
}

/* ===============================
   正解時ロック処理
=============================== */
let currentCombo = 0;
let maxCombo = 0;

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
  const username =
    prompt("あなたの名前を入力してください") || "名前なしは０点だよ？";
  saveScore(username, score);
  console.log("Saving score for:", username, "Score:", score);
  gameScreen.style.display = "none";
  startScreen.style.display = "block";
}

/* ===============================
   スコア保存とランキング更新
=============================== */
function saveScore(username, score) {
  let rankings = JSON.parse(localStorage.getItem("rankings" + title)) || [];
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

  localStorage.setItem("rankings" + title, JSON.stringify(combined));
  displayRanking();
}

/* ===============================
   ゲーム初期化
=============================== */
function initGame() {
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

returnButton.addEventListener("click", () => {
  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);
  gameScreen.style.display = "none";
  startScreen.style.display = "block";
});

startButton.addEventListener("click", () => {
  initGame();
});

document.getElementById("backButton").addEventListener("click", function () {
  window.history.back();
});
