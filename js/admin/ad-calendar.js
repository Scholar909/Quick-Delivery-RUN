// File: ../js/admin/ad-calendar.js
import { db } from '../firebase.js';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

document.addEventListener("DOMContentLoaded", () => {
  const merchantSelect = document.getElementById("merchant-select");
  const calendarGrid = document.querySelector(".calendar-grid");
  const calendarHeader = document.getElementById("calendar-month-year");
  const prevMonthBtn = document.getElementById("prev-month");
  const nextMonthBtn = document.getElementById("next-month");

  const shiftEditor = document.getElementById("shift-editor");
  const shiftRowsContainer = document.getElementById("shift-rows");
  const selectedDateTitle = document.getElementById("selected-date-title");
  const shiftForm = document.getElementById("shift-form");
  const addShiftBtn = document.getElementById("add-shift");
  const closeBtn = document.getElementById("close-editor");

  let selectedMerchant = "";
  let currentEditingDate = "";

  // Keep track of calendar month and year state
  let currentDate = new Date();
  let currentMonth = currentDate.getMonth();
  let currentYear = currentDate.getFullYear();

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Load merchants from Firestore (show fullname or email)
  async function loadMerchants() {
    try {
      merchantSelect.innerHTML = `<option value="">-- Select --</option>`;
      const merchantsRef = collection(db, "merchants");
      const snapshot = await getDocs(merchantsRef);

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        // Prefer fullname, fallback to email
        const displayName = data.fullname 
  ? `${data.fullname} (${data.email || "no-email"})`
  : data.email || data.username || "Unnamed Merchant";
        const opt = document.createElement("option");
        opt.value = docSnap.id;
        opt.textContent = displayName;
        merchantSelect.appendChild(opt);
      });
    } catch (error) {
      console.error("Error loading merchants:", error);
      alert("Failed to load merchants.");
    }
  }

  // Generate the calendar grid dynamically for current month/year
  function generateCalendarGrid() {
    calendarGrid.innerHTML = "";

    // Days of week headers
    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    daysOfWeek.forEach(day => {
      const div = document.createElement("div");
      div.className = "day-name";
      div.textContent = day;
      calendarGrid.appendChild(div);
    });

    // Get first and last day info
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startingDayIndex = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    // Fill blank slots before first day
    for (let i = 0; i < startingDayIndex; i++) {
      const blankDiv = document.createElement("div");
      blankDiv.className = "day empty";
      calendarGrid.appendChild(blankDiv);
    }

    // Create day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
      const dayDiv = document.createElement("div");
      dayDiv.className = "day";
      dayDiv.dataset.date = dateStr;
      dayDiv.textContent = day;

      // Click event to toggle working/off day and open shift editor
            dayDiv.addEventListener("click", async () => {
        if (!selectedMerchant) {
          alert("Please select a merchant first.");
          return;
        }
      
        currentEditingDate = dateStr;
        selectedDateTitle.textContent = `Shifts for: ${dateStr}`;
        shiftEditor.classList.remove("hidden");
      
        // Load current shifts
        const dayDocRef = doc(db, "calendars", selectedMerchant, "days", dateStr);
        const daySnap = await getDoc(dayDocRef);
      
        const existingShifts = daySnap.exists() ? (daySnap.data().shifts || []) : [];
        renderShiftRows(existingShifts);
      });

      calendarGrid.appendChild(dayDiv);
    }

    calendarHeader.textContent = `${months[currentMonth]} ${currentYear}`;
  }

  // Load calendar status (working/off) for selected merchant on calendar grid
  async function loadMerchantCalendar(merchantId) {
  const dayDivs = calendarGrid.querySelectorAll(".day:not(.empty)");
  for (const dayDiv of dayDivs) {
    const date = dayDiv.dataset.date;
    const dayDocRef = doc(db, "calendars", merchantId, "days", date);
    const daySnap = await getDoc(dayDocRef);

    if (daySnap.exists() && (daySnap.data().shifts || []).length > 0) {
      dayDiv.classList.add("working"); // style this as blue
    } else {
      dayDiv.classList.remove("working");
    }
  }
}

  // Render shift rows inside the editor with start, end, label, and delete button
  function renderShiftRows(shifts = []) {
    shiftRowsContainer.innerHTML = "";

    if (shifts.length === 0) {
      // Always show at least one empty row for adding
      shifts.push({ start: "", end: "", label: "" });
    }

    shifts.forEach(shift => {
      const rowDiv = document.createElement("div");
      rowDiv.className = "shift-row";

      rowDiv.innerHTML = `
        <input type="time" class="start-time" value="${shift.start || ""}" required />
        <input type="time" class="end-time" value="${shift.end || ""}" required />
        <input type="text" class="label" placeholder="Label (optional)" value="${shift.label || ""}" />
        <button type="button" class="delete-shift-btn" title="Delete shift">
          <i class="uil uil-trash-alt"></i>
        </button>
      `;

      // Delete row on trash click
      rowDiv.querySelector(".delete-shift-btn").addEventListener("click", () => {
        rowDiv.remove();
      });

      shiftRowsContainer.appendChild(rowDiv);
    });
  }

  // Get current shift data from editor inputs
  function getShiftDataFromEditor() {
    const rows = shiftRowsContainer.querySelectorAll(".shift-row");
    const shifts = [];

    rows.forEach(row => {
      const start = row.querySelector(".start-time").value;
      const end = row.querySelector(".end-time").value;
      const label = row.querySelector(".label").value.trim();

      if (start && end) {
        shifts.push({ start, end, label });
      }
    });

    return shifts;
  }

  // Event: Save shifts button pressed
  shiftForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!selectedMerchant || !currentEditingDate) {
    alert("Please select a merchant and date first.");
    return;
  }

  const shifts = getShiftDataFromEditor();
  const dayDocRef = doc(db, "calendars", selectedMerchant, "days", currentEditingDate);

  try {
    if (shifts.length > 0) {
      await setDoc(dayDocRef, { status: "working", shifts }, { merge: true });
    } else {
      await setDoc(dayDocRef, { status: "off", shifts: [] }, { merge: true });
    }

        alert("Shifts saved successfully.");
    shiftEditor.classList.add("hidden");
    
    // Immediately update just this day's cell
    const dayCell = calendarGrid.querySelector(`.day[data-date="${currentEditingDate}"]`);
    if (dayCell) {
      if (shifts.length > 0) {
        dayCell.classList.add("working");
      } else {
        dayCell.classList.remove("working");
      }
    }
  } catch (error) {
    console.error("Error saving shifts:", error);
    alert("Failed to save shifts.");
  }
});

  // Add new empty shift row button
  addShiftBtn.addEventListener("click", () => {
    const currentShifts = getShiftDataFromEditor();
    currentShifts.push({ start: "", end: "", label: "" });
    renderShiftRows(currentShifts);
  });

  // Close shift editor button
  closeBtn.addEventListener("click", () => {
    shiftEditor.classList.add("hidden");
  });

  // Merchant selection change event
  merchantSelect.addEventListener("change", async (e) => {
    selectedMerchant = e.target.value;
    if (!selectedMerchant) {
      // Clear calendar if none selected
      generateCalendarGrid();
      return;
    }
    generateCalendarGrid();
    await loadMerchantCalendar(selectedMerchant);
  });

  // Month navigation buttons
  prevMonthBtn.addEventListener("click", async () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    generateCalendarGrid();
    if (selectedMerchant) await loadMerchantCalendar(selectedMerchant);
  });

  nextMonthBtn.addEventListener("click", async () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    generateCalendarGrid();
    if (selectedMerchant) await loadMerchantCalendar(selectedMerchant);
  });

  // Initialize on page load
  loadMerchants().then(() => {
    generateCalendarGrid();
  });
});