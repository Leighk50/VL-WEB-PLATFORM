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
