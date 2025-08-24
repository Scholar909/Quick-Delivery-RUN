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
  orderBy,
  setDoc
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

// DOM Elements
const addBtn = document.getElementById('add-btn');
const addFormSection = document.getElementById('addFormSection');
const menuForm = document.getElementById('menuForm');
const searchInput = document.getElementById('searchAll');
const foodItemsContainer = document.getElementById('food-items');
const restaurantSelect = document.getElementById('restaurantSelect');
const restaurantNameInput = document.getElementById('restaurantName');
const restaurantSubaccountInput = document.getElementById('restaurantSubaccountId');
const itemNameInput = document.getElementById('itemName');
const itemCategorySelect = document.getElementById('itemCategory');
const itemPriceInput = document.getElementById('itemPrice');

let editingItemId = null;
let allFoodItems = [];
let restaurantsLoaded = false;
let latestRestaurantNames = [];
let namesFromRestaurants = [];
let namesFromFood = [];

// 🔹 Toggle restaurantNameInput visibility based on dropdown
restaurantSelect.addEventListener('change', () => {
  if (restaurantSelect.value) {
    restaurantNameInput.style.display = 'none';   // hide input
    restaurantNameInput.value = '';               // clear value to avoid conflicts
  } else {
    restaurantNameInput.style.display = 'block';  // show input if no dropdown selected
  }
});

// 🔹 Toggle restaurantNameInput visibility + auto-fill subaccount when dropdown changes
restaurantSelect.addEventListener('change', async () => {
  if (restaurantSelect.value) {
    // hide manual restaurant name input
    restaurantNameInput.style.display = 'none';
    restaurantNameInput.value = '';

    try {
      // fetch restaurant doc by name
      const restaurantRef = doc(db, 'restaurants', restaurantSelect.value);
      const snap = await getDoc(restaurantRef);
      if (snap.exists()) {
        restaurantSubaccountInput.value = snap.data().subaccount_id || '';
        restaurantSubaccountInput.readOnly = true; // lock field
      } else {
        restaurantSubaccountInput.value = '';
        restaurantSubaccountInput.readOnly = false; // allow typing for new
      }
    } catch (err) {
      console.error("Error fetching restaurant subaccount:", err);
      restaurantSubaccountInput.value = '';
      restaurantSubaccountInput.readOnly = false;
    }

  } else {
    // no dropdown selected → show input to allow new restaurant
    restaurantNameInput.style.display = 'block';
    restaurantSubaccountInput.value = '';
    restaurantSubaccountInput.readOnly = false; // allow admin to type new subaccount id
  }
});

// 🔹 Load saved state from localStorage
const savedSearch = localStorage.getItem('adminMenuSearch') || '';
searchInput.value = savedSearch;

// Toggle Add Food Form
addBtn.addEventListener('click', () => {
  addFormSection.classList.toggle('hidden');
  if (!addFormSection.classList.contains('hidden')) {
    menuForm.reset();
    editingItemId = null;
    
    restaurantSelect.value = "";
    restaurantNameInput.style.display = 'block';
  }
});

// 🔹 Helper to update dropdowns
const updateRestaurantDropdown = () => {
  const names = [...namesFromRestaurants, ...namesFromFood];
  latestRestaurantNames = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));

  const prev = restaurantSelect.value;

  restaurantSelect.innerHTML = `<option value="">-- Select Restaurant --</option>`;
  latestRestaurantNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    restaurantSelect.appendChild(option);
  });

  if (prev && latestRestaurantNames.includes(prev)) {
    restaurantSelect.value = prev;
  }

  restaurantsLoaded = true;
};

// 🔹 Real-time listeners
const listenToRestaurantsAndItems = () => {
  // Restaurants listener
  const restaurantRef = collection(db, 'restaurants');
  onSnapshot(restaurantRef, (snapshot) => {
    namesFromRestaurants = snapshot.docs
      .map(d => (d.data()?.name ?? '').toString().trim())
      .filter(n => n.length > 0);
    updateRestaurantDropdown();
  });

  // Food items listener (names + menu)
  const foodRef = collection(db, 'foodItems');
  const q = query(foodRef, orderBy('restaurantName'));
  onSnapshot(q, (snapshot) => {
    allFoodItems = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    namesFromFood = allFoodItems
      .map(d => (d.restaurantName ?? '').toString().trim())
      .filter(n => n.length > 0);

    updateRestaurantDropdown();
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

  const restaurantName = restaurantSelect.value || restaurantNameInput.value.trim();
  const subaccountId = restaurantSubaccountInput.value.trim();
  const itemName = itemNameInput.value.trim();
  const itemCategory = itemCategorySelect.value;
  const itemPrice = parseFloat(itemPriceInput.value);

  if (!restaurantName) {
    alert('Please choose a restaurant (or type a new one).');
    return;
  }

  try {
    if (editingItemId) {
      const restaurantRef = doc(db, 'restaurants', restaurantName);

      await updateDoc(doc(db, 'foodItems', editingItemId), {
        restaurantId: restaurantRef.id,
        restaurantName,
        name: itemName,
        category: itemCategory,
        price: itemPrice
      });
    } else {
      // 🔹 Restaurant reference (doc id will be restaurantId)
      const restaurantRef = doc(db, 'restaurants', restaurantName);  
      
      await addDoc(collection(db, 'foodItems'), {
        restaurantId: restaurantRef.id,   // Save restaurant id
        restaurantName,                   // Keep restaurant name for readability
        name: itemName,
        category: itemCategory,
        price: itemPrice,
        available: true
      });
    }
    
    const restaurantRef = doc(db, 'restaurants', restaurantName);
    await setDoc(restaurantRef, { name: restaurantName, subaccount_id: subaccountId }, { merge: true });
    
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

      if (!restaurantsLoaded && data.restaurantName) {  
        const exists = Array.from(restaurantSelect.options).some(  
          opt => opt.value === data.restaurantName  
        );  
        if (!exists) {  
          const temp = document.createElement('option');  
          temp.value = data.restaurantName;  
          temp.textContent = data.restaurantName;  
          restaurantSelect.appendChild(temp);  
        }  
      }  

      restaurantSelect.value = data.restaurantName || '';  
      itemNameInput.value = data.name || '';  
      itemCategorySelect.value = data.category || '';  
      itemPriceInput.value = data.price ?? '';  

      // 🔹 Fetch and fill restaurant subaccount_id
      const restaurantRef = doc(db, 'restaurants', data.restaurantName);
      const restaurantSnap = await getDoc(restaurantRef);
      if (restaurantSnap.exists()) {
        restaurantSubaccountInput.value = restaurantSnap.data().subaccount_id || '';
      } else {
        restaurantSubaccountInput.value = '';
      }

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

// Availability toggle
foodItemsContainer.addEventListener('change', async (e) => {
  if (e.target.type === 'checkbox' && e.target.dataset.id) {
    const id = e.target.dataset.id;
    const available = e.target.checked;
    await updateDoc(doc(db, 'foodItems', id), { available });
  }
});

// Init
listenToRestaurantsAndItems();