// ad-auth.js
import { auth, signInWithEmailAndPassword } from "../js/firebase.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".login-card");
  const emailInput = form.querySelector('input[type="email"]');
  const passwordInput = form.querySelector('input[type="password"]');

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Optional: Check if email belongs to an admin (hardcoded or role-based check)
      // Redirect to admin dashboard
      window.location.href = "../admin/dashboard.html";
    } catch (error) {
      console.error("Login Error:", error.message);
      alert("Invalid credentials or network issue.");
    }
  });
});