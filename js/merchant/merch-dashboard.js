// File: merch-dashboard.js
import { db, auth } from '../firebase.js';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

document.addEventListener("DOMContentLoaded", () => {
  const completedCountEl = document.getElementById("completed-count");
  const announcementCard = document.getElementById("announcement-card");
  const announceTime = document.getElementById("announce-time");
  const shiftTimeEl = document.getElementById("shift-time");
  const statusMsgEl = document.getElementById("status-msg");
  const welcomeMsgEl = document.getElementById("welcome-msg");

  let allShiftsForToday = [];

  /* ------------------------------
     HELPERS
  ------------------------------ */
  function formatTo12Hour(time) {
    let [hour, minute] = time.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${minute.toString().padStart(2, "0")}${ampm.toLowerCase()}`;
  }

  function createTooltip(message) {
    const existing = document.getElementById("completed-tooltip");
    if (existing) existing.remove();

    const tip = document.createElement("div");
    tip.id = "completed-tooltip";
    tip.textContent = message;
    Object.assign(tip.style, {
      position: "fixed",
      bottom: "80px",
      right: "20px",
      background: "#0f4e75",
      color: "#fff",
      padding: "8px 12px",
      borderRadius: "8px",
      fontSize: "14px",
      zIndex: 9999
    });
    document.body.appendChild(tip);

    setTimeout(() => tip.remove(), 4000);
  }

  /* ------------------------------
     COMPLETED ORDERS LOADER
  ------------------------------ */
  async function loadCompletedOrders(merchantId) {
    try {
      // Count all delivered orders assigned to this merchant
      const qDelivered = query(
        collection(db, "orders"),
        where("assignedMerchantId", "==", merchantId),
        where("orderStatus", "==", "delivered")
      );
      const snap = await getDocs(qDelivered);
      const count = snap.size;

      completedCountEl.innerHTML = `
        <span style="color:limegreen;font-weight:bold;">${count}</span>
      `;

      completedCountEl.style.cursor = "pointer";
      completedCountEl.onclick = () =>
        createTooltip("Green = Total orders delivered");
    } catch (err) {
      console.error("Error loading completed orders:", err);
      completedCountEl.textContent = "—";
    }
  }

  /* ------------------------------
     MERCHANT ANNOUNCEMENT
  ------------------------------ */
  async function loadMerchantAnnouncement() {
    try {
      const q = query(
        collection(db, "announcements"),
        where("role", "==", "merchants"),
        orderBy("createdAt", "desc"),
        limit(1)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        announcementCard.innerHTML = `<p>No announcement yet.</p>`;
        return;
      }

      const docSnap = snapshot.docs[0];
      const data = docSnap.data();

      announcementCard.innerHTML = `
        <h3>${data.title}</h3>
        <p>${data.body}</p>
      `;

      if (data.createdAt) {
        const date = data.createdAt.toDate();
        announceTime.textContent = `Posted on ${date.toDateString()} at ${date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`;
      }
    } catch (error) {
      console.error("Failed to load merchant announcement:", error);
      announcementCard.innerHTML = `<p>Error loading announcement.</p>`;
    }
  }

  /* ------------------------------
     SHIFT LOADER
  ------------------------------ */
  async function loadTodayShift(merchantId) {
    try {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
      const dayDocRef = doc(db, "calendars", merchantId, "days", dateStr);
      const daySnap = await getDoc(dayDocRef);

      if (!daySnap.exists()) {
        shiftTimeEl.textContent = "No shift today";
        statusMsgEl.textContent = "No Shift Today";
        return;
      }

      const data = daySnap.data();
      if (!data.shifts || data.shifts.length === 0) {
        shiftTimeEl.textContent = "No shift today";
        statusMsgEl.textContent = "No Shift Today";
        return;
      }

      allShiftsForToday = data.shifts;
      const nowMinutes = today.getHours() * 60 + today.getMinutes();
      let displayedShift = null;
      let status = "Shift Pending";

      for (const shift of data.shifts) {
        const [startH, startM] = shift.start.split(":").map(Number);
        const [endH, endM] = shift.end.split(":").map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (nowMinutes >= startMinutes && nowMinutes <= endMinutes) {
          displayedShift = shift;
          status = "Working Now";
          break;
        }
        if (nowMinutes < startMinutes) {
          displayedShift = shift;
          status = "Shift Pending";
          break;
        }
        if (nowMinutes > endMinutes) {
          status = "Shift Completed";
        }
      }

      if (!displayedShift) {
        displayedShift = data.shifts[data.shifts.length - 1];
      }

      let displayText = `${formatTo12Hour(displayedShift.start)} - ${formatTo12Hour(displayedShift.end)}`;
      if (data.shifts.length > 1) {
        displayText += " ...";
      }

      shiftTimeEl.textContent = displayText;
      statusMsgEl.textContent = status;

      if (data.shifts.length > 1) {
        shiftTimeEl.style.cursor = "pointer";
        shiftTimeEl.addEventListener("click", () => {
          const existing = document.getElementById("shift-modal");
          if (existing) existing.remove();

          const modalOverlay = document.createElement("div");
          modalOverlay.id = "shift-modal";
          modalOverlay.style.position = "fixed";
          modalOverlay.style.top = "0";
          modalOverlay.style.left = "0";
          modalOverlay.style.width = "100%";
          modalOverlay.style.height = "100%";
          modalOverlay.style.background = "rgba(0,0,0,0.3)";
          modalOverlay.style.backdropFilter = "blur(6px)";
          modalOverlay.style.display = "flex";
          modalOverlay.style.alignItems = "center";
          modalOverlay.style.justifyContent = "center";
          modalOverlay.style.zIndex = "9999";

          const modalContent = document.createElement("div");
          modalContent.style.background = "black";
          modalContent.style.padding = "20px 30px";
          modalContent.style.borderRadius = "12px";
          modalContent.style.boxShadow = "0 4px 20px rgba(0,0,0,0.15)";
          modalContent.style.minWidth = "280px";
          modalContent.style.position = "relative";

          const closeBtn = document.createElement("span");
          closeBtn.textContent = "×";
          closeBtn.style.position = "absolute";
          closeBtn.style.top = "10px";
          closeBtn.style.right = "15px";
          closeBtn.style.cursor = "pointer";
          closeBtn.style.fontSize = "20px";
          closeBtn.style.fontWeight = "bold";

          const title = document.createElement("h3");
          title.textContent = "Today's Shifts";
          title.style.marginBottom = "10px";

          const list = document.createElement("div");
          list.innerHTML = allShiftsForToday
            .map(s => `<div style="padding:5px 0;">${formatTo12Hour(s.start)} - ${formatTo12Hour(s.end)}</div>`)
            .join("");

          modalContent.appendChild(closeBtn);
          modalContent.appendChild(title);
          modalContent.appendChild(list);
          modalOverlay.appendChild(modalContent);
          document.body.appendChild(modalOverlay);

          closeBtn.addEventListener("click", () => modalOverlay.remove());
          modalOverlay.addEventListener("click", (e) => {
            if (e.target === modalOverlay) modalOverlay.remove();
          });
        });
      } else {
        shiftTimeEl.style.cursor = "default";
      }
    } catch (error) {
      console.error("Error loading shift:", error);
      shiftTimeEl.textContent = "Error loading shift";
      statusMsgEl.textContent = "Error";
    }
  }

  /* ------------------------------
     INIT
  ------------------------------ */
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        // fetch merchant profile
        const docSnap = await getDoc(doc(db, "merchants", user.uid));
        if (docSnap.exists()) {
          const userData = docSnap.data();
          welcomeMsgEl.textContent = `Welcome, ${userData.username || "Merchant"}`;
        } else {
          welcomeMsgEl.textContent = "Welcome, Merchant";
        }
      } catch (err) {
        console.error("Error fetching merchant data:", err);
      }

      loadMerchantAnnouncement();
      loadTodayShift(user.uid);
      loadCompletedOrders(user.uid);
    } else {
      shiftTimeEl.textContent = "Not logged in";
      statusMsgEl.textContent = "";
      completedCountEl.textContent = "0";
    }
  });
});