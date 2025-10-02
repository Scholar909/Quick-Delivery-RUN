import { db } from '../firebase.js';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

document.addEventListener("DOMContentLoaded", () => {
  // Tabs
  const tabs = document.querySelectorAll(".tab");
  const sections = document.querySelectorAll(".management-section");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      sections.forEach(s => s.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });

  // === Combos ===
  const comboBtn = document.getElementById("add-combo-btn");
  const comboFormSection = document.getElementById("comboFormSection");
  const comboForm = document.getElementById("combo-form");
  const comboRestaurantSelect = document.getElementById("comboRestaurantSelect");
  const comboCards = document.getElementById("combo-cards");
  let editingComboId = null;

    comboBtn.addEventListener("click", () => {
      comboFormSection.classList.toggle("hidden");
      comboBtn.querySelector("i").classList.toggle("uil-plus");
      comboBtn.querySelector("i").classList.toggle("uil-times");
      if (!comboFormSection.classList.contains("hidden")) {
        comboForm.reset();
        editingComboId = null;
      }
  });

  comboForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const restaurantName = comboRestaurantSelect.value;
    const foodName = document.getElementById("comboFood").value.trim();
    const price = Number(document.getElementById("comboPrice").value);
    const type = document.getElementById("comboType").value;

    if (!restaurantName || !foodName || !price || !type) return;

    if (editingComboId) {
      await updateDoc(doc(db, "combos", editingComboId), {
        restaurantName, foodName, price, type
      });
      editingComboId = null;
    } else {
      await addDoc(collection(db, "combos"), {
        restaurantName, foodName, price, type, available: true
      });
    }
    comboForm.reset();
    comboFormSection.classList.add("hidden");
  });

  onSnapshot(collection(db, "combos"), (snap) => {
    comboCards.innerHTML = "";
    snap.forEach(d => {
      const data = d.data();
      const card = document.createElement("div");
      card.className = "item-card";
      card.innerHTML = `
        <h4>${data.foodName}</h4>
        <p>${data.restaurantName} - ₦${data.price} (${data.type})</p>
        <label class="switch">
          <input type="checkbox" ${data.available ? "checked" : ""} data-id="${d.id}">
          <span class="slider"></span>
        </label>
        <div class="card-actions">
          <button class="edit-btn" data-id="${d.id}">Edit</button>
          <button class="delete-btn" data-id="${d.id}">Delete</button>
        </div>
      `;
      comboCards.appendChild(card);
    });
  });

  comboCards.addEventListener("change", async (e) => {
    if (e.target.type === "checkbox") {
      await updateDoc(doc(db, "combos", e.target.dataset.id), {
        available: e.target.checked
      });
    }
  });

  comboCards.addEventListener("click", async (e) => {
    if (e.target.classList.contains("edit-btn")) {
      editingComboId = e.target.dataset.id;
      const snap = await getDoc(doc(db, "combos", editingComboId));
      if (snap.exists()) {
        const d = snap.data();
        comboRestaurantSelect.value = d.restaurantName;
        document.getElementById("comboFood").value = d.foodName;
        document.getElementById("comboPrice").value = d.price;
        document.getElementById("comboType").value = d.type;
        comboFormSection.classList.remove("hidden");
      }
    }
    if (e.target.classList.contains("delete-btn")) {
      if (confirm("Delete this combo?")) {
        await deleteDoc(doc(db, "combos", e.target.dataset.id));
      }
    }
  });

  // === Recommendations ===
  const recBtn = document.getElementById("add-rec-btn");
  const recFormSection = document.getElementById("recFormSection");
  const recForm = document.getElementById("rec-form");
  const recRestaurantSelect = document.getElementById("recRestaurantSelect");
  const recCards = document.getElementById("rec-cards");
  let editingRecId = null;

  recBtn.addEventListener("click", () => {
    recFormSection.classList.toggle("hidden");
    recBtn.querySelector("i").classList.toggle("uil-plus");
    recBtn.querySelector("i").classList.toggle("uil-times");
    if (!recFormSection.classList.contains("hidden")) {
      recForm.reset();
      editingRecId = null;
    }
  });

  recForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const restaurantName = recRestaurantSelect.value;
    const foodName = document.getElementById("recFood").value.trim();
    const price = Number(document.getElementById("recPrice").value);

    if (!restaurantName || !foodName || !price) return;

    if (editingRecId) {
      await updateDoc(doc(db, "recommendations", editingRecId), {
        restaurantName, foodName, price
      });
      editingRecId = null;
    } else {
      await addDoc(collection(db, "recommendations"), {
        restaurantName, foodName, price, available: true
      });
    }
    recForm.reset();
    recFormSection.classList.add("hidden");
  });

  onSnapshot(collection(db, "recommendations"), (snap) => {
    recCards.innerHTML = "";
    snap.forEach(d => {
      const data = d.data();
      const card = document.createElement("div");
      card.className = "item-card";
      card.innerHTML = `
        <h4>${data.foodName}</h4>
        <p>${data.restaurantName} - ₦${data.price}</p>
        <label class="switch">
          <input type="checkbox" ${data.available ? "checked" : ""} data-id="${d.id}">
          <span class="slider"></span>
        </label>
        <div class="card-actions">
          <button class="edit-btn" data-id="${d.id}">Edit</button>
          <button class="delete-btn" data-id="${d.id}">Delete</button>
        </div>
      `;
      recCards.appendChild(card);
    });
  });

  recCards.addEventListener("change", async (e) => {
    if (e.target.type === "checkbox") {
      await updateDoc(doc(db, "recommendations", e.target.dataset.id), {
        available: e.target.checked
      });
    }
  });

  recCards.addEventListener("click", async (e) => {
    if (e.target.classList.contains("edit-btn")) {
      editingRecId = e.target.dataset.id;
      const snap = await getDoc(doc(db, "recommendations", editingRecId));
      if (snap.exists()) {
        const d = snap.data();
        recRestaurantSelect.value = d.restaurantName;
        document.getElementById("recFood").value = d.foodName;
        document.getElementById("recPrice").value = d.price;
        recFormSection.classList.remove("hidden");
      }
    }
    if (e.target.classList.contains("delete-btn")) {
      if (confirm("Delete this recommendation?")) {
        await deleteDoc(doc(db, "recommendations", e.target.dataset.id));
      }
    }
  });

  // === Populate Restaurant Dropdowns ===
  function loadRestaurants() {
    onSnapshot(collection(db, "restaurants"), (snap) => {
      const names = snap.docs.map(d => d.data().name).filter(n => !!n);
      comboRestaurantSelect.innerHTML = `<option value="">-- Select Restaurant --</option>`;
      recRestaurantSelect.innerHTML = `<option value="">-- Select Restaurant --</option>`;
      names.sort().forEach(name => {
        const opt1 = document.createElement("option");
        opt1.value = name;
        opt1.textContent = name;
        comboRestaurantSelect.appendChild(opt1);

        const opt2 = document.createElement("option");
        opt2.value = name;
        opt2.textContent = name;
        recRestaurantSelect.appendChild(opt2);
      });
    });
  }

  loadRestaurants();
});