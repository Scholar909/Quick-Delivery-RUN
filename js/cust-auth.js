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
  msgBox.style.color = type === "success" ? "green" : "red";
}

// ===== Helper: Loading button =====
function setLoading(btn, isLoading) {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "Please wait...";
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.originalText || "Submit";
    btn.disabled = false;
  }
}

// ===== LOGIN =====
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(loginForm, "");

  const btn = loginForm.querySelector("button[type=submit]");
  setLoading(btn, true);

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
      setLoading(btn, false);
      return;
    }

    const customerData = customerDocSnap.data();

    if (customerData.role !== "customer") {
      await signOut(auth);
      showMessage(loginForm, "Access denied: Not a customer account.");
      setLoading(btn, false);
      return;
    }

    if (customerData.active === false) {
      await signOut(auth);
      showMessage(loginForm, "Your account has been blocked. Please contact support.");
      setLoading(btn, false);
      return;
    }

    showMessage(loginForm, "Login successful! Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "./customer/dashboard.html";
    }, 1500);

  } catch (error) {
    console.error("Login error:", error);
    showMessage(loginForm, "Login failed: " + error.message);
    setLoading(btn, false);
  }
});

// ===== SIGN UP =====
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showMessage(signupForm, "");

  const btn = signupForm.querySelector("button[type=submit]");
  setLoading(btn, true);

  // Collect and normalize values
  const fullname = signupForm["signup-fullname"].value.trim();
  const usernameRaw = signupForm["signup-username"].value.trim();
  const username = usernameRaw.toLowerCase();
  const gender = signupForm["gender"].value.trim().toLowerCase();
  const email = signupForm["signup-email"].value.trim();
  const matricRaw = signupForm["signup-matric"].value.trim();
  const matric = matricRaw.toUpperCase();
  const hostel = document.getElementById("signup-hostel")?.value?.trim().toLowerCase() || "Not provided";
  const roomNumber = document.getElementById("signup-room").value.trim();
  const password = signupForm["signup-password"].value;
  const confirm = signupForm["signup-confirm"].value;
  const phone = signupForm["signup-phone"].value.trim();
  const termsChecked = signupForm["signup-terms"].checked;

  if (password !== confirm) {
    showMessage(signupForm, "Passwords do not match.");
    setLoading(btn, false);
    return;
  }
  if (!gender) {
    showMessage(signupForm, "Please select your gender.");
    setLoading(btn, false);
    return;
  }
  if (!termsChecked) {
    showMessage(signupForm, "You must agree to Terms & Conditions.");
    setLoading(btn, false);
    return;
  }

  try {
    const customersRef = collection(db, "customers");

    // Check unique username
    const usernameQuery = query(customersRef, where("username", "==", username));
    const usernameSnapshot = await getDocs(usernameQuery);
    if (!usernameSnapshot.empty) {
      showMessage(signupForm, "Username is already taken.");
      setLoading(btn, false);
      return;
    }

    // Check unique matric number
    const matricQuery = query(customersRef, where("matric", "==", matric));
    const matricSnapshot = await getDocs(matricQuery);
    if (!matricSnapshot.empty) {
      showMessage(signupForm, "Matric number is already registered.");
      setLoading(btn, false);
      return;
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    await updateProfile(user, { displayName: fullname });

    const customerDocRef = doc(db, "customers", user.uid);
    await setDoc(customerDocRef, {
      fullname,
      username,
      gender,
      email,
      phone,
      matric,
      hostel,
      roomNumber,
      accountDetails: "",
      profileImage: "",
      role: "customer",
      createdAt: serverTimestamp(),
      active: true
    }, { merge: false });

    showMessage(signupForm, "Account created successfully! Redirecting...", "success");
    signupForm.reset();

    setTimeout(() => {
      window.location.href = "./customer/dashboard.html";
    }, 1500);

  } catch (error) {
    console.error("Signup error:", error);
    showMessage(signupForm, "Signup failed: " + error.message);
    setLoading(btn, false);
  }
});

// ===== LIVE USERNAME CHECK =====
const customerUsernameInput = signupForm["signup-username"];
customerUsernameInput.addEventListener("input", async () => {
  const val = customerUsernameInput.value.trim().toLowerCase();
  if (!val) return;

  const customersRef = collection(db, "customers");
  const usernameQuery = query(customersRef, where("username", "==", val));
  const snapshot = await getDocs(usernameQuery);

  const msg = signupForm.querySelector(".usernameMsg") || document.createElement("p");
  msg.className = "usernameMsg";
  msg.style.fontSize = "0.8rem";
  msg.style.marginTop = "0.3rem";
  customerUsernameInput.insertAdjacentElement("afterend", msg);

  if (snapshot.empty) {
    msg.textContent = "✅ Username is available";
    msg.style.color = "green";
  } else {
    msg.textContent = "❌ Username is taken";
    msg.style.color = "red";
  }
});

