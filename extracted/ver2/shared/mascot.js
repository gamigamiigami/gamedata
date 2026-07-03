/* ==========================================================
   相棒キャラクター「ソルティ」
   - 仕分け(sort)ゲームの相棒。インラインSVGで自作（外部素材なし）
   - mood: normal | happy | cheer | sad | think
   - レベルで見た目が進化: 5+ハチマキ / 10+キャップ / 20+王冠
   ========================================================== */

export function mascotSVG({ mood = "normal", level = 1, size = 96 } = {}) {
  const face = FACES[mood] || FACES.normal;
  const gear = gearFor(level);
  const arms = mood === "cheer" ? ARMS_UP : ARMS_DOWN;

  return `
<svg width="${size}" height="${size}" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ソルティ">
  <defs>
    <radialGradient id="sltBody" cx="42%" cy="34%" r="75%">
      <stop offset="0%" stop-color="#ffe873"/>
      <stop offset="60%" stop-color="#fed000"/>
      <stop offset="100%" stop-color="#e0a800"/>
    </radialGradient>
  </defs>
  <!-- 影 -->
  <ellipse cx="60" cy="108" rx="30" ry="6" fill="rgba(0,0,0,.28)"/>
  <!-- 足 -->
  <ellipse cx="46" cy="102" rx="10" ry="6" fill="#e0a800"/>
  <ellipse cx="74" cy="102" rx="10" ry="6" fill="#e0a800"/>
  ${arms}
  <!-- 体 -->
  <circle cx="60" cy="64" r="40" fill="url(#sltBody)" stroke="#c79400" stroke-width="2"/>
  <!-- ほっぺ -->
  <ellipse cx="38" cy="72" rx="6.5" ry="4.5" fill="#ff9d5c" opacity=".55"/>
  <ellipse cx="82" cy="72" rx="6.5" ry="4.5" fill="#ff9d5c" opacity=".55"/>
  ${face}
  ${gear}
</svg>`;
}

/* 表情（目・口） */
const FACES = {
  normal: `
  <circle cx="46" cy="60" r="5" fill="#2b2200"/>
  <circle cx="74" cy="60" r="5" fill="#2b2200"/>
  <circle cx="47.6" cy="58.4" r="1.6" fill="#fff"/>
  <circle cx="75.6" cy="58.4" r="1.6" fill="#fff"/>
  <path d="M52 78 Q60 84 68 78" stroke="#2b2200" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  happy: `
  <path d="M41 60 Q46 54 51 60" stroke="#2b2200" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M69 60 Q74 54 79 60" stroke="#2b2200" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M50 76 Q60 88 70 76 Z" fill="#7a3a00" stroke="#2b2200" stroke-width="2.5" stroke-linejoin="round"/>`,
  cheer: `
  <path d="M42 62 L46 56 L50 62 L46 60 Z" fill="#2b2200"/>
  <path d="M70 62 L74 56 L78 62 L74 60 Z" fill="#2b2200"/>
  <path d="M43 57 l3 -4 3 4 -3 2 Z" fill="#ffb300"/>
  <path d="M50 76 Q60 90 70 76 Z" fill="#7a3a00" stroke="#2b2200" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M24 34 l3 6 6 1 -4.5 4.5 1 6.5 -5.5 -3 -5.5 3 1 -6.5 L15 41 l6 -1 Z" fill="#fff176" stroke="#e0a800" stroke-width="1.5"/>`,
  sad: `
  <circle cx="46" cy="60" r="5" fill="#2b2200"/>
  <circle cx="74" cy="60" r="5" fill="#2b2200"/>
  <path d="M52 82 Q60 76 68 82" stroke="#2b2200" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M80 66 q3 6 0 9 q-4 -2 0 -9" fill="#58b7ff"/>`,
  think: `
  <circle cx="46" cy="60" r="5" fill="#2b2200"/>
  <path d="M69 60 Q74 57 79 60" stroke="#2b2200" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M54 79 L68 79" stroke="#2b2200" stroke-width="3" stroke-linecap="round"/>`,
};

/* 腕 */
const ARMS_DOWN = `
  <ellipse cx="24" cy="74" rx="7" ry="10" fill="#fed000" stroke="#c79400" stroke-width="2" transform="rotate(18 24 74)"/>
  <ellipse cx="96" cy="74" rx="7" ry="10" fill="#fed000" stroke="#c79400" stroke-width="2" transform="rotate(-18 96 74)"/>`;
const ARMS_UP = `
  <ellipse cx="22" cy="46" rx="7" ry="11" fill="#fed000" stroke="#c79400" stroke-width="2" transform="rotate(-35 22 46)"/>
  <ellipse cx="98" cy="46" rx="7" ry="11" fill="#fed000" stroke="#c79400" stroke-width="2" transform="rotate(35 98 46)"/>`;

/* レベル装備 */
function gearFor(level) {
  if (level >= 20) {
    // 王冠
    return `
  <path d="M42 30 L48 18 L56 27 L60 14 L64 27 L72 18 L78 30 Q60 24 42 30 Z"
        fill="#ffd700" stroke="#b8860b" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="48" cy="20" r="2.4" fill="#ff5d5d"/>
  <circle cx="60" cy="16" r="2.4" fill="#58b7ff"/>
  <circle cx="72" cy="20" r="2.4" fill="#3ecf8e"/>`;
  }
  if (level >= 10) {
    // キャップ
    return `
  <path d="M38 36 Q60 12 82 36 L82 40 Q60 30 38 40 Z" fill="#e53935" stroke="#9c1f1c" stroke-width="2"/>
  <path d="M78 37 Q94 36 96 42 Q84 44 78 41 Z" fill="#e53935" stroke="#9c1f1c" stroke-width="2"/>
  <circle cx="60" cy="22" r="3" fill="#fff"/>`;
  }
  if (level >= 5) {
    // ハチマキ
    return `
  <path d="M22 52 Q60 38 98 52 L98 58 Q60 44 22 58 Z" fill="#fff" stroke="#c8cdd6" stroke-width="1.5"/>
  <circle cx="60" cy="49" r="4" fill="#e53935"/>`;
  }
  // 芽（レベル1〜4）
  return `
  <path d="M60 26 Q59 18 52 15 Q60 14 62 21 Q64 13 72 12 Q68 21 61 23 Z" fill="#3ecf8e" stroke="#1f9e66" stroke-width="1.5"/>
  <line x1="60" y1="24" x2="60" y2="29" stroke="#1f9e66" stroke-width="2.5" stroke-linecap="round"/>`;
}

/* 状況に合わせたセリフ */
export function mascotComment(kind, extra = {}) {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  switch (kind) {
    case "best":
      return pick(["自己ベスト更新！すごい！", "新記録だ！つぎも狙おう！", "きみ、天才かも…！"]);
    case "levelup":
      return pick([`レベル${extra.level}になった！やったね！`, "パワーアップした気がする！", "つよくなってる！"]);
    case "badge":
      return pick(["新しい称号ゲット！", "コレクションが増えたよ！", "これは自慢できる…！"]);
    case "good":
      return pick(["ナイスプレイ！", "いい調子！", "その調子！"]);
    case "miss":
      return pick(["間違えた問題はノートに書いといたよ！", "つぎは克服できるよ！", "間違いは伸びしろ！"]);
    case "nocount":
      return pick(["もうちょっと長くプレイしてみよう！", "5問以上正解でXPがもらえるよ！"]);
    case "welcome":
      return pick(["今日もいっしょにがんばろう！", "どのゲームにする？", "まってたよ！"]);
    case "challenge":
      return pick(["今日のチャレンジ、達成！おめでとう！", "ミッションクリア！かっこいい！"]);
    default:
      return "がんばろう！";
  }
}
