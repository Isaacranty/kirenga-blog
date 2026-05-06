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
      // Twitter/X accounts may have no email — use uid as fallback key
      const emailOrUid = userData.email || userData.firebaseUid || `user_${Date.now()}`;
      const userId  = emailOrUid.replace(/[.#$/[\]@]/g, '-');
      const userRef = ref(this.db, 'users/' + userId);

      const dataToSave = {
        id:       userId,
        name:     userData.name || 'User',
        email:    userData.email || '',
        username: userData.username || (userData.email ? userData.email.split('@')[0] : `user_${userId.slice(-6)}`),
        via:      userData.via || 'email',
        firebaseUid: userData.firebaseUid || '',
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
    if (!this.db || !email) return null;
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
  },

  async getUserByUid(uid) {
    if (!this.db || !uid) return null;
    try {
      const { ref, get } = this.modules;
      const snapshot = await get(ref(this.db, 'users'));
      if (!snapshot.exists()) return null;
      let found = null;
      snapshot.forEach((child) => {
        if (child.val().firebaseUid === uid) found = normaliseUser(child.val());
      });
      return found;
    } catch (e) { return null; }
  },

  async updateUser(id, data) {
    if (!this.db) return null;
    try {
      const { ref, update } = this.modules;
      await update(ref(this.db, 'users/' + id), data);
      return true;
    } catch (e) { console.error('❌ RTDB updateUser failed:', e.message); return null; }
  },

  // ══ POSTS ══

  async getPosts() {
    if (!this.db) return [];
    try {
      const { ref, get } = this.modules;
      const snapshot = await get(ref(this.db, 'posts'));
      if (!snapshot.exists()) return [];
      const posts = [];
      snapshot.forEach((child) => posts.unshift(child.val()));
      return posts;
    } catch (e) { console.error('❌ RTDB getPosts failed:', e.message); return []; }
  },

  async createPost(p) {
    if (!this.db) return null;
    try {
      const { ref, set } = this.modules;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      const post = {
        ...p,
        id,
        iso: new Date().toISOString(),
        date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        reactions: {},
        myReactions: {},
        comments: []
      };
      await set(ref(this.db, 'posts/' + id), post);
      console.log('✅ Post saved to RTDB:', id);
      return post;
    } catch (e) { console.error('❌ RTDB createPost failed:', e.message); return null; }
  },

  async deletePost(id) {
    if (!this.db) return null;
    try {
      const { ref, remove } = this.modules;
      await remove(ref(this.db, 'posts/' + id));
      return true;
    } catch (e) { console.error('❌ RTDB deletePost failed:', e.message); return null; }
  },

  async setReaction(postId, userId, emoji) {
    if (!this.db || !emoji) return null; // emoji null = toggle off, nothing to store
    try {
      const { ref, get, update } = this.modules;
      const path = `posts/${postId}/reactions/${emoji}`;
      const snapshot = await get(ref(this.db, path));
      const current = snapshot.exists() ? snapshot.val() : 0;
      await update(ref(this.db, `posts/${postId}/reactions`), { [emoji]: current + 1 });
      return true;
    } catch (e) { return null; }
  },

  // ══ COMMENTS ══

  async getComments(postId) {
    if (!this.db) return [];
    try {
      const { ref, get } = this.modules;
      const snapshot = await get(ref(this.db, `posts/${postId}/comments`));
      if (!snapshot.exists()) return [];
      const comments = [];
      snapshot.forEach((child) => comments.push(child.val()));
      return comments;
    } catch (e) { return []; }
  },

  async addComment(postId, parentId, author, text) {
    if (!this.db) return null;
    try {
      const { ref, set } = this.modules;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      const comment = {
        id,
        postId,
        parentId: parentId || null,
        author: author.name,
        username: author.username || '',
        email: author.email,
        via: author.via || 'email',
        profilePic: author.profilePic || null,
        text,
        likes: 0,
        likedBy: [],
        replies: [],
        iso: new Date().toISOString()
      };
      await set(ref(this.db, `posts/${postId}/comments/${id}`), comment);
      return comment;
    } catch (e) { console.error('❌ RTDB addComment failed:', e.message); return null; }
  },

  async likeComment(postId, commentId, userId) {
    if (!this.db) return null;
    try {
      const { ref, get, update } = this.modules;
      const commentRef = ref(this.db, `posts/${postId}/comments/${commentId}`);
      const snapshot = await get(commentRef);
      if (!snapshot.exists()) return null;
      const comment = snapshot.val();
      const likedBy = comment.likedBy || [];
      if (likedBy.includes(userId)) return null;
      likedBy.push(userId);
      await update(commentRef, { likes: (comment.likes || 0) + 1, likedBy });
      return true;
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
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      const result = await RTDB.createUser(data);
      if (result) return result;
      console.warn('⚠️ RTDB createUser failed (check Firebase rules) — saving locally');
    }
    const users = lsGet('kirengaUsers', []);
    const emailOrUid = data.email || data.firebaseUid || `user_${Date.now()}`;
    const nu = normaliseUser({ ...data, id: emailOrUid.replace(/[.#$/[\]@]/g, '-') });
    const exists = users.findIndex(u => u.email ? u.email === nu.email : u.firebaseUid === nu.firebaseUid);
    if (exists > -1) { users[exists] = { ...users[exists], ...nu }; } else { users.push(nu); }
    lsSet('kirengaUsers', users);
    return nu;
  },

  async getUserByEmail(email) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      const result = await RTDB.getUserByEmail(email);
      if (result) return result;
    }
    return lsGet('kirengaUsers', []).find(u => u.email === email) || null;
  },

  async getUserByUid(uid) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      const result = await RTDB.getUserByUid(uid);
      if (result) return result;
    }
    return lsGet('kirengaUsers', []).find(u => u.firebaseUid === uid) || null;
  },

  async updateUser(id, data) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      const result = await RTDB.updateUser(id, data);
      if (result) {
        // Mirror update to localStorage so session restore always works
        const users = lsGet('kirengaUsers', []);
        const i = users.findIndex(u => u.id === id || u.email === data.email);
        if (i > -1) { users[i] = { ...users[i], ...data }; lsSet('kirengaUsers', users); }
        return result;
      }
      console.warn('⚠️ RTDB updateUser failed — updating locally');
    }
    const users = lsGet('kirengaUsers', []);
    const i = users.findIndex(u => u.id === id);
    if (i > -1) { users[i] = { ...users[i], ...data }; lsSet('kirengaUsers', users); }
    return true;
  },

  async getPosts() {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      const result = await RTDB.getPosts();
      if (result && result.length > 0) return result;
      // Empty array could be legit OR permission denied — merge with localStorage
      const local = lsGet('kirengaBlogPosts', []);
      return result !== null ? [...result, ...local.filter(lp => !result.find(rp => rp.id === lp.id))] : local;
    }
    return lsGet('kirengaBlogPosts', []);
  },

  async createPost(p) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      const result = await RTDB.createPost(p);
      if (result) {
        // Mirror to localStorage for offline resilience
        const posts = lsGet('kirengaBlogPosts', []);
        posts.unshift(result); lsSet('kirengaBlogPosts', posts);
        return result;
      }
      console.warn('⚠️ RTDB createPost failed (check Firebase rules) — saving locally');
    }
    const posts = lsGet('kirengaBlogPosts', []);
    const np = { ...p, id: Date.now().toString(36) + Math.random().toString(36).slice(2), iso: new Date().toISOString(), date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), reactions: {}, myReactions: {}, comments: [] };
    posts.unshift(np); lsSet('kirengaBlogPosts', posts); return np;
  },

  async deletePost(id) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) await RTDB.deletePost(id); // best-effort
    lsSet('kirengaBlogPosts', lsGet('kirengaBlogPosts', []).filter(x => x.id !== id));
    return true;
  },

  // app-8.js calls: DB.setReaction(postId, userEmail, userId, emoji)
  async setReaction(postId, userEmail, userId, emoji) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.setReaction(postId, userEmail, emoji);
    return true;
  },

  async getComments(postId) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      const result = await RTDB.getComments(postId);
      if (result) return result;
    }
    return lsGet('kirengaBlogPosts', []).find(p => p.id === postId)?.comments || [];
  },

  async addComment(postId, parentId, author, text) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      const result = await RTDB.addComment(postId, parentId, author, text);
      if (result) return result;
      console.warn('⚠️ RTDB addComment failed (check Firebase rules) — saving locally');
    }
    const posts = lsGet('kirengaBlogPosts', []);
    const idx = posts.findIndex(p => p.id === postId);
    if (idx === -1) return null;
    const c = { id: Date.now().toString(36), postId, parentId: parentId || null, author: author.name, username: author.username || '', email: author.email, text, likes: 0, likedBy: [], replies: [], iso: new Date().toISOString() };
    posts[idx].comments = posts[idx].comments || [];
    posts[idx].comments.push(c);
    lsSet('kirengaBlogPosts', posts);
    return c;
  },

  // app-8.js calls: DB.likeComment(commentId, userEmail, liked)
  // RTDB.likeComment expects: (postId, commentId, userId)
  // We accept the app-8.js signature and forward to RTDB as best-effort.
  // Without postId the RTDB can't pinpoint the comment path, so we
  // fall through to the localStorage path which handles toggle correctly.
  async likeComment(commentId, userEmail, liked) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      // Best-effort: RTDB likeComment needs postId. Without it, skip RTDB
      // and let app-8.js manage the local posts array + savePosts().
      return true;
    }
    // localStorage fallback: toggle likedBy array in stored posts
    const posts = lsGet('kirengaBlogPosts', []);
    const toggle = (arr) => {
      for (const c of arr) {
        if (c.id === commentId) {
          c.likedBy = c.likedBy || [];
          const i = c.likedBy.indexOf(userEmail);
          if (liked) { // currently liked → unlike
            if (i > -1) { c.likedBy.splice(i, 1); c.likes = Math.max(0, (c.likes || 1) - 1); }
          } else { // not liked → like
            if (i === -1) { c.likedBy.push(userEmail); c.likes = (c.likes || 0) + 1; }
          }
          return true;
        }
        if (c.replies && toggle(c.replies)) return true;
      }
    };
    posts.forEach(p => { if (p.comments) toggle(p.comments); });
    lsSet('kirengaBlogPosts', posts);
    return true;
  },

  // ── isReady getter — true once Firebase RTDB is connected ──────────────
  get isReady() {
    return DB_READY && RTDB.initialized;
  },

  // ── subscribe (newsletter) ─────────────────────────────────────────────
  async subscribe(email) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      try {
        const { ref, get, set } = RTDB.modules;
        const key = email.replace(/[.#$/[\]]/g, '-');
        const snap = await get(ref(RTDB.db, 'subscribers/' + key));
        if (snap.exists()) return 'already';
        await set(ref(RTDB.db, 'subscribers/' + key), { email, subscribedAt: new Date().toISOString() });
        return 'ok';
      } catch (e) { console.error('❌ subscribe failed:', e.message); }
    }
    // localStorage fallback
    const s = lsGet('kirengaSubs', []);
    if (s.includes(email)) return 'already';
    s.push(email); lsSet('kirengaSubs', s); return 'ok';
  },

  // ── sendContact ────────────────────────────────────────────────────────
  async sendContact(d) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      try {
        const { ref, push } = RTDB.modules;
        await push(ref(RTDB.db, 'messages'), { ...d, date: new Date().toLocaleString() });
        return true;
      } catch (e) { console.error('❌ sendContact failed:', e.message); }
    }
    const m = lsGet('kirengaMessages', []);
    m.unshift({ ...d, date: new Date().toLocaleString() }); lsSet('kirengaMessages', m); return true;
  },

  // ── sendFeedback ───────────────────────────────────────────────────────
  async sendFeedback(d) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      try {
        const { ref, push } = RTDB.modules;
        await push(ref(RTDB.db, 'feedbacks'), { ...d, date: new Date().toLocaleString() });
        return true;
      } catch (e) { console.error('❌ sendFeedback failed:', e.message); }
    }
    const f = lsGet('kirengaFeedbacks', []);
    f.unshift({ ...d, date: new Date().toLocaleString() }); lsSet('kirengaFeedbacks', f); return true;
  },

  // ── saveMedia ──────────────────────────────────────────────────────────
  async saveMedia(mediaItem) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) {
      try {
        const { ref, push } = RTDB.modules;
        await push(ref(RTDB.db, 'media'), { ...mediaItem, uploadedAt: new Date().toISOString() });
        return true;
      } catch (e) { console.error('❌ saveMedia failed:', e.message); }
    }
    return true;
  },

  // ── subscribeToPostChanges (real-time listener) ────────────────────────
  subscribeToPostChanges(onAdded, onRemoved) {
    if (!DB_READY || !RTDB.initialized || !RTDB.db) return null;
    // Import onChildAdded/onChildRemoved dynamically
    import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js').then(({ ref, onChildAdded, onChildRemoved }) => {
      onChildAdded(ref(RTDB.db, 'posts'), (snap) => { if (snap.exists() && onAdded) onAdded(snap.val()); });
      onChildRemoved(ref(RTDB.db, 'posts'), (snap) => { if (snap.exists() && onRemoved) onRemoved(snap.key); });
    }).catch(e => console.error('❌ subscribeToPostChanges failed:', e.message));
    return true;
  }
};

// Initialize eagerly so it's ready before the user clicks anything
RTDB.init();
