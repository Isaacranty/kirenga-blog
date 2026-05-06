/* ════════════════════════════════════════════════════════════════════════════
   ENHANCED FIREBASE OAUTH  — v2 (Runtime-fixed)

   FIXES IN THIS VERSION:
   1. Race condition: OAuth no longer polls for __firebaseApp with a retry limit.
      Instead it awaits RTDB._initPromise directly — guaranteed to resolve
      before any user interaction is possible.
   2. Duplicate popup: loginWithProvider() now debounces with a per-provider
      in-flight flag. A second click while a popup is open is silently ignored
      instead of triggering a second signInWithPopup() that Firebase cancels
      with auth/cancelled-popup-request.
   3. INTERNAL ASSERTION FAILED / auth/popup-blocked: When a popup is blocked
      by the browser (COOP headers), we catch early, reset the in-flight flag,
      and show a friendly toast instead of alert(). No dangling promises.
   4. Microsoft scope fixed from 'mail.read' → 'User.Read'.
════════════════════════════════════════════════════════════════════════════ */

'use strict';

const OAUTH_CONFIG = { ENABLED: true, DEBUG: false };

const OAUTH_PROVIDERS = {
  google:    { name: 'Google',    enabled: true,  firebaseProvider: null, _inFlight: false },
  github:    { name: 'GitHub',    enabled: true,  firebaseProvider: null, _inFlight: false },
  facebook:  { name: 'Facebook',  enabled: true,  firebaseProvider: null, _inFlight: false },
  microsoft: { name: 'Microsoft', enabled: true,  firebaseProvider: null, _inFlight: false },
  twitter:   { name: 'Twitter',   enabled: true,  firebaseProvider: null, _inFlight: false },
  linkedin:  { name: 'LinkedIn',  enabled: false, firebaseProvider: null, _inFlight: false },
  discord:   { name: 'Discord',   enabled: false, firebaseProvider: null, _inFlight: false },
};

function _oauthToast(msg, type = 'error') {
  if (typeof showAlert === 'function') showAlert('auth-alert', msg, type);
  else if (typeof toast === 'function') toast(msg, type);
  else console.warn('[OAuth]', msg);
}

const OAuthManager = {
  auth: null,
  isInitialized: false,
  _initPromise: null,

  init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  },

  async _doInit() {
    try {
      // FIX 1: await db-firebase.js's own init promise — no polling, no race
      if (typeof RTDB !== 'undefined' && RTDB._initPromise) {
        await RTDB._initPromise;
      }

      const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
      const { getApps, getApp, initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');

      const app = window.__firebaseApp
        || (getApps().length ? getApp() : initializeApp({
            apiKey:            'AIzaSyAq3YgnSH3bGGglJugzpBpiOBgoAbEaNCE',
            authDomain:        'kirenga-blog.firebaseapp.com',
            projectId:         'kirenga-blog',
            storageBucket:     'kirenga-blog.firebasestorage.app',
            messagingSenderId: '113895235074',
            appId:             '1:113895235074:web:2edd1553f4012c8fad911b',
            databaseURL:       'https://kirenga-blog-default-rtdb.firebaseio.com',
          }));

      this.auth = getAuth(app);
      await this._setupProviders();
      this.isInitialized = true;

      // ── Keep login state in sync with Firebase Auth ──────────────────
      // This is the single source of truth. If Firebase says the user is
      // logged in, we log them in. If Firebase says null, we log them out.
      // This also handles session restore on page reload automatically.
      const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
      onAuthStateChanged(this.auth, async (firebaseUser) => {
        if (firebaseUser) {
          // Firebase has a valid session — make sure our app reflects it
          const alreadyLoggedIn = typeof currentUser !== 'undefined' && currentUser && currentUser.email === firebaseUser.email;
          if (!alreadyLoggedIn) {
            if (typeof OAUTH_CONFIG !== 'undefined' && OAUTH_CONFIG.DEBUG) {
              console.log('[OAuth] onAuthStateChanged: restoring session for', firebaseUser.email);
            }
            await this._handleOAuthLogin(firebaseUser);
          }
        } else {
          // Firebase session ended — only log out if user was logged in via OAuth
          // (don't interfere with manual email/password users)
          if (typeof currentUser !== 'undefined' && currentUser && currentUser.firebaseUid) {
            if (typeof logout === 'function') logout();
          }
        }
      });

      this._handleRedirectResult();
      console.log('✅ OAuth Manager initialized');
    } catch (e) {
      console.error('[OAuth] init error:', e.message);
    }
  },

  async _setupProviders() {
    const {
      GoogleAuthProvider, GithubAuthProvider, FacebookAuthProvider,
      OAuthProvider, TwitterAuthProvider,
    } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');

    const safe = (fn) => { try { fn(); } catch (e) {} };

    safe(() => {
      const g = new GoogleAuthProvider();
      g.addScope('profile'); g.addScope('email');
      OAUTH_PROVIDERS.google.firebaseProvider = g;
    });
    safe(() => {
      const gh = new GithubAuthProvider();
      gh.addScope('user:email');
      OAUTH_PROVIDERS.github.firebaseProvider = gh;
    });
    safe(() => {
      const fb = new FacebookAuthProvider();
      fb.addScope('email');
      OAUTH_PROVIDERS.facebook.firebaseProvider = fb;
    });
    safe(() => {
      // FIX 4: 'mail.read' is Exchange-only — 'User.Read' works on standard consent screen
      const ms = new OAuthProvider('microsoft.com');
      ms.addScope('User.Read');
      OAUTH_PROVIDERS.microsoft.firebaseProvider = ms;
    });
    safe(() => {
      OAUTH_PROVIDERS.twitter.firebaseProvider = new TwitterAuthProvider();
    });

    console.log('✅ OAuth providers configured');
  },

  async emailSignup(fname, lname, username, email, password) {
    await this.init();
    try {
      const { createUserWithEmailAndPassword, updateProfile } =
        await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
      const credential = await createUserWithEmailAndPassword(this.auth, email, password);
      await updateProfile(credential.user, { displayName: `${fname} ${lname}` });
      const userData = {
        name: `${fname} ${lname}`, username, email,
        password: '', // never store plain-text passwords
        via: 'email', firebaseUid: credential.user.uid,
        joinedAt: new Date().toISOString(),
      };
      await DB.createUser(userData);
      // onAuthStateChanged fires automatically and calls loginUser()
      return { ok: true };
    } catch (e) {
      const msgs = {
        'auth/email-already-in-use':   '⚠️ An account with this email already exists.',
        'auth/invalid-email':          '⚠️ Invalid email address.',
        'auth/weak-password':          '⚠️ Password must be at least 6 characters.',
        'auth/network-request-failed': '⚠️ Network error. Check your connection.',
      };
      return { ok: false, message: msgs[e.code] || `⚠️ Signup failed: ${e.message}` };
    }
  },

  async emailLogin(email, password) {
    await this.init();
    try {
      const { signInWithEmailAndPassword } =
        await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
      await signInWithEmailAndPassword(this.auth, email, password);
      // onAuthStateChanged handles loginUser() automatically
      return { ok: true };
    } catch (e) {
      const msgs = {
        'auth/invalid-credential':     '❌ Incorrect email or password.',
        'auth/user-not-found':         '❌ No account found with that email.',
        'auth/wrong-password':         '❌ Incorrect password. Please try again.',
        'auth/invalid-email':          '⚠️ Invalid email address.',
        'auth/user-disabled':          '❌ This account has been disabled.',
        'auth/too-many-requests':      '⚠️ Too many failed attempts. Try again later.',
        'auth/network-request-failed': '⚠️ Network error. Check your connection.',
      };
      return { ok: false, message: msgs[e.code] || `❌ Login failed: ${e.message}` };
    }
  },

  async loginWithProvider(providerName) {
    await this.init();

    const key      = providerName.toLowerCase();
    const provider = OAUTH_PROVIDERS[key];

    if (!provider || !provider.enabled) {
      _oauthToast(`${providerName} sign-in is not available yet.`, 'info');
      return;
    }
    if (!provider.firebaseProvider) {
      _oauthToast(`${providerName} failed to initialize. Please refresh and try again.`, 'error');
      return;
    }

    // FIX 2: debounce — ignore if a popup for this provider is already open
    if (provider._inFlight) {
      if (OAUTH_CONFIG.DEBUG) console.log(`[OAuth] ${providerName} already in flight — ignoring click`);
      return;
    }

    provider._inFlight = true;
    try {
      this.auth.useDeviceLanguage();
      const { signInWithPopup } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
      const result = await signInWithPopup(this.auth, provider.firebaseProvider);
      if (result && result.user) {
        console.log(`✅ ${providerName} auth successful`);
        await this._handleOAuthLogin(result.user);
      }
    } catch (error) {
      this._handlePopupError(error, providerName);
    } finally {
      // FIX 3: always reset flag so the next click works after an error
      provider._inFlight = false;
    }
  },

  _handlePopupError(error, providerName) {
    const code = error?.code || '';
    if (code === 'auth/popup-blocked') {
      // FIX 3: toast not alert() — alert() can trigger Firebase internal assertion
      _oauthToast('🚫 Popup blocked! Allow popups for this site in your browser settings, then try again.', 'error');
    } else if (code === 'auth/popup-closed-by-user') {
      if (OAUTH_CONFIG.DEBUG) console.log(`[OAuth] ${providerName} popup closed by user`);
    } else if (code === 'auth/cancelled-popup-request') {
      if (OAUTH_CONFIG.DEBUG) console.log(`[OAuth] ${providerName} duplicate popup cancelled`);
    } else if (code === 'auth/network-request-failed') {
      _oauthToast('⚠️ Network error. Check your connection and try again.', 'error');
    } else if (code === 'auth/unauthorized-domain') {
      _oauthToast('⚠️ Domain not authorised. Add it in Firebase Console → Authentication → Authorised Domains.', 'error');
    } else if (code === 'auth/account-exists-with-different-credential') {
      // Look up which provider the email is registered with and tell the user
      const email = error?.customData?.email;
      if (email && this.auth) {
        import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js')
          .then(({ fetchSignInMethodsForEmail }) => fetchSignInMethodsForEmail(this.auth, email))
          .then(methods => {
            const provider = methods[0] || 'another method';
            const friendly = {
              'google.com': 'Google',
              'github.com': 'GitHub',
              'facebook.com': 'Facebook',
              'twitter.com': 'Twitter',
              'microsoft.com': 'Microsoft',
              'password': 'email/password',
            }[provider] || provider;
            _oauthToast(
              `⚠️ This email is already registered with ${friendly}. Please sign in with ${friendly} instead.`,
              'error'
            );
          })
          .catch(() => {
            _oauthToast(
              '⚠️ This email is already linked to a different sign-in method. Try signing in with Google, GitHub, or email/password.',
              'error'
            );
          });
      } else {
        _oauthToast(
          '⚠️ This email is already linked to a different sign-in method. Try signing in with Google, GitHub, or email/password.',
          'error'
        );
      }
    } else {
      console.error(`[OAuth] ${providerName} error:`, code, error?.message);
    }
  },

  async _handleOAuthLogin(firebaseUser) {
    try {
      const provider     = firebaseUser.providerData[0];
      const providerName = provider?.providerId?.split('.')[0]?.toUpperCase() || 'OAUTH';

      const oauthUser = {
        name:        firebaseUser.displayName || 'User',
        email:       firebaseUser.email || '',   // Twitter may return null
        username:    firebaseUser.email?.split('@')[0] || firebaseUser.displayName?.replace(/\s+/g, '_').toLowerCase() || `user_${Date.now()}`,
        avatar:      firebaseUser.photoURL || null,
        profilePic:  firebaseUser.photoURL || null,
        bio:         '',
        via:         providerName,
        firebaseUid: firebaseUser.uid,
        password:    '',
        joinedAt:    new Date().toISOString(),
      };

      if (typeof DB !== 'undefined') await DB.init();

      // Look up by email if available, otherwise by firebaseUid
      let dbUser = oauthUser.email
        ? await DB.getUserByEmail(oauthUser.email)
        : await DB.getUserByUid(firebaseUser.uid);

      if (!dbUser) {
        dbUser = await DB.createUser(oauthUser);
        console.log(`✅ New user created via ${providerName}`);
      } else {
        const updates = {};
        if (oauthUser.avatar     && oauthUser.avatar     !== dbUser.avatar)      updates.avatar     = oauthUser.avatar;
        if (oauthUser.profilePic && oauthUser.profilePic !== dbUser.profilePic)  updates.profilePic = oauthUser.profilePic;
        if (Object.keys(updates).length) {
          Object.assign(dbUser, updates);
          const uid = dbUser.id || (dbUser.email ? dbUser.email.replace(/[.#$/[\]]/g, '-') : dbUser.firebaseUid);
          await DB.updateUser(uid, updates);
        }
        console.log(`✅ Existing user logged in via ${providerName}`);
      }

      if (dbUser && typeof loginUser === 'function') {
        loginUser(dbUser);
        if (typeof closeAuth === 'function') closeAuth();
      }
    } catch (error) {
      console.error('[OAuth] _handleOAuthLogin error:', error.message);
      _oauthToast('Sign-in succeeded but profile save failed. Please try again.', 'error');
    }
  },

  async _handleRedirectResult() {
    if (!this.auth) return;
    try {
      const { getRedirectResult } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
      const result = await getRedirectResult(this.auth);
      if (result && result.user) {
        console.log('✅ Redirect sign-in result received');
        await this._handleOAuthLogin(result.user);
      }
    } catch (error) {
      if (error?.code && error.code !== 'auth/no-auth-event') {
        console.warn('[OAuth] getRedirectResult error:', error.code);
      }
    }
  },
};

/* ── Global override ─────────────────────────────────────────────────────── */
window._origSocialLogin = typeof socialLogin !== 'undefined' ? socialLogin : null;

async function socialLogin(provider) {
  if (OAUTH_CONFIG.ENABLED) {
    await OAuthManager.loginWithProvider(provider);
  } else if (window._origSocialLogin) {
    window._origSocialLogin(provider);
  } else {
    console.error('[OAuth] No login method available');
  }
}

window.OAuthManager = OAuthManager;
window.socialLogin  = socialLogin;

/* ── Boot immediately — don't wait for DOMContentLoaded ─────────────────── */
OAuthManager.init();

console.log('%c🔐 OAuth Module Loaded (v2)', 'color:#4285f4;font-weight:700;font-size:12px');
