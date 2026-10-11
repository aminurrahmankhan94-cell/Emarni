
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

// তোমার Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyBbvQfpdM7-WzbYrn2WfygvPS2iRVaEMHY",
  authDomain: "emarni-chat.firebaseapp.com",
  databaseURL: "https://emarni-chat-default-rtdb.firebaseio.com/",
  projectId: "emarni-chat",
  storageBucket: "emarni-chat.firebasestorage.app",
  messagingSenderId: "787575452024",
  appId: "1:787575452024:web:11fc477a865cb8b8b8588d",
  measurementId: "G-DVV3E0FHLV"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let currentUser = null;
let authReady = false;
let authError = null;
const authCallbacks = new Set();

function notifyAuth() {
  authCallbacks.forEach(callback => callback(currentUser, authReady, authError));
}

onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    authReady = true;
    authError = null;
    notifyAuth();
    return;
  }

  try {
    await signInAnonymously(auth);
  } catch (error) {
    authError = error;
    authReady = true;
    notifyAuth();
    console.error("Emarni authentication error:", error);
  }
});

export function onUserReady(callback) {
  authCallbacks.add(callback);

  if (authReady) {
    callback(currentUser, authReady, authError);
  }

  return () => authCallbacks.delete(callback);
}

export function getCurrentUser() {
  return currentUser;
}

export function getChatMessages(callback, onError) {
  const messagesRef = ref(db, "rooms/global/messages");

  return onValue(
    messagesRef,
    snapshot => {
      const data = snapshot.val() || {};
      const messages = Object.entries(data).map(([id, value]) => ({
        id,
        ...value
      }));

      messages.sort((a, b) => {
        const timeA = Number(a.createdAt) || 0;
        const timeB = Number(b.createdAt) || 0;
        return timeA - timeB;
      });

      // UI-তে সর্বশেষ 200টি মেসেজ দেখাবে।
      callback(messages.slice(-200));
    },
    error => {
      console.error("Could not load messages:", error);
      if (onError) onError(error);
    }
  );
}

export async function sendChatMessage({ text, senderName }) {
  if (!currentUser) {
    throw new Error("Authentication is not ready yet.");
  }

  const cleanText = String(text || "").trim();
  const cleanName = String(senderName || "").trim().slice(0, 30);

  if (!cleanText) {
    throw new Error("Please write a message first.");
  }

  if (cleanText.length > 1000) {
    throw new Error("Message is too long.");
  }

  if (cleanName.length < 2) {
    throw new Error("Please choose a name with at least 2 characters.");
  }

  const messagesRef = ref(db, "rooms/global/messages");
  const newMessageRef = push(messagesRef);

  await set(newMessageRef, {
    uid: currentUser.uid,
    senderName: cleanName,
    text: cleanText,
    createdAt: serverTimestamp()
  });

  return newMessageRef.key;
}
