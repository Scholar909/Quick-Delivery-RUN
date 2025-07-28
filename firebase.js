// firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
  child
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCxEamPirhG2Q-W7bf_UWGf6PgP6vk-5js",
  authDomain: "book-run-2.firebaseapp.com",
  projectId: "book-run-2",
  storageBucket: "book-run-2.appspot.com",
  messagingSenderId: "1064742306034",
  appId: "1:1064742306034:web:a2490c88b854ca5652106b",
  databaseURL: "https://book-run-2-default-rtdb.firebaseio.com/"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Export services
export { app, auth, db };

// Export commonly used auth functions
export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
};

// Export commonly used database functions
export {
  ref,
  set,
  get,
  child
};