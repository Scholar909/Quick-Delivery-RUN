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
  serverTimestamp,
  Timestamp,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
  if (user) {
    listenToRestaurants();
    listenToFoodItems();
    listenToBuyNowCart(user.uid);
    await loadToLocations(); // NEW: load all available destination options
    if (auth.currentUser) {
      await clearBuyNowCart(auth.currentUser.uid);
    }
  } else {
    cart = [];
  }
});

// -------------------------------------------------
// Clear Firestore Buy Now Cart after order/cancel
// -------------------------------------------------
async function clearBuyNowCart(userId) {
  try {
    const cartRef = collection(db, "carts", userId, "items");
    const snap = await getDocs(cartRef);
    for (const docSnap of snap.docs) {
      await deleteDoc(docSnap.ref);
    }
    console.log("Buy Now cart cleared");
  } catch (err) {
    console.error("Failed to clear cart:", err);
  }
}

// -------------------------------------------------
// DOM Elements & Constants (same as before)
// -------------------------------------------------
const restaurantSelect = document.getElementById('restaurantSelect');
// NEW: destination selector reference
const toLocationSelect = document.getElementById('toLocationSelect');
toLocationSelect.disabled = true;
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
const bankModal = document.getElementById('bankModal');
const closeBankModal = document.getElementById('closeBankModal');
const ivePaidBtn = document.getElementById('ivePaidBtn');
const step1 = document.getElementById("bankStep1");
const step2 = document.getElementById("bankStep2");
const nextBtn = document.getElementById("nextToStep2");
const cancelStep1 = document.getElementById("cancelStep1");
const prevBtn = document.getElementById("prevToStep1");
// Restore locations from Buy Now redirect
window.addEventListener("DOMContentLoaded", async () => {
  const fromLoc = localStorage.getItem("fromLocation");
  const toLoc = localStorage.getItem("toLocation");

  await loadToLocations(); // ensure dropdowns populated first

  // 🟩 Case 1: Came from Buy Now (combo/recommendation)
  if (fromLoc) {
    // Preselect restaurant visibly
    for (const opt of restaurantSelect.options) {
      if (opt.textContent === fromLoc || opt.value === fromLoc) {
        restaurantSelect.value = opt.value;
        selectedRestaurant = opt.value;
        previousRestaurant = opt.value;
        break;
      }
    }

    // Lock restaurant dropdown (cannot change for this order)
    restaurantSelect.disabled = true;
    toLocationSelect.disabled = false;

    // Preselect destination if saved
    if (toLoc) {
      for (const opt of toLocationSelect.options) {
        if (opt.textContent === toLoc || opt.value === toLoc) {
          toLocationSelect.value = opt.value;
          previousToLocation = opt.value;
          break;
        }
      }
    }

    // 🟩 Automatically fetch and apply correct delivery charge right away
    await updateDeliveryCharge(fromLoc, toLoc || "My Room");

    // Render menu with correct totals
    renderMenu();
    updateOrderTable();
    updateTotal();

    return; // stop here, don’t run normal flow
  }

  // 🟨 Case 2: Normal open (not from Buy Now)
  restaurantSelect.disabled = false;
  renderMenu();
});

// Charges
let DELIVERY_CHARGE = 300;
const PACK_CHARGE = 200;
const FEE_CHARGE = 50;

// State
let allFoodItems = [];
let selectedRestaurant = '';
let cart = [];
let currentRestaurantData = null;
let savedOrderId = null;
let countdownTimeout = null; // for the 5-min auto-expiry

// -------------------------------------------------
// Load Buy Now Data from Firestore Cart
// -------------------------------------------------
function listenToBuyNowCart(userId) {
  const cartRef = collection(db, "carts", userId, "items");
  onSnapshot(cartRef, (snapshot) => {
    const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (!items.length) return;

    cart = items.map(it => ({
      id: it.id,
      name: it.name,
      price: Number(it.price),
      qty: it.qty || 1,
      restaurantId: it.restaurantId,
      restaurantName: it.restaurantName,
      category: it.category || "Uncategorized",
      available: true
    }));

    // 🔹 Ensure restaurant is properly set
    if (cart.length) {
      selectedRestaurant = cart[0].restaurantName || "";
      orderRestaurantName.textContent = selectedRestaurant;
    
      // 🔹 fetch restaurant data immediately
      if (selectedRestaurant) {
        const restRef = doc(db, "restaurants", selectedRestaurant);
        getDoc(restRef).then(restSnap => {
          if (restSnap.exists()) {
            currentRestaurantData = restSnap.data();
          }
        });
      }
    }

    updateOrderButton();
    renderOrderTable();

    // auto-open modal
    if (cart.length) {
      orderModal.classList.remove("hidden");
    }
  });
}

const banks = [
  "Access Bank",
  "ASO Savings & Loans",
  "CitiBank",
  "Diamond Bank",
  "Ecobank Plc",
  "Enterprise Bank",
  "FCMB (First City Monument Bank)",
  "Fidelity Bank",
  "FBNMobile",
  "First Bank of Nigeria",
  "Fortis Microfinance Bank",
  "FortisMobile",
  "GTBank Plc",
  "Heritage Bank",
  "JAIZ Bank",
  "Keystone Bank",
  "Opay",
  "Page MFBank",
  "Palmpay",
  "Parralex Bank",
  "PayAttitude Online",
  "Skye Bank",
  "Stanbic IBTC Bank",
  "Stanbic Mobile Money",
  "Standard Chartered Bank",
  "Sterling Bank",
  "SunTrust Bank",
  "Union Bank",
  "United Bank for Africa",
  "Unity Bank",
  "VTNetworks",
  "Wema Bank",
  "Zenith Bank",
  "ZenithMobile"
  // …add any other Nigerian banks + licensed mobile money operators here
];

const custBankSelect = document.getElementById("custBankName");
custBankSelect.innerHTML = `<option value="">Choose Bank</option>`;
banks.forEach(bank => {
  const opt = document.createElement("option");
  opt.value = bank;
  opt.textContent = bank;
  custBankSelect.appendChild(opt);
});

// parseAlertTimestamp(a) -> returns epoch ms (Number)
function parseAlertTimestamp(a) {
  // 1) Prefer Firestore Timestamp objects
  if (!a.timestamp) return new Date();
  // Convert string to Date
  return new Date(a.timestamp);

  if (a?.createdAt?.toMillis) return a.createdAt.toMillis();
  if (a?.timestamp?.toMillis) return a.timestamp.toMillis();

  // 2) If a.timestamp or other fields are numbers (seconds or ms)
  const numericFields = ["createdAt", "timestamp", "time", "ts"];
  for (const f of numericFields) {
    const v = a?.[f];
    if (typeof v === "number") {
      // assume seconds if it's 10 digits, ms if 13 digits
      return v < 1e11 ? v * 1000 : v;
    }
  }

  // 3) If the field is a string (like "Wed, 01 Oct 2025 02:02:20 +0530")
  const strCandidates = ["timestamp", "time", "date", "createdAt", "ts", "datetime"];
  for (const f of strCandidates) {
    const s = a?.[f];
    if (!s || typeof s !== "string") continue;

    // try direct Date.parse (works for RFC2822 / RFC3339)
    const parsed = Date.parse(s);
    if (!isNaN(parsed)) return parsed;

    // try to extract an ISO-ish substring yyyy-MM-ddTHH:mm:ss
    const isoMatch = s.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:?\d{2})?/);
    if (isoMatch) {
      const p = Date.parse(isoMatch[0]);
      if (!isNaN(p)) return p;
    }

    // try to find numeric epoch inside string
    const numMatch = s.match(/(\d{10,13})/);
    if (numMatch) {
      const n = Number(numMatch[1]);
      return n < 1e11 ? n * 1000 : n;
    }
  }

  // 4) Last resort: treat as now
  return Date.now();
}

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

// -----------------------------
// NEW: Load To Locations
// -----------------------------
async function loadToLocations() {  
  try {  
    const user = auth.currentUser;  
    if (!user) return;  

    const custSnap = await getDoc(doc(db, "customers", user.uid));  
    const custData = custSnap.exists() ? custSnap.data() : {};  

    // ✅ Store real hostel/room as default value but show "My Room"
    const realRoomLocation = custData?.hostel || "Unknown Location";

    // collect all to-locations from deliveryCharges collection  
    const allLocs = new Set(["__myRoom__"]); // placeholder for "My Room"  
    const chargesSnap = await getDocs(collection(db, "deliveryCharges"));  
    chargesSnap.forEach(ch => {  
      const data = ch.data();  
      if (data.toLocation) allLocs.add(data.toLocation);  
    });  

    // populate dropdown  
    toLocationSelect.innerHTML = `<option value="">Choose Location</option>`;  
    allLocs.forEach(loc => {  
      const opt = document.createElement("option");  
      if (loc === "__myRoom__") {  
        opt.value = realRoomLocation;      // 🔹 actual value (e.g. hostel)  
        opt.textContent = "My Room";       // 🔹 what user sees  
      } else {  
        opt.value = loc;  
        opt.textContent = loc;  
      }  
      toLocationSelect.appendChild(opt);  
    });  
  } catch (err) {  
    console.error("Failed to load to-locations:", err);  
  }  
}

// -------------------------------------------------
// Checkout Time Restriction (e.g. 8am–9pm only)
// -------------------------------------------------
function checkOrderWindow() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour + minute / 60;

  // Allow only between 8:30am and 9:00pm
  const open = 8.0; // 8:30am
  const close = 21.5; // 9:00pm

  if (time < open || time >= close) {
    payNowBtn.disabled = true;
    payNowBtn.style.opacity = "0.5";
    payNowBtn.textContent = "Checkout Closed (8:30am–9:00pm)";
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
  // prevent showing menu until both from & to location selected
  if (!selectedRestaurant || !toLocationSelect.value) {
    foodItemsContainer.innerHTML = `<p style="text-align:center;color:grey;margin-top:2rem;">Please select both restaurant and destination to view menu.</p>`;
    return;
  }

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

const closeOrderModal = async () => {
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
let previousRestaurant = "";

restaurantSelect.addEventListener('change', async (e) => {
  const newRestaurant = restaurantSelect.value;

  // 🔹 Check if user arrived from Buy Now page
  const fromBuyNow = localStorage.getItem("fromLocation");
  
  // ✅ Only lock if actually redirected (and dropdown is disabled)
  if (restaurantSelect.disabled && fromBuyNow && fromBuyNow === selectedRestaurant) {
    alert("This restaurant was preselected from your combo. You cannot change it for this order.");
    restaurantSelect.value = selectedRestaurant;
    return;
  }

  // 🔹 Normal behaviour when not from Buy Now
  if (cart.length && previousRestaurant && previousRestaurant !== newRestaurant) {
    const confirmChange = confirm('Changing restaurant clears your cart. Continue?');
    if (!confirmChange) {
      // revert visible dropdown
      restaurantSelect.value = previousRestaurant;
      return;
    }
    cart = [];
    updateOrderButton();
  }

  selectedRestaurant = newRestaurant;
  previousRestaurant = newRestaurant;

  // 🔹 Enable/disable To-location dropdown
  if (!selectedRestaurant) {
    toLocationSelect.disabled = true;
    toLocationSelect.value = "";
    DELIVERY_CHARGE = 300; // reset default
    updateTotal();
  } else {
    toLocationSelect.disabled = false;
  }

  // 🔹 Clear destination only when user changes manually
  if (!fromBuyNow) {
    toLocationSelect.value = "";
  }

  renderMenu();

  // 🔹 Load restaurant info
  if (selectedRestaurant) {
    const restRef = doc(db, "restaurants", selectedRestaurant);
    const restSnap = await getDoc(restRef);
    if (restSnap.exists()) {
      currentRestaurantData = restSnap.data();
    }
  }

  // 🔹 Fetch delivery charge if not coming from Buy Now
  const user = auth.currentUser;
  if (user && !fromBuyNow) {
    const custSnap = await getDoc(doc(db, "customers", user.uid));
    const custData = custSnap.data();
    const q = query(
      collection(db, "deliveryCharges"),
      where("restaurant", "==", selectedRestaurant.toLowerCase()),
      where("gender", "==", custData.gender.toLowerCase()),
      where("hostel", "==", custData.hostel.toLowerCase())
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      DELIVERY_CHARGE = Number(snap.docs[0].data().charge);
      console.log("✅ Found dynamic delivery charge:", DELIVERY_CHARGE);
    } else {
      DELIVERY_CHARGE = 300;
      console.warn("⚠️ No match found — fallback delivery charge:", DELIVERY_CHARGE);
    }

    updateTotal();
    renderOrderTable();
  }
});

// -----------------------------
// NEW: when To Location changes
// -----------------------------

async function updateDeliveryCharge(fromLocation, toLocation) {
  try {
    const user = auth.currentUser;
    if (!user || !fromLocation || !toLocation) return;

    const custSnap = await getDoc(doc(db, "customers", user.uid));
    if (!custSnap.exists()) return;

    const custData = custSnap.data();
    const gender = (custData.gender || "").toLowerCase();

    // If "My Room" selected, use hostel as toLocation
    const finalToLoc =
      toLocation === "My Room"
        ? custData.hostel
        : toLocation;

    const q = query(
      collection(db, "deliveryCharges"),
      where("fromLocation", "==", fromLocation),
      where("toLocation", "==", finalToLoc),
      where("gender", "==", gender)
    );

    const snap = await getDocs(q);
    if (!snap.empty) {
      DELIVERY_CHARGE = Number(snap.docs[0].data().charge);
      console.log("✅ Delivery charge found:", DELIVERY_CHARGE);
    } else {
      DELIVERY_CHARGE = 300;
      console.warn("⚠️ Defaulting to ₦300 (no delivery charge match)");
    }

    updateTotal();
    renderOrderTable();
  } catch (err) {
    console.error("Error updating delivery charge:", err);
  }
}

let previousToLocation = "";

toLocationSelect.addEventListener('change', async (e) => {
  const newToLoc = toLocationSelect.value;

  // 🔹 Prevent using To-location before From-location
  if (!selectedRestaurant) {
    alert("Please choose a restaurant (From Location) first.");
    toLocationSelect.value = previousToLocation;
    return;
  }

  // 🔹 If cart exists and destination changed, confirm first
  if (cart.length && previousToLocation && previousToLocation !== newToLoc) {
    const confirmChange = confirm("Changing your destination may affect delivery charge. Continue?");
    if (!confirmChange) {
      toLocationSelect.value = previousToLocation;
      return;
    }
  }

  previousToLocation = newToLoc;

  // 🔹 If cleared, reset delivery and menu view
  if (!newToLoc) {
    DELIVERY_CHARGE = 300;
    updateTotal();
    renderMenu();
    return;
  }

  // 🔹 Fetch proper charge dynamically every time
  const user = auth.currentUser;
  if (!user) return;
  const custSnap = await getDoc(doc(db, "customers", user.uid));
  const custData = custSnap.exists() ? custSnap.data() : {};
  const gender = (custData.gender || "").toLowerCase();

  const q = query(
    collection(db, "deliveryCharges"),
    where("gender", "==", gender),
    where("fromLocation", "==", selectedRestaurant),
    where("toLocation", "==", newToLoc)
  );

  const snap = await getDocs(q);
  if (!snap.empty) {
    DELIVERY_CHARGE = Number(snap.docs[0].data().charge);
    console.log("✅ Delivery charge found:", DELIVERY_CHARGE);
  } else {
    DELIVERY_CHARGE = 300;
    console.warn("⚠️ No charge found — defaulting to ₦300");
  }

  updateTotal();
  renderMenu();
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
  stopCountdown();
  hidePendingAnimation();

  if (savedOrderId) {
    updateDoc(doc(db, "orders", savedOrderId), {
      orderStatus: "cancelled",
      paymentStatus: "cancelled"
    }).catch(()=>{});
    savedOrderId = null;
  }

  updateOrderButton();
  closeOrderModal();
});

cancelStep1.addEventListener("click", () => {
  bankModal.classList.add("hidden");
  stopCountdown();
  hidePendingAnimation();

  if (savedOrderId) {
    // if somehow order was created, mark as cancelled
    updateDoc(doc(db, "orders", savedOrderId), {
      orderStatus: "cancelled",
      paymentStatus: "cancelled"
    }).catch(()=>{});
    savedOrderId = null;
  }

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

// Copy icons behavior (unchanged) - ensure copy buttons have class .copy-icon and data-copy=targetId
document.addEventListener("click", (e) => {
  if (e.target.classList && e.target.classList.contains("copy-icon")) {
    const targetId = e.target.dataset.copy;
    const txt = document.getElementById(targetId)?.textContent || e.target.dataset.copy;
    navigator.clipboard.writeText(txt).then(() => alert("Copied: " + txt));
  }
});

ivePaidBtn.addEventListener("click", async () => {
  try {
    if (savedOrderId) {
      alert("Payment is already being processed...");
      return;
    }
    ivePaidBtn.disabled = true;

    const custBankName = document.getElementById("custBankName")?.value || "";
    const custAccountNumber = document.getElementById("custAccountNumber")?.value || "";
    const custAccountName = document.getElementById("custAccountName")?.value || "";
    const custNarration = document.getElementById("custNarration")?.value || "";

    const user = auth.currentUser;
    if (!user) return alert("You must be logged in.");
    if (!custBankName || !custAccountNumber || !custAccountName)
      return alert("Please fill your bank details.");

    const customerSnap = await getDoc(doc(db, "customers", user.uid));
    if (!customerSnap.exists()) return alert("Customer profile not found.");
    const customerData = customerSnap.data();

    const itemTotal = Number(orderTotalElem.dataset.itemTotal || 0);
    const delivery = Number(orderTotalElem.dataset.delivery || 0);
    const pack = Number(orderTotalElem.dataset.pack || 0);
    const fee = Number(orderTotalElem.dataset.fee || 0);
    const total = Number(orderTotalElem.dataset.total || 0);

    const newOrderRef = await addDoc(collection(db, "orders"), {
      customerId: user.uid,
      customerName: customerData.fullname,
      customerUsername: customerData.username,
      customerEmail: customerData.email,
      customerPhone: customerData.phone,
      hostel: customerData.hostel,
      roomNumber: customerData.roomNumber,
      // ✅ If "My Room" selected, combine hostel + room number
      toLocation:
        toLocationSelect.options[toLocationSelect.selectedIndex]?.textContent === "My Room"
          ? `${customerData.hostel} Room ${customerData.roomNumber}`
          : toLocationSelect.value,
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
      countdownStart: serverTimestamp(),
    });

    savedOrderId = newOrderRef.id;
    const restOrderIdElem = document.getElementById("restOrderId");
    if (restOrderIdElem) restOrderIdElem.textContent = savedOrderId;

    showPendingAnimation();

    const normalize = (str) => (str || "").toLowerCase().replace(/\s+/g, " ").trim();
    const custNorm = normalize(custAccountName);
    const alertsRef = collection(db, "payment_alerts");

    // ---------------------------
    // Cancel modal handling
    // ---------------------------
    const handleCancelOrder = async () => {
      const confirmCancel = confirm(
        "You haven't completed the payment. Closing now will cancel the order. Continue?"
      );
      if (!confirmCancel) return false;

      stopCountdown();
      hidePendingAnimation();

      if (savedOrderId) {
        const orderRef = doc(db, "orders", savedOrderId);
        try {
          const snap = await getDoc(orderRef);
          if (snap.exists()) {
            const data = snap.data();
            await setDoc(doc(db, "trash", "orders", savedOrderId), {
              ...data,
              orderStatus: "cancelled",
              paymentStatus: "cancelled",
              trashedAt: new Date()
            });
            await deleteDoc(orderRef);
          }
        } catch (e) {
          console.error("Failed to cancel order:", e);
        }
      }

      savedOrderId = null;
      return true;
    };

    // Listen for modal close/cancel button
    const closeBtns = bankModal.querySelectorAll(".closeModal, .cancelBtn");
    closeBtns.forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        await handleCancelOrder();
        bankModal.classList.add("hidden");
      });
    });

    // ---------------------------
    // Existing alert checking & listeners
    // ---------------------------
    function showResultAnimation(type, message) {
      hidePendingAnimation();
      const overlay = document.createElement("div");
      Object.assign(overlay.style, {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 10000,
        color: "#fff",
        flexDirection: "column",
        fontSize: "1.3rem"
      });
    
      const icon = document.createElement("div");
      icon.innerHTML = type === "success"
        ? `<i class="uil uil-check-circle" style="font-size:4rem;color:#0f4e75;"></i>`
        : `<i class="uil uil-times-circle" style="font-size:4rem;color:#ff4d4f;"></i>`;
      icon.style.marginBottom = "1rem";
    
      const text = document.createElement("div");
      text.textContent = message;
    
      overlay.appendChild(icon);
      overlay.appendChild(text);
      document.body.appendChild(overlay);
    }

    function withinThirtyMinutes(orderStart, alertTime) {
      if (!orderStart || !alertTime) return false;
      const alertDate = alertTime instanceof Date ? alertTime : new Date(alertTime);
      const diff = Math.abs(alertDate.getTime() - orderStart.getTime());
      return diff <= 30 * 60 * 1000;
    }

    const orderSnap = await getDoc(doc(db, "orders", savedOrderId));
    const orderData = orderSnap.data();
    if (["successful", "refund_required", "refunded"].includes(orderData.paymentStatus)) {
        // mark alert as duplicate
        await updateDoc(aDoc.ref, { processed: "duplicate" });
    }
    const orderStart = orderData?.countdownStart?.toDate?.() 
  ? orderData.countdownStart.toDate() 
  : new Date();

    // Step 1: check old alerts
    const oldQ = query(alertsRef, where("processed", "==", "false"));
    const oldSnap = await getDocs(oldQ);
    for (const aDoc of oldSnap.docs) {
      const a = aDoc.data();
      if (a.processed === "true") continue;
      // extract sender name from sender or fallback to narration
      let senderRaw = a.sender?.trim();
      if (!senderRaw || senderRaw === "No sender" || senderRaw === "No sender bank") {
        senderRaw = a.narration || ""; // fallback to narration
      }
      const senderNorm = normalize(senderRaw);
      const createdAt = a.timestamp?.toDate?.() || new Date(a.timestamp);
      const amt = parseFloat(a.amount);

      if (senderNorm.replace(/\s+/g,"").includes(custNorm.replace(/\s+/g,"")) || 
      custNorm.replace(/\s+/g,"").includes(senderNorm.replace(/\s+/g,""))) {
        if (!withinThirtyMinutes(orderStart, createdAt)) {
          await updateDoc(aDoc.ref, { processed: "not_used" });
          continue;
        }
        if (Math.abs(amt - total) < 1) {
          await runTransaction(db, async (transaction) => {
            transaction.update(doc(db, "payment_alerts", aDoc.id), { processed: "true" });
            transaction.update(doc(db, "orders", savedOrderId), {
              paymentStatus: "successful",
              paymentMatchedAt: new Date(),
              matchedByAlertId: aDoc.id
            });
          });
          showResultAnimation("success", "Payment Successful!");
          setTimeout(() => window.location.href = "pending-orders.html", 2500);
          return;
        } else {
          await runTransaction(db, async (transaction) => {
            transaction.update(doc(db, "payment_alerts", aDoc.id), { processed: "true" });
            transaction.update(doc(db, "orders", savedOrderId), {
              paymentStatus: "refund_required",
              refundCandidateAlertId: aDoc.id,
              refundReason: `Amount mismatch: expected ₦${total}, got ₦${amt}`,
              paymentMatchedAt: new Date()
            });
          });
          showResultAnimation("error", "Refund in Progress...");
          setTimeout(() => window.location.href = "pending-orders.html", 2500);
          return;
        }
      }
    }

    // Step 2: listen for new alerts
    const q = query(alertsRef, where("processed", "==", "false"));
    const unsubAlerts = onSnapshot(q, async (snap) => {
      for (const aDoc of snap.docs) {
        const a = aDoc.data();
        if (a.processed === "true") continue;
        // extract sender name from sender or fallback to narration
        let senderRaw = a.sender?.trim();
        if (!senderRaw || senderRaw === "No sender" || senderRaw === "No sender bank") {
          senderRaw = a.narration || ""; // fallback to narration
        }
        const senderNorm = normalize(senderRaw);
        const amt = parseFloat(a.amount);
        const createdAt = a.timestamp?.toDate?.() || new Date(a.timestamp);

        if (senderNorm.replace(/\s+/g,"").includes(custNorm.replace(/\s+/g,"")) || 
        custNorm.replace(/\s+/g,"").includes(senderNorm.replace(/\s+/g,""))) {
          if (!withinThirtyMinutes(orderStart, createdAt)) {
            await updateDoc(aDoc.ref, { processed: "not_used" });
            continue;
          }
          if (Math.abs(amt - total) < 1) {
            await runTransaction(db, async (transaction) => {
              transaction.update(doc(db, "payment_alerts", aDoc.id), { processed: "true" });
              transaction.update(doc(db, "orders", savedOrderId), {
                paymentStatus: "successful",
                paymentMatchedAt: new Date(),
                matchedByAlertId: aDoc.id
              });
            });
            unsubAlerts();
            showResultAnimation("success", "Payment Successful!");
            setTimeout(() => window.location.href = "pending-orders.html", 2500);
            return;
          } else {
            await runTransaction(db, async (transaction) => {
              transaction.update(doc(db, "payment_alerts", aDoc.id), { processed: "true" });
              transaction.update(doc(db, "orders", savedOrderId), {
                paymentStatus: "refund_required",
                refundCandidateAlertId: aDoc.id,
                refundReason: `Amount mismatch: expected ₦${total}, got ₦${amt}`,
                paymentMatchedAt: new Date()
              });
            });
            unsubAlerts();
            showResultAnimation("error", "Refund in Progress...");
            setTimeout(() => window.location.href = "pending-orders.html", 2500);
            return;
          }
        }
      }
    });

    // Step 3: watch order
    const orderRef = doc(db, "orders", savedOrderId);
    const unsubOrder = onSnapshot(orderRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
    
      // ✅ Success (either from admin or system)
      if (data.paymentStatus === "successful") {
        hidePendingAnimation();
        unsubOrder();
        unsubAlerts && unsubAlerts();
        showResultAnimation("success", "Payment Successful!");
        setTimeout(() => window.location.href = "pending-orders.html", 2500);
        return;
      }
    
      // ❌ Declined (admin decision)
      if (data.paymentStatus === "declined") {
        hidePendingAnimation();
        unsubOrder();
        unsubAlerts && unsubAlerts();
        showResultAnimation(
          "error",
          "Payment Declined. If you already made the payment, please contact support or file a complaint."
        );
        setTimeout(() => window.location.href = "complaints.html", 5000);
        return;
      }
    
      // Refunds, expiry, cancellations
      const hideStatuses = ["refund_required", "refunded", "expired", "cancelled"];
      if (hideStatuses.includes(data.paymentStatus)) {
        hidePendingAnimation();
        unsubOrder();
        unsubAlerts && unsubAlerts();
        window.location.href = "pending-orders.html";
      }
    });

    // Step 4: timeout after 5 minutes
    countdownTimeout = setTimeout(async () => {
      unsubAlerts();
      await updateDoc(orderRef, { paymentStatus: "manual_required" });
    }, 5 * 60 * 1000);

    // clear cart & close modal
    cart = [];
    updateOrderButton();
    closeOrderModal();

  } catch (err) {
    console.error("Payment matching error:", err);
    hidePendingAnimation();
    alert("Error confirming payment. Try again or contact support.");
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
  
      if (savedOrderId) {
        (async () => {
          try {
            const orderRef = doc(db, "orders", savedOrderId);
            const snap = await getDoc(orderRef);
            if (snap.exists()) {
              const data = snap.data();
              await setDoc(doc(db, "trash", "orders", savedOrderId), {
                ...data,
                orderStatus: "cancelled",
                paymentStatus: "expired",
                trashedAt: new Date()
              });
              await deleteDoc(orderRef);
            }
          } catch (e) {
            console.error("Failed to move expired order:", e);
          }
        })();
      }
  
      alert("Payment window expired.");
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (countdownTimeout) {
    clearTimeout(countdownTimeout);
    countdownTimeout = null;
  }
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
  box.innerHTML = `<div class="spinner" style="margin-bottom:10px;"></div><div>Waiting for payment confirmation…</div>
  <div style="color:red;">Do not leave or close this page</div>`;
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

window.addEventListener("beforeunload", () => {
  localStorage.removeItem("fromLocation");
  localStorage.removeItem("toLocation");
});
