# Lindus Local Print Service — staging

TILL-03 (Windows 10 Pro) is the proposed master till. The Xprinter XP-E260M is at 192.168.0.175, TCP port 9100.

Stage 1: install and test a local background worker with no Azure job consumption. Stage 2: add authenticated Azure print queue, durable acknowledgements and audit history. Never automatically replay an ambiguous print outcome.

The existing one-shot printer test is separate. Do not route real sales receipts through this service until Stage 2 passes validation.
