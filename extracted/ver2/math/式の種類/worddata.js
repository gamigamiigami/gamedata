// 単項式・多項式 仕分けゲーム の問題データ（word=落ちてくる言葉, type=分類）
// explanation は任意。あると間違えたときに結果画面へ解説が表示される
const wordData = [
  { "word": "3x", "type": "単項式", "explanation": "3×x のかけ算だけでできた式なので単項式" },
  { "word": "x+2", "type": "多項式", "explanation": "x と 2 が「＋」でつながれているので多項式" },
  { "word": "-5a", "type": "単項式", "explanation": "-5×a のかけ算だけの式。マイナスがついても単項式" },
  { "word": "3a-b", "type": "多項式", "explanation": "3a と b が「−」でつながれているので多項式" },
  { "word": "2xy", "type": "単項式", "explanation": "2×x×y のかけ算だけの式なので単項式" },
  { "word": "x²+2x+1", "type": "多項式", "explanation": "x²、2x、1 の3つの項が「＋」でつながれた多項式" },
  { "word": "7", "type": "単項式", "explanation": "数字1つだけの式も単項式のなかま" },
  { "word": "2x+3y", "type": "多項式", "explanation": "2x と 3y が「＋」でつながれているので多項式" },
  { "word": "-ab", "type": "単項式", "explanation": "-1×a×b のかけ算だけの式なので単項式" },
  { "word": "a+b+c", "type": "多項式", "explanation": "a、b、c の3つの項が「＋」でつながれた多項式" },
  { "word": "4x²y", "type": "単項式", "explanation": "4×x×x×y のかけ算だけの式なので単項式" },
  { "word": "x-5", "type": "多項式", "explanation": "x と 5 が「−」でつながれているので多項式" },
  { "word": "a", "type": "単項式", "explanation": "文字1つだけの式も単項式のなかま" },
  { "word": "-3x²+x", "type": "多項式", "explanation": "-3x² と x が「＋」でつながれているので多項式" },
  { "word": "0.5m", "type": "単項式", "explanation": "0.5×m のかけ算だけの式。小数がついても単項式" },
  { "word": "2a+1", "type": "多項式", "explanation": "2a と 1 が「＋」でつながれているので多項式" },
  { "word": "6ab²", "type": "単項式", "explanation": "6×a×b×b のかけ算だけの式なので単項式" },
  { "word": "5x-2y+1", "type": "多項式", "explanation": "5x、2y、1 の3つの項がつながれた多項式" },
];

export default wordData;
