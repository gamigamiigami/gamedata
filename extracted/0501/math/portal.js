document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".portal-button");

  const group1 = [0, 3, 4];
  const group2 = [2, 5, 6];

  group1.forEach((index) => {
    if (buttons[index]) {
      setTimeout(() => { buttons[index].classList.add("visible"); }, 0);
    }
  });
  group2.forEach((index) => {
    if (buttons[index]) {
      setTimeout(() => { buttons[index].classList.add("visible"); }, 500);
    }
  });

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const url = button.getAttribute("data-url");
      if (!url) { alert("Coming Soon"); return; }
      window.location.href = url;
    });
  });
});
