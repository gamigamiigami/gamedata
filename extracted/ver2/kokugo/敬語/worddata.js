// 敬語仕分けゲーム の問題データ（word=落ちてくる言葉, type=分類）
// 尊敬語=相手の動作を高める / 謙譲語=自分の動作をへりくだる / 丁寧語=です・ます・ございます
const wordData = [
  // 尊敬語
  { word: "いらっしゃる", type: "尊敬語", explanation: "「行く・来る・いる」の尊敬語。相手の動作を高める" },
  { word: "おっしゃる", type: "尊敬語", explanation: "「言う」の尊敬語。相手が言うときに使う" },
  { word: "召し上がる", type: "尊敬語", explanation: "「食べる・飲む」の尊敬語。相手が食べるときに使う" },
  { word: "ご覧になる", type: "尊敬語", explanation: "「見る」の尊敬語。相手が見るときに使う" },
  { word: "なさる", type: "尊敬語", explanation: "「する」の尊敬語。相手がするときに使う" },
  { word: "くださる", type: "尊敬語", explanation: "「くれる」の尊敬語。相手がくれるときに使う" },
  { word: "お越しになる", type: "尊敬語", explanation: "「来る」の尊敬語。「お〜になる」の形は尊敬語" },
  { word: "お読みになる", type: "尊敬語", explanation: "「お〜になる」の形は尊敬語の目印" },
  { word: "お書きになる", type: "尊敬語", explanation: "「お〜になる」の形は尊敬語の目印" },
  { word: "先生が話される", type: "尊敬語", explanation: "「れる・られる」を付けて相手の動作を高める尊敬語" },
  { word: "お使いになる", type: "尊敬語", explanation: "「お〜になる」の形は尊敬語の目印" },
  { word: "おいでになる", type: "尊敬語", explanation: "「行く・来る・いる」の尊敬語" },

  // 謙譲語
  { word: "伺う", type: "謙譲語", explanation: "「行く・聞く・たずねる」の謙譲語。自分がへりくだる" },
  { word: "申す", type: "謙譲語", explanation: "「言う」の謙譲語。自分が言うときに使う" },
  { word: "申し上げる", type: "謙譲語", explanation: "「言う」の謙譲語。相手に対して自分がへりくだる" },
  { word: "いただく", type: "謙譲語", explanation: "「もらう・食べる」の謙譲語。自分がもらうときに使う" },
  { word: "拝見する", type: "謙譲語", explanation: "「見る」の謙譲語。自分が見るときに使う" },
  { word: "いたす", type: "謙譲語", explanation: "「する」の謙譲語。自分がするときに使う" },
  { word: "差し上げる", type: "謙譲語", explanation: "「あげる」の謙譲語。自分があげるときに使う" },
  { word: "お目にかかる", type: "謙譲語", explanation: "「会う」の謙譲語。自分が会うときに使う" },
  { word: "参る", type: "謙譲語", explanation: "「行く・来る」の謙譲語。自分が行くときに使う" },
  { word: "承る", type: "謙譲語", explanation: "「聞く・引き受ける」の謙譲語" },
  { word: "存じる", type: "謙譲語", explanation: "「知る・思う」の謙譲語。自分が知っているときに使う" },
  { word: "お届けする", type: "謙譲語", explanation: "「お〜する」の形は謙譲語の目印（「お〜になる」は尊敬語）" },

  // 丁寧語
  { word: "行きます", type: "丁寧語", explanation: "「ます」を付けて聞き手に丁寧に言う丁寧語" },
  { word: "学校です", type: "丁寧語", explanation: "「です」を付けて丁寧に言う丁寧語" },
  { word: "ございます", type: "丁寧語", explanation: "「ある」の丁寧語。聞き手への丁寧な言い方" },
  { word: "読みました", type: "丁寧語", explanation: "「ました」＝「ます」の過去形。丁寧語" },
  { word: "食べます", type: "丁寧語", explanation: "「ます」を付ける丁寧語。誰の動作かは関係ない" },
  { word: "静かです", type: "丁寧語", explanation: "「です」を付ける丁寧語" },
  { word: "見ます", type: "丁寧語", explanation: "「ます」を付ける丁寧語。「ご覧になる(尊敬)」「拝見する(謙譲)」と区別" },
  { word: "ありました", type: "丁寧語", explanation: "「ます・です」の形は丁寧語" },
  { word: "帰ります", type: "丁寧語", explanation: "「ます」を付ける丁寧語" },
  { word: "こちらです", type: "丁寧語", explanation: "「です」を付ける丁寧語" },
  { word: "書きます", type: "丁寧語", explanation: "「ます」を付ける丁寧語。「お書きになる(尊敬)」と区別" },
  { word: "そうです", type: "丁寧語", explanation: "「です」を付ける丁寧語" },
];

export default wordData;
