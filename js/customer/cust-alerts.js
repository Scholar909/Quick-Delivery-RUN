// File: ../js/customer/cust-alerts.js
import { db, auth } from "../firebase.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

// Utility: relative time formatter
function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

document.addEventListener("DOMContentLoaded", () => {
  const alertsSection = document.querySelector(".alerts-section");

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      alertsSection.innerHTML = `<p class="empty-msg">Please log in to view alerts.</p>`;
      return;
    }

    const alertsRef = collection(db, "alerts");
    const q = query(alertsRef, orderBy("timestamp", "desc"));

    onSnapshot(q, (snapshot) => {
      alertsSection.innerHTML = "";

      snapshot.forEach((doc) => {
        const alert = doc.data();

        // Filter for customers
        if (
          alert.target === "all" ||
          alert.target === "customers" ||
          (alert.target === "specific" && alert.userId === user.uid)
        ) {
          // Pick an icon based on type
          let iconClass = "uil-megaphone";
          if (alert.type === "promo") iconClass = "uil-percentage";
          if (alert.type === "message") iconClass = "uil-envelope-heart";

          const card = document.createElement("div");
          card.className = "alert-card";
          card.innerHTML = `
            <i class="uil ${iconClass} icon"></i>
            <div class="content">
              <h4>${alert.title || "No title"}</h4>
              <p>${alert.content || ""}</p>
              <span>${alert.timestamp?.toDate ? timeAgo(alert.timestamp.toDate()) : ""}</span>
            </div>
          `;
          alertsSection.appendChild(card);
        }
      });

      if (!alertsSection.innerHTML) {
        alertsSection.innerHTML = `<p class="empty-msg">No alerts yet.</p>`;
      }
    });
  });
});