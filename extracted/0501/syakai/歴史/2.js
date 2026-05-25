document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".portal-button");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const url = button.getAttribute("data-url");

      if (!url) {
        alert("Coming Soon");
        return;
      }

      // 特定のボタン（ ? ボタン）のみパスワードを要求
      if (url === "others/trhu/index.html") {
        const password = prompt("パスワードを入力してください:");
        if (password !== "tetrishu") { // 設定したいパスワードに変更
          alert("パスワードが違います。");
          return;
        }
      }

      // 正しいパスワードなら遷移
      window.location.href = url;
    });
  });
});
