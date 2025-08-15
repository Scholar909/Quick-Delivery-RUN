import { db } from '../firebase.js';
import {
  collection,
  onSnapshot,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

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

// ... keep your existing imports

// After defining DOM elements and variables:

document.addEventListener("DOMContentLoaded", () => {
  const savedRestaurant = localStorage.getItem('selectedRestaurant');
  if (savedRestaurant) {
    selectedRestaurant = savedRestaurant;
    restaurantSelect.value = savedRestaurant;
    localStorage.removeItem('selectedRestaurant');
    renderMenu();
  }
});

// Constants
const DELIVERY_CHARGE = 300;
const PACK_CHARGE = 200;

// Data
let allFoodItems = [];
let selectedRestaurant = '';
let cart = [];

// Listen to restaurants (built from distinct restaurantName in foodItems)
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

// Listen to food items and render menu on changes
const listenToFoodItems = () => {
  const foodRef = collection(db, 'foodItems');
  const q = query(foodRef, orderBy('restaurantName'));
  onSnapshot(q, (snapshot) => {
    allFoodItems = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    renderMenu();
  });
};

// Render menu with selectable circles
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

    // Check if item is in cart
    const isSelected = cart.some(ci => ci.id === item.id);

    // Circle select element
    const circleSelect = document.createElement('div');
    circleSelect.classList.add('circle-select');
    if (isSelected) circleSelect.classList.add('selected');
    circleSelect.title = isSelected ? 'Unchoose' : 'Choose';

    // Menu info container
    const infoDiv = document.createElement('div');
    infoDiv.classList.add('menu-info');
    infoDiv.innerHTML = `
      <h3>${item.name}</h3>
      <p>Category: ${item.category}</p>
      <p>Price: NGN${item.price}</p>
    `;

    // Add circle and info to card
    card.appendChild(infoDiv);
    card.appendChild(circleSelect);
    // Click handlers for both card and circle (if available)
    if (item.available) {
      const toggleSelection = () => {
        // If cart has items from different restaurant, confirm clear cart
        if (cart.length && cart[0].restaurantName !== item.restaurantName) {
          if (!confirm("You can only order from one restaurant at a time. Clear current cart?")) return;
          cart = [];
        }

        const idx = cart.findIndex(ci => ci.id === item.id);
        if (idx === -1) {
          cart.push({ ...item, qty: 1 });
          circleSelect.classList.add('selected');
          circleSelect.title = 'Unchoose';
        } else {
          cart.splice(idx, 1);
          circleSelect.classList.remove('selected');
          circleSelect.title = 'Choose';
        }
        updateOrderButton();
      };

      card.addEventListener('click', toggleSelection);
      circleSelect.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent card click firing twice
        toggleSelection();
      });
    }

    container.appendChild(card);
  });

  foodItemsContainer.appendChild(container);
};

// Update order button & count
const updateOrderButton = () => {
  const totalQty = cart.reduce((sum, ci) => sum + ci.qty, 0);
  orderCount.textContent = totalQty;
  orderButton.classList.toggle('hidden', totalQty === 0);
};

// Open modal to show order
const openOrderModal = () => {
  orderRestaurantName.textContent = cart[0]?.restaurantName || '';
  renderOrderTable();
  orderModal.classList.remove('hidden');
};

// Close modal
const closeOrderModal = () => {
  orderModal.classList.add('hidden');
};

// Render order table rows
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

// Update total cost including delivery and packaging
const updateTotal = () => {
  let total = cart.reduce((sum, ci) => sum + ci.price * ci.qty, 0);
  total += DELIVERY_CHARGE;
  if (addPackCheckbox.checked) total += PACK_CHARGE;
  orderTotalElem.textContent = `NGN${total}`;
};

// Handle quantity changes in modal
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

// Event listeners
restaurantSelect.addEventListener('change', () => {
  selectedRestaurant = restaurantSelect.value;
  // Clear cart on restaurant change (optional)
  if (cart.length) {
    if (!confirm('Changing restaurant clears your cart. Continue?')) {
      // revert select to previous restaurant
      restaurantSelect.value = selectedRestaurant;
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
payNowBtn.addEventListener('click', () => {
  alert('Payment integration coming soon...');
});

// Initialization
listenToRestaurants();
listenToFoodItems();
updateOrderButton();