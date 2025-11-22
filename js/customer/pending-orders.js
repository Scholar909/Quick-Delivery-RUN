import { auth, db } from '../firebase.js';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

// Tabs & containers
const pendingTab = document.getElementById('pending');
const deliveredTab = document.getElementById('delivered');
const declinedTab = document.getElementById('declined');
const tabButtons = document.querySelectorAll('.tab');

// -------- Tabs --------
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// Helpers
const naira = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

// Classify into Pending / Delivered / Declined per your rules
function getBucket(order) {
  const ps = (order.paymentStatus || '').toLowerCase();
  const os = (order.orderStatus || order.status || '').toLowerCase();

  const adminDeclined = os.includes("declined");
  const merchantDone =
    order.merchantDone === true || os === "completed" || os === "delivered";

  // ✅ Treat refunded and refund_required as declined for customers
  if (ps === "refund_required" || ps === "refunded") {
    return "declined";
  }

  // ✅ Normal success flow
  const paymentOk = ["success", "successful", "paid"].includes(ps);

  if (paymentOk) {
    if (adminDeclined) return "declined";
    if (merchantDone) return "delivered";
    return "pending";
  }

  // ✅ If explicitly declined without success
  if (adminDeclined) return "declined";
}

function getDeclineReason(order) {
  // Try common fields where a reason might live
  return (
    order.adminDeclineReason ||
    order.declineReason ||
    order.paystackReason ||
    order.gatewayReason ||
    ''
  );
}

// Build a card
function createOrderCard(order, bucket) {
  const card = document.createElement('div');
  card.classList.add('order-card');

  const merchantLabel = order.assignedMerchantName || order.merchantUsername || '—';
  const total = order.totalAmount || 0;
  const orderId = order.orderId || order.id;

  // 🔹 Format createdAt if present
  let dateStr = '';
  if (order.createdAt) {
    let dateObj;
    if (typeof order.createdAt.toDate === 'function') {
      dateObj = order.createdAt.toDate();
    } else {
      dateObj = new Date(order.createdAt);
    }
    dateStr =
      dateObj.toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }) +
      ' ' +
      dateObj.toLocaleTimeString('en-NG', {
        hour: '2-digit',
        minute: '2-digit'
      });
  }

  // 🔹 Declined reason preview
  let reasonPreview = "";
  if (bucket === "declined") {
    const reason =
      order.adminDeclineReason ||
      order.declineReason ||
      order.paystackReason ||
      order.gatewayReason ||
      "No reason provided.";

    const shortReason = reason.length > 20 ? reason.substring(0, 20) + "..." : reason;
    reasonPreview = `<p class="reason-preview" style="color:#ffaaaa;cursor:pointer;">Reason: ${shortReason}</p>`;
  }

  card.innerHTML = `
    <div class="order-top">
      <h4>Order ID: #${orderId}</h4>
    </div>
    <div class="order-bottom">
      <p>Total: ${naira(total)}</p>
      <span class="view-btn" data-id="${order.id}">
        ${bucket === "declined" ? "View Receipt" : "View Details"}
      </span>
    </div>
    <p class="merchant-name">Merchant: ${merchantLabel}</p>
    <p>Date: ${dateStr || '—'}</p>
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
  `;

  // ---------- attach click handlers ----------
  card.querySelector('.view-btn').addEventListener('click', () => {
    window.location.href = `receipt.html?orderId=${order.id}`;
  });

  if (bucket === "declined") {
    const reasonEl = card.querySelector('.reason-preview');
    reasonEl?.addEventListener('click', () => {
      const reason =
        order.adminDeclineReason ||
        order.declineReason ||
        order.paystackReason ||
        order.gatewayReason ||
        "No reason provided.";

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
  
// View full description
  const descEl = card.querySelector('.desc-preview');
  descEl?.addEventListener('click', () => {
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
    modal.textContent = order.orderDescription;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', () => document.body.removeChild(overlay));
  });
  
  if (bucket === "declined") {
    if (order.paymentStatus === "refund_required") {
      reasonPreview += `<p style="color:#e67e22;">Refund Required</p>`;
    }
    if (order.paymentStatus === "refunded") {
      reasonPreview += `<p style="color:#27ae60;">Refunded ✔</p>`;
    }
  }

  return card;
}

// Render lists
function renderOrders(orders) {
  pendingTab.innerHTML = '';
  deliveredTab.innerHTML = '';
  declinedTab.innerHTML = '';

  let counts = { pending: 0, delivered: 0, declined: 0 };

  orders.forEach(order => {
    const bucket = getBucket(order);
    if (!bucket) return;

    const card = createOrderCard(order, bucket);
    if (bucket === 'pending') {
      pendingTab.appendChild(card);
      counts.pending++;
    } else if (bucket === 'delivered') {
      deliveredTab.appendChild(card);
      counts.delivered++;
    } else if (bucket === 'declined') {
      declinedTab.appendChild(card);
      counts.declined++;
    }
  });

  if (!counts.pending)   pendingTab.innerHTML   = '<p>No pending orders.</p>';
  if (!counts.delivered) deliveredTab.innerHTML = '<p>No delivered orders.</p>';
  if (!counts.declined)  declinedTab.innerHTML  = '<p>No declined orders.</p>';
}

// Live query for this customer’s orders
let unsubscribe = null;
onAuthStateChanged(auth, user => {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  if (!user) {
    pendingTab.innerHTML = '<p>You must be logged in to see your orders.</p>';
    deliveredTab.innerHTML = '';
    declinedTab.innerHTML = '';
    return;
  }

  const q = query(
    collection(db, 'orders'),
    where('customerId', '==', user.uid),
    orderBy('createdAt', 'desc')
  );

  unsubscribe = onSnapshot(q, snapshot => {
    const orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderOrders(orders);
  }, (err) => {
    console.error('Orders listener error:', err);
    pendingTab.innerHTML = '<p>Could not load your orders right now.</p>';
  });
});