import { auth, db } from '../firebase.js';
import {
  collection, query, where, onSnapshot,
  updateDoc, doc, getDocs, getDoc, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

const ordersList = document.querySelector('.orders-list');
let timers = {}; // auto-accept timeout

/* ------------------------------
HELPERS
------------------------------ */
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

const declineModal = buildModal("declineModal", "Decline Order");

/* ------------------------------
LISTEN TO ASSIGNED ORDERS
------------------------------ */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    console.log("❌ No merchant logged in.");
    return;
  }

  const q = query(collection(db, "orders"), where("assignedMerchantId", "==", user.uid));
  onSnapshot(q, (snapshot) => {
    ordersList.innerHTML = "";
    snapshot.forEach(docSnap => {
      const order = { id: docSnap.id, ...docSnap.data() };
      if (order.orderStatus === "pending") {
        handleAutoAccept(order, user);
        renderOrderCard(order, user);
      }
    });
  });
});

/* ------------------------------
AUTO ACCEPT CHECK
------------------------------ */
function handleAutoAccept(order, user) {
  const baseTime = order.assignedAt?.toDate?.() || order.createdAt?.toDate?.() || new Date();
  const expiryMs = baseTime.getTime() + (3 * 60 * 1000); // 3 mins
  const now = Date.now();

  // If already past deadline → accept immediately
  if (now >= expiryMs) {
    if (order.orderStatus === "pending") {
      console.log("⚡ Order already expired, auto-accepting:", order.id);
      autoAccept(order, user);
    }
    return;
  }

  // Otherwise schedule timeout if not already
  if (!timers[order.id]) {
    const delay = expiryMs - now;
    timers[order.id] = setTimeout(() => autoAccept(order, user), delay);
  }
}

/* ------------------------------
RENDER ORDER CARD
------------------------------ */
function renderOrderCard(order, user) {
  const card = document.createElement("div");
  card.classList.add("order-card", "glassy");

  // Countdown reference
  const baseTime = order.assignedAt?.toDate?.() || order.createdAt?.toDate?.() || new Date();
  const expiryMs = baseTime.getTime() + (3 * 60 * 1000); // 5 mins
  const delay = Math.max(0, expiryMs - Date.now());

  if (!timers[order.id]) {
    timers[order.id] = setTimeout(() => autoAccept(order, user), delay);
  }

  const itemsText = order.items?.map(i => `${i.qty}x ${i.name}`).join(", ") || "";

  card.innerHTML = `
    <div class="order-id">Order #${order.paystackRef || order.id}</div>
    <div class="order-owner">Customer: ${order.customerUsername || ''}</div>
    <div class="order-owner-room">Room: ${order.customerRoom || ''}</div>
    <div class="order-location">Restaurant: ${order.restaurantName || ''}</div>
    <br>
    <div class="order-summary">Order: ${itemsText}</div>
    <div class="order-total">Total: ₦${order.totalAmount || ''}</div>
    <div class="actions">
      <button class="accept-btn">Accept</button>
      <button class="decline-btn">Decline</button>
    </div>
  `;

  card.querySelector(".accept-btn").addEventListener("click", () => acceptOrder(order, user, false));
  card.querySelector(".decline-btn").addEventListener("click", () => openDeclineModal(order, user));

  ordersList.appendChild(card);
}

/* ------------------------------
ORDER ACTIONS
------------------------------ */

async function acceptOrder(order, user, auto = false) {
  clearTimeout(timers[order.id]);

  // For hostel merchants: skip extra merchant notifications
  const updateData = {
    orderStatus: "accepted",
    acceptedAt: serverTimestamp(),
    autoAccepted: auto,
    assignedMerchantName: user.displayName || "Merchant"
  };

  if (order.isHostel) {
    // Only update order, skip CallMeBot
    await updateDoc(doc(db, "orders", order.id), updateData);
    alert(auto ? "✅ Hostel order auto-accepted!" : `✅ Hostel order accepted! Customer room: ${order.customerRoom || 'N/A'}`);
  } else {
    // Normal merchant flow
    await updateDoc(doc(db, "orders", order.id), updateData);
    await sendOrderToExtraMerchants(order.id);
    await notifyReceiptMerchant(order, user);
    alert(auto ? "✅ Order auto-accepted and notification sent!" : "✅ Order accepted!");
  }
}

/**
 * Send accepted order to all linked extra merchants
 */
export async function sendOrderToExtraMerchants(orderId) {
  try {
    const orderRef = doc(db, "orders", orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) return;

    const order = orderSnap.data();
    
    if (order.isHostel){
      console.log("Skip CallMeBot alert", orderId);
      return;
    }
    
    if (order.extraSent) return; // Already sent

    if (!order.restaurantName) {
      console.warn("⚠️ Order has no restaurantName:", orderId, order);
      return;
    }

    // Find extra merchants linked to the restaurant
    const q = query(collection(db, "extraMerchants"), where("restaurantName", "==", order.restaurantName));
    const snap = await getDocs(q);
    if (snap.empty) {
      console.warn("⚠️ No extraMerchants found for restaurantName:", order.restaurantName);
      return;
    }

    for (const docSnap of snap.docs) {
      const extra = docSnap.data();
      if (!extra.phone || !extra.apiCode) continue;

      const msg = `📦 New Order!\n🍴 Restaurant: ${order.restaurantName}\n🆔 Order ID: ${order.id}\n👤 By: ${order.customerUsername || ''}`;
      const url = `https://api.callmebot.com/whatsapp.php?phone=${extra.phone}&text=${encodeURIComponent(msg)}&apikey=${extra.apiCode}`;

      // Fire-and-forget: no CORS issue
      const img = new Image();
      img.src = url;
      
      console.log("📲 Receipt merchant notified (img method):", data.phone);
    }

    // Mark order so it won’t send again
    await updateDoc(orderRef, { extraSent: true });
  } catch (err) {
    console.error("❌ Error sending order to extra merchants:", err);
  }
}

async function declineOrder(order, user, reason) {
  clearTimeout(timers[order.id]);

  await updateDoc(doc(db, "orders", order.id), {
    orderStatus: "pending_assignment",
    assignedMerchantId: null,
    assignedMerchantName: null,
    declinedAt: serverTimestamp(),
    lastDeclinedBy: user.displayName || user.email || user.uid,
    declinedBy: arrayUnion(user.uid),
    [`declines.${user.uid}`]: {
      reason,
      declinedAt: serverTimestamp()
    }
  });

  alert("❌ Order declined and returned for reassignment.");
}

async function autoAccept(order, user) {
  console.log("⏰ Auto-accept triggered:", order.id);
  await acceptOrder(order, user, true);
  alert(auto ? "✅ Order auto-accepted and notification sent!" : "✅ Order accepted!");
}

/* ------------------------------
DECLINE MODAL
------------------------------ */
function openDeclineModal(order, user) {
  declineModal.content.innerHTML = `
    <textarea id="declineReason" rows="4" placeholder="Enter reason..."
      style="width:100%;padding:0.5rem;border-radius:8px;border:none;"></textarea>
    <button id="confirmDeclineBtn"
      style="margin-top:0.8rem;background:#e74c3c;color:#fff;border:none;
      border-radius:8px;padding:0.5rem 1rem;cursor:pointer;">Confirm Decline</button>
  `;
  declineModal.overlay.style.display = "flex";

  document.getElementById("confirmDeclineBtn").addEventListener("click", () => {
    const reason = document.getElementById("declineReason").value.trim();
    if (!reason) return alert("Reason is required.");
    declineOrder(order, user, reason);
    declineModal.overlay.style.display = "none";
  });
}

/* ------------------------------
CALLMEBOT RECEIPT NOTIFY
------------------------------ */

/* ------------------------------
SEND TO ALL EXTRA MERCHANTS FOR RESTAURANT
------------------------------ */
async function notifyReceiptMerchant(orderData, merchantUser) {
  try {
    if (orderData.isHostel){
      console.log("Skip CALLMEBOT notify", orderData.id);
      return;
    }
    
    if (!orderData.restaurantName) {
      console.warn("⚠️ Order missing restaurantName:", orderData.id);
      return;
    }

    // Find merchants linked to this restaurant
    const q = query(
      collection(db, "extraMerchants"),
      where("restaurantName", "==", orderData.restaurantName)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      console.warn("⚠️ No receipt merchant for:", orderData.restaurantName);
      return;
    }

    // 🧾 Build detailed receipt message
    const header = `📦 New Order Accepted!
🍴 Restaurant: ${orderData.restaurantName}
🆔 Order ID: ${orderData.id}
👤 Accepted by: ${merchantUser.displayName || "Merchant"}
👤 Customer: ${orderData.customerUsername || "N/A"}
🏠 Room: ${orderData.customerRoom || "N/A"}
`;

    // Group items by category
    const grouped = {};
    let grandTotal = 0;

    (orderData.items || []).forEach(item => {
      const category = item.category || "Others";
      if (!grouped[category]) grouped[category] = { items: [], total: 0 };

      const lineTotal = (item.qty || 1) * (item.price || 0);
      grouped[category].items.push({
        name: item.name,
        qty: item.qty || 1,
        price: item.price || 0,
        total: lineTotal
      });
      grouped[category].total += lineTotal;
      grandTotal += lineTotal;
    });

    // Build section text
    let sections = "";
    for (const [category, data] of Object.entries(grouped)) {
      sections += `\n${category} (Total ₦${data.total})\n`;
      data.items.forEach(it => {
        sections += `  • ${it.name} x${it.qty} = ₦${it.total}\n`;
      });
    }

    // ➕ Add pack cost if available
    let packLine = "";
    if (orderData.packCharge && orderData.packCharge > 0) {
      packLine = `\n• Pack = ₦${orderData.packCharge}`;
      grandTotal += orderData.packCharge;
    }

    const footer = `${packLine}\n\n💰 Grand Total: ₦${grandTotal}`;

    const msg = header + sections + footer;

    // Send to each linked merchant via CallMeBot
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (!data.phone || !data.apiCode) continue;

      const url = `https://api.callmebot.com/whatsapp.php?phone=${data.phone}&text=${encodeURIComponent(msg)}&apikey=${data.apiCode}`;

      // Fire-and-forget via <img> to bypass CORS
      const img = new Image();
      img.src = url;

      console.log("📲 Receipt merchant notified (img method):", data.phone);
    }
  } catch (err) {
    console.error("❌ CallMeBot error:", err);
  }
}