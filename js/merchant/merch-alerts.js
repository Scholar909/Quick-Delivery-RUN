import { db, auth } from "../firebase.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

// Time formatter
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

onAuthStateChanged(auth, (user) => {
  if (!user) {
    console.log("User not logged in. Redirecting to merchant login...");
    window.location.href = "/merchant-login.html"; // Adjust path as needed
    return;
  }

  console.log("User logged in:", user.email, user.uid);

  const uid = user.uid;
  const alertsRef = collection(db, "alerts");
  const q = query(alertsRef, orderBy("timestamp", "desc"));

  onSnapshot(q, (snapshot) => {
    const container = document.querySelector(".alerts-container");
    container.innerHTML = ""; // Clear previous alerts

    if (snapshot.empty) {
      console.log("No alerts found.");
      container.innerHTML = "<p>No alerts available.</p>";
      return;
    }

    snapshot.forEach((doc) => {
      const data = doc.data();
      const {
        title,
        content,
        target,
        userId: specificUserId,
        timestamp,
        type
      } = data;

      console.log(`Alert: target=${target}, alertUserId=${specificUserId}`);

      const isForMerchant =
        target === "all" ||
        target === "merchants" ||
        (target === "specific" && specificUserId === uid);

      if (!isForMerchant) {
        console.log("Skipping alert: not for this merchant user");
        return;
      }

      const readableTime = timestamp?.toDate ? timeAgo(timestamp.toDate()) : "Just now";

      // Determine icon class based on type or title
      let iconClass = "uil-envelope-heart";
      if (type === "announcement") iconClass = "uil-megaphone";
      if (title?.toLowerCase().includes("promo")) iconClass = "uil-percentage";

      const alertCard = document.createElement("div");
      alertCard.className = "alert-card";
      alertCard.innerHTML = `
        <i class="uil ${iconClass} icon"></i>
        <div class="content">
          <h4>${title}</h4>
          <p>${content}</p>
          <span class="timestamp">${readableTime}</span>
        </div>
      `;
      container.appendChild(alertCard);
    });
  }, error => {
    console.error("Error loading alerts:", error);
  });
});