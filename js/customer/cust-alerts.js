import { db, auth } from "../firebase.js";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

// Utility function to format elapsed time
function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

onAuthStateChanged(auth, user => {
  if (!user) {
    console.log("User not logged in. Redirecting to login page...");
    window.location.href = "/customer-login.html"; // Adjust path as needed
    return;
  }

  console.log("User logged in:", user.email, user.uid);

  const userId = user.uid;
  const alertsRef = collection(db, "alerts");

  // Listen for all alerts ordered by timestamp descending
  const q = query(alertsRef, orderBy("timestamp", "desc"));

  onSnapshot(q, snapshot => {
    const alertsSection = document.querySelector(".alerts-section");
    alertsSection.innerHTML = ""; // Clear previous alerts

    if (snapshot.empty) {
      console.log("No alerts found.");
      alertsSection.innerHTML = "<p>No alerts available.</p>";
      return;
    }

    snapshot.forEach(doc => {
      const alert = doc.data();
      const { title, content, target, userId: alertUserId, timestamp, type } = alert;

      console.log(`Alert: target=${target}, alertUserId=${alertUserId}`);

      // Show if alert is for:
      // - everyone ("all")
      // - all customers ("customers")
      // - or specifically for this user (target "specific" and matching userId)
      const showAlert =
        target?.toLowerCase() === "all" ||
        target?.toLowerCase() === "customers" ||
        (target?.toLowerCase() === "specific" && alertUserId === userId);

      if (!showAlert) {
        console.log(`Skipping alert: not for this user`);
        return;
      }

      // Determine icon based on type or content
      let iconClass = "uil-envelope-heart";
      if (type === "announcement") iconClass = "uil-megaphone";
      if (title?.toLowerCase().includes("promo")) iconClass = "uil-percentage";

      const timeLabel = timestamp?.toDate ? timeAgo(timestamp.toDate()) : "Just now";

      const card = document.createElement("div");
      card.className = "alert-card";
      card.innerHTML = `
        <i class="uil ${iconClass} icon"></i>
        <div class="content">
          <h4>${title}</h4>
          <p>${content}</p>
          <span>${timeLabel}</span>
        </div>
      `;
      alertsSection.appendChild(card);
    });
  }, error => {
    console.error("Error loading alerts:", error);
  });
});