// merch-menu.js
import { db } from '../firebase.js';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  query,
  orderBy
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

// DOM elements
const foodItemsContainer = document.getElementById('food-items');
const searchInput = document.getElementById('searchAll');

let allFoodItems = [];

// Fetch and listen to food items in real-time
const listenToFoodItems = () => {
  const foodRef = collection(db, 'foodItems');
  const q = query(foodRef, orderBy('restaurantName'));

  onSnapshot(q, (snapshot) => {
    allFoodItems = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    displayFoodItems(allFoodItems);
  });
};

// Group items by restaurant
const groupItemsByRestaurant = (foodItems) => {
  return foodItems.reduce((acc, item) => {
    if (!acc[item.restaurantName]) {
      acc[item.restaurantName] = [];
    }
    acc[item.restaurantName].push(item);
    return acc;
  }, {});
};

// Display food items
const displayFoodItems = (foodItems) => {
  foodItemsContainer.innerHTML = '';
  const grouped = groupItemsByRestaurant(foodItems);

  Object.keys(grouped)
    .sort()
    .forEach((restaurantName) => {
      const restaurantCard = document.createElement('div');
      restaurantCard.classList.add('menu-card-container');

      const heading = document.createElement('h3');
      heading.textContent = restaurantName;
      restaurantCard.appendChild(heading);

      grouped[restaurantName].forEach((item) => {
        const itemCard = document.createElement('div');
        itemCard.classList.add('menu-card');

        const info = document.createElement('div');
        info.classList.add('menu-info');
        info.innerHTML = `
          <h3>${item.name}</h3>
          <p>Category: ${item.category}</p>
          <p>Price: ${item.price}</p>
        `;
        itemCard.appendChild(info);

        // Availability toggle
        const availabilityToggle = document.createElement('label');
        availabilityToggle.classList.add('switch');
        availabilityToggle.innerHTML = `
          <input type="checkbox" ${item.available ? 'checked' : ''} data-id="${item.id}">
          <span class="slider"></span>
        `;
        itemCard.appendChild(availabilityToggle);

        restaurantCard.appendChild(itemCard);
      });

      foodItemsContainer.appendChild(restaurantCard);
    });
};

// Handle availability toggle
foodItemsContainer.addEventListener('change', async (e) => {
  if (e.target.type === 'checkbox' && e.target.dataset.id) {
    const foodItemId = e.target.dataset.id;
    const availability = e.target.checked;
    try {
      await updateDoc(doc(db, 'foodItems', foodItemId), { available: availability });
      console.log(`Availability for ${foodItemId} updated to ${availability}`);
    } catch (error) {
      console.error('Error updating availability:', error);
    }
  }
});

// Search filter
searchInput.addEventListener('input', () => {
  const queryStr = searchInput.value.toLowerCase();
  const filtered = allFoodItems.filter(item =>
    item.name.toLowerCase().includes(queryStr) ||
    item.restaurantName.toLowerCase().includes(queryStr) ||
    item.category.toLowerCase().includes(queryStr)
  );
  displayFoodItems(filtered);
});

// Init
listenToFoodItems();