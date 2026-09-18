# Short links

songdrafts.com/r sends people to the homepage with Reddit tags attached, so the visit shows up in attribution and GA4.

To add one, copy the line in `redirects` in `vercel.json` and change the path and the campaign, for example `{ "source": "/unheard", "destination": "/?utm_source=newsletter&utm_medium=email&utm_campaign=unheard", "permanent": true }`.

Redirects run before the SPA rewrite on Vercel, so a new path works as soon as it deploys.
