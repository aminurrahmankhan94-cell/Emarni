# EMARNI v9 — Shell & Design System Changelog (S1)

## v9.0.0 (S1 SHELL rebuild)

### Design system (style.css full rewrite)
- Frozen CSS variables per CONTRACT §2: dark default on `:root`, `html[data-theme="light"]` overrides. Red `#EF4444` used sparingly (actions/active/badges only).
- Typography: Space Grotesk headings + Hind Siliguri body (Google Fonts already linked).
- Shared components: `.btn`/`.btn-primary`/`.btn-ghost`/`.btn-icon` with hover/press/focus/loading/disabled/success states; `.input`/`.textarea`; `.card`; `.badge`; `.switch`; `.avatar`+`.avatar.online` (pulse); `.empty-state`; `.skeleton` (shimmer); `.dialog`+`.dialog-overlay`; `.toast`; `.chip`; `.tab`; `.progress`; `.nav` with active red indicator + glow; `.nav-badge`.
- Layout: collapsible sidebar (264px → 72px via `.collapsed`), 56px topbar, workspace, 300px collapsible right panel, phone bottom nav with safe-area padding, `overflow-x:hidden` on body.
- Splash screen with animated brand kite (brand.js `brandSVG()`): float + tail-sway + letter-pop + progress meter.
- Auth screen: login/register/forgot tabs, EMARNI branding, `[data-brand]` kite.
- Env bar styling: time/date/city/icon/temp/humidity/wind + popover.
- Ambient classes: `.env-morning/.env-afternoon/.env-evening/.env-night` + `.wx-clear/.wx-cloud/.wx-rain/.wx-snow/.wx-storm/.wx-fog` — subtle background radial gradients/glow ONLY (via `body::before`), never reduce text contrast. Toggled by `html.no-fog`.
- Animations (transform/opacity only, 60fps): view transition, message arrival (`.msg-in`), modal open/close, skeleton shimmer, typing dots, online pulse, card-in. All gated by `html.reduce-motion`.
- Legacy module-markup classes retained (`.rail/.side/.list/.item/.composer/.msgs/.pet-grid/.ad-grid/.mon-grid/.call/.ring/.board-panel/.pb-*` etc.) so existing S2–S5 markup keeps working until their CSS files land.

### Shell (index.html rebuild per CONTRACT §3)
- `#splash`, `#authScreen` (login/register/forgot), `#appShell`.
- `aside#sidebar`: all 12 nav items (chats/friends/people/feed/groups/adopt/ads/notifications/settings/about/monitor/me) + `#signOutBtn` + `#sidebarToggle`; `monitor` hidden by default.
- `header#topbar`: `#envBar` (`#envTime/#envDate/#envCity/#envIconWrap/#envTemp/#envHumidity/#envWind` + `button#envBtn`), `#globalSearch` input + `#searchResults` dropdown, `#notifyBell` + `#notifyBadge`, `#rightToggle`, `#avatarBtn`.
- `div#envPop` (city dropdown `#envCitySel` from envcore.CITIES + `#envUseLoc` "Use my location").
- `main#workspace`: 12 `section.view[data-view]` each with `div.view-inner#XView` (chats, friends, people, feed, groups, adopt, ads, notifications, settings, about, monitor, me).
- `aside#rightPanel`: slots `#rpOnline` (heading "Friends")/`#rpRecent`/`#rpSuggest`/`#rpTrending` with empty inner containers.
- `nav#bottomNav` (phone: chats, feed, adopt, ads, me + More) + `#moreSheet`.
- `#callLayer` (fixed; contains call/ring markup for backward compat — S4 may replace).
- `#notifyDrawer` (empty aside + close; S5 owns inner markup).
- `#dialogRoot` with all shared dialogs (dlgPost/dlgNotice/dlgText/dlgGroup/dlgInfo/dlgList/dlgPet/dlgAdopt/dlgAd).
- `#toastRoot` containing `#toast` (ui.js target). `#noticeStack` retained (notify.js target). `#userView` overlay retained (people.js openUser).
- Feature CSS links added after style.css: `chat.css?v=9`, `social.css?v=9`, `calls.css?v=9`, `market.css?v=9`.
- Script: `<script type="module" src="app.js?v=9">`.

### Router & wiring (app.js rewrite)
- `go(view)` toggles `.on` on `[data-view]`/`[data-nav]`, calls module show-hooks (`onProfileShow`/`onMarketShow`/`onMonitorShow`/`onSettingsShow`), renders friends/groups/notifications/people views.
- Module inits (each try/catch guarded): initPrefs, initSounds, initRingtone (new), initEnvironment, initChat, initFeed, initPostbox, initPeople, initProfile, initCalls, initMarket, initNotify, initSettings, initMonitor (guarded by `checkAdmin(user) === "ok"`).
- Auth: watchAuth → show `#authScreen` or `#appShell`; login/register/forgot forms call `registerAccount`/`signInAccount`/`sendResetEmail`; `#signOutBtn` (+ mobile) calls `signOutAccount`.
- `#notifyBell` toggles `#notifyDrawer`; `#notifyBadge` = `totalUnread()` + pending friend requests.
- `#avatarBtn` → `go('me')`. Sidebar collapse + right panel toggle + bottom-nav More sheet wired.
- Global unified search (debounced 250ms): searches cached userDirectory (name/emarniId), userGroups, posts (text), adoptions (pet name/species), active ads (title). Results grouped by category with icons; click opens the right view (openUser/openGroup/feed/adopt/ads).
- Admin gating: `checkAdmin` reveals `#monitorNav` + `#monitorNavMore` and calls `initMonitor`.
- Watchers retained: directory, friendships, sent/incoming requests, userGroups, plus posts/adoptions/ads caches for search. `syncRoomsNow` feeds notify.js.

### prefs.js (extended)
- DEFAULTS add: `theme:"dark"` (dark|light|auto), `soundNotify:true`, `soundMessages` (alias of `sound`, kept in sync), `desktopNotify:true`, `messagePreview:true`. Key stays `"emarni-prefs-v2"` (backward compatible).
- `resolvedTheme()` export; `data-theme` applied on `<html>`; `auto` follows `prefers-color-scheme` via matchMedia listener.

### environment.js (improved)
- Clock tick every 30s (was 1s). Weather refresh every 10 min, TTL 10 min, localStorage cache key `"emarni-weather"`.
- Geolocation only on `#envUseLoc` tap. Manual city from `envcore.CITIES` dropdown.
- Applies `env-*`/`wx-*` classes via `atmosphereClasses()`; respects `prefs.envTheme` (off = neutral, classes removed).
- Fills `#envTime/#envDate/#envCity/#envTemp/#envHumidity/#envWind` + `#envIconWrap` (hydrates `<i data-icon>`) via `describeWeather`. Legacy `#envIcon/#envHum/#envCond` also filled for compat.

### icons.js (extended)
- Added: smile, paperclip, forward, reply, mute, checkdouble, globe, moon, palette, leave, add, minus (stroke paths, 24×24, same style).

### ui.js (extended helpers only)
- Added `debounce(fn, wait)` and `outsideClose(selector, onClose)`. Existing helpers unchanged.

### settings.js (rebuilt dashboard)
- Appearance: theme (dark/light/auto segmented), envTheme, reduceMotion, compact, largeText, screen layout.
- Sound: master/messages/notifications/calls/UI — each a switch + Test button calling `playSound(name, {force:true})`.
- Notifications: desktop enable via `enableNotifications()`, in-app cards, messagePreview.
- Profile/Account: edit profile → `go('me')`, copy Emarni ID, password reset, sign out.
- Media/Health: testMediaUpload image/video/audio + runHealthCheck buttons with diagnostic results.

### brand.js, sw.js
- Unchanged (kept per contract).

## Deviations / notes for integration
1. `#callLayer` contains v8 call/ring inner markup (`#callView`, `#ringView`, board tools) so current `call.js` keeps working. CONTRACT says S4 owns inner markup — S4 may clear/replace `#callLayer` contents. If removed, `call.js` (current) will throw on init.
2. `chat.js` does NOT export `onChatsShow()` (contract §3 expects it). Right-panel slots `#rpOnline/#rpRecent` will remain empty until S2 adds it. Noted; not edited.
3. `feed.js`/S3 does NOT export `onSocialShow()` (contract §3 expects it). `#rpSuggest/#rpTrending` remain empty until S3 adds it. Noted.
4. `checkAdmin(user)` returns the string `"ok"` (not boolean). Gated with `=== "ok"`.
5. View containers retain v8 inner markup (chat UI, feed list, adopt grid, ads, monitor, about) so existing modules render without console errors. Other shards may replace via `innerHTML` on `#XView`.
6. New DOM ids introduced (other shards may use): `#searchInput`, `#moreBtn`, `#moreSheet`, `#notifyDrawer`, `#notifyDrawerClose`, `#notifyDrawerContent`, `#rightToggle`, `#sidebarToggle`, `#avatarBtn`, `#envIconWrap`, `#envHumidity`, `#friendListFull`, `#groupListFull`, `#reqWrapFriends`, `#reqListFriends`, `#peopleSearchMain`, `#peopleResultsMain`, `#peopleDirList`, `#notifContent`, `#notifNavBadge`, `#rpOnlineList/#rpRecentList/#rpSuggestList/#rpTrendingList`, `#monitorNavMore`, `#signOutBtnMobile`, `#dialogRoot`, `#toastRoot`.
7. `people.js` expects `#peopleSearch`/`#peopleResults`/`#sideLists` (kept in chats side). The new people view uses separate `#peopleSearchMain`/`#peopleResultsMain`/`#peopleDirList` rendered by app.js.

## v9 Integration pass (orchestrator)
- Added `id="chats"` to the chats view section so chat.js (which queries `#chats`) mounts the v9 conversation list + composer.
- Notifications: removed the static `#notifyDrawer` shell so notify.js creates its own drawer with the correct inner list/badges/close controls; removed the conflicting bell-toggle handler in app.js (notify.js auto-wires `#notifyBell`); `#notificationsView` now contains `#notifyListFull` + `#notifyMarkAllFull` expected by notify.js.
- app.js: imports and calls `onChatsShow()` (chats view) and `onSocialShow()` (feed/people views) to populate the right-panel slots.
- Fixed a SyntaxError (extra `)`) in notify.js line 303 (`watchUserPosts` close).
- `#callLayer`: emptied and `hidden` by default — it was a full-screen black overlay because S1 had retained v8 call markup inside it while calls.css hides it only when `:empty`/`[hidden]`; call.js manages `layer.hidden` and builds its own UI on demand.
- Smoke test (Python http.server + Playwright, desktop 1440×900 + mobile 390×844): 0 page errors, 0 console errors, no horizontal overflow, bottom nav present on mobile, auth screen renders correctly. Firebase config, database.rules.json and storage.rules untouched.
