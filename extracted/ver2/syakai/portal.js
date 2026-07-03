document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".portal-button");

   // フェードインのグループ分け
  const group1 = [1, 3, 6]; // 2つ目, 4つ目, 7つ目のボタン
  const group2 = [0, 2, 5]; // 1つ目, 3つ目, 6つ目のボタン

  // グループ1をフェードイン（開始時間 0ms）
  group1.forEach((index) => {
    if (buttons[index]) {
      setTimeout(() => {
        buttons[index].classList.add("visible");
      }, 0);
    }
  });

  // グループ2をフェードイン（500ms 遅延）
  group2.forEach((index) => {
    if (buttons[index]) {
      setTimeout(() => {
        buttons[index].classList.add("visible");
      }, 500);
    }
  });


  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const url = button.getAttribute("data-url");

      if (!url) {
        alert("準備中です");
        return;
      }

      // 特定のボタン（? ボタン）のみパスワードを要求
      if (url === "../others/tetrishu/index.html") {
        const password = prompt("パスワードを入力してください:");
        if (password !== "trhu") { // 設定したいパスワードに変更
          alert("パスワードが違います。");
          return;
        }
      }

      // 正しいパスワードなら遷移
      window.location.href = url;
    });
  });
});
