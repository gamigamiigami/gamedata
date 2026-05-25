import { db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    limit, 
    getDocs, 
    deleteDoc 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import wordData from './worddata.js';

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

// DOM要素の取得
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

// 利用可能な品詞の種類を取得
const availableTypes = [...new Set(wordData.map(item => item.type))];

// ランキング用の特別エントリ（ボーナスON/​OFF別に用意）
const specialEntries = [
    { username: "👆👆👆👆Sランク👆👆👆👆", score: 6000, time: new Date("2025-02-15T00:00:00").getTime(), bonusEnabled: false },
    { username: "👆👆👆👆Aランク👆👆👆👆", score: 4000, time: new Date("2025-02-15T00:00:00").getTime(), bonusEnabled: false },
    { username: "👆👆👆👆Bランク👆👆👆👆", score: 2000, time: new Date("2025-02-15T00:00:00").getTime(), bonusEnabled: false },
    { username: "👆👆👆👆Cランク👆👆👆👆", score: 1000, time: new Date("2025-02-15T00:00:00").getTime(), bonusEnabled: false },
    { username: "👆👆👆👆Dランク👆👆👆👆", score: 0,    time: new Date("2025-02-15T00:00:00").getTime(), bonusEnabled: false },
    { username: "👆👆👆👆Sランク👆👆👆👆", score: 10000, time: new Date("2025-02-15T00:00:00").getTime(), bonusEnabled: true },
    { username: "👆👆👆👆Aランク👆👆👆👆", score: 6000, time: new Date("2025-02-15T00:00:00").getTime(), bonusEnabled: true },
    { username: "👆👆👆👆Bランク👆👆👆👆", score: 4000, time: new Date("2025-02-15T00:00:00").getTime(), bonusEnabled: true },
    { username: "👆👆👆👆Cランク👆👆👆👆", score: 2000, time: new Date("2025-02-15T00:00:00").getTime(), bonusEnabled: true },
    { username: "👆👆👆👆Dランク👆👆👆👆", score: 0,    time: new Date("2025-02-15T00:00:00").getTime(), bonusEnabled: true }
];

// チェックボックスの生成
function createTypeCheckboxes() {
    typeCheckboxesContainer.innerHTML = ''; // 既存のチェックボックスをクリア
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

// Firebase関連の関数
async function updateRankings() {
    try {
        const rankingsRef = collection(db, 'rankings');
        const q = query(rankingsRef, orderBy('score', 'desc'), limit(100));
        const querySnapshot = await getDocs(q);
        
        // Firestoreから取得した全ランキングを一旦配列にする
        let allEntries = [];
        querySnapshot.forEach((doc) => {
            allEntries.push({ id: doc.id, ...doc.data() });
        });

        // “現在のモード”に合わせてフィルタリング
        // bonusEnabled が true のときは「BONUS: ON」モードとして、false のときは「BONUS: OFF」モードとして扱う
        let filtered = allEntries.filter(entry => entry.bonusEnabled === bonusEnabled);

        // specialEntriesのうち、現在のモードに該当するエントリだけを追加
        specialEntries
            .filter(s => s.bonusEnabled === bonusEnabled)
            .forEach(special => {
                const exists = filtered.some(
                    entry => entry.username === special.username && entry.score === special.score
                );
                if (!exists) {
                    filtered.push(special);
                }
            });

        // ソート：score降順 → time昇順
        filtered.sort((a, b) => {
            if (b.score === a.score) return a.time - b.time;
            return b.score - a.score;
        });

        displayRanking(filtered);
    } catch (error) {
        console.error("Error updating rankings:", error);
    }
}

async function saveScore(username, score) {
    try {
        const rankingsRef = collection(db, 'rankings');
        await addDoc(rankingsRef, {
            username,
            score,
            time: Date.now(),
            bonusEnabled: bonusEnabled  // 現在のボーナスON/OFF情報を保存
        });
        await updateRankings();
    } catch (error) {
        console.error("Error saving score:", error);
    }
}

function isSpecial(entry) {
    return specialEntries.some(
        (special) =>
            entry.username === special.username && entry.score === special.score && entry.bonusEnabled === special.bonusEnabled
    );
}

async function displayRanking(rankings) {
    const rankingTableBody = document.querySelector("#ranking-table tbody");
    rankingTableBody.innerHTML = "";

    rankings.forEach((entry, index) => {
        const row = document.createElement("tr");
        if (isSpecial(entry)) {
            row.classList.add("special-entry");
        }

        const rankCell = document.createElement("td");
        rankCell.textContent = index + 1; // ランキング順位
        rankCell.classList.add("rank-cell");

        const dateCell = document.createElement("td");
        if (isSpecial(entry)) {
            dateCell.textContent = ""; 
        } else {
            const d = new Date(entry.time);
            dateCell.textContent = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
        }

        const nameCell = document.createElement("td");
        nameCell.textContent = entry.username;

        const scoreCell = document.createElement("td");
        scoreCell.textContent = entry.score;

        // ボーナス列は省略（モードごとに絞り込んでいるため不要）

        row.appendChild(rankCell);
        row.appendChild(dateCell);
        row.appendChild(nameCell);
        row.appendChild(scoreCell);
        rankingTableBody.appendChild(row);
    });
}

// ゲーム関連の関数（以降は既存のまま）
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
    // 選択された品詞の単語のみをフィルタリング
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
        if (x < margin) {
            x = margin;
        }
        if (x + measuredWidth > playArea.clientWidth - margin) {
            x = playArea.clientWidth - measuredWidth - margin;
        }
        let overlap = false;
        for (const word of fallingWords) {
            const otherX = word.x;
            const otherWidth = word.element.offsetWidth;
            if (x < otherX + otherWidth && x + measuredWidth > otherX) {
                overlap = true;
                break;
            }
        }
        if (overlap) {
            presetX = undefined;
        }
    }

    if (presetX === undefined) {
        do {
            x = margin + Math.random() * (playArea.clientWidth - measuredWidth - 2 * margin);
            let overlap = false;
            for (const word of fallingWords) {
                const otherX = word.x;
                const otherWidth = word.element.offsetWidth;
                if (x < otherX + otherWidth && x + measuredWidth > otherX) {
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
        // 選択された品詞の数に基づいて点数を計算
        score += selectedTypes.size * 20;
        if (bonusEnabled) {
            remainingTime += 1;
        }
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

// ドラッグ＆ドロップ関連の処理
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

// ゲームループとタイマー処理
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
                    const effectX = word.x + word.element.offsetWidth / 2;
                    const effectY = newY - 20;
                    showPenaltyEffect(effectX, effectY);
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
        let currentDecisionLine = getDecisionLineY();
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

function endGame() {
    gameOver = true;
    cancelAnimationFrame(gameLoopId);
    fallingWords.forEach((word) => {
        word.element.style.opacity = 0.5;
    });
    alert("GAME OVER!\nスコア: " + score);
    const username = prompt("あなたの名前を入力してください") || "名前なしは０点だよ？";
    saveScore(username, score);
    gameScreen.style.display = "none";
    startScreen.style.display = "block";
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

// イベントリスナーの設定
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

startButton.addEventListener("click", () => {
    initGame();
});

document.getElementById("backButton").addEventListener("click", function () {
  window.history.back();
});

bonusToggleButton.addEventListener("click", () => {
    bonusEnabled = !bonusEnabled;
    bonusToggleButton.textContent = bonusEnabled ? "ボーナス: ON" : "ボーナス: OFF";
    updateRankings().catch(console.error);
});

// script.jsのリセットボタンのイベントリスナーを修正
document.getElementById("resetRankingButton").addEventListener("click", async () => {
    const password = prompt("リセットパスワードを入力してください：");
    if (password !== "91531") {
        alert("パスワードが違います。");
        return;
    }

    if (confirm("全てのランキングをリセットしますか？\n※この操作は取り消せません")) {
        try {
            const rankingsRef = collection(db, 'rankings');
            const querySnapshot = await getDocs(rankingsRef);
            
            const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
            await Promise.all(deletePromises);
            
            await updateRankings();
            alert("ランキングをリセットしました。");
        } catch (error) {
            console.error("Error resetting rankings:", error);
            alert("ランキングのリセットに失敗しました");
        }
    }
});

// DOMContentLoadedイベントで初期化
document.addEventListener('DOMContentLoaded', () => {
    createTypeCheckboxes();
    updateRankings().catch(console.error);
});
