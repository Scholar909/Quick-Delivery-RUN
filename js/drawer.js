import { auth, db } from './firebase.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const role = document.body.dataset.role; // "admin", "merchant", or "customer"
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

  // ------------------------
  // LOGOUT FUNCTIONALITY
  // ------------------------
  document.querySelectorAll('.logout-btn').forEach(logoutBtn => {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const redirectHref = logoutBtn.getAttribute('href') || './index.html';
      try {
        await signOut(auth);
        window.location.href = redirectHref;
      } catch (err) {
        console.error("Logout failed:", err);
        alert("Logout failed. Try again.");
      }
    });
  });

  // ------------------------
  // AUTO-REDIRECT IF NOT LOGGED IN + BLOCK CHECK
  // ------------------------
  onAuthStateChanged(auth, user => {
    if (!user) {
      // Only protect pages with a role
      const pageRole = document.body.getAttribute('data-role');
      if (pageRole) {
        const logoutLink = document.querySelector('.logout-btn');
        if (logoutLink) {
          window.location.href = logoutLink.getAttribute('href');
        } else {
          window.location.href = '../index.html';
        }
      }
    } else {
      // ✅ Check if user is blocked (only for merchant/customer)
      if (role === "merchant" || role === "customer" || role === "hostel") {
        const ref = doc(db, role + "s", user.uid);
        onSnapshot(ref, snap => {
          if (snap.exists() && snap.data().active === false) {
            alert("Your account has been blocked. You will be logged out.");
            signOut(auth).then(() => {
              const logoutLink = document.querySelector('.logout-btn');
              if (logoutLink) {
                window.location.href = logoutLink.getAttribute('href');
              } else {
                window.location.href = '../index.html';
              }
            });
          }
        });
      }
    }
  });
});