// ad-auth.js
import { auth } from './firebase.js';
import {
  signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.login-card');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = form.querySelector('input[type="email"]').value.trim();
    const password = form.querySelector('input[type="password"]').value;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // ✅ Redirect to admin dashboard on successful login
      window.location.href = '/admin/dashboard.html';

    } catch (err) {
      console.error(err);
      alert('Login failed. Please check your credentials.');
    }
  });
});
