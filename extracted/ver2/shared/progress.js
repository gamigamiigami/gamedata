/* ==========================================================
   ver2 進捗エンジン
   - XP/レベル・称号バッジ・ストリーク・間違いノート・今日のチャレンジ
   - 保存は localStorage（端末ごと）。チェックサム付きで改ざんを検出
   ========================================================== */

const KEY  = "ver2_progress";
const SALT = "iogames-v2-2026";

/* ---------- チェックサム（djb2） ---------- */
function checksum(str) {
  let h = 5381;
  const s = str + SALT;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function freshData() {
  return {
    v: 1,
    xp: 0,
    streak: { last: "", count: 0 },
    games: {},    // gameId -> { best, bestCombo, bestCorrect }
    subjects: {}, // subject -> best score
    subjectsC: {},// subject -> best 正解数
    badges: {},   // badgeId -> 取得日(ISO)
    note: [],     // { g, w, t, s, n } 間違いノート
    stats: { noteCleared: 0, challengeDone: 0, reviewDone: 0, plays: 0 },
    challenge: { date: "", done: false },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshData();
    const obj = JSON.parse(raw);
    const sig = obj.sig;
    delete obj.sig;
    // 改ざん検出: チェックサム不一致なら記録を無効化してやり直し
    if (checksum(JSON.stringify(obj)) !== sig) return freshData();
    return obj;
  } catch {
    return freshData();
  }
}

function save(data) {
  const clone = { ...data };
  delete clone.sig;
  const body = JSON.stringify(clone);
  clone.sig = checksum(body);
  localStorage.setItem(KEY, JSON.stringify(clone));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ---------- レベル計算 ----------
   レベルnに上がるのに必要なXP: 100 + (n-2)*25（最初は早く、だんだんゆっくり） */
export function levelInfo(xp) {
  let level = 1;
  let rest = xp;
  let need = 100;
  while (rest >= need && level < 99) {
    rest -= need;
    level++;
    need = 100 + (level - 1) * 25;
  }
  return { level, cur: rest, next: need, pct: Math.min(100, Math.round((rest / need) * 100)) };
}

/* ---------- 教科判定（URLパスから） ---------- */
const SUBJECTS = {
  kokugo: "国語", math: "数学", rika: "理科",
  syakai: "社会", english: "英語", kateika: "家庭科",
};
export function subjectOf(path) {
  const p = path || location.pathname;
  for (const key of Object.keys(SUBJECTS)) {
    if (p.includes("/" + key + "/")) return key;
  }
  return null;
}
export function subjectName(key) { return SUBJECTS[key] || key || ""; }

/* ---------- バッジ定義（すべて達成ベース。回数条件は作らない） ---------- */
const MEDAL = (f) => new URL("../images/medals/" + f, import.meta.url).href;

export const BADGES = [
  { id: "first_clear",  name: "はじめの一歩",   desc: "どれかのゲームで5問正解",   icon: "🎈" },
  { id: "rank_b",       name: "ブロンズの腕前", desc: "12問正解を達成",            img: MEDAL("medal_bronze.png") },
  { id: "rank_a",       name: "シルバーの腕前", desc: "20問正解を達成",            img: MEDAL("medal_silver.png") },
  { id: "rank_s",       name: "ゴールドの腕前", desc: "30問正解を達成",            img: MEDAL("medal_gold.png") },
  { id: "perfect",      name: "パーフェクト",   desc: "ノーミスで12問以上正解",               icon: "✨" },
  { id: "combo30",      name: "コンボ職人",     desc: "30コンボを達成",                       icon: "🔥" },
  { id: "combo50",      name: "コンボの鬼",     desc: "50コンボを達成",                       icon: "⚡" },
  { id: "subjects3",    name: "三教科の旅人",   desc: "3つの教科で5問以上正解",               icon: "🎒" },
  { id: "subjects_all", name: "全教科マスター", desc: "6つの教科すべてで5問以上正解",         icon: "👑" },
  { id: "note10",       name: "弱点ハンター",   desc: "間違いノートの問題を10問克服",         icon: "🎯" },
  { id: "note30",       name: "弱点バスター",   desc: "間違いノートの問題を30問克服",         icon: "🛡️" },
  { id: "streak3",      name: "3日連続",        desc: "3日連続でプレイ",                      icon: "📅" },
  { id: "streak7",      name: "継続の達人",     desc: "7日連続でプレイ",                      icon: "🚀" },
  { id: "challenge1",   name: "本日のヒーロー", desc: "今日のチャレンジを達成",               icon: "🌟" },
  { id: "challenge10",  name: "チャレンジ王",   desc: "今日のチャレンジを10回達成",           icon: "🏆" },
  { id: "acc_90",       name: "ていねい",       desc: "12問以上・正確さ90%以上でクリア",      icon: "◎" },
  { id: "acc_95_20",    name: "確かな20問",     desc: "20問以上・正確さ95%以上でクリア",      icon: "◇" },
  { id: "acc_games3",   name: "安定してる",     desc: "3つのゲームで正確さ90%以上",           icon: "◉" },
  { id: "sec_exact",    name: "ぴったり賞",     desc: "スコアがちょうど2000点",               icon: "🎁", secret: true },
  { id: "sec_review",   name: "復習マニア",     desc: "復習モードを10回完走",                 icon: "📖", secret: true },
];

/* ctx: { score, wrongCount, maxCombo } その回のプレイ内容（プレイ以外の文脈では {} ） */
function badgeEarned(id, data, ctx) {
  // ランク系は「正解数」で判定する（1正解あたりの点数はゲームで違うため）
  const gs = Object.values(data.games);
  const bestCorrectAll = Math.max(0, ...gs.map((g) => g.bestCorrect || 0));
  const bestComboAll   = Math.max(0, ...gs.map((g) => g.bestCombo   || 0));
  const bestPerfectAll = Math.max(0, ...gs.map((g) => g.bestPerfect || 0));
  const subjCleared = Object.values(data.subjectsC || {}).filter((c) => c >= 5).length;
  switch (id) {
    case "first_clear":  return bestCorrectAll >= 5;
    case "rank_b":       return bestCorrectAll >= 12;
    case "rank_a":       return bestCorrectAll >= 20;
    case "rank_s":       return bestCorrectAll >= 30;
    // 見送り（触らずに落とす）を使えば誤答ゼロは簡単に作れてしまうので、
    // 見送りが多い回はパーフェクト扱いにしない
    case "perfect":      return ((ctx.correctCount || 0) >= 12 && ctx.wrongCount === 0
                              && (ctx.skipped || 0) <= 2) || bestPerfectAll >= 12;
    case "combo30":      return Math.max(ctx.maxCombo || 0, bestComboAll) >= 30;
    case "combo50":      return Math.max(ctx.maxCombo || 0, bestComboAll) >= 50;
    case "acc_90":       return gs.some((g) => (g.bestAcc   || 0) >= 90);
    case "acc_95_20":    return gs.some((g) => (g.bestAcc20 || 0) >= 95);
    case "acc_games3":   return gs.filter((g) => (g.bestAcc || 0) >= 90).length >= 3;
    case "subjects3":    return subjCleared >= 3;
    case "subjects_all": return subjCleared >= Object.keys(SUBJECTS).length;
    case "note10":       return data.stats.noteCleared >= 10;
    case "note30":       return data.stats.noteCleared >= 30;
    case "streak3":      return data.streak.count >= 3;
    case "streak7":      return data.streak.count >= 7;
    case "challenge1":   return data.stats.challengeDone >= 1;
    case "challenge10":  return data.stats.challengeDone >= 10;
    case "sec_exact":    return ctx.score === 2000;
    case "sec_review":   return data.stats.reviewDone >= 10;
    default: return false;
  }
}

function evalBadges(data, ctx) {
  const gained = [];
  for (const b of BADGES) {
    if (!data.badges[b.id] && badgeEarned(b.id, data, ctx)) {
      data.badges[b.id] = todayStr();
      gained.push(b);
    }
  }
  return gained;
}

/* ---------- 今日のチャレンジ ----------
   日付から決定的に選出（サーバー不要、全端末で同じお題） */
export const GAME_LIST = [
  { p: "kokugo/2/①/index.html",              t: "自立付属仕分けゲーム",          s: "kokugo" },
  { p: "kokugo/2/②/index.html",              t: "活用仕分けゲーム",              s: "kokugo" },
  { p: "kokugo/2/③/index.html",              t: "品詞仕分けゲーム１",            s: "kokugo" },
  { p: "kokugo/2/④/index.html",              t: "品詞仕分けゲーム２",            s: "kokugo" },
  { p: "math/式の種類/index.html",            t: "単項式・多項式 仕分けゲーム",   s: "math" },
  { p: "math/比例反比例/index.html",          t: "比例・反比例 判定ゲーム",       s: "math" },
  { p: "rika/1/示準化石/index.html",          t: "示準化石 分類ゲーム",           s: "rika" },
  { p: "rika/1/セキツイ動物/index.html",      t: "セキツイ動物 分類ゲーム",       s: "rika" },
  { p: "rika/1/植物分類/index.html",          t: "植物の分類ゲーム",              s: "rika" },
  { p: "rika/2/酸アルカリ/index.html",        t: "酸・アルカリ・中性 仕分けゲーム", s: "rika" },
  { p: "rika/2/単体・化合物①/index.html",    t: "単体・化合物 分類ゲーム",       s: "rika" },
  { p: "rika/3/イオン/イオンnomal/index.html", t: "イオン分類ゲーム ～nomal～",   s: "rika" },
  { p: "syakai/歴史/①/index.html",           t: "歴史・時代分けゲーム",          s: "syakai" },
  { p: "syakai/地理/①/index.html",           t: "都道府県・地方分けゲーム",      s: "syakai" },
  { p: "syakai/地理/②/index.html",           t: "県庁所在地・地方分けゲーム",    s: "syakai" },
  { p: "syakai/地理/③/index.html",           t: "世界の国・州分けゲーム",        s: "syakai" },
  { p: "syakai/公民/三権分立/index.html",     t: "三権分立 仕分けゲーム",         s: "syakai" },
  { p: "english/品詞/index.html",             t: "英単語の品詞ゲーム",            s: "english" },
  { p: "kateika/index.html",                  t: "食品群に強くなろうゲーム",      s: "kateika" },
  { p: "kokugo/敬語/index.html",              t: "敬語仕分けゲーム",              s: "kokugo" },
  { p: "syakai/歴史/②/index.html",           t: "歴史人物・文化仕分けゲーム",    s: "syakai" },
  { p: "math/正負の数/index.html",            t: "計算結果の正負ゲーム",          s: "math" },
  { p: "math/sign/index.html",                t: "正負の符号",                    s: "math" },
  { p: "english/irregular-verbs/index.html",  t: "不規則動詞",                    s: "english" },
  { p: "kokugo/品詞比較/index.html",          t: "品詞比較",                      s: "kokugo" },
];

// 今日のチャレンジ目標は「正解数」（点数より子どもに伝わりやすい）
const CHALLENGE_GOALS = [12, 16, 20];

export function getTodayChallenge() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  let x = seed;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >> 7)) >>> 0;
  x = (x ^ (x << 17)) >>> 0;
  const game = GAME_LIST[x % GAME_LIST.length];
  const goal = CHALLENGE_GOALS[(x >>> 3) % CHALLENGE_GOALS.length];
  const data = load();
  const done = data.challenge.date === todayStr() && data.challenge.done;
  return { ...game, goal, done };
}

/* ---------- 参照系 ---------- */
export function getProgress() { return load(); }

export function getBadgeState() {
  const data = load();
  return BADGES.map((b) => ({ ...b, earned: data.badges[b.id] || null }));
}

export function getNoteFor(gameId) {
  return load().note.filter((n) => n.g === gameId);
}

/* 「どのゲームで」ではなく「どの分類で」つまずいているかを返す。
   ノートには正解の分類（t）が既に入っているので、集計の仕方を変えるだけで出せる。
   保存形式は一切変えていない。 */
export function getWeaknessByType(limit = 6) {
  const SEP = "\u0001";
  const map = new Map();
  for (const n of load().note) {
    const k = n.g + SEP + n.t;
    map.set(k, (map.get(k) || 0) + n.n);
  }
  return [...map.entries()]
    .map(([k, count]) => {
      const i = k.indexOf(SEP);
      return { game: k.slice(0, i), type: k.slice(i + 1), count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function getWeakness(limit = 5) {
  // ゲームごとの間違い数を集計して多い順に返す（苦手分析）
  const map = new Map();
  for (const n of load().note) {
    map.set(n.g, (map.get(n.g) || 0) + n.n);
  }
  return [...map.entries()]
    .map(([g, count]) => ({ game: g, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/* ---------- 間違いノート更新 ---------- */
const NOTE_MAX = 200;

export function noteAddMany(gameId, items) {
  if (!items || !items.length) return;
  const data = load();
  for (const it of items) {
    const found = data.note.find((n) => n.g === gameId && n.w === it.word);
    if (found) {
      found.n = Math.min(found.n + 1, 99);
    } else {
      data.note.push({ g: gameId, w: it.word, t: it.correctType, s: it.sentence || "", n: 1 });
      if (data.note.length > NOTE_MAX) data.note.shift();
    }
  }
  save(data);
}

/* 正解して克服。countBadge=false（復習モード）では克服数に数えない
   （わざと間違え→即復習で稼ぐのを防ぐ。通常プレイでの正解のみカウント） */
export function noteResolve(gameId, word, countBadge) {
  const data = load();
  const idx = data.note.findIndex((n) => n.g === gameId && n.w === word);
  if (idx === -1) return [];
  data.note.splice(idx, 1);
  let gained = [];
  if (countBadge) {
    data.stats.noteCleared++;
    gained = evalBadges(data, {});
  }
  save(data);
  return gained;
}

export function recordReviewComplete() {
  const data = load();
  data.stats.reviewDone++;
  const gained = evalBadges(data, {});
  save(data);
  return gained;
}

/* ---------- スコア整合性チェック（チート対策） ----------
   エンジン内で score は「正解数 × scorePerCorrect」でしか増えないため、
   一致しないスコアは不正（または異常状態）として拒否する */
export function validateResult({ score, correctCount, scorePerCorrect, durationSec, freeScore }) {
  /* freeScore: 得点の作り方が「正解数×配点」ではないゲーム用の逃げ道。
     竹の節（1切り50点＋収穫100点）や活用パズル（レベル×問題数）が該当する。
     この検査はランキング不正を止めるためのもので、
     得点の作り方が違うだけのゲームまで弾くのは筋が違う。 */
  if (!freeScore && score !== correctCount * scorePerCorrect) return false;
  if (durationSec < 5) return false;
  // 落下ゲームの物理的な上限（余裕をみて1秒3問まで）を超える正解数は不可能
  if (correctCount > durationSec * 3 + 5) return false;
  return true;
}

/* ---------- プレイ結果の記録 ---------- */
const MIN_CORRECT = 5;   // これ未満はノーカウント（回数稼ぎ防止）
const MIN_DURATION = 30; // 秒

export function recordPlay(info) {
  const { gameId, score, correctCount, wrongCount, maxCombo, durationSec, scorePerCorrect, wrongItems } = info;
  const skipped = info.skipped || 0;   // 触らずに見送った数（古い呼び出しでは 0 になる）

  if (!validateResult({ score, correctCount, scorePerCorrect, durationSec, freeScore: info.freeScore })) {
    return { valid: false, counted: false };
  }

  const data = load();
  const today = todayStr();

  // ノーカウント判定（最低ライン未満はXPも記録も付かない）
  if (correctCount < MIN_CORRECT || durationSec < MIN_DURATION) {
    return { valid: true, counted: false, minCorrect: MIN_CORRECT };
  }

  const before = levelInfo(data.xp);

  // ゲーム別記録
  const g = data.games[gameId] || { best: 0, bestCombo: 0, bestCorrect: 0 };
  const prevBest = g.best;
  g.best = Math.max(g.best, score);
  g.bestCorrect = Math.max(g.bestCorrect || 0, correctCount);
  g.bestCombo = Math.max(g.bestCombo, maxCombo);
  /* ★ 正確さの自己ベストも残す（追加のみ。古いデータは undefined → || 0 で読む）。
     その回の文脈だけで判定していた称号は、条件を満たしたのに
     ノーカウントの回だったりすると二度と取れなくなっていた。
     記録しておけば、あとから遡って解放できる。 */
  const answeredNow = correctCount + wrongCount;
  const accNow = answeredNow > 0 ? Math.round((correctCount / answeredNow) * 100) : 0;
  if (correctCount >= 12) g.bestAcc = Math.max(g.bestAcc || 0, accNow);
  if (correctCount >= 20) g.bestAcc20 = Math.max(g.bestAcc20 || 0, accNow);
  if (wrongCount === 0 && skipped <= 2) g.bestPerfect = Math.max(g.bestPerfect || 0, correctCount);
  data.games[gameId] = g;
  data.stats.plays++;

  // 教科別ベスト
  const subj = subjectOf(location.pathname);
  if (subj) {
    data.subjects[subj] = Math.max(data.subjects[subj] || 0, score);
    if (!data.subjectsC) data.subjectsC = {};
    data.subjectsC[subj] = Math.max(data.subjectsC[subj] || 0, correctCount);
  }

  // ストリーク（連続プレイ日数）
  if (data.streak.last !== today) {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    data.streak.count = data.streak.last === yesterday ? data.streak.count + 1 : 1;
    data.streak.last = today;
  }

  // XP計算（成果ベース。プレイ回数による減衰なし）
  // ノーミスは「見送りを乱用していない」ことが条件。わかる問題だけ置いて
  // 誤答ゼロにするのは、正確さではなく回避なので
  const noMissBonus = wrongCount === 0 && skipped <= 2 && score >= 1000 ? 30 : 0;
  // 正確さボーナスはXPにだけ乗せる。スコアに足すと整合性チェックで
  // プレイ丸ごと無効になるので絶対に触らない
  const answered = correctCount + wrongCount;
  const acc = answered > 0 ? correctCount / answered : 1;
  const accBonus = correctCount >= 12
    ? (acc >= 0.95 ? 40 : acc >= 0.9 ? 25 : acc >= 0.8 ? 10 : 0)
    : 0;
  let xpGained = Math.max(1, Math.round(score / 50 + noMissBonus + accBonus));

  // 今日のチャレンジ達成判定
  let challengeCleared = false;
  const ch = getTodayChallengeRaw();
  if (ch.t === gameId && correctCount >= ch.goal && !(data.challenge.date === today && data.challenge.done)) {
    data.challenge = { date: today, done: true };
    data.stats.challengeDone++;
    xpGained += 50;
    challengeCleared = true;
  }

  data.xp += xpGained;

  // 間違いノートへ追加（カウント対象プレイのみ）
  if (wrongItems && wrongItems.length) {
    for (const it of wrongItems) {
      const found = data.note.find((n) => n.g === gameId && n.w === it.word);
      if (found) found.n = Math.min(found.n + 1, 99);
      else {
        data.note.push({ g: gameId, w: it.word, t: it.correctType, s: it.sentence || "", n: 1 });
        if (data.note.length > NOTE_MAX) data.note.shift();
      }
    }
  }

  // バッジ判定
  const newBadges = evalBadges(data, { score, wrongCount, maxCombo, correctCount, skipped });

  const after = levelInfo(data.xp);
  save(data);

  return {
    valid: true,
    counted: true,
    xpGained,
    levelBefore: before.level,
    levelAfter: after.level,
    levelUp: after.level > before.level,
    levelPct: after.pct,
    newBadges,
    bestUpdated: score > prevBest,
    prevBest,
    best: g.best,
    streak: data.streak.count,
    challengeCleared,
  };
}

/* recordPlay 内部用（load を二重にしない素の版） */
function getTodayChallengeRaw() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  let x = seed;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >> 7)) >>> 0;
  x = (x ^ (x << 17)) >>> 0;
  const game = GAME_LIST[x % GAME_LIST.length];
  const goal = CHALLENGE_GOALS[(x >>> 3) % CHALLENGE_GOALS.length];
  return { ...game, goal };
}
