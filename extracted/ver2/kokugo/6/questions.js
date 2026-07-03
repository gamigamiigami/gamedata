// questions.js - 問題データファイル

/* ========== テンプレート（コピーして使ってね）==========
  {
    word: "○○（活用の種類）",
    stem: "語幹（なしは×）",
    mizen: "未然形",
    renyo: "連用形",
    shushi: "終止形",
    rentai: "連体形",
    katei: "仮定形",
    meirei: "命令形（なしは×）"
  },
  ※ 複数の答えがある場合は / で区切る（例："か/こ"）
========================================================== */

const questions = [

  // ===== 五段活用（12種類） =====
  { word: "読む（五段活用）", stem: "よ", mizen: "ま/も", renyo: "み/ん", shushi: "む", rentai: "む", katei: "め", meirei: "め" },
  { word: "話す（五段活用）", stem: "はな", mizen: "さ/そ", renyo: "し", shushi: "す", rentai: "す", katei: "せ", meirei: "せ" },
  { word: "待つ（五段活用）", stem: "ま", mizen: "た/と", renyo: "ち/っ", shushi: "つ", rentai: "つ", katei: "て", meirei: "て" },
  { word: "死ぬ（五段活用）", stem: "し", mizen: "な/の", renyo: "に/ん", shushi: "ぬ", rentai: "ぬ", katei: "ね", meirei: "ね" },
  { word: "遊ぶ（五段活用）", stem: "あそ", mizen: "ば/ぼ", renyo: "び/ん", shushi: "ぶ", rentai: "ぶ", katei: "べ", meirei: "べ" },
  { word: "泳ぐ（五段活用）", stem: "およ", mizen: "が/ご", renyo: "ぎ/い", shushi: "ぐ", rentai: "ぐ", katei: "げ", meirei: "げ" },
  { word: "買う（五段活用）", stem: "か", mizen: "わ/お", renyo: "い/っ", shushi: "う", rentai: "う", katei: "え", meirei: "え" },
  { word: "走る（五段活用）", stem: "はし", mizen: "ら/ろ", renyo: "り/っ", shushi: "る", rentai: "る", katei: "れ", meirei: "れ" },
  { word: "帰る（五段活用）", stem: "かえ", mizen: "ら/ろ", renyo: "り/っ", shushi: "る", rentai: "る", katei: "れ", meirei: "れ" },
  { word: "貸す（五段活用）", stem: "か", mizen: "さ/そ", renyo: "し", shushi: "す", rentai: "す", katei: "せ", meirei: "せ" },
  { word: "書く（五段活用）", stem: "か", mizen: "か/こ", renyo: "き/い", shushi: "く", rentai: "く", katei: "け", meirei: "け" },
  { word: "聞く（五段活用）", stem: "き", mizen: "か/こ", renyo: "き/い", shushi: "く", rentai: "く", katei: "け", meirei: "け" },

  // ===== 上一段活用（5種類） =====
  { word: "起きる（上一段活用）", stem: "お", mizen: "き", renyo: "き", shushi: "きる", rentai: "きる", katei: "きれ", meirei: "きろ/きよ" },
  { word: "落ちる（上一段活用）", stem: "お", mizen: "ち", renyo: "ち", shushi: "ちる", rentai: "ちる", katei: "ちれ", meirei: "ちろ/ちよ" },
  { word: "借りる（上一段活用）", stem: "か", mizen: "り", renyo: "り", shushi: "りる", rentai: "りる", katei: "りれ", meirei: "りろ/りよ" },
  { word: "過ぎる（上一段活用）", stem: "す", mizen: "ぎ", renyo: "ぎ", shushi: "ぎる", rentai: "ぎる", katei: "ぎれ", meirei: "ぎろ/ぎよ" },
  { word: "見る（上一段活用）", stem: "×", mizen: "み", renyo: "み", shushi: "みる", rentai: "みる", katei: "みれ", meirei: "みろ/みよ" },

  // ===== 下一段活用（5種類） =====
  { word: "受ける（下一段活用）", stem: "う", mizen: "け", renyo: "け", shushi: "ける", rentai: "ける", katei: "けれ", meirei: "けろ/けよ" },
  { word: "教える（下一段活用）", stem: "おし", mizen: "え", renyo: "え", shushi: "える", rentai: "える", katei: "えれ", meirei: "えろ/えよ" },
  { word: "答える（下一段活用）", stem: "こた", mizen: "え", renyo: "え", shushi: "える", rentai: "える", katei: "えれ", meirei: "えろ/えよ" },
  { word: "食べる（下一段活用）", stem: "た", mizen: "べ", renyo: "べ", shushi: "べる", rentai: "べる", katei: "べれ", meirei: "べろ/べよ" },
  { word: "寝る（下一段活用）", stem: "×", mizen: "ね", renyo: "ね", shushi: "ねる", rentai: "ねる", katei: "ねれ", meirei: "ねろ/ねよ" },

  // ===== カ行変格活用（1種類） =====
  { word: "来る（カ変活用）", stem: "×", mizen: "こ", renyo: "き", shushi: "くる", rentai: "くる", katei: "くれ", meirei: "こい" },

  // ===== サ行変格活用（5種類） =====
  { word: "する（サ変活用）", stem: "×", mizen: "し/せ/さ", renyo: "し", shushi: "する", rentai: "する", katei: "すれ", meirei: "しろ/せよ" },
  { word: "勉強する（サ変活用）", stem: "べんきょう", mizen: "し/せ/さ", renyo: "し", shushi: "する", rentai: "する", katei: "すれ", meirei: "しろ/せよ" },
  { word: "対する（サ変活用）", stem: "たい", mizen: "し/せ/さ", renyo: "し", shushi: "する", rentai: "する", katei: "すれ", meirei: "しろ/せよ" },
  { word: "愛する（サ変活用）", stem: "あい", mizen: "し/せ/さ", renyo: "し", shushi: "する", rentai: "する", katei: "すれ", meirei: "しろ/せよ" },
  { word: "運動する（サ変活用）", stem: "うんどう", mizen: "し/せ/さ", renyo: "し", shushi: "する", rentai: "する", katei: "すれ", meirei: "しろ/せよ" },

  // ===== 形容詞（5種類） =====
  { word: "美しい（形容詞）", stem: "うつくし", mizen: "かろ", renyo: "かっ/く/う", shushi: "い", rentai: "い", katei: "けれ", meirei: "×" },
  { word: "高い（形容詞）", stem: "たか", mizen: "かろ", renyo: "かっ/く/う", shushi: "い", rentai: "い", katei: "けれ", meirei: "×" },
  { word: "楽しい（形容詞）", stem: "たのし", mizen: "かろ", renyo: "かっ/く/う", shushi: "い", rentai: "い", katei: "けれ", meirei: "×" },
  { word: "寒い（形容詞）", stem: "さむ", mizen: "かろ", renyo: "かっ/く/う", shushi: "い", rentai: "い", katei: "けれ", meirei: "×" },
  { word: "新しい（形容詞）", stem: "あたらし", mizen: "かろ", renyo: "かっ/く/う", shushi: "い", rentai: "い", katei: "けれ", meirei: "×" },

  // ===== 形容動詞（5種類） =====
  { word: "静かだ（形容動詞）", stem: "しずか", mizen: "だろ", renyo: "だっ/で/に", shushi: "だ", rentai: "な", katei: "なら", meirei: "×" },
  { word: "元気だ（形容動詞）", stem: "げんき", mizen: "だろ", renyo: "だっ/で/に", shushi: "だ", rentai: "な", katei: "なら", meirei: "×" },
  { word: "便利だ（形容動詞）", stem: "べんり", mizen: "だろ", renyo: "だっ/で/に", shushi: "だ", rentai: "な", katei: "なら", meirei: "×" },
  { word: "きれいだ（形容動詞）", stem: "きれい", mizen: "だろ", renyo: "だっ/で/に", shushi: "だ", rentai: "な", katei: "なら", meirei: "×" },
  { word: "有名だ（形容動詞）", stem: "ゆうめい", mizen: "だろ", renyo: "だっ/で/に", shushi: "だ", rentai: "な", katei: "なら", meirei: "×" }

];

// ========== 自動変換処理（触らないでOK）==========
questions.forEach(q => {
  q.headers = ["活用形", "語幹", "未然形", "連用形", "終止形", "連体形", "仮定形", "命令形"];
  q.conjugations = {
    stem: q.stem.split("/"),
    mizen: q.mizen.split("/"),
    renyo: q.renyo.split("/"),
    shushi: q.shushi.split("/"),
    rentai: q.rentai.split("/"),
    katei: q.katei.split("/"),
    meirei: q.meirei.split("/")
  };
});
