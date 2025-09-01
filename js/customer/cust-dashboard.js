import { db, auth } from '../firebase.js';
import {
  collection,
  onSnapshot,
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

document.addEventListener("DOMContentLoaded", () => {
  const carousel = document.getElementById("announcement-carousel");
  const welcomeMsgEl = document.getElementById("welcome-msg");
  const restaurantsGrid = document.querySelector(".restaurants .grid");

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

  // 🔹 Load Restaurants from Firestore
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
  
  // 🔹 Show Welcome Message with Customer Name
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const docSnap = await getDoc(doc(db, "customers", user.uid));
      console.log("Customer UID:", user.uid);

      if (docSnap.exists()) {
        const userData = docSnap.data();
        console.log("Customer data:", userData);

        // Always fallback gracefully
        welcomeMsgEl.textContent = `Welcome, ${userData.username || "Customer"}`;
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

  loadCustomerAnnouncements();
  loadRestaurants();
});
