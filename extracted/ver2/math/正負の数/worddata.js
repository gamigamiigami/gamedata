// 計算結果の正負ゲーム の問題データ（word=落ちてくる計算式, type=分類）
// 計算そのものより「符号のルール」を見きわめる練習
const wordData = [
  // 正の数になる
  { word: "(-3)×(-2)", type: "正の数", explanation: "負×負＝正。答えは+6" },
  { word: "(-3)²", type: "正の数", explanation: "(-3)²＝(-3)×(-3)＝+9。カッコごと2乗すると正になる" },
  { word: "(+5)+(+3)", type: "正の数", explanation: "正＋正＝正。答えは+8" },
  { word: "(-8)÷(-2)", type: "正の数", explanation: "負÷負＝正。答えは+4" },
  { word: "(-2)×(+3)×(-4)", type: "正の数", explanation: "負の数が2個（偶数個）のかけ算→正。答えは+24" },
  { word: "(+2)-(-5)", type: "正の数", explanation: "マイナスを引く＝足すこと。2+5=+7" },
  { word: "(-1)-(-4)", type: "正の数", explanation: "-1+4=+3。マイナスを引くと足し算になる" },
  { word: "(-2)⁴", type: "正の数", explanation: "負の数の偶数乗は正。(-2)⁴=+16" },
  { word: "(-6)+(+9)", type: "正の数", explanation: "絶対値の大きい方(+9)の符号が残る。答えは+3" },
  { word: "(+7)×(+2)", type: "正の数", explanation: "正×正＝正。答えは+14" },
  { word: "(-5)×(-2)×(+1)", type: "正の数", explanation: "負の数が2個（偶数個）→正。答えは+10" },

  // 0になる
  { word: "(-4)+(+4)", type: "0", explanation: "絶対値が同じで符号が反対の数を足すと0" },
  { word: "0×(-5)", type: "0", explanation: "0に何をかけても0" },
  { word: "(-5)-(-5)", type: "0", explanation: "-5+5=0。同じ数を引くと0" },
  { word: "0÷(-3)", type: "0", explanation: "0を何で割っても0（0で割るのはダメ！）" },
  { word: "(+7)+(-7)", type: "0", explanation: "絶対値が同じで符号が反対の数の和は0" },
  { word: "(-9)+(+9)", type: "0", explanation: "絶対値が同じで符号が反対の数の和は0" },
  { word: "0×(+8)", type: "0", explanation: "0に何をかけても0" },

  // 負の数になる
  { word: "(+5)+(-8)", type: "負の数", explanation: "絶対値の大きい方(-8)の符号が残る。答えは-3" },
  { word: "-3²", type: "負の数", explanation: "-3²は「3²にマイナス」なので-9。(-3)²=+9とのちがいに注意！" },
  { word: "(-3)×(+2)", type: "負の数", explanation: "負×正＝負。答えは-6" },
  { word: "(-2)³", type: "負の数", explanation: "負の数の奇数乗は負。(-2)³=-8" },
  { word: "(-6)÷(+2)", type: "負の数", explanation: "負÷正＝負。答えは-3" },
  { word: "(-1)×(-2)×(-3)", type: "負の数", explanation: "負の数が3個（奇数個）のかけ算→負。答えは-6" },
  { word: "(+3)-(+9)", type: "負の数", explanation: "3-9=-6。引く数の方が大きいと負になる" },
  { word: "(-4)-(+3)", type: "負の数", explanation: "-4-3=-7。負からさらに引くと負" },
  { word: "(+8)÷(-4)", type: "負の数", explanation: "正÷負＝負。答えは-2" },
  { word: "-(-3)²", type: "負の数", explanation: "(-3)²=+9に外のマイナスが付いて-9" },
  { word: "(-10)+(+4)", type: "負の数", explanation: "絶対値の大きい方(-10)の符号が残る。答えは-6" },
];

export default wordData;
