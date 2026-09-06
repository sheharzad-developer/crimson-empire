# crimson-empire

Crimson Empire is gated behind a JazzCash / Easypaisa paywall (Rs. 199). Readers land
on `paywall.html`, pay through JazzCash's or Easypaisa's own hosted checkout page,
and are redirected back to `/` once payment is verified — at which point `/api/book.js`
serves the actual `crimson-empire.html` content.

## How it works

- `paywall.html` — the page people see before paying.
- `api/checkout/jazzcash-start.js`, `api/checkout/easypaisa-start.js` — build the
  signed request and redirect the browser to JazzCash's / Easypaisa's hosted payment page.
- `api/checkout/jazzcash-callback.js`, `api/checkout/easypaisa-callback.js` — receive
  the gateway's post-payment callback, **re-verify the secure hash themselves**
  (never trust a "success" flag alone), and on real success set a signed, HttpOnly
  `ce_access` cookie valid for 365 days.
- `api/book.js` — checks that cookie before serving the book; no valid cookie means
  a redirect to `paywall.html`. `vercel.json` routes both `/` and `/crimson-empire.html`
  through this function, so there's no way to reach the book by guessing the filename.
- `api/_lib/access-token.js` — signs/verifies the access cookie with HMAC-SHA256,
  using a secret only your server knows.

## Required environment variables (set in Vercel → Project → Settings → Environment Variables)

Never commit real credentials to this repo — set these in Vercel's dashboard only.

| Variable | Purpose |
|---|---|
| `ACCESS_TOKEN_SECRET` | Any long random string. Used to sign the access cookie. Generate one with `openssl rand -hex 32`. |
| `JAZZCASH_MERCHANT_ID` | From your JazzCash merchant integration document. |
| `JAZZCASH_PASSWORD` | From your JazzCash merchant integration document. |
| `JAZZCASH_INTEGRITY_SALT` | From your JazzCash merchant integration document. |
| `JAZZCASH_CHECKOUT_URL` | The Hosted Checkout Page URL JazzCash gave you (sandbox first, then production). |
| `JAZZCASH_RETURN_URL` | Optional override; defaults to `https://<your-domain>/api/checkout/jazzcash-callback`. |
| `EASYPAISA_STORE_ID` | From your Easypaisa merchant integration document. |
| `EASYPAISA_HASH_KEY` | From your Easypaisa merchant integration document. |
| `EASYPAISA_CHECKOUT_URL` | The hosted checkout URL Easypaisa gave you (sandbox first, then production). |
| `EASYPAISA_RETURN_URL` | Optional override; defaults to `https://<your-domain>/api/checkout/easypaisa-callback`. |

## Before going live — please read

I built the JazzCash and Easypaisa integrations from their commonly published Hosted
Checkout Page field names and hashing method, but **payment gateway specs are
merchant-specific and do change**. Before accepting real money:

1. Open the exact integration PDF/guide JazzCash and Easypaisa gave you with your
   credentials, and confirm the field names in `api/checkout/*-start.js` and the
   success indicator in `api/checkout/*-callback.js` (currently `pp_ResponseCode`
   for JazzCash, `status`/`responseCode` for Easypaisa) match exactly.
2. Test the whole flow against their **sandbox/UAT** environment first — pay a small
   test amount, confirm the book unlocks, confirm a tampered/failed payment does not.
3. Only then switch `JAZZCASH_CHECKOUT_URL` / `EASYPAISA_CHECKOUT_URL` (and any other
   sandbox-specific vars) to production values.

The price (Rs. 199) is set in `PRICE_PKR` near the top of both
`api/checkout/jazzcash-start.js` and `api/checkout/easypaisa-start.js`, and in the
displayed price on `paywall.html` — update all three together if it changes.
