# Chef Specials SMS setup

The website now supports this workflow:

Chef SMS -> Webex inbound webhook -> protected draft -> admin review -> approve/publish -> `/menu/specials` -> print-ready A4 menu.

## Required Azure application settings

Set these on the Village Limits website application:

- `CHEF_SMS_NUMBERS` — comma-separated approved chef mobile number(s) in UK or E.164 format, for example `07700900123,+447700900456`. Only these senders can create a specials draft.
- `CHEF_SMS_WEBHOOK_SECRET` — a long random secret used to protect the inbound webhook.

For AI-assisted correction/parsing also set:

- `OPENAI_API_KEY`
- `SPECIALS_AI_MODEL` — the model ID chosen for this lightweight structured-text task.
- Optional: `SPECIALS_AI_API_URL` if using a compatible endpoint other than the default configured in the code.

If the AI settings are absent or the AI call fails, the website falls back to its rules-based parser. The admin page shows which parser was used.

## Webex inbound webhook

Configure the Webex Interact inbound/reply SMS callback to POST to:

`https://www.villagelimits.co.uk/api/webhooks/webex/inbound-sms?secret=YOUR_SECRET`

The handler accepts JSON or form-encoded payloads and recognises common sender/message field names. After the first real inbound Webex callback, verify the payload field mapping in Azure logs and adjust if the Webex account uses different field names.

## Chef message format

The message should start with `Specials` and contain section headings, dishes, prices and allergen lines, for example:

```
Specials

Starters
Pan fried Argentina prawns, cafe de Paris butter, lemon, flatbread £12
Allergens: milk, gluten, celery, fish, mustard, sulphites, crustaceans

Mains
Moules frites, British mussels, confit shallot, garlic, white wine, cream and fries £18
Allergens: milk, gluten, sulphites, molluscs

Dessert
Cheeseboard, Shropshire blue, British cheddar, brie, almond wedge, apricots and artisan crackers £9
Allergens: milk, gluten, nuts
```

The parser may correct obvious spelling, punctuation and culinary terminology. It does not silently invent missing allergens. Ingredient/allergen inconsistencies are shown as warnings that must be reviewed in Admin before publication.

## Admin workflow

Open Website Administration -> Chef Specials.

1. Refresh to load the latest chef message draft.
2. Review/edit section names, dishes, descriptions, prices and allergens.
3. Resolve every `Needs confirmation` allergen warning.
4. Save Draft.
5. Use `Approve & Publish` to replace the live Specials menu.
6. Use `Print Specials Menu` for the A4 Village Limits print version.

Publishing is blocked if a dish has no price, no allergens, or unresolved warnings.

The incoming draft is stored in the protected content data directory, not in the public website files. The live menu is only updated after an authenticated admin approves it.
