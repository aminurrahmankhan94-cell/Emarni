
import {
  onUserReady,
  getCurrentUser,
  getChatMessages,
  sendChatMessage
} from "./firebase.js";

const $ = id => document.getElementById(id);

const messagesArea = $("messagesArea");
const messagesList = $("messagesList");
const messageInput = $("messageInput");
const sendBtn = $("sendBtn");
const charCount = $("charCount");
const searchInput = $("searchInput");
const searchBar = $("searchBar");
const emptySearch = $("emptySearch");
const welcomeCard = $("welcomeCard");
const toast = $("toast");

let allMessages = [];
let displayName = localStorage.getItem("emarni-display-name") || "";
let unsubscribeMessages = null;
let toastTimeout = null;
let lastRenderedCount = 0;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function setConnection(status, message) {
  $("connectionText").textContent = message;
  $("headerStatus").textContent = message;

  const indicator = $("connectionIndicator");
  indicator.classList.toggle("connected", status === "connected");
  indicator.classList.toggle("offline", status === "offline");
}

function updateProfile() {
  const name = displayName || "Your profile";
  $("profileName").textContent = name;
  $("profileAvatar").textContent = name.charAt(0).toUpperCase();
}

function openNameDialog() {
  $("nameInput").value = displayName;
  $("nameDialog").showModal();
}

function saveName(name) {
  const cleanName = name.trim().slice(0, 30);

  if (cleanName.length < 2) {
    showToast("Name must have at least 2 characters.");
    return false;
  }

  displayName = cleanName;
  localStorage.setItem("emarni-display-name", displayName);
  updateProfile();
  showToast(`Hello, ${displayName}! ✨`);
  return true;
}

function formatTime(timestamp) {
  if (!timestamp) return "just now";

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(Number(timestamp)));
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createMessage(message) {
  const user = getCurrentUser();
  const mine = Boolean(user && message.uid === user.uid);

  const row = makeElement(
    "article",
    `message-row${mine ? " mine" : ""}`
  );

  const avatar = makeElement(
    "div",
    "message-avatar",
    (message.senderName || "?").charAt(0).toUpperCase()
  );
  avatar.setAttribute("aria-hidden", "true");

  const content = makeElement("div", "message-content");
  const meta = makeElement("div", "message-meta");

  meta.append(
    makeElement("strong", "", mine ? "You" : (message.senderName || "Guest")),
    makeElement("span", "message-time", formatTime(message.createdAt))
  );

  const bubble = makeElement("div", "message-bubble", message.text || "");
  content.append(meta, bubble);
  row.append(avatar, content);

  return row;
}

function renderMessages() {
  const query = searchInput.value.trim().toLowerCase();

  const filtered = allMessages.filter(message => {
    if (!query) return true;

    return (
      String(message.text || "").toLowerCase().includes(query) ||
      String(message.senderName || "").toLowerCase().includes(query)
    );
  });

  messagesList.replaceChildren();

  const fragment = document.createDocumentFragment();

  filtered.forEach(message => {
    fragment.appendChild(createMessage(message));
  });

  messagesList.appendChild(fragment);
  emptySearch.classList.toggle(
    "hidden",
    !(query && filtered.length === 0)
  );

  $("sidebarPreview").textContent = allMessages.length
    ? String(allMessages[allMessages.length - 1].text || "Say hello").slice(0, 30)
    : "Say hello to everyone";

  if (filtered.length !== lastRenderedCount || !query) {
    messagesArea.scrollTop = messagesArea.scrollHeight;
  }

  lastRenderedCount = filtered.length;
}

function updateCharCount() {
  charCount.textContent = `${messageInput.value.length}/1000`;

  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 120)}px`;
}

async function handleSend() {
  const text = messageInput.value.trim();

  if (!text) return;

  if (!displayName) {
    openNameDialog();
    showToast("Choose a display name before sending.");
    return;
  }

  if (!getCurrentUser()) {
    showToast("Connecting to Emarni. Please wait…");
    return;
  }

  sendBtn.disabled = true;

  try {
    await sendChatMessage({
      text,
      senderName: displayName
    });

    messageInput.value = "";
    updateCharCount();
    messageInput.focus();
  } catch (error) {
    console.error(error);
    showToast("Message not sent. Check your connection and Firebase rules.");
  } finally {
    sendBtn.disabled = false;
  }
}

function connectChat() {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  setConnection("connecting", "Connecting…");

  unsubscribeMessages = getChatMessages(
    messages => {
      allMessages = messages;
      setConnection("connected", "Connected");
      welcomeCard.classList.toggle("hidden", messages.length > 0);
      renderMessages();
    },
    error => {
      setConnection("offline", "Connection issue");
      console.error(error);
      showToast("Can't load messages. Check your Firebase setup.");
    }
  );
}

// Send message
sendBtn.addEventListener("click", handleSend);

messageInput.addEventListener("input", updateCharCount);

messageInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    handleSend();
  }
});

// Name controls
$("editNameBtn").addEventListener("click", openNameDialog);

$("nameForm").addEventListener("submit", event => {
  event.preventDefault();

  if (saveName($("nameInput").value)) {
    $("nameDialog").close();
  }
});

$("nameDialog").addEventListener("close", () => {
  if (!displayName) {
    showToast("You can choose your name whenever you're ready.");
  }
});

// Welcome button
$("sayHelloBtn").addEventListener("click", () => {
  if (!displayName) {
    openNameDialog();
    return;
  }

  messageInput.value = "Hello everyone! ✨";
  updateCharCount();
  messageInput.focus();
});

// Search
$("searchToggle").addEventListener("click", () => {
  searchBar.classList.toggle("hidden");

  if (!searchBar.classList.contains("hidden")) {
    searchInput.focus();
  } else {
    searchInput.value = "";
    renderMessages();
  }
});

$("closeSearch").addEventListener("click", () => {
  searchBar.classList.add("hidden");
  searchInput.value = "";
  renderMessages();
});

searchInput.addEventListener("input", renderMessages);

// About dialog
$("aboutBtn").addEventListener("click", () => {
  $("aboutDialog").showModal();
});

// Insert a heart
$("emojiBtn").addEventListener("click", () => {
  const start = messageInput.selectionStart;
  const end = messageInput.selectionEnd;
  const value = messageInput.value;

  messageInput.value = value.slice(0, start) + " 💜 " + value.slice(end);
  messageInput.focus();
  messageInput.setSelectionRange(start + 4, start + 4);
  updateCharCount();
});

// Mobile sidebar
$("menuBtn").addEventListener("click", () => {
  $("sidebar").classList.toggle("open");
});

$("globalChatBtn").addEventListener("click", () => {
  $("sidebar").classList.remove("open");
});

document.addEventListener("click", event => {
  const sidebar = $("sidebar");
  const menu = $("menuBtn");

  if (
    window.innerWidth <= 640 &&
    sidebar.classList.contains("open") &&
    !sidebar.contains(event.target) &&
    !menu.contains(event.target)
  ) {
    sidebar.classList.remove("open");
  }
});

// Firebase authentication and chat
updateProfile();

onUserReady((user, ready, error) => {
  if (error) {
    setConnection("offline", "Sign-in failed");
    console.error("Firebase sign-in failed:", error);
    showToast("Sign-in failed. Enable Anonymous Authentication in Firebase.");
    return;
  }

  if (!ready || !user) {
    setConnection("connecting", "Signing in…");
    return;
  }

  connectChat();
});

// Ask for a name when the app opens for the first time.
if (!displayName) {
  setTimeout(() => {
    if (!$("nameDialog").open) openNameDialog();
  }, 450);
}
