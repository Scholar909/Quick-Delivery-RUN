import { auth, db } from './firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  serverTimestamp,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

// Forms & elements
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

// Utility to show messages below forms
function showMessage(form, text, type = "error") {
  let msgBox = form.querySelector(".msgBox");
  if (!msgBox) {
    msgBox = document.createElement("div");
    msgBox.className = "msgBox";
    msgBox.style.marginTop = "1rem";
    msgBox.style.textAlign = "center";
    msgBox.style.fontSize = "0.95rem";
    form.appendChild(msgBox);
  }
  msgBox.textContent = text;
  msgBox.style.color = type === "success" ? "#00ffcc" : "#ff4d4d";
}

// ===== LOGIN =====
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(loginForm, "");

  const email = loginForm["login-email"].value.trim();
  const password = loginForm["login-password"].value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Check customer role from Firestore
    const customerDocRef = doc(db, "customers", user.uid);
    const customerDocSnap = await getDoc(customerDocRef);

    if (!customerDocSnap.exists()) {
      await signOut(auth);
      showMessage(loginForm, "Account does not exist. Please sign up.");
      return;
    }

    const customerData = customerDocSnap.data();

    if (customerData.role !== "customer") {
      await signOut(auth);
      showMessage(loginForm, "Access denied: Not a customer account.");
      return;
    }

    // ======== NEW: Check if blocked or deleted ========
    if (customerData.active === false) {
      await signOut(auth);
      showMessage(loginForm, "Your account has been blocked. Please contact support.");
      return;
    }
    // ===================================================

    showMessage(loginForm, "Login successful! Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "/customer/dashboard.html"; // change as needed
    }, 1500);

  } catch (error) {
    console.error("Login error:", error);
    showMessage(loginForm, "Login failed: " + error.message);
  }
});

// ===== SIGN UP =====
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(signupForm, "");

  // Collect and normalize values
  const fullname = signupForm["signup-fullname"].value.trim();
  const usernameRaw = signupForm["signup-username"].value.trim();
  const username = usernameRaw.toLowerCase(); // lowercase
  const gender = signupForm["gender"].value;
  const email = signupForm["signup-email"].value.trim();
  const matricRaw = signupForm["signup-matric"].value.trim();
  const matric = matricRaw.toUpperCase(); // uppercase
  const room = signupForm["signup-room"].value.trim();
  const password = signupForm["signup-password"].value;
  const confirm = signupForm["signup-confirm"].value;
  const phone = signupForm["signup-phone"].value.trim();
  const termsChecked = signupForm["signup-terms"].checked;

  // Validations
  if (password !== confirm) {
    showMessage(signupForm, "Passwords do not match.");
    return;
  }
  if (!gender) {
    showMessage(signupForm, "Please select your gender.");
    return;
  }
  if (!termsChecked) {
    showMessage(signupForm, "You must agree to Terms & Conditions.");
    return;
  }

  try {
    const customersRef = collection(db, "customers");

    // Check unique username
    const usernameQuery = query(customersRef, where("username", "==", username));
    const usernameSnapshot = await getDocs(usernameQuery);
    if (!usernameSnapshot.empty) {
      showMessage(signupForm, "Username is already taken.");
      return;
    }

    // Check unique matric number
    const matricQuery = query(customersRef, where("matric", "==", matric));
    const matricSnapshot = await getDocs(matricQuery);
    if (!matricSnapshot.empty) {
      showMessage(signupForm, "Matric number is already registered.");
      return;
    }

    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update user profile displayName
    await updateProfile(user, { displayName: fullname });

    // Save customer data to Firestore
    const customerDocRef = doc(db, "customers", user.uid);
    await setDoc(customerDocRef, {
      fullname,
      username,
      gender,
      email,
      phone,
      matric,
      room,
      roomLocation: room,
      accountDetails: "",
      profileImage: "",
      role: "customer",
      createdAt: serverTimestamp(),
      active: true
    });

    showMessage(signupForm, "Account created successfully! Redirecting...", "success");
    signupForm.reset();

    setTimeout(() => {
      window.location.href = "/customer/dashboard.html"; // change as needed
    }, 1500);

  } catch (error) {
    console.error("Signup error:", error);
    showMessage(signupForm, "Signup failed: " + error.message);
  }
});