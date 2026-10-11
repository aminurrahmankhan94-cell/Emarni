
import {
  auth, db, signInAnonymously, onAuthStateChanged,
  ref, set, get, push, onValue, serverTimestamp
} from "./firebase.js";

const $ = id => document.getElementById(id);

let currentUser = null;
let profile = null;
let stopMessages = null;
let toastTimer;

function notify(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3000);
}

function publicId(uid) {
  return "EM" + uid.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
}

function validName(name) {
  return typeof name === "string" &&
    name.trim().length >= 2 && name.trim().length <= 30;
}

function renderAvatar(name, photo) {
  const avatar = $("miniAvatar");
  avatar.replaceChildren();

  if (photo) {
    const img = document.createElement("img");
    img.alt = "Profile";
    img.referrerPolicy = "no-referrer";
    img.src = photo;
    img.onerror = () => {
      avatar.replaceChildren();
      avatar.textContent = (name || "E").slice(0, 1).toUpperCase();
    };
    avatar.append(img);
  } else {
    avatar.textContent = (name || "E").slice(0, 1).toUpperCase();
  }
}

function showView(view) {
  document.querySelectorAll(".view").forEach(el => el.classList.add("hidden"));
  const target = $(view + "View");
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

async function loadProfile(user) {
  const profileRef = ref(db, `users/${user.uid}/profile`);
  const snapshot = await get(profileRef);

  if (!snapshot.exists()) {
    profile = {
      uid: user.uid,
      publicId: publicId(user.uid),
      displayName: "Emarni User",
      bio: "",
      photoURL: ""
    };
    await set(profileRef, profile);
  } else {
    profile = snapshot.val();
  }

  $("headerName").textContent = profile.displayName || "Emarni User";
  $("miniName").textContent = profile.displayName || "Emarni User";
  $("myPublicId").textContent = profile.publicId || publicId(user.uid);
  $("profileName").value = profile.displayName || "";
  $("profileId").value = profile.publicId || publicId(user.uid);
  $("profileBio").value = profile.bio || "";
  $("profilePhoto").value = profile.photoURL || "";
  renderAvatar(profile.displayName, profile.photoURL);
}

function watchGlobalMessages() {
  if (stopMessages) stopMessages();

  const messagesRef = ref(db, "rooms/global/messages");

  stopMessages = onValue(messagesRef, snapshot => {
    const container = $("messages");
    container.replaceChildren();

    if (!snapshot.exists()) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No messages yet. Start the conversation!";
      container.append(empty);
      return;
    }

    const messages = [];
    snapshot.forEach(child => {
      messages.push({ id: child.key, ...child.val() });
    });

    messages.sort((a, b) =>
      (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0)
    );

    messages.slice(-150).forEach(message => {
      const bubble = document.createElement("article");
      bubble.className = "message" +
        (message.uid === currentUser.uid ? " mine" : "");

      const meta = document.createElement("div");
      meta.className = "message-meta";

      const name = document.createElement("span");
      name.textContent = message.senderName || "Emarni User";

      const time = document.createElement("span");
      const timestamp = Number(message.createdAt);
      time.textContent = Number.isFinite(timestamp) && timestamp > 0
        ? new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit", minute: "2-digit"
          })
        : "Just now";

      const text = document.createElement("div");
      text.className = "message-text";
      text.textContent = message.text || "";

      meta.append(name, time);
      bubble.append(meta, text);
      container.append(bubble);
    });

    container.scrollTop = container.scrollHeight;
  }, error => {
    console.error("Global Chat error:", error);
    notify("Messages could not load. Check Firebase Rules.");
  });
}

$("messageForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser || !profile) return;

  const input = $("messageInput");
  const text = input.value.trim();

  if (!text || text.length > 1000) return;

  const button = $("messageForm").querySelector("button");
  button.disabled = true;

  try {
    const messagesRef = ref(db, "rooms/global/messages");
    const newMessage = push(messagesRef);

    await set(newMessage, {
      uid: currentUser.uid,
      senderName: profile.displayName,
      text,
      createdAt: serverTimestamp()
    });

    input.value = "";
  } catch (error) {
    console.error("Send message error:", error);
    notify("Message failed. Check Console and Database Rules.");
  } finally {
    button.disabled = false;
  }
});

$("profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;

  const displayName = $("profileName").value.trim();
  const bio = $("profileBio").value.trim();
  const photoURL = $("profilePhoto").value.trim();

  if (!validName(displayName)) {
    notify("Name must be 2–30 characters.");
    return;
  }

  if (bio.length > 160) {
    notify("Bio must be 160 characters or fewer.");
    return;
  }

  if (photoURL) {
    try {
      const url = new URL(photoURL);
      if (url.protocol !== "https:") throw new Error("HTTPS required");
    } catch {
      notify("Use a valid HTTPS image URL.");
      return;
    }
  }

  const updated = {
    uid: currentUser.uid,
    publicId: publicId(currentUser.uid),
    displayName,
    bio,
    photoURL
  };

  try {
    await set(ref(db, `users/${currentUser.uid}/profile`), updated);
    profile = updated;
    await loadProfile(currentUser);
    notify("Profile saved.");
  } catch (error) {
    console.error("Profile save error:", error);
    notify("Profile save failed. Check Database Rules.");
  }
});

$("friendForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;

  const wantedId = $("friendId").value.trim().toUpperCase();
  if (!wantedId) return;

  try {
    const profilesSnapshot = await get(ref(db, "users"));
    let targetUid = null;

    profilesSnapshot.forEach(userSnapshot => {
      const p = userSnapshot.child("profile").val();
      if (p?.publicId === wantedId) targetUid = userSnapshot.key;
    });

    if (!targetUid) {
      notify("User not found.");
      return;
    }

    if (targetUid === currentUser.uid) {
      notify("You cannot send a request to yourself.");
      return;
    }

    const requestRef = ref(
      db, `friendRequests/${targetUid}/${currentUser.uid}`
    );

    await set(requestRef, {
      fromUid: currentUser.uid,
      fromPublicId: profile.publicId,
      status: "pending",
      createdAt: serverTimestamp()
    });

    $("friendId").value = "";
    notify("Friend request sent.");
  } catch (error) {
    console.error("Friend request error:", error);
    notify("Request failed. Check Firebase Rules.");
  }
});

function watchIncomingRequests() {
  const requestsRef = ref(db, `friendRequests/${currentUser.uid}`);

  onValue(requestsRef, snapshot => {
    const list = $("incomingRequests");
    list.replaceChildren();

    if (!snapshot.exists()) {
      list.textContent = "No incoming requests.";
      return;
    }

    snapshot.forEach(child => {
      const request = child.val();
      if (request.status !== "pending") return;

      const row = document.createElement("div");
      row.className = "request-item";

      const label = document.createElement("span");
      label.textContent = request.fromPublicId || "New request";

      const status = document.createElement("span");
      status.textContent = "Pending";

      row.append(label, status);
      list.append(row);
    });

    if (!list.children.length) list.textContent = "No pending requests.";
  }, error => {
    console.error("Friend requests error:", error);
    $("incomingRequests").textContent = "Cannot load requests.";
  });
}

onAuthStateChanged(auth, async user => {
  if (!user) return;

  currentUser = user;

  try {
    await loadProfile(user);
    watchGlobalMessages();
    watchIncomingRequests();

    $("loadingScreen").classList.add("hidden");
    $("app").classList.remove("hidden");
  } catch (error) {
    console.error("App startup error:", error);
    $("loadingScreen").querySelector("span").textContent =
      "Connection failed. Check Firebase configuration and Rules.";
  }
});

signInAnonymously(auth).catch(error => {
  console.error("Anonymous login error:", error);
  $("loadingScreen").querySelector("span").textContent =
    "Login failed. Check Firebase Authentication settings.";
});
