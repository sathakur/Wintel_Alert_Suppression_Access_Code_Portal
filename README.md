# Alert Suppression Portal

This version includes:

- Requester email restricted to the exact domains `@capgemini.com` and `@fresenius.com`
- Email validation in the browser, managed API, and Logic App
- Key submission checks highlighted on the website
- 1–20 unique VM hostnames
- Minimum 45-minute lead time
- Maximum 24-hour suppression window
- India Standard Time only
- Change/incident number and reason required
- APR name format includes the change number

## Required Static Web App environment variable

```text
LOGIC_APP_CALLBACK_URL
```

## Change the approved email domains

The current examples are:

```text
capgemini.com
fresenius.com
```

Update the same values in all three locations:

1. `app/app.js` — `ALLOWED_EMAIL_DOMAINS`
2. `api/src/functions/submitSuppression.js` — `ALLOWED_EMAIL_DOMAINS`
3. Logic App parameter — `allowedEmailDomains`

The checks use exact domain matching. For example, allowing `capgemini.com` does not allow
`evilcapgemini.com` or `subdomain.capgemini.com`.

## Security note

The portal remains anonymously accessible. Restricting the submitted email domain
validates the text entered by the requester, but does not prove that the requester owns
that email address. Verified requester identity still requires an approved authentication
or internal access-control layer.
