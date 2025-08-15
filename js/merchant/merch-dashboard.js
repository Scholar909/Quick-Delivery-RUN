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
  const announcementCard = document.getElementById("announcement-card");
  const announceTime = document.getElementById("announce-time");
  const shiftTimeEl = document.getElementById("shift-time");
  const statusMsgEl = document.getElementById("status-msg");

  let allShiftsForToday = []; // store shifts for modal display

  // ------------------------
  // Helper: Convert 24-hour time to 12-hour format with AM/PM
  // ------------------------
  function formatTo12Hour(time) {
    let [hour, minute] = time.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    return `${hour}:${minute.toString().padStart(2, "0")}${ampm.toLowerCase()}`;
  }

  // ------------------------
  // Create modal dynamically
  // ------------------------
  function createShiftModal() {
    if (document.getElementById("shift-modal")) return; // prevent duplicates

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
    modalContent.style.fontFamily = "sans-serif";

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
  }

  // ------------------------
  // Load Merchant Announcement
  // ------------------------
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
        <h4>${data.title}</h4>
        <p>${data.body}</p>
      `;

      if (data.createdAt) {
        const date = data.createdAt.toDate();
        announceTime.textContent = `Posted on ${date.toDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }

    } catch (error) {
      console.error("Failed to load merchant announcement:", error);
      announcementCard.innerHTML = `<p>Error loading announcement.</p>`;
    }
  }

  // ------------------------
  // Load Today's Shift
  // ------------------------
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

      // Determine which shift to show on stat card
      const nowMinutes = today.getHours() * 60 + today.getMinutes();
      let displayedShift = null;
      let status = "Shift Pending";

      for (const shift of data.shifts) {
        const [startH, startM] = shift.start.split(":").map(Number);
        const [endH, endM] = shift.end.split(":").map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        if (nowMinutes >= startMinutes && nowMinutes <= endMinutes) {
          displayedShift = shift; // current shift
          status = "Working Now";
          break;
        }
        if (nowMinutes < startMinutes) {
          displayedShift = shift; // next upcoming shift
          status = "Shift Pending";
          break;
        }
        if (nowMinutes > endMinutes) {
          status = "Shift Completed";
        }
      }

      if (!displayedShift) {
        // all shifts passed, show last one
        displayedShift = data.shifts[data.shifts.length - 1];
      }

      let displayText = `${formatTo12Hour(displayedShift.start)} - ${formatTo12Hour(displayedShift.end)}`;
      if (data.shifts.length > 1) {
        displayText += " ...";
      }

      shiftTimeEl.textContent = displayText;
      statusMsgEl.textContent = status;

      // Attach click event to open modal if more than one shift
      if (data.shifts.length > 1) {
        shiftTimeEl.style.cursor = "pointer";
        shiftTimeEl.addEventListener("click", createShiftModal);
      } else {
        shiftTimeEl.style.cursor = "default";
      }

    } catch (error) {
      console.error("Error loading shift:", error);
      shiftTimeEl.textContent = "Error loading shift";
      statusMsgEl.textContent = "Error";
    }
  }

  // ------------------------
  // Init
  // ------------------------
  onAuthStateChanged(auth, (user) => {
    if (user) {
      loadMerchantAnnouncement();
      loadTodayShift(user.uid);
    } else {
      shiftTimeEl.textContent = "Not logged in";
      statusMsgEl.textContent = "";
    }
  });
});