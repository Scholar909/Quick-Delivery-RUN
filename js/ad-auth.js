// ad-auth.js
import { auth, db } from './firebase.js';
import {
  signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import {
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.login-card');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = form.querySelector('input[type="email"]').value.trim();
    const password = form.querySelector('input[type="password"]').value;

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 🔍 Check Firestore role
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();

        if (data.role === "admin") {
          // ✅ Only admins can continue
          window.location.href = "./admin/dashboard.html";
        } else {
          alert("You do not have admin access.");
          await auth.signOut();
        }
      } else {
        alert("No role found for this account.");
        await auth.signOut();
      }

    } catch (err) {
      console.error(err);
      alert('Login failed. Please check your credentials.');
    }
  });
});

