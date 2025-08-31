import {
  db,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
} from "../firebase.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

const auth = getAuth();

onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in
    currentAdminId = user.uid;
    currentAdminUsername = user.displayName || user.email; // use displayName if set, fallback to email

    // Now you can safely load complaints
    initAdminComplaints();
  } else {
    // No user signed in
    console.log("No admin is logged in");
    // Optionally redirect to login page
    window.location.href = "../admin-login.html";
  }
});

const drawerToggle = document.getElementById("drawer-toggle");
const drawer = document.getElementById("drawer-aside");
const complaintsList = document.getElementById("complaints-list");

// Badges
const notificationCount = document.getElementById("notification-count"); // unread (red)
const totalCount = document.getElementById("total-count"); // total (green)

const replyForm = document.getElementById("reply-form");
const recipientIdInput = document.getElementById("recipientId");
const originalMessageIdInput = document.getElementById("originalMessageId");
const replyTitleInput = document.getElementById("replyTitle");
const replyBodyInput = document.getElementById("replyBody");

let currentAdminId = "";
let currentAdminUsername = "";

let drawerOpen = false;
let complaints = [];

// --- Drawer toggle handler ---
drawerToggle.addEventListener("click", () => {
  drawerOpen = !drawerOpen;
  drawer.classList.toggle("open", drawerOpen);
  renderBadges();
});

// --- Listen for complaints collection changes ---
function initAdminComplaints() {
  const complaintsCol = collection(db, "complaints");

  const q = query(
    complaintsCol,
    where("receiverRole", "==", "admin"),
    orderBy("timestamp", "desc")
  );

  onSnapshot(q, (snapshot) => {
    complaints = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        senderId: data.senderId,
        senderName: data.senderName,
        senderRole: data.senderRole,
        title: data.title,
        body: data.body,
        timestamp: data.timestamp?.toDate(),
        replied: data.replied || false,
      };
    });
    renderComplaints();
    renderBadges();
  });
}

// ===== Badge update =====
function renderBadges() {
  const unread = complaints.filter((c) => !c.replied).length;
  const total = complaints.length;

  totalCount.textContent = total;
  notificationCount.textContent = unread;

  // Red dot is always visible, even if zero
  notificationCount.hidden = false;
}

// ===== Render complaints =====
function renderComplaints() {
  complaintsList.innerHTML = "";
  if (complaints.length === 0) {
    complaintsList.innerHTML = `<p style="text-align:center;opacity:0.6;">No complaints found.</p>`;
    return;
  }
  complaints.forEach((complaint) => {
    complaintsList.appendChild(createComplaintCard(complaint));
  });
}

function createComplaintCard(complaint) {
  const card = document.createElement("div");
  card.classList.add("complaint-card");

  const header = document.createElement("div");
  header.className = "complaint-header";

  const userRoleSpan = document.createElement("span");
  userRoleSpan.className = "username-role";
  userRoleSpan.textContent = `${complaint.senderName} (${complaint.senderRole})`;

  const titleSpan = document.createElement("span");
  titleSpan.className = "message-title";
  titleSpan.textContent = complaint.title;

  const dateSpan = document.createElement("span");
  dateSpan.className = "message-date";
  dateSpan.textContent = complaint.timestamp
    ? complaint.timestamp.toLocaleString()
    : "";

  header.appendChild(userRoleSpan);
  header.appendChild(titleSpan);
  header.appendChild(dateSpan);

  card.appendChild(header);

  if (complaint.replied) {
    const dot = document.createElement("div");
    dot.className = "replied-dot";
    card.appendChild(dot);
  }

  const replyBtn = document.createElement("button");
  replyBtn.className = "reply-btn";
  replyBtn.textContent = "Reply";
  replyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openReplyForm(complaint);
  });
  card.appendChild(replyBtn);

  // Full title area when expanded
  const fullTitle = document.createElement("div");
  fullTitle.className = "full-title";
  fullTitle.style.display = "none";
  fullTitle.style.fontWeight = "bold";
  fullTitle.style.margin = "6px 0";
  fullTitle.textContent = complaint.title;
  card.appendChild(fullTitle);

  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  messageContent.style.display = "none";
  messageContent.textContent = complaint.body;
  card.appendChild(messageContent);

  const replyThread = document.createElement("div");
  replyThread.className = "reply-thread";
  replyThread.style.display = "none";
  card.appendChild(replyThread);

  header.addEventListener("click", () => {
    const isVisible = messageContent.style.display === "block";
    messageContent.style.display = isVisible ? "none" : "block";
    fullTitle.style.display = isVisible ? "none" : "block";
    replyThread.style.display = isVisible ? "none" : "flex";
    if (!isVisible) {
      loadReplies(complaint.id, replyThread);
    } else {
      replyThread.innerHTML = "";
    }
  });

  return card;
}

function loadReplies(complaintId, container) {
  const repliesCol = collection(db, "complaints", complaintId, "replies");
  const rq = query(repliesCol, orderBy("timestamp", "asc"));

  onSnapshot(rq, (snapshot) => {
    container.innerHTML = "";
    snapshot.forEach((replyDoc) => {
      const reply = replyDoc.data();
      const replyCard = document.createElement("div");
      replyCard.className = "complaint-card";
      replyCard.style.background = "rgba(46, 204, 113, 0.15)";
      replyCard.style.marginTop = "6px";

      const replyHeader = document.createElement("div");
      replyHeader.className = "complaint-header";

      const replierSpan = document.createElement("span");
      replierSpan.className = "username-role";
      replierSpan.textContent = `${reply.senderName} (${reply.senderRole})`;

      const replyTitleSpan = document.createElement("span");
      replyTitleSpan.className = "message-title";
      replyTitleSpan.textContent = reply.title;

      const replyDateSpan = document.createElement("span");
      replyDateSpan.className = "message-date";
      replyDateSpan.textContent = reply.timestamp?.toDate
        ? reply.timestamp.toDate().toLocaleString()
        : "";

      replyHeader.appendChild(replierSpan);
      replyHeader.appendChild(replyTitleSpan);
      replyHeader.appendChild(replyDateSpan);

      replyCard.appendChild(replyHeader);

      // Full title for replies
      const replyFullTitle = document.createElement("div");
      replyFullTitle.className = "full-title";
      replyFullTitle.style.display = "none";
      replyFullTitle.style.fontWeight = "bold";
      replyFullTitle.style.margin = "6px 0";
      replyFullTitle.textContent = reply.title;
      replyCard.appendChild(replyFullTitle);

      const replyMessageContent = document.createElement("div");
      replyMessageContent.className = "message-content";
      replyMessageContent.style.display = "none";
      replyMessageContent.textContent = reply.body;
      replyCard.appendChild(replyMessageContent);

      replyHeader.addEventListener("click", () => {
        const isVisible = replyMessageContent.style.display === "block";
        replyMessageContent.style.display = isVisible ? "none" : "block";
        replyFullTitle.style.display = isVisible ? "none" : "block";
      });

      container.appendChild(replyCard);
    });
  });
}

function openReplyForm(complaint) {
  recipientIdInput.value = complaint.senderId;
  originalMessageIdInput.value = complaint.id;
  replyTitleInput.value = `Re: ${complaint.title}`; // auto-fill title
  replyBodyInput.value = "";
  drawer.classList.remove("open");
  drawerOpen = false;
  replyForm.scrollIntoView({ behavior: "smooth" });
  replyTitleInput.focus();
}

replyForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const recipientId = recipientIdInput.value.trim();
  const originalMsgId = originalMessageIdInput.value.trim();
  const title = replyTitleInput.value.trim();
  const body = replyBodyInput.value.trim();

  if (!recipientId || !originalMsgId || !title || !body) {
    alert("Please fill all reply fields.");
    return;
  }

  try {
    await addDoc(collection(db, "complaints", originalMsgId, "replies"), {
      senderId: currentAdminId,
      senderName: currentAdminUsername,
      senderRole: "admin",
      title,
      body,
      timestamp: serverTimestamp(),
    });

    await updateDoc(doc(db, "complaints", originalMsgId), {
      replied: true,
    });

    alert("Reply sent!");
    replyTitleInput.value = "";
    replyBodyInput.value = "";
    recipientIdInput.value = "";
    originalMessageIdInput.value = "";

    renderBadges(); // refresh counts after reply
  } catch (error) {
    console.error("Error sending reply:", error);
    alert("Failed to send reply. Try again.");
  }
});