# EMARNI v9 — FROZEN SHARED CONTRACT (read before editing any file)

Project root: `/home/user/.dola/agent_mode/workspace/.sessions/38418609847739153/emarni_project`
Static ES-module app, no build step, GitHub Pages compatible (relative paths only).

## 0. HARD RULES (all shards)
- **DO NOT MODIFY**: `firebase.js`, `database.rules.json`, `storage.rules`. Use the existing exported API (see §5). If you think you need a new DB path, do NOT add it — work with existing paths or note it in your final report.
- **DO NOT** introduce dummy data, fake buttons, or break existing functionality. Every control must be wired.
- **DO NOT** add heavy libraries. Vanilla JS + CSS only. Firebase stays at gstatic CDN 11.6.0.
- Escape user content with `esc()` from ui.js when injecting into innerHTML.
- Respect `prefers-reduced-motion` (html class `reduce-motion`).
- Use `playSound(name)` from sounds.js — only recipe names in §6.
- Icons: `icon(name)` from icons.js / `<i data-icon="name">` hydrated by `hydrate()`. No emoji.
- All text in English. Brand: **EMARNI** (all caps in display).

## 1. FILE OWNERSHIP (edit only your files; never touch another shard's)
| Shard | Owns (may edit/create) |
|---|---|
| S1 SHELL | `index.html`, `style.css`, `app.js`, `prefs.js`, `environment.js`, `icons.js` (extend), `ui.js` (extend helpers only), `brand.js` (keep), `sw.js` (keep), `README.md`, `CHANGELOG.md` |
| S2 MESSAGING | `chat.js`, `media.js`, **new** `chat.css` |
| S3 SOCIAL | `feed.js`, `postbox.js`, `people.js`, `profile.js`, **new** `social.css` |
| S4 CALLS | `call.js`, `board.js`, `calc.js`, **new** `calls.css` |
| S5 MARKET | `market.js`, `notify.js`, `monitor.js`, `admin.js`, `admin.html`, **new** `market.css` |

S1 MUST add these `<link>` tags in index.html `<head>` (after style.css):
`chat.css?v=9`, `social.css?v=9`, `calls.css?v=9`, `market.css?v=9`.
Each feature CSS file scopes styles under its view id (e.g. `#chatsView ...`) to avoid collisions.

## 2. CSS VARIABLES (frozen names — S1 defines in :root, all shards USE only these)
Dark (default on `:root`):
```
--red:#EF4444; --red-deep:#DC2626; --red-soft:#F87171;
--black:#050505; --surface:#101010; --elevated:#181818;
--white:#FFFFFF; --white-2:#F5F5F5; --muted:#A3A3A3;
--border:rgba(255,255,255,0.09);
--bg:var(--black); --bg-2:#0A0A0A; --panel:var(--surface); --panel-2:var(--elevated);
--glass:rgba(24,24,24,0.72);
--text:#F5F5F5; --text-dim:#A3A3A3; --text-faint:#6B6B6B;
--accent:var(--red); --accent-2:var(--red-deep); --accent-soft:var(--red-soft);
--ok:#22C55E; --warn:#FBBF24; --danger:#EF4444;
--radius:18px; --radius-sm:12px; --radius-pill:999px;
--shadow:0 18px 50px rgba(0,0,0,0.45); --ease:cubic-bezier(0.2,0.8,0.2,1);
--font-head:"Space Grotesk",system-ui,sans-serif; --font-body:"Hind Siliguri",system-ui,sans-serif;
--nav-w:264px; --nav-w-min:72px; --right-w:300px; --topbar-h:56px;
```
`html[data-theme="light"]` overrides: `--bg:#FFFFFF; --bg-2:#F5F5F5; --panel:#FFFFFF; --panel-2:#F5F5F5; --glass:rgba(255,255,255,0.72); --text:#0A0A0A; --text-dim:#525252; --text-faint:#A3A3A3; --border:rgba(0,0,0,0.08); --shadow:0 18px 50px rgba(0,0,0,0.08);`
Red is for actions/active/badges only — never large red backgrounds.

Shared component classes (S1 defines; all shards use): `.btn`, `.btn-primary`(red), `.btn-ghost`, `.btn-icon`, `.input`, `.textarea`, `.card`, `.badge`, `.switch`, `.avatar`(+`.avatar.online`), `.empty-state`, `.skeleton`, `.dialog`, `.toast`, `.chip`, `.tab`, `.progress`. Buttons get hover/press/focus/loading/disabled states in S1 CSS.

## 3. DOM STRUCTURE & IDS (frozen — S1 builds shell; modules render inside containers)
`<html data-theme="dark|light" data-device="phone|desktop">` with classes (toggled by prefs/env): `env-morning|env-afternoon|env-evening|env-night` (exactly one), `wx-clear|wx-cloud|wx-rain|wx-snow|wx-storm|wx-fog` (exactly one), plus `reduce-motion`, `compact`, `text-large`, `no-fog`.

Top-level:
- `#splash` — animated loading screen (S1; brand kite + progress; hides on auth resolve)
- `#authScreen` — S1 owns (login/register/forgot, brand, calls firebase.js registerAccount/signInAccount/sendResetEmail/signInEmail)
- `#appShell` (hidden until signed in):
  - `aside#sidebar` (collapsible, `.collapsed`): `#sidebarBrand [data-brand]`, nav buttons `button.nav[data-nav="X"]` with `<i data-icon>` + `<span>` + optional `<b class="nav-badge">`. `#signOutBtn` at bottom. `#sidebarToggle`.
  - `header#topbar`: `#envBar` (contains `#envTime`, `#envDate`, `#envCity`, `#envIconWrap` with `<i data-icon>`, `#envTemp`, `#envHumidity`, `#envWind`, `button#envBtn`), `#globalSearch` input + `#searchResults` dropdown, `#notifyBell` + `#notifyBadge`, `#rightToggle`, `#avatarBtn`.
  - `div#envPop` (hidden popover: manual city list from envcore.CITIES + "Use my location" button; S1 markup, environment.js logic)
  - `main#workspace`: sections `section.view[data-view="X"]` each containing `<div class="view-inner" id="XView">` (module renders here). Views: `chats`, `friends`, `people`, `feed`, `groups`, `adopt`, `ads`, `notifications`, `settings`, `about`, `monitor`, `me`.
  - `aside#rightPanel` (collapsible, `.hidden`): slots `#rpOnline` (S2 fills), `#rpRecent` (S2 fills), `#rpSuggest` (S3 fills), `#rpTrending` (S3 fills). S1 builds headings + empty containers.
  - `nav#bottomNav` (phone only): data-nav = chats, feed, adopt, ads, me + a "More" button opening a sheet with the rest.
- `#callLayer` — fixed full-screen call UI container (S4 owns all inner markup, S1 provides empty div + z-index).
- `#dialogRoot`, `#toastRoot` (S1; ui.js openDialog/toast target them).
- `#notifyDrawer` — right-side notification drawer (S5 owns inner markup; S1 provides empty aside + toggle wired to #notifyBell).

data-nav set (frozen): chats, friends, people, feed, groups, adopt, ads, notifications, settings, about, monitor, me. Icons: chat=chat, friends=user, people=users, feed=sparkle, groups=users, adopt=paw, ads=megaphone, notifications=bell, settings=gear, about=info, monitor=shield, me=user. `monitor` nav + view hidden unless `checkAdmin(user)` resolves true (S1 wires).

Navigation: app.js `go(view)` toggles `.on` on `[data-view]` and `[data-nav]`, and calls module show-hooks. Module export contract (each module exports):
- S2: `initChat()`, `openDm(uid)`, `openGroup(gid)`, `openNewGroup()`, `refreshChatHead()`, `onChatsShow()` (fills right panel slots #rpOnline/#rpRecent).
- S3: `initFeed()`, `refreshFeed()`, `initPostbox()`, `initPeople()`, `openUser(uid)`, `refreshPeople()`, `initProfile()`, `onProfileShow()`, `onSocialShow()` (fills #rpSuggest/#rpTrending).
- S4: `initCalls()`.
- S5: `initMarket()`, `refreshMarket()`, `onMarketShow()`, `initNotify()`, `syncRooms()`, `unreadFor(roomId)`, `totalUnread()`, `enableNotifications()`, `permissionState()`, `initMonitor()`, `onMonitorShow()`.
S1 app.js imports exactly these names — keep them stable. Settings: S1 owns settings.js? NO — settings.js is unassigned. Assign: **S1 owns settings.js** (it ties to prefs keys). Add to S1 row.

## 4. PREFS KEYS (S1 extends prefs.js DEFAULTS; key stays "emarni-prefs-v2" — adding keys is backward compatible)
Existing: layout, fog, reduceMotion, compact, largeText, sound, cards, osNotify, preview, envTheme, soundMaster, soundUi, soundCalls.
ADD (S1): `theme:"dark"` ("dark"|"light"|"auto"), `soundNotify:true`, `soundMessages` (alias of `sound` — keep `sound` as master message toggle), `desktopNotify:true`, `messagePreview:true`. S1 applies `data-theme` on change (auto = matchMedia prefers-color-scheme).

## 5. FIREBASE API (frozen — use these, from `import * as fb from "./firebase.js"`)
Auth: watchAuth(cb)->user|null, getCurrentUser(), registerAccount({email,password,displayName}), signInAccount(login,password) (email or EMARNI ID), signOutAccount(), signInEmail, sendResetEmail, ensureUserProfile, saveProfile(patch), checkAdmin(user)->bool.
Profile/directory: watchUserDirectory(cb), watchFriendships(uid,cb), watchIncomingRequests(uid,cb), watchSentRequests(uid,cb), sendFriendRequest(uid,profile), respondFriendRequest(uid,accept), cancelFriendRequest(uid).
DM: openPrivateChat(uid)->roomId, roomIdFor(a,b), watchMessages(chat,cb), sendMessage(chat,text,profile), **sendChatMessage(chat,data,profile)** (data={text?, mediaType:"image"|"video"|"audio"|"voice", mediaURL, mediaPath?, voiceDuration?}), deleteMessage(chat,msgId), reportMessage(chat,msgId,reason), reportUser(uid,reason), watchReactions(chat,cb), setReaction(chat,msgId,kind).
Groups: createGroup({name,color,memberUids}), watchUserGroups(uid,cb), watchGroup(gid,cb), watchGroupMessages(gid,cb), sendGroupMessage(gid,text,profile), deleteGroupMessage(gid,msg), reportGroupMessage(gid,msg,reason), addGroupMembers(gid,{name,color,uids}), leaveGroup(gid).
Feed: watchPosts(cb), watchUserPosts(uid,cb), createPost({text,mediaType,mediaURL,mediaPath}), deletePost(post), setLike(postId,on), addComment(postId,text,parentId), deleteComment(postId,parentId,commentId), reportPost(post,reason).
Market: watchAdoptions(cb), createAdoption(data), setAdoptionStatus(id,status), deleteAdoption(pet), watchAdoptionRequests(petId,cb), sendAdoptionRequest(petId,message,profile), removeAdoptionRequest(petId,uid), watchActiveAds(cb), watchAllAds(cb), watchMyAdRequests(cb), watchAllAdRequests(cb), createAdRequest(d), decideAd(req,approve), setAdPaused(id,paused), extendAd(id,expiresAt,days), removeAd(id,uid).
Storage: uploadFile(folder,file,onProgress)->{url,path}, deleteFile(path), testMediaUpload(kind), runHealthCheck().
Admin: watchPath(path,cb), watchRoomArchive(roomId,cb), resolveReport(id), purgeArchive(keys), logAdminView(roomId), logAdminOpen(scope,id), adminGetFriendships(uid), adminGetUserGroups(uid), adminGetGroup(gid), watchRoomMessagesFor(scope,id,cb).
Re-exported RTDB primitives: ref,get,set,update,remove,push,onValue,onChildAdded,onChildChanged,onChildRemoved,onDisconnect,query,orderByChild,equalTo,limitToLast,serverTimestamp, and `db`.
ui.js helpers: $, $$, esc, toast, busy(btn,on,label), errMsg, clamp, COLORS, LIMIT_MB, initials, accentOf, posStyle, avatarHTML(profile,extra), timeAgo, timeOf, fileKind, pop(el), openDialog(sel), wireDialogs, askText({title,placeholder,required,okText}), shrinkImage(file,maxSide,quality), friendlyError.

## 6. SOUNDS & ICONS (frozen names)
playSound names: click, nav, reaction, open, close, send, receive, like, requestSent, accepted, uploadDone, posted, callConnected, callEnd, error, warning, confirm, loginOk, loginFail. Ringtone: startRing(kind), stopRing(), startRingback(), stopRingback(), ping(), unlockSound() (ringtone.js).
Icon names (icons.js): chat, sparkle, paw, megaphone, user, shield, power, phone, hangup, video, camoff, info, back, more, heart, image, film, music, mic, micoff, stop, send, search, plus, check, x, copy, flag, users, trash, lock, unlock, pen, eraser, undo, pin, calendar, userplus, chevright, record, bell, calc, type, line, arrow, rect, circle, grid, gear, volume, device, key, sun, cloud, cloudsun, rain, storm, snow, fog, droplet, wind, dot. **S1 adds**: smile, paperclip, forward, reply, mute, pin (exists), checkdouble, globe, moon, palette, leave, add, minus.

## 7. ENVIRONMENT (S1 improves environment.js — keep logic)
Open-Meteo (free, no key) + BigDataCloud reverse geocode. envcore.js exports WEATHER, describeWeather(code)->{label,icon,family}, partOfDay(hour), atmosphereClasses(hour,family)->[envClass, wxClass], CITIES. Apply classes to <html>. Clock updates every 30s; weather refresh every 10 min (cache in localStorage key "emarni-weather"). Geolocation only via user tap (#envPop "Use my location"); manual city fallback = CITIES dropdown. Respect prefs.envTheme (off => no env/wx classes, neutral dark). Never change text contrast — env/wx classes may only adjust subtle background gradients/glow.

## 8. RESPONSIVE
Desktop (data-device=desktop): sidebar + workspace + right panel. <1024px: right panel auto-hidden. <=760px or coarse pointer (data-device=phone): sidebar hidden, bottom nav shown, single panel, safe-area padding (`env(safe-area-inset-*)`), no horizontal overflow (`overflow-x:hidden` on body). S1 owns all layout CSS.

## 9. DELIVERABLE FOR EACH SHARD
Edit your owned files in place. At the end, report: (a) files changed, (b) any DOM id/class you introduced that S1/integration must know, (c) any deviation from this contract and why, (d) self-check: your module's init() runs without throwing, no use of removed APIs. Do NOT run a server or zip — integration is done centrally.
