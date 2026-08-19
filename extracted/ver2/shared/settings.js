/* ==========================================================
   shared/settings.js — 好みの保存
   ----------------------------------------------------------
   ・保存するのは「好み」だけ。学習記録（ver2_progress）には一切触れない
   ・壊れた値・localStorage無効・容量超過 — すべて黙って既定値に落ちる
   ・値の検証は読みと書きの両方で行う（手で書き換えられても壊れない）

   音まわりの設定は shared/audio.js が自前で持っている
   （鳴らす側と同じ場所にある方が食い違わない）。
   ========================================================== */

const KEY = "ver2_settings";

const DEFAULTS = Object.freeze({
  mode: "challenge",  // "challenge"（60秒チャレンジ）| "slow"（じっくり）
});

const SCHEMA = {
  mode: (v) => (v === "challenge" || v === "slow" ? v : DEFAULTS.mode),
};

let cache = null;

function read() {
  if (cache) return cache;
  const out = Object.assign({}, DEFAULTS);
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && typeof raw === "object") {
      for (const k of Object.keys(SCHEMA)) if (k in raw) out[k] = SCHEMA[k](raw[k]);
    }
  } catch (e) { /* 壊れていたら既定値のまま */ }
  cache = out;
  return cache;
}

export function getSettings() { return Object.assign({}, read()); }

export function getSetting(key) {
  const s = read();
  return key in s ? s[key] : undefined;
}

export function setSetting(key, value) {
  if (!(key in SCHEMA)) return getSettings();
  const cur = read();
  const v = SCHEMA[key](value);
  if (cur[key] === v) return getSettings();
  cache = Object.assign({}, cur, { [key]: v });
  // プライベートモードや容量超過でも落とさない（その回はメモリ上だけで有効）
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {}
  return getSettings();
}
