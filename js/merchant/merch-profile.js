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

  // Extra phone autofill + lock if already set
  if (merchantData.extraPhone) {
    extraNumber.value = merchantData.extraPhone;
    extraNumber.disabled = true;
  }

  // Account details: always editable
  accountDetails.value = merchantData.accountDetails
    ? merchantData.accountDetails.replace(/,/g, '\n')
    : '';

  // Toggle add/edit button visibility
  if (merchantData.profileImage) {
    addBtn.style.display = 'none';
  } else {
    editBtn.style.display = 'none';
  }
});

// ====== Update Profile ======
updateBtn.addEventListener('click', async () => {
  const updates = {};

  // ====== Extra phone: permanently lock after first update ======
  if (!merchantData.extraPhone && extraNumber.value.trim()) {
    updates.extraPhone = extraNumber.value.trim();
  }

  // ====== Account details: always editable ======
  if (accountDetails.value.trim()) {
    updates.accountDetails = accountDetails.value.trim().replace(/\n/g, ', ');
  }

  if (Object.keys(updates).length > 0) {
    await updateDoc(doc(db, "merchants", auth.currentUser.uid), updates);

    if (updates.extraPhone) {
      extraNumber.disabled = true;
      merchantData.extraPhone = updates.extraPhone;
    }

    if (updates.accountDetails) {
      merchantData.accountDetails = updates.accountDetails;
      accountDetails.value = updates.accountDetails.replace(/,/g, '\n');
    }

    alert("Profile updated!");
  } else {
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

  const formData = new FormData();
  formData.append("image", file);

  try {
    const res = await fetch(`https://api.imgbb.com/1/upload?key=76b5c9b8204181e4bb53f33eb96b8efb`, {
      method: "POST",
      body: formData
    });
    const result = await res.json();
    const url = result.data.url;

    const user = auth.currentUser;
    await updateDoc(doc(db, "merchants", user.uid), {
      profileImage: url,
      updatedAt: serverTimestamp()
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

// ====== Change Password ======
document.getElementById('togglePassword').addEventListener('click', () => {
  document.getElementById('passwordBody').classList.toggle('open');
});

async function changePassword() {
  if (!oldPass.value || !newPass.value || !confirmPass.value) {
    alert("Please fill all password fields.");
    return;
  }
  if (newPass.value !== confirmPass.value) {
    alert("New passwords do not match.");
    return;
  }

  const user = auth.currentUser;
  const cred = EmailAuthProvider.credential(user.email, oldPass.value);

  try {
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPass.value);
    alert("Password updated successfully!");
    oldPass.value = newPass.value = confirmPass.value = '';
  } catch (err) {
    alert("Password change failed: " + err.message);
  }
}

document.querySelector('#passwordBody').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') changePassword();
});