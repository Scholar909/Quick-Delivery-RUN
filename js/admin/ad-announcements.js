import { db } from '../firebase.js';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js';

document.addEventListener("DOMContentLoaded", () => {
  const tabButtons = document.querySelectorAll(".tab");
  const sections = document.querySelectorAll(".announcement-section");
  const forms = document.querySelectorAll(".announce-form");

  function switchTab(target) {
  tabButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === target);
  });
  sections.forEach(sec => {
    sec.classList.toggle("active", sec.id === target);
  });
}

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

  // Toggle form visibility and handle submission
  document.querySelectorAll('.announcement-section').forEach(section => {
    const addBtn = section.querySelector('.add-btn');
    const form = section.querySelector('.announce-form');
    const input = form.querySelector('input');
    const textarea = form.querySelector('textarea');
    const role = section.id;
    const cardsContainer = section.querySelector('.cards-container');

    addBtn.addEventListener('click', () => {
      form.classList.toggle('hidden');
      input.focus();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = input.value.trim();
      const body = textarea.value.trim();

      if (!title || !body) return alert("Please fill in all fields");

      await addDoc(collection(db, 'announcements'), {
        title,
        body,
        role,
        createdAt: serverTimestamp()
      });

      input.value = '';
      textarea.value = '';
      form.classList.add('hidden');
      fetchAnnouncements(role, cardsContainer);
    });

    // Initial load
    fetchAnnouncements(role, cardsContainer);
  });

async function fetchAnnouncements(role, container) {
  container.innerHTML = 'Loading...';

  const q = query(
    collection(db, 'announcements'),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  container.innerHTML = '';

  let count = 0;

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (data.role !== role) return;

    count++;

    const card = document.createElement('div');
    card.className = 'announcement-card glassy';
    card.innerHTML = `
      <h4>${data.title}</h4>
      <p>${data.body}</p>
      <small>${data.createdAt?.toDate?.().toDateString?.() || 'Unknown date'}</small>
      <div class="card-actions">
        <button class="edit-btn">Edit</button>
        <button class="danger delete-btn">Delete</button>
      </div>
    `;

    // Delete
    card.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm('Delete this announcement?')) {
        await deleteDoc(doc(db, 'announcements', docSnap.id));
        fetchAnnouncements(role, container);
      }
    });

    // Edit
    card.querySelector('.edit-btn').addEventListener('click', async () => {
      const newTitle = prompt("Edit Title", data.title);
      const newBody = prompt("Edit Body", data.body);

      if (newTitle && newBody) {
        await updateDoc(doc(db, 'announcements', docSnap.id), {
          title: newTitle,
          body: newBody
        });
        fetchAnnouncements(role, container);
      }
    });

    container.appendChild(card);
  });

  if (container.innerHTML === '') {
    container.innerHTML = '<p>No announcements yet.</p>';
  }

  // ===== Limit enforcement (for customers only) =====
  const section = document.getElementById(role); // the role section
  const addBtn = section.querySelector('.add-btn');
  const form = section.querySelector('.announce-form');

  if (role === 'customers') {
    if (count >= 4) {
      addBtn.disabled = true;
      addBtn.innerText = "Limit Reached (4)";
      form.classList.add('hidden');
    } else {
      addBtn.disabled = false;
      addBtn.innerText = "Add";
    }
  }
}
});