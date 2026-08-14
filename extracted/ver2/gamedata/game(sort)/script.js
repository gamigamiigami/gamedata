

// ★ Firestore インポートと初期化は元コードのまま ---
// import { collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js";
// const db = window.firebaseDB;

// ★ ver2 進捗エンジン＆マスコット（import.meta.url 基準なのでHTML側の変更不要）
import * as v2p from "../../shared/progress.js";
import { mascotSVG, mascotComment } from "../../shared/mascot.js";
// ★ 出題エンジン（山札＋習熟度）と 音（Web Audio 合成）
import { createDeck, masteryFor, recordDay, todayStats, hintDelayMs, flush as masteryFlush } from "../../shared/mastery.js";
import audio from "../../shared/audio.js";
import { getSetting, setSetting } from "../../shared/settings.js";

// 共有デザインCSSを注入
(function injectDesignCSS() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("../../shared/design.css", import.meta.url).href;
  document.head.appendChild(link);
})();

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

  // 学校ログイン中バッジをランキングエリア上部に表示
  (function() {
    const sc = localStorage.getItem('schoolCode');
    const sn = localStorage.getItem('schoolName');
    if (!sc) return;
    const badge = document.createElement("div");
    badge.style.cssText =
      "font-size:12px;color:#fed000;border:1px solid #555;border-radius:6px;" +
      "padding:4px 10px;margin-bottom:8px;display:inline-block;";
    badge.textContent = "学校: " + (sn || sc) + " でログイン中";
    const rc = document.getElementById("rankingContainer");
    if (rc) rc.insertBefore(badge, rc.firstChild);
  })();

  // ヘッダーに「目標バー」「音」「ポーズ」を動的生成（HTML側は全ゲーム無改修）
  const header = document.getElementById("header");
  if (header) {
    // 最大コンボはプレイ中に手の打ちようがない数字なので、HUDからは下ろす。
    // （変数は残すので結果画面と称号判定はそのまま動く）
    header.classList.add("hud-lean");

    // 目標バー：HUDが「いまの数字」なら、こちらは「次の一手」
    const goal = document.createElement("div");
    goal.id = "goalBar";
    goal.setAttribute("role", "status");
    goal.setAttribute("aria-live", "polite");
    goal.innerHTML = '<span class="goal-main"></span><span class="goal-track"><i class="goal-fill"></i></span>';
    header.appendChild(goal);

    // 音：教室やバスの中で、止めるのにポーズを挟ませない。1タップで循環
    const sndBtn = document.createElement("button");
    sndBtn.id = "soundButton";
    sndBtn.type = "button";
    const paintSound = () => {
      const m = audio.getMode();
      sndBtn.dataset.mode = m;
      // 3状態を色だけで区別させない。字形も変える
      sndBtn.textContent = m === "all" ? "♪" : m === "sfx" ? "♩" : "×";
      sndBtn.setAttribute("aria-label", audio.modeLabel());
      sndBtn.title = audio.modeLabel();
    };
    paintSound();
    sndBtn.addEventListener("click", () => {
      audio.unlock();
      const m = audio.nextMode();
      paintSound();
      if (m === "all" && !gameOver && !isPaused && gameLoopId) audio.bgm.start(Math.min(1, correctCount / 30));
      if (m !== "off") audio.sfx("tick");
      showSoundToast(audio.modeLabel());
    });
    header.appendChild(sndBtn);

    const pauseBtn = document.createElement("button");
    pauseBtn.id = "pauseButton";
    pauseBtn.textContent = "⏸";
    pauseBtn.addEventListener("click", pauseGame);
    header.appendChild(pauseBtn);
  }

  // スタート画面：「ボーナス: OFF」という機械の言葉をやめ、
  // 何が起きるかを1行で言い切った2枚のカードから選ばせる
  (function injectModeChooser() {
    const old = document.getElementById("bonusToggleButton");
    if (!old) return;
    const row = old.closest(".button-row") || old.parentNode;
    if (!row || !row.parentNode) return;
    const fs = document.createElement("div");
    fs.id = "modeChooser";
    fs.setAttribute("role", "radiogroup");
    fs.setAttribute("aria-label", "モードをえらぶ");
    fs.innerHTML = `
      <p class="mode-legend">モードをえらぶ</p>
      <label class="mode-opt">
        <input type="radio" name="playMode" value="challenge">
        <span class="mode-body">
          <span class="mode-name">60秒チャレンジ</span>
          <span class="mode-desc">60秒でどこまで正解できるか</span>
        </span>
      </label>
      <label class="mode-opt">
        <input type="radio" name="playMode" value="slow">
        <span class="mode-body">
          <span class="mode-name">じっくりモード</span>
          <span class="mode-desc">正解するたびに時間がふえる（最長2分）</span>
        </span>
      </label>`;
    row.parentNode.insertBefore(fs, row);
    fs.addEventListener("change", (e) => {
      if (e.target.name === "playMode") setPlayMode(e.target.value);
    });
    const cur = bonusEnabled ? "slow" : "challenge";
    fs.querySelectorAll(".mode-opt").forEach((elm) => {
      const on = elm.querySelector("input").value === cur;
      elm.classList.toggle("is-on", on);
      elm.querySelector("input").checked = on;
    });
  })();

  // ★ スタート画面に弱点特訓ボタンを注入（ノートに問題がある時だけ表示）
  (function () {
    const startBtn = document.getElementById("startButton");
    if (!startBtn) return;
    let count = 0;
    try { count = v2p.getNoteFor(title).length; } catch (e) { return; }
    const tk = document.createElement("button");
    tk.id = "tokkunButton";
    tk.className = "v2-btn v2-btn--ghost";
    tk.style.cssText = "margin:10px auto 0; display:" + (count > 0 ? "inline-flex" : "none") + "; border-color:#fed000; color:#fed000;";
    tk.textContent = `弱点特訓（${count}問）`;
    tk.addEventListener("click", () => {
      tokkunPending = true;
      startBtn.click();
      // 品詞選択ゲーム等でスタートが実行されなかった場合に備えてフラグを戻す
      setTimeout(() => { tokkunPending = false; }, 1500);
    });
    startBtn.insertAdjacentElement("afterend", tk);
  })();

  // ポーズオーバーレイを動的生成
  const pauseOverlay = document.createElement("div");
  pauseOverlay.id = "pauseOverlay";
  pauseOverlay.style.cssText = "display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(8,11,18,.88); backdrop-filter:blur(3px); align-items:center; justify-content:center; z-index:200;";
  pauseOverlay.innerHTML = `
    <div style="background:linear-gradient(180deg,#222836,#1a1f2b); border:1px solid #39404e; border-radius:22px; padding:36px 52px; text-align:center; box-shadow:0 24px 60px rgba(0,0,0,.6);">
      <p style="font-size:15px; margin:0 0 6px; letter-spacing:.3em; color:#9aa1ad; font-weight:800;">PAUSE</p>
      <p style="font-size:23px; margin:0 0 22px; color:#fed000; font-weight:900;">一時停止中</p>
      <button id="resumeButton" style="min-width:180px; height:52px; padding:0 26px; font-size:17px; cursor:pointer; background:linear-gradient(180deg,#ffe14d,#fed000); color:#1a1400; border:none; border-radius:999px; font-weight:900; box-shadow:0 4px 0 #b89600, 0 8px 20px rgba(254,208,0,.3);">▶ 再開する</button>
    </div>`;
  document.body.appendChild(pauseOverlay);
  pauseOverlay.querySelector("#resumeButton").addEventListener("click", resumeGame);

  // 結果画面を動的生成
  const resultScreen = document.createElement("div");
  resultScreen.id = "resultScreen";
  resultScreen.style.cssText = "display:none; text-align:center; padding:20px 12px; margin-top:20px; color:#fff; font-family:var(--font, system-ui);";
  resultScreen.innerHTML = `
    <h2 style="color:#fed000; letter-spacing:.06em; margin:0 0 14px;">ゲーム結果</h2>
    <div class="v2-card" style="max-width:520px; margin:0 auto; text-align:left;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
        <span id="resultMascot" class="v2-mascot v2-mascot--bounce"></span>
        <p id="resultSpeech" class="v2-speech" style="margin:0;"></p>
      </div>
      <div id="celebrateSlot"></div>
      <div id="resultRankBox">
        <div id="resultRankBadge">-</div>
        <div id="resultRankInfo">
          <p id="resultRankTitle">ランク</p>
          <p id="resultRankDetail"></p>
        </div>
      </div>
      <div class="v2-result-row" style="animation-delay:.05s;">
        <span>正解数</span><span><b id="resultCorrectCount">0</b> 問</span>
      </div>
      <div class="v2-result-row" style="animation-delay:.1s;">
        <span>正確さ</span>
        <span><b id="resultAccuracy">0</b><span class="v2-unit">%</span><span id="resultAccSub" class="v2-sub"></span></span>
      </div>
      <div class="v2-result-row" style="animation-delay:.15s;">
        <span>スコア</span>
        <span><b id="resultScore">0</b> <span id="resultBestDiff" class="v2-plus"></span><span id="resultComboChip" class="v2-sub"></span></span>
      </div>
      <p id="resultTrend" class="v2-trend"></p>
      <div id="resultXpArea" style="margin-top:14px; display:none;">
        <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px;">
          <span id="resultLevelLabel" style="font-weight:700; color:var(--c-brand,#fed000);"></span>
          <span id="resultXpGain" style="color:var(--c-success,#3ecf8e); font-weight:700;"></span>
        </div>
        <div class="v2-xpbar"><div id="resultXpFill" class="v2-xpbar__fill"></div></div>
        <p id="resultSubInfo" style="font-size:12px; color:var(--c-muted,#9aa1ad); margin:8px 0 0;"></p>
      </div>
      <p id="resultNotice" style="display:none; font-size:13px; color:var(--c-muted,#9aa1ad); background:var(--c-bg-deep,#0e1013); border-radius:10px; padding:10px 12px; margin:14px 0 0;"></p>
    </div>
    <div id="masteryCard" class="v2-card" style="max-width:520px; margin:14px auto 0; text-align:left; display:none;">
      <p class="v2-section-title" style="margin-bottom:2px;">わかってきた度</p>
      <p class="mst-sub">くり返すほど育つよ</p>
      <ul id="masteryList" class="mst-list"></ul>
      <p id="masteryTip" class="mst-tip" style="display:none;"></p>
    </div>
    <div id="resultActions">
      <button id="replayButton" class="v2-btn v2-btn--primary">
        <span class="ra-main">もう1回</span><span class="ra-mode" id="replayModeLabel"></span>
      </button>
      <button id="reviewButton" class="v2-btn v2-btn--study">
        <span class="ra-main">間違えた問題を復習</span><span class="ra-count" id="reviewCountLabel"></span>
      </button>
      <button id="resultReturnButton" class="v2-btn v2-btn--quiet">スタートに戻る</button>
    </div>
    <div id="wrongListContainer" style="max-height:280px; overflow-y:auto; margin:14px auto 0; width:90%; max-width:520px; background:var(--c-surface,#1f2229); border:1px solid var(--c-line,#3a3f4b); border-radius:16px; padding:12px 16px; text-align:left;">
      <h3 style="color:#fed000; margin:0 0 10px; text-align:center; font-size:16px;">間違えた問題（間違いノートに記録）</h3>
      <ul id="wrongList" style="list-style:none; padding:0; margin:0;"></ul>
    </div>`;
  document.body.appendChild(resultScreen);
  resultScreen.querySelector("#replayButton").addEventListener("click", replayGame);
  resultScreen.querySelector("#reviewButton").addEventListener("click", startReviewMode);
  resultScreen.querySelector("#resultReturnButton").addEventListener("click", () => {
    resultScreen.style.display = "none";
    document.getElementById("startScreen").style.display = "block";
    unlockZoom();
    refreshRankingView();
    updateTokkunButton(); // 今回の間違いを反映して特訓ボタンを更新
  });

  if (table2) table2.style.display = "none";

  // 状態チップ（ボーナス有無 × 自分/みんな の4状態を見分けるため）
  const stateChip = document.createElement("div");
  stateChip.id = "rankingStateChip";
  toggleButton.insertAdjacentElement("afterend", stateChip);

  toggleButton.addEventListener("click", () => {
    showingAltRanking = !showingAltRanking;
    refreshRankingView();
  });

  refreshRankingView();
});

/* ===============================
   ランキング表示の単一エントリポイント
   ボーナスON/OFF × 自分のベスト/グローバル の4状態を必ず正しく描画する
=============================== */
let showingAltRanking = false;

function altRankingLabel() {
  return getSchoolCode() ? "学校ランキング" : "グローバルランキング";
}

function refreshRankingView() {
  const table1 = document.getElementById("ranking-table");
  const table2 = document.getElementById("alt-ranking-table");
  const toggleButton = document.getElementById("rankingToggleButton");
  const resetBtn = document.getElementById("resetRankingButton");
  const globalResetBtn = document.getElementById("globalResetButton");
  const changeNameButton = document.getElementById("changeNameButton");
  const chip = document.getElementById("rankingStateChip");
  if (!table1 || !table2) return;

  // ローカル表は常に現在のボーナス設定のキーで作り直す
  updateRankings();
  displayRanking();
  // グローバル表示中なら現在のボーナス設定で取得し直す
  if (showingAltRanking) displayAltRanking();

  table1.style.display = showingAltRanking ? "none" : "table";
  table2.style.display = showingAltRanking ? "table" : "none";
  if (toggleButton) {
    toggleButton.textContent = showingAltRanking ? "My ベストスコア" : altRankingLabel();
  }
  if (resetBtn) resetBtn.style.display = showingAltRanking ? "none" : "inline-flex";
  if (globalResetBtn) {
    globalResetBtn.style.display = (showingAltRanking && !getSchoolCode()) ? "inline-flex" : "none";
  }
  if (changeNameButton) {
    changeNameButton.style.display = showingAltRanking ? "none" : "inline-flex";
  }
  if (chip) {
    chip.textContent =
      (bonusEnabled ? "じっくり" : "60秒") + " ・ " +
      (showingAltRanking ? altRankingLabel() : "自分のベスト");
  }
}

// --- Supabase 操作用関数 ---
function getSupabase() { return window.supabaseClient; }

/* 学校ログイン状態を localStorage から取得 */
function getSchoolCode() { return localStorage.getItem('schoolCode') || null; }
function getSchoolName() { return localStorage.getItem('schoolName') || ''; }

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
      .eq('game_key', getFirestoreCollectionName());
    if (error) throw error;
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
  if (isPaused || gameOver || introActive) return;
  isPaused = true;
  cancelAnimationFrame(gameLoopId);
  clearInterval(timerIntervalId);
  audio.bgm.pause();
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
  audio.bgm.resume();
  gameLoopId = requestAnimationFrame(gameLoop);
  startTimer();
}

// タブ切り替え時に自動ポーズ。タブ復帰時は自動再開（スマホ通知等の誤ポーズ防止）
let _tabPaused = false;
document.addEventListener("visibilitychange", () => {
  if (introActive) return; // カウントダウン/チュートリアル中はポーズ処理しない
  if (document.hidden) {
    if (!isPaused && !gameOver) {
      pauseGame();
      _tabPaused = true;
    }
  } else if (_tabPaused) {
    _tabPaused = false;
    resumeGame();
  }
});

/* ===============================
   間違い記録・結果・復習
=============================== */
let wrongAnswers = [];
let reviewMode = false;
let reviewQueue = [];
let reviewIndex = 0;

/* 紙吹雪エフェクト */
function spawnConfetti() {
  // 動きを減らしたい人には出さない（CSSだけでは要素の生成自体は止まらない）
  try { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch (e) {}
  const colors = ["#fed000", "#ff6b6b", "#58b7ff", "#3ecf8e", "#c792ea"];
  const wrap = document.createElement("div");
  wrap.className = "v2-confetti";
  for (let i = 0; i < 40; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "%";
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
    p.style.animationDelay = Math.random() * 0.6 + "s";
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4200);
}

/* スコアのカウントアップ演出 */
function animateCount(elem, target, ms = 800) {
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / ms, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    elem.textContent = Math.round(target * eased);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function showResultScreen() {
  const gs = document.getElementById("gameScreen");
  const rs = document.getElementById("resultScreen");
  if (gs) gs.style.display = "none";
  if (!rs) return;

  const el = (id) => rs.querySelector("#" + id) || document.getElementById(id);
  const r = lastPlayResult || { valid: true, counted: false };

  animateCount(el("resultScore"), score);
  el("resultCorrectCount").textContent = correctCount;

  /* --- 正確さを主役にする ---
     正解数は出題ペースに左右される（速い子ほど分母が増える）ので、
     セッション間・ゲーム間で比べられるのは正確さの方 */
  const answered = correctCount + wrongAnswers.length;
  const accPct = answered > 0 ? Math.round((correctCount / answered) * 100) : 0;
  const accUnit = el("resultAccuracy").nextElementSibling;
  if (answered > 0) {
    animateCount(el("resultAccuracy"), accPct, 700);
    if (accUnit) accUnit.style.display = "";
  } else {
    el("resultAccuracy").textContent = "—";   // 1問も置いていない回に 0% と出すのは事実と違う
    if (accUnit) accUnit.style.display = "none";
  }
  el("resultAccSub").textContent =
    (answered > 0 ? `こたえた${answered}問` : "") + (skipCount > 0 ? `　見送り ${skipCount}問` : "");
  const chip = el("resultComboChip");
  if (chip) chip.textContent = maxCombo >= 15 ? `最大コンボ ${maxCombo}` : "";

  /* --- 今日の積み上げ ---
     正答率の前日差は、1プレイ十数問では誤差の方が大きく「伸び」と呼べない。
     自分で増やせる「今日やった数」を返すほうが、行動につながる */
  const trend = el("resultTrend");
  if (trend) {
    const ts = todayStats(title);
    trend.textContent = ts && ts.attempts > 0
      ? `今日はここまでで ${ts.attempts}問（正解 ${ts.correct}問）`
      : "今日はここから！";
  }

  // ランク表示（正解数 × 正確さ）
  const rank = rankFor(correctCount, wrongAnswers.length, categories.length);
  const badge = el("resultRankBadge");
  badge.textContent = rank;
  badge.className = "rank-" + rank;
  const goal = nextGoal(correctCount, wrongAnswers.length, categories.length);
  setTimeout(() => audio.sfx("rank", rank), 250);
  el("resultRankTitle").textContent = rank + "ランク";
  el("resultRankDetail").innerHTML = rank === "S" ? "最高ランク達成！おめでとう！" : goal.text;

  /* --- お祝いは1プレイ最大1つ（称号 > レベルUP > 自己ベスト） --- */
  const slot = el("celebrateSlot");
  slot.innerHTML = "";
  let mood = wrongAnswers.length === 0 && score > 0 ? "happy" : "normal";
  let speech = mascotComment(wrongAnswers.length > 0 ? "miss" : "good");
  let celebrated = null;

  if (r.counted && r.newBadges && r.newBadges.length > 0) {
    const b = r.newBadges[0];
    celebrated = {
      title: "新しい称号「" + b.name + "」",
      sub: b.desc + (r.newBadges.length > 1 ? `（ほか${r.newBadges.length - 1}個！マイページで確認）` : ""),
    };
    mood = "cheer";
    speech = mascotComment("badge");
  } else if (r.counted && r.levelUp) {
    celebrated = { title: "レベル" + r.levelAfter + "にアップ！", sub: "コツコツ続けるきみがすごい！" };
    setTimeout(() => audio.sfx("levelup"), 700);
    mood = "cheer";
    speech = mascotComment("levelup", { level: r.levelAfter });
  } else if (r.counted && r.bestUpdated && r.prevBest > 0) {
    celebrated = { title: "自己ベスト更新！", sub: `前回ベスト ${r.prevBest} 点をこえた！` };
    mood = "cheer";
    speech = mascotComment("best");
  }

  if (celebrated) {
    slot.innerHTML = `
      <div class="v2-celebrate">
        <p class="v2-celebrate__title">${celebrated.title}</p>
        <p class="v2-celebrate__sub">${celebrated.sub}</p>
      </div>`;
    // 紙吹雪は本当に特別なときだけ（Sランク or 自己ベスト更新）。毎回だとありがたみがない
    if (rank === "S" || (r.counted && r.bestUpdated && r.prevBest > 0)) {
      spawnConfetti();
    }
  }

  /* --- ベスト比（お祝い枠を使っていない時は1行で表示） --- */
  const diff = el("resultBestDiff");
  diff.textContent = "";
  if (r.counted && r.bestUpdated && r.prevBest > 0 && (!celebrated || celebrated.title.indexOf("自己ベスト") === -1)) {
    diff.textContent = `自己ベスト! (+${score - r.prevBest})`;
  } else if (r.counted && !r.bestUpdated && r.best > 0) {
    diff.textContent = "";
  }

  /* --- XPエリア --- */
  const xpArea = el("resultXpArea");
  const notice = el("resultNotice");
  notice.style.display = "none";

  if (!r.valid) {
    xpArea.style.display = "none";
    notice.style.display = "block";
    notice.textContent = "スコアを正しく確認できなかったため、今回の記録は保存されませんでした。";
    mood = "think";
    speech = "うーん、なにかおかしいみたい…";
  } else if (!r.counted) {
    xpArea.style.display = "none";
    notice.style.display = "block";
    notice.textContent = "5問以上正解＆30秒以上のプレイでXPと記録がもらえるよ。じっくり挑戦してみよう！";
    mood = "think";
    speech = mascotComment("nocount");
  } else {
    xpArea.style.display = "block";
    el("resultLevelLabel").textContent = "レベル " + r.levelAfter;
    el("resultXpGain").textContent = "+" + r.xpGained + " XP";
    const fill = el("resultXpFill");
    fill.style.width = "0%";
    setTimeout(() => { fill.style.width = r.levelPct + "%"; }, 150);

    const infoBits = [];
    if (r.challengeCleared) infoBits.push("今日のチャレンジ達成！（+50XP）");
    if (r.streak >= 2) infoBits.push(`${r.streak}日連続プレイ中`);
    el("resultSubInfo").textContent = infoBits.join("　");
    if (r.challengeCleared) speech = mascotComment("challenge");
  }

  /* --- わかってきた度（分類ごとの習熟メーター） ---
     「何問まちがえたか」ではなく「何を勘違いしているか」を返す唯一の場所。
     弱い順に並べるので、一番上がそのまま次にやるべきところになる */
  const mst = masteryFor(title, currentWordData);
  let rows = (mst && mst.types) ? mst.types.slice() : [];
  if (!rows.length) {                       // 保存が使えない時は今回のプレイ分だけで描く
    rows = Object.keys(sessionByType).map((t) => {
      const v = sessionByType[t];
      const seen = v.c + v.w;
      return { type: t, seen, pct: seen ? Math.round((v.c / seen) * 100) : 0 };
    });
  }
  rows = rows
    .filter((x) => categories.indexOf(x.type) >= 0 && x.seen > 0)
    .sort((a, b) => a.pct - b.pct || b.seen - a.seen);

  // 初回プレイで短いバーを5本見せるのは通知表になる。十分たまるまで出さない
  const enough = rows.filter((x) => x.seen >= 3).length >= 2;
  const mcard = el("masteryCard");
  if (enough) {
    const stateOf = (pct, seen) =>
      seen < 3 ? "これから" : pct >= 90 && seen >= 8 ? "バッチリ"
        : pct >= 70 ? "いい感じ" : pct >= 40 ? "あと少し" : "これから";
    el("masteryList").innerHTML = rows.slice(0, 6).map((x) => {
      const i = Math.max(0, categories.indexOf(x.type)) % 10;
      return `<li class="mst-row">
        <span class="mst-name">${escapeHTML(x.type)}</span>
        <span class="mst-state">${stateOf(x.pct, x.seen)}</span>
        <span class="mst-meter"><i data-w="${Math.max(3, x.pct)}" style="width:0; background:${COL_COLORS[i]};"></i></span>
        <span class="mst-num">${x.pct}% ・ ${x.seen}問</span></li>`;
    }).join("");

    const cx = Object.entries(sessionConfusion)
      .map(([k, n]) => { const p = k.split(CONF_SEP); return { correct: p[0], dropped: p[1], n }; })
      .sort((a, b) => b.n - a.n);
    const tip = el("masteryTip");
    if (cx.length && cx[0].n >= 2) {
      tip.textContent = `「${cx[0].correct}」を「${cx[0].dropped}」と${cx[0].n}回まちがえたよ`;
      tip.style.display = "block";
      if (!celebrated) speech = `「${cx[0].correct}」がねらい目だね`;
    } else {
      tip.style.display = "none";
      if (!celebrated && rows.length && rows[0].seen >= 3 && rows[0].pct < 70) {
        speech = `「${rows[0].type}」がねらい目だね`;
      }
    }
    mcard.style.display = "block";
    setTimeout(() => {
      rs.querySelectorAll(".mst-meter i").forEach((b) => { b.style.width = b.dataset.w + "%"; });
    }, 180);
  } else if (mcard) {
    mcard.style.display = "none";
  }

  /* --- マスコット --- */
  el("resultMascot").innerHTML = mascotSVG({
    mood,
    level: r.counted ? r.levelAfter : v2p.levelInfo(v2p.getProgress().xp).level,
    size: 84,
  });
  el("resultSpeech").textContent = speech;

  /* --- 間違いリスト（explanation があれば解説も表示） --- */
  const ul = el("wrongList");
  ul.innerHTML = "";
  const wrongMap = new Map();
  wrongAnswers.forEach(wa => {
    if (wrongMap.has(wa.word)) wrongMap.get(wa.word).count++;
    else wrongMap.set(wa.word, { ...wa, count: 1 });
  });
  wrongMap.forEach(wa => {
    const li = document.createElement("li");
    li.style.cssText = "padding:8px 4px; border-bottom:1px dashed var(--c-line,#555); font-size:15px;";
    const countStr = wa.count > 1 ? ` <span style="color:#f90;font-weight:bold;">×${wa.count}</span>` : "";
    // 解説はタイルに焼いたものを使う。word で引き直すと、
    // 画像だけの問題では引けず、同じ語で分類が違うペアでは逆の解説を拾ってしまう
    const expl = wa.expl ? `<div class="wrong-expl">${escapeHTML(wa.expl)}</div>` : "";
    const put = wa.dropped && wa.dropped !== wa.correctType
      ? `<span class="wrong-put">（${escapeHTML(wa.dropped)}に入れた）</span>` : "";
    li.innerHTML = `「${escapeHTML(wa.word)}」→ <strong style="color:var(--c-brand,#fed000);">${escapeHTML(wa.correctType)}</strong>${countStr}${put}${expl}`;
    ul.appendChild(li);
  });
  document.getElementById("wrongListContainer").style.display = wrongAnswers.length > 0 ? "block" : "none";

  const reviewBtn = el("reviewButton");
  if (reviewBtn) {
    el("reviewCountLabel").textContent = wrongAnswers.length + "問";
    reviewBtn.style.display = wrongAnswers.length > 0 ? "inline-flex" : "none";
  }
  // 「もう1回」は同じモードで始まる。何が起きるか読めるようにモード名を添える
  const rml = el("replayModeLabel");
  if (rml) rml.textContent = bonusEnabled ? "じっくりモード" : "60秒チャレンジ";
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
  // 復習にはランクも目標もないので、目標バーは畳む
  const gb = document.getElementById("goalBar");
  if (gb) gb.style.display = "none";
  if (returnButton) { returnButton.textContent = "復習を終える"; returnButton._reviewMode = true; }

  showNextReviewWord();
}

function showNextReviewWord() {
  playArea.querySelectorAll(".word").forEach(w => w.remove());
  fallingWords = [];

  const scoreDisplay = document.getElementById("score");
  const returnButton = document.getElementById("returnButton");

  if (reviewIndex >= reviewQueue.length) {
    const wasTokkun = tokkunMode;
    reviewMode = false;
    tokkunMode = false;
    if (returnButton) { returnButton.textContent = "Return to START"; returnButton._reviewMode = false; }
    const gs = document.getElementById("gameScreen");
    const ss = document.getElementById("startScreen");
    if (gs) gs.style.display = "none";
    if (ss) ss.style.display = "block";
    unlockZoom();
    refreshRankingView();
    updateTokkunButton();
    if (wasTokkun) {
      alert(`特訓完了！間違いノートから ${tokkunClearCount} 問なくなったよ！🎉`);
    } else {
      try { v2p.recordReviewComplete(); } catch (e) {}
      alert("復習完了！全問正解しました！");
    }
    return;
  }

  if (scoreDisplay) scoreDisplay.textContent = `${reviewIndex + 1} / ${reviewQueue.length}`;

  const item = reviewQueue[reviewIndex];
  const wordDiv = document.createElement("div");
  wordDiv.classList.add("word");
  if (item.sentence) {
    wordDiv.innerHTML = buildTileHTML(item.sentence, item.word);
    wordDiv.dataset.word = item.word;
    wordDiv.dataset.sentence = item.sentence;
  } else {
    wordDiv.textContent = item.word;
  }
  wordDiv.dataset.type = item.correctType;
  wordDiv.id = "review_" + reviewIndex;
  wordDiv.dataset.locked = "false";
  wordDiv.dataset.penalized = "false";
  wordDiv.style.cssText = "white-space:nowrap; position:absolute; visibility:hidden; top:-30px; left:0;";
  playArea.appendChild(wordDiv);
  fitWordSize(wordDiv); // 長い文章を1列幅に収める

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
   弱点特訓モード
   間違いノートに残っている問題だけを復習UIで出題。
   正解するとその場でノートから削除される（克服バッジには数えない）
=============================== */
function startTokkunMode(wordData) {
  const gbT = document.getElementById("goalBar");
  if (gbT) gbT.style.display = "none";   // 特訓にランクも目標もない
  let entries = [];
  try { entries = v2p.getNoteFor(title); } catch (e) {}
  const queue = [];
  for (const n of entries) {
    const item = wordData.find(w => (w.word || "") === n.w);
    if (item) queue.push({ word: n.w, correctType: n.t, sentence: n.s || item.sentence || "" });
  }
  if (queue.length === 0) {
    alert("このゲームの間違いノートは空だよ！");
    updateTokkunButton();
    return;
  }

  tokkunMode = true;
  reviewMode = true;
  reviewQueue = queue;
  reviewIndex = 0;
  tokkunClearCount = 0;
  gameOver = false;
  isPaused = false;
  fallingWords = [];

  resetAndLockZoom();
  const rs = document.getElementById("resultScreen");
  if (rs) rs.style.display = "none";
  startScreen.style.display = "none";
  gameScreen.style.display = "block";

  playArea.innerHTML = "";
  playArea.appendChild(createSortingArea());

  const td = document.getElementById("timer");
  if (td) { td.innerHTML = '<span class="hud-num">弱点特訓</span>'; td.classList.remove("hurry"); }
  const cd = document.getElementById("combo");
  if (cd) cd.textContent = "";
  const md = document.getElementById("maxCombo");
  if (md) md.textContent = "";
  const rb = document.getElementById("returnButton");
  if (rb) { rb.textContent = "特訓を終える"; rb._reviewMode = true; }

  showNextReviewWord();
}

/* スタート画面の特訓ボタンを最新のノート件数に合わせて更新 */
function updateTokkunButton() {
  const btn = document.getElementById("tokkunButton");
  if (!btn) return;
  let count = 0;
  try { count = v2p.getNoteFor(title).length; } catch (e) {}
  if (count > 0) {
    btn.textContent = `弱点特訓（${count}問）`;
    btn.style.display = "inline-flex";
  } else {
    btn.style.display = "none";
  }
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

// ゲームタイトル取得（カスタムゲームは window.GAME_TITLE を優先）
const title = (typeof window.GAME_TITLE !== "undefined" && window.GAME_TITLE)
  ? window.GAME_TITLE
  : document.querySelector("h1").textContent.trim();

/* ★ プレイモード ★
   「60秒チャレンジ」と「じっくりモード」の2つ。中身は従来のボーナスON/OFFと同じで、
   じっくり＝正解するたびに持ち時間が増える。
   これまでは読み込みのたびにOFFへ戻っていたため、じっくりで出した記録が
   次のプレイでは別のランキングに入ってしまい「ベストが消えた」ように見えていた。
   モードを覚えることでその食い違いも直る。
   ランキングのキーは読み込み時点で使われるので、ここで確定させておくこと。 */
let bonusEnabled = false;
try { bonusEnabled = getSetting("mode") === "slow"; } catch (e) {}
const bonusToggleButton = document.getElementById("bonusToggleButton");

// ローカルストレージのキーをボーナス有無で切り替える
function getRankingKey() {
  return "rankings" + title + (bonusEnabled ? "" : "_nobonus");
}

// Firestore のコレクション名を切り替え
function getFirestoreCollectionName() {
  return "ranks" + title + (bonusEnabled ? "" : "_nobonus");
}

// Supabase から上位 N 件を取得して #alt-ranking-table に描画
// 学校ログイン中: school_rankings（その学校のみ）
// 未ログイン   : global_rankings（全国）
window.displayAltRanking = async function(limitNum = 30) {
  const tbody       = document.querySelector("#alt-ranking-table tbody");
  tbody.innerHTML   = "<tr><td colspan='3'>読み込み中...</td></tr>";
  const seenDevices = new Set();
  const supabase    = getSupabase();
  const schoolCode  = getSchoolCode();

  if (!supabase) {
    tbody.innerHTML = "<tr><td colspan='3'>DB未接続</td></tr>";
    return;
  }
  try {
    let query;
    if (schoolCode) {
      query = supabase
        .from('school_rankings')
        .select('player, score, device_id')
        .eq('school_code', schoolCode)
        .eq('game_key', getFirestoreCollectionName())
        .order('score', { ascending: false })
        .limit(limitNum * 100);
    } else {
      query = supabase
        .from('global_rankings')
        .select('player, score, device_id')
        .eq('game_key', getFirestoreCollectionName())
        .order('score', { ascending: false })
        .limit(limitNum * 100);
    }
    const { data, error } = await query;
    if (error) throw error;
    tbody.innerHTML = "";
    let count = 0;
    for (const row of (data || [])) {
      if (seenDevices.has(row.device_id)) continue;
      seenDevices.add(row.device_id);
      count++;
      if (count > limitNum) break;
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

// 禁止ワード使用を violations テーブルに記録し、メール通知（ユーザーには通知しない）
async function logViolation(username) {
  const deviceId   = localStorage.getItem("deviceId") || "unknown";
  const deviceInfo = `${screen.width}×${screen.height} / ${navigator.userAgent}`;
  const dateStr    = new Date().toLocaleString("ja-JP");

  const supabase = getSupabase();
  if (supabase) {
    supabase.from('violations').insert({
      name:        username,
      game:        title,
      date:        new Date().toISOString(),
      device_id:   deviceId,
      device_info: deviceInfo,
    }).then(() => {}).catch(() => {});
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

// Supabase にスコアを保存（device_id も添付）
// 学校ログイン中は school_rankings にも保存
async function saveToSupabase(username, score) {
  if (containsBadWord(username)) {
    logViolation(username);
    return;
  }
  const today      = new Date().toISOString().slice(0, 10);
  const deviceId   = localStorage.getItem("deviceId");
  const supabase   = getSupabase();
  const schoolCode = getSchoolCode();
  if (!supabase) return;
  try {
    const { error } = await supabase.from('global_rankings').insert({
      game_key:  getFirestoreCollectionName(),
      date:      today,
      player:    username,
      score:     score,
      device_id: deviceId
    });
    if (error) console.error("Supabase 保存エラー:", error);

    if (schoolCode) {
      const { error: e2 } = await supabase.from('school_rankings').insert({
        school_code: schoolCode,
        game_key:    getFirestoreCollectionName(),
        date:        today,
        player:      username,
        score:       score,
        device_id:   deviceId
      });
      if (e2) console.error("学校ランキング保存エラー:", e2);
    }
  } catch (e) {
    console.error("Supabase 保存エラー:", e);
  }
}

// 特別エントリ定義（ランクの目安行。1正解100点として 30/20/12/5問 に対応）
/* 表の中の目安行。ランクは正解数と正確さの両方で決まるようになったので、
   「◯問正解＝このランク」とは言い切らず、点数の目安としてだけ置く */
const specialEntries = [
  { username: "── Sランクの目安 ──", score: 3000, time: new Date("2025-02-15").getTime() },
  { username: "── Aランクの目安 ──", score: 2000, time: new Date("2025-02-15").getTime() },
  { username: "── Bランクの目安 ──", score: 1200, time: new Date("2025-02-15").getTime() },
  { username: "── Cランクの目安 ──",  score:  500, time: new Date("2025-02-15").getTime() },
];

// 旧仕様の目安行（👆入りや旧点数のもの）を掃除する
function isObsoleteSpecial(entry) {
  if (typeof entry.username !== "string") return false;
  if (!/ランク/.test(entry.username)) return false;
  // 現行の目安行と完全一致するものだけ残す
  return !specialEntries.some(
    (s) => s.username === entry.username && s.score === entry.score
  );
}

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

  // 旧基準の目安行が残っていたら取り除く
  rankings = rankings.filter(e => !isObsoleteSpecial(e));

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
    refreshRankingView();
  }
});



/* ===============================
   ゲーム設定
=============================== */
const TIME_LIMIT = 60; // 制限時間（秒）
const PENALTY_TIME = 3; // ペナルティ秒数

/* --- じっくりモード（ボーナスあり）の加算時間 ---
   正確に積み上げるほど長く遊べる、という形で「正確さ」を報いる。
   得点の計算式には触れない（スコア＝正解数×配点 を崩すと記録が無効になるため）。
   加算の総量に上限を置いて、うまい子が延々と終わらなくなるのを防ぐ。 */
/* 区切り方は「増やせる合計」ではなく「試合が終わる時刻」にする。
   合計に上限を置くと、上限に達した時点でそれ以降の正解では
   1秒も増えなくなり、後半は仕掛けが死んでしまう。
   終わりの時刻で区切れば、最後の1問まで加算が効いたまま必ず終わる。 */
const SESSION_MAX_SEC = 120;  // じっくりモードの最長プレイ時間（秒）
const PAIR_TIME_BONUS = 2;    // ペアをそろえたときの加算（秒）
function comboTimeBonus(combo) {
  return combo >= 10 ? 2 : combo >= 5 ? 1.5 : 1;
}
function elapsedSec() {
  return playStartTime ? (Date.now() - playStartTime) / 1000 : 0;
}
// 終わりの時刻を越えない範囲で時間を足す。実際に足せた秒数を返す
function grantBonusTime(sec) {
  const left = Math.max(0, SESSION_MAX_SEC - elapsedSec());
  const add = Math.max(0, Math.min(sec, left - remainingTime));
  if (add > 0) { remainingTime += add; bonusTimeGained += add; }
  return Math.round(add * 10) / 10;
}

/* --- 難易度カーブ ---
   加速も出現数も「正解数」を基準にする。
   スコア基準だと1正解あたりの点数が違うゲーム間で難易度がバラバラになるため。 */
const BASE_SPAWN_INTERVAL = 1900; // 出現間隔の初期値（ms）
const MIN_SPAWN_INTERVAL  = 1100; // 出現間隔の下限（ms）
const MAX_SPEED_FACTOR    = 1.8;  // 落下速度の上限倍率
const MAX_SPAWN_COUNT     = 2;    // 一度に出す最大数

// 正解が増えるほどなめらかに加速
function difficultyFactor() {
  return Math.min(MAX_SPEED_FACTOR, 1 + correctCount * 0.028);
}
// 正解が増えるほど出現間隔を短く
function currentSpawnInterval() {
  return Math.max(MIN_SPAWN_INTERVAL, BASE_SPAWN_INTERVAL - correctCount * 25);
}
// 正解15問ごとに一度に出す数を増やす（最大2つ）
function currentSpawnCount() {
  return Math.min(MAX_SPAWN_COUNT, 1 + Math.floor(correctCount / 15));
}
// 画面に出しておける未処理タイルの上限。
// これを超えたら出題を止めるので、追いつけない子が一方的に溺れることがない
function maxOnScreen() {
  return Math.min(6, 3 + Math.floor(correctCount / 12));
}
function unsortedCount() {
  return fallingWords.filter((w) => w.element && w.element.dataset.locked === "false").length;
}
// 長い語・長い式ほどゆっくり落として読む時間を確保する
function lengthSpeedMultiplier(text) {
  const len = (text || "").length;
  return Math.max(0.6, Math.min(1.15, 1.15 - len * 0.02));
}

/* --- ランク基準（全ゲーム共通・2軸） ---
   軸① 正解数 … どこまで進めたか（従来どおり。過去の記録と地続き）
   軸② 正確さ … どれだけ確かか

   正確さは「上のランクに上がれない天井」として効くだけでなく、
   95%以上なら1つ上へ引き上げる。天井だけにすると、
   出題ペースの上限（1分で40問前後が限界）のせいで
   慎重な子には上げる手段が残らず、「遅い上に減点される」だけになるため。

   点数の計算式には一切触れない（スコア＝正解数×配点 が崩れると記録が無効になる）。 */
const RANK_THRESHOLDS = [
  { rank: "S", need: 30 },
  { rank: "A", need: 20 },
  { rank: "B", need: 12 },
  { rank: "C", need: 5 },
  { rank: "D", need: 0 },
];
const RANK_ACCURACY = { S: 0.9, A: 0.8, B: 0.7, C: 0, D: 0 };
const PROMOTE_ACCURACY = 0.95;
const PROMOTE_MIN_CORRECT = 12;

/* 6列以上のゲームは375px幅だと1列50px前後。指のブレがそのまま誤答になるので5ポイントゆるめる。
   （列が多いほど当てずっぽうは当たらないので、知識の面ではむしろ厳しい基準になっている） */
function accuracyBarFor(rank, cols) {
  const base = RANK_ACCURACY[rank] || 0;
  if (base <= 0) return 0;
  const n = cols || categories.length || 3;
  return Math.max(0, base - (n >= 6 ? 0.05 : 0));
}

/* 正確さ ＝ 正解 ÷（正解＋誤答）。
   見送りは分母に入れない。わからない問題を置かずに見送るのは失敗ではなく判断だから。 */
function accuracyOf(correct, wrong) {
  const answered = correct + wrong;
  return answered > 0 ? correct / answered : 1;
}

function rankFor(correct, wrong, cols) {
  const w = wrong || 0;
  const acc = accuracyOf(correct, w);
  let base = RANK_THRESHOLDS.findIndex((r) => correct >= r.need);
  if (base < 0) base = 4;

  // 天井（0=S … 3=C）。5問以上正解して終えた回はCより下に落とさない
  let ceil = 3;
  if (acc >= accuracyBarFor("S", cols)) ceil = 0;
  else if (acc >= accuracyBarFor("A", cols)) ceil = 1;
  else if (acc >= accuracyBarFor("B", cols)) ceil = 2;

  let idx = Math.max(base, ceil);
  // 正確さによる昇格は A どまり。S は「30問正解かつ正確さ90%」でしか取れないままにする
  // （正確なだけで20問そこそこでもSになると、最高ランクの意味がなくなる）
  if (acc >= PROMOTE_ACCURACY && correct >= PROMOTE_MIN_CORRECT && idx > 1) idx -= 1;
  return RANK_THRESHOLDS[Math.min(4, idx)].rank;
}

/* いま実際に足りていない条件を1つだけ返す。
   正解数が足りているのに正確さで止まっている時に「あと○問」と出すと、
   追いかけても届かない嘘の目標になってしまう */
function nextGoal(correct, wrong, cols) {
  const w = wrong || 0;
  const acc = accuracyOf(correct, w);
  const cur = rankFor(correct, w, cols);
  if (cur === "S") return { kind: "top", rank: "S", text: "Sランク達成中" };

  const curIdx = RANK_THRESHOLDS.findIndex((r) => r.rank === cur);
  const target = RANK_THRESHOLDS[curIdx - 1];
  // c/(c+w) >= bar  ⇔  c >= bar*w/(1-bar)
  const needFor = (bar) => Math.max(0, Math.ceil((bar * w) / (1 - bar)) - correct);

  const bar = accuracyBarFor(target.rank, cols);
  if (bar > 0 && acc < bar) {
    // 正確さと正解数の両方を満たす必要がある。少ない方だけを出すと、
    // その数だけ正解しても届かない（この関数が防ぐはずだった嘘の目標そのもの）
    const n = Math.max(1, needFor(bar), target.need - correct);
    return { kind: "acc", rank: target.rank, remain: n, text: `あと<b>${n}</b>問正解で ${target.rank}ランク` };
  }
  // Aにいる時は正確さで上がれない（Sは正解数でしか届かない）ので、昇格の話はしない
  const p = needFor(PROMOTE_ACCURACY);
  if (cur !== "A" && correct >= PROMOTE_MIN_CORRECT && p > 0 && p <= 3) {
    return { kind: "promo", rank: target.rank, remain: p, text: `あと<b>${p}</b>問で正確さ95% → ランクUP` };
  }
  const r = Math.max(0, target.need - correct);
  return { kind: "count", rank: target.rank, remain: r, text: `${target.rank}ランクまで あと<b>${r}</b>問` };
}
const ROW_HEIGHT = 30;
const SORTING_AREA_ROWS = 3;
const SORTING_AREA_HEIGHT = ROW_HEIGHT * SORTING_AREA_ROWS;

let FALL_SPEED = 50; // initGameで再計算



/* ===============================
   ゲーム状態変数
=============================== */
let remainingTime = TIME_LIMIT;
let score = 0;
let scorePerCorrect = 100; // 正解1つあたりの得点（initGameのoptsで上書き可）
let pairMode = false;      // ペア出題モード（品詞比較）
let pairBonus = 150;       // ペアを両方そろえたときのボーナス
let pairProgress = {};     // pairId -> そろえた数

// ★ ver2 進捗連携用
let correctCount = 0;        // 正解数（スコア整合性チェックに使用）
let playStartTime = 0;       // プレイ開始時刻
let noteWords = new Set();   // 間違いノート由来の優先出題ワード
let lastPlayResult = null;   // recordPlay の結果（結果画面で使用）

// ★ 出題デッキ（山札＋習熟度）。null のときは素の抽選にフォールバックする
let deck = null;
let skipCount = 0;           // 触らずに落ちて「見送り」になった数（正答率には数えない）
let passHintShown = false;   // 「見送り」の説明は1プレイ1回だけ
let hintTipShown = false;    // 「タップでヒント」の案内も1プレイ1回だけ
let bonusTimeGained = 0;     // じっくりモードで加算した時間の合計（上限管理用）
let resolvedNotes = new Set(); // 今回のプレイで克服したノートの語（終了時にまとめて保存）
const CONF_SEP = "\u0001";   // 混同の集計キー用の区切り
let sessionConfusion = {};   // 「正解の分類 → 入れた分類」の回数
let sessionByType = {};      // 分類ごとの 正解/誤答/見送り
// 仕分け列の色（style.css の .sorting-column:nth-child(10n+N) と同じ並び）。
// 結果画面のメーターを同じ色にすれば、60秒間見ていた列と文字なしで対応づく
const COL_COLORS = ["#4f7cff", "#2ec27e", "#ff9f43", "#a06bff", "#ff6b9d",
                    "#29c7c7", "#ffd166", "#70a1ff", "#7bed9f", "#ff8c69"];

// ★ 弱点特訓モード（間違いノートの問題だけを集中特訓）
let tokkunPending = false;   // 特訓ボタン押下 → 次の initGame を特訓として開始
let tokkunMode = false;
let tokkunClearCount = 0;

// ★ COMBO関連はここで1回だけ宣言
let currentCombo = 0;
let maxCombo = 0;

let fallingWords = [];
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
   モード切り替えの唯一の入口
   ランキングのキーが変わるので、切り替えたら必ず表を描き直す
=============================== */
function setPlayMode(mode) {
  bonusEnabled = mode === "slow";
  try { setSetting("mode", bonusEnabled ? "slow" : "challenge"); } catch (e) {}
  document.querySelectorAll("#modeChooser .mode-opt").forEach((elm) => {
    const on = elm.querySelector("input").value === mode;
    elm.classList.toggle("is-on", on);
    elm.querySelector("input").checked = on;
  });
  refreshRankingView();
}

/* 旧「ボーナス: OFF」ボタンは残しておく（全ゲームのHTMLに書かれているため）。
   CSSで隠し、押されたらモードを入れ替えるだけにする */
if (bonusToggleButton) {
  bonusToggleButton.addEventListener("click", () => {
    setPlayMode(bonusEnabled ? "challenge" : "slow");
  });
}



/* ===============================
   ゲーム初期化（外部公開）
=============================== */
/* 「もう1回」用に、最初に渡された出題データとオプションを控えておく。
   currentWordData は途中で加工されるので再利用できない */
let lastGameArgs = null;

function replayGame() {
  const rs = document.getElementById("resultScreen");
  if (!lastGameArgs) {
    if (rs) rs.style.display = "none";
    document.getElementById("startScreen").style.display = "block";
    return;
  }
  initGame(lastGameArgs.wordData, lastGameArgs.opts);
}

export function initGame(wordData, opts = {}) {
  audio.unlock();   // 必ずクリック操作の中で呼ぶ（iOSはこれ以外で音を出せない）
  if (!tokkunPending) lastGameArgs = { wordData, opts };   // 特訓は「もう1回」の対象外
  // ペアゲーム（品詞比較など）：[{a,b}] を1枚ずつのタイルに展開して同じ pairId を持たせる
  pairMode = !!opts.pairMode;
  pairBonus = opts.pairBonus || 150;
  pairProgress = {};
  if (pairMode) {
    wordData = wordData.flatMap((p, i) => [
      { ...p.a, pairId: i },
      { ...p.b, pairId: i },
    ]);
  }
  // expr（数式）や meaning（英単語の意味）を共通フィールドへ正規化
  wordData = wordData.map((w) =>
    (w.expr !== undefined || w.meaning !== undefined)
      ? { ...w, word: w.word !== undefined ? w.word : w.expr, hint: w.hint || w.meaning }
      : w
  );
  currentWordData = wordData;

  // ★ 間違いノートの問題を集める。
  //    以前は同じ問題を配列に3回積んで確率を上げていたが、それだと
  //    「全問が一巡してから繰り返す」という山札の保証が崩れるので、
  //    出題側（mastery.js）に「優先して前方に置く語」として渡す方式に変えた。
  noteWords = new Set();
  try {
    for (const n of v2p.getNoteFor(title)) {
      if (wordData.some((w) => (w.word || "") === n.w)) noteWords.add(n.w);
    }
  } catch (e) { /* 進捗データ異常時もゲーム自体は動かす */ }
  // 列の並び順：opts.categoryOrder があればそれを優先（品詞選択ゲーム用）
  categories = (opts.categoryOrder && opts.categoryOrder.length)
    ? opts.categoryOrder
    : [...new Set(currentWordData.map(item => item.type))];
  // 正解1つあたりの得点（既定100、品詞選択ゲームは選択数×20など）
  scorePerCorrect = opts.scorePerCorrect || 100;

  const minCats = window.EXPECTED_MIN_CATEGORIES;
  if (minCats && categories.length < minCats) {
    alert('ゲームデータが正しくありません。ページを再読み込みしてください。');
    return;
  }

  // ★ 弱点特訓モード: 通常ゲームは開始せず、ノートの問題だけを出題
  if (tokkunPending) {
    tokkunPending = false;
    startTokkunMode(wordData);
    return;
  }

  // 列が多いほど判断に時間がかかるので少しゆっくり落とす（3列:46 / 7列:38）
  FALL_SPEED = Math.max(30, 46 - Math.max(0, categories.length - 3) * 2);

  resetAndLockZoom();

  clearInterval(timerIntervalId);
  cancelAnimationFrame(gameLoopId);

  remainingTime = TIME_LIMIT;
  score = 0;
  correctCount = 0;
  playStartTime = Date.now();
  lastPlayResult = null;
  currentCombo = 0;
  maxCombo = 0;
  wrongAnswers = [];
  stuckWrongs = [];
  skipCount = 0;
  passHintShown = false;
  hintTipShown = false;
  bonusTimeGained = 0;
  resolvedNotes = new Set();
  sessionConfusion = {};
  sessionByType = {};
  clearTimeout(microTimer);
  microPending = null;
  isPaused = false;
  reviewMode = false;

  const gb = document.getElementById("goalBar");
  if (gb) gb.style.display = "";     // 復習から戻ったときのために戻す
  updateComboDisplay();
  updateGoalBar();

  fallingWords = [];

  // ★ 山札を作る。ペアゲームはペア単位で配る。
  //    ノートの語は間引かず前方に寄せてもらう（旧・3倍水増しの置き換え）
  deck = createDeck(title, currentWordData, {
    groupKey: pairMode ? "pairId" : null,
    boost: noteWords,
  });

  lastSpawnTime = Date.now() - BASE_SPAWN_INTERVAL;
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

  gameScreen.style.display = "block";
  startScreen.style.display = "none";

  // 初回はチュートリアル→カウントダウン、2回目以降はカウントダウンのみ
  beginWithIntro();
}

/* ===============================
   ゲーム開始前イントロ
   （初回チュートリアル + 3・2・1カウントダウン）
=============================== */
let introActive = false;
let introCancel = null; // Returnボタン等でイントロを中断するためのフック

function startPlay() {
  introActive = false;
  introCancel = null;
  lastSpawnTime = Date.now() - BASE_SPAWN_INTERVAL;
  lastFrameTime = Date.now();
  playStartTime = Date.now(); // イントロ時間はプレイ時間に含めない
  audio.bgm.start(0);
  gameLoopId = requestAnimationFrame(gameLoop);
  startTimer();
}

function beginWithIntro() {
  introActive = true;
  if (!localStorage.getItem("ver2_tutorial_done")) {
    showTutorial(() => runCountdown(startPlay));
  } else {
    runCountdown(startPlay);
  }
}

function showTutorial(done) {
  const ov = document.createElement("div");
  ov.id = "tutorialOverlay";
  let mascot = "";
  try { mascot = mascotSVG({ mood: "cheer", level: 1, size: 72 }); } catch (e) {}
  ov.innerHTML = `
    <div class="tut-card">
      <button class="tut-skip" type="button">スキップ ▶</button>
      <div class="tut-mascot">${mascot}</div>
      <p class="tut-title">あそびかた</p>
      <div class="tut-demo">
        <span class="tut-demo-tile">ことば</span>
        <span class="tut-demo-hand">👆</span>
        <div class="tut-demo-cols"><i>なかまA</i><i>なかまB</i><i>なかまC</i></div>
      </div>
      <ul class="tut-steps">
        <li><span class="n">1</span>ことばが上から落ちてくる！</li>
        <li><span class="n">2</span>ゆびでドラッグして、同じなかまの色エリアへ運ぼう</li>
        <li><span class="n">3</span>黄色いラインにとどく前に仕分け！正解でスコア＆コンボUP</li>
        <li><span class="n">4</span>わからないものは、さわらずに見送ってOK！減点なし</li>
      </ul>
      <button class="tut-go" type="button">わかった！はじめる</button>
    </div>`;
  document.body.appendChild(ov);
  let finished = false;
  introCancel = () => { finished = true; ov.remove(); };
  const finish = () => {
    if (finished) return;
    finished = true;
    try { localStorage.setItem("ver2_tutorial_done", "1"); } catch (e) {}
    ov.remove();
    done();
  };
  ov.querySelector(".tut-go").addEventListener("click", finish);
  ov.querySelector(".tut-skip").addEventListener("click", finish);
}

function runCountdown(done) {
  const ov = document.createElement("div");
  ov.id = "countdownOverlay";
  ov.innerHTML = '<span class="cd-num">3</span><span class="cd-hint">タップでスキップ</span>';
  playArea.appendChild(ov);
  const num = ov.querySelector(".cd-num");
  let step = 3;
  let finished = false;
  introCancel = () => { finished = true; clearInterval(timerId); ov.remove(); };
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(timerId);
    ov.remove();
    done();
  };
  const timerId = setInterval(() => {
    step--;
    if (step > 0) {
      num.textContent = step;
      audio.sfx("tick");
      num.style.animation = "none"; void num.offsetWidth; num.style.animation = "";
    } else if (step === 0) {
      num.textContent = "GO!";
      audio.sfx("go");
      num.classList.add("go");
      num.style.animation = "none"; void num.offsetWidth; num.style.animation = "";
    } else {
      finish();
    }
  }, 700);
  ov.addEventListener("click", finish);
}


/* ===============================
   品詞選択ゲーム起動（外部公開）
   スタート前に「出題する品詞」をチェックボックスで選ばせ、
   選ばれた品詞だけを列・出題対象にしてゲームを開始する。
   - opts.typeOrder  : 列の固定順（省略時は wordData の出現順）
   - opts.dynamicScore : true で 正解=選択数×20、false(既定)で 100
   必要なDOM: #typeCheckboxes（チェックボックス格納先）, #startButton
=============================== */
export function initTypeSelectionGame(wordData, opts = {}) {
  const allTypes = (opts.typeOrder && opts.typeOrder.length)
    ? opts.typeOrder.filter(t => wordData.some(w => w.type === t))
    : [...new Set(wordData.map(w => w.type))];

  const selected = new Set(allTypes);
  const container = document.getElementById("typeCheckboxes");
  if (container) {
    container.innerHTML = "";
    allTypes.forEach(type => {
      const div = document.createElement("div");
      const cb  = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "type-" + type;
      cb.value = type;
      cb.checked = true;
      const label = document.createElement("label");
      label.htmlFor = "type-" + type;
      label.textContent = type;
      cb.addEventListener("change", e => {
        if (e.target.checked) selected.add(type);
        else selected.delete(type);
      });
      div.appendChild(cb);
      div.appendChild(label);
      container.appendChild(div);
    });
  }

  const startBtn = document.getElementById("startButton");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (selected.size === 0) {
        alert("少なくとも1つの品詞を選択してください！");
        return;
      }
      const order    = allTypes.filter(t => selected.has(t));
      const filtered = wordData.filter(w => selected.has(w.type));
      initGame(filtered, {
        categoryOrder:   order,
        scorePerCorrect: opts.dynamicScore ? order.length * 20 : 100,
      });
    });
  }
}


/* ===============================
   出題範囲セレクト式ゲーム（外部公開）
   チェックボックスで「出題する範囲」を絞る。列は type から作る。
   - opts.filterKey : 絞り込みに使うフィールド名（既定 "category"）
   - opts.typeOrder : 列の固定順
   - opts.title     : チェックボックス見出し
   例）＋か−：category=加減法/乗法…、type=正/負
=============================== */
export function initFilterSelectionGame(wordData, opts = {}) {
  const key = opts.filterKey || "category";
  const allGroups = [...new Set(wordData.map((w) => w[key]).filter(Boolean))];
  const selected = new Set(allGroups);

  const container = document.getElementById("typeCheckboxes");
  if (container) {
    container.innerHTML = "";
    allGroups.forEach((group) => {
      const div = document.createElement("div");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "grp-" + group;
      cb.value = group;
      cb.checked = true;
      const label = document.createElement("label");
      label.htmlFor = cb.id;
      label.textContent = group;
      cb.addEventListener("change", (e) => {
        if (e.target.checked) selected.add(group);
        else selected.delete(group);
      });
      div.appendChild(cb);
      div.appendChild(label);
      container.appendChild(div);
    });
  }

  const startBtn = document.getElementById("startButton");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      if (selected.size === 0) {
        alert("少なくとも1つ選んでください！");
        return;
      }
      const filtered = wordData.filter((w) => selected.has(w[key]));
      const order = (opts.typeOrder && opts.typeOrder.length)
        ? opts.typeOrder.filter((t) => filtered.some((w) => w.type === t))
        : [...new Set(filtered.map((w) => w.type))];
      initGame(filtered, { categoryOrder: order });
    });
  }
}


/* ===============================
   UIイベント
=============================== */
returnButton.addEventListener("click", () => {
  if (reviewMode) {
    reviewMode = false;
    tokkunMode = false;
    returnButton.textContent = "Return to START";
    gameScreen.style.display = "none";
    startScreen.style.display = "block";
    unlockZoom();
    refreshRankingView();
    updateTokkunButton();
    return;
  }
  // カウントダウン/チュートリアル中に戻った場合はイントロを中断
  if (introCancel) { introCancel(); introCancel = null; }
  introActive = false;
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
/* HUDはラベルと数字を別要素にする。
   狭い画面ではCSSでラベルだけ隠し、アイコンと数字で読ませる
   （1要素に詰め込むと数字まで省略記号で切れてしまうため） */
function hudHTML(label, value) {
  return `<span class="hud-label">${label}</span><span class="hud-num">${value}</span>`;
}

function updateTimerDisplay() {
  // じっくりモードの加算は1.5秒刻みなので、そのまま出すと「61.5」になる
  timerDisplay.innerHTML = hudHTML("Time", Math.max(0, Math.ceil(remainingTime)));
  // 残り10秒で点滅して緊張感を出す
  timerDisplay.classList.toggle("hurry", remainingTime <= 10 && remainingTime > 0);
}

function updateScoreDisplay() {
  scoreDisplay.innerHTML = hudHTML("Score", score);
}

function updateComboDisplay() {
  comboDisplay.innerHTML = hudHTML("Combo", currentCombo);
  maxComboDisplay.innerHTML = hudHTML("Max", maxCombo);

  if (currentCombo > 0 && currentCombo % 15 === 0) {
    comboDisplay.classList.add("combo-effect-50");
    setTimeout(() => comboDisplay.classList.remove("combo-effect-50"), 700);
    audio.sfx("combo", currentCombo);
  } else if (currentCombo > 0 && currentCombo % 5 === 0) {
    comboDisplay.classList.add("combo-effect");
    setTimeout(() => comboDisplay.classList.remove("combo-effect"), 500);
    audio.sfx("combo", currentCombo);
  }
}

/* ===============================
   目標バー
   HUDが「いまの数字」なら、こちらは「次に何をすればいいか」。
   実際に足りていない条件だけを出す（正解数が足りているのに
   正確さで止まっている時に「あと○問」と出すと、追っても届かない嘘になる）
=============================== */
/* 狭い場所用の短い言い回し。ランク名は必ず残す（そこが読めないと意味がない） */
function compactGoal(g) {
  if (g.kind === "top") return "Sランク達成中";
  if (g.kind === "acc") return `あと<b>${g.remain}</b>問で${g.rank}`;
  if (g.kind === "promo") return `あと<b>${g.remain}</b>問でランクUP`;
  return `${g.rank}まで<b>${g.remain}</b>問`;
}

function updateGoalBar() {
  const bar = document.getElementById("goalBar");
  if (!bar || reviewMode) return;
  const c = correctCount;
  const w = wrongAnswers.length;
  const acc = accuracyOf(c, w);
  const main = bar.querySelector(".goal-main");
  const fill = bar.querySelector(".goal-fill");

  // 横向きスマホでは幅が狭く、末尾のランク名が切れて肝心なことが読めない。
  // 短い言い回しに切り替える
  const tight = window.innerHeight <= 560;

  let keep = false, html, pct;
  if (c < 5) {
    // 最初の20秒ずっと「Dランク」を見せられるのは、情報ゼロで気分だけ削る
    html = tight ? '<b>5</b>問でCランク' : 'まず <b>5</b>問正解で Cランク';
    pct = (c / 5) * 100;
  } else if (acc >= PROMOTE_ACCURACY && c >= PROMOTE_MIN_CORRECT) {
    keep = true;
    // Aまで上がりきったら「ランクUP」ではなく、次はSに必要な正解数を示す
    const cur = rankFor(c, w, categories.length);
    const need = Math.max(0, 30 - c);
    const pctTxt = Math.round(acc * 100);
    // すでにSならこれ以上のランクはない。Aなら次はSに必要な正解数を示す
    const tail = cur === "S" ? "・Sランク達成中" : cur === "A" ? `・Sまで${need}問` : "→ ランクUP";
    html = tight
      ? `<b>${pctTxt}%</b> ${tail}`
      : `正確さ <b>${pctTxt}%</b> キープ中<span class="goal-sub"> ${tail}</span>`;
    pct = 100;
  } else {
    const g = nextGoal(c, w, categories.length);
    html = tight ? compactGoal(g) : g.text;
    const t = RANK_THRESHOLDS.find((r) => r.rank === g.rank);
    pct = t && t.need ? Math.min(100, (c / t.need) * 100) : 100;
  }
  main.innerHTML = html;
  fill.style.width = Math.max(0, Math.min(100, pct)) + "%";
  bar.classList.toggle("is-keep", keep);
}

/* 音の状態を短く知らせる。設定画面を開かせない */
let soundToastTimer = null;
function showSoundToast(text) {
  let t = document.getElementById("soundToast");
  if (!t) {
    t = document.createElement("div");
    t.id = "soundToast";
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(soundToastTimer);
  soundToastTimer = setTimeout(() => t.classList.remove("show"), 1200);
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
/* 仕分けエリアの高さ。
   横向きスマホのようにプレイエリアが低いときは薄くして落下距離を確保する */
function sortingAreaHeight() {
  return playArea.clientHeight < 340 ? 62 : SORTING_AREA_HEIGHT;
}

function getDecisionLineY() {
  // 判定ラインは常に仕分けエリア上端
  return playArea.clientHeight - sortingAreaHeight();
}


/* ===============================
   長い文章を1列幅に収める
   （短い単語は従来通り。長い文章はフォント縮小＋折り返し）
=============================== */
function fitWordSize(wordDiv) {
  if (wordDiv.querySelector("img")) return; // 画像はそのまま

  const cols     = Math.max(categories.length, 1);
  const colWidth = playArea.clientWidth / cols;
  // 1列幅を基準に、読みやすさ優先で最大1.5列分まで許容
  const maxWidth = Math.max(90, Math.min(colWidth * 1.5, playArea.clientWidth - 20));

  // まず通常（1行）状態で幅を測定
  wordDiv.classList.remove("wide");
  wordDiv.style.whiteSpace = "nowrap";
  wordDiv.style.maxWidth   = "";
  wordDiv.style.fontSize   = "";

  if (wordDiv.offsetWidth <= maxWidth) return; // 短い単語は変更なし（従来通り）

  // 長い文章: 折り返し＋フォント縮小で1列に収める
  wordDiv.classList.add("wide");
  wordDiv.style.whiteSpace = "normal";
  wordDiv.style.maxWidth   = maxWidth + "px";

  const maxHeight = playArea.clientHeight * 0.22;
  let fs = 17;
  wordDiv.style.fontSize = fs + "px";
  while (fs > 11 && wordDiv.offsetHeight > maxHeight) {
    fs -= 1;
    wordDiv.style.fontSize = fs + "px";
  }
}


/* ===============================
   文章タイル生成（文中の対象語をハイライト）
   sentence 内の word を <span class="target-word"> で強調
=============================== */
function escapeHTML(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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
   単語 / 画像 共通生成（画像ロード待ち対応）
=============================== */
function spawnWord(presetX, presetData) {
  // 山札から引く。デッキが無い/壊れた場合だけ従来の抽選に落ちる
  const data =
    presetData ||
    (deck && deck.next()) ||
    currentWordData[Math.floor(Math.random() * currentWordData.length)];

  const wordDiv = document.createElement("div");
  wordDiv.classList.add("word");
  wordDiv.dataset.type = data.type;
  wordDiv._mItem = data;   // 習熟度の記録用。dataset にすると属性化のコストが乗る
  // 解説はここでタイルに焼き付ける。
  // 結果画面で word 一致から引き直していたため、word を持たない画像問題では常に出ず、
  // 品詞比較のように同じ語で分類が違うペアでは逆の解説を引くことがあった
  if (data.explanation) wordDiv.dataset.expl = data.explanation;
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

    if (data.word) wordDiv.dataset.word = data.word; // 間違いノート照合用
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
  } else if (data.sentence) {
    // 文章タイル：文中の対象語をハイライト
    wordDiv.innerHTML = buildTileHTML(data.sentence, data.word);
    wordDiv.dataset.word = data.word;
    wordDiv.dataset.sentence = data.sentence;
    wordDiv.style.whiteSpace = "nowrap";
    contentReadyPromise = Promise.resolve();
  } else {
    wordDiv.textContent = data.word;
    /* 補助表示（英単語の意味など）は「出す／出さない」ではなく「遅らせる」。
       すぐ出すと思い出す前に答えが見えてしまい、消すと詰まった子が困る。
       覚えてきた問題ほど遅らせて、最後は自分から見に行く形にする。
       data.hintRequired が true のデータは、ヒント無しでは解けないので常に即出し。 */
    if (data.hint) {
      wordDiv.dataset.hint = data.hint;
      let delay = 0;
      if (data.hintRequired !== true) {
        try { delay = hintDelayMs(title, data); } catch (e) { delay = 0; }
      }
      if (delay <= 0) {
        attachHint(wordDiv, false);
      } else if (isFinite(delay)) {
        if (!hintTipShown) {
          hintTipShown = true;
          showMicroFeedback({ body: "ヒントが出るのがゆっくりになったよ。すぐ見たい時はタイルをタップ", ms: 2400 });
        }
        wordDiv._hintTimer = setTimeout(() => {
          if (wordDiv.isConnected && wordDiv.dataset.locked === "false") attachHint(wordDiv, false);
        }, delay);
      } else if (!hintTipShown) {
        hintTipShown = true;
        showMicroFeedback({ body: "この問題はもう覚えたね。ヒントが見たい時はタイルをタップ", ms: 2400 });
      }
      // Infinity のときは自動では出さない（タイルをタップすれば見られる）
    }
    wordDiv.dataset.word = data.word;
    wordDiv.style.whiteSpace = "nowrap";
    contentReadyPromise = Promise.resolve();
  }

  // ペアゲーム用：どのペアの片割れかを覚えておく
  if (data.pairId !== undefined) wordDiv.dataset.pairId = String(data.pairId);

  playArea.appendChild(wordDiv);

  // === 画像 or 文字の準備完了後に配置＆落下開始 ===
  contentReadyPromise.then(() => {
    fitWordSize(wordDiv); // 長い文章を1列幅に収める
    const width = wordDiv.offsetWidth;
    const margin = 10;
    let x;

    if (presetX !== undefined) {
      // 複数スポーン時は分割位置を優先（画面外にはみ出さないようにクランプ）
      x = Math.max(margin, Math.min(presetX, playArea.clientWidth - width - margin));
    } else {
      let attempts = 0;
      do {
        x = margin + Math.random() * (playArea.clientWidth - width - margin * 2);
        attempts++;
      } while (
        attempts < 50 &&
        fallingWords.some(w => x < w.x + w.element.offsetWidth && x + width > w.x)
      );
    }

    wordDiv.style.left = `${x}px`;
    wordDiv.style.visibility = "visible";

    wordDiv.addEventListener("mousedown", handleMouseDown);
    wordDiv.addEventListener("touchstart", handleTouchStart);

    fallingWords.push({
      element: wordDiv,
      x,
      y: -30,
      speed: FALL_SPEED,
      // 長い語ほどゆっくり落として読む時間を確保する
      speedMult: lengthSpeedMultiplier(wordDiv.dataset.word || wordDiv.textContent || ""),
    });
  });
}


/* ===============================
   正解時ロック処理
=============================== */

function lockWord(wordElem, dropCategory) {
  if (wordElem.dataset.locked === "true") return;
  wordElem.dataset.locked = "true";
  clearTimeout(wordElem._hintTimer);

  const correct = wordElem.dataset.type === dropCategory;
  if (correct) {
    wordElem.classList.add("correct");
    score += scorePerCorrect;
    correctCount++;
    tally(wordElem.dataset.type, "c");
    if (deck) deck.recordAnswer(wordElem._mItem, true, wordElem.dataset.hinted === "1" ? "hinted" : undefined);
    // ★ 間違いノートの問題に正解 → 克服。
    //    書き込みはプレイ中に行わず endGame でまとめる（1問ごとに保存すると
    //    進捗データ全体の読み書きが毎回走ってカクつくため）
    if (!reviewMode && wordElem.dataset.word && noteWords.has(wordElem.dataset.word)) {
      noteWords.delete(wordElem.dataset.word);
      resolvedNotes.add(wordElem.dataset.word);
    }
    // COMBO処理：正解なら＋1して更新
    currentCombo++;
    if (currentCombo > maxCombo) {
      maxCombo = currentCombo;
    }
    // じっくりモードの加算時間。連続正解が伸びるほど増える＝正確さがそのまま持ち時間になる
    if (bonusEnabled) grantBonusTime(comboTimeBonus(currentCombo));
    audio.sfx("correct", currentCombo);
    audio.bgm.setIntensity(Math.min(1, correctCount / 30));
    // ペアの両方をそろえたら称える。
    // ここで score を足すと「スコア＝正解数×配点」が崩れて
    // プレイ全体が不正判定になる（品詞比較が丸ごと無効化されていた原因）ので、
    // 得点ではなく「時間」と「演出」で返す。
    if (pairMode && wordElem.dataset.pairId !== undefined) {
      const pid = wordElem.dataset.pairId;
      pairProgress[pid] = (pairProgress[pid] || 0) + 1;
      if (pairProgress[pid] === 2) {
        const got = bonusEnabled ? grantBonusTime(PAIR_TIME_BONUS) : 0;
        showPairBonusEffect(parseInt(wordElem.style.left) || 0, parseInt(wordElem.style.top) || 0, got);
        audio.sfx("combo", currentCombo);
      }
    }
    updateComboDisplay();
    updateGoalBar();
    updateTimerDisplay();
    updateScoreDisplay();
    setTimeout(() => {
      wordElem.remove();
    }, 500);
  }
  fallingWords = fallingWords.filter((w) => w.element !== wordElem);
}

/* ===============================
   誤答タイルを盤面に残す
   「何を」「どこに入れて」「本当はどこか」を目で確認できるようにする
=============================== */
const MAX_STUCK_WRONG = 6;   // 残す枚数の上限（多すぎると盤面が埋まる）
const MAX_STUCK_ROWS = 3;    // 1列に積み上げる段数の上限
let stuckWrongs = [];

function stickWrongWord(wordElem, droppedCategory) {
  clearTimeout(wordElem._hintTimer);
  wordElem.classList.remove("dragging");
  wordElem.classList.add("stuck");
  wordElem.dataset.locked = "true";
  wordElem.style.pointerEvents = "none";

  // 「正解: ○○」タグを付ける
  if (!wordElem.querySelector(".answer-tag")) {
    const tag = document.createElement("span");
    tag.className = "answer-tag";
    // 列が狭い端末でも読めるよう「正解:」は◎に省略し、折り返して表示する
    tag.textContent = "◎" + (wordElem.dataset.type || "");
    wordElem.appendChild(tag);
  }

  // 落とした列にスナップして下から積む
  const colCount = Math.max(1, categories.length);
  let colIndex = categories.indexOf(droppedCategory);
  if (colIndex < 0) colIndex = 0;
  const colWidth = playArea.clientWidth / colCount;
  const row = Math.min(stuckWrongs.filter((s) => s.col === colIndex).length, MAX_STUCK_ROWS - 1);

  wordElem.style.maxWidth = Math.max(40, colWidth - 6) + "px";
  // タグを足したあとの実寸で配置する（下端で見切れないように）
  const w = Math.min(wordElem.offsetWidth, colWidth - 6);
  const h = wordElem.offsetHeight;
  wordElem.style.left = Math.round(colIndex * colWidth + (colWidth - w) / 2) + "px";
  wordElem.style.top = Math.round(playArea.clientHeight - h - 3 - row * (h + 3)) + "px";

  stuckWrongs.push({ element: wordElem, col: colIndex });
  while (stuckWrongs.length > MAX_STUCK_WRONG) {
    const old = stuckWrongs.shift();
    old.element.classList.add("fading");
    setTimeout(() => old.element.remove(), 500);
  }

  /* 間違えたその場で「本当はどれか」と、あれば一言解説を出す。
     結果画面まで待たせると、いちばん学べる瞬間を逃してしまう。
     解説が無いデータの方が多いので、その場合は
     「選んだほうを名指しで否定する」形にする（何と何の区別なのかが伝わる） */
  if (wordElem.dataset.fedback !== "1") {
    wordElem.dataset.fedback = "1";
    showMicroFeedback({
      head: wordElem.dataset.type || "",
      body: wordElem.dataset.expl || `「${droppedCategory}」ではないよ`,
    });
  }
}

/* ペア完成の表示。得点ではなく「そろえられた」という事実と、じっくりモードなら加算時間を返す */
function showPairBonusEffect(x, y, addedSec) {
  const effect = document.createElement("div");
  effect.className = "pair-bonus-effect";
  const sec = Math.round(addedSec * 10) / 10;
  effect.textContent = sec > 0 ? `ペア完成！ +${sec}秒` : "ペア完成！";
  effect.style.left = x + "px";
  effect.style.top = Math.max(0, y - 26) + "px";
  playArea.appendChild(effect);
  setTimeout(() => effect.remove(), 1200);
}

/* ===============================
   誤答を1か所で記録する
   「何を」「本当はどこか」に加えて「どこに入れたか」を残す。
   この“どこに入れたか”があって初めて、
   「連体詞を形容動詞と3回まちがえた」という言い方ができる
=============================== */
function tally(type, kind) {          // kind: "c" 正解 / "w" 誤答 / "s" 見送り
  if (!type) return;
  const e = sessionByType[type] || (sessionByType[type] = { c: 0, w: 0, s: 0 });
  e[kind]++;
}

function recordWrong(wordElem, droppedCategory) {
  const correctType = wordElem.dataset.type || "";
  tally(correctType, "w");
  wrongAnswers.push({
    word: wordElem.dataset.word || wordElem.textContent || correctType,
    sentence: wordElem.dataset.sentence || "",
    correctType,
    dropped: droppedCategory || "",
    expl: wordElem.dataset.expl || "",
  });
  if (droppedCategory && droppedCategory !== correctType) {
    const k = correctType + CONF_SEP + droppedCategory;
    sessionConfusion[k] = (sessionConfusion[k] || 0) + 1;
  }
  if (deck) deck.recordAnswer(wordElem._mItem, false, "drop");
  audio.sfx("wrong");
  audio.buzz(18);
}

/* ===============================
   見送り（触らずに落ちたタイル）
   減点しない・コンボも切らない。ただし得点にもしない。
   その問題は山札に戻して、数問あとにもう一度出す
=============================== */
function passWord(word, atY) {
  const el = word.element;
  if (el.dataset.locked === "true") return;
  el.dataset.locked = "true";
  el.style.pointerEvents = "none";
  clearTimeout(el._hintTimer);
  el.classList.add("passed");
  word.landed = true;
  skipCount++;
  tally(el.dataset.type, "s");

  if (deck) deck.recordAnswer(el._mItem, false, "timeout");
  audio.sfx("skip");

  showPassNote(word.x + el.offsetWidth / 2, Math.max(0, atY - 18));
  if (!passHintShown) {
    passHintShown = true;
    showMicroFeedback({ body: "置かないと点にならないよ。でも減点もないから、迷ったら見送ってOK。あとでもう一度出るね。", ms: 2200 });
  }
  setTimeout(() => el.remove(), 520);
}

/* ヒントを実際に貼る。manual=true は自分でタップして見に行った場合。
   自分で見に行ったことは記録しておき、その回の正解では習熟を上げない
   （ヒントを見て解けたことを「覚えた」と数えると、足場外しが嘘になる） */
function attachHint(el, manual) {
  if (!el.dataset.hint || el.querySelector(".tile-hint")) return;
  const s = document.createElement("small");
  s.className = "tile-hint " + (manual ? "tile-hint--asked" : "tile-hint--late");
  s.textContent = el.dataset.hint;
  el.appendChild(s);
  if (manual) el.dataset.hinted = "1";
  fitWordSize(el);
  // 後から足すと幅が変わるので、画面外へはみ出さないよう measure し直す
  const maxLeft = playArea.clientWidth - el.offsetWidth - 4;
  if ((parseFloat(el.style.left) || 0) > maxLeft) {
    const nx = Math.max(4, maxLeft);
    el.style.left = nx + "px";
    const fw = fallingWords.find((w) => w.element === el);
    if (fw) fw.x = nx;
  }
}

function showPassNote(x, y) {
  const n = document.createElement("div");
  n.className = "pass-note";
  n.textContent = "見送り";
  n.style.left = x + "px";
  n.style.top = y + "px";
  playArea.appendChild(n);
  setTimeout(() => n.remove(), 950);
}

/* ===============================
   誤答直後のマイクロ解説
   判定ラインのすぐ上に細い帯で出す。
   z-index を落下タイルより下に置くことで、
   「解説が盤面を隠さない」を重なり順そのもので保証する
=============================== */
let microTimer = null;
let microShownAt = 0;
let microPending = null;

function ensureMicroStrip() {
  let s = document.getElementById("microFeedback");
  if (!s || !s.isConnected) {          // playArea.innerHTML="" で消えるので都度確認
    s = document.createElement("div");
    s.id = "microFeedback";
    s.innerHTML = '<b class="mf-head"></b><span class="mf-body"></span>';
    playArea.appendChild(s);
  }
  return s;
}

function showMicroFeedback({ head, body, ms }) {
  const s = ensureMicroStrip();
  const now = Date.now();
  // 続けて間違えたとき：古い解説を積まず、最新の1件だけを見せる
  if (s.classList.contains("show") && now - microShownAt < 500) {
    microPending = { head, body, ms };
    return;
  }
  microPending = null;
  microShownAt = now;
  s.querySelector(".mf-head").textContent = head || "";
  s.querySelector(".mf-body").textContent = body || "";
  s.style.bottom = (playArea.clientHeight - getDecisionLineY() + 6) + "px";
  s.classList.remove("show");
  void s.offsetWidth;
  s.classList.add("show");
  clearTimeout(microTimer);
  // 解説つきは読む時間が要る。短い言い切りだけなら短く消す
  const dur = ms || (body && body.length > 14 ? 2600 : 1400);
  microTimer = setTimeout(() => {
    s.classList.remove("show");
    if (microPending) {
      const p = microPending;
      microPending = null;
      setTimeout(() => showMicroFeedback(p), 180);
    }
  }, dur);
}

/* ===============================
   ペナルティエフェクト表示関数
=============================== */
function showPenaltyEffect(x, y) {
  const effect = document.createElement("div");
  effect.classList.add("penalty-effect");
  effect.textContent = "⏱ −3秒";
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

  currentDrag = {
    element: wordElem, offsetX, offsetY,
    startX: parseFloat(wordElem.style.left) || 0,
    startY: parseFloat(wordElem.style.top) || 0,
    moved: false,
  };
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

  // 6px以上動かしたら「自分で置いた」とみなす。
  // ここが立っていないタイルは判定せず「見送り」にする
  if (!currentDrag.moved &&
      Math.abs(newX - currentDrag.startX) + Math.abs(newY - currentDrag.startY) > 6) {
    currentDrag.moved = true;
    wordElem.dataset.placed = "1";
  }

  wordElem.style.left = newX + "px";
  wordElem.style.top = newY + "px";

  const fallingWord = fallingWords.find((w) => w.element === wordElem);
  if (fallingWord) {
    fallingWord.x = newX;
    fallingWord.y = newY;
  }

  // ドラッグ中：タイル中心の真下の列をハイライト（どこに落ちるか可視化）
  highlightDropColumn(newX + elemWidth / 2, newY + wordElem.offsetHeight);
}

function highlightDropColumn(centerX, tileBottomY) {
  const cols = playArea.querySelectorAll(".sorting-column");
  if (!cols.length) return;
  const idx = Math.floor(centerX / (playArea.clientWidth / cols.length));
  cols.forEach((c, i) => c.classList.toggle("active", i === idx));

  // タイル中心から判定ラインまで伸びる縦ガイド線（どこで判定されるかを明示）
  let guide = document.getElementById("dropGuide");
  if (!guide) {
    guide = document.createElement("div");
    guide.id = "dropGuide";
    playArea.appendChild(guide);
  }
  const lineY = getDecisionLineY();
  const topY = Math.min(tileBottomY, lineY);
  guide.style.left = centerX + "px";
  guide.style.top = topY + "px";
  guide.style.height = Math.max(0, lineY - topY) + "px";
  guide.style.display = "block";
}

function clearColumnHighlight() {
  const guide = document.getElementById("dropGuide");
  if (guide) guide.style.display = "none";
  playArea.querySelectorAll(".sorting-column.active").forEach((c) => c.classList.remove("active"));
}

function handleMouseUp(e) {
  if (!currentDrag) return;
  const wordElem = currentDrag.element;
  wordElem.classList.remove("dragging");
  clearColumnHighlight();
  const top = parseInt(wordElem.style.top);

  /* 動かさずにタップして離した ＝ ヒントを見たい、という合図。
     専用ボタンは作らない。横向きの盤面には常設する余地がないうえ、
     ボタンだと「どのタイルで迷ったのか」が分からないため */
  if (!currentDrag.moved && top < getDecisionLineY() &&
      wordElem.dataset.hint && !wordElem.querySelector(".tile-hint")) {
    attachHint(wordElem, true);
    wordElem.classList.remove("dragging");
    currentDrag = null;
    return;
  }

  if (reviewMode) {
    if (top >= getDecisionLineY() && wordElem.dataset.locked === "false") {
      const dropX = parseInt(wordElem.style.left) + wordElem.offsetWidth / 2;
      const columnWidth = playArea.clientWidth / categories.length;
      const columnIndex = Math.floor(dropX / columnWidth);
      const dropCategory = categories[columnIndex];
      if (wordElem.dataset.type === dropCategory) {
        wordElem.classList.add("correct");
        wordElem.dataset.locked = "true";
        // 特訓モード: 正解した問題をその場でノートから削除（克服数には数えない）
        if (tokkunMode && reviewQueue[reviewIndex]) {
          try { v2p.noteResolve(title, reviewQueue[reviewIndex].word, false); tokkunClearCount++; } catch (e) {}
        }
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
      wordElem.dataset.penalized = "true";
      // 自動判定側にしか出ていなかった −3秒 の表示を、手で落とした時にも出す
      showPenaltyEffect(
        (parseInt(wordElem.style.left) || 0) + wordElem.offsetWidth / 2,
        (parseInt(wordElem.style.top) || 0) - 20
      );
      currentCombo = 0;
      updateComboDisplay();
      recordWrong(wordElem, dropCategory);
      updateGoalBar();
      if (remainingTime <= 0) {
        clearInterval(timerIntervalId);
        endGame();
        return;
      }
      updateTimerDisplay();
      const fw = fallingWords.find(w => w.element === wordElem);
      if (fw) fw.landed = true;
      stickWrongWord(wordElem, dropCategory);
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
  const delta = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  fallingWords.forEach((word) => {
    if (word.element.dataset.locked === "true") return;
    const currentSpeed = FALL_SPEED * difficultyFactor() * (word.speedMult || 1);
    let newY = word.y + currentSpeed * delta;
    const wordHeight = word.element.offsetHeight;
    const decisionLineY = getDecisionLineY();

    if (newY >= decisionLineY) {
      const dropX = word.x + word.element.offsetWidth / 2;
      const columnWidth = playArea.clientWidth / categories.length;
      const columnIndex = Math.floor(dropX / columnWidth);
      const dropCategory = categories[columnIndex];

      // ★ 見送り：一度も動かしていないタイルは正誤判定しない。
      //    今までは運よく正解の列に流れ着くと満点＋コンボが付いていた（2列のゲームなら約50%）。
      //    学習が起きていないのに報酬が出るうえ、間違いノートや習熟の記録まで汚れる。
      if (word.element.dataset.placed !== "1" && !reviewMode) {
        passWord(word, newY);
        return;
      }

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
          word.element.dataset.penalized = "true";
          const effectX = word.x + word.element.offsetWidth / 2;
          const effectY = newY - 20;
          showPenaltyEffect(effectX, effectY);
          currentCombo = 0;
          updateComboDisplay();
          recordWrong(word.element, dropCategory);
          updateGoalBar();
          if (remainingTime <= 0 && !gameOver) {
            endGame();
            return;
          }
          updateTimerDisplay();
        }
        word.landed = true;
        stickWrongWord(word.element, dropCategory);
        return;
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

  if (now - lastSpawnTime > currentSpawnInterval() && unsortedCount() < maxOnScreen()) {
    const spawnCount = currentSpawnCount();
    if (pairMode) {
      // ペアの2枚を左右に離して同時に出す（見比べさせる）
      // どのペアを出すかは山札に決めてもらう（出題の偏りをなくすため）
      const seed = deck && deck.next();
      let pid;
      if (seed && seed.pairId !== undefined) {
        pid = seed.pairId;
      } else {
        const ids = [...new Set(currentWordData.map((w) => w.pairId))];
        pid = ids[Math.floor(Math.random() * ids.length)];
      }
      const items = currentWordData.filter((w) => w.pairId === pid);
      const areaW = playArea.clientWidth;
      items.forEach((it, i) => {
        spawnWord(items.length > 1 ? areaW * (i === 0 ? 0.08 : 0.55) : undefined, it);
      });
    } else if (spawnCount > 1) {
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
    if (bonusEnabled) {
      // 終わりの時刻に近づいたら持ち時間もそこへ収束させる。
      // 打ち切るのではなく、残りが自然に減っていくので終わりが読める
      const left = Math.max(0, Math.ceil(SESSION_MAX_SEC - elapsedSec()));
      if (remainingTime > left) remainingTime = left;
    }
    updateTimerDisplay();
    // このinterval は1秒に1回だけ動く。updateTimerDisplay 側に置くと正解のたびに鳴ってしまう
    if (remainingTime <= 5 && remainingTime > 0) audio.sfx("tick");
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
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(gameLoopId);
  clearInterval(timerIntervalId);
  fallingWords.forEach((word) => {
    word.element.style.opacity = 0.5;
  });
  audio.bgm.stop(0.8);
  audio.sfx("gameover");

  // 習熟データの書き出しはここで1回だけ。1問ごとに保存するとゲーム中に引っかかる
  try { recordDay(title, correctCount + wrongAnswers.length, correctCount); } catch (e) {}
  try { masteryFlush(); } catch (e) {}

  // 克服したノートの語も、プレイ中ではなくここでまとめて反映する
  try {
    for (const w of resolvedNotes) v2p.noteResolve(title, w, true);
  } catch (e) {}
  resolvedNotes = new Set();

  // ★ 進捗記録（XP・称号・間違いノート・ストリーク・チャレンジ判定）
  //    スコア整合性チェックに落ちた場合はランキング保存も含め全て拒否
  const durationSec = Math.round((Date.now() - playStartTime) / 1000);
  try {
    lastPlayResult = v2p.recordPlay({
      gameId: title,
      score,
      correctCount,
      wrongCount: wrongAnswers.length,
      skipped: skipCount,
      maxCombo,
      durationSec,
      scorePerCorrect,
      wrongItems: wrongAnswers,
    });
  } catch (e) {
    lastPlayResult = { valid: true, counted: false };
  }

  if (lastPlayResult && lastPlayResult.valid === false) {
    console.warn("スコア整合性チェックに失敗したため記録をスキップしました");
    showResultScreen();
    return;
  }

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
  saveToSupabase(username, score);

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
  if (!medalImage) return; // メダル非対応のゲーム（品詞選択ゲーム等）では何もしない
  let medalSrc = "";

  // メダルは獲得したときだけ表示する（未獲得の空メダルは出さない）
  if (playCount >= 30) {
    medalSrc = "/images/medals/medal_gold.png";
  } else if (playCount >= 15) {
    medalSrc = "/images/medals/medal_silver.png";
  } else if (playCount >= 5) {
    medalSrc = "/images/medals/medal_bronze.png";
  }

  if (medalSrc) {
    medalImage.src = medalSrc;
    medalImage.style.display = "inline-block";
  } else {
    medalImage.style.display = "none";
  }
}

function showUpdatedMedal() {
  const playCount = parseInt(localStorage.getItem("playCount" + title)) || 0;
  updateMedalDisplay(playCount);
}
