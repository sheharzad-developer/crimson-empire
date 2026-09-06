const crypto = require('crypto');
const { createAccessToken, accessCookieHeader } = require('../_lib/access-token');

// Receives JazzCash's POST-back after the customer completes (or abandons/fails)
// payment on JazzCash's hosted page. We MUST re-verify pp_SecureHash ourselves here —
// never trust pp_ResponseCode alone, since a callback URL can be hit by anyone.

function computeSecureHash(fields, integritySalt) {
  const sortedKeys = Object.keys(fields).sort();
  const values = sortedKeys.map((k) => fields[k]);
  const hashString = integritySalt + '&' + values.join('&');
  return crypto.createHmac('sha256', integritySalt).update(hashString).digest('hex').toUpperCase();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function parseFormBody(raw) {
  const out = {};
  new URLSearchParams(raw).forEach((v, k) => { out[k] = v; });
  return out;
}

function failPage(res, message) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>Payment not completed</title></head>
<body style="background:#0b0706;color:#ece1cc;font-family:Georgia,serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:0 1.5rem;">
  <h1 style="font-family:Georgia,serif;">Payment not completed</h1>
  <p>${message}</p>
  <p><a href="/paywall.html" style="color:#c6a26b;">Try again</a></p>
</body></html>`);
}

module.exports = async (req, res) => {
  try {
    const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT;
    if (!integritySalt) {
      failPage(res, 'Payment gateway is not configured.');
      return;
    }

    let fields;
    if (req.method === 'POST') {
      const raw = await readBody(req);
      const ct = req.headers['content-type'] || '';
      fields = ct.includes('application/json') ? JSON.parse(raw || '{}') : parseFormBody(raw);
    } else {
      const url = new URL(req.url, `https://${req.headers.host}`);
      fields = Object.fromEntries(url.searchParams.entries());
    }

    const receivedHash = fields.pp_SecureHash;
    const toVerify = { ...fields };
    delete toVerify.pp_SecureHash;

    if (!receivedHash) {
      failPage(res, 'Malformed response from JazzCash.');
      return;
    }

    const expectedHash = computeSecureHash(toVerify, integritySalt);
    if (expectedHash !== receivedHash) {
      failPage(res, 'Could not verify this transaction (hash mismatch). If money was deducted, contact support with your transaction reference.');
      return;
    }

    // JazzCash: "000" means success on the Hosted Checkout Page flow.
    if (fields.pp_ResponseCode !== '000') {
      failPage(res, `Transaction was not successful (${fields.pp_ResponseMessage || fields.pp_ResponseCode || 'unknown reason'}).`);
      return;
    }

    const token = createAccessToken({ orderRef: fields.pp_TxnRefNo, method: 'jazzcash' });
    res.setHeader('Set-Cookie', accessCookieHeader(token));
    res.statusCode = 302;
    res.setHeader('Location', '/');
    res.end();
  } catch (err) {
    failPage(res, 'Something went wrong verifying your payment: ' + err.message);
  }
};
