document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".portal-button");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const url = button.getAttribute("data-url");

      if (!url) {
        alert("準備中です");
        return;
      }

      // 特定のボタンのみパスワードを要求
      if (url === "others/tetrishu/index.html") {
        const password = prompt("パスワードを入力してください:");
        if (password !== "tetrishu") { // 設定したいパスワードに変更
          alert("パスワードが違います。");
          return;
        }
      }

      // 選択されていないボタンにアニメーション用のクラスを付与
      buttons.forEach((btn) => {
        if (btn !== button) {
          btn.classList.add("fade-out");
        }
      });

      // アニメーションが終わるタイミング（例:450ms）で遷移
      setTimeout(() => {
        window.location.href = url;
      }, 450);
    });
  });
});
