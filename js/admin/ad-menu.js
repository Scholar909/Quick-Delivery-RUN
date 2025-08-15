import { db } from '../firebase.js';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

// DOM Elements
const addBtn = document.getElementById('add-btn');
const addFormSection = document.getElementById('addFormSection');
const menuForm = document.getElementById('menuForm');
const searchInput = document.getElementById('searchAll');
const foodItemsContainer = document.getElementById('food-items');
const restaurantSelect = document.getElementById('restaurantSelect');
const restaurantNameInput = document.getElementById('restaurantName');
const itemNameInput = document.getElementById('itemName');
const itemCategorySelect = document.getElementById('itemCategory');
const itemPriceInput = document.getElementById('itemPrice');

let editingItemId = null;
let allFoodItems = [];

// 🔹 Load saved state from localStorage
const savedSearch = localStorage.getItem('adminMenuSearch') || '';
searchInput.value = savedSearch;

// Toggle Add Food Form
addBtn.addEventListener('click', () => {
  addFormSection.classList.toggle('hidden');
  if (!addFormSection.classList.contains('hidden')) {
    menuForm.reset();
    editingItemId = null;
  }
});

// 🔹 Real-time listener for restaurants + menu
const listenToRestaurantsAndItems = () => {
  // Restaurants dropdown updates only once at start
  const restaurantRef = collection(db, 'restaurants');
  onSnapshot(restaurantRef, (snapshot) => {
    const restaurantOptions = snapshot.docs.map(doc => doc.data().name).sort();
    restaurantSelect.innerHTML = `<option value="">-- Select Restaurant --</option>`;
    restaurantOptions.forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      restaurantSelect.appendChild(option);
    });
  });

  // Food items listen in real time
  const foodRef = collection(db, 'foodItems');
  const q = query(foodRef, orderBy('restaurantName'));
  onSnapshot(q, (snapshot) => {
    allFoodItems = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    applySearchFilter(); // Show filtered based on saved search
  });
};

// Group items by restaurant
const groupItemsByRestaurant = (foodItems) => {
  return foodItems.reduce((acc, item) => {
    if (!acc[item.restaurantName]) acc[item.restaurantName] = [];
    acc[item.restaurantName].push(item);
    return acc;
  }, {});
};

// Display items
const displayFoodItems = (foodItems) => {
  foodItemsContainer.innerHTML = '';
  const grouped = groupItemsByRestaurant(foodItems);
  Object.keys(grouped).sort().forEach((restaurantName) => {
    const container = document.createElement('div');
    container.classList.add('menu-card-container');

    const heading = document.createElement('h3');
    heading.textContent = restaurantName;
    container.appendChild(heading);

    grouped[restaurantName].forEach(item => {
      const card = document.createElement('div');
      card.classList.add('menu-card');

      const info = document.createElement('div');
      info.classList.add('menu-info');
      info.innerHTML = `
        <h3>${item.name}</h3>
        <p>Category: ${item.category}</p>
        <p>Price: ${item.price}</p>
      `;
      card.appendChild(info);

      // Availability toggle
      const toggle = document.createElement('label');
      toggle.classList.add('switch');
      toggle.innerHTML = `
        <input type="checkbox" ${item.available ? 'checked' : ''} data-id="${item.id}">
        <span class="slider"></span>
      `;
      card.appendChild(toggle);

      // Edit/Delete
      const editDelete = document.createElement('div');
      editDelete.classList.add('edit-delete');
      editDelete.innerHTML = `
        <button class="edit-btn" data-id="${item.id}">Edit</button>
        <button class="delete-btn" data-id="${item.id}">Delete</button>
      `;
      card.appendChild(editDelete);

      container.appendChild(card);
    });

    foodItemsContainer.appendChild(container);
  });
};

// Apply search filter
const applySearchFilter = () => {
  const queryStr = searchInput.value.toLowerCase();
  const filtered = allFoodItems.filter(item =>
    item.name.toLowerCase().includes(queryStr) ||
    item.restaurantName.toLowerCase().includes(queryStr) ||
    item.category.toLowerCase().includes(queryStr)
  );
  displayFoodItems(filtered);
};

// Save search state
searchInput.addEventListener('input', () => {
  localStorage.setItem('adminMenuSearch', searchInput.value);
  applySearchFilter();
});

// Add/Update food item
menuForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const restaurantName = restaurantSelect.value || restaurantNameInput.value;
  const itemName = itemNameInput.value;
  const itemCategory = itemCategorySelect.value;
  const itemPrice = parseFloat(itemPriceInput.value);

  try {
    if (editingItemId) {
      await updateDoc(doc(db, 'foodItems', editingItemId), {
        restaurantName,
        name: itemName,
        category: itemCategory,
        price: itemPrice
      });
    } else {
      await addDoc(collection(db, 'foodItems'), {
        restaurantName,
        name: itemName,
        category: itemCategory,
        price: itemPrice,
        available: true
      });
    }
    menuForm.reset();
    addFormSection.classList.add('hidden');
    editingItemId = null;
  } catch (err) {
    console.error('Error saving food item:', err);
  }
});

// Edit/Delete actions
foodItemsContainer.addEventListener('click', async (e) => {
  if (e.target.classList.contains('edit-btn')) {
    const id = e.target.dataset.id;
    const foodDoc = await getDoc(doc(db, 'foodItems', id));
    if (foodDoc.exists()) {
      const data = foodDoc.data();
      restaurantSelect.value = data.restaurantName;
      itemNameInput.value = data.name;
      itemCategorySelect.value = data.category;
      itemPriceInput.value = data.price;
      addFormSection.classList.remove('hidden');
      editingItemId = id;
    }
  }
  if (e.target.classList.contains('delete-btn')) {
    const id = e.target.dataset.id;
    if (confirm('Delete this food item?')) {
      await deleteDoc(doc(db, 'foodItems', id));
    }
  }
});

// Availability toggle — updates for both admin & merchant
foodItemsContainer.addEventListener('change', async (e) => {
  if (e.target.type === 'checkbox' && e.target.dataset.id) {
    const id = e.target.dataset.id;
    const available = e.target.checked;
    await updateDoc(doc(db, 'foodItems', id), { available });
  }
});

// Init
listenToRestaurantsAndItems();