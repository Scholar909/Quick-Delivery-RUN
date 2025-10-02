import { db, auth } from '../firebase.js';
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  deleteDoc
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

document.addEventListener("DOMContentLoaded", () => {
  const carousel = document.getElementById("announcement-carousel");
  const welcomeMsgEl = document.getElementById("welcome-msg");
  const restaurantsGrid = document.querySelector(".restaurants .grid");

  const comboDisplay = document.getElementById("combo-display");
  const recommendationDisplay = document.getElementById("recommendation-display");

  let combos = [];
  let recommendations = [];
  let comboIndex = 0;
  let recIndex = 0;
  let currentUser = null;

  // 🔹 Load Announcements
  async function loadCustomerAnnouncements() {
    try {
      const q = collection(db, 'announcements');
      onSnapshot(q, (snapshot) => {
        const slides = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          if (data.role === 'customers') {
            slides.push(`
              <div class="slide">
                <h4>${data.title}</h4>
                <p>${data.body}</p>
              </div>
            `);
          }
        });

        if (slides.length === 0) {
          carousel.innerHTML = `<div class="slide">No announcements available</div>`;
        } else {
          carousel.innerHTML = slides.join('');
          startAutoSlide();
        }
      });
    } catch (error) {
      console.error("Failed to load announcements:", error);
      carousel.innerHTML = `<div class="slide">Error loading announcements</div>`;
    }
  }

  function startAutoSlide() {
    const slides = carousel.querySelectorAll('.slide');
    if (!slides.length) return;
    const slideWidth = slides[0].offsetWidth + 16;
    let index = 0;
    setInterval(() => {
      index = (index + 1) % slides.length;
      const scrollLeft = index * slideWidth;
      carousel.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }, 5000);
  }

  // 🔹 Load Restaurants
  function loadRestaurants() {
    const foodRef = collection(db, 'foodItems');
    onSnapshot(foodRef, (snapshot) => {
      const restaurantNames = [
        ...new Set(snapshot.docs.map(doc => doc.data().restaurantName))
      ].sort();

      restaurantsGrid.innerHTML = '';
      restaurantNames.forEach(name => {
        const card = document.createElement('div');
        card.classList.add('restaurant-card');
        card.textContent = name;

        card.addEventListener('click', () => {
          localStorage.setItem('selectedRestaurant', name);
          window.location.href = '../customer/menu-place-order.html';
        });

        restaurantsGrid.appendChild(card);
      });
    });
  }

  // 🔹 Load Combos
  function loadCombos() {
    const ref = collection(db, 'combos');
    onSnapshot(ref, (snapshot) => {
      combos = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .filter(c => c.available !== false);
      if (combos.length) showCombo();
    });
  }

  function showCombo() {
    if (!combos.length) {
      comboDisplay.innerHTML = `<div>No combos available</div>`;
      return;
    }
    const item = combos[comboIndex % combos.length];
    comboDisplay.innerHTML = `
      <div class="item-card">
        <h4>${item.foodName}</h4>
        <p>Restaurant: ${item.restaurantName}</p>
        <p>₦${item.price}</p>
        <button data-type="combo" data-id="${item.id}" class="buy-now">Buy Now</button>
      </div>
    `;
    comboIndex++;
  }

  // 🔹 Load Recommendations
  function loadRecommendations() {
    const ref = collection(db, 'recommendations');
    onSnapshot(ref, (snapshot) => {
      recommendations = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .filter(r => r.available !== false);
      if (recommendations.length) showRecommendation();
    });
  }

  function showRecommendation() {
    if (!recommendations.length) {
      recommendationDisplay.innerHTML = `<div>No recommendations available</div>`;
      return;
    }
    const item = recommendations[recIndex % recommendations.length];
    recommendationDisplay.innerHTML = `
      <div class="item-card">
        <h4>${item.foodName}</h4>
        <p>Restaurant: ${item.restaurantName}</p>
        <p>₦${item.price}</p>
        <button data-type="recommendation" data-id="${item.id}" class="buy-now">Buy Now</button>
      </div>
    `;
    recIndex++;
  }

  // 🔹 Auto-cycle every 5 secs
  setInterval(() => showCombo(), 5000);
  setInterval(() => showRecommendation(), 5000);

  // 🔹 Handle Buy Now → Save to Firestore → Redirect
  document.addEventListener("click", async (e) => {
    if (e.target.classList.contains("buy-now")) {
      if (!currentUser) {
        alert("Please log in to place an order.");
        return;
      }

      const id = e.target.dataset.id;
      const type = e.target.dataset.type;
      const item = (type === "combo")
        ? combos.find(c => c.id === id)
        : recommendations.find(r => r.id === id);

      if (!item) return;

      try {
        // clear old cart first
        const cartItemRef = doc(db, "carts", currentUser.uid, "items", id);
        await setDoc(cartItemRef, {
          name: item.foodName,
          price: item.price,
          qty: 1,
          restaurantId: item.restaurantId || "", // in case combos/recs differ
          restaurantName: item.restaurantName || "",
          category: item.category || "Uncategorized",
          fromType: type,
          createdAt: Date.now()
        });

        // redirect to menu page
        window.location.href = "../customer/menu-place-order.html";

      } catch (err) {
        console.error("Error saving Buy Now item:", err);
        alert("Failed to start checkout. Please try again.");
      }
    }
  });

  // 🔹 Auth Welcome Msg + store user
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      try {
        const docSnap = await getDoc(doc(db, "customers", user.uid));
        if (docSnap.exists()) {
          const userData = docSnap.data();
          const name = userData.username || userData.fullname || userData.email || "Customer";
          welcomeMsgEl.textContent = `Welcome, ${name}`;
        } else {
          welcomeMsgEl.textContent = "Welcome, Customer";
        }
      } catch (err) {
        console.error("Error fetching customer data:", err);
        welcomeMsgEl.textContent = "Welcome, Customer";
      }
    } else {
      welcomeMsgEl.textContent = "Welcome, Guest";
    }
  });

  // Init
  loadCustomerAnnouncements();
  loadRestaurants();
  loadCombos();
  loadRecommendations();
});