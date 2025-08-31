// File: merch-profile.js
import { auth, db } from '../firebase.js';
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import {
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

// ====== Elements ======
const profileImage = document.getElementById('profileImage');
const profileOptions = document.getElementById('profileOptions');
const viewBtn = document.getElementById('viewImage');
const editBtn = document.getElementById('editImage');
const addBtn = document.getElementById('addImage');
const imageInput = document.getElementById('imageInput');

const extraNumber = document.getElementById('extraNumber');
const accountDetails = document.getElementById('accountDetails');
const updateBtn = document.getElementById('updateProfile');

const oldPass = document.querySelector('#passwordBody input[placeholder="Old Password"]');
const newPass = document.querySelector('#passwordBody input[placeholder="New Password"]');
const confirmPass = document.querySelector('#passwordBody input[placeholder="Confirm New Password"]');

// ====== State ======
let merchantData = {};

// ====== Load Profile ======
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '../merch-auth.html';
    return;
  }

  const docRef = doc(db, "merchants", user.uid);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    alert("Profile not found.");
    return;
  }

  merchantData = snap.data();

  // Fill UI
  profileImage.src = merchantData.profileImage || '../images/default-avatar.png';
  document.querySelector('.username-email').innerHTML =
    `<strong>${merchantData.username}</strong> | ${merchantData.email}`;
  document.querySelector('.profile-info').innerHTML +=
    `<p><strong>Full Name:</strong> ${merchantData.fullname}</p>
     <p><strong>Matric Number:</strong> ${merchantData.matric}</p>
     <p><strong>Gender:</strong> ${merchantData.gender}</p>
     <p><strong>Phone Number:</strong> ${merchantData.phone || 'Not added'}</p>
     <p><strong>Room Number:</strong> ${merchantData.room || 'Not provided'}</p>`;

  if (merchantData.extraPhone) {
    extraNumber.value = merchantData.extraPhone;
    extraNumber.disabled = true;
  }

  accountDetails.value = merchantData.accountDetails
    ? merchantData.accountDetails.replace(/,/g, '\n')
    : '';

  if (merchantData.profileImage) {
    addBtn.style.display = 'none';
  } else {
    editBtn.style.display = 'none';
  }
});

// ====== Update Profile + Password ======
updateBtn.addEventListener('click', async () => {
  const user = auth.currentUser;
  const updates = {};

  // extra phone (lock after first set)
  if (!merchantData.extraPhone && extraNumber.value.trim()) {
    updates.extraPhone = extraNumber.value.trim();
  }

  // account details
  if (accountDetails.value.trim()) {
    updates.accountDetails = accountDetails.value.trim().replace(/\n/g, ', ');
  }

  // -------- PASSWORD SECTION --------
  if (oldPass.value || newPass.value || confirmPass.value) {
    if (!oldPass.value || !newPass.value || !confirmPass.value) {
      alert("Please fill all password fields.");
      return;
    }
    if (newPass.value !== confirmPass.value) {
      alert("New passwords do not match.");
      return;
    }

    try {
      const cred = EmailAuthProvider.credential(user.email, oldPass.value);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPass.value);

      // clear password inputs
      oldPass.value = newPass.value = confirmPass.value = '';
      alert("Password updated successfully!");
    } catch (err) {
      alert("Password change failed: " + err.message);
      return; // stop further updates if password fails
    }
  }

  // -------- SAVE PROFILE FIELDS --------
  if (Object.keys(updates).length > 0) {
    await updateDoc(doc(db, "merchants", user.uid), {
      ...updates,
      updatedAt: serverTimestamp()
    });

    if (updates.extraPhone) {
      extraNumber.disabled = true;
      merchantData.extraPhone = updates.extraPhone;
    }

    if (updates.accountDetails) {
      merchantData.accountDetails = updates.accountDetails;
      accountDetails.value = updates.accountDetails.replace(/,/g, '\n');
    }

    alert("Profile updated!");
  } else if (!(oldPass.value || newPass.value || confirmPass.value)) {
    alert("No changes detected or allowed.");
  }
});

// ====== Profile Image Handlers ======
profileImage.addEventListener('click', () => {
  profileOptions.style.display = 'flex';
});

viewBtn.addEventListener('click', () => {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');
  modal.style.display = 'block';
  modalImg.src = profileImage.src;
});

editBtn.addEventListener('click', () => imageInput.click());
addBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];
  if (!file) return;

  const user = auth.currentUser;
  const merchantRef = doc(db, "merchants", user.uid);
  const snap = await getDoc(merchantRef);

  if (!snap.exists()) {
    alert("Profile not found.");
    return;
  }

  const data = snap.data();
  const now = new Date();

  // 1️⃣ Check if locked
  if (data.profileImageLockedUntil && now < data.profileImageLockedUntil.toDate()) {
    alert("Image locked");
    imageInput.value = "";
    return;
  }

  // 2️⃣ Upload to ImgBB
  const formData = new FormData();
  formData.append("image", file);

  try {
    const res = await fetch(`https://api.imgbb.com/1/upload?key=76b5c9b8204181e4bb53f33eb96b8efb`, {
      method: "POST",
      body: formData
    });
    const result = await res.json();
    const url = result.data.url;

    // 3️⃣ Determine if this change triggers a lock
    let lockedUntil = null;
    if (data.profileImageUpdatedAt) {
      const lastUpdated = data.profileImageUpdatedAt.toDate();
      const hoursSince = (now - lastUpdated) / (1000 * 60 * 60);

      if (hoursSince >= 12) {
        // lock for 1 month
        lockedUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      }
    }

    // 4️⃣ Save new image + lock rules
    await updateDoc(merchantRef, {
      profileImage: url,
      profileImageUpdatedAt: serverTimestamp(),
      profileImageLockedUntil: lockedUntil ? lockedUntil : null
    });

    profileImage.src = url;
    alert("Profile image updated!");

    addBtn.style.display = 'none';
    editBtn.style.display = 'block';
  } catch (err) {
    console.error(err);
    alert("Failed to upload image.");
  }
});

// ====== Toggle Password Body ======
document.getElementById('togglePassword').addEventListener('click', () => {
  document.getElementById('passwordBody').classList.toggle('open');
});
