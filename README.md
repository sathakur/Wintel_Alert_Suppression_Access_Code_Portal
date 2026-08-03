# Wintel Alert Suppression Portal — Access-Code Pilot

This version removes Microsoft Entra sign-in and therefore does not require Azure Static Web Apps admin consent.

## Required Azure Static Web App environment variables

Add under **Static Web App → Settings → Environment variables → Production**:

- `LOGIC_APP_CALLBACK_URL` = complete Logic App HTTP POST URL
- `PORTAL_ACCESS_CODE` = strong private code

Do not commit either value to GitHub.

## Generate a strong access code

```powershell
-join ((48..57) + (65..90) + (97..122) |
  Get-Random -Count 32 |
  ForEach-Object {[char]$_})
```

## Deploy

Keep the repository secret `AZURE_STATIC_WEB_APPS_API_TOKEN`, then push these files to `main`.

```powershell
git add .
git commit -m "Use access-code portal without Entra consent"
git pull --rebase origin main
git push origin main
```

## Important limitation

Requester name, email, and employee ID are manually entered and cannot be independently verified. Use this only as a controlled pilot.
