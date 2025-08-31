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
    updateDoc,
    doc,
    setDoc,
    serverTimestamp,
    Timestamp,
    getDoc,
    GeoPoint
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

import { setPersistence, browserLocalPersistence }
    from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

await setPersistence(auth, browserLocalPersistence);

// Forms & elements
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

// Utility: Show message
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

// ===== Helper: Request Location & Save to Firestore =====
async function requestLocationAndStore(uid, form) {
    return new Promise((resolve, reject) => {
        alert("📍 Please enable location access to allow live tracking of your movement on the map.\nYou cannot continue until location is enabled.");

        if (!navigator.geolocation) {
            showMessage(form, "Geolocation is not supported by your browser.");
            reject("Geolocation not supported");
            return;
        }

        const watchId = navigator.geolocation.watchPosition(
            async (pos) => {
                try {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;

                    await updateDoc(doc(db, "merchants", uid), {
                        lat: lat,
                        lng: lng,
                        location: new GeoPoint(lat, lng),
                        locationUpdatedAt: serverTimestamp()
                    });

                    console.log("Live location stored:", lat, lng);
                    resolve(true); // Allow redirect
                    navigator.geolocation.clearWatch(watchId); // stop after first fix
                } catch (err) {
                    console.error("Error saving location:", err);
                    reject(err);
                }
            },
            (err) => {
                if (err.code === 1) {
                    showMessage(form, "⚠️ Location access denied. Please enable to proceed.");
                } else {
                    showMessage(form, "⚠️ Unable to fetch location. Try again.");
                }
                reject(err);
            },
            { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
        );
    });
}

// ===== LOGIN FORM =====
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage(loginForm, "");

    const btn = loginForm.querySelector("button[type=submit]");
    setLoading(btn, true);

    const email = loginForm["login-email"].value.trim();
    const password = loginForm["login-password"].value;

    try {
        await signOut(auth);
        localStorage.clear();
        sessionStorage.clear();

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        console.log("✅ Fresh login as merchant:", user.uid, user.email);

        const merchantDocRef = doc(db, "merchants", user.uid);
        const merchantDocSnap = await getDoc(merchantDocRef);

        if (!merchantDocSnap.exists()) {
            await signOut(auth);
            showMessage(loginForm, "Account does not exist. Please sign up.");
            setLoading(btn, false);
            return;
        }

        const merchantData = merchantDocSnap.data();

        if (merchantData.role !== "merchant" && merchantData.role !== "hostel") {
            await signOut(auth);
            showMessage(loginForm, "Access denied: Not a merchant account.");
            setLoading(btn, false);
            return;
        }

        if (merchantData.active === false) {
            await signOut(auth);
            showMessage(loginForm, "Your account has been blocked. Please contact support.");
            setLoading(btn, false);
            return;
        }

        showMessage(loginForm, "Login successful! Getting location...", "success");
        await requestLocationAndStore(user.uid, loginForm);

        window.location.href = "./merchant/dashboard.html";

    } catch (error) {
        console.error("Login error:", error);
        showMessage(loginForm, "Login failed: " + error.message);
        setLoading(btn, false);
    }
});

// ===== SIGNUP FORM =====
signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showMessage(signupForm, "");

    const btn = signupForm.querySelector("button[type=submit]");
    setLoading(btn, true);

    const fullname = signupForm["signup-fullname"].value.trim();
    const usernameRaw = signupForm["signup-username"].value.trim();
    const username = usernameRaw.toLowerCase();
    const gender = signupForm["gender"].value;
    const email = signupForm["signup-email"].value.trim();
    const matricRaw = signupForm["signup-matric"].value.trim();
    const matric = matricRaw.toUpperCase();
    const room = signupForm["signup-room"].value.trim();
    const password = signupForm["signup-password"].value;
    const confirm = signupForm["signup-confirm"].value;
    const phone = signupForm["signup-phone"].value.trim();
    const tokenInput = signupForm["signup-token"].value.trim();

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
    if (!tokenInput) {
        showMessage(signupForm, "Token is required.");
        setLoading(btn, false);
        return;
    }

    try {
        const merchantsRef = collection(db, "merchants");

        const usernameQuery = query(merchantsRef, where("username", "==", username));
        const usernameSnapshot = await getDocs(usernameQuery);
        if (!usernameSnapshot.empty) {
            showMessage(signupForm, "Username is already taken.");
            setLoading(btn, false);
            return;
        }

        const matricQuery = query(merchantsRef, where("matric", "==", matric));
        const matricSnapshot = await getDocs(matricQuery);
        if (!matricSnapshot.empty) {
            showMessage(signupForm, "Matric number is already registered.");
            setLoading(btn, false);
            return;
        }

        const tokensRef = collection(db, "merchantTokens");
        const q = query(tokensRef, where("token", "==", tokenInput.toUpperCase()), where("used", "==", false));
        const tokenSnapshot = await getDocs(q);

        if (tokenSnapshot.empty) {
            showMessage(signupForm, "Invalid or already used token.");
            setLoading(btn, false);
            return;
        }

        const tokenDoc = tokenSnapshot.docs[0];
        const tokenData = tokenDoc.data();

        const now = Timestamp.now();
        if (tokenData.expiresAt && tokenData.expiresAt.toMillis() < now.toMillis()) {
            showMessage(signupForm, "Token has expired.");
            setLoading(btn, false);
            return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: fullname });

        const merchantsDocRef = doc(db, "merchants", user.uid);
        await setDoc(merchantsDocRef, {
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
            role: "merchant",
            createdAt: serverTimestamp(),
            active: true
        });

        await updateDoc(tokenDoc.ref, {
            used: true,
            usedBy: user.uid,
            usedAt: serverTimestamp()
        });

        showMessage(signupForm, "Account created successfully! Getting location...", "success");
        await requestLocationAndStore(user.uid, signupForm);

        signupForm.reset();
        window.location.href = "./merchant/dashboard.html";

    } catch (error) {
        console.error("Signup error:", error);
        showMessage(signupForm, "Signup failed: " + error.message);
        setLoading(btn, false);
    }
});

// ===== LIVE USERNAME CHECK =====
const merchantUsernameInput = signupForm["signup-username"];
merchantUsernameInput.addEventListener("input", async () => {
    const val = merchantUsernameInput.value.trim().toLowerCase();
    if (!val) return;

    const merchantsRef = collection(db, "merchants");
    const usernameQuery = query(merchantsRef, where("username", "==", val));
    const snapshot = await getDocs(usernameQuery);

    const msg = signupForm.querySelector(".usernameMsg") || document.createElement("p");
    msg.className = "usernameMsg";
    msg.style.fontSize = "0.8rem";
    msg.style.marginTop = "0.3rem";
    merchantUsernameInput.insertAdjacentElement("afterend", msg);

    if (snapshot.empty) {
        msg.textContent = "✅ Username is available";
        msg.style.color = "green";
    } else {
        msg.textContent = "❌ Username is taken";
        msg.style.color = "red";
    }
});