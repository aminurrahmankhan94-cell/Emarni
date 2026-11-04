// Emarni - Firebase layer: Auth, Realtime Database, Storage and callable Functions.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile as updateAuthProfile
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  push,
  onValue,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
  runTransaction,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-functions.js";
import { friendlyError } from "./ui.js";

// Firebase project configuration. Deploy database.rules.json and storage.rules first.
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
export const db = getDatabase(app);
const storage = getStorage(app);
const functions = getFunctions(app);

export const NOTICE_VERSION = 3;

// Re-exported so feature modules can talk to the database directly.
export {
  ref,
  get,
  set,
  update,
  remove,
  push,
  onValue,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onDisconnect,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  serverTimestamp
};

let currentUser = null;
let authHasResolved = false;
const authCallbacks = new Set();

onAuthStateChanged(auth, async user => {
  if (user?.isAnonymous) {
    // Older versions used anonymous sign-in. This version requires a registered account.
    await signOut(auth).catch(() => {});
    return;
  }
  currentUser = user || null;
  authHasResolved = true;
  for (const callback of authCallbacks) callback(currentUser);
});

export function watchAuth(callback) {
  authCallbacks.add(callback);
  if (authHasResolved) callback(currentUser);
  return () => authCallbacks.delete(callback);
}

export function getCurrentUser() {
  return currentUser;
}

function requireUser(message = "Sign in first.") {
  if (!currentUser) throw new Error(message);
  return currentUser;
}

// Turns a snapshot of children into an array of { id, ...fields }.
const listOf = snap => {
  const out = [];
  snap.forEach(child => {
    out.push({ id: child.key, ...child.val() });
  });
  return out;
};
const byTime = (a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);

// ---------- Accounts ----------
export async function registerAccount({ email, password, displayName }) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("emarni-pending-signup-name", displayName.trim().slice(0, 32));
  }
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateAuthProfile(credential.user, { displayName: displayName.trim().slice(0, 32) });
  await ensureUserProfile(credential.user, displayName);
  return credential.user;
}

export async function signInAccount(login, password) {
  const value = String(login || "").trim();
  let credential;
  if (value.includes("@")) {
    credential = await signInWithEmailAndPassword(auth, value, password);
  } else {
    const signInById = httpsCallable(functions, "signInWithEmarniId");
    const result = await signInById({ emarniId: value.toUpperCase(), password });
    credential = await signInWithCustomToken(auth, result.data.customToken);
  }
  await ensureUserProfile(
    credential.user,
    (typeof localStorage !== "undefined" && localStorage.getItem("emarni-pending-signup-name")) ||
      credential.user.displayName ||
      ""
  );
  if (typeof localStorage !== "undefined") localStorage.removeItem("emarni-pending-signup-name");
  return credential.user;
}

export function signOutAccount() {
  return signOut(auth);
}

function makeEmarniId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "EM";
  for (let i = 0; i < 8; i += 1) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

// Public copy of a profile, readable by every signed-in user (userDirectory).
export function publicOf(p) {
  return {
    uid: p.uid,
    emarniId: p.emarniId,
    displayName: p.displayName,
    bio: p.bio || "",
    status: p.status || "",
    photoURL: p.photoURL || "",
    avatarPos: p.avatarPos || { x: 0, y: 0, z: 1 },
    avatarShape: p.avatarShape || "circle",
    coverURL: p.coverURL || "",
    coverPos: p.coverPos || { x: 0, y: 0, z: 1 },
    accent: p.accent || "#ef4444",
    createdAt: p.createdAt || Date.now()
  };
}

export async function ensureUserProfile(user, preferredName = "") {
  if (!user) throw new Error("Sign in before opening a profile.");
  const profileRef = ref(db, `users/${user.uid}/profile`);
  const pendingName = typeof localStorage !== "undefined" ? localStorage.getItem("emarni-pending-signup-name") : "";
  const initialName = (pendingName || preferredName || user.displayName || user.email?.split("@")[0] || "Emarni user")
    .trim()
    .slice(0, 32);

  const transaction = await runTransaction(
    profileRef,
    current => {
      if (current) return current;
      return {
        uid: user.uid,
        emarniId: makeEmarniId(),
        displayName: initialName.length >= 2 ? initialName : "Emarni user",
        bio: "",
        status: "",
        photoURL: "",
        coverURL: "",
        avatarPos: { x: 0, y: 0, z: 1 },
        coverPos: { x: 0, y: 0, z: 1 },
        avatarShape: "circle",
        accent: "#ef4444",
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    },
    { applyLocally: false }
  );

  if (!transaction.committed || !transaction.snapshot.exists()) {
    throw new Error("Could not initialise your profile.");
  }

  const profile = transaction.snapshot.val();
  const publicRef = ref(db, `userDirectory/${profile.emarniId}`);
  const publicSnapshot = await get(publicRef);
  if (!publicSnapshot.exists() || publicSnapshot.val()?.uid === user.uid) {
    await set(publicRef, publicOf(profile));
  }
  if (user.displayName !== profile.displayName) {
    await updateAuthProfile(user, { displayName: profile.displayName }).catch(() => {});
  }
  if (typeof localStorage !== "undefined") localStorage.removeItem("emarni-pending-signup-name");
  return profile;
}

// Saves changes to the private profile and mirrors the public fields to the directory.
export async function saveProfile(patch) {
  const user = requireUser();
  const profileRef = ref(db, `users/${user.uid}/profile`);
  const current = (await get(profileRef)).val();
  if (!current) throw new Error("Profile not found. Sign out and sign in again.");
  const next = { ...current, ...patch, updatedAt: Date.now() };
  await set(profileRef, next);
  await set(ref(db, `userDirectory/${next.emarniId}`), publicOf(next));
  if (next.displayName && user.displayName !== next.displayName) {
    await updateAuthProfile(user, { displayName: next.displayName }).catch(() => {});
  }
  return next;
}

export function syncAccount(user) {
  return set(ref(db, `userAccounts/${user.uid}`), { uid: user.uid, email: user.email || "", updatedAt: serverTimestamp() });
}

// ---------- Directory, friends and friend requests ----------
export function watchUserDirectory(callback, onError) {
  return onValue(ref(db, "userDirectory"), snapshot => callback(snapshot.val() || {}), error => onError?.(error));
}

export function watchFriendships(uid, callback, onError) {
  return onValue(ref(db, `friendships/${uid}`), snapshot => callback(snapshot.val() || {}), error => onError?.(error));
}

export function watchIncomingRequests(uid, callback, onError) {
  return onValue(ref(db, `friendRequests/${uid}`), snapshot => callback(snapshot.val() || {}), error => onError?.(error));
}

export async function sendFriendRequest(recipientUid, profile) {
  const user = requireUser("Sign in before sending friend requests.");
  if (!recipientUid || recipientUid === user.uid) throw new Error("You cannot send a friend request to yourself.");
  const existing = await get(ref(db, `friendships/${user.uid}/${recipientUid}`));
  if (existing.val()?.status === "accepted") throw new Error("You are already friends.");
  await set(ref(db, `friendRequests/${recipientUid}/${user.uid}`), {
    fromUid: user.uid,
    fromEmarniId: profile.emarniId,
    fromName: profile.displayName,
    status: "pending",
    createdAt: Date.now()
  });
  await set(ref(db, `sentRequests/${user.uid}/${recipientUid}`), { status: "pending", at: Date.now() });
}

export async function respondFriendRequest(requesterUid, accept) {
  const user = requireUser("Sign in before responding to requests.");
  const requestRef = ref(db, `friendRequests/${user.uid}/${requesterUid}`);
  const snapshot = await get(requestRef);
  if (!snapshot.exists() || snapshot.val()?.status !== "pending") {
    throw new Error("This friend request is no longer available.");
  }
  await update(requestRef, { status: accept ? "accepted" : "declined", respondedAt: Date.now() });
  if (accept) {
    const relationship = { status: "accepted", since: Date.now() };
    await update(ref(db), {
      [`friendships/${user.uid}/${requesterUid}`]: relationship,
      [`friendships/${requesterUid}/${user.uid}`]: relationship
    });
  }
}

// ---------- Direct messages ----------
// Room id = both user ids, sorted and joined with "__".
export async function openPrivateChat(otherUid) {
  const user = requireUser("Sign in before opening a chat.");
  if (!otherUid || otherUid === user.uid) throw new Error("Choose a friend to chat with.");
  const roomId = [user.uid, otherUid].sort().join("__");
  await set(ref(db, `privateRooms/${roomId}/members/${user.uid}`), true);
  return roomId;
}

const roomMessages = roomId => ref(db, `privateRooms/${roomId}/messages`);

export function watchMessages(chat, callback, onError) {
  const q = query(roomMessages(chat.id), orderByChild("createdAt"), limitToLast(100));
  return onValue(
    q,
    snap => callback(listOf(snap).sort(byTime)),
    err => onError?.(err)
  );
}

export async function sendMessage(chat, text, profile) {
  const user = requireUser("Sign in before sending a message.");
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Write a message first.");
  if (clean.length > 1000) throw new Error("Messages can contain up to 1,000 characters.");
  await set(push(roomMessages(chat.id)), {
    uid: user.uid,
    senderName: String(profile?.displayName || "Emarni user").slice(0, 32),
    senderEmarniId: String(profile?.emarniId || ""),
    senderPhotoURL: String(profile?.photoURL || ""),
    text: clean,
    deleted: false,
    createdAt: serverTimestamp()
  });
}

// Delete: the sender removes their own message. A safety copy (admin-only) is kept for 30 days first.
export async function deleteMessage(chat, messageId) {
  const user = requireUser();
  const msgRef = ref(db, `privateRooms/${chat.id}/messages/${messageId}`);
  const snap = await get(msgRef);
  if (!snap.exists()) return { deleted: true };
  const m = snap.val();
  if (m.uid !== user.uid) throw new Error("You can delete only your own messages.");
  await set(ref(db, `moderationArchive/${messageId}`), {
    scope: "dm",
    roomId: chat.id,
    messageId,
    uid: m.uid,
    senderName: m.senderName || "",
    text: m.text || "",
    createdAt: Number(m.createdAt) || 0,
    deletedBy: user.uid,
    deletedAt: serverTimestamp()
  });
  await remove(msgRef);
  return { deleted: true };
}

export async function reportMessage(chat, messageId, reason) {
  const user = requireUser();
  const snap = await get(ref(db, `privateRooms/${chat.id}/messages/${messageId}`));
  if (!snap.exists()) throw new Error("This message no longer exists.");
  const msg = snap.val();
  if (msg.uid === user.uid) throw new Error("You cannot report your own message.");
  try {
    await set(ref(db, `reports/${messageId}_${user.uid}`), {
      type: "message",
      scope: "dm",
      roomId: chat.id,
      messageId,
      reportedUid: msg.uid,
      reporterUid: user.uid,
      messageText: msg.text,
      reason: String(reason || "").trim().slice(0, 200),
      status: "open",
      createdAt: serverTimestamp()
    });
  } catch (err) {
    if (/permission/i.test(err?.message || "")) {
      throw new Error("Could not send the report. You may have already reported this message.");
    }
    throw err;
  }
}

export async function reportUser(otherUid, reason) {
  const user = requireUser();
  try {
    await set(ref(db, `reports/user_${otherUid}_${user.uid}`), {
      type: "user",
      reportedUid: otherUid,
      reporterUid: user.uid,
      reason: String(reason || "").trim().slice(0, 200),
      status: "open",
      createdAt: serverTimestamp()
    });
  } catch (err) {
    if (/permission/i.test(err?.message || "")) {
      throw new Error("Could not send the report. You may have already reported this user.");
    }
    throw err;
  }
}

// ---------- Group chat ----------
// groups/{id}: metadata + members. groupMessages/{id}: messages. userGroups/{uid}/{id}: each member's index.
export async function createGroup({ name, color, memberUids }) {
  const user = requireUser();
  const cleanName = String(name || "").trim().slice(0, 40);
  if (cleanName.length < 2) throw new Error("Group name needs at least 2 characters.");
  const gid = push(ref(db, "groups")).key;
  const members = { [user.uid]: true };
  memberUids.forEach(uid => {
    if (uid && uid !== user.uid) members[uid] = true;
  });
  const joinedAt = Date.now();
  const groupColor = color || "#ef4444";
  await set(ref(db, `groups/${gid}`), {
    name: cleanName,
    color: groupColor,
    createdBy: user.uid,
    createdAt: joinedAt,
    members
  });
  const updates = {};
  Object.keys(members).forEach(uid => {
    updates[`userGroups/${uid}/${gid}`] = { name: cleanName, color: groupColor, joinedAt };
  });
  await update(ref(db), updates);
  return gid;
}

export function watchUserGroups(uid, callback, onError) {
  return onValue(ref(db, `userGroups/${uid}`), snap => callback(snap.val() || {}), err => onError?.(err));
}

export function watchGroup(gid, callback, onError) {
  return onValue(
    ref(db, `groups/${gid}`),
    snap => callback(snap.exists() ? { id: gid, ...snap.val() } : null),
    err => onError?.(err)
  );
}

export function watchGroupMessages(gid, callback, onError) {
  const q = query(ref(db, `groupMessages/${gid}`), orderByChild("createdAt"), limitToLast(100));
  return onValue(q, snap => callback(listOf(snap).sort(byTime)), err => onError?.(err));
}

export async function sendGroupMessage(gid, text, profile) {
  const user = requireUser("Sign in before sending a message.");
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Write a message first.");
  if (clean.length > 1000) throw new Error("Messages can contain up to 1,000 characters.");
  await set(push(ref(db, `groupMessages/${gid}`)), {
    uid: user.uid,
    senderName: String(profile?.displayName || "Emarni user").slice(0, 32),
    text: clean,
    createdAt: serverTimestamp()
  });
}

export async function deleteGroupMessage(gid, msg) {
  const user = requireUser();
  if (msg.uid !== user.uid) throw new Error("You can delete only your own messages.");
  await set(ref(db, `moderationArchive/${msg.id}`), {
    scope: "group",
    roomId: gid,
    messageId: msg.id,
    uid: msg.uid,
    senderName: msg.senderName || "",
    text: msg.text || "",
    createdAt: Number(msg.createdAt) || 0,
    deletedBy: user.uid,
    deletedAt: serverTimestamp()
  });
  await remove(ref(db, `groupMessages/${gid}/${msg.id}`));
}

export async function reportGroupMessage(gid, msg, reason) {
  const user = requireUser();
  if (msg.uid === user.uid) throw new Error("You cannot report your own message.");
  try {
    await set(ref(db, `reports/g_${msg.id}_${user.uid}`), {
      type: "message",
      scope: "group",
      roomId: gid,
      messageId: msg.id,
      reportedUid: msg.uid,
      reporterUid: user.uid,
      messageText: msg.text || "",
      reason: String(reason || "").trim().slice(0, 200),
      status: "open",
      createdAt: serverTimestamp()
    });
  } catch (err) {
    if (/permission/i.test(err?.message || "")) {
      throw new Error("Could not send the report. You may have already reported this message.");
    }
    throw err;
  }
}

// Any current member can add friends. Step 1 adds the members, step 2 writes their index entries.
export async function addGroupMembers(gid, { name, color, uids }) {
  requireUser();
  const add = {};
  uids.forEach(uid => {
    add[uid] = true;
  });
  await update(ref(db, `groups/${gid}/members`), add);
  const joinedAt = Date.now();
  const updates = {};
  uids.forEach(uid => {
    updates[`userGroups/${uid}/${gid}`] = { name, color, joinedAt };
  });
  await update(ref(db), updates);
}

export async function leaveGroup(gid) {
  const user = requireUser();
  await remove(ref(db, `userGroups/${user.uid}/${gid}`));
  await remove(ref(db, `groups/${gid}/members/${user.uid}`));
}

// ---------- Feed: posts, likes, comments and replies ----------
export function watchPosts(callback, onError) {
  const q = query(ref(db, "posts"), orderByChild("createdAt"), limitToLast(40));
  return onValue(q, snap => callback(listOf(snap).sort(byTime).reverse()), err => onError?.(err));
}

export async function createPost({ text, mediaType, mediaURL, mediaPath }) {
  const user = requireUser();
  const clean = String(text || "").trim().slice(0, 2000);
  if (!clean && !mediaURL) throw new Error("Write something or attach a file.");
  const data = { uid: user.uid, mediaType: mediaURL ? mediaType : "none", createdAt: serverTimestamp() };
  if (clean) data.text = clean;
  if (mediaURL) {
    data.mediaURL = mediaURL;
    data.mediaPath = mediaPath;
  }
  await set(push(ref(db, "posts")), data);
}

export async function deletePost(post) {
  requireUser();
  await remove(ref(db, `posts/${post.id}`));
  await deleteFile(post.mediaPath);
}

export function setLike(postId, on) {
  const user = requireUser();
  return set(ref(db, `postLikes/${postId}/${user.uid}`), on ? true : null);
}

export async function addComment(postId, text, parentId = null) {
  const user = requireUser();
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Write something first.");
  if (clean.length > 500) throw new Error("Comments can be up to 500 characters.");
  const base = ref(db, parentId ? `postComments/${postId}/${parentId}/replies` : `postComments/${postId}`);
  await set(push(base), { uid: user.uid, text: clean, createdAt: serverTimestamp() });
}

export function deleteComment(postId, parentId, commentId) {
  requireUser();
  const path = parentId
    ? `postComments/${postId}/${parentId}/replies/${commentId}`
    : `postComments/${postId}/${commentId}`;
  return remove(ref(db, path));
}

export async function reportPost(post, reason) {
  const user = requireUser();
  if (post.uid === user.uid) throw new Error("You cannot report your own post.");
  try {
    await set(ref(db, `reports/post_${post.id}_${user.uid}`), {
      type: "post",
      postId: post.id,
      reportedUid: post.uid,
      reporterUid: user.uid,
      reason: String(reason || "").trim().slice(0, 200),
      status: "open",
      createdAt: serverTimestamp()
    });
  } catch (err) {
    if (/permission/i.test(err?.message || "")) throw new Error("You have already reported this post.");
    throw err;
  }
}

// ---------- Pet adoption (free only) ----------
export function watchAdoptions(callback, onError) {
  const q = query(ref(db, "adoptions"), orderByChild("createdAt"), limitToLast(60));
  return onValue(q, snap => callback(listOf(snap).sort(byTime).reverse()), err => onError?.(err));
}

export async function createAdoption(data) {
  const user = requireUser();
  const id = push(ref(db, "adoptions")).key;
  await set(ref(db, `adoptions/${id}`), {
    uid: user.uid,
    name: data.name,
    species: data.species,
    breed: data.breed || "",
    age: data.age || "",
    gender: data.gender || "Unknown",
    location: data.location || "",
    description: data.description || "",
    photoURL: data.photoURL || "",
    photoPath: data.photoPath || "",
    status: "available",
    createdAt: serverTimestamp()
  });
  return id;
}

export function setAdoptionStatus(id, status) {
  requireUser();
  return update(ref(db, `adoptions/${id}`), { status });
}

export async function deleteAdoption(pet) {
  requireUser();
  await remove(ref(db, `adoptions/${pet.id}`));
  await deleteFile(pet.photoPath);
}

export function watchAdoptionRequests(petId, callback, onError) {
  return onValue(ref(db, `adoptionRequests/${petId}`), snap => callback(snap.val() || {}), err => onError?.(err));
}

export async function sendAdoptionRequest(petId, message, profile) {
  const user = requireUser();
  await set(ref(db, `adoptionRequests/${petId}/${user.uid}`), {
    uid: user.uid,
    name: String(profile.displayName || "Emarni user").slice(0, 32),
    message: String(message || "").trim().slice(0, 500),
    createdAt: serverTimestamp()
  });
}

export function removeAdoptionRequest(petId, uid) {
  requireUser();
  return remove(ref(db, `adoptionRequests/${petId}/${uid}`));
}

// ---------- Paid ads (admin approves) ----------
// adRequests/{uid}/{id}: the owner's request. ads/{id}: approved, public copy.
export function watchActiveAds(callback, onError) {
  return onValue(
    ref(db, "ads"),
    snap => {
      const now = Date.now();
      callback(listOf(snap).filter(ad => Number(ad.expiresAt) > now && ad.paused !== true).sort(byTime).reverse());
    },
    err => onError?.(err)
  );
}

export async function createAdRequest(d) {
  const user = requireUser();
  const aid = push(ref(db, `adRequests/${user.uid}`)).key;
  await set(ref(db, `adRequests/${user.uid}/${aid}`), {
    uid: user.uid,
    title: String(d.title).trim().slice(0, 80),
    body: String(d.body || "").trim().slice(0, 500),
    link: String(d.link || "").trim().slice(0, 300),
    category: d.category || "Other",
    days: Number(d.days),
    amount: Number(d.amount),
    payMethod: d.payMethod,
    txnId: String(d.txnId).trim().slice(0, 40),
    imageURL: d.imageURL || "",
    imagePath: d.imagePath || "",
    status: "pending",
    createdAt: serverTimestamp()
  });
  return aid;
}

export function watchMyAdRequests(callback, onError) {
  const user = requireUser();
  return onValue(ref(db, `adRequests/${user.uid}`), snap => callback(listOf(snap).sort(byTime).reverse()), err => onError?.(err));
}

// Admin only: every request, flattened.
export function watchAllAdRequests(callback, onError) {
  return onValue(
    ref(db, "adRequests"),
    snap => {
      const out = [];
      snap.forEach(userSnap => {
        userSnap.forEach(adSnap => {
          out.push({ aid: adSnap.key, ...adSnap.val() });
        });
      });
      callback(out.sort(byTime).reverse());
    },
    err => onError?.(err)
  );
}

export async function decideAd(req, approve) {
  requireUser();
  const updates = {};
  if (approve) {
    const now = Date.now();
    updates[`ads/${req.aid}`] = {
      uid: req.uid,
      title: req.title,
      body: req.body || "",
      link: req.link || "",
      category: req.category || "Other",
      imageURL: req.imageURL || "",
      days: req.days,
      createdAt: now,
      expiresAt: now + Number(req.days) * 86400000
    };
    updates[`adRequests/${req.uid}/${req.aid}/status`] = "active";
  } else {
    updates[`adRequests/${req.uid}/${req.aid}/status`] = "rejected";
  }
  await update(ref(db), updates);
}

// ---------- Storage ----------
export function uploadFile(folder, file, onProgress) {
  requireUser("Sign in before uploading.");
  const safe = String(file.name || "file").replace(/[^\w.-]+/g, "_").slice(-80);
  const path = `${folder}/${Date.now()}_${safe}`;
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef(storage, path), file, {
      contentType: file.type || "application/octet-stream"
    });
    task.on(
      "state_changed",
      snap => onProgress?.(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
      reject,
      async () => {
        try {
          resolve({ url: await getDownloadURL(task.snapshot.ref), path });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export async function deleteFile(path) {
  if (!path) return;
  await deleteObject(storageRef(storage, path)).catch(() => {});
}

// ---------- Safety notice ----------
export async function needsNotice() {
  const user = requireUser();
  const snap = await get(ref(db, `noticeAcks/${user.uid}`));
  return snap.val()?.version !== NOTICE_VERSION;
}

export function acknowledgeNotice() {
  const user = requireUser();
  return set(ref(db, `noticeAcks/${user.uid}`), { version: NOTICE_VERSION, at: serverTimestamp() });
}

// ---------- Admin panel helpers (used by admin.js) ----------
export const signInEmail = (email, password) => signInWithEmailAndPassword(auth, email.trim(), password);
export const sendResetEmail = email => sendPasswordResetEmail(auth, email);
export const roomIdFor = (a, b) => [a, b].sort().join("__");

export async function checkAdmin(user) {
  try {
    if ((await user.getIdTokenResult()).claims.admin === true) return "ok";
  } catch {
    /* continue */
  }
  try {
    if ((await get(ref(db, `admins/${user.uid}`))).val() === true) return "ok";
  } catch {
    return "rules"; // permission denied: the latest database rules are not published yet
  }
  try {
    await get(ref(db, "admins")); // readable only by admins (flag, claim or the admin email in the rules)
    return "ok";
  } catch {
    return "no";
  }
}

export const watchPath = (path, callback, onError) =>
  onValue(ref(db, path), snap => callback(snap.val() || {}), err => onError?.(err));

export const watchRoomArchive = (roomId, callback, onError) =>
  onValue(
    query(ref(db, "moderationArchive"), orderByChild("roomId"), equalTo(roomId)),
    snap => callback(snap.val() || {}),
    err => onError?.(err)
  );

export const resolveReport = id => set(ref(db, `reports/${id}/status`), "resolved");

export const purgeArchive = keys =>
  update(ref(db), Object.fromEntries(keys.map(k => [`moderationArchive/${k}`, null])));

export const logAdminView = roomId =>
  push(ref(db, "adminAudit"), { adminUid: currentUser.uid, roomId, at: serverTimestamp() });

// ---------- v3: sent requests, cancelling requests, and posts by one person ----------
export function watchSentRequests(uid, callback, onError) {
  return onValue(ref(db, `sentRequests/${uid}`), snap => callback(snap.val() || {}), err => onError?.(err));
}

export async function cancelFriendRequest(uid) {
  const user = requireUser();
  await update(ref(db), {
    [`friendRequests/${uid}/${user.uid}`]: null,
    [`sentRequests/${user.uid}/${uid}`]: null
  });
}

export function watchUserPosts(uid, callback, onError) {
  const q = query(ref(db, "posts"), orderByChild("uid"), equalTo(uid));
  return onValue(q, snap => callback(listOf(snap).sort(byTime).reverse()), err => onError?.(err));
}

// ---------- v4: chat messages with files, replies and reactions ----------
export async function sendChatMessage(chat, data, profile) {
  const user = requireUser("Sign in before sending a message.");
  const type = data.type || "text";
  const msg = {
    uid: user.uid,
    senderName: String(profile?.displayName || "Emarni user").slice(0, 32),
    type,
    createdAt: serverTimestamp()
  };
  if (type === "text") {
    const text = String(data.text || "").trim();
    if (!text) throw new Error("Write a message first.");
    if (text.length > 1000) throw new Error("Messages can contain up to 1,000 characters.");
    msg.text = text;
  } else {
    if (!data.fileURL) throw new Error("The file did not upload. Try again.");
    msg.fileURL = data.fileURL;
    msg.filePath = data.filePath || "";
    msg.fileName = String(data.fileName || "file").slice(0, 120);
    msg.fileSize = Number(data.fileSize) || 0;
    msg.fileType = String(data.fileType || "");
    const caption = String(data.text || "").trim().slice(0, 1000);
    if (caption) msg.text = caption;
  }
  if (data.replyTo?.id) {
    msg.replyTo = {
      id: String(data.replyTo.id),
      name: String(data.replyTo.name || "").slice(0, 32),
      text: String(data.replyTo.text || "").slice(0, 120)
    };
  }
  const path = chat.type === "dm" ? `privateRooms/${chat.id}/messages` : `groupMessages/${chat.id}`;
  await set(push(ref(db, path)), msg);
}

const reactionBase = chat => (chat.type === "dm" ? `privateRooms/${chat.id}/reactions` : `groupReactions/${chat.id}`);

export function watchReactions(chat, callback, onError) {
  return onValue(ref(db, reactionBase(chat)), snap => callback(snap.val() || {}), err => onError?.(err));
}

// kind is "heart", "check", "sparkle", or null to remove my reaction.
export function setReaction(chat, msgId, kind) {
  const user = requireUser();
  return set(ref(db, `${reactionBase(chat)}/${msgId}/${user.uid}`), kind || null);
}

// ---------- v4: ad controls (admin) ----------
export function watchAllAds(callback, onError) {
  return onValue(ref(db, "ads"), snap => callback(listOf(snap).sort(byTime).reverse()), err => onError?.(err));
}

export function setAdPaused(id, paused) {
  requireUser();
  return update(ref(db, `ads/${id}`), { paused: Boolean(paused) });
}

export function extendAd(id, expiresAt, days) {
  requireUser();
  return update(ref(db, `ads/${id}`), { expiresAt: Number(expiresAt) + Number(days) * 86400000 });
}

export async function removeAd(id, uid) {
  requireUser();
  await update(ref(db), { [`ads/${id}`]: null, [`adRequests/${uid}/${id}/status`]: "removed" });
}

// ---------- v4: admin conversation monitor (read-only, every view is logged) ----------
export const adminGetFriendships = uid => get(ref(db, `friendships/${uid}`)).then(snap => snap.val() || {});
export const adminGetUserGroups = uid => get(ref(db, `userGroups/${uid}`)).then(snap => snap.val() || {});
export const adminGetGroup = gid => get(ref(db, `groups/${gid}`)).then(snap => (snap.exists() ? snap.val() : null));

export function watchRoomMessagesFor(scope, id, callback, onError) {
  const path = scope === "group" ? `groupMessages/${id}` : `privateRooms/${id}/messages`;
  const q = query(ref(db, path), orderByChild("createdAt"), limitToLast(200));
  return onValue(q, snap => callback(listOf(snap).sort(byTime)), err => onError?.(err));
}

export function logAdminOpen(scope, id) {
  const user = requireUser();
  return push(ref(db, "adminAudit"), { adminUid: user.uid, scope, roomId: id, at: serverTimestamp() });
}

// ---------- v4: setup check (tells exactly what is not working) ----------
export async function runHealthCheck() {
  const user = requireUser();
  const rows = [];
  const check = async (name, task, okText) => {
    try {
      await task();
      rows.push({ name, ok: true, message: okText });
    } catch (err) {
      rows.push({ name, ok: false, message: friendlyError(err) });
    }
  };
  await check("Database write", () => set(ref(db, `_health/${user.uid}`), { at: serverTimestamp() }), "Data can be saved.");
  await check("Database read", () => get(ref(db, `_health/${user.uid}`)), "Data can be read.");
  await check("Feed read", () => get(query(ref(db, "posts"), limitToLast(1))), "The feed can be loaded.");
  await check("Photo upload", async () => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], "health-check.png", { type: "image/png" });
    const sent = await uploadFile(`avatars/${user.uid}`, file);
    await deleteFile(sent.path);
  }, "Photos can be uploaded and removed.");
  return rows;
}
