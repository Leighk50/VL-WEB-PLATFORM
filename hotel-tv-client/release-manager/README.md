# Lindus Hospitality TV — release procedure (draft)
Repository: Leighk50/VL-WEB-PLATFORM
Live H.Browser installer: https://www.villagelimits.co.uk/tv/install/
Expected installer files: VillageLimits.wgt and sssp_config.xml.
Separate Room 3 recovery installer: /tv/install/room3/ — DO NOT overwrite.
Existing signing profile: VillageLimits (Tizen Studio at C:\tizen-studio).
Existing app identity: VLRoomTest.RoomTest / package VLRoomTest.

## Repeatable preparation
Download the release ZIP and run release-manager/Prepare-And-Sign.ps1 with -UnsignedZip <path> -Version <version>.
It refuses version/identity mismatches and refuses to overwrite an existing release directory. It outputs a signed WGT and SHA256 in ~/workspace/VillageLimits/releases/<version>/.
Never put author.p12, distributor.p12, passwords or tokens into GitHub.

## Publishing — intentionally disabled pending verification
The historical prepare-1.2.12.ps1 ends by asking for the signed WGT to be uploaded to chat for publication. No proven unattended Windows-to-website publishing command has been recovered. Do not claim that signing publishes the app. Do not add GitHub/Azure upload credentials without reviewing existing deployment code and secret handling.

Before implementing publishing: identify actual server route, storage of WGT bytes, manifest format, and existing deploy trigger. Verify the live release hash and keep a byte-for-byte rollback copy. Stage a pilot without changing the shared installer if possible. The shared manifest serves all TVs: updating it is NOT Room-1-only. On rollout, keep app ID and author certificate; do not uninstall, clear app data, or erase approval tokens. Verify Room 1, then other TVs at restart, monitoring guest assignment and media.

## v1.2.14 status (2026-11-06)
Signed locally by user: Village Limits Hotel TV.wgt, 34,349,342 bytes. Not yet verified through an accessible upload; not published.
