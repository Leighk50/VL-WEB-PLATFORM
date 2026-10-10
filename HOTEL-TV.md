# Village Limits hotel TV pilot

## Cloud routes

- `/admin/tv`: TV dashboard; uses the existing website login. Owners and users with Website Details permission can manage it.
- `/api/admin/tv`: protected GET/PUT settings with ETag / If-Match conflict detection.
- `/api/tv/rooms/3/content`: guest-facing Room 3 JSON; compatible three-page payload plus structured menus and events.
- `/tv/index.html?room=3`: browser preview; does not launch Airtime or count as a connection request.

Room 3 is enabled by default. Enable other rooms only after testing. Menus and events are read from the current persistent website content on every request. Hidden menus/items/events and dated past events are excluded. No reservation records, key-safe codes, guest names or admin data are in the feed. Do not place private information in TV messages.

TV settings live in `CONTENT_DATA_DIR/hotel-tv.json` (the same persistent data directory used by the website, normally `/home/site/data`). Saving retains the preceding version in `hotel-tv.json.previous`; it does not write menu/event content. Concurrent dashboard saves require the revision obtained when opening the page. Network request timestamps are in-memory, reset on server restart, and do not verify actual TV display.

## Room 3 client

The `hotel-tv-client` folder contains source files, not a signed installation package. In the existing VillageLimits Tizen Studio project, preserve the tested application/package IDs and signing profile. Replace index.html/settings.js with these versions; add tv.js and tv.css. Set `VL_SERVER_ORIGIN` to the verified cloud HTTPS origin and `VL_ROOM_ID` to the room number. Keep the internet and application.launch privileges. Build/sign in Studio and run on the physical Room 3 TV.

The client polls every 30 seconds, renders text safely, supports remote arrow/OK/Return keys, finds Airtime by installed display name, and launches it only when Movies is selected. It returns to Welcome on visibility restoration and keeps the last valid feed in localStorage. A disabled-room response clears stored content. On network failure it retains saved content; this is information caching, not offline Airtime playback. TLS compatibility, localStorage survival through a real power cycle, Home/startup, and native channel/guide switching require device tests. No Watch TV shortcut is advertised until tested.

## Rollout checks

1. Open the cloud dashboard with the existing website login; preview Room 3 menus/events against website content.
2. Point the existing 0.1 test app at the Room 3 feed to check HTTPS connectivity before upgrading client source.
3. Install/run the 0.2 client, check remote navigation and Movies → Airtime → Return.
4. Edit a TV notice and a website dish price; confirm both update within 30 seconds without reinstalling.
5. Disconnect the network and verify last information remains; reconnect and verify fresh content.
6. Finish URL Launcher/Home and power-on installation; test channels/guide and a full reboot before enabling the other rooms.

## Validation

`npm test` includes feed filtering, public-data boundaries, auth/permission checks, input validation, same-origin writes, revision conflicts, persistent TV settings, existing menu persistence and enquiry tests. Full application route smoke tests use isolated temporary content, never production data.

## Version 0.3 Room 3 pilot

The compact side menu and fixed content area keep navigation and instructions within the screen. Dining has individual menu tabs; events have separate cards with guest-facing upload images. Right enters the content area; up/down scrolls, left/right chooses tabs, and Return returns to Welcome.

Watch TV uses the documented public `tizen.tvwindow` API with the tuner source and a full-screen window behind the app. The app stays running and Return hides that window and shows Welcome. API failures leave the menu available; a pending start can be cancelled with Return. Channel/number/Guide keys are not registered or intercepted by this app: native handling must be tested on HG49EJ690U. Do not enable other rooms until video, tuner picture/audio, channel changing, guide, Return, Home and power-on have been verified. Home still needs hospitality URL Launcher installation; this source upgrade does not configure it.

The dashboard accepts up to six titled HTTPS video links. Use a direct hosted MP4, initially H.264/AAC, and test the encoding and HTTPS certificate on Room 3. YouTube page links are not video file links. Clips play on demand with HTML5 video. OK pauses/resumes, left/right seeks ten seconds, and Return stops playback and returns to clips. Failed playback has an on-screen error and an escape route. Video clips are streamed; they are not downloaded for offline playback.

`hotel-tv-client/install-room3.ps1` downloads the new source into the existing Studio project, backs up changed files outside the project, preserves application/package IDs and adds the public `tv.window`, `tv.inputdevice` and `system` privileges to the existing config.xml. It does not sign or install an app. Refresh/build/sign and run with the existing tested certificate profile. Keep the backup until Room 3 has passed the device checks.

References: [TVWindow](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/tvwindow-api.html), [HTML5 video](https://developer.samsung.com/smarttv/develop/guides/multimedia/media-playback/using-video-elements.html).

Version 0.3.1 changes the presentation to white with dark green text and sans-serif headings. The original website logo-gold.png is bundled unchanged in the TV package; the installer downloads it alongside the screen files. The HTML frames the logo’s transparent margins without changing the artwork.

## Room 3 URL Launcher pilot (0.3.1)

Install address: `https://www.villagelimits.co.uk/tv/install/room3/`
The server serves the unchanged signed package uploaded by Leigh, stored as base64 to preserve its bytes through the text-only repository connector. SHA-256: `17465b5ff8e54a7ace4cf5a295bef6fe9c2e72c251013735b9a6e5bd6846ccbb`. Manifest version 0.3.1 and byte size 102599 match the package. No private signing keys are included.

Set hospitality H.Browser Mode ON, vendor Others, and use URL Launcher Settings > Install Web App with the install directory above. Do not use the browser preview or JSON feed address. Confirm installation before power cycling. URL Launcher certificate acceptance, power-on launch and Home-button return remain hardware checks for Room 3; do not roll out to other rooms yet.
