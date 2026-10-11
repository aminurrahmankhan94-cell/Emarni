import { db, ref, set, get, push, onValue, update, remove } from "./firebase.js";

// DOM Elements
const loadingScreen = document.getElementById("loadingScreen");
const authDialog = document.getElementById("authDialog");
const appShell = document.getElementById("appShell");
const authForm = document.getElementById("authForm");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const registerExtra = document.getElementById("registerExtra");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authUserId = document.getElementById("authUserId");
const authPassword = document.getElementById("authPassword");
const authDisplayName = document.getElementById("authDisplayName");

const profileCardBtn = document.getElementById("profileCardBtn");
const profileAvatar = document.getElementById("profileAvatar");
const profileNameDisplay = document.getElementById("profileNameDisplay");
const profileIdDisplay = document.getElementById("profileIdDisplay");
const profileDialog = document.getElementById("profileDialog");
const profilePicInput = document.getElementById("profilePicInput");
const profileNameInput = document.getElementById("profileNameInput");
const saveProfile = document.getElementById("saveProfile");
const cancelProfile = document.getElementById("cancelProfile");

const adminPanelBtn = document.getElementById("adminPanelBtn");
const adminDialog = document.getElementById("adminDialog");
const adminLoginView = document.getElementById("adminLoginView");
const adminDashboardView = document.getElementById("adminDashboardView");
const adminIdInput = document.getElementById("adminIdInput");
const adminPassInput = document.getElementById("adminPassInput");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const closeAdminModal = document.getElementById("closeAdminModal");
const adminContentArea = document.getElementById("adminContentArea");

const navItems = document.querySelectorAll(".nav-item");
const currentChatTitle = document.getElementById("currentChatTitle");
const currentChatSub = document.getElementById("currentChatSub");
const messagesList = document.getElementById("messagesList");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");

let isLoginMode = true;
let currentUser = null;
let currentRoom = "globalLounge";

// Hide loading screen after 1.5 seconds
setTimeout(() => {
  loadingScreen.style.opacity = "0";
  setTimeout(() => loadingScreen.style.display = "none", 500);
}, 1500);

// Auth Tab Switching
tabLogin.addEventListener("click", () => {
  isLoginMode = true;
  tabLogin.classList.add("active");
  tabRegister.classList.remove("active");
  registerExtra.classList.add("hidden");
  authSubmitBtn.textContent = "Login";
});

tabRegister.addEventListener("click", () => {
  isLoginMode = false;
  tabRegister.classList.add("active");
  tabLogin.classList.remove("active");
  registerExtra.classList.remove("hidden");
  authSubmitBtn.textContent = "Register";
});

// Authentication Handler
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const uid = authUserId.value.trim();
  const pass = authPassword.value.trim();

  if (!uid || !pass) return alert("Please enter User ID and Password");

  const userRef = ref(db, `users/${uid}`);
  const snapshot = await get(userRef);

  if (isLoginMode) {
    if (!snapshot.exists()) {
      alert("User ID does not exist. Please register first.");
      return;
    }
    const userData = snapshot.val();
    if (userData.password !== pass) {
      alert("Incorrect password!");
      return;
    }
    currentUser = { uid, ...userData };
    loginSuccess();
  } else {
    if (snapshot.exists()) {
      alert("User ID already taken. Choose another.");
      return;
    }
    const name = authDisplayName.value.trim() || uid;
    const newUser = {
      password: pass,
      displayName: name,
      profilePic: ""
    };
    await set(userRef, newUser);
    currentUser = { uid, ...newUser };
    loginSuccess();
  }
});

function loginSuccess() {
  authDialog.close();
  appShell.classList.remove("hidden");
  updateProfileUI();
  loadMessages();
}

function updateProfileUI() {
  profileNameDisplay.textContent = currentUser.displayName;
  profileIdDisplay.textContent = `ID: ${currentUser.uid}`;
  if (currentUser.profilePic) {
    profileAvatar.innerHTML = `<img src="${currentUser.profilePic}" alt="Profile" />`;
  } else {
    profileAvatar.textContent = currentUser.displayName.charAt(0).toUpperCase();
  }
}

// Profile Modal Controls
profileCardBtn.addEventListener("click", () => {
  profileNameInput.value = currentUser.displayName;
  profilePicInput.value = currentUser.profilePic || "";
  profileDialog.showModal();
});

cancelProfile.addEventListener("click", () => profileDialog.close());

saveProfile.addEventListener("click", async () => {
  const newName = profileNameInput.value.trim() || currentUser.uid;
  const newPic = profilePicInput.value.trim();

  await update(ref(db, `users/${currentUser.uid}`), {
    displayName: newName,
    profilePic: newPic
  });

  currentUser.displayName = newName;
  currentUser.profilePic = newPic;
  updateProfileUI();
  profileDialog.close();
});

// Navigation & Rooms
navItems.forEach(item => {
  item.addEventListener("click", () => {
    navItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    currentRoom = item.getAttribute("data-target");
    
    if (currentRoom === "globalLounge") {
      currentChatTitle.textContent = "Global Lounge";
      currentChatSub.textContent = "Talk to anyone when you feel down";
    } else if (currentRoom === "privateChat") {
      currentChatTitle.textContent = "Private Chat";
      currentChatSub.textContent = "Direct messaging with friends (requires accepted friend request)";
    } else if (currentRoom === "groupChat") {
      currentChatTitle.textContent = "Group Chat";
      currentChatSub.textContent = "Community group discussions";
    } else if (currentRoom === "businessChat") {
      currentChatTitle.textContent = "Business Chat";
      currentChatSub.textContent = "Advanced professional workspace with extra options";
    } else if (currentRoom === "friendRequests") {
      currentChatTitle.textContent = "Friend Requests";
      currentChatSub.textContent = "Manage connections and send requests";
    }

    sidebar.classList.remove("open");
    loadMessages();
  });
});

menuToggle.addEventListener("click", () => sidebar.classList.toggle("open"));

// Messaging system & Admin retention logic
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  const msgRef = push(ref(db, `chats/${currentRoom}/messages`));
  await set(msgRef, {
    senderId: currentUser.uid,
    senderName: currentUser.displayName,
    text: text,
    timestamp: Date.now(),
    deleted: false
  });

  messageInput.value = "";
}

function loadMessages() {
  if (currentRoom === "friendRequests") {
    renderFriendRequestsView();
    return;
  }

  const messagesRef = ref(db, `chats/${currentRoom}/messages`);
  onValue(messagesRef, (snapshot) => {
    messagesList.innerHTML = "";
    if (!snapshot.exists()) return;

    snapshot.forEach((childSnap) => {
      const msgId = childSnap.key;
      const msg = childSnap.val();

      // If deleted by user, regular users cannot see it
      if (msg.deleted) return;

      const bubble = document.createElement("div");
      const isMine = msg.senderId === currentUser.uid;
      bubble.className = `message-bubble ${isMine ? "mine" : ""}`;

      const meta = document.createElement("div");
      meta.className = "message-meta";
      meta.innerHTML = `<span>${msg.senderName}</span>`;

      if (isMine) {
        const delBtn = document.createElement("button");
        delBtn.className = "delete-msg-btn";
        delBtn.textContent = "Delete";
        delBtn.onclick = async () => {
          // Mark as deleted for user, but preserved for admin up to 30 days
          await update(ref(db, `chats/${currentRoom}/messages/${msgId}`), {
            deleted: true,
            deletedAt: Date.now()
          });
        };
        meta.appendChild(delBtn);
      }

      const content = document.createElement("div");
      content.textContent = msg.text;

      bubble.appendChild(meta);
      bubble.appendChild(content);
      messagesList.appendChild(bubble);
    });
    messagesList.scrollTop = messagesList.scrollHeight;
  });
}

function renderFriendRequestsView() {
  messagesList.innerHTML = `
    <div style="padding: 20px;">
      <h3>Send Friend Request</h3>
      <input type="text" id="targetFriendId" placeholder="Enter User ID to add" style="margin-bottom:10px;" />
      <button class="primary-btn" id="sendReqBtn">Send Request</button>
      <div id="requestsList" style="margin-top:20px;"></div>
    </div>
  `;

  document.getElementById("sendReqBtn").onclick = async () => {
    const tid = document.getElementById("targetFriendId").value.trim();
    if (!tid) return;
    await set(ref(db, `requests/${tid}/${currentUser.uid}`), {
      senderName: currentUser.displayName,
      status: "pending"
    });
    alert("Friend request sent!");
  };

  // Load incoming requests
  onValue(ref(db, `requests/${currentUser.uid}`), (snapshot) => {
    const list = document.getElementById("requestsList");
    list.innerHTML = "<h4>Incoming Requests</h4>";
    if (!snapshot.exists()) {
      list.innerHTML += "<p>No pending requests.</p>";
      return;
    }
    snapshot.forEach(child => {
      const fromUid = child.key;
      const data = child.val();
      if (data.status === "pending") {
        const div = document.createElement("div");
        div.style.margin = "10px 0";
        div.innerHTML = `<span>${data.senderName} (${fromUid}) wants to connect.</span> 
          <button class="primary-btn" id="accept_${fromUid}">Accept</button>`;
        list.appendChild(div);

        setTimeout(() => {
          const btn = document.getElementById(`accept_${fromUid}`);
          if (btn) {
            btn.onclick = async () => {
              await update(ref(db, `requests/${currentUser.uid}/${fromUid}`), { status: "accepted" });
              await set(ref(db, `friends/${currentUser.uid}/${fromUid}`), true);
              await set(ref(db, `friends/${fromUid}/${currentUser.uid}`), true);
              alert("Friend request accepted!");
            };
          }
        }, 100);
      }
    });
  });
}

// Admin Panel Logic
adminPanelBtn.addEventListener("click", () => {
  adminLoginView.classList.remove("hidden");
  adminDashboardView.classList.add("hidden");
  adminIdInput.value = "";
  adminPassInput.value = "";
  adminDialog.showModal();
});

closeAdminModal.addEventListener("click", () => adminDialog.close());

adminLoginBtn.addEventListener("click", () => {
  const aid = adminIdInput.value.trim();
  const apass = adminPassInput.value.trim();

  // Admin credentials configuration
  if (aid === "admin" && apass === "raflidoadmin123") {
    adminLoginView.classList.add("hidden");
    adminDashboardView.classList.remove("hidden");
    loadAdminChatsData();
  } else {
    alert("Invalid Admin ID or Password!");
  }
});

async function loadAdminChatsData() {
  adminContentArea.innerHTML = "<h3>All Chats (Including Deleted Messages within 30 Days)</h3>";
  const rooms = ["globalLounge", "privateChat", "groupChat", "businessChat"];
  
  for (const room of rooms) {
    const snap = await get(ref(db, `chats/${room}/messages`));
    if (snap.exists()) {
      const section = document.createElement("div");
      section.style.margin = "15px 0";
      section.innerHTML = `<h4>Room: ${room}</h4>`;
      
      snap.forEach(msgSnap => {
        const msg = msgSnap.val();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;
        const isExpired = msg.deletedAt && (Date.now() - msg.deletedAt > thirtyDays);

        if (!isExpired) {
          const item = document.createElement("div");
          item.style.padding = "6px";
          item.style.borderBottom = "1px solid #2f3542";
          item.style.fontSize = "12px";
          item.innerHTML = `<b>${msg.senderName} (${msg.senderId})</b>: ${msg.text} ${msg.deleted ? '<span style="color:#ff6b6b">[Deleted by User]</span>' : ''}`;
          section.appendChild(item);
        }
      });
      adminContentArea.appendChild(section);
    }
  }
}

// Admin Tab Navigation
document.querySelectorAll("[data-admin-tab]").forEach(btn => {
  btn.addEventListener("click", async (e) => {
    document.querySelectorAll("[data-admin-tab]").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
    const tab = e.target.getAttribute("data-admin-tab");

    if (tab === "chats") {
      loadAdminChatsData();
    } else if (tab === "users") {
      adminContentArea.innerHTML = "<h3>User Management & Passwords</h3>";
      const usersSnap = await get(ref(db, "users"));
      if (usersSnap.exists()) {
        usersSnap.forEach(uSnap => {
          const uid = uSnap.key;
          const uData = uSnap.val();
          const uDiv = document.createElement("div");
          uDiv.style.margin = "10px 0";
          uDiv.style.padding = "10px";
          uDiv.style.background = "#0f111a";
          uDiv.style.borderRadius = "8px";
          uDiv.innerHTML = `
            <p><b>ID:</b> ${uid} | <b>Name:</b> ${uData.displayName} | <b>Password:</b> ${uData.password}</p>
            <button class="primary-btn" id="ban_${uid}">Ban User</button>
            <div style="margin-top:8px;">
              <input type="text" id="sorryMsg_${uid}" placeholder="Type sorry message as user..." style="width:60%;display:inline-block;" />
              <button class="secondary-btn" id="sendSorry_${uid}">Send Sorry</button>
            </div>
          `;
          adminContentArea.appendChild(uDiv);

          setTimeout(() => {
            const banBtn = document.getElementById(`ban_${uid}`);
            if (banBtn) {
              banBtn.onclick = async () => {
                await remove(ref(db, `users/${uid}`));
                alert(`User ${uid} banned successfully.`);
                loadAdminChatsData();
              };
            }

            const sorryBtn = document.getElementById(`sendSorry_${uid}`);
            if (sorryBtn) {
              sorryBtn.onclick = async () => {
                const sorryText = document.getElementById(`sorryMsg_${uid}`).value.trim();
                if (!sorryText) return;
                // Admin sends message using user's ID
                const msgRef = push(ref(db, `chats/globalLounge/messages`));
                await set(msgRef, {
                  senderId: uid,
                  senderName: uData.displayName,
                  text: sorryText,
                  timestamp: Date.now(),
                  deleted: false
                });
                alert(`Message sent as ${uid} successfully.`);
              };
            }
          }, 100);
        });
      }
    } else if (tab === "actions") {
      adminContentArea.innerHTML = `
        <h3>Admin Actions</h3>
        <p>You have full moderator control over the Emarni platform designed by Raflido Studios.</p>
      `;
    }
  });
});
