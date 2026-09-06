const crypto = require('crypto');

// JazzCash Hosted Checkout Page (HCP) integration.
// Docs: the field names/hash algorithm below follow JazzCash's published HCP guide.
// CONFIRM every field name and the checkout URL against the exact PDF JazzCash gave you
// with your merchant credentials — gateway integration details vary by merchant tier
// and do change between JazzCash's guide revisions. Test in their UAT/sandbox first.

const PRICE_PKR = 199; // keep in sync with the paywall page copy

function pad(n) { return String(n).padStart(2, '0'); }

function jazzCashDateTime(d) {
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function computeSecureHash(fields, integritySalt) {
  const sortedKeys = Object.keys(fields).sort();
  const values = sortedKeys.map((k) => fields[k]);
  const hashString = integritySalt + '&' + values.join('&');
  return crypto.createHmac('sha256', integritySalt).update(hashString).digest('hex').toUpperCase();
}

module.exports = (req, res) => {
  try {
    const merchantId = process.env.JAZZCASH_MERCHANT_ID;
    const password = process.env.JAZZCASH_PASSWORD;
    const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT;
    const checkoutUrl = process.env.JAZZCASH_CHECKOUT_URL; // e.g. sandbox or production HCP URL from your integration doc
    const returnUrl = process.env.JAZZCASH_RETURN_URL || `https://${req.headers.host}/api/checkout/jazzcash-callback`;

    if (!merchantId || !password || !integritySalt || !checkoutUrl) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'text/plain');
      res.end('JazzCash is not configured yet. Set JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_INTEGRITY_SALT, JAZZCASH_CHECKOUT_URL in Vercel env vars.');
      return;
    }

    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour to complete payment
    const txnRefNo = 'CE' + now.getTime();

    const fields = {
      pp_Version: '1.1',
      pp_TxnType: '',
      pp_Language: 'EN',
      pp_MerchantID: merchantId,
      pp_SubMerchantID: '',
      pp_Password: password,
      pp_BankID: '',
      pp_ProductID: '',
      pp_TxnRefNo: txnRefNo,
      pp_Amount: String(PRICE_PKR * 100), // JazzCash expects amount in paisas
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: jazzCashDateTime(now),
      pp_BillReference: 'crimsonempire',
      pp_Description: 'Crimson Empire - The Rise of Muqsit (eBook)',
      pp_TxnExpiryDateTime: jazzCashDateTime(expiry),
      pp_ReturnURL: returnUrl,
      ppmpf_1: '',
      ppmpf_2: '',
      ppmpf_3: '',
      ppmpf_4: '',
      ppmpf_5: '',
    };

    fields.pp_SecureHash = computeSecureHash(fields, integritySalt);

    const inputsHtml = Object.entries(fields)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}">`)
      .join('\n');

    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html>
<html><head><meta charset="utf-8"><title>Redirecting to JazzCash…</title></head>
<body style="background:#0b0706;color:#ece1cc;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
  <p>Redirecting to JazzCash…</p>
  <form id="jc" action="${checkoutUrl}" method="POST">${inputsHtml}</form>
  <script>document.getElementById('jc').submit();</script>
</body></html>`);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Checkout initiation failed: ' + err.message);
  }
};
