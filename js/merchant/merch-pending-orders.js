// File: merch-pending-orders.js
import { auth, db } from '../firebase.js';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

const pendingTab = document.getElementById('pending');
const deliveredTab = document.getElementById('delivered');
const declinedTab = document.getElementById('declined');

/* ------------------------------
   HELPERS
------------------------------ */
function fmtTime(ts) {
  if (!ts) return '—';
  try {
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return (
      d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return '—';
  }
}

/* ------------------------------
   CREATE ORDER CARD
------------------------------ */
function createOrderCard(order, type = "pending", currentUser) {
  const div = document.createElement('div');
  div.classList.add('order-card');

  let merchantText = order.assignedMerchantName || order.merchantUsername || '—';
  let total = order.totalAmount || 0;
  let createdAt = fmtTime(order.createdAt);

  let doneBtnHtml = '';
  if (type === "pending") doneBtnHtml = `<button class="done-btn">Done</button>`;

  // Build reason preview if declined
  let reasonPreview = "";
  if (type === "declined") {
    const reason = order.declines?.[currentUser.uid]?.reason || "No reason provided.";
    const shortReason = reason.length > 20 ? reason.substring(0, 20) + "..." : reason;
    reasonPreview = `<p class="reason-preview" style="color:#ffaaaa;cursor:pointer;">Reason: ${shortReason}</p>`;
  }

  div.innerHTML = `
    <div class="order-top">
      <h4>Order ID: #${order.paystackRef || order.id}</h4>
    </div>
    <div class="order-bottom">
      <p>Total: ₦${Number(total).toLocaleString()}</p>
      <span class="view-btn">${type === "declined" ? "View Receipt" : "Details"}</span>
    </div>
    <p>Date: ${createdAt}</p>
    <span class="merchant-name">Merchant: ${merchantText}</span>
    ${doneBtnHtml}
    ${reasonPreview}
  `;

  // ✅ Done button → mark delivered
  const doneBtn = div.querySelector('.done-btn');
  doneBtn?.addEventListener('click', async () => {
    try {
      await updateDoc(doc(db, "orders", order.id), {
        orderStatus: "delivered",
        deliveredTime: serverTimestamp()
      });
      alert("✅ Order marked as delivered");
      if (pendingTab.contains(div)) {
        pendingTab.removeChild(div);
        deliveredTab.appendChild(div);
      }
    } catch (err) {
      console.error("Error marking delivered:", err);
      alert("❌ Failed to update order");
    }
  });

  // View receipt
  const btn = div.querySelector('.view-btn');
  btn.addEventListener('click', () => {
    window.location.href = `receipt.html?orderId=${order.id}`;
  });

  // Declined reason modal
  if (type === "declined") {
    const reasonEl = div.querySelector('.reason-preview');
    reasonEl?.addEventListener('click', () => {
      const reason = order.declines?.[currentUser.uid]?.reason || "No reason provided.";

      const overlay = document.createElement('div');
      Object.assign(overlay.style, {
        position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
        background: "rgba(0,0,0,0.6)", display: "flex",
        justifyContent: "center", alignItems: "center", zIndex: 9999
      });

      const modal = document.createElement('div');
      Object.assign(modal.style, {
        background: "#fff", color: "#000", padding: "1rem",
        borderRadius: "8px", maxWidth: "400px", textAlign: "center"
      });
      modal.textContent = reason;

      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      overlay.addEventListener('click', () => document.body.removeChild(overlay));
    });
  }

  return div;
}

/* ------------------------------
   LISTENERS
------------------------------ */
function listenToOrders(currentUser) {
  // Pending
  const qPending = query(
    collection(db, "orders"),
    where("assignedMerchantId", "==", currentUser.uid),
    where("orderStatus", "==", "accepted"),
    orderBy("createdAt", "asc")
  );
  onSnapshot(qPending, (snapshot) => {
    pendingTab.innerHTML = '';
    snapshot.forEach(docSnap => {
      const order = { id: docSnap.id, ...docSnap.data() };
      pendingTab.appendChild(createOrderCard(order, "pending", currentUser));
    });
  });

  // Delivered
  const qDelivered = query(
    collection(db, "orders"),
    where("assignedMerchantId", "==", currentUser.uid),
    where("orderStatus", "==", "delivered"),
    orderBy("deliveredTime", "desc")
  );
  onSnapshot(qDelivered, (snapshot) => {
    deliveredTab.innerHTML = '';
    snapshot.forEach(docSnap => {
      const order = { id: docSnap.id, ...docSnap.data() };
      deliveredTab.appendChild(createOrderCard(order, "delivered", currentUser));
    });
  });

  // Declined
  const qDeclined = query(
    collection(db, "orders"),
    where("declinedBy", "array-contains", currentUser.uid),
    orderBy("declinedAt", "desc")
  );
  onSnapshot(qDeclined, (snapshot) => {
    declinedTab.innerHTML = '';
    snapshot.forEach(docSnap => {
      const order = { id: docSnap.id, ...docSnap.data() };
      declinedTab.appendChild(createOrderCard(order, "declined", currentUser));
    });
  });
}

/* ------------------------------
   INIT
------------------------------ */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../merch-auth.html";
    return;
  }
  listenToOrders(user);
});

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});