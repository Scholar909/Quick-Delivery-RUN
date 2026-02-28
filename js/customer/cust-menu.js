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
  deleteDoc,
  setDoc
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

onAuthStateChanged(auth, async (user) => {
  if (user) {
    listenToRestaurants();
    listenToFoodItems();
    listenToBuyNowCart(user.uid);
    await loadToLocations(); 
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
// DOM Elements & Constants
// -------------------------------------------------
const restaurantSelect = document.getElementById('restaurantSelect');
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
const orderDescriptionInput = document.getElementById('orderDescription');
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

  await loadToLocations();

  if (fromLoc) {
    for (const opt of restaurantSelect.options) {
      if (opt.textContent === fromLoc || opt.value === fromLoc) {
        restaurantSelect.value = opt.value;
        selectedRestaurant = opt.value;
        previousRestaurant = opt.value;
        break;
      }
    }

    restaurantSelect.disabled = true;
    toLocationSelect.disabled = false;

    if (toLoc) {
      for (const opt of toLocationSelect.options) {
        if (opt.textContent === toLoc || opt.value === toLoc) {
          toLocationSelect.value = opt.value;
          previousToLocation = opt.value;
          break;
        }
      }
    }

    await updateDeliveryCharge(fromLoc, toLoc || "My Room");
    renderMenu();
    updateOrderTable();
    updateTotal();
    return;
  }

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

    if (cart.length) {
      selectedRestaurant = cart[0].restaurantName || "";
      orderRestaurantName.textContent = selectedRestaurant;
    
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

    if (cart.length) {
      orderModal.classList.remove("hidden");
    }
  });
}

const banks = [
  "Access Bank", "Agricultural Bank of China", "ASO Savings & Loans", "Banco Bilbao Vizcaya Argentaria (BBVA)",
  "Banco do Brasil", "Banco Santander", "Bank of America", "Bank of China", "Barclays plc", "BNP Paribas",
  "China Construction Bank", "Citibank", "Citigroup Inc.", "Citizens Bank Nigeria", "Coronation Merchant Bank",
  "Credit Agricole", "Credit Suisse", "Crédit Mutuel", "Deutsche Bank", "Diamond Bank", "Ecobank Plc",
  "Enterprise Bank", "FCMB (First City Monument Bank)", "FBNMobile", "Fidelity Bank", "First Bank of Nigeria",
  "Fortis Microfinance Bank", "FortisMobile", "FSDH Merchant Bank", "Globus Bank", "Goldman Sachs Group",
  "GTBank Plc", "Heritage Bank", "HSBC Holdings plc", "Industrial and Commercial Bank of China (ICBC)",
  "ING Group", "JAIZ Bank", "Jaiz Microfinance Bank", "JPMorgan Chase & Co.", "Keystone Bank", "Lotus Bank",
  "Migo Microfinance Bank", "Mitsubishi UFJ Financial Group (MUFG)", "Mizuho Financial Group", "Moneysurf Finance Company",
  "Morgan Stanley", "Nova Merchant Bank", "Opay", "Page MFBank", "PalmPay", "PalmPay Microfinance Bank",
  "Parralex Bank", "Parralex Microfinance Bank", "PayAttitude Online", "Rand Merchant Bank Nigeria",
  "Royal Bank of Canada", "Santander Bank", "Skye Bank", "Société Générale", "Standard Chartered Bank",
  "Stanbic IBTC Bank", "Stanbic Mobile Money", "Sterling Bank", "Sumitomo Mitsui Financial Group", "SunTrust Bank",
  "SunTrust Microfinance Bank", "Titan Trust Bank", "Toronto-Dominion Bank (TD Bank Group)", "UBS", "UBS Group AG",
  "Union Bank", "United Bank for Africa", "Unity Bank", "Unity Trust Bank", "VTNetworks", "Wells Fargo",
  "Wema Bank", "Zenith Bank", "ZenithMobile"
];

const custBankSelect = document.getElementById("custBankName");
custBankSelect.innerHTML = `<option value="">Choose Bank</option>`;
banks.forEach(bank => {
  const opt = document.createElement("option");
  opt.value = bank;
  opt.textContent = bank;
  custBankSelect.appendChild(opt);
});

// countdown + floating grid reminder
let countdownTimer = null;
let countdownSecs = 1800; 
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

async function loadToLocations() {  
  try {  
    const user = auth.currentUser;  
    if (!user) return;  

    const custSnap = await getDoc(doc(db, "customers", user.uid));  
    const custData = custSnap.exists() ? custSnap.data() : {};  
    const realRoomLocation = custData?.hostel || "Unknown Location";

    const allLocs = new Set(["__myRoom__"]); 
    const chargesSnap = await getDocs(collection(db, "deliveryCharges"));  
    chargesSnap.forEach(ch => {  
      const data = ch.data();  
      if (data.toLocation) allLocs.add(data.toLocation);  
    });  

    toLocationSelect.innerHTML = `<option value="">Choose Location</option>`;  
    allLocs.forEach(loc => {  
      const opt = document.createElement("option");  
      if (loc === "__myRoom__") {  
        opt.value = realRoomLocation;      
        opt.textContent = "My Room";       
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

function checkOrderWindow() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const time = hour + minute / 60;
  const open = 8.0; 
  const close = 21.5; 

  if (time < open || time >= close) {
    payNowBtn.disabled = true;
    payNowBtn.style.opacity = "0.5";
    payNowBtn.textContent = "Checkout Closed (8:00am–9:30pm)";
  } else {
    payNowBtn.disabled = false;
    payNowBtn.style.opacity = "1";
    payNowBtn.textContent = "Checkout";
  }
}

setInterval(checkOrderWindow, 60000);
checkOrderWindow();

const renderMenu = () => {
  foodItemsContainer.innerHTML = '';
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

let previousRestaurant = "";

restaurantSelect.addEventListener('change', async (e) => {
  const newRestaurant = restaurantSelect.value;
  const fromBuyNow = localStorage.getItem("fromLocation");
  
  if (restaurantSelect.disabled && fromBuyNow && fromBuyNow === selectedRestaurant) {
    alert("This restaurant was preselected from your combo. You cannot change it for this order.");
    restaurantSelect.value = selectedRestaurant;
    return;
  }

  if (cart.length && previousRestaurant && previousRestaurant !== newRestaurant) {
    const confirmChange = confirm('Changing restaurant clears your cart. Continue?');
    if (!confirmChange) {
      restaurantSelect.value = previousRestaurant;
      return;
    }
    cart = [];
    updateOrderButton();
  }

  selectedRestaurant = newRestaurant;
  previousRestaurant = newRestaurant;

  if (!selectedRestaurant) {
    toLocationSelect.disabled = true;
    toLocationSelect.value = "";
    DELIVERY_CHARGE = 300; 
    updateTotal();
  } else {
    toLocationSelect.disabled = false;
  }

  if (!fromBuyNow) {
    toLocationSelect.value = "";
  }

  renderMenu();

  if (selectedRestaurant) {
    const restRef = doc(db, "restaurants", selectedRestaurant);
    const restSnap = await getDoc(restRef);
    if (restSnap.exists()) {
      currentRestaurantData = restSnap.data();
    }
  }

  const user = auth.currentUser;
  if (user && !fromBuyNow && selectedRestaurant) {
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
    } else {
      DELIVERY_CHARGE = 300;
    }
    updateTotal();
    renderOrderTable();
  }
});

async function updateDeliveryCharge(fromLocation, toLocation) {
  try {
    const user = auth.currentUser;
    if (!user || !fromLocation || !toLocation) return;
    const custSnap = await getDoc(doc(db, "customers", user.uid));
    if (!custSnap.exists()) return;
    const custData = custSnap.data();
    const gender = (custData.gender || "").toLowerCase();
    const finalToLoc = toLocation === "My Room" ? custData.hostel : toLocation;

    const q = query(
      collection(db, "deliveryCharges"),
      where("fromLocation", "==", fromLocation),
      where("toLocation", "==", finalToLoc),
      where("gender", "==", gender)
    );

    const snap = await getDocs(q);
    if (!snap.empty) {
      DELIVERY_CHARGE = Number(snap.docs[0].data().charge);
    } else {
      DELIVERY_CHARGE = 300;
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
  if (!selectedRestaurant) {
    alert("Please choose a restaurant (From Location) first.");
    toLocationSelect.value = previousToLocation;
    return;
  }
  if (cart.length && previousToLocation && previousToLocation !== newToLoc) {
    const confirmChange = confirm("Changing your destination may affect delivery charge. Continue?");
    if (!confirmChange) {
      toLocationSelect.value = previousToLocation;
      return;
    }
  }

  previousToLocation = newToLoc;
  if (!newToLoc) {
    DELIVERY_CHARGE = 300;
    updateTotal();
    renderMenu();
    return;
  }

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
  } else {
    DELIVERY_CHARGE = 300;
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

closeBankModal.addEventListener("click", () => {
  bankModal.classList.add("hidden");
  stopCountdown();
});

cancelStep1.addEventListener("click", () => {
  bankModal.classList.add("hidden");
  stopCountdown();
});

if (nextBtn) {
  nextBtn.addEventListener("click", async () => {
    const bankName = document.getElementById("custBankName")?.value || "";
    const accNum = document.getElementById("custAccountNumber")?.value || "";
    const accName = document.getElementById("custAccountName")?.value || "";

    if (!bankName || !accNum || !accName) {
      alert("Please fill in your bank name, account number and account name.");
      return;
    }

    if (step1) step1.style.display = "none";
    if (step2) step2.style.display = "block";

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
      restOrderIdElem.dataset.frontRef = frontOrderRef;
    }
    startCountdown(null);
  });
}

if (prevBtn) {
  prevBtn.addEventListener("click", () => {
    if (step2) step2.style.display = "none";
    if (step1) step1.style.display = "block";
  });
}

document.addEventListener("click", (e) => {
  if (e.target.classList && e.target.classList.contains("copy-icon")) {
    const targetId = e.target.dataset.copy;
    const txt = document.getElementById(targetId)?.textContent || e.target.dataset.copy;
    navigator.clipboard.writeText(txt).then(() => alert("Copied: " + txt));
  }
});

// -------------------------------------------------
// Modified "I've Paid" - No Alert Checking, Direct Manual Approval
// -------------------------------------------------
ivePaidBtn.addEventListener("click", async () => {
  try {
    ivePaidBtn.disabled = true;

    const custBankName = document.getElementById("custBankName")?.value || "";
    const custAccountNumber = document.getElementById("custAccountNumber")?.value || "";
    const custAccountName = document.getElementById("custAccountName")?.value || "";
    const custNarration = document.getElementById("custNarration")?.value || "";
    const orderDescription = orderDescriptionInput?.value || "";

    const user = auth.currentUser;
    if (!user) return alert("You must be logged in.");

    const customerSnap = await getDoc(doc(db, "customers", user.uid));
    if (!customerSnap.exists()) return alert("Customer profile not found.");
    const customerData = customerSnap.data();

    const itemTotal = Number(orderTotalElem.dataset.itemTotal || 0);
    const delivery = Number(orderTotalElem.dataset.delivery || 0);
    const pack = Number(orderTotalElem.dataset.pack || 0);
    const fee = Number(orderTotalElem.dataset.fee || 0);
    const total = Number(orderTotalElem.dataset.total || 0);

    // Create order document
    const newOrderRef = await addDoc(collection(db, "orders"), {
      customerId: user.uid,
      customerName: customerData.fullname,
      customerUsername: customerData.username,
      customerEmail: customerData.email,
      customerPhone: customerData.phone,
      hostel: customerData.hostel,
      roomNumber: customerData.roomNumber,
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
      paymentStatus: "pending_confirmation", // This signals admin to check manually
      orderStatus: "pending_assignment",
      createdAt: serverTimestamp(),
      declinedBy: [],
      customerBankName: custBankName,
      customerAccountNumber: custAccountNumber,
      customerAccountName: custAccountName,
      customerNarration: custNarration,
      orderDescription: orderDescription
    });

    stopCountdown();
    alert("Order submitted! Please wait for admin to confirm your payment.");
    
    // Clear cart and redirect immediately
    cart = [];
    updateOrderButton();
    window.location.href = "pending-orders.html";

  } catch (err) {
    console.error("Order creation error:", err);
    ivePaidBtn.disabled = false;
    alert("Error submitting order. Please try again.");
  }
});

// Countdown helpers
async function startCountdown(orderId) {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownSecs = 1800;
  floatingGrid.style.display = "block";
  updateCountdownUI();

  countdownTimer = setInterval(() => {
    countdownSecs--;
    updateCountdownUI();
    if (countdownSecs <= 0) {
      stopCountdown();
      bankModal.classList.add('hidden');
      alert("Payment window expired.");
    }
  }, 1000);
}

function stopCountdown() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  floatingGrid.style.display = "none";
}

function updateCountdownUI() {
  const mins = Math.floor(countdownSecs / 60);
  const secs = countdownSecs % 60;
  const ct = document.getElementById("countdownTimer");
  if (ct) ct.textContent = `${mins}:${secs.toString().padStart(2,"0")}`;
  floatingGrid.textContent = `Pending Payment (${mins}:${secs.toString().padStart(2,"0")})`;
}

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

listenToRestaurants();
listenToFoodItems();
updateOrderButton();

window.addEventListener("beforeunload", () => {
  localStorage.removeItem("fromLocation");
  localStorage.removeItem("toLocation");
});