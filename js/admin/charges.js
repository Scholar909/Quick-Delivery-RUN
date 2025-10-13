import { db } from '../firebase.js';
import {
  collection,
  addDoc,
  onSnapshot,
  doc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log("✅ DOM ready, initializing...");

  // DOM
  const form = document.getElementById('chargeForm');
  const genderSelect = document.getElementById('genderSelect');
  const hostelSelect = document.getElementById('hostelSelect');
  const restaurantSelect = document.getElementById('restaurantSelect');
  const chargeAmount = document.getElementById('chargeAmount');
  const chargesList = document.getElementById('chargesList');

  // ==============================
  // Load Restaurants
  // ==============================
  async function loadRestaurants() {
    try {
      const restRef = collection(db, 'restaurants');
      const snapshot = await getDocs(restRef);
      restaurantSelect.innerHTML = '<option value="">Select Restaurant</option>';
      snapshot.forEach(docSnap => {
        const name = (docSnap.data().name || "").trim();
        if (name) {
          const opt = document.createElement('option');
          opt.value = name.toLowerCase();
          opt.textContent = name;
          restaurantSelect.appendChild(opt);
        }
      });
    } catch (err) {
      console.error("⚠️ Error loading restaurants:", err);
    }
  }

  // ==============================
  // Load Hostels (from customers)
  // ==============================
  async function loadHostels() {
    try {
      const custRef = collection(db, 'customers');
      const snapshot = await getDocs(custRef);
      const hostels = new Set();

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const hostel = (data.hostel || data.Hostel || data.roomLocation || "").trim();
        if (hostel && hostel.toLowerCase() !== "not provided") {
          hostels.add(hostel.toLowerCase());
        }
      });

      console.log("✅ Found hostels:", [...hostels]);
      hostelSelect.innerHTML = '<option value="">Select Hostel</option>';
      [...hostels].sort().forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h;
        hostelSelect.appendChild(opt);
      });
    } catch (err) {
      console.error("⚠️ Error loading hostels:", err);
    }
  }

  // ==============================
  // Save New Delivery Charge
  // ==============================
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("🟢 Save button clicked");

    const gender = genderSelect.value.trim().toLowerCase();
    const hostel = hostelSelect.value.trim().toLowerCase();
    const restaurant = restaurantSelect.value.trim().toLowerCase();
    const charge = parseFloat(chargeAmount.value);

    if (!gender || !hostel || !restaurant || isNaN(charge)) {
      alert('⚠️ Please fill all fields correctly.');
      return;
    }

    try {
      // ✅ Check if this combo already exists
      const q = query(
        collection(db, "deliveryCharges"),
        where("gender", "==", gender),
        where("hostel", "==", hostel),
        where("restaurant", "==", restaurant)
      );
      const existing = await getDocs(q);

      if (!existing.empty) {
        alert("⚠️ A charge already exists for this Gender + Hostel + Restaurant.");
        return;
      }

      // ✅ Add the new charge
      await addDoc(collection(db, 'deliveryCharges'), {
        gender,
        hostel,
        restaurant,
        charge
      });

      console.log(`✅ Charge added for ${restaurant} (${gender}, ${hostel}) = ₦${charge}`);
      alert('✅ Delivery charge saved successfully!');
      form.reset();

    } catch (err) {
      console.error('❌ Error adding charge:', err);
      alert('❌ Failed to save charge. Check console for details.');
    }
  });

  // ==============================
  // Live Load All Charges
  // ==============================
  onSnapshot(collection(db, 'deliveryCharges'), (snapshot) => {
    chargesList.innerHTML = '';
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const card = document.createElement('div');
      card.classList.add('announcement-card');
      card.innerHTML = `
        <h4>${data.restaurant?.toUpperCase() || '—'}</h4>
        <p>${data.hostel} (${data.gender})</p>
        <p><strong>Charge:</strong> ₦${data.charge}</p>
        <div class="card-actions">
          <button class="danger" data-id="${docSnap.id}">Delete</button>
        </div>
      `;
      chargesList.appendChild(card);
    });
  });

  // ==============================
  // Delete Charge
  // ==============================
  chargesList.addEventListener('click', async (e) => {
    if (e.target.classList.contains('danger')) {
      const id = e.target.dataset.id;
      if (confirm('🗑️ Delete this charge?')) {
        try {
          await deleteDoc(doc(db, 'deliveryCharges', id));
          console.log("🗑️ Charge deleted:", id);
        } catch (err) {
          console.error("❌ Failed to delete charge:", err);
        }
      }
    }
  });

  // ==============================
  // Initialize
  // ==============================
  loadRestaurants();
  loadHostels();
});