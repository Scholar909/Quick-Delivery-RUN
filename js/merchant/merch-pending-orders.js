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
  serverTimestamp,
  getDoc
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

const pendingTab = document.getElementById('pending');
const deliveredTab = document.getElementById('delivered');
const declinedTab = document.getElementById('declined');

let isHostelMerchant = false;

async function checkHostelMerchant(uid) {
  const docSnap = await getDoc(doc(db, "hostelMerchants", uid));
  isHostelMerchant = docSnap.exists();
}

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

// ---------- MODAL BUILDER ----------
function buildModal(id, title) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();

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

/* ------------------------------
   CREATE ORDER CARD
------------------------------ */
/* ------------------------------
   CREATE ORDER CARD (FIXED)
------------------------------ */
function createOrderCard(order, type = "pending", currentUser) {
  const div = document.createElement('div');
  div.classList.add('order-card');

  let merchantText = order.assignedMerchantName || order.merchantUsername || '—';
  let total = order.totalAmount || 0;
  let createdAt = fmtTime(order.createdAt);
  const autoBadge = order.autoAccepted ? `<span class="auto-badge">Auto</span>` : "";
  const hostelBadge = order.isHostel ? `<span class="hostel-badge">Hostel</span>` : "";
  const pottersBadge = order.deliveredTo?.includes('Potters lodge') ? `<span class="potters-badge">Potters Lodge</span>` : "";
  
    // Show location description if Potters Lodge and description exists
  let locationPreview = "";
  if (order.deliveredTo?.includes("Potters lodge") && order.deliveryDescription) {
    const shortLoc = order.deliveryDescription.length > 25 
      ? order.deliveryDescription.substring(0, 25) + "..." 
      : order.deliveryDescription;
  
    locationPreview = `
      <p class="location-preview" style="color:#aaddff;cursor:pointer;">
        Location: ${shortLoc}
      </p>
    `;
  }
  
  let doneBtnHtml = '';
  if (type === "pending") doneBtnHtml = `<button class="done-btn" type="submit">Done</button>`;

  let fromText = order.fromMerchant ? `<p>From Merchant: ${order.fromMerchant}</p>` : '';
  let toText   = order.toMerchant   ? `<p>To Merchant: ${order.toMerchant}</p>` : '';

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
    <span>${autoBadge} ${hostelBadge} ${pottersBadge}</span>
    ${locationPreview}
    <div class="order-bottom">
      <p>Total: ₦${Number(total).toLocaleString()}</p>
      <span class="view-btn">${type === "declined" ? "View Receipt" : "Details"}</span>
    </div>
    <p>Date: ${createdAt}</p>
    <span class="merchant-name">Merchant: ${merchantText}</span>
    ${isHostelMerchant ? fromText : ''}
    ${!isHostelMerchant ? toText : ''}
    ${doneBtnHtml}
    ${reasonPreview}
  `;

  const doneBtn = div.querySelector('.done-btn');
  doneBtn?.addEventListener('click', async () => {
    if (isHostelMerchant) {
      await updateOrderToDeliveredForEveryone(order.id);
      if (pendingTab.contains(div)) {
        pendingTab.removeChild(div);
        deliveredTab.appendChild(div);
      } 
    }else {
      openLocationModal(order);
    }
  });

  const btn = div.querySelector('.view-btn');
  btn.addEventListener('click', () => {
    // Always take to receipt
    window.location.href = `receipt.html?orderId=${order.id}`;
  });

  // Declined reason modal
  if (type === "declined") {
    const reasonEl = div.querySelector('.reason-preview');
    reasonEl?.addEventListener('click', () => {
      const reason = order.declines?.[currentUser.uid]?.reason || "No reason provided.";

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
  
  // Location modal (for Potters Lodge description)
  if (order.deliveredTo?.includes("Potters lodge") && order.deliveryDescription) {
    const locEl = div.querySelector('.location-preview');
    locEl?.addEventListener('click', () => {
      const fullLoc = order.deliveryDescription;
  
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
      modal.textContent = fullLoc;
  
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
  
      overlay.addEventListener('click', () => document.body.removeChild(overlay));
    });
  }

  return div;
}

/* ------------------------------
   ACCEPT ORDER (HOSTEL SUPPORT)
------------------------------ */
async function acceptOrder(order, user, auto = false) {
  const updateData = {
    orderStatus: "accepted",
    acceptedAt: serverTimestamp(),
    autoAccepted: auto,
    assignedMerchantName: user.displayName || user.email || 'Merchant'
  };

  const userDoc = await getDoc(doc(db, "hostelMerchants", user.uid));
  const isHostel = userDoc.exists();
  if (isHostel) updateData.isHostel = true;

  await updateDoc(doc(db, "orders", order.id), updateData);
  
  if (order.isHostel) {
    console.log("Skipping CallMeBot for hostel merchant:", order.assignedMerchantName);
    return;
  }

  // Only alert if not hostel merchant
  alert(auto ? "✅ Order auto-accepted!" : "✅ Order accepted!");
}

/* ------------------------------
   RENDER ORDERS
------------------------------ */
function renderOrders(snapshot, container, type, currentUser) {
  container.innerHTML = '';
  snapshot.forEach(docSnap => {
    const order = { id: docSnap.id, ...docSnap.data() };
    container.appendChild(createOrderCard(order, type, currentUser));
  });
}

/* ------------------------------
   LISTENERS (MERGED AND FIXED)
------------------------------ */
function listenToOrders(currentUser) {
  // ------------------------------
  // PENDING ORDERS
  // ------------------------------
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

  // ------------------------------
  // DELIVERED ORDERS (MERGE ASSIGNED + FROM MERCHANT)
  // ------------------------------
  const deliveredOrdersMap = new Map();

  const qDeliveredAssigned = query(
    collection(db, "orders"),
    where("assignedMerchantId", "==", currentUser.uid),
    where("orderStatus", "==", "delivered"),
    orderBy("deliveredTime", "desc")
  );

  const qDeliveredFrom = query(
    collection(db, "orders"),
    where("fromMerchantId", "==", currentUser.uid),
    where("orderStatus", "==", "delivered")
  );

  function updateDeliveredTab() {
    deliveredTab.innerHTML = '';
    Array.from(deliveredOrdersMap.values())
      .sort((a, b) => (b.deliveredTime?.seconds || 0) - (a.deliveredTime?.seconds || 0))
      .forEach(order => {
        deliveredTab.appendChild(createOrderCard(order, "delivered", currentUser));
      });
  }

  onSnapshot(qDeliveredAssigned, (snapshot) => {
    snapshot.forEach(docSnap => {
      deliveredOrdersMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
    });
    updateDeliveredTab();
  });

  onSnapshot(qDeliveredFrom, (snapshot) => {
    snapshot.forEach(docSnap => {
      deliveredOrdersMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
    });
    updateDeliveredTab();
  });

  // ------------------------------
  // DECLINED ORDERS
  // ------------------------------
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

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

/* ------------------------------
   INIT
------------------------------ */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../merch-auth.html";
    return;
  }
  await checkHostelMerchant(user.uid);
  listenToOrders(user);
});

/* ------------------------------
   LOCATION & DELIVERY FLOW
------------------------------ */
function openLocationModal(order) {
  const existing = document.getElementById('locationModal');
  if (existing) existing.remove();

  const { overlay, content } = buildModal('locationModal', 'Select Delivery Location');
  overlay.style.display = 'flex';

  content.innerHTML = `
    <button id="roomBtn">Room directly</button>
    <button id="pottersBtn">Potters lodge</button>
  `;

  document.getElementById('roomBtn').addEventListener('click', async () => {
    await markDeliveredWithLocation(order.id, 'Room directly');
    overlay.style.display = 'none';
  });

  document.getElementById('pottersBtn').addEventListener('click', () => {
    openPottersLodgeModal(order, overlay);
  });
}

function openPottersLodgeModal(order, prevOverlay) {
  const existing = document.getElementById('pottersModal');
  if (existing) existing.remove();

  const { overlay, content } = buildModal('pottersModal', 'Potters Lodge Delivery');

  content.innerHTML = `
    <p>Select Gender:</p>
    <button id="maleBtn">Male</button>
    <button id="femaleBtn">Female</button>
    <div id="genderDesc" style="margin-top:1rem;"></div>
  `;
  overlay.style.display = 'flex';
  prevOverlay.style.display = 'none';

  const genderDiv = content.querySelector('#genderDesc');

  function createInputAndDone(gender) {
    genderDiv.innerHTML = `
      <input type="text" id="hostelDesc" placeholder="Enter exact location/description" style="width:100%;padding:0.5rem;border-radius:8px;margin-bottom:0.5rem;">
      <button id="doneHostelBtn">Done</button>
    `;
    content.querySelector('#doneHostelBtn').addEventListener('click', async () => {
      const desc = document.getElementById('hostelDesc').value.trim();
      if (!desc) return alert("Please enter location/description");

      // Save previous merchant as fromMerchant
      const orderRef = doc(db, "orders", order.id);
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.data();
      const prevMerchant = orderData.assignedMerchantName || "Unknown";

      await markDeliveredWithLocation(order.id, `Potters lodge (${gender}) hostel`, desc, prevMerchant);
      overlay.style.display = 'none';
    });
  }

  content.querySelector('#maleBtn').addEventListener('click', () => createInputAndDone('Male'));
  content.querySelector('#femaleBtn').addEventListener('click', () => createInputAndDone('Female'));
}

async function markDeliveredWithLocation(orderId, location, description = '', fromMerchantName = '', fromMerchantId = '') {
  try {
    const ref = doc(db, "orders", orderId);
    const orderSnap = await getDoc(ref);
    const orderData = orderSnap.data();

    let updateData = {
      deliveredTo: location,
      deliveryDescription: description,
    };

    if (location.startsWith('Potters lodge')) {
      // Normal merchant → Potters Lodge → back to admin
      updateData = {
        ...updateData,
        orderStatus: "pending_assignment",
        tag: "potters lodge",
        fromMerchant: fromMerchantName,
        fromMerchantId: fromMerchantId || orderData.assignedMerchantId,
        assignedMerchantId: null,   // free it up for admin reassign
        assignedMerchantName: "",
        toMerchant: ""
      };
    } else if (location.startsWith('Room')) {
      // Normal merchant completes delivery
      updateData = {
        ...updateData,
        orderStatus: "delivered",
        deliveredTime: serverTimestamp(),
      };
    } else {
      // fallback safe
      updateData.orderStatus = "pending_assignment";
    }

    await updateDoc(ref, updateData);

    alert(updateData.orderStatus === "delivered"
      ? `✅ Order marked as delivered (${location})`
      : "✅ Order ready for admin assignment"
    );

    // Only hostel merchant visually moves to delivered
    if (orderData.isHostel && updateData.orderStatus === "delivered") {
      const card = Array.from(pendingTab.children).find(c => c.querySelector('h4').textContent.includes(orderId));
      if (card) {
        pendingTab.removeChild(card);
        deliveredTab.appendChild(card);
      }
    }

  } catch (err) {
    console.error("Error updating order:", err);
    alert("❌ Failed to update order");
  }
}

async function updateOrderToDeliveredForEveryone(orderId) {
  try {
    const ref = doc(db, "orders", orderId);
    await updateDoc(ref, {
      orderStatus: "delivered",
      deliveredTime: serverTimestamp()
    });

    // That ensures admin, customer, fromMerchant and hostel merchant
    // all see it as delivered (since they all watch orderStatus).
  } catch (err) {
    console.error("Error marking delivered:", err);
    alert("❌ Failed to mark delivered");
  }
}