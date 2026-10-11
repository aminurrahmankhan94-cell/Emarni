const admin = require("firebase-admin");
const crypto = require("node:crypto");

const {
  onCall,
  HttpsError
} = require("firebase-functions/v2/https");

const {
  onSchedule
} = require("firebase-functions/v2/scheduler");

admin.initializeApp();

const db = admin.database();

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in to continue."
    );
  }

  return request.auth;
}

function requireAdmin(request) {
  const auth = requireAuth(request);

  if (auth.token.admin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Administrator access is required."
    );
  }

  return auth;
}

async function ensureNotBanned(uid, isAdmin = false) {
  if (isAdmin) return;

  const banned = await db.ref(`banned/${uid}`).get();

  if (banned.exists()) {
    throw new HttpsError(
      "permission-denied",
      "This account has been restricted."
    );
  }
}

const FIREBASE_WEB_API_KEY =
  process.env.EMARNI_FIREBASE_WEB_API_KEY ||
  "AIzaSyBbvQfpdM7-WzbYrn2WfygvPS2iRVaEMHY";

async function applyLoginIdRateLimit(request) {
  const clientIp = String(
    request.rawRequest?.ip ||
    request.rawRequest?.headers?.["x-forwarded-for"] ||
    "unknown"
  ).split(",")[0].trim();

  const bucketId = crypto
    .createHash("sha256")
    .update(clientIp)
    .digest("hex")
    .slice(0, 32);

  const bucketRef = db.ref(
    `loginAttemptBuckets/${bucketId}`
  );

  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 20;

  const transaction = await bucketRef.transaction(
    current => {
      const attempts = (
        Array.isArray(current?.attempts)
          ? current.attempts
          : []
      ).filter(value => Number(value) > now - windowMs);

      if (attempts.length >= maxAttempts) return;

      attempts.push(now);

      return {
        attempts,
        updatedAt: now
      };
    },
    undefined,
    false
  );

  if (!transaction.committed) {
    throw new HttpsError(
      "resource-exhausted",
      "Too many sign-in attempts. Please wait 15 minutes and try again."
    );
  }
}

exports.signInWithEmarniId = onCall(async request => {
  const emarniId = String(
    request.data?.emarniId || ""
  ).trim().toUpperCase();

  const password = String(request.data?.password || "");

  if (
    !/^EM[A-HJ-NP-Z2-9]{8}$/.test(emarniId) ||
    password.length < 1 ||
    password.length > 256
  ) {
    throw new HttpsError(
      "unauthenticated",
      "The Emarni ID or password is not correct."
    );
  }

  await applyLoginIdRateLimit(request);

  const publicProfile = await db
    .ref(`userDirectory/${emarniId}/uid`)
    .get();

  if (!publicProfile.exists()) {
    throw new HttpsError(
      "unauthenticated",
      "The Emarni ID or password is not correct."
    );
  }

  let userRecord;

  try {
    userRecord = await admin.auth().getUser(
      String(publicProfile.val())
    );
  } catch {
    throw new HttpsError(
      "unauthenticated",
      "The Emarni ID or password is not correct."
    );
  }

  if (!userRecord.email) {
    throw new HttpsError(
      "failed-precondition",
      "This account does not have an email sign-in method."
    );
  }

  let response;

  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: userRecord.email,
          password,
          returnSecureToken: true
        })
      }
    );
  } catch {
    throw new HttpsError(
      "unavailable",
      "Authentication is temporarily unavailable. Try again soon."
    );
  }

  const authResult = await response.json().catch(() => ({}));

  if (
    !response.ok ||
    authResult.localId !== userRecord.uid
  ) {
    throw new HttpsError(
      "unauthenticated",
      "The Emarni ID or password is not correct."
    );
  }

  const customToken = await admin.auth().createCustomToken(
    userRecord.uid,
    userRecord.customClaims || {}
  );

  return { customToken };
});

async function areAcceptedFriends(uidA, uidB) {
  const [a, b] = await Promise.all([
    db.ref(`friendships/${uidA}/${uidB}/status`).get(),
    db.ref(`friendships/${uidB}/${uidA}/status`).get()
  ]);

  return (
    a.val() === "accepted" &&
    b.val() === "accepted"
  );
}

exports.openPrivateChat = onCall(async request => {
  const auth = requireAuth(request);

  await ensureNotBanned(
    auth.uid,
    auth.token.admin === true
  );

  const otherUid = String(
    request.data?.otherUid || ""
  );

  if (!otherUid || otherUid === auth.uid) {
    throw new HttpsError(
      "invalid-argument",
      "Choose another user."
    );
  }

  if (!(await areAcceptedFriends(auth.uid, otherUid))) {
    throw new HttpsError(
      "permission-denied",
      "A private chat is available only after both users are accepted friends."
    );
  }

  const memberIds = [auth.uid, otherUid].sort();
  const roomId = memberIds.join("__");

  const roomRef = db.ref(`privateRooms/${roomId}`);
  const snapshot = await roomRef.get();

  if (!snapshot.exists()) {
    const now = Date.now();

    await roomRef.set({
      members: {
        [memberIds[0]]: true,
        [memberIds[1]]: true
      },
      createdAt: now,
      createdBy: auth.uid
    });
  } else {
    const members = snapshot.child("members").val() || {};

    if (!members[auth.uid] || !members[otherUid]) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this conversation."
      );
    }
  }

  return { roomId };
});

exports.createChatGroup = onCall(async request => {
  const auth = requireAuth(request);

  await ensureNotBanned(
    auth.uid,
    auth.token.admin === true
  );

  const data = request.data || {};

  const name = String(data.name || "").trim().slice(0, 55);

  const type =
    data.type === "business"
      ? "business"
      : "community";

  const description = String(
    data.description || ""
  ).trim().slice(0, 240);

  const companyName =
    type === "business"
      ? String(data.companyName || "").trim().slice(0, 80)
      : "";

  const website =
    type === "business"
      ? String(data.website || "").trim().slice(0, 160)
      : "";

  if (name.length < 2) {
    throw new HttpsError(
      "invalid-argument",
      "Group name must contain at least 2 characters."
    );
  }

  if (website) {
    try {
      const parsed = new URL(website);

      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      throw new HttpsError(
        "invalid-argument",
        "Enter a valid business website URL."
      );
    }
  }

  const invited = Array.isArray(data.memberUids)
    ? [
        ...new Set(
          data.memberUids
            .map(value => String(value))
            .filter(Boolean)
        )
      ]
    : [];

  if (invited.length > 49) {
    throw new HttpsError(
      "invalid-argument",
      "A group can invite up to 49 friends at a time."
    );
  }

  for (const uid of invited) {
    if (uid === auth.uid) continue;

    if (!(await areAcceptedFriends(auth.uid, uid))) {
      throw new HttpsError(
        "permission-denied",
        "You can invite accepted friends only."
      );
    }
  }

  const groupRef = db.ref("groups").push();
  const groupId = groupRef.key;
  const now = Date.now();

  const allMembers = [
    ...new Set([auth.uid, ...invited])
  ];

  const members = {};
  const indexes = {};

  for (const uid of allMembers) {
    members[uid] = {
      role: uid === auth.uid ? "owner" : "member",
      joinedAt: now
    };

    indexes[`userGroups/${uid}/${groupId}`] = true;
  }

  await db.ref().update({
    [`groups/${groupId}`]: {
      id: groupId,
      name,
      type,
      description,
      companyName,
      website,
      ownerUid: auth.uid,
      createdAt: now,
      members
    },
    ...indexes
  });

  return { groupId };
});
