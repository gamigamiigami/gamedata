/* ==========================================================
   shared/audio.js — 効果音とBGM（Web Audio で合成、音源ファイルなし）
   ----------------------------------------------------------
   ・音声ファイルを持たない＝読み込み増加ゼロ・通信ゼロ・著作権の心配なし
     （学校のネットワークやオフラインでもそのまま鳴る）
   ・AudioContext はユーザー操作の中でだけ作る（iOS対策）
   ・音でゲームを止めない。合成は全てオーディオスレッド側でスケジュールする

   安っぽく聞こえないための要点
   ・どの音も「音程の胴体」＋「短いノイズの立ち上がり」の2層。
     この立ち上がりがないと、音が“鳴り始めた”だけで“出来事”に聞こえない
   ・音量の増減は必ず指数カーブ。0で切るとプチッと鳴る
   ・全体を軽いディレイに送って「部屋の中で鳴っている」感を作る
   ・正解音はペンタトニックなので、続けて鳴らしても濁らない
   ========================================================== */

const LS = "ver2_audio";
const MODES = ["all", "sfx", "off"];   // すべて / 効果音のみ / 消音

let ctx = null;
let dead = false;
let ready = false;
let master, comp, sfxBus, bgmBus, roomIn, noiseBuf;
let live = 0;                            // 同時発音数
const lastAt = Object.create(null);      // 連打抑制

let mode = "all";
let vol = 0.65;

(function loadPrefs() {
  try {
    const o = JSON.parse(localStorage.getItem(LS) || "null");
    if (o) {
      if (MODES.indexOf(o.m) >= 0) mode = o.m;
      if (typeof o.v === "number") vol = Math.max(0, Math.min(1, o.v));
    }
  } catch (e) {}
})();
function savePrefs() {
  try { localStorage.setItem(LS, JSON.stringify({ m: mode, v: vol })); } catch (e) {}
}

const noop = () => {};
function release() { try { this.disconnect(); } catch (e) {} live--; }

/* ---------- 起動（必ずユーザー操作の中で呼ぶ） ---------- */
export function unlock() {
  if (dead) return;
  if (ctx) { if (ctx.state !== "running") ctx.resume().catch(noop); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { dead = true; return; }
    ctx = new AC();
    buildGraph();
    // iOS: 無音を1サンプル同期再生してから resume する
    const b = ctx.createBuffer(1, 1, ctx.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
    ctx.resume().catch(noop);
    ctx.onstatechange = () => { if (ctx.state !== "running") armResume(); };
    ready = true;
  } catch (e) { dead = true; ctx = null; }
}

let armed = false;
function armResume() {                     // 着信などで止まったら次のタップで復帰
  if (armed || !ctx) return;
  armed = true;
  document.addEventListener("pointerdown", () => {
    armed = false;
    if (ctx) ctx.resume().catch(noop);
  }, { once: true, capture: true });
}

function g(v) { const n = ctx.createGain(); n.gain.value = v; return n; }

function buildGraph() {
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  comp.connect(ctx.destination);

  master = g(vol); master.connect(comp);
  sfxBus = g(1.0); sfxBus.connect(master);
  bgmBus = g(0.0); bgmBus.connect(master);

  /* 初期反射だけの簡易残響。ConvolverNode より遥かに軽く、
     「その場で鳴っている」感が出て安っぽさが消える */
  roomIn = g(1.0);
  const roomOut = g(0.5);
  const dA = ctx.createDelay(0.2); dA.delayTime.value = 0.013;
  const dB = ctx.createDelay(0.2); dB.delayTime.value = 0.029;
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200;
  const fb = g(0.2);
  roomIn.connect(dA); roomIn.connect(dB);
  dA.connect(lp); dB.connect(lp);
  lp.connect(roomOut); roomOut.connect(master);
  lp.connect(fb); fb.connect(dA);

  /* ノイズ源は起動時に1度だけ作って使い回す（タイルごとの確保をゼロにする） */
  const n = Math.floor(ctx.sampleRate * 1.0);
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const ch = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
}

/* ---------- 発音のかたまり ---------- */
function tone(type, f, t, cents, peak, atk, dec, dest) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (cents) o.detune.setValueAtTime(cents, t);
  const a = ctx.createGain();
  a.gain.setValueAtTime(0.0001, t);
  a.gain.exponentialRampToValueAtTime(peak, t + atk);
  a.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec);
  o.connect(a); a.connect(dest);
  o.onended = release; live++;
  o.start(t); o.stop(t + atk + dec + 0.02);
  return o;
}
function noise(t, peak, dur, type, freq, q, dest) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
  const a = ctx.createGain();
  a.gain.setValueAtTime(0.0001, t);
  a.gain.exponentialRampToValueAtTime(peak, t + 0.002);
  a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(a); a.connect(dest);
  s.onended = release; live++;
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  return f;
}
function sweep(param, t, from, to, dur) {
  param.setValueAtTime(from, t);
  param.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
}
function send(node, amt) { const s = g(amt); node.connect(s); s.connect(roomIn); }

const PENT = [0, 2, 4, 7, 9];
function pent(i) {                        // C5基準のペンタトニック。重ねても濁らない
  const o = Math.floor(i / 5);
  const d = PENT[((i % 5) + 5) % 5];
  return 523.25 * Math.pow(2, (d + 12 * o) / 12);
}

/* ---------- 効果音 ---------- */
let seq = 0;

export function sfx(name, arg) {
  if (!ready || dead || mode === "off" || !ctx || ctx.state !== "running") return;
  if (live > 14) return;
  const t = ctx.currentTime + 0.001;
  if (t - (lastAt[name] || 0) < 0.035) return;
  lastAt[name] = t;
  try { if (VOICES[name]) VOICES[name](t, arg); } catch (e) { /* 音でゲームを壊さない */ }
}

const VOICES = {
  /* 正解。連続するほど音階が上がるが、ペンタトニックなので旋律になる */
  correct(t, combo) {
    const tier = Math.min(5, Math.floor((combo || 0) / 10));
    const f = pent(tier + (seq++ % 3) * 2);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 0.7;
    sweep(lp.frequency, t, 5200, 1400, 0.09);
    lp.connect(sfxBus); send(lp, 0.1);
    tone("triangle", f, t, -7, 0.5, 0.004, 0.086, lp);
    tone("triangle", f, t, 7, 0.5, 0.004, 0.086, lp);
    noise(t, 0.22, 0.028, "bandpass", 3200, 0.9, sfxBus);
    duck();
  },

  /* 誤答。ブザーにしない。教室で30人が使う以上、
     間違いを大きな音で晒すのは学習動機を削ぐ。短3度の下降＋低い胴鳴りに留める */
  wrong(t) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    sweep(lp.frequency, t, 1800, 600, 0.2);
    lp.connect(sfxBus); send(lp, 0.06);
    const o = tone("triangle", 320, t, 0, 0.3, 0.006, 0.19, lp);
    o.frequency.exponentialRampToValueAtTime(247, t + 0.14);
    tone("sine", 110, t, 0, 0.28, 0.006, 0.17, sfxBus);
    noise(t, 0.1, 0.04, "lowpass", 900, 1, sfxBus);
  },

  /* 見送り（触らずに落ちた）。減点ではないので、
     「今のは数えなかったよ」とだけ伝える、ごく小さな音 */
  skip(t) {
    tone("sine", 392, t, 0, 0.11, 0.006, 0.1, sfxBus);
    noise(t, 0.05, 0.03, "lowpass", 1600, 1, sfxBus);
  },

  combo(t, combo) {
    const base = Math.min(10, Math.floor((combo || 5) / 5));
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.045;
      const f = pent(base + i * 2);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      sweep(lp.frequency, tt, 2000, 7000, 0.12);
      lp.connect(sfxBus); send(lp, 0.18);
      tone("triangle", f, tt, -6, 0.34, 0.004, 0.13, lp);
      tone("triangle", f, tt, 6, 0.34, 0.004, 0.13, lp);
      tone("sine", f * 2, tt, 0, 0.08, 0.004, 0.1, lp);
      noise(tt, 0.08, 0.005, "highpass", 5000, 1, sfxBus);
    }
    duck();
  },

  tick(t) {
    tone("sine", 880, t, 0, 0.22, 0.003, 0.057, sfxBus);
    noise(t, 0.12, 0.006, "highpass", 4000, 1, sfxBus);
  },

  go(t) {
    const root = 392;
    [root, root * 1.5].forEach((f) => {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.Q.value = 1.2;
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.exponentialRampToValueAtTime(6000, t + 0.16);
      lp.frequency.exponentialRampToValueAtTime(1200, t + 0.4);
      lp.connect(sfxBus); send(lp, 0.25);
      tone("sawtooth", f, t, -8, 0.22, 0.006, 0.38, lp);
      tone("sawtooth", f, t, 8, 0.22, 0.006, 0.38, lp);
    });
    tone("sine", root / 2, t, 0, 0.2, 0.008, 0.36, sfxBus);
    const nf = noise(t, 0.15, 0.3, "bandpass", 500, 1.4, sfxBus);
    nf.frequency.exponentialRampToValueAtTime(6000, t + 0.26);
  },

  rank(t, rank) {
    const hi = rank === "S" || rank === "A";
    const root = hi ? 523.25 : 392;
    const deg = hi ? [0, 4, 7, 9, 14] : [0, 4, 7];
    deg.forEach((d, i) => {
      const tt = t + i * 0.07;
      const f = root * Math.pow(2, d / 12);
      const dur = i === deg.length - 1 ? 0.55 : 0.22;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      sweep(lp.frequency, tt, 800, 7000, 0.3);
      lp.connect(sfxBus); send(lp, 0.35);
      tone("triangle", f, tt, -6, 0.3, 0.006, dur, lp);
      tone("triangle", f, tt, 6, 0.3, 0.006, dur, lp);
    });
    noise(t + 0.1, 0.05, 0.3, "highpass", 7000, 1, sfxBus);
  },

  levelup(t) {
    [0, 4, 7, 12].forEach((d, i) => {
      const tt = t + i * 0.06;
      const f = 523.25 * Math.pow(2, d / 12);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      sweep(lp.frequency, tt, 1200, 6500, 0.2);
      lp.connect(sfxBus); send(lp, 0.3);
      tone("triangle", f, tt, -5, 0.26, 0.005, 0.25, lp);
      tone("sine", f, tt, 0, 0.16, 0.005, 0.45, lp);
      tone("sine", f * 2.76, tt, 0, 0.07, 0.004, 0.15, lp);  // 鐘らしさを出す非調和倍音
    });
    noise(t, 0.14, 0.02, "bandpass", 4000, 1, sfxBus);
  },

  /* 終了。主音に着地させる。落胆させる終わり方にしない */
  gameover(t) {
    [9, 4, 0].forEach((d, i) => {
      const tt = t + i * 0.16;
      const f = 392 * Math.pow(2, d / 12);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      sweep(lp.frequency, tt, 3000, 400, 0.5);
      lp.connect(sfxBus); send(lp, 0.28);
      tone("triangle", f, tt, -7, 0.26, 0.008, 0.45, lp);
      tone("triangle", f, tt, 7, 0.26, 0.008, 0.45, lp);
    });
    noise(t, 0.1, 0.4, "lowpass", 1200, 1, sfxBus);
  },
};

/* ---------- BGM ----------
   作曲されたループではなく、継ぎ目のない生成型にする。
   60秒を何百回も遊ぶ相手に固定ループを渡すと、必ずループ点が耳につく。
   音階はDメジャーペンタトニック、打楽器なし、音量は意図的にかなり小さい。 */
const BGM_BASE = 0.075;
const BPM = 84;
const SCALE = [293.66, 329.63, 369.99, 440.0, 493.88];
const CHORDS = [0, 3, 4, 1];

let timer = null, nextT = 0, step = 0, intensity = 0, walk = 2, chord = 0;
let padOsc = [], padLP = null, duckT = 0;

function bgmLevel() { return BGM_BASE * (0.5 + intensity * 0.35); }
function stepDur() { return intensity > 0.6 ? 60 / BPM / 4 : 60 / BPM / 2; }

/* 効果音が鳴る瞬間だけBGMを少し下げる。既製の音源を並べただけに聞こえない一番の要因 */
function duck() {
  if (!bgmBus || mode !== "all" || !timer) return;
  const t = ctx.currentTime;
  if (t - duckT < 0.05) return;
  duckT = t;
  bgmBus.gain.cancelScheduledValues(t);
  bgmBus.gain.setTargetAtTime(bgmLevel() * 0.7, t, 0.02);
  bgmBus.gain.setTargetAtTime(bgmLevel(), t + 0.12, 0.18);
}

export const bgm = {
  start(i) {
    if (!ready || dead || mode !== "all" || timer) return;
    intensity = i || 0; step = 0; walk = 2; chord = 0;
    const t = ctx.currentTime;
    padLP = ctx.createBiquadFilter();
    padLP.type = "lowpass";
    padLP.frequency.value = 500;
    padLP.Q.value = 0.5;
    const padGain = g(0.055);
    padLP.connect(padGain); padGain.connect(bgmBus);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;                       // ゆっくりした呼吸
    const lfoAmt = g(120);
    lfo.connect(lfoAmt); lfoAmt.connect(padLP.frequency);
    lfo.start(t);
    padOsc = [lfo];
    [-9, 0, 9].forEach((c) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = SCALE[0] / 2;
      o.detune.value = c;
      o.connect(padLP); o.start(t);
      padOsc.push(o);
    });
    bgmBus.gain.setTargetAtTime(bgmLevel(), t, 1.5);
    nextT = t + 0.1;
    timer = setInterval(tick, 25);
  },

  stop(fade) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = fade || 0.6;
    if (timer) { clearInterval(timer); timer = null; }
    if (bgmBus) bgmBus.gain.setTargetAtTime(0.0001, t, f / 3);
    const os = padOsc; padOsc = [];
    os.forEach((o) => { try { o.stop(t + f); } catch (e) {} });
  },

  pause() {
    if (timer) { clearInterval(timer); timer = null; }
    if (bgmBus && ctx) bgmBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
  },

  resume() {
    if (!ready || mode !== "all" || timer || !padOsc.length) return;
    nextT = ctx.currentTime + 0.05;
    bgmBus.gain.setTargetAtTime(bgmLevel(), ctx.currentTime, 0.3);
    timer = setInterval(tick, 25);
  },

  setIntensity(i) {
    intensity = Math.max(0, Math.min(1, i));
    if (!ready || !padLP || !timer) return;
    const t = ctx.currentTime;
    padLP.frequency.setTargetAtTime(500 + intensity * 400, t, 1.5);
    bgmBus.gain.setTargetAtTime(bgmLevel(), t, 1.5);
  },

  get playing() { return !!timer; },
};

function tick() {
  if (!ctx || ctx.state !== "running") return;
  /* タブが裏に回ると setInterval が1秒に間引かれ、戻った瞬間に数十音が一斉に鳴る。
     必ず現在時刻に貼り直す */
  if (nextT < ctx.currentTime - 0.5) nextT = ctx.currentTime + 0.05;
  const ahead = ctx.currentTime + 0.25;
  while (nextT < ahead) { schedule(step++, nextT); nextT += stepDur(); }
}

function schedule(s, t) {
  /* 大きく跳ばないランダムウォーク＝必ず旋律として聞こえる */
  const r = Math.random();
  walk += r < 0.1 ? 0 : r < 0.8 ? (Math.random() < 0.5 ? 1 : -1)
    : (Math.random() < 0.5 ? 2 : -2);
  walk = ((walk % 5) + 5) % 5;
  const f = SCALE[walk] * (s % 16 < 8 ? 1 : 2);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 2200;
  lp.connect(bgmBus);
  tone("triangle", f, t, 0, 0.05, 0.008, 0.18, lp);

  if (s % 8 === 0) tone("sine", SCALE[CHORDS[chord]] / 2, t, 0, 0.07, 0.03, 1.4, bgmBus);

  if (s % 32 === 0 && padOsc.length > 1) {         // 和音を移す（ノードは作り直さない）
    chord = (chord + 1) % CHORDS.length;
    const root = SCALE[CHORDS[chord]] / 2;
    for (let i = 1; i < padOsc.length; i++) {
      padOsc[i].frequency.setTargetAtTime(i === 2 ? root * 1.5 : root, t, 2.0);
    }
  }
  if (intensity > 0.5 && s % 2 === 1) noise(t, 0.028, 0.035, "highpass", 6000, 1, bgmBus);
}

/* ---------- 触覚（Androidのみ。iOS Safari は vibrate 非対応） ---------- */
export function buzz(ms) {
  if (mode === "off") return;
  try { if (navigator.vibrate) navigator.vibrate(ms || 18); } catch (e) {}
}

/* ---------- 設定 ---------- */
export function setMode(m) {
  if (MODES.indexOf(m) < 0) return;
  const wasPlaying = bgm.playing;
  mode = m;
  savePrefs();
  if (mode !== "all") bgm.stop(0.3);
  if (mode === "off" && ctx) ctx.suspend().catch(noop);
  if (mode !== "off" && ctx && ctx.state !== "running") ctx.resume().catch(noop);
  return { mode, wasPlaying };   // 呼び出し側がBGMを鳴らし直すか判断できるように
}
export function getMode() { return mode; }
export function nextMode() {                      // ボタン1つで循環させる用
  setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
  return mode;
}
export function modeLabel() {
  return mode === "all" ? "音: BGMあり" : mode === "sfx" ? "音: 効果音" : "音: なし";
}
export function setVolume(v) {
  vol = Math.max(0, Math.min(1, v));
  savePrefs();
  if (master && ctx) master.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
}
export function getVolume() { return vol; }
export function suspend() { if (ctx && ctx.state === "running") ctx.suspend().catch(noop); }
export function resume() { if (ctx && ctx.state !== "running") ctx.resume().catch(noop); }

export default {
  unlock, sfx, bgm, buzz,
  setMode, getMode, nextMode, modeLabel,
  setVolume, getVolume, suspend, resume,
};
