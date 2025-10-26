import { db } from '../firebase.js';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

document.addEventListener('DOMContentLoaded',()=>{
  addFormSection.style.display='none';
});

const addBtn = document.getElementById('add-btn');
const addFormSection = document.getElementById('addFormSection');
const chargeForm = document.getElementById('chargeForm');
const genderEl = document.getElementById('gender');
const fromEl = document.getElementById('fromLocation');
const toEl = document.getElementById('toLocation');
const newToEl = document.getElementById('newToLocation');
const amountEl = document.getElementById('chargeAmount');
const chargesList = document.getElementById('chargesList');
const searchEl = document.getElementById('searchCharges');
const saveBtn = document.getElementById('saveChargeBtn');

let allCharges = [];       // cached charges from snapshot
let toLocationSet = new Set();

/* --------------------------
   Utility / Defensive checks
   -------------------------- */
function safeLog(...args) { console.log(...args); }
function safeError(...args) { console.error(...args); }

if (!db) {
  // If db isn't present, we still render UI and show warnings in console.
  safeError('Firebase "db" is not available. Charges page will not be able to read/write Firestore.');
}

/* --------------------------
   UI helpers
   -------------------------- */
function showForm(show) {
  if (show) {
    addFormSection.classList.remove('hidden');
    addFormSection.setAttribute('aria-hidden', 'false');
  } else {
    addFormSection.classList.add('hidden');
    addFormSection.setAttribute('aria-hidden', 'true');
  }
}

// === Toggle Add-Form like admin menu ===
addBtn.addEventListener('click', () => {
  if (addFormSection.style.display === 'none' || !addFormSection.style.display) {
    addFormSection.style.display = 'flex';      // show the form
    chargeForm.reset();
    newToEl.style.display = 'block'; // show it by default
  } else {
    addFormSection.style.display = 'none';      // hide the form
  }
});

toEl.addEventListener('change', () => {
  const val = (toEl.value || '').trim();
  if (val){
    newToEl.style.display = 'none';
    newToEl.value = '';
  } else {
    newToEl.style.display = 'block';
  }
});

/* --------------------------
   Load From Locations (restaurants)
   -------------------------- */
async function loadFromLocations() {
  try {
    if (!db) return;

    const restCol = collection(db, 'restaurants');
    const snapshot = await getDocs(restCol);
    // Keep option value as actual restaurant names (case preserved)
    fromEl.innerHTML = '<option value="">-- From Location (Restaurant) --</option>';
    snapshot.forEach(docSnap => {
      const data = docSnap.data ? docSnap.data() : {};
      const name = (data.name || '').toString().trim();
      if (name) {
        const o = document.createElement('option');
        o.value = name;
        o.textContent = name;
        fromEl.appendChild(o);
      }
    });
  } catch (err) {
    safeError('Error loading restaurants:', err);
  }
}

/* --------------------------
   Load To Locations (distinct toLocation from existing charges)
   -------------------------- */
/* --------------------------
   Load To Locations
   (combine existing charges + all customer hostels)
   -------------------------- */
async function loadToLocationsOnce() {
  try {
    if (!db) return;
    toLocationSet.clear();

    // 1️⃣ From existing charges (old logic)
    const chargesCol = collection(db, 'deliveryCharges');
    const chargesSnap = await getDocs(chargesCol);
    chargesSnap.forEach(docSnap => {
      const d = docSnap.data ? docSnap.data() : {};
      const t = (d.toLocation || d.to || '').toString().trim().toLowerCase();
      if (t) toLocationSet.add(t);
    });

    // 2️⃣ From customer hostels (new logic)
    const customersCol = collection(db, 'customers');
    const custSnap = await getDocs(customersCol);
    custSnap.forEach(docSnap => {
      const d = docSnap.data ? docSnap.data() : {};
      const h = (d.hostel || '').toString().trim().toLowerCase();
      if (h) toLocationSet.add(h);
    });

    updateToDropdown();
    safeLog(`✅ To-locations loaded (${toLocationSet.size} total):`, Array.from(toLocationSet));

  } catch (err) {
    safeError('Error loading to-locations (charges + hostels):', err);
  }
}

function updateToDropdown() {
  // keep the first default option
  const prev = toEl.value;
  toEl.innerHTML = '<option value="">-- To Location --</option>';
  Array.from(toLocationSet).sort((a,b)=>a.localeCompare(b)).forEach(loc => {
    const o = document.createElement('option');
    o.value = loc;
    o.textContent = loc;
    toEl.appendChild(o);
  });
  if (prev) toEl.value = prev;
}

/* --------------------------
   Save New Charge
   -------------------------- */
async function saveChargePayload(payload) {
  if (!db) {
    alert('Firestore not available — cannot save charge. See console.');
    return;
  }
  try {
    await addDoc(collection(db, 'deliveryCharges'), payload);
    safeLog('Charge saved:', payload);
  } catch (err) {
    safeError('Failed to save charge:', err);
    throw err;
  }
}

chargeForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();

  const gender = (genderEl.value || '').trim().toLowerCase();
  const fromLocation = (fromEl.value || '').trim();
  let toLocation = (toEl.value || '').trim();
  const newTo = (newToEl.value || '').trim();
  const amount = parseFloat(amountEl.value);

  if (!gender || !fromLocation || (!toLocation && !newTo) || isNaN(amount)) {
    alert('Please fill all fields correctly.');
    return;
  }

  if (!toLocation) toLocation = newTo;

  // case-insensitive duplicate check by querying firestore when db available
  try {
    if (!db) {
      alert('Firestore not available — cannot validate duplicates. Check console.');
      return;
    }

    const q = query(
      collection(db, 'deliveryCharges'),
      where('gender', '==', gender),
      where('fromLocation', '==', fromLocation),
      where('toLocation', '==', toLocation)
    );

    const existingSnapshot = await getDocsSafely(q);
    if (existingSnapshot && !existingSnapshot.empty) {
      alert('A charge already exists for this gender + from + to location combination.');
      return;
    }

    const payload = {
      gender,
      fromLocation,
      toLocation,
      charge: amount,
      createdAt: new Date().toISOString()
    };

    await saveChargePayload(payload);

    // ensure newTo is added to local dropdown set and UI
    if (newTo) {
      toLocationSet.add(newTo);
      updateToDropdown();
      newToEl.value = '';
      newToEl.classList.add('hidden');
    }

    chargeForm.reset();
    showForm(false);
    alert('Charge saved successfully!');
  } catch (err) {
    safeError('Error on saving charge flow:', err);
    alert('Failed to save charge. See console for details.');
  }
});

/* small helper wrapper for getDocs with defensive checks */
async function getDocsSafely(q) {
  try {
    if (!db) return null;
    return await getDocs(q);
  } catch (err) {
    safeError('getDocsSafely error:', err);
    return null;
  }
}

/* --------------------------
   Render charges list (with search filter)
   -------------------------- */
function renderCharges(list) {
  const q = (searchEl.value || '').toLowerCase().trim();

  const filtered = list.filter(item => {
    const fLoc = (item.fromLocation || '').toLowerCase();
    const tLoc = (item.toLocation || item.to || '').toLowerCase();
    const g = (item.gender || '').toLowerCase();
    return (!q) || fLoc.includes(q) || tLoc.includes(q) || g.includes(q);
  });

  chargesList.innerHTML = '';

  if (filtered.length === 0) {
    const p = document.createElement('p');
    p.style.color = '#ccc';
    p.textContent = 'No charges found.';
    chargesList.appendChild(p);
    return;
  }

  filtered.forEach(ch => {
    const c = document.createElement('div');
    c.className = 'charge-card';
    const title = document.createElement('h3');
    title.textContent = `${ch.fromLocation} → ${ch.toLocation || ch.to || '—'}`;
    const meta = document.createElement('p');
    meta.className = 'charge-meta';
    meta.textContent = `Gender: ${ch.gender} | Charge: ₦${ch.charge}`;
    const created = document.createElement('p');
    created.style.color = '#bfbfbf';
    created.style.fontSize = '0.82rem';
    created.textContent = ch.createdAt ? `Created: ${new Date(ch.createdAt).toLocaleString()}` : '';

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const del = document.createElement('button');
    del.className = 'btn btn-danger';
    del.textContent = 'Delete';
    del.dataset.id = ch.id;
    actions.appendChild(del);

    c.appendChild(title);
    c.appendChild(meta);
    if (created.textContent) c.appendChild(created);
    c.appendChild(actions);

    chargesList.appendChild(c);
  });
}

/* delete click */
chargesList.addEventListener('click', async (ev) => {
  const target = ev.target;
  if (target && target.dataset && target.dataset.id) {
    const id = target.dataset.id;
    if (!confirm('Delete this charge?')) return;
    try {
      if (!db) {
        alert('Firestore not available — cannot delete. See console.');
        return;
      }
      await deleteDoc(doc(db, 'deliveryCharges', id));
      safeLog('Charge deleted:', id);
    } catch (err) {
      safeError('Failed to delete charge:', err);
      alert('Failed to delete. Check console.');
    }
  }
});

/* --------------------------
   Real-time listener for deliveryCharges (keeps toLocationSet updated too)
   -------------------------- */
function bindRealtimeCharges() {
  try {
    if (!db) {
      safeError('No Firestore db — realtime charges disabled.');
      return;
    }
    const col = collection(db, 'deliveryCharges');
    onSnapshot(col, (snap) => {
      allCharges = snap.docs.map(d => ({ id: d.id, ...(d.data ? d.data() : {}) }));
      // update to-location set
      toLocationSet.clear();
      allCharges.forEach(ch => {
        const t = (ch.toLocation || ch.to || '').toString().trim();
        if (t) toLocationSet.add(t);
      });
      // Also refresh customer hostels into dropdown live
      loadToLocationsOnce();
      updateToDropdown();
      renderCharges(allCharges);
    }, (err) => {
      safeError('Realtime snapshot error (deliveryCharges):', err);
    });
  } catch (err) {
    safeError('bindRealtimeCharges error:', err);
  }
}

/* --------------------------
   Search binding
   -------------------------- */
searchEl.addEventListener('input', () => renderCharges(allCharges));

/* --------------------------
   Init loader
   -------------------------- */
(async function init() {
  try {
    await loadFromLocations();
    await loadToLocationsOnce();
    bindRealtimeCharges();
    safeLog('Charges page initialized.');
  } catch (err) {
    safeError('Init error:', err);
  }
})();