# Wintel Alert Suppression Portal

Updated version:

- Employee ID removed.
- Portal access code removed.
- Time zone fixed to India Standard Time.
- Requester name and requester email remain mandatory.
- Supports 1 to 20 VM hostnames.

Required Static Web App environment variable:

```text
LOGIC_APP_CALLBACK_URL
```

`PORTAL_ACCESS_CODE` is no longer used.

Security note: the portal and API are anonymous, so requester details are manually entered and are not independently verified.
