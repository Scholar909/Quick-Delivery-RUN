// hostelMerchants.js
import { db } from '../firebase.js';
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

console.log("hostelMerchants.js loaded");

// DOM Elements
const addMerchantBtn = document.getElementById("addMerchantBtn");
const merchantForm = document.getElementById("merchantForm");
const phoneInput = document.getElementById("phone");
const nameInput = document.getElementById("name");
const genderInput = document.getElementById("gender");
const notFoundMsg = document.getElementById("notFoundMsg");
const merchantList = document.getElementById("merchantList");

let editingId = null; // for tracking edits

// Hide form initially
merchantForm.style.display = "none";
notFoundMsg.style.display = "none";

// Show form when add button clicked
addMerchantBtn.addEventListener("click", () => {
  merchantForm.reset();
  nameInput.value = "";
  genderInput.value = "";
  notFoundMsg.style.display = "none";
  editingId = null;
  merchantForm.style.display = "block";
});

// Lookup merchant by phone
phoneInput.addEventListener("blur", async () => {
  const phone = phoneInput.value.trim();
  if (!phone) return;

  try {
    const q = query(collection(db, "merchants"), where("phone", "==", phone));
    const snap = await getDocs(q);

    if (snap.empty) {
      nameInput.value = "";
      genderInput.value = "";
      notFoundMsg.style.display = "block";
      return;
    }

    notFoundMsg.style.display = "none";
    const merchantDoc = snap.docs[0];
    const data = merchantDoc.data();

    nameInput.value = data.fullname || "";
    genderInput.value = data.gender || "";

  } catch (err) {
    console.error("Error looking up merchant:", err);
  }
});

// Save merchant
merchantForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const phone = phoneInput.value.trim();
  const name = nameInput.value.trim();
  const gender = genderInput.value.trim();

  if (!phone || !name) {
    alert("Please enter a valid merchant phone and wait for lookup.");
    return;
  }

  try {
    // Find merchant by phone
    const q = query(collection(db, "merchants"), where("phone", "==", phone));
    const snap = await getDocs(q);

    if (snap.empty) {
      alert("Merchant not found.");
      return;
    }

    const merchantDoc = snap.docs[0];
    const merchantId = merchantDoc.id;

    // Save to hostelMerchants list
    await setDoc(doc(db, "hostelMerchants", merchantId), {
      phone,
      name,
      gender,
      merchantId
    });

    // Update merchant role to Hostel
    await updateDoc(doc(db, "merchants", merchantId), {
      role: "hostel"
    });

    merchantForm.reset();
    merchantForm.style.display = "none";
    alert("Hostel Merchant saved successfully!");
  } catch (err) {
    console.error("Error saving hostel merchant:", err);
    alert("Failed to save merchant.");
  }
});

// Render hostel merchants table
function renderMerchantRow(id, data) {
  const tr = document.createElement("tr");

  const phoneTd = document.createElement("td");
  phoneTd.textContent = data.phone;
  tr.appendChild(phoneTd);

  const nameTd = document.createElement("td");
  nameTd.textContent = data.name;
  tr.appendChild(nameTd);

  const genderTd = document.createElement("td");
  genderTd.textContent = data.gender;
  tr.appendChild(genderTd);

  const actionsTd = document.createElement("td");

  // Edit button
  const editBtn = document.createElement("button");
  editBtn.className = "edit-btn";
  editBtn.innerHTML = '<i class="uil uil-edit"></i>';
  editBtn.addEventListener("click", () => {
    editingId = id;
    phoneInput.value = data.phone;
    nameInput.value = data.name;
    genderInput.value = data.gender;
    merchantForm.style.display = "block";
  });
  actionsTd.appendChild(editBtn);

  // Delete button
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.innerHTML = '<i class="uil uil-trash"></i>';
  
deleteBtn.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to remove this merchant from hostel list?")) return;

  try {
    const snap = await getDoc(doc(db, "hostelMerchants", id));
    if (snap.exists()) {
      const { merchantId } = snap.data();
      await deleteDoc(doc(db, "hostelMerchants", id));
      await updateDoc(doc(db, "merchants", merchantId), { role: "merchant" });
      alert("Merchant removed from hostel list.");
    }
  } catch (err) {
    console.error("Error deleting hostel merchant:", err);
    alert("Failed to delete merchant.");
  }
});

  actionsTd.appendChild(deleteBtn);

  tr.appendChild(actionsTd);

  return tr;
}

// Realtime list of hostel merchants
onSnapshot(collection(db, "hostelMerchants"), async (snapshot) => {
  merchantList.innerHTML = "";

  for (let docSnap of snapshot.docs) {
    const data = docSnap.data();
    const row = renderMerchantRow(docSnap.id, data);
    merchantList.appendChild(row);
  }
});