/*
  Kirenga Blog — Production-ready Express Server
  
  Features:
    ✅ COOP header (fixes Firebase OAuth popup warning)
    ✅ Claude API proxy at /api/chat (keeps API key server-side)
    ✅ reCAPTCHA Enterprise verification at /api/verify-recaptcha
    ✅ Static file serving
    ✅ SPA fallback

  SETUP:
    1. npm install express
    2. Set environment variables in PowerShell:
         $env:ANTHROPIC_API_KEY  = "sk-ant-..."
         $env:RECAPTCHA_SECRET   = "your-recaptcha-enterprise-api-key"
         $env:RECAPTCHA_SITE_KEY = "6LfNutMsAAAAABlh3bxByzb1aitxFfCJrBAvBYTX"
    3. node server.js
    4. Open http://localhost:5500
*/

const express = require('express');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 5500;

const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY  || '';
const RECAPTCHA_SECRET   = process.env.RECAPTCHA_SECRET   || '';
const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || '6LfNutMsAAAAABlh3bxByzb1aitxFfCJrBAvBYTX';
const RECAPTCHA_PROJECT  = 'kirenga-blog'; // your Firebase/GCP project ID

app.use(express.json({ limit: '1mb' }));

/* ── CORS + COOP headers ─────────────────────────────────────── */
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy',  'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.setHeader('X-Content-Type-Options',       'nosniff');
  next();
});

/* ════════════════════════════════════════════════════════════════
   /api/chat  — Claude API proxy
   Keeps your Anthropic API key off the browser.
════════════════════════════════════════════════════════════════ */
app.post('/api/chat', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    console.error('[/api/chat] ANTHROPIC_API_KEY not set');
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server.' });
  }
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[/api/chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════════
   /api/verify-recaptcha  — reCAPTCHA Enterprise verification
   Called from the browser after grecaptcha.enterprise.execute().
   Returns { success: true, score: 0.9, action: 'signup' } etc.
════════════════════════════════════════════════════════════════ */
app.post('/api/verify-recaptcha', async (req, res) => {
  const { token, action } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'No token provided.' });

  try {
    // reCAPTCHA Enterprise uses the REST API with your API key
    const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${RECAPTCHA_PROJECT}/assessments?key=${RECAPTCHA_SECRET}`;
    const upstream = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: {
          token,
          siteKey:        RECAPTCHA_SITE_KEY,
          expectedAction: action || 'submit',
        },
      }),
    });
    const data = await upstream.json();

    if (!data.tokenProperties?.valid) {
      return res.json({ success: false, score: 0, reason: data.tokenProperties?.invalidReason || 'invalid' });
    }

    const score = data.riskAnalysis?.score ?? 0;
    // Score >= 0.5 is considered human by Google's recommendation
    res.json({ success: score >= 0.5, score, action: data.tokenProperties?.action });
  } catch (err) {
    console.error('[/api/verify-recaptcha]', err.message);
    // On error, allow through so reCAPTCHA outage doesn't break your site
    res.json({ success: true, score: 0.5, error: err.message });
  }
});

/* ── Static files ────────────────────────────────────────────── */
app.use(express.static(path.join(__dirname)));
app.use((req, res) => res.sendFile(path.join(__dirname, 'index.html')));

/* ── Start ───────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🚀  Kirenga Blog  →  http://localhost:${PORT}`);
  console.log(`    COOP header         ✅`);
  console.log(`    Claude /api/chat    ${ANTHROPIC_API_KEY  ? '✅ ready' : '⚠️  set ANTHROPIC_API_KEY'}`);
  console.log(`    reCAPTCHA /verify   ${RECAPTCHA_SECRET   ? '✅ ready' : '⚠️  set RECAPTCHA_SECRET'}`);
  console.log();
});
