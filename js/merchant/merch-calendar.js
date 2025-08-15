// File: ../js/merchant/merch-calendar.js
import { db, auth } from '../firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js';

document.addEventListener("DOMContentLoaded", () => {
  const calendarGrid = document.querySelector(".calendar-grid");
  const monthTitle = document.querySelector(".calendar-glass h3");

  // Create modal container & append to body
  const modal = document.createElement('div');
  modal.id = 'shift-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(15, 78, 117, 0.85);
    backdrop-filter: blur(12px);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;
  modal.innerHTML = `
    <div style="
      background: rgba(255 255 255 / 0.1);
      border-radius: 16px;
      padding: 24px;
      width: 320px;
      max-width: 90vw;
      color: white;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      box-shadow: 0 8px 32px rgba(15,78,117,0.6);
      position: relative;
    ">
      <button id="modal-close-btn" style="
        position: absolute;
        top: 12px;
        right: 12px;
        background: transparent;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
      ">&times;</button>
      <h3 id="modal-date-title" style="margin-bottom:16px;"></h3>
      <div id="modal-shift-list" style="max-height: 300px; overflow-y: auto;"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const modalCloseBtn = modal.querySelector('#modal-close-btn');
  const modalDateTitle = modal.querySelector('#modal-date-title');
  const modalShiftList = modal.querySelector('#modal-shift-list');

  modalCloseBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Month names for display
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Keep track of current calendar month/year
  let currentDate = new Date();
  let currentMonth = currentDate.getMonth();
  let currentYear = currentDate.getFullYear();

  let merchantId = null; // logged in merchant's uid

  // Generate calendar grid for the merchant with shift dots
  async function generateCalendar() {
    calendarGrid.innerHTML = "";
    monthTitle.textContent = `${months[currentMonth]} ${currentYear}`;

    // Get first day info and number of days in month
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayIndex = firstDay.getDay();

    // Add blank days before first day to align calendar
    for(let i = 0; i < startingDayIndex; i++) {
      const emptyDiv = document.createElement("div");
      emptyDiv.classList.add("day", "empty");
      calendarGrid.appendChild(emptyDiv);
    }

    // For each day create a div and check if shift exists
    for(let day=1; day <= daysInMonth; day++) {
      const dayDiv = document.createElement("div");
      dayDiv.classList.add("day");
      dayDiv.textContent = day;

      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

      // Check if this date has shifts scheduled for merchant
      if(merchantId) {
        const dayDocRef = doc(db, "calendars", merchantId, "days", dateStr);
        const daySnap = await getDoc(dayDocRef);
        if(daySnap.exists()) {
          const data = daySnap.data();
          if(data.status === "working" && data.shifts && data.shifts.length > 0) {
            dayDiv.classList.add("shift"); // show the dot or highlight

            // Add click event to show modal with shift details
            dayDiv.style.cursor = "pointer";
            dayDiv.addEventListener("click", () => {
              showShiftModal(dateStr, data.shifts);
            });
          }
        }
      }

      calendarGrid.appendChild(dayDiv);
    }
  }

  // Show modal with shifts details for the selected date
  function showShiftModal(dateStr, shifts) {
    modalDateTitle.textContent = `Shifts for ${dateStr}`;
    modalShiftList.innerHTML = "";

    if (!shifts || shifts.length === 0) {
      modalShiftList.innerHTML = `<p>No shifts scheduled for this day.</p>`;
    } else {
      shifts.forEach((shift, i) => {
        const shiftDiv = document.createElement("div");
        shiftDiv.style.marginBottom = "12px";
        shiftDiv.style.padding = "8px 12px";
        shiftDiv.style.background = "rgba(255 255 255 / 0.15)";
        shiftDiv.style.borderRadius = "8px";
        shiftDiv.innerHTML = `
          <strong>Shift ${i+1}</strong><br />
          Time: ${shift.start} - ${shift.end} <br />
          ${shift.label ? `Note: ${shift.label}` : ""}
        `;
        modalShiftList.appendChild(shiftDiv);
      });
    }

    modal.style.display = "flex";
  }

  // Listen for auth state to get current merchant id
  onAuthStateChanged(auth, (user) => {
    if(user) {
      merchantId = user.uid;
      generateCalendar();
    } else {
      merchantId = null;
      calendarGrid.innerHTML = `<p>Please log in to see your shifts.</p>`;
      monthTitle.textContent = "";
    }
  });
});