// ad-dashboard.js
import { auth, db } from '../firebase.js';
import {
  collection,
  getDocs,
  onSnapshot,
  updateDoc,
  doc,
  deleteDoc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

console.log('ad-dashboard.js loaded');

// DOM elements
const totalCustomersEl = document.querySelector('#totalCustomers p');
const totalMerchantsEl = document.querySelector('#totalMerchants p');
const userTableBody = document.getElementById('userTableBody');
const searchInput = document.getElementById('searchAll');

// Variables to store fetched users for search
let customers = [];
let merchants = [];
let allUsers = [];

// ✅ Tooltip helper
function createTooltip(message) {
  const tooltip = document.createElement('div');
  tooltip.textContent = message;

  Object.assign(tooltip.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    background: '#333',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    maxWidth: '280px',
    lineHeight: '1.4',
    zIndex: 2000,
    opacity: '0',
    transition: 'opacity 0.3s ease'
  });

  document.body.appendChild(tooltip);

  requestAnimationFrame(() => {
    tooltip.style.opacity = '1';
  });

  setTimeout(() => {
    tooltip.style.opacity = '0';
    setTimeout(() => tooltip.remove(), 300);
  }, 4000);
}

// Check auth state, redirect if no user
onAuthStateChanged(auth, user => {
  if (user) {
    console.log('User signed in:', user.email);
    loadCounts();
    loadUsersRealTime();
  } else {
    console.log('No user signed in, redirecting to login');
    window.location.href = '../admin-login.html';
  }
});

// Load total counts for Customers and Merchants
async function loadCounts() {
  try {
    const customersSnap = await getDocs(collection(db, 'customers'));
    totalCustomersEl.textContent = customersSnap.size;

    const merchantsSnap = await getDocs(collection(db, 'merchants'));
    totalMerchantsEl.textContent = merchantsSnap.size;
  } catch (err) {
    console.error('Error loading counts:', err);
  }
}

// Create action buttons for each user row
function createActionButtons(userData, userId) {
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.gap = '0.5rem';

  // Message button
  const msgBtn = document.createElement('button');
  msgBtn.textContent = "Message";
  msgBtn.className = "btn-action btn-message";
  msgBtn.title = "Send message";
  msgBtn.addEventListener('click', () => {
    sessionStorage.setItem('alertUserId', userId);
    sessionStorage.setItem('alertUserEmail', userData.email || '');
    sessionStorage.setItem('alertUserRole', userData.role || '');
    sessionStorage.setItem('alertUserName', userData.username || userData.fullname || '');
    window.location.href = '../admin/alerts.html';
  });
  container.appendChild(msgBtn);

  // View button
  const viewBtn = document.createElement('button');
  viewBtn.textContent = "View";
  viewBtn.className = "btn-action btn-view";
  viewBtn.title = "View profile";
  viewBtn.addEventListener('click', () => {
    openUserModal(userData, userId);
  });
  container.appendChild(viewBtn);

  // Availability toggle for merchants/hostel
  if (userData.role === 'merchant' || userData.role === 'hostel') {
    const toggleLabel = document.createElement('label');
    toggleLabel.style.display = 'flex';
    toggleLabel.style.alignItems = 'center';
    toggleLabel.style.cursor = 'pointer';
    toggleLabel.style.gap = '0.3rem';
    toggleLabel.title = "Toggle merchant availability";

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = userData.available !== false;

    toggleInput.addEventListener('change', async () => {
      try {
        const userDocRef = doc(db, 'merchants', userId);
        await updateDoc(userDocRef, { available: toggleInput.checked });
        alert(`${userData.role === 'hostel' ? 'Hostel merchant' : 'Merchant'} ${toggleInput.checked ? 'is now available' : 'is now unavailable'}`);
      } catch (err) {
        console.error("Error updating merchant availability:", err);
        alert("Failed to update availability");
      }
    });

    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(document.createTextNode("Available"));
    container.appendChild(toggleLabel);
  }

  // Block / Unblock button
  const blockBtn = document.createElement('button');
  blockBtn.className = "btn-action btn-block";
  blockBtn.title = userData.active === false ? "Unblock user" : "Block user";
  blockBtn.textContent = userData.active === false ? "Unblock" : "Block";

  blockBtn.addEventListener('click', async () => {
    // ✅ Tooltip shows on click
    createTooltip("When blocking someone, ensure to also mark them unavailable (uncheck 'available'). When unblocking, mark them available again.");

    try {
      const collectionName =
        userData.role === "customer"
          ? "customers"
          : "merchants"; // includes both merchants and hostel merchants
      
      const userDocRef = doc(db, collectionName, userId);
      const newActiveState = !(userData.active !== false);
      await updateDoc(userDocRef, { active: newActiveState });

      alert(
        `User ${userData.username || userData.fullname || userData.email} is now ${
          newActiveState ? "active (unblocked)" : "blocked"
        }`
      );
    } catch (err) {
      console.error('Error toggling block status:', err);
      alert('Failed to toggle block status');
    }
  });
  container.appendChild(blockBtn);

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = "Delete";
  deleteBtn.className = "btn-action btn-delete";
  deleteBtn.title = "Delete user permanently";

  deleteBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to remove this merchant from hostel list?")) return;

    try {
      const snap = await getDoc(doc(db, "hostelMerchants", userId));
      if (snap.exists()) {
        const { merchantId } = snap.data();
        await deleteDoc(doc(db, "hostelMerchants", userId));
        await updateDoc(doc(db, "merchants", merchantId), { role: "merchant" });
        loadUsersRealTime();
        alert("Merchant removed from hostel list and role reverted to merchant.");
      }
    } catch (err) {
      console.error("Error deleting hostel merchant:", err);
      alert("Failed to delete merchant.");
    }
  });

  container.appendChild(deleteBtn);

  return container;
}

// Check if merchant is currently on duty
async function checkMerchantOnDuty(user) {
  try {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    const dayDocRef = doc(db, "calendars", user.id, "days", dateStr);
    const daySnap = await getDoc(dayDocRef);

    if (!daySnap.exists()) return false;

    const data = daySnap.data();
    if (!data.shifts || data.shifts.length === 0) return false;

    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    return data.shifts.some(shift => {
      const [startH, startM] = shift.start.split(":").map(Number);
      const [endH, endM] = shift.end.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    });
  } catch (err) {
    console.error("Error checking merchant duty status:", err);
    return false;
  }
}

// Render a user row in the table
function renderUserRow(user) {
  const tr = document.createElement('tr');
  const usernameTd = document.createElement('td');
  usernameTd.textContent = user.username || user.fullname || "(No username)";

  // Mark merchant in red if unavailable
  if ((user.role === 'merchant' || user.role === 'hostel') && user.available === false) {
    usernameTd.style.color = 'red';
  }

  tr.appendChild(usernameTd);

  const emailTd = document.createElement('td');
  emailTd.textContent = user.email || "(No email)";
  tr.appendChild(emailTd);

  const statusTd = document.createElement('td');

  // Role handling: Show Hostel if role is hostel
  if (user.role === "hostel") {
    statusTd.textContent = "hostel merchant";
  } else {
    statusTd.textContent = user.role || "(No role)";
  }
  tr.appendChild(statusTd);

  // If merchant (normal or hostel), check live duty and style
  if ((user.role === "merchant" || user.role === "hostel") && user.available !== false) {
    checkMerchantOnDuty(user).then(isOnDuty => {
      if (isOnDuty) {
        Object.assign(statusTd.style, {
          background: '#90ee99',
          border: 'none',
          borderRadius: '8px',
          padding: '0.4rem 0.6rem',
          margin: '0 0.2rem',
          color: 'white',
          cursor: 'pointer',
          fontSize: '1rem',
          transition: 'background 0.2s ease',
          textAlign: 'center'
        });
      
        statusTd.addEventListener('mouseenter', () => {
          statusTd.style.background = '#7ed37e';
        });
        statusTd.addEventListener('mouseleave', () => {
          statusTd.style.background = '#90ee90';
        });
      }
    });
  }

  const actionsTd = document.createElement('td');
  actionsTd.appendChild(createActionButtons(user, user.id));
  tr.appendChild(actionsTd);

  return tr;
}

// Update table with optional filtering
function updateTable(filterText = '') {
  const lowerFilter = filterText.toLowerCase();
  const filteredUsers = allUsers.filter(user => {
    const name = (user.username || user.fullname || '').toLowerCase();
    const email = (user.email || '').toLowerCase();
    const role = (user.role === "hostel" ? "hostel merchant" : user.role || "").toLowerCase();
    return name.includes(lowerFilter) || email.includes(lowerFilter) || role.includes(lowerFilter);
  });

  filteredUsers.sort((a, b) => {
    const nameA = (a.username || a.fullname || "").toLowerCase();
    const nameB = (b.username || b.fullname || "").toLowerCase();
    return nameA.localeCompare(nameB);
  });

  userTableBody.innerHTML = '';
  filteredUsers.forEach(user => {
    userTableBody.appendChild(renderUserRow(user));
  });
}

// Listen for search input
searchInput.addEventListener('input', e => {
  updateTable(e.target.value);
});

// Load and listen realtime users
function loadUsersRealTime() {
  const customersRef = collection(db, 'customers');
  const merchantsRef = collection(db, 'merchants');

  onSnapshot(customersRef, snapshot => {
    customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), role: 'customer' }));
    allUsers = [...customers, ...merchants];
    updateTable(searchInput.value);
  });

  onSnapshot(merchantsRef, snapshot => {
    merchants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allUsers = [...customers, ...merchants];
    updateTable(searchInput.value);
  });
}

// Modified modal to show all available details including profile image
function openUserModal(userData, userId) {
  if (document.getElementById('userModalOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'userModalOverlay';
  Object.assign(overlay.style, {
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)',
    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
  });

  const modal = document.createElement('div');
  Object.assign(modal.style, {
    background: 'rgba(255 255 255 / 0.15)', borderRadius: '12px', padding: '2rem',
    width: '360px', color: '#fff', position: 'relative',
    boxShadow: '0 8px 32px rgba(31, 38, 135, 0.37)',
    backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.18)',
    fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif'
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  Object.assign(closeBtn.style, {
    position: 'absolute', top: '10px', right: '15px',
    background: 'transparent', border: 'none', color: '#fff',
    fontSize: '1.8rem', cursor: 'pointer'
  });
  closeBtn.addEventListener('click', () => document.body.removeChild(overlay));

  const content = document.createElement('div');

  if (userData.profileImage) {
    const img = document.createElement('img');
    img.src = userData.profileImage;
    img.alt = `${userData.username || 'User'}'s profile picture`;
    Object.assign(img.style, {
      width: '100px', height: '100px', borderRadius: '50%',
      objectFit: 'cover', marginBottom: '1rem', cursor: 'pointer', border: '2px solid white'
    });
    img.addEventListener('click', () => {
      const imgOverlay = document.createElement('div');
      Object.assign(imgOverlay.style, {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.7)', display: 'flex',
        justifyContent: 'center', alignItems: 'center', zIndex: 2000
      });
      const fullImg = document.createElement('img');
      fullImg.src = userData.profileImage;
      fullImg.style.maxWidth = '90%';
      fullImg.style.maxHeight = '90%';
      fullImg.style.borderRadius = '12px';
      imgOverlay.appendChild(fullImg);
      imgOverlay.addEventListener('click', () => document.body.removeChild(imgOverlay));
      document.body.appendChild(imgOverlay);
    });
    content.appendChild(img);
  }

  const fields = [
    ['Username', userData.username],
    ['Full Name', userData.fullname],
    ['Gender', userData.gender],
    ['Email', userData.email],
    ['Role', userData.role === "hostel" ? "hostel merchant" : userData.role],
    ['Status', userData.active === false ? 'Blocked' : 'Active'],
    ['Available', userData.available === false ? 'Unavailable' : 'Available'],
    ['Phone', userData.phone],
    ['Extra Phone', userData.extraPhone],
    ['Room', userData.room],
    ['Account Details', userData.accountDetails],
  ];

  fields.forEach(([label, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      const p = document.createElement('p');
      p.innerHTML = `<strong>${label}:</strong> ${value}`;
      content.appendChild(p);
    }
  });

  modal.appendChild(closeBtn);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
