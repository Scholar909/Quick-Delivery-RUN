import { auth, db } from '../firebase.js';
import {
  collection,
  onSnapshot,
  query,
  addDoc,
  orderBy,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  where,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

// DOM elements
const restaurantSelect = document.getElementById('restaurantSelect');
const foodItemsContainer = document.getElementById('food-items');
const orderButton = document.getElementById('orderButton');
const orderCount = document.getElementById('orderCount');
const orderModal = document.getElementById('orderModal');
const closeModal = document.getElementById('closeModal');
const orderTableBody = document.querySelector('#orderTable tbody');
const orderRestaurantName = document.getElementById('orderRestaurantName');
const addPackCheckbox = document.getElementById('addPack');
const orderTotalElem = document.getElementById('orderTotal');
const payNowBtn = document.getElementById('payNowBtn');

// Ive Paid modal (2–sided)
const bankModal = document.getElementById('bankModal');
const closeBankModal = document.getElementById('closeBankModal');
const ivePaidBtn = document.getElementById('ivePaidBtn');

// Step navigation DOM
const step1 = document.getElementById("bankStep1");
const step2 = document.getElementById("bankStep2");
const nextBtn = document.getElementById("nextToStep2");
const cancelStep1 = document.getElementById("cancelStep1");
const prevBtn = document.getElementById("prevToStep1"); // optional previous button support

// countdown + floating grid reminder
let countdownTimer = null;
let countdownSecs = 1800; // 30 mins
const floatingGrid = document.createElement("div");
Object.assign(floatingGrid.style, {
  position: "fixed", top: "10px", right: "10px",
  background: "rgba(0,0,0,0.8)", color: "#fff",
  padding: "10px 15px", borderRadius: "10px",
  cursor: "pointer", display: "none", zIndex: "9999"
});
floatingGrid.textContent = "Pending Payment (30:00)";
floatingGrid.addEventListener("click", () => {
  bankModal.classList.remove('hidden');
});
document.body.appendChild(floatingGrid);

// -------------------------------------------------
// Constants
// -------------------------------------------------
const DELIVERY_CHARGE = 300;
const PACK_CHARGE = 200;
const FEE_CHARGE = 50;

let allFoodItems = [];
let selectedRestaurant = '';
let cart = [];
let currentRestaurantData = null;
let savedOrderId = null;

// -------------------------------------------------
// Firestore listeners
// -------------------------------------------------
const listenToRestaurants = () => {
  const foodRef = collection(db, 'foodItems');
  onSnapshot(foodRef, (snapshot) => {
    const restaurantNames = [
      ...new Set(snapshot.docs.map(doc => doc.data().restaurantName))
    ].sort();

    restaurantSelect.innerHTML = `<option value="">Choose Restaurant</option>`;
    restaurantNames.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      restaurantSelect.appendChild(option);
    });
  });
};

const listenToFoodItems = () => {
  const foodRef = collection(db, 'foodItems');
  const q = query(foodRef, orderBy('restaurantName'));
  onSnapshot(q, (snapshot) => {
    allFoodItems = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    syncCartWithAvailability();
    renderMenu();
  });
};

// -------------------------------------------------
// Checkout Time Restriction (e.g. 8am–8pm only)
// -------------------------------------------------
function checkOrderWindow() {
  const now = new Date();
  const hour = now.getHours();
  if (hour < 8 || hour >= 20) {
    payNowBtn.disabled = true;
    payNowBtn.style.opacity = "0.5";
    payNowBtn.textContent = "Checkout Closed (8am–8pm)";
  } else {
    payNowBtn.disabled = false;
    payNowBtn.style.opacity = "1";
    payNowBtn.textContent = "Checkout";
  }
}
setInterval(checkOrderWindow, 60000);
checkOrderWindow();

// -------------------------------------------------
// Menu rendering
// -------------------------------------------------
const renderMenu = () => {
  foodItemsContainer.innerHTML = '';
  if (!selectedRestaurant) return;

  const items = allFoodItems.filter(item => item.restaurantName === selectedRestaurant);
  if (!items.length) {
    foodItemsContainer.innerHTML = '<p>No menu available for this restaurant.</p>';
    return;
  }

  const container = document.createElement('div');
  container.classList.add('menu-card-container');

  const heading = document.createElement('h3');
  heading.textContent = selectedRestaurant;
  container.appendChild(heading);

  items.forEach(item => {
    const card = document.createElement('div');
    card.classList.add('menu-card');
    if (!item.available) {
      card.classList.add('unavailable');
      card.style.opacity = '0.5';
      card.style.pointerEvents = 'none';
    }

    const isSelected = cart.some(ci => ci.id === item.id);

    const circleSelect = document.createElement('div');
    circleSelect.classList.add('circle-select');
    if (isSelected) circleSelect.classList.add('selected');

    const infoDiv = document.createElement('div');
    infoDiv.classList.add('menu-info');
    infoDiv.innerHTML = `
      <h3>${item.name}</h3>
      <p>Category: ${item.category}</p>
      <p>Price: NGN${item.price}</p>
    `;

    card.appendChild(infoDiv);
    card.appendChild(circleSelect);

    if (item.available) {
      const toggleSelection = () => {
        if (cart.length && cart[0].restaurantName !== item.restaurantName) {
          if (!confirm("You can only order from one restaurant at a time. Clear current cart?")) return;
          cart = [];
        }

        const idx = cart.findIndex(ci => ci.id === item.id);
        if (idx === -1) {
          cart.push({ ...item, qty: 1 });
          circleSelect.classList.add('selected');
        } else {
          cart.splice(idx, 1);
          circleSelect.classList.remove('selected');
        }
        updateOrderButton();
      };

      card.addEventListener('click', toggleSelection);
      circleSelect.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelection();
      });
    }

    container.appendChild(card);
  });

  foodItemsContainer.appendChild(container);
};

// -------------------------------------------------
// Order Modal
// -------------------------------------------------
const updateOrderButton = () => {
  const totalQty = cart.reduce((sum, ci) => sum + ci.qty, 0);
  orderCount.textContent = totalQty;
  orderButton.classList.toggle('hidden', totalQty === 0);
};

const openOrderModal = () => {
  orderRestaurantName.textContent = cart[0]?.restaurantName || '';
  renderOrderTable();
  orderModal.classList.remove('hidden');
};

const closeOrderModal = () => {
  orderModal.classList.add('hidden');
};

const renderOrderTable = () => {
  orderTableBody.innerHTML = '';
  cart.forEach(ci => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${ci.name}</td>
      <td>
        <button class="qty-btn" data-id="${ci.id}" data-action="decrease">-</button>
        ${ci.qty}
        <button class="qty-btn" data-id="${ci.id}" data-action="increase">+</button>
      </td>
      <td>NGN${ci.price * ci.qty}</td>
    `;
    orderTableBody.appendChild(row);
  });
  updateTotal();
};

const updateTotal = () => {
  let itemTotal = cart.reduce((sum, ci) => sum + ci.price * ci.qty, 0);
  let delivery = DELIVERY_CHARGE;
  let pack = addPackCheckbox.checked ? PACK_CHARGE : 0;
  let fee = FEE_CHARGE;
  let total = itemTotal + delivery + pack + fee;

  document.getElementById('deliveryCharge').textContent = `NGN${delivery}`;
  document.getElementById('feeCharge').textContent = `NGN${fee}`;
  orderTotalElem.textContent = `NGN${total}`;

  orderTotalElem.dataset.itemTotal = itemTotal;
  orderTotalElem.dataset.delivery = delivery;
  orderTotalElem.dataset.pack = pack;
  orderTotalElem.dataset.fee = fee;
  orderTotalElem.dataset.total = total;
};

// Quantity adjustments
orderTableBody.addEventListener('click', (e) => {
  if (e.target.classList.contains('qty-btn')) {
    const id = e.target.dataset.id;
    const action = e.target.dataset.action;
    const item = cart.find(ci => ci.id === id);
    if (!item) return;

    if (action === 'increase') item.qty += 1;
    if (action === 'decrease' && item.qty > 1) item.qty -= 1;

    renderOrderTable();
    updateOrderButton();
  }
});

// -------------------------------------------------
// Event Listeners
// -------------------------------------------------
restaurantSelect.addEventListener('change', async () => {
  selectedRestaurant = restaurantSelect.value;
  if (cart.length) {
    if (!confirm('Changing restaurant clears your cart. Continue?')) {
      return;
    }
    cart = [];
    updateOrderButton();
  }
  renderMenu();

  if (selectedRestaurant) {
    const restRef = doc(db, "restaurants", selectedRestaurant);
    const restSnap = await getDoc(restRef);
    if (restSnap.exists()) {
      currentRestaurantData = restSnap.data();
    }
  }
});

orderButton.addEventListener('click', openOrderModal);
closeModal.addEventListener('click', closeOrderModal);
addPackCheckbox.addEventListener('change', updateTotal);

payNowBtn.addEventListener('click', () => {
  if (!cart.length) {
    alert("Your cart is empty!");
    return;
  }
  if (!selectedRestaurant || !currentRestaurantData) {
    alert("Please choose a restaurant.");
    return;
  }

  orderModal.classList.add('hidden');
  bankModal.classList.remove('hidden');
  if (step1) step1.style.display = "block";
  if (step2) step2.style.display = "none";
});

// -------------------------------------------------
// Step Navigation
// -------------------------------------------------
closeBankModal.addEventListener("click", () => {
  bankModal.classList.add("hidden");
  stopCountdown();        // stop the timer
  savedOrderId = null;    // clear order reference
  updateOrderButton();
  closeOrderModal();
});

cancelStep1.addEventListener("click", () => {
  bankModal.classList.add("hidden");
  savedOrderId = null;
  updateOrderButton();
  closeOrderModal();
});

if (nextBtn) {
  nextBtn.addEventListener("click", async () => {
    // gather customer inputs
    const bankNameInput = document.getElementById("custBankName");
    const accNumInput = document.getElementById("custAccountNumber");
    const accNameInput = document.getElementById("custAccountName");
    const narrationInput = document.getElementById("custNarration");

    const bankName = bankNameInput?.value || "";
    const accNum = accNumInput?.value || "";
    const accName = accNameInput?.value || "";
    const narration = narrationInput?.value || "";

    if (!bankName || !accNum || !accName) {
      alert("Please fill in your bank name, account number and account name.");
      return;
    }

    // show restaurant details and order id on step2
    if (step1) step1.style.display = "none";
    if (step2) step2.style.display = "block";

    // create a temporary order reference string that user can copy as narration (visible on UI)
    const frontOrderRef = `ORD-${Date.now()}`;
    const restBankNameElem = document.getElementById("restBankName");
    const restAccountNumberElem = document.getElementById("restAccountNumber");
    const restAccountNameElem = document.getElementById("restAccountName");
    const restAmountElem = document.getElementById("restAmount");
    const restOrderIdElem = document.getElementById("restOrderId");

    if (restBankNameElem) restBankNameElem.textContent = currentRestaurantData.bankName || "—";
    if (restAccountNumberElem) restAccountNumberElem.textContent = currentRestaurantData.accountNumber || "—";
    if (restAccountNameElem) restAccountNameElem.textContent = currentRestaurantData.accountName || "—";
    if (restAmountElem) restAmountElem.textContent = orderTotalElem.dataset.total || "—";
    if (restOrderIdElem) {
      restOrderIdElem.textContent = frontOrderRef;
      // store front-order ref to show to user; final real order id saved when they click I've Paid
      restOrderIdElem.dataset.frontRef = frontOrderRef;
    }

    // start countdown (no order doc yet)
    startCountdown(null);
  });
}

// prev button
if (prevBtn) {
  prevBtn.addEventListener("click", () => {
    if (step2) step2.style.display = "none";
    if (step1) step1.style.display = "block";
  });
}

// ----------------------------
// Load Banks from resolve.php
// ----------------------------
async function loadBanks() {
  try {
    const res = await fetch("https://account-resolve.infinityfree.me/resolve.php?action=banks");
    const data = await res.json();

    if (data.status === "success") {
      const bankSelect = document.getElementById("custBankName");
      bankSelect.innerHTML = `<option disabled selected value="">Select Bank</option>`;
      data.data.forEach(bank => {
        const opt = document.createElement("option");
        opt.value = bank.code;      // Flutterwave bank code
        opt.textContent = bank.name; // Bank display name
        bankSelect.appendChild(opt);
      });
    } else {
      console.error("Bank load failed:", data);
      alert("Could not load bank list. Try again later.");
    }
  } catch (err) {
    console.error("Bank load error:", err);
    alert("Error loading banks. Check your connection.");
  }
}

// Call immediately on page load
loadBanks();

// Auto-resolve account name (optional; unchanged from your original)
document.getElementById("custAccountNumber").addEventListener("blur", async () => {
  const bankCode = document.getElementById("custBankName").value;
  const accNum = document.getElementById("custAccountNumber").value;

  if (bankCode && accNum.length === 10) {
    try {
      const res = await fetch("https://account-resolve.infinityfree.me/resolve.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bank_code: bankCode,
          account_number: accNum
        })
      });
      const data = await res.json();

      if (data.status === "success") {
        document.getElementById("custAccountName").value = data.data.account_name;
      } else {
        document.getElementById("custAccountName").value = "";
        alert("Could not resolve account name.");
      }
    } catch (err) {
      console.error("Resolver error:", err);
    }
  }
});

// Copy icons behavior (unchanged) - ensure copy buttons have class .copy-icon and data-copy=targetId
document.addEventListener("click", (e) => {
  if (e.target.classList && e.target.classList.contains("copy-icon")) {
    const targetId = e.target.dataset.copy;
    const txt = document.getElementById(targetId)?.textContent || e.target.dataset.copy;
    navigator.clipboard.writeText(txt).then(() => alert("Copied: " + txt));
  }
});

// -------------------------------------------------
// Ive Paid handler (core matching logic implemented here)
// -------------------------------------------------
ivePaidBtn.addEventListener("click", async () => {
  // gather customer info from step1 inputs
  const custBankName = document.getElementById("custBankName")?.value || "";
  const custAccountNumber = document.getElementById("custAccountNumber")?.value || "";
  const custAccountName = document.getElementById("custAccountName")?.value || "";
  const custNarration = document.getElementById("custNarration")?.value || "";
  const custTimestamp = new Date(); // approximate time when user clicked I've Paid

  // basic pre-checks
  const user = auth.currentUser;
  if (!user) return alert("You must be logged in.");
  if (!custBankName || !custAccountNumber || !custAccountName) return alert("Please fill your bank details.");

  // get customer profile
  const customerDocRef = doc(db, "customers", user.uid);
  const customerSnap = await getDoc(customerDocRef);
  if (!customerSnap.exists()) return alert("Customer profile not found.");
  const customerData = customerSnap.data();

  // prepare order totals
  const itemTotal = Number(orderTotalElem.dataset.itemTotal || 0);
  const delivery = Number(orderTotalElem.dataset.delivery || 0);
  const pack = Number(orderTotalElem.dataset.pack || 0);
  const fee = Number(orderTotalElem.dataset.fee || 0);
  const total = Number(orderTotalElem.dataset.total || 0);

  // create order doc with pending_confirmation (we will update paymentStatus after matching)
  const newOrderRef = await addDoc(collection(db, "orders"), {
    customerId: user.uid,
    customerName: customerData.fullname,
    customerUsername: customerData.username,
    customerEmail: customerData.email,
    customerPhone: customerData.phone,
    customerRoom: customerData.room || customerData.roomLocation,
    restaurantName: selectedRestaurant,
    items: cart,
    deliveryCharge: delivery,
    packCharge: pack,
    feeCharge: fee,
    itemTotal,
    totalAmount: total,
    paymentGateway: "manual_bank",
    paymentStatus: "pending_confirmation",
    orderStatus: "pending_assignment",
    createdAt: new Date(),
    declinedBy: [],
    customerBankName: custBankName,
    customerAccountNumber: custAccountNumber,
    customerAccountName: custAccountName,
    customerNarration: custNarration,
    countdownStart: serverTimestamp()
  });

  savedOrderId = newOrderRef.id;

  // Update the displayed restOrderId (so admin/user sees matching reference)
  const restOrderIdElem = document.getElementById("restOrderId");
  if (restOrderIdElem) restOrderIdElem.textContent = savedOrderId;

  // Start countdown persisted to the created order
  startCountdown(savedOrderId);
  showPendingAnimation();

  // Now scanning payment_alerts for a match
  try {
    // query all unprocessed alerts
    const alertsQ = query(collection(db, "payment_alerts"), where("processed", "==", false));
    const alertsSnap = await getDocs(alertsQ);

    // helper to normalize strings (account names)
    function norm(s) {
      return String(s || "").toLowerCase().replace(/\s+/g, ' ').trim();
    }
    const normCustAccName = norm(custAccountName);

    let mainMatch = null; // { docRefId, data }

    // iterate to find a match where:
    // - amount AND account name must match
    // - AND at least one of: accountNumber match OR bankName match OR narration includes savedOrderId OR timestamp within ±10 minutes
    for (const aDoc of alertsSnap.docs) {
      const a = aDoc.data();
      const alertId = aDoc.id;

      // fields may vary by bank/email parser; try multiple names
      const alertAmount = Number(a.amount || a.amt || 0);
      const alertAccName = norm(a.accountName || a.account_name || a.name || "");
      const alertAccNumber = String(a.accountNumber || a.account_number || a.accNum || "");
      const alertBankName = String(a.bankName || a.bank || a.sender || "");
      const alertNarration = String(a.narration || a.description || a.message || "");
      const alertTimestamp = a.timestamp ? new Date(a.timestamp) : (a.createdAt ? new Date(a.createdAt.seconds * 1000) : null);

      const amountMatch = (alertAmount === total);
      const accNameMatch = (alertAccName && normCustAccName && alertAccName === normCustAccName);

      // other matches
      const accNumberMatch = (alertAccNumber && alertAccNumber === String(custAccountNumber));
      const bankNameMatch = (alertBankName && norm(alertBankName) === norm(custBankName));
      const narrationMatch = alertNarration && alertNarration.includes(savedOrderId);
      const timeMatch = alertTimestamp ? (Math.abs(alertTimestamp.getTime() - custTimestamp.getTime()) <= 1000 * 60 * 10) : false; // ±10 min

      // Require amount + account name then any of otherMatches
      if (amountMatch && accNameMatch && (accNumberMatch || bankNameMatch || narrationMatch || timeMatch)) {
        mainMatch = {
          id: alertId,
          data: a,
          computed: { amountMatch, accNameMatch, accNumberMatch, bankNameMatch, narrationMatch, timeMatch, alertAmount }
        };
        break;
      }
    }

    let refundMatch = null;
    if (!mainMatch) {
      for (const aDoc of alertsSnap.docs) {
        const a = aDoc.data();
        const alertId = aDoc.id;

        const alertAmount = Number(a.amount || a.amt || 0);
        const alertAccName = norm(a.accountName || a.account_name || a.name || "");
        const alertAccNumber = String(a.accountNumber || a.account_number || a.accNum || "");
        const alertBankName = String(a.bankName || a.bank || a.sender || "");
        const alertNarration = String(a.narration || a.description || a.message || "");
        const alertTimestamp = a.timestamp ? new Date(a.timestamp) : (a.createdAt ? new Date(a.createdAt.seconds * 1000) : null);

        const accNameMatch = (alertAccName && normCustAccName && alertAccName === normCustAccName);
        const accNumberMatch = (alertAccNumber && alertAccNumber === String(custAccountNumber));
        const bankNameMatch = (alertBankName && norm(alertBankName) === norm(custBankName));
        const narrationMatch = alertNarration && alertNarration.includes(savedOrderId);
        const timeMatch = alertTimestamp ? (Math.abs(alertTimestamp.getTime() - custTimestamp.getTime()) <= 1000 * 60 * 10) : false; // ±10 min

        // amountMismatch but account name matches AND any other match => refund candidate
        if (!Number(a.amount || 0) || (Number(a.amount || 0) !== total)) {
          if (accNameMatch && (accNumberMatch || bankNameMatch || narrationMatch || timeMatch)) {
            refundMatch = {
              id: alertId,
              data: a,
              computed: { accNameMatch, accNumberMatch, bankNameMatch, narrationMatch, timeMatch, alertAmount: Number(a.amount || 0) }
            };
            break;
          }
        }
      }
    }

    // If we have a mainMatch: mark alert.processed via transaction (first-wins) and update order paymentStatus 'successful'
    if (mainMatch) {
      const matchedAlertRef = doc(db, "payment_alerts", mainMatch.id);
      // Use transaction to ensure processed flips atomically
      await runTransaction(db, async (t) => {
        const snap = await t.get(matchedAlertRef);
        if (!snap.exists()) throw "Alert doc gone";
        const current = snap.data();
        if (current.processed) {
          // somebody else already processed it — in that case, stop and inform user
          throw { code: "ALREADY_PROCESSED" };
        }
        t.update(matchedAlertRef, { processed: true, matchedOrder: savedOrderId, matchedAt: new Date() });
      }).catch(async (err) => {
        // If already processed by someone else, fall back to searching duplicates marked processed -> treat as matched by others
        if (err && err.code === "ALREADY_PROCESSED") {
          // try to find any other unprocessed alert that fits; but for now we'll inform user
          throw new Error("That payment was already processed by another request. Please check pending orders.");
        } else {
          throw err;
        }
      });
      
            // mark duplicates: query by same amount OR timestamp window OR same reference/sender. Because Firestore doesn't support OR queries easily,
      // we query candidate duplicates by amount and then filter client side by time/reference/sender.
      const dupCandidatesQ = query(collection(db, "payment_alerts"), where("processed", "==", false), where("amount", "==", mainMatch.data.amount || mainMatch.computed.alertAmount));
      const dupSnap = await getDocs(dupCandidatesQ);
      const dupUpdates = [];
      dupSnap.forEach(d => {
        if (d.id === mainMatch.id) return;
        // simple client-side heuristics: if narration or sender same or timestamp within ±5 minutes, mark processed
        const candidate = d.data();
        const candTs = candidate.timestamp ? new Date(candidate.timestamp) : (candidate.createdAt ? new Date(candidate.createdAt.seconds * 1000) : null);
        const mainTs = mainMatch.data.timestamp ? new Date(mainMatch.data.timestamp) : (mainMatch.data.createdAt ? new Date(mainMatch.data.createdAt.seconds * 1000) : null);
        const sameNarr = mainMatch.data.narration && candidate.narration && String(candidate.narration).trim() === String(mainMatch.data.narration).trim();
        const sameSender = (mainMatch.data.sender && candidate.sender && String(candidate.sender).trim() === String(mainMatch.data.sender).trim());
        const timeClose = candTs && mainTs && (Math.abs(candTs.getTime() - mainTs.getTime()) <= 1000 * 60 * 5);

        if (sameNarr || sameSender || timeClose) {
          dupUpdates.push(updateDoc(doc(db, "payment_alerts", d.id), { processed: true, matchedOrder: savedOrderId, matchedAt: new Date() }));
        }
      });
      await Promise.all(dupUpdates);

      // update order payment status => successful
      await updateDoc(doc(db, "orders", savedOrderId), {
        paymentStatus: "successful",
        paymentMatchedAt: new Date(),
        matchedByAlertId: mainMatch.id
      });

      hidePendingAnimation();
      alert("Payment Successful ✅ — your order will be assigned shortly.");
      // redirect to pending orders where admin will pick it up
      window.location.href = "pending-orders.html";
      return;
    }

    // If mainMatch not found but refundMatch is found -> mark refund_required
    if (refundMatch) {
      // mark the matched alert processed (so it doesn't block future matches)
      await runTransaction(db, async (t) => {
        const alertRef = doc(db, "payment_alerts", refundMatch.id);
        const snap = await t.get(alertRef);
        if (!snap.exists()) throw "Alert gone";
        if (!snap.data().processed) {
          t.update(alertRef, { processed: true, matchedOrder: savedOrderId, matchedAt: new Date(), note: "amount_mismatch" });
        }
      }).catch(() => { /* ignore transaction race — we still proceed */ });

      // mark duplicates of that alert (same amount OR time OR sender) as processed (best-effort)
      const dupCandidatesQ = query(collection(db, "payment_alerts"), where("processed", "==", false), where("amount", "==", refundMatch.data.amount || refundMatch.computed.alertAmount));
      const dupSnap2 = await getDocs(dupCandidatesQ);
      const dupUpdates2 = [];
      dupSnap2.forEach(d => {
        if (d.id === refundMatch.id) return;
        // best-effort filter same narration/sender/time
        dupUpdates2.push(updateDoc(doc(db, "payment_alerts", d.id), { processed: true, matchedOrder: savedOrderId, matchedAt: new Date(), note: "duplicate_of_amount_mismatch" }));
      });
      await Promise.all(dupUpdates2);

      // update order to refund_required and include customer bank details so admin can refund
      await updateDoc(doc(db, "orders", savedOrderId), {
        paymentStatus: "refund_required",
        refundReason: "amount_mismatch_but_other_details_match",
        refundCandidateAlertId: refundMatch.id,
        refundCustomerBank: {
          bankName: custBankName,
          accountNumber: custAccountNumber,
          accountName: custAccountName
        }
      });
      
      hidePendingAnimation();
      alert("Payment found but amount doesn't match. Admin will process a refund. Refund details sent to admin.");
      window.location.href = "pending-orders.html";
      return;
    }

    // No match at all => leave order pending_confirmation (customer can wait / try again)
    hidePendingAnimation();
    alert("No matching payment alert was found yet. The system will keep waiting while your session is active.");
    // keep the bank modal open (if you prefer to close, uncomment next line)
    // bankModal.classList.add('hidden');
    return;

  } catch (err) {
    console.error("Payment matching error:", err);
    hidePendingAnimation();
    alert("An error occurred while trying to confirm payment. Try again or contact support.");
    return;
  } finally {
    // clear cart and UI even if no match? The original flow cleared cart when order placed; preserve that:
    cart = [];
    updateOrderButton();
    closeOrderModal();
    // bankModal stays open if no match (so customer can retry) — but if you want to always close:
    // bankModal.classList.add('hidden');
  }
});

// -------------------------------------------------
// Countdown + Animation helpers
// -------------------------------------------------
async function startCountdown(orderId) {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownSecs = 1800;
  floatingGrid.style.display = "block";
  updateCountdownUI();

  // persist countdownStart to order if we have a real orderId
  if (orderId) {
    try {
      await updateDoc(doc(db, "orders", orderId), { countdownStart: serverTimestamp() });
    } catch (e) { /* ignore */ }
  }

  countdownTimer = setInterval(() => {
    countdownSecs--;
    updateCountdownUI();
    if (countdownSecs <= 0) {
      stopCountdown();
      bankModal.classList.add('hidden');
      floatingGrid.style.display = "none";
      // optionally set order to cancelled if not paid:
      if (savedOrderId) {
        updateDoc(doc(db, "orders", savedOrderId), { orderStatus: "cancelled", paymentStatus: "expired" }).catch(()=>{});
      }
      alert("Payment window expired.");
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  floatingGrid.style.display = "none";
}

function updateCountdownUI() {
  const mins = Math.floor(countdownSecs / 60);
  const secs = countdownSecs % 60;
  const ct = document.getElementById("countdownTimer");
  if (ct) ct.textContent = `${mins}:${secs.toString().padStart(2,"0")}`;
  floatingGrid.textContent = `Pending Payment (${mins}:${secs.toString().padStart(2,"0")})`;
}

function resumeCountdownFromOrder(orderId) {
  // optional: read order.countdownStart and resume with remaining time
  // Not changed here to keep logic small.
}

// Pending spinner overlay
function showPendingAnimation() {
  // create overlay if not exists
  if (document.getElementById("pendingOverlay")) return;
  const overlay = document.createElement("div");
  overlay.id = "pendingOverlay";
  Object.assign(overlay.style, {
    position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
    background: "rgba(0,0,0,0.6)", display: "flex",
    justifyContent: "center", alignItems: "center", zIndex: 10000
  });
  const box = document.createElement("div");
  Object.assign(box.style, {
    background: "rgba(255,255,255,0.06)", padding: "1.2rem 1.4rem",
    borderRadius: "10px", color: "#fff", textAlign: "center"
  });
  box.innerHTML = `<div class="spinner" style="margin-bottom:10px;"></div><div>Waiting for payment confirmation…</div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // small CSS for spinner (inject if not present)
  if (!document.getElementById("custMenuSpinnerStyles")) {
    const s = document.createElement("style");
    s.id = "custMenuSpinnerStyles";
    s.textContent = `
      .spinner{width:48px;height:48px;border-radius:50%;border:5px solid rgba(255,255,255,0.15);border-top-color:white;animation:spin 1s linear infinite;margin:0 auto;}
      @keyframes spin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(s);
  }
}

function hidePendingAnimation() {
  const el = document.getElementById("pendingOverlay");
  if (el) el.remove();
}

// Cart sync
const syncCartWithAvailability = () => {
  const before = cart.length;
  cart = cart.filter(ci => {
    const item = allFoodItems.find(fi => fi.id === ci.id);
    return item && item.available;
  });
  if (cart.length !== before) {
    renderOrderTable();
    updateOrderButton();
  }
};

// -------------------------------------------------
// Init
// -------------------------------------------------
listenToRestaurants();
listenToFoodItems();
updateOrderButton();