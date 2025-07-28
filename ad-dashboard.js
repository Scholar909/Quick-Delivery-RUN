// ad-dashboard.js
import { db } from "firebase.js";
import { get, ref, remove, update } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-database.js";

// DOM Elements
const totalCustomersElem = document.querySelector("#totalCustomers p");
const totalMerchantsElem = document.querySelector("#totalMerchants p");
const userTableBody = document.getElementById("userTableBody");

// Load and count users
async function loadUserStatsAndTable() {
  const dbRef = ref(db);

  try {
    const snapshot = await get(dbRef);
    if (!snapshot.exists()) return;

    const data = snapshot.val();

    let totalCustomers = 0;
    let totalMerchants = 0;

    userTableBody.innerHTML = ""; // Clear table

    for (const userId in data.users) {
      const user = data.users[userId];
      const status = user.role || "Customer";
      const username = user.username || user.fullname || "No Name";
      const email = user.email || "No Email";
      const blocked = user.blocked === true;

      if (status === "customer") totalCustomers++;
      else if (status === "merchant") totalMerchants++;

      // Create table row
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${username}</td>
        <td>${email}</td>
        <td>${status}</td>
        <td>
          <button class="action-btn message-btn" data-id="${userId}"><i class="uil uil-comment-dots"></i></button>
          <button class="action-btn view-btn" data-id="${userId}"><i class="uil uil-eye"></i></button>
          <button class="action-btn block-btn" data-id="${userId}" data-blocked="${blocked}">
            ${blocked ? `<i class="uil uil-user-check"></i>` : `<i class="uil uil-user-times"></i>`}
          </button>
          <button class="action-btn delete-btn" data-id="${userId}"><i class="uil uil-trash-alt"></i></button>
        </td>
      `;
      userTableBody.appendChild(row);
    }

    totalCustomersElem.textContent = totalCustomers;
    totalMerchantsElem.textContent = totalMerchants;

  } catch (err) {
    console.error("Error loading users:", err);
  }
}

// Event Delegation for Action Buttons
userTableBody.addEventListener("click", async (e) => {
  const target = e.target;
  const userId = target.dataset.id;

  if (target.classList.contains("message-btn")) {
    window.location.href = `../admin/alerts.html?userId=${userId}`;
  }

  else if (target.classList.contains("view-btn")) {
    window.location.href = `../admin/view-profile.html?userId=${userId}`;
  }

  else if (target.classList.contains("block-btn")) {
    const currentlyBlocked = target.dataset.blocked === "true";

    try {
      await update(ref(db, `users/${userId}`), {
        blocked: !currentlyBlocked
      });
      alert(currentlyBlocked ? "User Unblocked" : "User Blocked");
      loadUserStatsAndTable(); // Refresh table
    } catch (error) {
      console.error("Block error:", error);
    }
  }

  else if (target.classList.contains("delete-btn")) {
    const confirmDelete = confirm("Are you sure you want to delete this user?");
    if (!confirmDelete) return;

    try {
      await remove(ref(db, `users/${userId}`));
      alert("User deleted");
      loadUserStatsAndTable(); // Refresh table
    } catch (error) {
      console.error("Delete error:", error);
    }
  }
});

// Init load
loadUserStatsAndTable();
