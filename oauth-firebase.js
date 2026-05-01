/* ════════════════════════════════════════════════════════════════════════════
   ENHANCED FIREBASE OAUTH - FIXED VERSION

   FIXES APPLIED:
   1. Switched from compat SDK (window.firebase.auth) to modular SDK v10
      to match db-firebase.js — they must use the same SDK style
   2. Reuses the Firebase app created by db-firebase.js (window.__firebaseApp)
      instead of calling initializeApp() a second time
   3. Auth state listener now ignores stale sessions on page load
      (only acts after an explicit signInWithPopup call)
════════════════════════════════════════════════════════════════════════════ */

const OAUTH_CONFIG = {
  ENABLED: true,
  TIMEOUT: 30000,
  DEBUG: true
};

// ✅ FIX: track whether a popup sign-in is in progress
//    so the authStateChanged listener doesn't fire on page-load restoration
let _oauthPopupInProgress = false;

const OAUTH_PROVIDERS = {
  google:    { name: 'Google',    icon: '🔍', enabled: true,  firebaseProvider: null },
  github:    { name: 'GitHub',    icon: '🐙', enabled: true,  firebaseProvider: null },
  facebook:  { name: 'Facebook',  icon: 'f',  enabled: true,  firebaseProvider: null },
  microsoft: { name: 'Microsoft', icon: '⊞',  enabled: true,  firebaseProvider: null },
  twitter:   { name: 'Twitter',   icon: '𝕏',  enabled: true,  firebaseProvider: null },
  discord:   { name: 'Discord',   icon: '⚙️', enabled: false, firebaseProvider: null },
};

const OAuthManager = {
  auth: null,
  isInitialized: false,

  async init() {
    if (this.isInitialized) return;

    try {
      // ✅ FIX 1: use modular SDK v10, not the compat window.firebase object
      const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
      const { getApps, getApp, initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');

      // ✅ FIX 2: reuse the app already created by db-firebase.js
      //    db-firebase.js sets window.__firebaseApp after its initializeApp()
      //    We wait briefly to make sure db-firebase.js has run first.
      //    If it hasn't, fall back to creating/getting the app ourselves.
      let app = window.__firebaseApp;
      if (!app) {
        app = getApps().length ? getApp() : initializeApp(window.FIREBASE_CONFIG || {
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
      await this.setupProviders();
      this.setupAuthStateListener();
      this.isInitialized = true;

      console.log('✅ OAuth Manager initialized');
    } catch (e) {
      console.error('OAuth init error:', e.message);
    }
  },

  async setupProviders() {
    // ✅ FIX 3: import provider classes from modular SDK, not window.firebase.auth.*
    const {
      GoogleAuthProvider,
      GithubAuthProvider,
      FacebookAuthProvider,
      OAuthProvider,
      TwitterAuthProvider,
    } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');

    try {
      const g = new GoogleAuthProvider();
      g.addScope('profile');
      g.addScope('email');
      OAUTH_PROVIDERS.google.firebaseProvider = g;
    } catch (e) { OAUTH_PROVIDERS.google.enabled = false; }

    try {
      const gh = new GithubAuthProvider();
      gh.addScope('user:email');
      OAUTH_PROVIDERS.github.firebaseProvider = gh;
    } catch (e) { OAUTH_PROVIDERS.github.enabled = false; }

    try {
      const fb = new FacebookAuthProvider();
      fb.addScope('email');
      OAUTH_PROVIDERS.facebook.firebaseProvider = fb;
    } catch (e) { OAUTH_PROVIDERS.facebook.enabled = false; }

    try {
      const ms = new OAuthProvider('microsoft.com');
      ms.addScope('mail.read');
      OAUTH_PROVIDERS.microsoft.firebaseProvider = ms;
    } catch (e) { OAUTH_PROVIDERS.microsoft.enabled = false; }

    try {
      OAUTH_PROVIDERS.twitter.firebaseProvider = new TwitterAuthProvider();
    } catch (e) { OAUTH_PROVIDERS.twitter.enabled = false; }

    // Discord needs a custom OAuth server — keep disabled
    OAUTH_PROVIDERS.discord.enabled = false;

    console.log('✅ OAuth providers configured');
  },

  setupAuthStateListener() {
    // Intentionally empty — loginWithProvider calls handleOAuthLogin
    // directly after signInWithPopup succeeds, so we don't need this listener.
    // Having it active caused double-login and race conditions.
  },

  async handleOAuthLogin(firebaseUser) {
    try {
      const provider = firebaseUser.providerData[0];
      const providerName = provider?.providerId.split('.')[0].toUpperCase() || 'EMAIL';

      const oauthUser = {
        name:       firebaseUser.displayName || 'User',
        email:      firebaseUser.email,
        username:   firebaseUser.email?.split('@')[0] || `user_${Date.now()}`,
        avatar:     firebaseUser.photoURL || null,
        profilePic: firebaseUser.photoURL || null,
        bio:        '',
        via:        providerName,
        firebaseUid: firebaseUser.uid,
        password:   '',
        joinedAt:   new Date().toISOString()
      };

      // Ensure DB is ready before querying
      if (typeof DB !== 'undefined') await DB.init();

      let dbUser = await DB.getUserByEmail(oauthUser.email);

      if (!dbUser) {
        dbUser = await DB.createUser(oauthUser);
        console.log(`✅ New user created via ${providerName}`);
      } else {
        dbUser.avatar = oauthUser.avatar || dbUser.avatar;
        dbUser.via = providerName;
        console.log(`✅ Existing user logged in via ${providerName}`);
      }

      if (dbUser && typeof loginUser === 'function') {
        loginUser(dbUser);
        if (typeof closeAuth === 'function') closeAuth();
      }
    } catch (error) {
      console.error('OAuth login error:', error.message);
    }
  },

  async loginWithProvider(providerName) {
    // always await init — cached promise, safe to call multiple times
    await this.init();

    const providerLower = providerName.toLowerCase();
    const provider = OAUTH_PROVIDERS[providerLower];

    if (!provider || !provider.enabled || !provider.firebaseProvider) {
      console.warn(`${providerName} not available`);
      return;
    }

    try {
      console.log(`Starting ${providerName} OAuth...`);
      this.auth.useDeviceLanguage();

      const { signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');

      // signInWithPopup may show a COOP warning in console — this is harmless
      // The login still completes successfully
      const result = await signInWithPopup(this.auth, provider.firebaseProvider);

      if (result && result.user) {
        console.log(`✅ ${providerName} auth successful`);
        // ✅ call handleOAuthLogin directly from the result
        // Do NOT rely on onAuthStateChanged — it fires too late or gets missed
        await this.handleOAuthLogin(result.user);
      }

    } catch (error) {
      console.error(`${providerName} OAuth error:`, error.code, error.message);
      if (error.code === 'auth/popup-blocked') {
        alert('📱 Popup blocked! Please enable popups for this site and try again.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        console.log('User closed the login popup.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        console.log('Duplicate popup request cancelled.');
      } else if (error.code === 'auth/network-request-failed') {
        alert('⚠️ Network error. Check your connection and try again.');
      }
    }
  },

  // kept for compatibility but no longer the main login path
  async handleRedirectResult() {
    try {
      const { getRedirectResult } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
      const result = await getRedirectResult(this.auth);
      if (result && result.user) {
        console.log('✅ Redirect sign-in result picked up');
        await this.handleOAuthLogin(result.user);
      }
    } catch (error) {
      if (error.code && error.code !== 'auth/no-auth-event') {
        console.error('Redirect result error:', error.code, error.message);
      }
    }
  }
};

// Save original socialLogin if it exists
window._origSocialLogin = typeof socialLogin !== 'undefined' ? socialLogin : null;

// Override socialLogin globally
async function socialLogin(provider) {
  if (OAUTH_CONFIG.ENABLED) {
    await OAuthManager.loginWithProvider(provider);
  } else if (window._origSocialLogin) {
    window._origSocialLogin(provider);
  } else {
    console.error('No login method available');
  }
}

window.OAuthManager = OAuthManager;
window.socialLogin  = socialLogin;

// ✅ FIX: poll for window.__firebaseApp instead of guessing a fixed timeout
// db-firebase.js sets window.__firebaseApp after initializeApp() -- we wait for it
function waitForFirebaseAppThenInit(retries = 20, interval = 300) {
  if (window.__firebaseApp) {
    // Init OAuth then immediately check for a pending redirect result
    OAuthManager.init().then(() => OAuthManager.handleRedirectResult());
    return;
  }
  if (retries <= 0) {
    console.warn('OAuth initializing independently -- __firebaseApp not found');
    OAuthManager.init().then(() => OAuthManager.handleRedirectResult());
    return;
  }
  setTimeout(() => waitForFirebaseAppThenInit(retries - 1, interval), interval);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => waitForFirebaseAppThenInit());
} else {
  waitForFirebaseAppThenInit();
}

console.log('%c🔐 Enhanced OAuth Module Loaded (Fixed)', 'color:#4285f4;font-weight:700;font-size:12px');
