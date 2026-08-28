// Where the web portal lives — used in emailed links and Stripe redirects.
// Kept apart from stripe.ts so functions that only need the URL (org-invite)
// never load the Stripe client.
export const PORTAL_URL = (
  Deno.env.get('PORTAL_URL') ?? 'https://app.eventinsights.com.au'
).replace(/\/$/, '');
