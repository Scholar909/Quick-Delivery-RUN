// File: ad-dashboard.js
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

const totalCustomersEl = document.querySelector('#totalCustomers p');
const totalMerchantsEl = document.querySelector('#totalMerchants p');
const userTableBody = document.getElementById('userTableBody');
const searchInput = document.getElementById('searchAll');

let customers = [];
let merchants = [];
let allUsers = [];

function createTooltip(message) {
  const tooltip = document.createElement('div');
  tooltip.textContent = message;
  Object.assign(tooltip.style, {
    position: 'fixed', bottom: '20px', right: '20px',
    background: '#333', color: '#fff', padding: '10px 16px',
    borderRadius: '8px', fontSize: '14px', zIndex: 2000,
    opacity: '0', transition: 'opacity 0.3s ease'
  });
  document.body.appendChild(tooltip);
  requestAnimationFrame(() => tooltip.style.opacity = '1');
  setTimeout(() => {
    tooltip.style.opacity = '0';
    setTimeout(() => tooltip.remove(), 300);
  }, 4000);
}

onAuthStateChanged(auth, user => {
  if (user) {
    console.log('User signed in:', user.email);
    loadCounts();
    loadUsersRealTime();
  } else {
    window.location.href = '../admin-login.html';
  }
});

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

function createActionButtons(userData, userId) {
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.gap = '0.5rem';

  // Message
  const msgBtn = document.createElement('button');
  msgBtn.textContent = "Message";
  msgBtn.className = "btn-action btn-message";
  msgBtn.addEventListener('click', () => {
    sessionStorage.setItem('alertUserId', userId);
    sessionStorage.setItem('alertUserEmail', userData.email || '');
    sessionStorage.setItem('alertUserRole', userData.role || '');
    sessionStorage.setItem('alertUserName', userData.username || userData.fullname || '');
    window.location.href = '../admin/alerts.html';
  });
  container.appendChild(msgBtn);

  // View
  const viewBtn = document.createElement('button');
  viewBtn.textContent = "View";
  viewBtn.className = "btn-action btn-view";
  viewBtn.addEventListener('click', () => openUserModal(userData, userId));
  container.appendChild(viewBtn);

  // Availability toggle (merchants only)
  if (userData.role === 'merchant') {
    const toggleLabel = document.createElement('label');
    toggleLabel.style.display = 'flex';
    toggleLabel.style.alignItems = 'center';
    toggleLabel.style.gap = '0.3rem';

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = userData.available !== false;

    toggleInput.addEventListener('change', async () => {
      try {
        await updateDoc(doc(db, 'merchants', userId), { available: toggleInput.checked });
        alert(`Merchant ${toggleInput.checked ? 'is now available' : 'is now unavailable'}`);
      } catch (err) {
        alert("Failed to update availability");
      }
    });

    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(document.createTextNode("Available"));
    container.appendChild(toggleLabel);
  }

  // Block/Unblock
  const blockBtn = document.createElement('button');
  blockBtn.className = "btn-action btn-block";
  blockBtn.textContent = userData.active === false ? "Unblock" : "Block";
  blockBtn.addEventListener('click', async () => {
    createTooltip("When blocking, also mark them unavailable. When unblocking, mark them available again.");
    try {
      const coll = userData.role === "customer" ? "customers" : "merchants";
      const newActive = !(userData.active !== false);
      await updateDoc(doc(db, coll, userId), { active: newActive });
      alert(`${userData.username || userData.fullname || userData.email} is now ${newActive ? "active" : "blocked"}`);
    } catch (err) {
      alert('Failed to toggle block status');
    }
  });
  container.appendChild(blockBtn);

  // Delete (customers/merchants)
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = "Delete";
  deleteBtn.className = "btn-action btn-delete";
  deleteBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const coll = userData.role === "customer" ? "customers" : "merchants";
      await deleteDoc(doc(db, coll, userId));
      alert("User deleted.");
    } catch (err) {
      alert("Failed to delete user.");
    }
  });
  container.appendChild(deleteBtn);

  return container;
}

async function checkMerchantOnDuty(user) {
  try {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    const dayDocRef = doc(db, "calendars", user.id, "days", dateStr);
    const daySnap = await getDoc(dayDocRef);
    if (!daySnap.exists()) return false;
    const data = daySnap.data();
    if (!data.shifts?.length) return false;
    const nowMinutes = today.getHours()*60 + today.getMinutes();
    return data.shifts.some(shift => {
      const [sh, sm] = shift.start.split(":").map(Number);
      const [eh, em] = shift.end.split(":").map(Number);
      return nowMinutes >= (sh*60+sm) && nowMinutes <= (eh*60+em);
    });
  } catch {
    return false;
  }
}

function renderUserRow(user) {
  const tr = document.createElement('tr');
  const usernameTd = document.createElement('td');
  usernameTd.textContent = user.username || user.fullname || "(No username)";
  if (user.role === 'merchant' && user.available === false) usernameTd.style.color = 'red';
  tr.appendChild(usernameTd);

  const emailTd = document.createElement('td');
  emailTd.textContent = user.email || "(No email)";
  tr.appendChild(emailTd);

  const roleTd = document.createElement('td');
  roleTd.textContent = user.role || "(No role)";
  tr.appendChild(roleTd);

  if (user.role === "merchant" && user.available !== false) {
    checkMerchantOnDuty(user).then(isOnDuty => {
      if (isOnDuty) {
        roleTd.style.background = '#90ee99';
        roleTd.style.color = 'white';
        roleTd.style.borderRadius = '8px';
        roleTd.textContent = "On Duty";
      }
    });
  }

  const actionsTd = document.createElement('td');
  actionsTd.appendChild(createActionButtons(user, user.id));
  tr.appendChild(actionsTd);

  return tr;
}

function updateTable(filterText='') {
  const lower = filterText.toLowerCase();
  const filtered = allUsers.filter(u => {
    const n = (u.username||u.fullname||'').toLowerCase();
    const e = (u.email||'').toLowerCase();
    const r = (u.role||'').toLowerCase();
    return n.includes(lower) || e.includes(lower) || r.includes(lower);
  });
  filtered.sort((a,b) => (a.username||a.fullname||"").localeCompare(b.username||b.fullname||""));
  userTableBody.innerHTML = '';
  filtered.forEach(u => userTableBody.appendChild(renderUserRow(u)));
}

searchInput.addEventListener('input', e => updateTable(e.target.value));

function loadUsersRealTime() {
  const customersRef = collection(db, 'customers');
  const merchantsRef = collection(db, 'merchants');

  onSnapshot(customersRef, snap => {
    customers = snap.docs.map(d => ({id:d.id,...d.data(), role:'customer'}));
    allUsers = [...customers, ...merchants];
    updateTable(searchInput.value);
  });

  onSnapshot(merchantsRef, snap => {
    merchants = snap.docs.map(d => ({id:d.id,...d.data(), role:'merchant'}));
    allUsers = [...customers, ...merchants];
    updateTable(searchInput.value);
  });
}

function openUserModal(userData, userId) {
  if (document.getElementById('userModalOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'userModalOverlay';
  Object.assign(overlay.style, {
    position:'fixed',top:0,left:0,width:'100vw',height:'100vh',
    background:'rgba(0,0,0,0.4)',backdropFilter:'blur(6px)',
    display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000
  });
  const modal = document.createElement('div');
  Object.assign(modal.style,{
    background:'rgba(255,255,255,0.15)',borderRadius:'12px',padding:'2rem',
    width:'360px',color:'#fff',position:'relative',
    boxShadow:'0 8px 32px rgba(31,38,135,0.37)',backdropFilter:'blur(10px)',
    border:'1px solid rgba(255,255,255,0.18)'
  });
  const closeBtn=document.createElement('button');
  closeBtn.textContent='×';
  Object.assign(closeBtn.style,{position:'absolute',top:'10px',right:'15px',
    background:'transparent',border:'none',color:'#fff',fontSize:'1.8rem',cursor:'pointer'});
  closeBtn.addEventListener('click',()=>document.body.removeChild(overlay));

  const content=document.createElement('div');
  if(userData.profileImage){
    const img=document.createElement('img');
    img.src=userData.profileImage;
    Object.assign(img.style,{width:'100px',height:'100px',borderRadius:'50%',objectFit:'cover',marginBottom:'1rem',border:'2px solid white'});
    content.appendChild(img);
  }

  const fields=[
    ['Username', userData.username],
    ['Full Name', userData.fullname],
    ['Email', userData.email],
    ['Role', userData.role],
    ['Status', userData.active===false?'Blocked':'Active'],
    ['Available', userData.available===false?'Unavailable':'Available'],
    ['Phone', userData.phone],
    ['Extra Phone', userData.extraPhone],
    ['Room', userData.room],
    ['Account Details', userData.accountDetails],
  ];
  fields.forEach(([l,v])=>{
    if(v) { const p=document.createElement('p'); p.innerHTML=`<strong>${l}:</strong> ${v}`; content.appendChild(p);}
  });

  modal.appendChild(closeBtn);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}