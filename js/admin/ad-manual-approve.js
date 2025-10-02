import { db } from '../firebase.js';
import {
  collection, query, where, onSnapshot, updateDoc, doc, runTransaction
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const pendingList = document.getElementById("pendingTab");
const refundList = document.getElementById("refundTab");

/* ------------------------------
   PENDING PAYMENTS
------------------------------ */
function listenPending() {
  const q = query(collection(db, "orders"), where("paymentStatus", "==", "manual_required"));
  onSnapshot(q, (snapshot) => {
    pendingList.innerHTML = '';
    snapshot.forEach(docSnap => renderPendingCard({ id: docSnap.id, ...docSnap.data() }));
  });
}

function renderPendingCard(order) {
  const card = document.createElement('div');
  card.classList.add('order-card', 'glassy');

  const createdAt = order.createdAt?.toDate 
    ? order.createdAt.toDate() 
    : new Date(order.createdAt || Date.now());

  card.innerHTML = `
    <div class="order-id">Order #${order.id}</div>
    <div class="order-owner">Customer: ${order.customerUsername || ''}</div>
    <div class="order-total">Total: ₦${order.totalAmount || ''}</div>
    <div class="order-bank">
      <p><strong>Bank:</strong> ${order.customerBankName || '—'}</p>
      <p><strong>Account Name:</strong> ${order.customerAccountName || '—'}</p>
      <p><strong>Account Number:</strong> ${order.customerAccountNumber || '—'}</p>
    </div>
    <div class="order-time"><strong>Created:</strong> ${createdAt.toLocaleString()}</div>
    <div class="actions">
      <button class="approve-btn">Approve</button>
      <button class="decline-btn">Decline</button>
    </div>
  `;

  // ✅ Approve button
  card.querySelector('.approve-btn').addEventListener('click', async () => {
    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, "orders", order.id);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Order not found");
        const orderData = orderSnap.data();

        // linked alert cleanup
        const alertId = orderData.matchedByAlertId || orderData.refundCandidateAlertId;
        if (alertId) {
          const alertRef = doc(db, "payment_alerts", alertId);
          const alertSnap = await transaction.get(alertRef);
          if (alertSnap.exists() && alertSnap.data().processed !== "true") {
            transaction.update(alertRef, { processed: "true" });
          }
        }

        transaction.update(orderRef, {
          paymentStatus: "successful",
          paymentMatchedAt: new Date()
        });
      });

      alert("Payment approved.");
      card.remove();
    } catch (err) {
      console.error("Approve error:", err);
      alert("Could not approve payment. See console for details.");
    }
  });

  // ✅ Decline Button with 10-min cooldown (based on createdAt)
  const declineBtn = card.querySelector('.decline-btn');
  const cooldownMs = 15 * 60 * 1000;
  const readyAt = createdAt.getTime() + cooldownMs;

  function updateDeclineButton() {
    let now = Date.now();
    if (now >= readyAt) {
      declineBtn.disabled = false;
      declineBtn.textContent = "Decline";
    } else {
      declineBtn.disabled = true;
      let remaining = Math.ceil((readyAt - now) / 60000);
      declineBtn.textContent = `Decline (available in ${remaining}m)`;
      setTimeout(updateDeclineButton, 30000);
    }
  }
  updateDeclineButton();

  declineBtn.addEventListener('click', async () => {
    if (declineBtn.disabled) return;
    await updateDoc(doc(db, "orders", order.id), { paymentStatus: "declined" });
    alert("Payment declined.");
    card.remove();
  });

  pendingList.appendChild(card);
}

/* ------------------------------
   REFUNDS
------------------------------ */
function listenRefunds() {
  const q = query(collection(db, "orders"), where("paymentStatus", "==", "refund_required"));
  onSnapshot(q, (snapshot) => {
    refundList.innerHTML = '';
    snapshot.forEach(docSnap => renderRefundCard({ id: docSnap.id, ...docSnap.data() }));
  });
}

function renderRefundCard(order) {
  const card = document.createElement('div');
  card.classList.add('order-card', 'glassy');
  card.style.borderLeft = "5px solid red";

  card.innerHTML = `
    <div class="order-id">Refund Required: #${order.id}</div>
    <div class="order-owner">Customer: ${order.customerUsername || ''}</div>
    <div class="order-total">Total: ₦${order.totalAmount || ''}</div>
    <div class="refund-bank">
      <p><strong>Bank:</strong> ${order.customerBankName || "—"}</p>
      <p><strong>Account Name:</strong> ${order.customerAccountName || order.customerName || "—"}</p>
      <p><strong>Account Number:</strong> ${order.customerAccountNumber || "—"}</p>
    </div>
    <div class="actions">
      <button class="refund-btn">Mark as Refunded</button>
    </div>
  `;

  // ✅ Modified Refund Button
  card.querySelector('.refund-btn').addEventListener('click', async () => {
    if (!confirm("Confirm refund has been made?")) return;

    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, "orders", order.id);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) throw new Error("Order not found");
        const orderData = orderSnap.data();

        // Look for linked payment_alert
        const alertId = orderData.refundCandidateAlertId || orderData.matchedByAlertId;
        if (alertId) {
          const alertRef = doc(db, "payment_alerts", alertId);
          const alertSnap = await transaction.get(alertRef);
          if (alertSnap.exists() && !alertSnap.data().processed === "false") {
            transaction.update(alertRef, { processed: "true" });
          }
        }

        transaction.update(orderRef, {
          paymentStatus: "refunded",
          orderStatus: "declined",
          refundStatus: "refunded",
          adminDeclineReason: "Refund issued by admin"
        });
      });

      alert("Refund marked as completed.");
      card.remove();
    } catch (err) {
      console.error("Refund error:", err);
      alert("Could not mark refund. See console for details.");
    }
  });

  refundList.appendChild(card);
}

/* ------------------------------
   INIT
------------------------------ */
listenPending();
listenRefunds();