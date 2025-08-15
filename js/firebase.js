// Core Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";

// Firebase Auth
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

// Firestore
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

// Firebase Storage (import separately)
import { getStorage } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-storage.js";

// Firebase config
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
const db = getFirestore(app);
const storage = getStorage(app); // Initialize Storage

// Export core
export { app, auth, db, storage };

// Export auth functions
export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
};

// Export Firestore utilities
export {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot
};