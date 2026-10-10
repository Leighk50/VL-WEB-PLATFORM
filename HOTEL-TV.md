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
