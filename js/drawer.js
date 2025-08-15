document.addEventListener("DOMContentLoaded", () => {
  const role = document.body.dataset.role; // Optional if you still want to differentiate
  const menuIcon = document.querySelector(".nav-item i.uil-bars");
  const drawer = document.querySelector(".drawer");
  const closeBtn = document.querySelector(".drawer .close-drawer");

  // Create and append overlay once
  let overlay = document.getElementById("drawer-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "drawer-overlay";
    document.body.appendChild(overlay);
  }

  // Open drawer
  menuIcon?.addEventListener("click", () => {
    drawer?.classList.add("active");
    overlay?.classList.add("active");
  });

  // Close drawer on X click
  closeBtn?.addEventListener("click", () => {
    drawer?.classList.remove("active");
    overlay?.classList.remove("active");
  });

  // Close drawer on overlay click
  overlay?.addEventListener("click", () => {
    drawer?.classList.remove("active");
    overlay?.classList.remove("active");
  });
});