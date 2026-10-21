# Admin enquiries

Validated website enquiries are saved to the protected server data directory in `enquiries.json` before email is attempted. The form handler calls the shared store directly, so saving does not depend on which server entry point was used. A storage failure stops submission before email or a success confirmation.

The authenticated back-office list includes saved enquiries even if sending their email fails, with a clear warning. `sent` records mean Microsoft Graph accepted the email request; this does not prove inbox delivery. Existing records and dealt-with state are preserved. The public content API does not expose enquiry records.
