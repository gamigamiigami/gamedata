/*******************************************************
 * ページ全体でのテキスト選択とスクロールを無効化
 *******************************************************/
document.addEventListener("selectstart", (e) => e.preventDefault());
document.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
  },
  { passive: false }
);

/*******************************************************
 * ゲーム全体の状態管理（問題・スコア・タイマーなど）
 *******************************************************/
let questions = []; // questions.jsonから読み込む問題データ
let ranks = []; // ranks.jsonから読み込むランクデータ
let currentQuestion = null; // 現在の問題オブジェクト
let correctBoundaries = []; // 正しい切るべき位置（文字インデックス）
let userCuts = []; // ユーザーが既に切った境目（インデックス）
let score = 0; // 現在のスコア
let timeLeft = 60; // 残り時間（秒）
let timerInterval = null; // タイマー用interval
let gameActive = false; // ゲーム中かどうか
let lastQuestionIndex = -1; // 直前に出題した問題のインデックス

/*******************************************************
 * キャンバス関連の変数（縦書き用に変更）
 *******************************************************/
let canvas = document.getElementById("drawingCanvas");
let ctx = canvas.getContext("2d");
let baseText = ""; // 問題文（"/"を除いた表示用テキスト）
let letterBoundaries = []; // 各文字の【上端】y座標
let allBoundaries = []; // 文字間の境目（letterBoundariesの先頭以外）
let drawnPoints = []; // ユーザーがドラッグで描いた各点
let isDrawing = false; // ドラッグ中かどうか
let finishedAlready = false; // ドラッグ完了時の重複判定を防ぐ

/*******************************************************
 * DOM要素の取得
 *******************************************************/
const timerDisplay = document.getElementById("timer");
const scoreDisplay = document.getElementById("score");
const resultScreen = document.getElementById("result");
const finalScoreDisplay = document.getElementById("final-score");
const finalRankDisplay = document.getElementById("final-rank");
const restartButton = document.getElementById("restart-button");
const startScreen = document.getElementById("start-screen");
const startButton = document.getElementById("start-button");
const gameContainer = document.getElementById("game-container");
const gameContainerInner = document.getElementById("game-container-inner");
const harvestButton = document.getElementById("harvest-button");
const bambooDiv = document.getElementById("bamboo");

/*******************************************************
 * 画面スケール調整用（クリック座標補正用）
 *******************************************************/
let scaleFactor = 1;
function updateScaleFactor() {
  const designWidth = 600; // ゲームのデザイン幅
  const designHeight = 800; // ゲームの想定高さ
  const scaleX = window.innerWidth / designWidth;
  const scaleY = window.innerHeight / designHeight;
  scaleFactor = Math.min(scaleX, scaleY);
  gameContainer.style.transform = "scale(" + scaleFactor + ")";
  gameContainer.style.transformOrigin = "center"; // 中心基準に変更
}

window.addEventListener("resize", updateScaleFactor);
updateScaleFactor();

/*******************************************************
 * JSONデータの読み込み
 *******************************************************/
let questionsLoaded = false;
let ranksLoaded = false;

fetch("questions.json")
  .then((response) => response.json())
  .then((data) => {
    questions = data;
    questionsLoaded = true;
    checkDataLoaded();
  })
  .catch((error) => {
    console.error("questions.jsonの読み込みエラー:", error);
  });

fetch("ranks.json")
  .then((response) => response.json())
  .then((data) => {
    ranks = data.ranks;
    ranksLoaded = true;
    checkDataLoaded();
  })
  .catch((error) => {
    console.error("ranks.jsonの読み込みエラー:", error);
  });

function checkDataLoaded() {
  if (questionsLoaded && ranksLoaded) {
    // JSON読み込み完了後、スタート画面を表示（必要に応じて追加処理）
  }
}

/*******************************************************
 * イベントハンドラ用：タッチイベント（収穫）
 *******************************************************/
function onHarvestTouch(e) {
  e.preventDefault();
  onHarvest();
}

/*******************************************************
 * イベントハンドラ用：タッチイベント（スタート画面へ戻る）
 *******************************************************/
function onGoToStartScreen(e) {
  e.preventDefault();
  goToStartScreen();
}

/*******************************************************
 * 戻るボタン：国語ページに戻る
 *******************************************************/
const backBtn = document.getElementById("back-button");
if (backBtn) {
  backBtn.addEventListener("click", function (e) {
    e.preventDefault();
    window.location.href = "../index.html";
  });
  backBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    window.location.href = "../index.html";
  });
}

/*******************************************************
 * ゲーム開始処理
 *******************************************************/
function startGame() {
  if (questions.length === 0) return;
  // スタート画面を非表示にし、ゲーム中のコンテンツを表示
  startScreen.classList.add("hidden");
  gameContainerInner.classList.remove("hidden");

  score = 0;
  timeLeft = 60;
  updateScoreDisplay();
  updateTimerDisplay();
  resultScreen.classList.add("hidden");
  userCuts = [];
  gameActive = true;

  loadQuestion();

  // harvestButtonのイベントを初期状態（収穫処理）に登録
  harvestButton.textContent = "収穫する";
  harvestButton.removeEventListener("click", goToStartScreen);
  harvestButton.removeEventListener("touchend", onGoToStartScreen);
  harvestButton.addEventListener("click", onHarvest);
  harvestButton.addEventListener("touchend", onHarvestTouch);

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

/*******************************************************
 * タイマー表示更新
 *******************************************************/
function updateTimerDisplay() {
  timerDisplay.textContent = "Time: " + timeLeft;
}

/*******************************************************
 * スコア表示更新
 *******************************************************/
function updateScoreDisplay() {
  scoreDisplay.textContent = "Score: " + score;
}

/*****************************************************************************
* フォントサイズ自動計算（縦書きの高さを #bamboo の高さに合わせる）
*****************************************************************************/
function calculateFontSizeToFit(text) {
  const bambooRect = bambooDiv.getBoundingClientRect();
  const maxHeight = bambooRect.height * 0.95; // 5%のマージンを確保
  const lineSpacing = 5;
  
  // 文字数と必要な余白から最大サイズを計算
  let fontSize = Math.floor((maxHeight - (text.length - 1) * lineSpacing) / text.length);
  
  // 最小サイズ（10px）を下回らないようにする
  return Math.max(fontSize, 10);
}

/*****************************************************************************
* 問題文が長すぎる場合に適切な長さに調整する関数
*****************************************************************************/
function adjustTextLength(text, maxHeight) {
  const lineSpacing = 5;
  const minFontSize = 14; // 読みやすさを確保する最小フォントサイズ
  
  // 現在の文字数と最小サイズで表示した場合の高さを計算
  const requiredHeight = text.length * minFontSize + (text.length - 1) * lineSpacing;
  
  // 表示領域に収まる場合はそのまま返す
  if (requiredHeight <= maxHeight) {
    return text;
  }
  
  // 表示可能な最大文字数を計算
  const maxChars = Math.floor((maxHeight - lineSpacing) / (minFontSize + lineSpacing));
  
  // 文章を表示可能な長さに切り詰め
  return text.substring(0, maxChars - 3) + '...';
}

/*****************************************************************************
* キャンバスに問題文を縦書きで描画
*****************************************************************************/
function drawSentence() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 竹エリアのサイズを取得
  const bambooRect = bambooDiv.getBoundingClientRect();
  const maxHeight = bambooRect.height;
  
  // 問題文が長すぎる場合は調整
  const adjustedText = adjustTextLength(baseText, maxHeight);
  
  // 適切なフォントサイズを計算
  const baseFontSize = calculateFontSizeToFit(adjustedText);
  const lineSpacing = 5;
  
  ctx.font = baseFontSize + "px sans-serif";
  ctx.textBaseline = "top";

  // 最大文字幅を計算
  let maxCharWidth = 0;
  for (let char of adjustedText) {
    const w = ctx.measureText(char).width;
    if (w > maxCharWidth) maxCharWidth = w;
  }
  
  const horizontalMargin = 4;
  canvas.width = Math.ceil(maxCharWidth) + horizontalMargin;
  canvas.height = baseFontSize * adjustedText.length + lineSpacing * (adjustedText.length - 1);
  
  // フォント設定を再設定（キャンバスサイズ変更後は再設定が必要）
  ctx.font = baseFontSize + "px sans-serif";
  ctx.textBaseline = "top";

  // 背景を白に
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 文字を描画
  letterBoundaries = [];
  for (let i = 0; i < adjustedText.length; i++) {
    const char = adjustedText[i];
    const charWidth = ctx.measureText(char).width;
    const x = (canvas.width - charWidth) / 2;
    const y = i * (baseFontSize + lineSpacing);
    letterBoundaries.push(y);
    ctx.fillStyle = "black";
    ctx.fillText(char, x, y);
  }
  
  // 境界線情報を更新
  allBoundaries = letterBoundaries.slice(1);
  
  // デバッグ境界線を描画
  drawDebugBoundaries();
  
  // 既に切断済みの位置に切れ目を表示
  userCuts.forEach((cutIndex) => {
    if (cutIndex < letterBoundaries.length) {
      drawCutIndicator(letterBoundaries[cutIndex]);
    }
  });
}

/*****************************************************************************
* 問題読み込み・キャンバス描画
* 【修正】同じ問題が連続しないようにランダム選出
*****************************************************************************/
function loadQuestion() {
  let newIndex;
  do {
    newIndex = Math.floor(Math.random() * questions.length);
  } while (questions.length > 1 && newIndex === lastQuestionIndex);
  lastQuestionIndex = newIndex;
  currentQuestion = questions[newIndex];

  const segments = currentQuestion.sentence.split("/");
  correctBoundaries = [];
  let cumulativeLength = 0;
  for (let i = 0; i < segments.length - 1; i++) {
    cumulativeLength += segments[i].length;
    correctBoundaries.push(cumulativeLength);
  }
  baseText = segments.join("");
  userCuts = [];
  drawSentence();
}
/*******************************************************
 * ドラッグ（マウス・タッチ）の処理
 * ※ 座標補正のため、canvas.getBoundingClientRect()で取得した値をscaleFactorで割る
 *******************************************************/
document.addEventListener("mousedown", (e) => {
  if (!gameActive || e.button !== 0) return;
  isDrawing = true;
  finishedAlready = false;
  drawnPoints = [];
});

document.addEventListener("mousemove", (e) => {
  if (!gameActive || !isDrawing) return;
  const rect = canvas.getBoundingClientRect();
  if (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  ) {
    const x = (e.clientX - rect.left) / scaleFactor;
    const y = (e.clientY - rect.top) / scaleFactor;
    if (drawnPoints.length === 0) {
      drawnPoints.push({ x, y });
    } else {
      const lastPoint = drawnPoints[drawnPoints.length - 1];
      ctx.strokeStyle = "red";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      drawnPoints.push({ x, y });
    }
  }
});

document.addEventListener("mouseup", (e) => {
  if (!gameActive) return;
  if (isDrawing) {
    isDrawing = false;
    finishDrawing();
  }
});

canvas.addEventListener("mouseleave", (e) => {
  if (!gameActive) return;
  if (isDrawing) {
    isDrawing = false;
    finishDrawing();
  }
});

document.addEventListener("touchstart", (e) => {
  if (!gameActive) return;
  isDrawing = true;
  finishedAlready = false;
  drawnPoints = [];
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = (touch.clientX - rect.left) / scaleFactor;
  const y = (touch.clientY - rect.top) / scaleFactor;
  drawnPoints.push({ x, y });
  e.preventDefault();
});

document.addEventListener("touchmove", (e) => {
  if (!gameActive || !isDrawing) return;
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = (touch.clientX - rect.left) / scaleFactor;
  const y = (touch.clientY - rect.top) / scaleFactor;
  if (drawnPoints.length === 0) {
    drawnPoints.push({ x, y });
  } else {
    const lastPoint = drawnPoints[drawnPoints.length - 1];
    ctx.strokeStyle = "red";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    drawnPoints.push({ x, y });
  }
  e.preventDefault();
});

document.addEventListener("touchend", (e) => {
  if (!gameActive) return;
  if (isDrawing) {
    isDrawing = false;
    finishDrawing();
  }
  e.preventDefault();
});

document.addEventListener("touchcancel", (e) => {
  if (!gameActive) return;
  if (isDrawing) {
    isDrawing = false;
    finishDrawing();
  }
  e.preventDefault();
});

/*******************************************************
 * ドラッグ終了時の処理
 *******************************************************/
function finishDrawing() {
  if (finishedAlready) return;
  finishedAlready = true;
  checkCorrect();
  setTimeout(() => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSentence();
  }, 300);
}

/*******************************************************
 * 正誤判定処理【修正済み】
 * ・既に切断済みの境界は無視する
 * ・新たに交差した境界が１箇所のみの場合のみ正解とする
 *******************************************************/
function checkCorrect() {
  const checkOffset = 30;
  let intersectedBoundaries = new Set();
  for (let i = 1; i < letterBoundaries.length; i++) {
    let A = { x: 0, y: letterBoundaries[i] + checkOffset };
    let B = { x: canvas.width, y: letterBoundaries[i] - checkOffset };
    for (let j = 1; j < drawnPoints.length; j++) {
      let P = drawnPoints[j - 1];
      let Q = drawnPoints[j];
      if (doLineSegmentsIntersect(P, Q, A, B)) {
        intersectedBoundaries.add(i);
        break;
      }
    }
  }
  if (intersectedBoundaries.size === 0) return;
  // 既に切断済みの境界を除外
  let newCuts = Array.from(intersectedBoundaries).filter(
    (boundary) => !userCuts.includes(boundary)
  );
  if (newCuts.length === 1) {
    let boundary = newCuts[0];
    if (correctBoundaries.includes(boundary)) {
      playSwordEffect(letterBoundaries[boundary]);
      score += 50;
      updateScoreDisplay();
      userCuts.push(boundary);
      return;
    }
  }
  playPenaltyEffect();
  timeLeft = Math.max(0, timeLeft - 5);
  updateTimerDisplay();
}

function playSwordEffect(yPos) {
  let duration = 300;
  let startTime = null;
  function animate(time) {
    if (!startTime) startTime = time;
    let progress = (time - startTime) / duration;
    if (progress > 1) progress = 1;
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.strokeStyle = "gold";
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(0, yPos - 20);
    ctx.lineTo(canvas.width, yPos + 20);
    ctx.stroke();
    ctx.restore();
    if (progress < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

function playPenaltyEffect() {
  bambooDiv.classList.add("harvest-error");
  setTimeout(() => {
    bambooDiv.classList.remove("harvest-error");
  }, 500);
}

/*******************************************************
 * 交差判定ヘルパー関数群
 *******************************************************/
function orientation(p, q, r) {
  let val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (val === 0) return 0;
  return val > 0 ? 1 : 2;
}

function onSegment(p, q, r) {
  return (
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y)
  );
}

function doLineSegmentsIntersect(p, q, r, s) {
  let o1 = orientation(p, q, r);
  let o2 = orientation(p, q, s);
  let o3 = orientation(r, s, p);
  let o4 = orientation(r, s, q);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p, r, q)) return true;
  if (o2 === 0 && onSegment(p, s, q)) return true;
  if (o3 === 0 && onSegment(r, p, s)) return true;
  if (o4 === 0 && onSegment(r, q, s)) return true;
  return false;
}

/*******************************************************
 * 切断済み境界のインジケーター描画（斜めライン）
 *******************************************************/
function drawCutIndicator(yPos) {
  const offset = 10;
  ctx.strokeStyle = "red";
  ctx.lineWidth = 5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(0, yPos + offset);
  ctx.lineTo(canvas.width, yPos - offset);
  ctx.stroke();
  ctx.setLineDash([]);
}

/*******************************************************
 * デバッグ用：斜め点線の各境界線（薄い青）
 *******************************************************/
function drawDebugBoundaries() {
  ctx.strokeStyle = "rgba(0, 0, 255, 0.3)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  const offset = 10;
  allBoundaries.forEach((boundaryY) => {
    ctx.beginPath();
    ctx.moveTo(0, boundaryY + offset);
    ctx.lineTo(canvas.width, boundaryY - offset);
    ctx.stroke();
  });
  ctx.setLineDash([]);
}

/*******************************************************
 * 「収穫する」ボタン押下時の処理
 *******************************************************/
function onHarvest() {
  if (!gameActive) return;
  if (userCuts.length < correctBoundaries.length) {
    timeLeft = Math.max(0, timeLeft - 5);
    updateTimerDisplay();
    bambooDiv.classList.add("harvest-error");
    setTimeout(() => {
      bambooDiv.classList.remove("harvest-error");
    }, 500);
    return;
  }
  score += 100;
  updateScoreDisplay();
  loadQuestion();
}

/*******************************************************
 * ゲーム終了処理
 *******************************************************/
function endGame() {
  clearInterval(timerInterval);
  gameActive = false;
  finalScoreDisplay.textContent = "最終スコア: " + score;
  finalRankDisplay.textContent = "ランク: " + determineRank(score);
  resultScreen.classList.remove("hidden");

  // harvestButtonのイベントをスタート画面へ戻る処理に切替
  harvestButton.textContent = "スタート画面へ戻る";
  harvestButton.removeEventListener("click", onHarvest);
  harvestButton.removeEventListener("touchend", onHarvestTouch);
  harvestButton.addEventListener("click", goToStartScreen);
  harvestButton.addEventListener("touchend", onGoToStartScreen);
}

/*******************************************************
 * スコアに応じたランク判定
 *******************************************************/
function determineRank(score) {
  const sortedRanks = ranks.sort((a, b) => b.score - a.score);
  for (let i = 0; i < sortedRanks.length; i++) {
    if (score >= sortedRanks[i].score) return sortedRanks[i].rank;
  }
  return "D";
}

/*******************************************************
 * 再挑戦ボタン
 *******************************************************/
restartButton.addEventListener("click", startGame);
restartButton.addEventListener("touchend", (e) => {
  e.preventDefault();
  startGame();
});

/*******************************************************
 * スタートボタン
 *******************************************************/
startButton.addEventListener("click", startGame);
startButton.addEventListener("touchend", (e) => {
  e.preventDefault();
  startGame();
});

/*******************************************************
 * スタート画面へ戻る処理
 *******************************************************/
function goToStartScreen() {
  // プレイ画面（ゲーム中のコンテンツ）を非表示にする
  gameContainerInner.classList.add("hidden");
  // 結果画面を非表示にし、スタート画面を表示
  resultScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");

  // harvestButton を元に戻す（次回ゲーム開始時に再利用できるように）
  harvestButton.textContent = "収穫する";
  harvestButton.removeEventListener("click", goToStartScreen);
  harvestButton.removeEventListener("touchend", onGoToStartScreen);
  harvestButton.addEventListener("click", onHarvest);
  harvestButton.addEventListener("touchend", onHarvestTouch);
}

/* スタート画面用のタッチイベント（ゲーム終了後の「スタート画面へ戻る」用）は onGoToStartScreen を利用 */