const crypto = require('crypto');

// Easypaisa Open API hosted checkout page.
// IMPORTANT: Easypaisa's merchant integration docs have varied between versions —
// confirm these exact field names, the hash string format, and the checkout URL
// against the specific PDF Easypaisa gave you with your Store ID / Hash Key.
// Test against their UAT/sandbox environment before going live.

const PRICE_PKR = 199; // keep in sync with the paywall page copy

function pad(n) { return String(n).padStart(2, '0'); }

function easypaisaExpiry(d) {
  // format commonly required: "yyyyMMdd HHmmss"
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    ` ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function computeHashedReq(fields, hashKey) {
  const sortedKeys = Object.keys(fields).sort();
  const pairs = sortedKeys.map((k) => `${k}=${fields[k]}`);
  const raw = pairs.join('&');
  return crypto.createHmac('sha256', hashKey).update(raw).digest('base64');
}

module.exports = (req, res) => {
  try {
    const storeId = process.env.EASYPAISA_STORE_ID;
    const hashKey = process.env.EASYPAISA_HASH_KEY;
    const checkoutUrl = process.env.EASYPAISA_CHECKOUT_URL; // sandbox or production URL from your integration doc
    const returnUrl = process.env.EASYPAISA_RETURN_URL || `https://${req.headers.host}/api/checkout/easypaisa-callback`;

    if (!storeId || !hashKey || !checkoutUrl) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain');
      res.end('Easypaisa is not configured yet. Set EASYPAISA_STORE_ID, EASYPAISA_HASH_KEY, EASYPAISA_CHECKOUT_URL in Vercel env vars.');
      return;
    }

    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour to complete payment
    const orderRefNum = 'CE' + now.getTime();

    const fields = {
      storeId,
      amount: String(PRICE_PKR),
      postBackURL: returnUrl,
      orderRefNum,
      expiryDate: easypaisaExpiry(expiry),
      autoRedirect: '1',
    };

    const merchantHashedReq = computeHashedReq(fields, hashKey);

    const allFields = { ...fields, merchantHashedReq };
    const inputsHtml = Object.entries(allFields)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}">`)
      .join('\n');

    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>Redirecting to Easypaisa…</title></head>
<body style="background:#0b0706;color:#ece1cc;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p>Redirecting to Easypaisa…</p>
  <form id="ep" action="${checkoutUrl}" method="POST">${inputsHtml}</form>
  <script>document.getElementById('ep').submit();</script>
</body></html>`);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Checkout initiation failed: ' + err.message);
  }
};
