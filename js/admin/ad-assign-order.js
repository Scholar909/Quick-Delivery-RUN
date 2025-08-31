// File: ad-assign-orders.js
import { auth, db } from '../firebase.js';
import {
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  getDocs,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const ordersList = document.querySelector('.orders-list');

let activeOrder = null;
let activeCard = null;

/* ------------------------------
   HELPERS
------------------------------ */
function calculateDistance(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lng2-lng1) * Math.PI/180;

  const a = Math.sin(Δφ/2)**2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return (R * c / 1000).toFixed(2);
}

function buildModal(id, title) {
  const overlay = document.createElement("div");
  overlay.id = id;
  Object.assign(overlay.style, {
    position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
    background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
    display: "none", justifyContent: "center", alignItems: "center",
    zIndex: 9999
  });

  const modal = document.createElement("div");
  Object.assign(modal.style, {
    background: "rgba(255,255,255,0.1)",
    backdropFilter: "blur(12px)",
    borderRadius: "14px",
    padding: "1.5rem",
    width: "90%", maxWidth: "420px",
    color: "#fff", fontFamily: "Segoe UI, sans-serif"
  });

  const h3 = document.createElement("h3");
  h3.textContent = title;
  h3.style.marginBottom = "1rem";

  const content = document.createElement("div");
  content.className = "modal-content";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Close";
  Object.assign(closeBtn.style, {
    marginTop: "1rem", background: "#0f4e75", color: "#fff",
    border: "none", borderRadius: "8px", padding: "0.5rem 1rem", cursor: "pointer"
  });
  closeBtn.addEventListener("click", () => overlay.style.display = "none");

  modal.appendChild(h3);
  modal.appendChild(content);
  modal.appendChild(closeBtn);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  return { overlay, content };
}

const assignModal = buildModal("assignModal", "Select Merchant");
const declineModal = buildModal("declineModal", "Decline Order");

/* ------------------------------
   LISTEN TO PENDING ASSIGNMENTS
------------------------------ */
function listenToPendingOrders() {
  const q = query(collection(db, "orders"), where("orderStatus", "==", "pending_assignment"));
  onSnapshot(q, (snapshot) => {
    ordersList.innerHTML = "";
    const orders = [];
    snapshot.forEach(docSnap => orders.push({ id: docSnap.id, ...docSnap.data() }));
    orders.sort((a, b) => a.createdAt?.toDate() - b.createdAt?.toDate());
    orders.forEach(order => renderOrderCard(order));
  });
}

function renderOrderCard(order) {
  const card = document.createElement('div');
  card.classList.add('order-card', 'glassy');

  const itemsText = order.items ? order.items.map(i => `${i.qty}x ${i.name}`).join(', ') : '';

  card.innerHTML = `
    <div class="order-id">Order #${order.paystackRef || order.id}</div>
    <div class="order-owner">Customer: ${order.customerUsername || ''}</div>
    <div class="order-location">${order.restaurantName || ''}</div>
    <div class="order-summary">Items: ${itemsText}</div>
    <div class="order-total">Total: ₦${order.totalAmount || ''}</div>
    <div class="order-time">Placed: ${order.createdAt?.toDate().toLocaleString() || ''}</div>
    ${order.deliveredTo ? `<div class="order-destination">Destination: ${order.deliveredTo}</div>` : ''}
    ${order.declineReason ? `<div class="decline-reason">Reason: ${order.declineReason}</div>` : ""}
    <div class="actions">
      <button class="assign-btn">Assign</button>
      <button class="decline-btn">Decline</button>
    </div>
  `;

  card.querySelector('.assign-btn').addEventListener('click', () => {
    activeOrder = order;
    activeCard = card;
    card.querySelector('.assign-btn').style.background = "orange";
    openMerchantListModal(order);
  });

  card.querySelector('.decline-btn').addEventListener('click', () => {
    openDeclineModal(order.id, card);
  });

  ordersList.appendChild(card);
}

/* ------------------------------
   CHECK IF MERCHANT ON DUTY
------------------------------ */
async function isMerchantOnDuty(merchantId) {
  try {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
    const dayDocRef = doc(db, "calendars", merchantId, "days", dateStr);
    const daySnap = await getDoc(dayDocRef);

    if (!daySnap.exists()) return false;
    const data = daySnap.data();
    if (!data.shifts || data.shifts.length === 0) return false;

    const nowMinutes = today.getHours() * 60 + today.getMinutes();
    return data.shifts.some(shift => {
      const [sh, sm] = shift.start.split(":").map(Number);
      const [eh, em] = shift.end.split(":").map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      return nowMinutes >= start && nowMinutes <= end;
    });
  } catch {
    return false;
  }
}
/* ------------------------------
   MERCHANT LIST MODAL (FIXED)
------------------------------ */
async function openMerchantListModal(order) {
  assignModal.content.innerHTML = `<p>Loading merchants...</p>`;
  assignModal.overlay.style.display = "flex";

  // Get restaurant coords (optional)
  let resLat = null, resLng = null;
  try {
    const restRef = doc(db, "restaurants", order.restaurantName);
    const restSnap = await getDoc(restRef);
    if (restSnap.exists()) {
      const r = restSnap.data();
      resLat = r.lat || null;
      resLng = r.lng || null;
    }
  } catch (err) {
    console.error("Error fetching restaurant location:", err);
  }

  // Get merchants
  const merchantsSnap = await getDocs(collection(db, "merchants"));
  assignModal.content.innerHTML = `<h4>Available Merchants</h4>`;

  const isHostelOrder = order.tag?.toLowerCase() === "potters lodge";
  let anyShown = false;

  for (const mDoc of merchantsSnap.docs) {
    const m = { id: mDoc.id, ...mDoc.data() };

    // Skip merchants who declined
    if (order.declinedBy && order.declinedBy.includes(m.id)) continue;

    // Hostel vs normal filter
    if (isHostelOrder) {
      if (m.role?.toLowerCase() !== "hostel") continue;
    } else {
      if (m.role?.toLowerCase() === "hostel") continue;
    }

    // Availability + duty check
    let onDuty = await isMerchantOnDuty(m.id);
    if (m.available === false) continue;

    // If not on duty → still show them (for debugging)
    if (!onDuty) {
      console.log("Skipping off-duty merchant:", m.fullname || m.username);
      continue;
    }

    // Distance
    let distanceText = '';
    if (m.lat && m.lng && resLat && resLng) {
      const km = calculateDistance(m.lat, m.lng, resLat, resLng);
      if (km) distanceText = `Distance: ${km} km`;
    }

    // Build card
    const div = document.createElement('div');
    Object.assign(div.style, {
      display: "flex", flexDirection: "column", gap: "4px",
      borderRadius: "8px",
      padding: "0.6rem", marginBottom: "0.5rem", cursor: "pointer",
      color: "#fff"
    });

    if (m.role?.toLowerCase() === "hostel") {
      div.style.background = m.gender?.toLowerCase() === "male"
        ? "rgba(0,123,255,0.6)"
        : "rgba(255,105,180,0.6)";
    } else {
      div.style.background = "rgba(255,255,255,0.08)";
    }

    div.innerHTML = `
      <strong>${m.fullname || m.username || 'Merchant'}</strong>
      <span>Orders: ${m.activeOrders || 0}</span>
      <span>${distanceText}</span>
    `;

    div.addEventListener('click', async () => {
      if (!confirm(`Assign order to ${m.fullname || m.username}?`)) return;
      await updateDoc(doc(db, "orders", order.id), {
        orderStatus: "pending",
        assignedMerchantId: m.id,
        assignedMerchantName: m.fullname || m.username || "",
        assignedMerchantImage: m.profileImage || "",
        assignedAt: new Date()
      });
      alert(`Order assigned to ${m.fullname || m.username}`);
      assignModal.overlay.style.display = "none";
      activeCard.querySelector('.assign-btn').textContent = "Assigned";
      activeCard.querySelector('.assign-btn').style.background = "#90ee90";
      activeOrder = null;
      activeCard = null;
    });

    assignModal.content.appendChild(div);
    anyShown = true;
  }

  if (!anyShown) {
    assignModal.content.innerHTML = `<p>No eligible merchants available right now.</p>`;
  }
}

/* ------------------------------
   DECLINE MODAL (ADMIN DECLINE)
------------------------------ */
function openDeclineModal(orderId, card) {
  declineModal.content.innerHTML = `
    <textarea id="declineReason" rows="4" placeholder="Enter reason..." 
      style="width:100%;padding:0.5rem;border-radius:8px;border:none;"></textarea>
    <button id="confirmDeclineBtn"
      style="margin-top:0.8rem;background:#e74c3c;color:#fff;border:none;
      border-radius:8px;padding:0.5rem 1rem;cursor:pointer;">Confirm Decline</button>
  `;
  declineModal.overlay.style.display = "flex";

  document.getElementById("confirmDeclineBtn").addEventListener("click", async () => {
    const reason = document.getElementById("declineReason").value.trim();
    if (!reason) {
      alert("Reason is required.");
      return;
    }
    await updateDoc(doc(db, "orders", orderId), {
      orderStatus: "declined",
      adminDeclineReason: reason
    });
    declineModal.overlay.style.display = "none";
    alert("Order declined.");
    card.querySelector('.decline-btn').disabled = true;
  });
}

/* ------------------------------
   INIT
------------------------------ */
listenToPendingOrders();
