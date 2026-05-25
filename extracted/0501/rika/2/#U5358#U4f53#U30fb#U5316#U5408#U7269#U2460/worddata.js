//ここのファイルは分類させたい単語(word)と、その分類(type)を下の例に従って入力
// wordData.js
const wordData = [
  // 単体（１種類の元素のみからなる物質）
  { word: "O₂", type: "単体" }, // 酸素
  { word: "H₂", type: "単体" }, // 水素
  { word: "N₂", type: "単体" }, // 窒素
  { word: "Cl₂", type: "単体" }, // 塩素
  { word: "Fe", type: "単体" }, // 鉄
  { word: "Cu", type: "単体" }, // 銅
  { word: "Mg", type: "単体" }, // マグネシウム
  { word: "Ag", type: "単体" }, // 銀

  // 化合物（２種類以上の元素が結合してできた物質）
  { word: "H₂O", type: "化合物" }, // 水
  { word: "CO₂", type: "化合物" }, // 二酸化炭素
  { word: "NaCl", type: "化合物" }, // 塩化ナトリウム（食塩）
  { word: "HCl", type: "化合物" }, // 塩酸
  { word: "NH₃", type: "化合物" }, // アンモニア
  { word: "H₂SO₄", type: "化合物" }, // 硫酸
  { word: "CuO", type: "化合物" }, // 酸化銅
  { word: "Ag₂O", type: "化合物" }, // 酸化銀
  { word: "NaHCO₃", type: "化合物" }, // 炭酸水素ナトリウム
  { word: "Na₂CO₃", type: "化合物" }, // 炭酸ナトリウム
  { word: "FeS", type: "化合物" }, // 硫化鉄
  { word: "MgO", type: "化合物" }, // 酸化マグネシウム
  { word: "BaCl₂", type: "化合物" }, // 塩化バリウム
  { word: "BaSO₄", type: "化合物" }, // 硫酸バリウム
];

export default wordData; // エクスポートは1回だけ
