/* ==========================================================
   shared/mastery.js — 問題ごとの習熟モデル
   ----------------------------------------------------------
   ねらい
   - デッキ（山札）方式にして「出ない問題」をなくす
   - 間違えた問題は 4〜8問あけて戻す（直後だと覚え直しではなく“見え”で通ってしまう）
   - 覚えた問題は出番を減らす。ただし消しはしない
   - 保存は ver2_progress とは別キー。壊れてもXPや称号は無傷、ゲームも止まらない
   ========================================================== */

const KEY = "ver2_mastery";
const VER = 1;

const MAX_GAMES = 60;             // 先生の自作ゲームで無限に増えないように
const MAX_ITEMS_PER_GAME = 400;
const MAX_BYTES = 192 * 1024;

const MIN_DECK_FOR_THIN = 8;      // 7問しかないゲームは間引かない
const THIN_P = [1, 1, 0.7, 0.45, 0.3, 0.2, 0.2, 0.2]; // 連続正解数 → 出題確率
const MAX_SKIPS = 4;              // 確率に任せず「5周に1回は必ず出す」を保証する
const MASTER_AT = 3;              // 連続3回正解で「覚えた」

/* ---------- 1問の状態を uint16 に詰める ----------
   0-2 連続正解 / 3-7 累計正解 / 8-11 累計誤答 / 12 配布済みフラグ / 13-15 間引き連続回数 */
const gS = (v) => v & 7;
const gR = (v) => (v >> 3) & 31;
const gW = (v) => (v >> 8) & 15;
const gP = (v) => (v >> 12) & 1;
const gK = (v) => (v >> 13) & 7;
const pack = (s, r, w, p, k) =>
  Math.min(s, 7) | (Math.min(r, 31) << 3) | (Math.min(w, 15) << 8) |
  ((p & 1) << 12) | (Math.min(k, 7) << 13);

/* ---------- 問題の同一性 ----------
   word だけでは足りない：
   - 品詞比較の「ない」は形容詞と助動詞で別問題（type が要る）
   - math/sign は word を持たず expr のみ（84問が2キーに潰れる）
   - 示準化石イラスト版は img のみ
   完全に同じ行が2つある場合（同じ語・同じ分類）は同じ問題なので統合してよい */
const SEP = "\u0001";   // 本文に現れない区切り。連結だけだと別問題が同一視される
function canon(it) {
  if (!it) return "";
  return (it.word != null ? it.word : it.expr != null ? it.expr : "") + SEP +
    (it.type != null ? it.type : "") + SEP +
    (it.sentence != null ? it.sentence : "") + SEP +
    (it.img != null ? it.img : "");
}
function hash36(s) {
  let h = 0x811c9dc5;                       // FNV-1a 32bit
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

/* ---------- 保存（絶対に例外を投げない） ---------- */
let db = null;
let dirty = false;
let writable = true;

const day = () => Math.floor(Date.now() / 86400000);

function loadDB() {
  if (db) return db;
  db = { v: VER, g: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.v === VER && o.g && typeof o.g === "object") db = o;
    }
  } catch (e) { /* 壊れていたら空から始める。他のキーには触らない */ }
  return db;
}

function evictOldest(d) {
  let oldest = null, t = Infinity;
  for (const id of Object.keys(d.g)) {
    const gt = d.g[id].t || 0;
    if (gt < t) { t = gt; oldest = id; }
  }
  if (oldest) delete d.g[oldest];
  return !!oldest;
}

export function flush() {
  if (!dirty || !writable) return;
  try {
    const d = loadDB();
    const ids = Object.keys(d.g);
    if (ids.length > MAX_GAMES) {
      ids.sort((a, b) => (d.g[a].t || 0) - (d.g[b].t || 0));
      for (let i = 0; i < ids.length - MAX_GAMES; i++) delete d.g[ids[i]];
    }
    let s = JSON.stringify(d);
    let guard = 0;
    while (s.length * 2 > MAX_BYTES && guard++ < 8 && evictOldest(d)) s = JSON.stringify(d);
    localStorage.setItem(KEY, s);
    dirty = false;
  } catch (e) {
    writable = false;   // 容量オーバーやプライベートモード。以後は静かに諦める
  }
}

if (typeof document !== "undefined") {
  const bye = () => { try { flush(); } catch (e) {} };
  document.addEventListener("visibilitychange", () => { if (document.hidden) bye(); });
  window.addEventListener("pagehide", bye);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
}

/* ---------- デッキ ---------- */

/**
 * @param {string} gameId
 * @param {Array}  items   正規化済みの出題データ
 * @param {{groupKey?:string, boost?:Set<string>}} opts
 *   groupKey … "pairId" を渡すとペア単位で配る（品詞比較）
 *   boost    … 間違いノートにある語。間引かず、周回の前方に寄せる
 */
export function createDeck(gameId, items, opts) {
  try {
    return buildDeck(gameId, items, opts || {});
  } catch (e) {
    return nullDeck(items);       // 何が起きても素の抽選に落ちる
  }
}

function nullDeck(items) {
  const pool = Array.isArray(items) ? items : [];
  return {
    degraded: true,
    next() { return pool.length ? pool[(Math.random() * pool.length) | 0] : undefined; },
    recordAnswer() {},
    snapshot() { return { degraded: true, total: pool.length, seen: 0, mastered: 0 }; },
    flush() {},
  };
}

function buildDeck(gameId, items, opts) {
  if (!Array.isArray(items) || items.length === 0) return nullDeck(items);

  const d = loadDB();
  const gk = opts.groupKey || null;
  let g = d.g[gameId];
  if (!g) g = d.g[gameId] = { t: day(), p: 0, i: {}, c: {}, k: {} };
  if (!g.i) g.i = {};
  if (!g.c) g.c = {};
  if (!g.k) g.k = {};
  g.t = day();

  /* --- 配る単位（ユニット）を組む --- */
  const byId = new Map();
  const byItem = new Map();
  const units = [];
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const uid = gk && it[gk] !== undefined ? gk + ":" + it[gk] : canon(it);
    let u = byId.get(uid);
    if (!u) {
      u = { key: hash36(uid), members: [], rep: false, conf: false, boost: false };
      byId.set(uid, u);
      units.push(u);
    }
    u.members.push(it);
    byItem.set(it, u);
  }
  if (units.length > MAX_ITEMS_PER_GAME) units.length = MAX_ITEMS_PER_GAME;

  /* 先生が問題を編集した場合、消えた問題の記録を掃除する */
  const alive = new Set(units.map((u) => u.key));
  for (const k of Object.keys(g.i)) if (!alive.has(k)) { delete g.i[k]; dirty = true; }

  const boost = opts.boost instanceof Set ? opts.boost : null;
  if (boost && boost.size) {
    for (const u of units) {
      if (u.members.some((m) => m && boost.has(m.word))) u.boost = true;
    }
  }

  const st = (u) => g.i[u.key] | 0;
  const set = (u, v) => { g.i[u.key] = v; dirty = true; };

  let bag = [];
  let due = [];
  let drawn = 0;
  let last = null;
  let cycles = 0;

  /* この周回でまだ配っていないか。間引き判定もここで行う */
  function eligible(u, ignoreThin) {
    const v = st(u);
    if (gP(v) === g.p) return false;
    if (ignoreThin || u.boost || units.length < MIN_DECK_FOR_THIN) return true;
    const s = gS(v);
    if (s < 2) return true;
    if (gK(v) >= MAX_SKIPS) { set(u, pack(s, gR(v), gW(v), gP(v), 0)); return true; }
    if (Math.random() < THIN_P[s]) return true;
    set(u, pack(s, gR(v), gW(v), gP(v), gK(v) + 1));
    return false;
  }

  function rebuild() {
    bag.length = 0;
    for (const u of units) if (eligible(u)) bag.push(u);
    if (bag.length === 0) {
      g.p ^= 1; cycles++; dirty = true;            // 一周した → 全問を未配布に戻す
      for (const u of units) if (eligible(u)) bag.push(u);
    }
    if (bag.length === 0) {                        // 最後の保険（全部間引かれた場合）
      for (const u of units) if (eligible(u, true)) bag.push(u);
    }
    if (bag.length === 0) bag = units.slice();
    shuffle(bag);
    if (boost && boost.size) {                     // ノートの問題を前方1/3へ
      const head = [], tail = [];
      for (const u of bag) (u.boost ? head : tail).push(u);
      if (head.length && tail.length) {
        shuffle(head);
        const cut = Math.max(1, Math.floor(tail.length / 3));
        bag = tail.slice(0, cut).concat(head, tail.slice(cut));
      }
    }
  }
  rebuild();

  function schedule(u, lo, hi) {
    const at = drawn + lo + ((Math.random() * (hi - lo + 1)) | 0);
    let i = 0;
    while (i < due.length && due[i].at <= at) i++;
    due.splice(i, 0, { u, at });
    if (due.length > 24) due.length = 24;
  }

  return {
    degraded: false,

    next() {
      drawn++;
      let pick = null;
      for (let i = 0; i < due.length; i++) {
        if (due[i].at <= drawn && due[i].u !== last) {
          pick = due.splice(i, 1)[0].u;
          pick.rep = true;
          break;
        }
      }
      if (!pick) {
        if (!bag.length) rebuild();
        pick = bag.pop();
        if (pick === last && bag.length) {          // 同じ問題の連続を禁止
          const j = (Math.random() * bag.length) | 0;
          const t = bag[j]; bag[j] = pick; pick = t;
        }
        pick.rep = false;
      }
      const v = st(pick);
      set(pick, pack(gS(v), gR(v), gW(v), g.p, 0));
      last = pick;
      return pick.members[0];
    },

    /** reason: "drop"（自分で誤った場所へ入れた）/ "timeout"（見送り） */
    recordAnswer(item, correct, reason) {
      const u = byItem.get(item);
      if (!u) return;
      const v = st(u);
      let s = gS(v), r = gR(v), w = gW(v);

      if (correct) {
        // ヒントを見て正解した回は「覚えた」に数えない。
        // 数えてしまうと、ヒントが外れる → 解けない → またヒント、を繰り返すことになる
        if (reason !== "hinted") s = Math.min(s + 1, 7);
        r = Math.min(r + 1, 31);
        bump(g.c, item.type, 0);
        bump(g.k, item.category, 0);
        // 一度間違えた問題は、正解できても後半でもう一度出して定着を確認する
        if (u.rep && !u.conf && s < MASTER_AT) { u.conf = true; schedule(u, 12, 20); }
      } else {
        s = 0;
        if (reason !== "timeout") {                 // 見送りは正答率を汚さない
          w = Math.min(w + 1, 15);
          bump(g.c, item.type, 1);
          bump(g.k, item.category, 1);
        }
        schedule(u, u.rep ? 3 : 4, u.rep ? 6 : 8);
      }
      set(u, pack(s, r, w, gP(v), gK(v)));
    },

    snapshot() {
      let mastered = 0, seen = 0;
      for (const u of units) {
        const v = st(u);
        if (v) seen++;
        if (gS(v) >= MASTER_AT) mastered++;
      }
      return { total: units.length, seen, mastered, drawn, cycles };
    },

    flush,
  };
}

function bump(bucket, k, i) {
  if (!k) return;
  const b = bucket[k] || (bucket[k] = [0, 0]);
  b[i] = Math.min(b[i] + 1, 9999);
  dirty = true;
}

/* ---------- 日ごとの練習量 ----------
   「今日の伸び」に正答率の差を出すのはやめた。
   1プレイ十数問では正答率は±15ポイント揺れるので、その差を「伸び」と呼ぶのは嘘になる。
   代わりに、本人が完全にコントロールできる「今日やった問題数」を見せる。 */
const DAY_KEEP = 14;
function dayStr() {
  const d = new Date();
  const p = (n) => (n < 10 ? "0" + n : "" + n);
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

export function recordDay(gameId, attempts, correct) {
  try {
    const g = loadDB().g[gameId];
    if (!g) return;
    if (!g.dy) g.dy = {};
    const k = dayStr();
    const e = g.dy[k] || (g.dy[k] = [0, 0]);
    e[0] = Math.min(e[0] + (attempts | 0), 9999);
    e[1] = Math.min(e[1] + (correct | 0), 9999);
    const keys = Object.keys(g.dy).sort();
    while (keys.length > DAY_KEEP) delete g.dy[keys.shift()];
    dirty = true;
  } catch (e) {}
}

/* ---------- ヒントの足場外し ----------
   「出す／出さない」の二択にすると、出せば思い出す前に答えが見えてしまい、
   消せば詰まった子が溺れる。だから「遅らせる」。
   まず自分で思い出す → 出てこなければ支援が来る、という流れを1問の中で作る。
   誤答すると習熟が0に戻るので、つまずいたら自動的にヒントが早く戻ってくる。 */
export function hintDelayMs(gameId, item) {
  try {
    const g = loadDB().g[gameId];
    if (!g || !g.i) return 0;
    const s = gS(g.i[hash36(canon(item))] | 0);
    if (s <= 1) return 0;        // まだ定着していない → 今までどおりすぐ出す
    if (s === 2) return 1200;
    if (s === 3) return 2200;    // 落下の終盤＝実質「詰まったら」
    return Infinity;             // 定着済み → 自動では出さない（タップで見られる）
  } catch (e) {
    return 0;
  }
}

/** 今日この教材で解いた累計（今回の分を含む）と、遊んだ日数 */
export function todayStats(gameId) {
  try {
    const g = loadDB().g[gameId];
    if (!g || !g.dy) return null;
    const e = g.dy[dayStr()];
    return {
      attempts: e ? e[0] : 0,
      correct: e ? e[1] : 0,
      days: Object.keys(g.dy).length,
    };
  } catch (e) {
    return null;
  }
}

/* ---------- 習熟メーター用（画面から呼ぶ。ゲームループからは呼ばない） ----------
   「累積正答率」ではなく「覚えた問題の割合」を出す。
   累積正答率は一度下がると戻らない指標で、序盤に苦戦した子がずっと赤いままになる。
   連続正解は誤答でリセットされるぶん、回復が素直に反映される。 */
export function masteryFor(gameId, items) {
  try {
    const g = loadDB().g[gameId];
    if (!g) return null;
    const out = { types: [], total: 0, mastered: 0, seen: 0 };
    if (!Array.isArray(items)) return out;

    const perType = new Map();
    const seenKey = new Set();
    for (const it of items) {
      const k = hash36(canon(it));
      if (seenKey.has(k)) continue;
      seenKey.add(k);
      const v = (g.i && g.i[k]) | 0;
      const t = it.type || "";
      const e = perType.get(t) || { type: t, total: 0, mastered: 0, seen: 0 };
      e.total++;
      if (v) e.seen++;
      if (gS(v) >= MASTER_AT) e.mastered++;
      perType.set(t, e);
      out.total++;
      if (v) out.seen++;
      if (gS(v) >= MASTER_AT) out.mastered++;
    }
    out.types = [...perType.values()].map((e) => {
      const b = (g.c && g.c[e.type]) || [0, 0];
      const n = b[0] + b[1];
      return Object.assign({}, e, {
        pct: e.total ? Math.round((e.mastered / e.total) * 100) : 0,
        right: b[0],
        wrong: b[1],
        acc: n ? Math.round((b[0] / n) * 100) : null,
      });
    });
    return out;
  } catch (e) {
    return null;
  }
}

/** 全ゲーム横断の弱点（マイページ用）。分類（type）単位で誤りの多い順に返す */
export function weakTypes(limit) {
  try {
    const d = loadDB();
    const rows = [];
    for (const gameId of Object.keys(d.g)) {
      const c = d.g[gameId].c || {};
      for (const type of Object.keys(c)) {
        const b = c[type];
        const n = b[0] + b[1];
        if (b[1] > 0 && n >= 3) {
          rows.push({ game: gameId, type, right: b[0], wrong: b[1], acc: Math.round((b[0] / n) * 100) });
        }
      }
    }
    rows.sort((a, b) => a.acc - b.acc || b.wrong - a.wrong);
    return rows.slice(0, limit || 5);
  } catch (e) {
    return [];
  }
}

export function resetMastery(gameId) {
  try {
    const d = loadDB();
    if (gameId) delete d.g[gameId];
    else d.g = {};
    dirty = true;
    flush();
  } catch (e) {}
}
