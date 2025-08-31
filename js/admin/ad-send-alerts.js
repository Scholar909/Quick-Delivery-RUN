import { db } from "../firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const msgTypeSelect = document.getElementById("msg-type");
  const recipientRadios = document.querySelectorAll("input[name='recipient']");
  const specificUserInput = document.getElementById("specific-user");
  const titleInput = document.querySelector("input[placeholder='Message Title']");
  const contentTextarea = document.querySelector("textarea");
  const sendBtn = document.querySelector(".send-btn");

  let selectedRecipient = "All Users"; // default

  // Show/hide specific user input
  recipientRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      selectedRecipient = radio.parentElement.textContent.trim();
      specificUserInput.classList.toggle("hidden", selectedRecipient !== "Specific User");
    });
  });

  // Send alert/message
  sendBtn.addEventListener("click", async () => {
    const type = msgTypeSelect.value;
    const title = titleInput.value.trim();
    const content = contentTextarea.value.trim();
    const recipientID = specificUserInput.value.trim();

    if (!title || !content) {
      alert("Please enter both a title and message.");
      return;
    }

    const baseData = {
      title,
      content,
      type,
      timestamp: serverTimestamp(),
      senderRole: "admin"
    };

    try {
      if (selectedRecipient === "All Users") {
        // Send to all users
        await addDoc(collection(db, "alerts"), {
          ...baseData,
          target: "all"
        });

      } else if (selectedRecipient === "Merchants") {
        await addDoc(collection(db, "alerts"), {
          ...baseData,
          target: "merchants"
        });

      } else if (selectedRecipient === "Customers") {
        await addDoc(collection(db, "alerts"), {
          ...baseData,
          target: "customers"
        });

      } else if (selectedRecipient === "Specific User") {
        if (!recipientID) {
          alert("Please enter a user ID or email.");
          return;
        }

        // Find user doc ID by email searching customers and merchants collections
        const userDocId = await findUserDocIdByEmail(recipientID);

        if (!userDocId) {
          alert("User with that email not found.");
          return;
        }

        await addDoc(collection(db, "alerts"), {
          ...baseData,
          target: "specific",
          userId: userDocId
        });
      }

      alert("Message sent successfully.");
      titleInput.value = "";
      contentTextarea.value = "";
      specificUserInput.value = "";
      msgTypeSelect.selectedIndex = 0;
      recipientRadios[0].checked = true;
      specificUserInput.classList.add("hidden");
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Try again.");
    }
  });

  const userId = sessionStorage.getItem('alertUserId');
  const userEmail = sessionStorage.getItem('alertUserEmail');
  const userRole = sessionStorage.getItem('alertUserRole');
  const userName = sessionStorage.getItem('alertUserName');

  if (userId) {
    // Select specific user radio button
    const specificUserRadio = document.querySelector("input[name='recipient'][value='Specific User']");
    if (specificUserRadio) {
      specificUserRadio.checked = true;
      document.getElementById('specific-user').classList.remove('hidden');
    }
    // Put email or userId in input
    document.getElementById('specific-user').value = userEmail || userId || '';

    // Optional: prefill title with username greeting
    if (titleInput && userName) {
      titleInput.value = `Hello ${userName}, `;
    }

    // Clear session storage keys so next time doesn't auto-fill
    sessionStorage.removeItem('alertUserId');
    sessionStorage.removeItem('alertUserEmail');
    sessionStorage.removeItem('alertUserRole');
    sessionStorage.removeItem('alertUserName');
  }
});

// Helper: find user document ID by email in customers or merchants
async function findUserDocIdByEmail(email) {
  // Search customers
  const customersRef = collection(db, "customers");
  let q = query(customersRef, where("email", "==", email));
  let snapshot = await getDocs(q);
  if (!snapshot.empty) return snapshot.docs[0].id;

  // Search merchants
  const merchantsRef = collection(db, "merchants");
  q = query(merchantsRef, where("email", "==", email));
  snapshot = await getDocs(q);
  if (!snapshot.empty) return snapshot.docs[0].id;

  // Not found
  return null;
}