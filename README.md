# Emarni Chat (v2)

Static web app (no build step). Put these files in your GitHub repo root and enable GitHub Pages, or serve the folder with any static server.

## What's in this version

- **Chats**: direct messages and **group chat** (create a group, add friends, leave, delete your own messages, report).
- **Feed**: posts with text, **photo, video, audio or a recorded voice note**; likes, comments, **replies**, report, delete your own.
- **Profile**: display name, status, bio, accent colour, circle or rounded photo, and **drag-to-position cover and profile photos with zoom**.
- **Pet adoption**: free adoption listings only (no price field). Send adoption requests; owners see them and can mark a pet adopted.
- **Advertise**: pay the amount you choose, enter the transaction ID, and an admin approves the ad in the Ads page.
- **Calls**: audio and video calls (1-to-1 and small groups), ringing, mute, camera, and a **shared whiteboard** with live strokes, colours, eraser, undo, clear, and a host lock so only the teacher draws.
- **Loading screen and motion**: new animated splash, skeleton loaders, and staggered transitions. Motion is reduced automatically if the device asks for it.
- **Admin panel** (`admin.html`) is unchanged and still works.

## Files

| File | Purpose |
|---|---|
| `index.html` | Shell, views, call screen, dialogs |
| `style.css` | Design system and admin styles |
| `app.js` | Splash, sign-in, navigation, friends and groups lists |
| `chat.js` | Chat panel, group create and info |
| `feed.js` | Posts, likes, comments, replies, composer and voice recording |
| `market.js` | Pet adoption and paid ads |
| `profile.js` | Profile editor with drag and zoom |
| `call.js` | Calls (WebRTC mesh over Realtime Database signalling) |
| `board.js` | Shared whiteboard used inside calls |
| `firebase.js` | Firebase layer (auth, database, storage, all data functions) |
| `ui.js` | Shared helpers |
| `icons.js` | Icon set and pet illustrations (no emoji anywhere) |
| `people.js` | People search, profile view, friend requests |
| `database.rules.json` | Realtime Database security rules |
| `storage.rules` | Cloud Storage rules for photos, videos and voice notes |
| `admin.html`, `admin.js` | Admin panel (unchanged) |

## Setup (do these in order)

1. **Replace the repo files** with the files above. Keep `admin.html` and `admin.js` as they are.
2. **Database rules**: Firebase console > Realtime Database > Rules. Paste the whole content of `database.rules.json` and click **Publish**.
3. **Storage**: Firebase console > Storage. If it is not enabled, click **Get started**. Then go to **Rules**, paste `storage.rules`, and **Publish**.
4. **Payment numbers**: open `market.js` and replace the `01XXXXXXXXX` placeholders in the `PAY` object with your real bKash, Nagad and Rocket numbers.
5. **Calls across networks** (optional but recommended): calls use free Google STUN servers, which work on most home and mobile networks but not on every corporate or strict network. For full reliability, add a TURN server (for example from a hosted TURN provider) in `RTC_CONFIG` in `call.js`.
6. **Admin access**: the existing admin email in the rules still works. You can also set `admins/<uid>` to `true` in the database console for another admin. Admins approve ads from the **Ads** page ("Pending approvals").
7. Open the app, hard-refresh once (Ctrl+Shift+R) so the browser loads the new files, and sign in.

## Notes and limits

- Calls use a peer-to-peer mesh. It works well for 1-to-1 and up to about 4 people. Larger calls need a media server.
- Calls and the whiteboard need HTTPS (GitHub Pages provides it) and camera and microphone permission.
- Group messages and deleted-message safety copies follow the same 30-day rule as direct messages. The admin panel lists them under deleted items, but opening a group conversation from inside the admin panel is not built yet.
- Payment is manual (transaction ID plus admin approval). Connecting an automatic payment gateway needs a server-side function.
- Messages and posts are not end-to-end encrypted. The safety notice shown on first sign-in says so.
