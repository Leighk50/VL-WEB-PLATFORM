# Village Limits TV 1.2.0 release candidate

One signed widget serves all six rooms. The application identity remains VLRoomTest.RoomTest so existing installations can update. Room numbering is no longer embedded in settings.js.

## Prepare and sign

1. Back up the existing author certificate and signed 0.4.8 package.
2. Run install.ps1 on the existing VillageLimits Tizen project and refresh it.
3. Keep the existing author certificate. Include the target TVs' DUIDs in the Samsung distributor certificate used for signing. Check this in Certificate Manager; do not assume the Room 3 certificate covers the other TVs.
4. Build Signed Package and supply the .wgt for version/source verification.
5. After the signed shared package is published, use https://www.villagelimits.co.uk/tv/install/ on each TV. The shared address currently serves the working 1.0.0 package. It will be switched to 1.1.0 only after the newly signed package is verified and published.

## Assign and enable

On first launch, staff select Room 1–6 using the remote and OK. The assignment is saved in the app's local storage. It is separate from Airtime's MAC verification. Enable that room in /admin/tv. Existing room messages and enabled settings remain unchanged during deployment. New configurations start with every room disabled.

If app storage is cleared, the TV asks for its room again. Diagnostics has a change-room action for staff. Each room uses a separate content URL and cache key. Preview requests are not counted as TV connection activity.

## Test before rollout

Update Room 3, select Room 3, and check version 1.1.0. Then install the same package on a second room and select that room. Check welcome text and correct room label, automatic launch after power on, embedded TV, channel up/down, GUIDE before and after channel selection, Return/Home behaviour, Airtime launch/return, portrait video, menus, event posters, and all guest information sections. Disconnect internet temporarily and verify saved guest content still displays; cloud video requires network access.

Check reported version and last feed request in the back office. Reporting is not proof of what the screen shows and resets on server restart. Verify the picture and remote behaviour physically on both TVs before installing on the remaining rooms.

## Recovery

The original https://www.villagelimits.co.uk/tv/install/room3/ installer remains 0.4.8 for the existing Room 3 installation. Keep its signed package and certificate backup. Other TVs may need a recovery package signed for their DUIDs; do not assume the pilot package will install on every TV.

## Explore Woodhall Spa

Version 1.1.0 adds 17 local attractions, aviation and museum visits, and nearby days out. QR codes link to official visitor information. The website imports the Kinema’s published film/performance entries centrally and caches them for one hour. Today and tomorrow use Europe/London dates. Refresh happens in the background and fails closed: stale listings are hidden and the official booking QR remains available. Test both date buttons, category navigation and QR scanning on a physical TV.

## Staff access in 1.1.1

Diagnostics is hidden from the guest navigation. On Welcome, press 0 four times, then enter the staff PIN with the remote number buttons or the on-screen keypad. Return cancels. Access locks again on leaving Diagnostics or when the app is hidden. Room reassignment is available only after unlocking staff access. Test the shortcut and both keypad input methods on a physical TV.

The Kinema day switch sits directly beside its tab and offers Tomorrow while viewing Today, or Today while viewing Tomorrow. The signed shared installer remains 1.1.0 until a verified 1.1.1 package is published.

## Personal guest welcomes in 1.2.0

Import the existing booking report through Guest SMS as usual. The import saves only the name, room and stay dates for TV welcomes; it does not send messages. Full names need either separate first/last name columns or a full guest-name column. Check-in and checkout columns are required. Incomplete/ambiguous entries are reported and skipped. Existing stays are retained until checkout; matching cancellations remove their welcomes.

Start the new client on each physical TV. Open staff Diagnostics and note its private guest welcome code. Match that code and room in /admin/tv under Private guest welcomes and approve the TV once. Revoke access if a TV is removed; a change of room assignment requires approval again. Browser previews never retrieve guest names.

Guest names are fetched separately using the TV’s private random token and are not stored in the public feed or TV offline cache. They expire at 10am on weekday departure dates, 11am at weekends, in Europe/London time. The generic welcome is used for missing, expired, conflicting or inaccessible bookings. Test with a booking before rollout. The signed shared installer stays at 1.1.0 until the 1.2.0 package is verified and published.

## 1.2.2 checkout welcome
Guest names switch at the UK checkout cutoff rather than midnight: Monday–Friday 10am, Saturday–Sunday 11am. On departure day the welcome screen retains the outgoing guest name and shows a thank-you, checkout time and instruction to leave keys in the room and close the door. Server timing fix benefits existing clients; the reminder display requires signed client 1.2.2. Preserve the application ID, author certificate and room assignment. Shared installer remains at its published signed version until 1.2.2 is supplied and verified.
