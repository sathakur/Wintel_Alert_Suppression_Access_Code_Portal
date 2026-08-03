# Alert Suppression Portal

Complete version with:

- Employee ID removed
- Portal access code removed
- Time-zone field retained
- Only `India Standard Time (IST)` shown
- Backend also enforces `India Standard Time`
- Supports up to 20 VM hostnames
- Requester name and requester email remain mandatory

## Required Static Web App environment variable

```text
LOGIC_APP_CALLBACK_URL
```

## Deployment

Push the files to the `main` branch. The included GitHub Actions workflow deploys the frontend and API to Azure Static Web Apps.

## Security note

The site and API are anonymous. Requester details are manually entered and are not independently verified.
