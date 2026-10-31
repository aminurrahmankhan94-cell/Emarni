Emarni feature update
====================

This package keeps the existing root entry point (index.html) and existing Firebase auth/chat code.

Added in this update:
- Social feature navigation: feed, group chat, pet adoption, advertise, calls/classroom.
- Local preview interactions for creating posts, likes, comments, group names, adoption listings, and ad drafts.
- Profile customization dialog (display name and bio); photo/cover inputs are UI-only in this preview.
- Browser notification permission request button.
- New animated dark glass-style feature UI.

Important current limitations:
- New social content is stored in this browser's localStorage only; it is not shared with other users/devices.
- Media attachments are selected but not uploaded or rendered. Add Firebase Storage upload and database rules before production.
- Browser notifications require permission and a foreground-capable browser. Reliable background/mobile push requires Firebase Cloud Messaging, service worker, VAPID configuration, and server-side notification sending.
- Payment is a draft-only UI; no money is collected.
- Audio/video calls and classroom board are reserved placeholders; WebRTC signaling, TURN, and collaborative canvas are not configured.
- Existing Firebase database rules do not yet include new social collections. Review and publish secure rules before connecting shared data.

Run from the repository root as before: deploy/serve index.html with the existing Firebase project configuration. Do not open as file://; use GitHub Pages or a local web server so ES modules and Firebase work.
