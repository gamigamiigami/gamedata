document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".portal-button");

   // フェードインのグループ分け
  const group1 = [0, 3, 4]; // 1つ目, 4つ目, 5つ目のボタン
  const group2 = [2, 5, 6]; // 3つ目, 6つ目, 7つ目のボタン

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
        alert("Coming Soon");
        return;
      }

      // 特定のボタンのみパスワードを要求
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
