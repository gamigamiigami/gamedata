//ここのファイルは分類させたい単語(word)と、その分類(type)を下の例に従って入力
// wordData.js
const wordData = [
  // 単体（１種類の元素のみからなる物質）
  { word: "O₂", type: "単体", explanation: "酸素Oだけ1種類の元素でできている→単体" }, // 酸素
  { word: "H₂", type: "単体", explanation: "水素Hだけでできている→単体" }, // 水素
  { word: "N₂", type: "単体", explanation: "窒素Nだけでできている→単体" }, // 窒素
  { word: "Cl₂", type: "単体", explanation: "塩素Clだけでできている→単体" }, // 塩素
  { word: "Fe", type: "単体", explanation: "鉄。1種類の元素だけ→単体" }, // 鉄
  { word: "Cu", type: "単体", explanation: "銅。1種類の元素だけ→単体" }, // 銅
  { word: "Mg", type: "単体", explanation: "マグネシウム。1種類の元素だけ→単体" }, // マグネシウム
  { word: "Ag", type: "単体", explanation: "銀。1種類の元素だけ→単体" }, // 銀

  // 化合物（２種類以上の元素が結合してできた物質）
  { word: "H₂O", type: "化合物", explanation: "水素Hと酸素Oの2種類が結びついている→化合物" }, // 水
  { word: "CO₂", type: "化合物", explanation: "炭素Cと酸素Oの2種類→化合物" }, // 二酸化炭素
  { word: "NaCl", type: "化合物", explanation: "ナトリウムNaと塩素Clの2種類→化合物（食塩）" }, // 塩化ナトリウム（食塩）
  { word: "HCl", type: "化合物", explanation: "水素Hと塩素Clの2種類→化合物（塩化水素）" }, // 塩酸
  { word: "NH₃", type: "化合物", explanation: "窒素Nと水素Hの2種類→化合物（アンモニア）" }, // アンモニア
  { word: "H₂SO₄", type: "化合物", explanation: "水素H・硫黄S・酸素Oの3種類→化合物（硫酸）" }, // 硫酸
  { word: "CuO", type: "化合物", explanation: "銅Cuと酸素Oの2種類→化合物（酸化銅）" }, // 酸化銅
  { word: "Ag₂O", type: "化合物", explanation: "銀Agと酸素Oの2種類→化合物（酸化銀）" }, // 酸化銀
  { word: "NaHCO₃", type: "化合物", explanation: "Na・H・C・Oの4種類→化合物（炭酸水素ナトリウム＝重そう）" }, // 炭酸水素ナトリウム
  { word: "Na₂CO₃", type: "化合物", explanation: "Na・C・Oの3種類→化合物（炭酸ナトリウム）" }, // 炭酸ナトリウム
  { word: "FeS", type: "化合物", explanation: "鉄Feと硫黄Sの2種類→化合物（硫化鉄）" }, // 硫化鉄
  { word: "MgO", type: "化合物", explanation: "マグネシウムMgと酸素Oの2種類→化合物（酸化マグネシウム）" }, // 酸化マグネシウム
  { word: "BaCl₂", type: "化合物", explanation: "バリウムBaと塩素Clの2種類→化合物（塩化バリウム）" }, // 塩化バリウム
  { word: "BaSO₄", type: "化合物", explanation: "Ba・S・Oの3種類→化合物。白い沈殿として有名（硫酸バリウム）" }, // 硫酸バリウム
];

export default wordData; // エクスポートは1回だけ
