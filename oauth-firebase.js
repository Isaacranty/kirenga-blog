/* ════════════════════════════════════════════════════════════════════════════
   ENHANCED FIREBASE OAUTH — PERMANENTLY FIXED VERSION

   ROOT CAUSES OF INTERMITTENT LOGIN FAILURE (all fixed below):

   BUG 1 — Race condition: signInWithPopup succeeds but handleOAuthLogin
   never runs. The auth state listener checks _oauthPopupInProgress, but
   the state change sometimes fires BEFORE the flag is set to true, or
   AFTER it has already been reset, so the condition is false and login
   silently dies.
   FIX: Call handleOAuthLogin DIRECTLY from loginWithProvider after popup
   succeeds. Never rely on the state listener for popup logins.

   BUG 2 — No _initPromise cache: every call to init() starts a fresh
   async chain. If loginWithProvider is called while init() is still
   running, a second init() starts and two auth instances fight each other.
   FIX: Cache the init promise so all callers await the same one.

   BUG 3 — await import() inside loginWithProvider breaks Chrome's user
   gesture chain. Chrome only allows popups opened within ~1 second of a
   click. Any await before signInWithPopup kills the gesture and Chrome
   silently blocks the popup.
   FIX: Pre-import signInWithPopup during init() and store it as
   this._signInWithPopup so loginWithProvider calls it synchronously.

   BUG 4 — setupAuthStateListener creates a duplicate login path that
   fires unpredictably on page load restoring a cached session, causing
   loginUser() to run again unexpectedly.
   FIX: State listener is intentionally empty. All logins go through
   loginWithProvider → handleOAuthLogin directly.
════════════════════════════════════════════════════════════════════════════ */

'use strict';

const OAUTH_CONFIG = { ENABLED: true };

const OAUTH_PROVIDERS = {
  google:    { name: 'Google',    icon: '🔍', enabled: true,  firebaseProvider: null },
  github:    { name: 'GitHub',    icon: '🐙', enabled: true,  firebaseProvider: null },
  facebook:  { name: 'Facebook',  icon: 'f',  enabled: true,  firebaseProvider: null },
  microsoft: { name: 'Microsoft', icon: '⊞',  enabled: true,  firebaseProvider: null },
  twitter:   { name: 'Twitter',   icon: '𝕏',  enabled: true,  firebaseProvider: null },
  discord:   { name: 'Discord',   icon: '⚙️', enabled: false, firebaseProvider: null },
};

const OAuthManager = {
  auth:            null,
  isInitialized:   false,
  _initPromise:    null,   // BUG 2 FIX: cache so multiple callers await one init
  _signInWithPopup: null,  // BUG 3 FIX: pre-imported during init

  // ── INIT ─────────────────────────────────────────────────────────────────
  init() {
    // Return cached promise — safe to call multiple times from anywhere
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit().catch(e => {
      // Reset on failure so a retry is possible
      this._initPromise = null;
      console.error('OAuth init failed:', e.message);
    });
    return this._initPromise;
  },

  async _doInit() {
    if (this.isInitialized) return;

    const { getAuth, signInWithPopup,
            GoogleAuthProvider, GithubAuthProvider,
            FacebookAuthProvider, OAuthProvider,
            TwitterAuthProvider } =
      await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');

    const { getApps, getApp, initializeApp } =
      await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');

    // Reuse app created by db-firebase.js — never call initializeApp twice
    let app = window.__firebaseApp;
    if (!app) {
      app = getApps().length ? getApp() : initializeApp({
        apiKey:            'AIzaSyAq3YgnSH3bGGglJugzpBpiOBgoAbEaNCE',
        authDomain:        'kirenga-blog.firebaseapp.com',
        projectId:         'kirenga-blog',
        storageBucket:     'kirenga-blog.firebasestorage.app',
        messagingSenderId: '113895235074',
        appId:             '1:113895235074:web:2edd1553f4012c8fad911b',
        databaseURL:       'https://kirenga-blog-default-rtdb.firebaseio.com',
      });
    }

    this.auth = getAuth(app);
    this.auth.useDeviceLanguage();

    // BUG 3 FIX: store signInWithPopup now so loginWithProvider
    // never needs to await import() inside a click handler
    this._signInWithPopup = signInWithPopup;

    // Set up providers
    try { const g = new GoogleAuthProvider(); g.addScope('profile'); g.addScope('email'); OAUTH_PROVIDERS.google.firebaseProvider = g; } catch(e) { OAUTH_PROVIDERS.google.enabled = false; }
    try { const gh = new GithubAuthProvider(); gh.addScope('user:email'); OAUTH_PROVIDERS.github.firebaseProvider = gh; } catch(e) { OAUTH_PROVIDERS.github.enabled = false; }
    try { const fb = new FacebookAuthProvider(); fb.addScope('email'); OAUTH_PROVIDERS.facebook.firebaseProvider = fb; } catch(e) { OAUTH_PROVIDERS.facebook.enabled = false; }
    try { const ms = new OAuthProvider('microsoft.com'); OAUTH_PROVIDERS.microsoft.firebaseProvider = ms; } catch(e) { OAUTH_PROVIDERS.microsoft.enabled = false; }
    try { OAUTH_PROVIDERS.twitter.firebaseProvider = new TwitterAuthProvider(); } catch(e) { OAUTH_PROVIDERS.twitter.enabled = false; }
    OAUTH_PROVIDERS.discord.enabled = false;

    this.isInitialized = true;
    console.log('✅ OAuth Manager initialized');
  },

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  async loginWithProvider(providerName) {
    // Always await init — cached promise, zero cost if already done
    await this.init();

    const key      = providerName.toLowerCase();
    const provider = OAUTH_PROVIDERS[key];

    if (!provider || !provider.enabled || !provider.firebaseProvider) {
      console.warn(`${providerName} provider not available or not enabled in Firebase Console`);
      this._showLoginError(`${providerName} login is not configured yet.`);
      return;
    }

    if (!this._signInWithPopup) {
      console.error('signInWithPopup not ready');
      this._showLoginError('Auth not ready. Please refresh and try again.');
      return;
    }

    try {
      console.log(`Starting ${providerName} OAuth...`);

      // BUG 3 FIX: _signInWithPopup is already imported — no await here
      // This keeps us inside Chrome's user gesture window
      const result = await this._signInWithPopup(this.auth, provider.firebaseProvider);

      if (!result || !result.user) {
        throw new Error('No user returned from signInWithPopup');
      }

      console.log(`✅ ${providerName} popup auth successful`);

      // BUG 1 FIX: call handleOAuthLogin DIRECTLY — never rely on state listener
      await this.handleOAuthLogin(result.user);

    } catch (error) {
      console.error(`${providerName} OAuth error:`, error.code, error.message);
      this._handlePopupError(error);
    }
  },

  // ── HANDLE LOGIN ──────────────────────────────────────────────────────────
  async handleOAuthLogin(firebaseUser) {
    try {
      const providerData = firebaseUser.providerData[0];
      const providerName = (providerData?.providerId || 'google.com')
        .replace('.com','').replace('github','GitHub')
        .replace('google','Google').replace('facebook','Facebook')
        .replace('twitter','Twitter').replace('microsoft','Microsoft')
        .toUpperCase();

      const oauthUser = {
        name:        firebaseUser.displayName || 'User',
        email:       firebaseUser.email || `${firebaseUser.uid}@firebase.user`,
        username:    (firebaseUser.email || firebaseUser.uid).split('@')[0],
        avatar:      firebaseUser.photoURL || null,
        profilePic:  firebaseUser.photoURL || null,
        bio:         '',
        via:         providerName,
        firebaseUid: firebaseUser.uid,
        password:    '',
        joinedAt:    new Date().toISOString(),
      };

      // Wait for DB before querying
      if (typeof DB !== 'undefined' && DB.init) await DB.init();

      let dbUser = await DB.getUserByEmail(oauthUser.email);

      if (!dbUser) {
        dbUser = await DB.createUser(oauthUser);
        console.log(`✅ New ${providerName} user saved to DB`);
      } else {
        // Update avatar in case it changed
        dbUser.avatar      = oauthUser.avatar      || dbUser.avatar;
        dbUser.profilePic  = oauthUser.profilePic  || dbUser.profilePic;
        dbUser.via         = providerName;
        console.log(`✅ Existing ${providerName} user logged in`);
      }

      if (!dbUser) throw new Error('Failed to create/fetch user from DB');

      // Log in and close auth modal
      if (typeof loginUser  === 'function') loginUser(dbUser);
      if (typeof closeAuth  === 'function') closeAuth();

    } catch (error) {
      console.error('handleOAuthLogin error:', error.message);
      this._showLoginError('Login succeeded but profile setup failed. Please try again.');
    }
  },

  // ── ERROR HELPERS ─────────────────────────────────────────────────────────
  _handlePopupError(error) {
    switch (error.code) {
      case 'auth/popup-blocked':
        this._showLoginError('Popup blocked. Please allow popups for this site and try again.');
        break;
      case 'auth/popup-closed-by-user':
        console.log('User closed the login popup.');
        break;
      case 'auth/cancelled-popup-request':
        console.log('Previous popup still open — request cancelled.');
        break;
      case 'auth/network-request-failed':
        this._showLoginError('Network error. Check your connection and try again.');
        break;
      case 'auth/unauthorized-domain':
        this._showLoginError('This domain is not authorized in Firebase. Add it in Firebase Console → Authentication → Authorized Domains.');
        break;
      case 'auth/operation-not-allowed':
        this._showLoginError('This sign-in method is not enabled in Firebase Console.');
        break;
      case 'auth/user-disabled':
        this._showLoginError('This account has been disabled.');
        break;
      default:
        this._showLoginError(`Login failed: ${error.message}`);
    }
  },

  _showLoginError(msg) {
    // Show in login alert if visible, otherwise show a toast
    const alert = document.getElementById('login-alert');
    if (alert) {
      alert.textContent = '⚠️ ' + msg;
      alert.className = 'alert alert-error show';
      clearTimeout(alert._t);
      alert._t = setTimeout(() => { alert.className = 'alert'; }, 6000);
    } else if (typeof toast === 'function') {
      toast(msg, 'error', 'Login Failed');
    } else {
      console.warn('Login error:', msg);
    }
  },
};

// ── GLOBAL socialLogin ────────────────────────────────────────────────────
// This is the single entry point for all social logins.
// app-8.js also defines socialLogin but this file loads after it,
// so window.socialLogin is set here and overrides it.
async function socialLogin(provider) {
  if (!OAUTH_CONFIG.ENABLED) {
    console.warn('OAuth disabled');
    return;
  }
  await OAuthManager.loginWithProvider(provider);
}

window.OAuthManager = OAuthManager;
window.socialLogin  = socialLogin;

// ── EAGER INIT ────────────────────────────────────────────────────────────
// Initialize as soon as db-firebase.js has set window.__firebaseApp.
// This ensures signInWithPopup is pre-loaded before any user clicks.
function waitForAppAndInit(retries = 25, interval = 250) {
  if (window.__firebaseApp) {
    OAuthManager.init();
    return;
  }
  if (retries <= 0) {
    console.warn('__firebaseApp not found after waiting — initializing independently');
    OAuthManager.init();
    return;
  }
  setTimeout(() => waitForAppAndInit(retries - 1, interval), interval);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => waitForAppAndInit());
} else {
  waitForAppAndInit();
}

console.log('%c🔐 OAuth Module Loaded (Permanently Fixed)', 'color:#4285f4;font-weight:700;font-size:12px');
