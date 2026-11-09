# Emarni Chat (v8)

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
| `ringtone.js` | Incoming and ringback tones (unlocks sound on first tap) |
| `monitor.js` | Admin conversation monitor (read-only, every view logged) |
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


## What's new in v6

- **Loader and logo**: the old letter logo is replaced by a black disc with a red spiral that turns. It is shown on the loader, the sidebar, the sign-in page and the About page.
- **Notifications**: new messages (private and group) and calls notify you inside the app, with a short chime, an in-app card, and an unread badge on each chat. When the app is in the background, a browser or phone notification is shown. Turn them on with the bell button in the Chats panel.
- **Whiteboard tools**: typed text, line, arrow, rectangle and circle, eraser, grid and graph paper, a scientific calculator (its result can be placed on the board), undo, clear, and a teacher lock.
- **About Emarni**: its own page in the sidebar, and a link from the profile.
- **Photos and videos**: phone files with a missing type, HEIC photos, and large photos are handled. Videos up to 150 MB are accepted.
- **Create post**: the profile's Create post button opens a Facebook-style dialog with text, photo, video, audio and voice notes.

## Setup for v6

1. Replace the repo files with the files in this version. Keep `admin.html` and `admin.js` as they are.
2. Storage: Firebase console > Storage > Rules. Paste `storage.rules` and **Publish**. (The limits changed.)
3. The database rules did not change. Only publish `database.rules.json` if you have not published it before.
4. `sw.js` must stay in the repository root. It shows notifications on phones and opens the app when a notification is tapped.
5. Open the app, press the bell button in the Chats panel, and allow notifications.


## What's new in v7

- **Kite logo**: the mark is the red and black kite from the brand artwork. Its tails wave and its string sways. It appears on the loader (where the kite flies), the sidebar, sign-in and the About page.
- **Phone and desktop layouts**: the app picks the layout from the window size. On phones it uses bottom tabs and one panel at a time. On desktops it uses the sidebar and two panels. Settings > Screen layout lets you force either one.
- **Settings page**: profile (name and status), screen layout, red fog, reduced motion, compact spacing, larger text, notifications (sound, in-app cards, phone and desktop notifications, message text), media checks, account (password reset by email, sign out), and reset to default.
- **Media checks**: Settings > Photos, videos and voice notes runs a small test upload for each kind. A failed check shows the exact reason and the Firebase error code.

## Setup for v7

- Storage rules: unchanged from v6. If you already published v6's `storage.rules`, nothing more is needed.
- Database rules: unchanged.
- Open Settings > Photos, videos and voice notes and run **Full setup check**. Any line marked Fix shows the reason, which tells you what to publish or enable.


## What's new in v8

- **Top bar**: live local time and date (browser time zone), current weather, humidity, wind, and the city. Weather updates every 15 minutes and is cached.
- **Location**: shared only when you tap **Use my location** and allow it. Otherwise choose a city from the location button at the top.
- **Atmosphere**: the page's soft glow and tint shift with the time of day and the weather (morning, afternoon, evening, night; sun, cloud, rain, storm, snow, fog). Colours stay red, black and white. Turn it off in Settings > Atmosphere, location and sound.
- **Sounds**: short, soft tones made in the browser (no audio files). Messages, likes, posts, friend requests, calls, dialogs and clicks each have a sound. Settings has a master switch and separate switches for messages, interface and calls, plus a test button. Sound starts after your first tap, because browsers require that.

## Setup for v8

- No new database or storage rules. Nothing to publish.
- Weather and place names use free services that need no key: Open-Meteo (weather) and BigDataCloud (city name). They need an internet connection.
