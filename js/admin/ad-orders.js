// ad-orders.js
import { auth, db } from '../firebase.js';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

const pendingTab = document.getElementById('pending');
const deliveredTab = document.getElementById('delivered');
const declinedTab = document.getElementById('declined');

// ---------- helpers ----------
function fmtTime(ts) {
  if (!ts) return '—';
  try {
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return (
      d.toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }) +
      ' ' +
      d.toLocaleTimeString('en-NG', {
        hour: '2-digit',
        minute: '2-digit'
      })
    );
  } catch {
    return '—';
  }
}

function createOrderCard(order, type = "pending") {
  const div = document.createElement('div');
  div.classList.add('order-card');

  let merchantText = order.assignedMerchantName || order.merchantUsername || '—';
  let total = order.totalAmount || 0;
  let createdAt = fmtTime(order.createdAt);

  // Build reason preview if declined
  let reasonPreview = "";
  if (type === "declined") {
    const reason = order.adminDeclineReason || order.declineReason || "No reason provided.";
    const shortReason = reason.length > 20 ? reason.substring(0, 20) + "..." : reason;
    reasonPreview = `<p class="reason-preview" style="color:#ffaaaa;cursor:pointer;">Reason: ${shortReason}</p>`;
  }

  // 🔹 Refund / Payment Status info
  let extraStatus = "";
  if (type === "declined") {
    if (order.paymentStatus === "refund_required") {
      extraStatus += `<p class="refund-status" style="color:#e67e22;">Refund Required</p>`;
    }
    if (order.refundStatus === "refunded") {
      extraStatus += `<p class="refund-status" style="color:#27ae60;">Refunded ✔</p>`;
    }
  }

  div.innerHTML = `
    <div class="order-top">
      <h4>Order ID: #${order.paystackRef || order.id}</h4>
      <p class="merchant-name">Merchant: ${merchantText}</p>
    </div>
    <div class="order-bottom">
      <p>Total: ₦${Number(total).toLocaleString()}</p>
      <span class="view-btn">${type === "declined" ? "View Receipt" : "View Details"}</span>
    </div>
    <p>Date: ${createdAt}</p>
    ${reasonPreview}
    
    ${order.orderDescription ? `
      <p class="desc-preview" 
         style="color:#8ab4ff; cursor:pointer; margin-top:6px;">
         Description: ${
           order.orderDescription.length > 25
             ? order.orderDescription.substring(0, 25) + "..."
             : order.orderDescription
         }
      </p>
    ` : ""}
    
    ${extraStatus}
  `;

  // ---------- attach click handlers ----------
  const btn = div.querySelector('.view-btn');
  btn.addEventListener('click', () => {
    // always go to receipt
    window.location.href = `receipt.html?orderId=${order.id}`;
  });

  if (type === "declined") {
    const reasonEl = div.querySelector('.reason-preview');
    reasonEl?.addEventListener('click', () => {
      const reason = order.adminDeclineReason || order.declineReason || "No reason provided.";

      // modal overlay
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
  
  // 🔹 Description full modal
  const descEl = div.querySelector('.desc-preview');
  descEl?.addEventListener('click', () => {
    const fullDesc = order.orderDescription || "No description provided.";
  
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: "fixed",
      top: 0, left: 0,
      width: "100%", height: "100%",
      background: "rgba(0,0,0,0.6)",
      display: "flex", justifyContent: "center", alignItems: "center",
      zIndex: 9999
    });
  
    const modal = document.createElement('div');
    Object.assign(modal.style, {
      background: "#fff",
      color: "#000",
      padding: "1rem",
      borderRadius: "8px",
      maxWidth: "400px",
      textAlign: "center"
    });
  
    modal.textContent = fullDesc;
  
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener("click", () => document.body.removeChild(overlay));
  });

  return div;
}

// ---------- render ----------
function renderOrders(snapshot, container, type) {
  container.innerHTML = '';
  snapshot.forEach(docSnap => {
    const order = { id: docSnap.id, ...docSnap.data() };
    container.appendChild(createOrderCard(order, type));
  });
}

// ---------- listeners ----------
function listenToOrders() {
  // Pending: assigned + accepted
  const qPending = query(
    collection(db, "orders"),
    where("orderStatus", "in", ["pending", "processing", "assigned", "accepted"]),
    orderBy("createdAt", "desc")
  );
  onSnapshot(qPending, (ss) => renderOrders(ss, pendingTab, "pending"));

  // Delivered
  const qDelivered = query(
    collection(db, "orders"),
    where("orderStatus", "==", "delivered"),
    orderBy("deliveredTime", "desc")
  );
  onSnapshot(qDelivered, (ss) => renderOrders(ss, deliveredTab, "delivered"));

  // Declined
  const qDeclined = query(
    collection(db, "orders"),
    where("orderStatus", "==", "declined"),
    orderBy("createdAt", "desc")
  );
  onSnapshot(qDeclined, (ss) => renderOrders(ss, declinedTab, "declined"));
}

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ---------- init ----------
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "../admin-login.html";
    return;
  }
  listenToOrders();
});