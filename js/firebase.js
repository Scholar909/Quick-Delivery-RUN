// Core Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";

// Firebase Auth
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

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
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// Firebase Storage (import separately)
import { getStorage } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-storage.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA8TO19Ss1Pv_8KJhdG6jOVLHU2t1rLYM4",
  authDomain: "book-run-2.firebaseapp.com",
  databaseURL: "https://book-run-2-default-rtdb.firebaseio.com",
  projectId: "book-run-2",
  storageBucket: "book-run-2.firebasestorage.app",
  messagingSenderId: "1064742306034",
  appId: "1:1064742306034:web:5d73df752242989052106b"
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
