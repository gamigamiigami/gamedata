const wordData = [

  // ==================
  // 加減法
  // ==================
  { expr: "5−3",        type: "正", category: "加減法" },
  { expr: "−2＋5",      type: "正", category: "加減法" },
  { expr: "5−(−2)",     type: "正", category: "加減法" },
  { expr: "−1−(−4)",    type: "正", category: "加減法" },
  { expr: "8＋(−3)",    type: "正", category: "加減法" },
  { expr: "−3＋7",      type: "正", category: "加減法" },
  { expr: "−2−(−5)",    type: "正", category: "加減法" },
  { expr: "6−(−1)",     type: "正", category: "加減法" },
  { expr: "4＋(−2)",    type: "正", category: "加減法" },
  { expr: "−4−(−7)",    type: "正", category: "加減法" },
  { expr: "−5−(−9)",    type: "正", category: "加減法" },
  { expr: "3＋(−1)",    type: "正", category: "加減法" },

  { expr: "5−7",        type: "負", category: "加減法" },
  { expr: "−3＋1",      type: "負", category: "加減法" },
  { expr: "3−8",        type: "負", category: "加減法" },
  { expr: "−5＋2",      type: "負", category: "加減法" },
  { expr: "−1−3",       type: "負", category: "加減法" },
  { expr: "2＋(−5)",    type: "負", category: "加減法" },
  { expr: "1−4",        type: "負", category: "加減法" },
  { expr: "−2−1",       type: "負", category: "加減法" },
  { expr: "−4＋1",      type: "負", category: "加減法" },
  { expr: "3＋(−7)",    type: "負", category: "加減法" },
  { expr: "−6−(−3)",    type: "負", category: "加減法" },
  { expr: "−2−(−(−1))", type: "負", category: "加減法" },

  // ==================
  // 乗法（2数）
  // ==================
  { expr: "3×4",          type: "正", category: "乗法" },
  { expr: "(−3)×(−2)",    type: "正", category: "乗法" },
  { expr: "2×5",          type: "正", category: "乗法" },
  { expr: "(−4)×(−1)",    type: "正", category: "乗法" },
  { expr: "(−2)×(−3)",    type: "正", category: "乗法" },
  { expr: "5×3",          type: "正", category: "乗法" },
  { expr: "(−1)×(−7)",    type: "正", category: "乗法" },
  { expr: "(−5)×(−2)",    type: "正", category: "乗法" },
  { expr: "(−6)×(−3)",    type: "正", category: "乗法" },
  { expr: "4×2",          type: "正", category: "乗法" },

  { expr: "3×(−1)",       type: "負", category: "乗法" },
  { expr: "(−2)×3",       type: "負", category: "乗法" },
  { expr: "5×(−2)",       type: "負", category: "乗法" },
  { expr: "(−3)×4",       type: "負", category: "乗法" },
  { expr: "7×(−1)",       type: "負", category: "乗法" },
  { expr: "(−5)×2",       type: "負", category: "乗法" },
  { expr: "4×(−3)",       type: "負", category: "乗法" },
  { expr: "(−1)×6",       type: "負", category: "乗法" },
  { expr: "(−8)×3",       type: "負", category: "乗法" },
  { expr: "2×(−4)",       type: "負", category: "乗法" },

  // ==================
  // 3数以上の乗法
  // ==================
  { expr: "(−1)×(−2)×3",           type: "正", category: "3数以上の乗法" },
  { expr: "2×(−3)×(−2)",           type: "正", category: "3数以上の乗法" },
  { expr: "(−1)×(−1)×4",           type: "正", category: "3数以上の乗法" },
  { expr: "(−3)×2×(−2)",           type: "正", category: "3数以上の乗法" },
  { expr: "(−2)×(−2)×(−1)×(−1)",  type: "正", category: "3数以上の乗法" },
  { expr: "(−1)×(−1)×(−1)×(−1)",  type: "正", category: "3数以上の乗法" },
  { expr: "(−1)×(−3)×2×(−1)×(−1)",type: "正", category: "3数以上の乗法" },
  { expr: "3×(−2)×(−1)",           type: "正", category: "3数以上の乗法" },

  { expr: "(−2)×(−3)×(−2)",        type: "負", category: "3数以上の乗法" },
  { expr: "(−1)×2×(−3)×(−1)",      type: "負", category: "3数以上の乗法" },
  { expr: "(−1)×(−1)×(−1)",        type: "負", category: "3数以上の乗法" },
  { expr: "2×(−3)×(−1)×(−2)",      type: "負", category: "3数以上の乗法" },
  { expr: "(−1)×3×(−1)×(−2)",      type: "負", category: "3数以上の乗法" },
  { expr: "(−1)×(−1)×(−1)×2×(−1)",type: "負", category: "3数以上の乗法" },
  { expr: "(−3)×(−1)×(−2)",        type: "負", category: "3数以上の乗法" },
  { expr: "4×(−1)×(−1)×(−1)",      type: "負", category: "3数以上の乗法" },

  // ==================
  // 累乗
  // ==================
  { expr: "(−3)²",   type: "正", category: "累乗" },
  { expr: "(−2)⁴",   type: "正", category: "累乗" },
  { expr: "2³",      type: "正", category: "累乗" },
  { expr: "(−1)²",   type: "正", category: "累乗" },
  { expr: "(−5)²",   type: "正", category: "累乗" },
  { expr: "3⁴",      type: "正", category: "累乗" },
  { expr: "(−2)²",   type: "正", category: "累乗" },
  { expr: "(−1)⁴",   type: "正", category: "累乗" },
  { expr: "4²",      type: "正", category: "累乗" },
  { expr: "(−4)²",   type: "正", category: "累乗" },

  { expr: "−3²",     type: "負", category: "累乗" },
  { expr: "(−1)³",   type: "負", category: "累乗" },
  { expr: "−2³",     type: "負", category: "累乗" },
  { expr: "(−3)³",   type: "負", category: "累乗" },
  { expr: "−5²",     type: "負", category: "累乗" },
  { expr: "(−2)³",   type: "負", category: "累乗" },
  { expr: "−1⁴",     type: "負", category: "累乗" },
  { expr: "(−1)⁵",   type: "負", category: "累乗" },
  { expr: "−4²",     type: "負", category: "累乗" },
  { expr: "(−2)⁵",   type: "負", category: "累乗" },
];

export default wordData;
