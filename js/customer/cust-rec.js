import { db, auth } from '../firebase.js';
import {
  collection,
  onSnapshot,
  doc,
  setDoc
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchAll");
  const combosList = document.getElementById("combos-list");
  const recommendationsList = document.getElementById("recommendations-list");

  let allCombos = [];
  let allRecommendations = [];
  let currentUser = null;

  // 🔹 Tab Switching
  const tabs = document.querySelectorAll(".tab");
  const sections = document.querySelectorAll(".content-section");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      sections.forEach(s => s.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });

  // 🔹 Render Items
  function renderItems(container, items, type) {
    if (!items.length) {
      container.innerHTML = `<p>No items found</p>`;
      return;
    }
    container.innerHTML = items.map(item => `
      <div class="item-card">
        <h4>${item.foodName}</h4>
        <p>Restaurant: ${item.restaurantName}</p>
        <p>₦${item.price}</p>
        <p>${item.type ? "Type: " + item.type : ""}</p>
        <button class="buy-now" data-id="${item.id}" data-type="${type}">Buy Now</button>
      </div>
    `).join("");
  }

  // 🔹 Load Combos
  function loadCombos() {
    const ref = collection(db, 'combos');
    onSnapshot(ref, (snapshot) => {
      allCombos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(c => c.available !== false);
      applyFilter();
    });
  }

  // 🔹 Load Recommendations
  function loadRecommendations() {
    const ref = collection(db, 'recommendations');
    onSnapshot(ref, (snapshot) => {
      allRecommendations = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.available !== false);
      applyFilter();
    });
  }

  // 🔹 Filter
  function applyFilter() {
    const q = searchInput.value.toLowerCase();
    const filteredCombos = allCombos.filter(c =>
      c.foodName.toLowerCase().includes(q) ||
      c.restaurantName.toLowerCase().includes(q) ||
      (c.type || "").toLowerCase().includes(q)
    );
    const filteredRecommendations = allRecommendations.filter(r =>
      r.foodName.toLowerCase().includes(q) ||
      r.restaurantName.toLowerCase().includes(q)
    );
    renderItems(combosList, filteredCombos, "combo");
    renderItems(recommendationsList, filteredRecommendations, "recommendation");
  }

  searchInput.addEventListener("input", applyFilter);

  // 🔹 Buy Now → Save to Firestore → Redirect
  document.body.addEventListener("click", async (e) => {
    if (e.target.classList.contains("buy-now")) {
      if (!currentUser) {
        alert("Please log in to place an order.");
        return;
      }

      const id = e.target.dataset.id;
      const type = e.target.dataset.type;

      const item = (type === "combo")
        ? allCombos.find(c => c.id === id)
        : allRecommendations.find(r => r.id === id);

      if (!item) return;

      try {
        // save this item into cart (overwrite previous cart)
        await setDoc(doc(db, "carts", currentUser.uid, "items", id), {
          name: item.foodName,
          price: item.price,
          qty: 1,
          restaurantId: item.restaurantId || "",
          restaurantName: item.restaurantName || "",
          category: item.category || "Uncategorized",
          fromType: type,
          createdAt: Date.now()
        });

        // clear any previous Buy Now memory
        localStorage.removeItem("fromLocation");
        localStorage.removeItem("toLocation");
        
        try {
          // 🔹 Fetch customer's room & hostel before redirect
          const custSnap = await getDoc(doc(db, "customers", currentUser.uid));
        
          if (custSnap.exists()) {
            const custData = custSnap.data();
            const hostelName = custData.hostel || "Unknown Hostel";
            const roomNo = custData.roomNumber || "—";
        
            // Save real hostel + room to localStorage
            localStorage.setItem("fromLocation", item.restaurantName);
            localStorage.setItem("toLocation", `${hostelName} Room ${roomNo}`);
          } else {
            // fallback if no customer data found
            localStorage.setItem("fromLocation", item.restaurantName);
            localStorage.setItem("toLocation", "My Room");
          }
        } catch (err) {
          console.error("Error fetching customer profile:", err);
          localStorage.setItem("fromLocation", item.restaurantName);
          localStorage.setItem("toLocation", "My Room");
        }
        
        // 🔹 Redirect after saving data
        window.location.href = "menu-place-order.html";
      } catch (err) {
        console.error("Error saving Buy Now item:", err);
        alert("Failed to start checkout. Please try again.");
      }
    }
  });

  // 🔹 Auth State
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
  });

  // Init
  loadCombos();
  loadRecommendations();
});