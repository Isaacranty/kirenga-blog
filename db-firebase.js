/* ═══════════════════════════════════════════════════════════════
   Kirenga Blog — db-firebase.js  (Firebase Database Layer)
   FIXED VERSION
═══════════════════════════════════════════════════════════════ */

'use strict';

const FIREBASE_CONFIG = {
  apiKey:             'AIzaSyAq3YgnSH3bGGglJugzpBpiOBgoAbEaNCE',
  authDomain:         'kirenga-blog.firebaseapp.com',
  projectId:          'kirenga-blog',
  storageBucket:      'kirenga-blog.firebasestorage.app',
  messagingSenderId:  '113895235074',
  appId:              '1:113895235074:web:2edd1553f4012c8fad911b',
  databaseURL:        'https://kirenga-blog-default-rtdb.firebaseio.com', // ✅ FIX 1: databaseURL is required for Realtime DB
};

const FIREBASE_DB_TYPE = 'realtimedb';

/* ════════════════════════════════════════════════════════════
   DB MODE DETECTION
════════════════════════════════════════════════════════════ */
const DB_READY = (FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY_HERE');

function showDbStatus() {
  const existing = document.getElementById('db-status-badge');
  if (existing) existing.remove();
  const badge = document.createElement('div');
  badge.id = 'db-status-badge';
  badge.style.cssText = 'position:fixed;bottom:80px;left:16px;z-index:99998;padding:6px 12px;border-radius:50px;font-size:.72rem;font-weight:700;font-family:DM Sans,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.2);';
  badge.innerHTML = DB_READY ? `🔵 Firebase (${FIREBASE_DB_TYPE})` : '🟡 Local Storage';
  badge.style.background = DB_READY ? '#1f2937' : '#f9ab00';
  badge.style.color = DB_READY ? '#ffa500' : '#1c1c2e';
  document.body.appendChild(badge);
}

/* ════════════════════════════════════════════════════════════
   LOCAL STORAGE HELPERS
════════════════════════════════════════════════════════════ */
function lsGet(key, def = null) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('localStorage full'); } }

/* ════════════════════════════════════════════════════════════
   DATA NORMALISATION
════════════════════════════════════════════════════════════ */
function normaliseUser(data) {
  return {
    id: data.id || '',
    name: data.name || '',
    username: data.username || '',
    email: data.email || '',
    via: data.via || 'email',
    joined: data.joinedAt || new Date().toISOString(),
  };
}

/* ════════════════════════════════════════════════════════════
   FIREBASE REALTIME DATABASE OPERATIONS
════════════════════════════════════════════════════════════ */
const RTDB = {
  db: null,
  app: null, // ✅ FIX 2: expose app instance so oauth-firebase.js can reuse it
  initialized: false,
  modules: null,

  // ✅ FIX 3: expose a Promise so callers can await full initialization
  _initPromise: null,

  init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  },

  async _doInit() {
    if (!DB_READY) return;
    try {
      const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
      const { getDatabase, ref, get, set, push, update, remove } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js');

      // ✅ FIX 4: reuse existing app instead of calling initializeApp() twice
      this.app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
      this.db = getDatabase(this.app);
      this.modules = { ref, get, set, push, update, remove };
      this.initialized = true;

      // Expose app globally so oauth-firebase.js can import auth from same app
      window.__firebaseApp = this.app;

      console.log('✅ Realtime Database initialized');
      showDbStatus();
    } catch (e) {
      console.error('❌ RTDB init failed:', e.message);
    }
  },

  async createUser(userData) {
    if (!this.db) return null;
    try {
      const { ref, set } = this.modules;
      const userId = userData.email.replace(/[.#$/[\]]/g, '-');
      const userRef = ref(this.db, 'users/' + userId);

      const dataToSave = {
        id: userId,
        name: userData.name || 'User',
        email: userData.email,
        username: userData.username || userData.email.split('@')[0],
        via: userData.via || 'email',
        joinedAt: new Date().toISOString()
      };

      await set(userRef, dataToSave);
      console.log('✅ User saved to RTDB:', userId);
      return normaliseUser(dataToSave);
    } catch (e) {
      console.error('❌ RTDB createUser failed:', e.message);
      return null;
    }
  },

  async getUserByEmail(email) {
    if (!this.db) return null;
    try {
      const { ref, get } = this.modules;
      const snapshot = await get(ref(this.db, 'users'));
      if (!snapshot.exists()) return null;
      let found = null;
      snapshot.forEach((child) => {
        if (child.val().email === email) found = normaliseUser(child.val());
      });
      return found;
    } catch (e) { return null; }
  }
};

/* ════════════════════════════════════════════════════════════
   DB PUBLIC API
════════════════════════════════════════════════════════════ */
const DB = {
  async init() {
    await RTDB.init(); // ✅ returns the shared promise — safe to call multiple times
  },

  async createUser(data) {
    // ✅ FIX 5: await init() before checking initialized,
    // so a signup right after page load doesn't fall through to localStorage
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.createUser(data);

    // Genuine fallback — Firebase failed to load
    console.warn('⚠️ Falling back to localStorage for createUser');
    const users = lsGet('kirengaUsers', []);
    users.push(data);
    lsSet('kirengaUsers', users);
    return normaliseUser(data);
  },

  async getUserByEmail(email) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.getUserByEmail(email);

    console.warn('⚠️ Falling back to localStorage for getUserByEmail');
    return lsGet('kirengaUsers', []).find(u => u.email === email) || null;
  }
};

// Initialize eagerly so it's ready before the user clicks anything
RTDB.init();
