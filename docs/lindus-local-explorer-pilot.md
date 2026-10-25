# Lindus Local Explorer — Room 1 pilot

Status: isolated development branch; not deployed.

## Existing functionality to preserve
- Kinema in the Woods: `hotel-tv-explore.js` live today/tomorrow film times, Kinema tab, QR booking link and fallback.
- Existing `explore.attractions` data, current village/aviation/days categories, remote control navigation, room assignment, approvals, welcome, movies, channel selection, music and shared signed widget 1.2.11.
- Do not modify `hotel-tv-install` or production installer during this pilot.

## Proposed incremental implementation
1. Add separately approved, Lindus-authored attraction/event records in a new persistent local-explorer store; no wholesale copying of WOW Lincs images or descriptions.
2. Use an allowlist of categories: heritage, museums, attractions, walks, nature, family activities, local events. Explicitly reject restaurants, pubs, cafes, bars, takeaways, food-led events and competing accommodation, including venue-associated promotions.
3. Draft new items by default; existing approved attractions may receive safe metadata refreshes. Require human approval for new events and places.
4. Events require start/end dates and disappear when expired. Do not infer availability, opening hours or travel time.
5. Expose new records as additive content in the existing `explore` response, without changing `cinema` or removing `attractions`.
6. Add optional Local Events and Walks tabs to the TV client, leaving Kinema first and unchanged.
7. Run regression tests and test preview, then Room 1 only; distribute to other rooms only after explicit sign-off.

## Source and rights
WOW Lincs is a discovery source, not an embedded site. Verify availability of a permitted feed or permission before automated reuse. Use independently written descriptions and appropriately licensed images.

## Acceptance checks
- Kinema live showtimes, today/tomorrow toggle and QR work as before.
- No competing food/drink or lodging promotion appears in local pages or welcome spotlight.
- Approval, expiry, fallback, safe rendering and remote navigation work.
- Existing TV installation, signing and update mechanism remain unchanged until pilot validation.

## Implemented pilot (25 October 2026)
- Independent `tv-local-explorer.json` in existing durable TV storage, with the same recovery backup protections. No changes to approvals or room records.
- Staff editor at `/admin/tv/local-explorer`: save draft/withdraw or approve, with permission checks, same-origin writes and revision protection. Category and venue review exclude competing promotions; this is curated publication, not an unattended scraper.
- Three initial drafts: Spa Trail, Heritage Trail and a dated short mat bowls session. Original summaries; no copied photographs. New records need explicit review. Events expire server-side and are filtered again in the pilot client, including cached data.
- Additive feed data only when Room 1 explicitly sends `localExplorerPilot=1`. Normal feeds and all other rooms are unchanged. A corrupt Explorer store leaves Kinema and the ordinary feed available.
- Browser pilot at `/tv/local-explorer-pilot/`. Client source extracted from the verified signed 1.2.11 package, with separate preview cache keys, two additional tabs and unchanged Kinema controls. Preview media is read from the existing signed archive; the installer is untouched. Existing competing hotel heritage listing is omitted from the pilot and its welcome spotlight.
- New items without an existing QR display their visitor URL; generating QR codes for newly approved destinations is a remaining enhancement. Image upload is not included; existing attraction images remain.

## Verification and next deployment step
Full `npm test` includes Local Explorer tests for rejected promotions, approval/withdrawal, event expiry, recovery, staff access, stale writes, feed isolation, fallback and signed media continuity. DOM rendering and remote-style action tests cover the new tabs and the unchanged Kinema today/tomorrow toggle.

Development branch only: no production deploy, no widget version bump and no signed widget publication. The headless browser download was unavailable in this environment, so visual browser review is still pending. Next prepare an isolated hosted preview, verify layout and physical remote behaviour, then sign and test in Room 1. Retain the signed 1.2.11 widget and package identity; do not rebuild the pilot from the older `hotel-tv-client` source. All-room distribution still requires the agreed Room 1 sign-off.

## WOW Lincs content expansion
The curated seed now contains 22 review records: 8 walks/nature ideas, 7 museum/days-out ideas and 7 dated activity sessions. It includes the two Viking Way loops, Water Rail Way, airfield reserve, Roughton Moor Wood, Wolds Wildlife Park, Bubblecar Museum, Cadwell Park, Lincolnshire Wildlife Park, Gunby and karting. New activities include crochet, Active Explorers and pottery sessions. All remain drafts in the server seed.

Each destination has a generated QR, original short description and discovery source. WOW Lincs photographs are not copied. The review preview shows these records explicitly without changing live approvals. New days-out records appear before existing ones, and event sessions sort by start time. Restaurants, pubs, competing accommodation and their hosted promotions are omitted. This is a curated snapshot checked 25 October 2026; no unattended source import is enabled.

## All-room release approved — 1.2.12
The user authorised all-room publication. The 22 selected records are approved in the initial catalogue, and approved Explorer data is additive in each enabled room feed. Saved staff records are retained. Canonical `hotel-tv-client` now contains the 1.2.11-derived client with Local Explorer and shared guest-page navigation, reporting version 1.2.12. Its app/package identity and production room/token keys remain unchanged.

The shared installer must continue serving signed 1.2.11 until the user's existing Tizen certificate signs 1.2.12. `hotel-tv-client/prepare-1.2.12.ps1` updates the Windows project, backs up replaced files, retrieves and hashes the exact 1.2.11 media and requests signing with the existing VillageLimits profile. No keys are bundled or transmitted. After the user supplies the signed WGT, verify version/identity, author certificate continuity and archive integrity before changing the manifest and package together. Do not uninstall or clear TV storage.
