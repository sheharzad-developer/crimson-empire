const crypto = require('crypto');
const { createAccessToken, accessCookieHeader } = require('../_lib/access-token');

// Receives Easypaisa's post-back after the customer completes (or abandons/fails)
// payment. Re-verify the hash ourselves — never trust a success flag alone, since
// this URL is publicly reachable.

function computeHashedReq(fields, hashKey) {
  const sortedKeys = Object.keys(fields).sort();
  const pairs = sortedKeys.map((k) => `${k}=${fields[k]}`);
  const raw = pairs.join('&');
  return crypto.createHmac('sha256', hashKey).update(raw).digest('base64');
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
    const hashKey = process.env.EASYPAISA_HASH_KEY;
    if (!hashKey) {
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

    const receivedHash = fields.merchantHashedReq;
    const toVerify = { ...fields };
    delete toVerify.merchantHashedReq;

    if (!receivedHash) {
      failPage(res, 'Malformed response from Easypaisa.');
      return;
    }

    const expectedHash = computeHashedReq(toVerify, hashKey);
    if (expectedHash !== receivedHash) {
      failPage(res, 'Could not verify this transaction (hash mismatch). If money was deducted, contact support with your order reference.');
      return;
    }

    // Confirm the exact success indicator field/value against your Easypaisa doc —
    // commonly "status" or "responseCode"; adjust if their guide names it differently.
    const success =
      fields.status === '0000' ||
      fields.status === 'SUCCESS' ||
      fields.responseCode === '0000';

    if (!success) {
      failPage(res, `Transaction was not successful (${fields.status || fields.responseCode || 'unknown reason'}).`);
      return;
    }

    const token = createAccessToken({ orderRef: fields.orderRefNum, method: 'easypaisa' });
    res.setHeader('Set-Cookie', accessCookieHeader(token));
    res.statusCode = 302;
    res.setHeader('Location', '/');
    res.end();
  } catch (err) {
    failPage(res, 'Something went wrong verifying your payment: ' + err.message);
  }
};
