import { auth, db } from '../firebase.js';
import {
  collection,
  onSnapshot,
  query,
  addDoc,
  orderBy,
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

// Grab Flutterwave from the global window (set by v3.js)
const FlutterCheckout = window.FlutterwaveCheckout;

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

// -------------------------------------------------
// Auto-disable Pay Now window (Africa/Lagos)
// -------------------------------------------------
const OPEN_MINUTES = 6 * 60;          // 09:00
const CLOSE_MINUTES = 21 * 60 + 30;   // 21:30

function getLagosHM() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const hour = Number(parts.find(p => p.type === 'hour').value);
  const minute = Number(parts.find(p => p.type === 'minute').value);
  return { hour, minute };
}

function isOrderingOpenNow() {
  const { hour, minute } = getLagosHM();
  const mins = hour * 60 + minute;
  return mins >= OPEN_MINUTES && mins < CLOSE_MINUTES;
}

let payNowNotice = null;
function ensurePayNowNotice() {
  if (!payNowNotice) {
    payNowNotice = document.createElement('div');
    payNowNotice.style.marginTop = '8px';
    payNowNotice.style.fontSize = '0.9rem';
    payNowNotice.style.opacity = '0.9';
    payNowBtn.parentElement?.appendChild(payNowNotice);
  }
  return payNowNotice;
}

function updatePayNowAvailabilityUI() {
  const open = isOrderingOpenNow();
  const hasItems = cart.length > 0;
  payNowBtn.disabled = !(open && hasItems);

  const note = ensurePayNowNotice();
  if (!open) {
    note.textContent = 'Ordering is closed';
    note.style.color = 'red';
    note.style.display = 'flex';
    note.style.justifyContent = 'center';
    note.style.alignItems = 'center';
  } else if (!hasItems) {
    note.textContent = 'Your cart is empty';
    note.style.color = 'red';
    note.style.display = 'flex';
    note.style.justifyContent = 'center';
    note.style.alignItems = 'center';
  } else {
    note.textContent = '';
    note.style.display = 'none';
  }
}

setInterval(updatePayNowAvailabilityUI, 30_000);

// -------------------------------------------------
// Constants
// -------------------------------------------------
const DELIVERY_CHARGE = 300;
const PACK_CHARGE = 200;
const FEE_RATE = 0.015;

// Data
let allFoodItems = [];
let selectedRestaurant = '';
let cart = [];

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
  updatePayNowAvailabilityUI();
};

const openOrderModal = () => {
  orderRestaurantName.textContent = cart[0]?.restaurantName || '';
  renderOrderTable();
  orderModal.classList.remove('hidden');
  updatePayNowAvailabilityUI();
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
  let subtotal = itemTotal + delivery + pack;
  let fee = Math.round(subtotal * FEE_RATE);
  let total = subtotal + fee;

  // Update modal UI
  document.getElementById('deliveryCharge').textContent = `NGN${delivery}`;
  document.getElementById('feeCharge').textContent = `NGN${fee}`;
  orderTotalElem.textContent = `NGN${total}`;

  // Keep values for Pay Now
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
restaurantSelect.addEventListener('change', () => {
  selectedRestaurant = restaurantSelect.value;
  if (cart.length) {
    if (!confirm('Changing restaurant clears your cart. Continue?')) {
      return;
    }
    cart = [];
    updateOrderButton();
  }
  renderMenu();
});

orderButton.addEventListener('click', openOrderModal);
closeModal.addEventListener('click', closeOrderModal);
addPackCheckbox.addEventListener('change', updateTotal);

payNowBtn.addEventListener('click', async () => {
  if (!isOrderingOpenNow()) {
    alert('Ordering is closed (9:30 PM – 9:00 AM, Africa/Lagos).');
    return;
  }
  if (!cart.length) {
    alert("Your cart is empty!");
    return;
  }
  if (!selectedRestaurant) {
    alert("Please choose a restaurant.");
    return;
  }
  if (!FlutterCheckout) {
    alert("Payment library not loaded.");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    alert("You must be logged in.");
    return;
  }

  // 1. Get customer details
  const customerDocRef = doc(db, "customers", user.uid);
  const customerSnap = await getDoc(customerDocRef);
  if (!customerSnap.exists()) {
    alert("Customer profile not found.");
    return;
  }
  const customerData = customerSnap.data();

  // 2. Get restaurant details (with subaccount id)
  const restRef = doc(db, "restaurants", selectedRestaurant);
  const restSnap = await getDoc(restRef);
  if (!restSnap.exists()) {
    alert("Restaurant not found.");
    return;
  }
  const restaurantData = restSnap.data();
  const subaccountId = restaurantData.subaccount_id;  // saved in Firestore

  // 3. Totals
  const itemTotal = Number(orderTotalElem.dataset.itemTotal);
  const delivery = Number(orderTotalElem.dataset.delivery);
  const pack = Number(orderTotalElem.dataset.pack);
  const fee = Number(orderTotalElem.dataset.fee);
  const total = Number(orderTotalElem.dataset.total);

  // 4. Trigger Paystack
  FlutterCheckout({
    public_key: "FLWPUBK-b7fc5a9c1691534f97111ea016002bf3-X", // replace with your Flutterwave public key
    tx_ref: "ORDER-" + Date.now(),
    amount: total,  // NGN (already in Naira, not kobo)
    currency: "NGN",
    payment_options: "card, ussd, banktransfer",
  
    customer: {
      email: customerData.email,
      phonenumber: customerData.phone,
      name: customerData.fullname,
    },
  
    subaccounts: [
      {
        id: subaccountId,   // restaurant’s subaccount_id from Firestore
        transaction_charge_type: "flat",
        transaction_charge: 0
      }
    ],
  
    meta: {
      restaurantName: selectedRestaurant,
      customerId: user.uid,
    },
  
    callback: async function (response) {
      if (response.status === "successful") {
        await addDoc(collection(db, "orders"), {
          customerId: user.uid,
          customerName: customerData.fullname,
          customerUsername: customerData.username,
          customerGender: customerData.gender,
          customerEmail: customerData.email,
          customerPhone: customerData.phone,
          customerRoom: customerData.room || customerData.roomLocation,
          restaurantName: restaurantData.name,
          restaurantSubaccount: subaccountId,
          items: cart,
          deliveryCharge: delivery,
          packCharge: pack,
          fee: fee,
          itemTotal: itemTotal,
          totalAmount: total,
          paymentGateway: "flutterwave",
          paymentStatus: "success",
          orderStatus: "pending_assignment",
          createdAt: new Date(),
          flutterwaveTx: response.transaction_id,
          declinedBy: []
        });
  
        alert("Payment successful! Your order is pending assignment.");
      } else {
        alert("Payment failed.");
      }
  
      cart = [];
      updateOrderButton();
      closeOrderModal();
    },
  
    onclose: function() {
      alert("Payment window closed.");
    },
  });
});

// Cart sync with availability
// -------------------------------------------------
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
updatePayNowAvailabilityUI();



/*
...

import { db } from '../firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

// Call this when checkout is clicked
async function checkout(restaurantName, cartTotal, customerEmail, customerPhone, customerName) {
  try {
    // 1. Get restaurant details (with subaccount)
    const restRef = doc(db, "restaurants", restaurantName);
    const restSnap = await getDoc(restRef);

    if (!restSnap.exists()) {
      alert("Restaurant not found!");
      return;
    }

    const restaurant = restSnap.data();

    // 2. Trigger Flutterwave inline
    FlutterwaveCheckout({
      public_key: "FLWPUBK_TEST-xxxxxxxxxxxxxxxxxxxxxxx", // replace with your public key
      tx_ref: "txn-" + Date.now(),
      amount: cartTotal,
      currency: "NGN",
      payment_options: "card,ussd,banktransfer",

      // Customer info
      customer: {
        email: customerEmail,
        phonenumber: customerPhone,
        name: customerName,
      },

      // 3. Split payments (direct to restaurant)
      subaccounts: [
        {
          id: restaurant.subaccount_id,  // <-- saved in Firestore
          transaction_charge_type: "flat",
          transaction_charge: 0
        }
      ],

      // 4. Optional meta
      meta: {
        restaurantName,
        orderDate: new Date().toISOString()
      },

      callback: function (response) {
        console.log("Payment response:", response);
        if (response.status === "successful") {
          alert("Payment successful! 🎉");
          // TODO: Save order in Firestore
        }
      },

      onclose: function() {
        console.log("Checkout closed");
      },
    });

  } catch (err) {
    console.error("Checkout error:", err);
  }
}
*/
