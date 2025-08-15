import {
  db,
  collection,
  addDoc,
  query,
  onSnapshot,
  where,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
} from "../firebase.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";

const auth = getAuth();

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserId = user.uid;
    currentUserName = user.displayName || user.email; // fallback to email
    currentUserRole = "merchant"; // this page is for merchants

    // After user is loaded, initialize merchant complaints query
    initMerchantComplaints();
  } else {
    console.log("No merchant logged in");
    // Redirect to login page if desired
    window.location.href = "../merch-auth.html";
  }
});

// Mock current logged-in merchant info (replace with actual auth data)
let currentUserId = "";
let currentUserName = "";
let currentUserRole = "";

const drawerToggle = document.getElementById("drawer-toggle");
const drawer = document.getElementById("drawer-aside");
const complaintsList = document.getElementById("complaints-list");

// ===== NEW: Two count badges =====
const unreadCountBadge = document.getElementById("notification-count"); // red, above
const totalCountBadge = document.getElementById("total-count"); // green, below

const complaintForm = document.getElementById("complaint-form");

let drawerOpen = false;

// Toggle drawer open/close
drawerToggle.addEventListener("click", () => {
  drawerOpen = !drawerOpen;
  drawer.classList.toggle("open", drawerOpen);

  // When drawer is opened, mark all admin replies as read
  if (drawerOpen) {
    markRepliesAsRead();
  }

  renderBadgeCounts();
});

// Format Firestore timestamp to readable string
function formatDate(timestamp) {
  if (!timestamp) return "";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return (
    date.toLocaleDateString() +
    " " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
}

// State arrays
let sentComplaints = [];

// Render complaint cards inside drawer
function renderComplaints() {
  complaintsList.innerHTML = "";

  if (sentComplaints.length === 0) {
    complaintsList.innerHTML =
      `<p style="text-align:center;opacity:0.6;">No complaints found.</p>`;
    renderBadgeCounts();
    return;
  }

  sentComplaints.forEach((complaint) => {
    const card = document.createElement("div");
    card.classList.add("complaint-card");

    // Show green dot if admin has replied
    if (complaint.replied) {
      const dot = document.createElement("div");
      dot.classList.add("replied-dot");
      card.appendChild(dot);
    }

    const header = document.createElement("div");
    header.classList.add("complaint-header");

    const usernameRole = document.createElement("div");
    usernameRole.classList.add("username-role");
    usernameRole.textContent = `${complaint.senderName} (${complaint.senderRole})`;

    const title = document.createElement("div");
    title.classList.add("message-title");
    title.textContent = complaint.title;

    const date = document.createElement("div");
    date.classList.add("message-date");
    date.textContent = formatDate(complaint.timestamp);

    header.appendChild(usernameRole);
    header.appendChild(title);
    header.appendChild(date);
    card.appendChild(header);

    // Full title (bold) before message
    const fullTitle = document.createElement("div");
    fullTitle.classList.add("full-title");
    fullTitle.style.display = "none";
    fullTitle.style.fontWeight = "bold";
    fullTitle.style.margin = "6px 0";
    fullTitle.textContent = complaint.title;
    card.appendChild(fullTitle);

    // Message content
    const msgContent = document.createElement("div");
    msgContent.classList.add("message-content");
    msgContent.textContent = complaint.body;
    msgContent.style.display = "none";
    card.appendChild(msgContent);

    // Reply thread container
    const replyThread = document.createElement("div");
    replyThread.classList.add("reply-thread");
    replyThread.style.display = "none";
    card.appendChild(replyThread);

    // Click header to toggle message + load replies
    header.addEventListener("click", () => {
      const isVisible = msgContent.style.display === "block";
      if (isVisible) {
        msgContent.style.display = "none";
        fullTitle.style.display = "none";
        replyThread.style.display = "none";
        replyThread.innerHTML = "";
      } else {
        msgContent.style.display = "block";
        fullTitle.style.display = "block";
        replyThread.style.display = "flex";
        replyThread.style.flexDirection = "column";
        loadReplies(complaint.id, replyThread);
      }
    });

    complaintsList.appendChild(card);
  });

  renderBadgeCounts();
}

// Load replies from subcollection
function loadReplies(complaintId, container) {
  const repliesCol = collection(db, "complaints", complaintId, "replies");
  const rq = query(repliesCol, orderBy("timestamp", "asc"));

  onSnapshot(rq, (snapshot) => {
    container.innerHTML = "";
    snapshot.forEach((replyDoc) => {
      const reply = replyDoc.data();

      const replyCard = document.createElement("div");
      replyCard.classList.add("complaint-card");
      replyCard.style.background = "rgba(46, 204, 113, 0.15)";
      replyCard.style.marginTop = "6px";

      const replyHeader = document.createElement("div");
      replyHeader.classList.add("complaint-header");

      const replyUser = document.createElement("div");
      replyUser.classList.add("username-role");
      replyUser.textContent = `${reply.senderName} (${reply.senderRole})`;

      const replyTitle = document.createElement("div");
      replyTitle.classList.add("message-title");
      replyTitle.textContent = reply.title;

      const replyDate = document.createElement("div");
      replyDate.classList.add("message-date");
      replyDate.textContent = reply.timestamp?.toDate
        ? reply.timestamp.toDate().toLocaleString()
        : "";

      replyHeader.appendChild(replyUser);
      replyHeader.appendChild(replyTitle);
      replyHeader.appendChild(replyDate);
      replyCard.appendChild(replyHeader);

      // Full title for replies
      const replyFullTitle = document.createElement("div");
      replyFullTitle.classList.add("full-title");
      replyFullTitle.style.display = "none";
      replyFullTitle.style.fontWeight = "bold";
      replyFullTitle.style.margin = "6px 0";
      replyFullTitle.textContent = reply.title;
      replyCard.appendChild(replyFullTitle);

      const replyMsg = document.createElement("div");
      replyMsg.classList.add("message-content");
      replyMsg.textContent = reply.body;
      replyMsg.style.display = "none";
      replyCard.appendChild(replyMsg);

      replyHeader.addEventListener("click", () => {
        const isVisible = replyMsg.style.display === "block";
        replyMsg.style.display = isVisible ? "none" : "block";
        replyFullTitle.style.display = isVisible ? "none" : "block";
      });

      container.appendChild(replyCard);
    });
  });
}

// Firestore query for complaints by merchant
function initMerchantComplaints() {
  const complaintsQuery = query(
    collection(db, "complaints"),
    where("senderId", "==", currentUserId),
    where("senderRole", "==", "merchant"), // only customer complaints
    orderBy("timestamp", "desc")
  );

  onSnapshot(complaintsQuery, (snapshot) => {
    sentComplaints = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        readBySender: data.readBySender || false,
      };
    });
    renderComplaints();
  });
}

// ===== Update badge counts =====
function renderBadgeCounts() {
  const totalCount = sentComplaints.length;
  const unreadCount = sentComplaints.filter(c => c.replied && !c.readBySender).length;

  totalCountBadge.textContent = totalCount; // green, below
  unreadCountBadge.textContent = unreadCount; // red, above
  unreadCountBadge.hidden = false; // always visible
}

// Mark admin replies as read
function markRepliesAsRead() {
  sentComplaints.forEach(async (c) => {
    if (c.replied && !c.readBySender) {
      const complaintRef = doc(db, "complaints", c.id);
      try {
        await updateDoc(complaintRef, { readBySender: true });
      } catch (error) {
        console.error("Error marking reply as read:", error);
      }
    }
  });
}

// Handle sending new complaint
complaintForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const titleInput = document.getElementById("title");
  const bodyInput = document.getElementById("body");

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title || !body) {
    alert("Please fill in both title and message.");
    return;
  }

  try {
    await addDoc(collection(db, "complaints"), {
      senderId: currentUserId,
      senderName: currentUserName,
      senderRole: currentUserRole,
      receiverRole: "admin",
      title,
      body,
      timestamp: serverTimestamp(),
      replied: false,
      readBySender: true // newly sent complaints are already read by sender
    });

    alert("Complaint sent successfully!");
    titleInput.value = "";
    bodyInput.value = "";

    if (!drawerOpen) {
      drawerOpen = true;
      drawer.classList.add("open");
    }
  } catch (error) {
    console.error("Error sending complaint:", error);
    alert("Failed to send complaint. Please try again.");
  }
});