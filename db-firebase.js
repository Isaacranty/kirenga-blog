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

      // ✅ Set window.__firebaseApp IMMEDIATELY after app creation
      // so oauth-firebase.js polling finds it as fast as possible
      window.__firebaseApp = this.app;

      this.db = getDatabase(this.app);
      this.modules = { ref, get, set, push, update, remove };
      this.initialized = true;

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
    if (!this.db) return null;
    try {
      const { ref, update } = this.modules;
      const path = `posts/${postId}/reactions/${emoji}`;
      const snapshot = await (await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js')).get(ref(this.db, path));
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
  },

// ══ NEWS FEED DB METHODS ══

  async saveNews(items) {
    if (!this.db) return null;
    try {
      const { ref, set } = this.modules;
      // Save as object keyed by index for fast retrieval
      const data = {};
      items.forEach((item, i) => {
        data[i] = {
          title:       item.title || '',
          link:        item.link  || '',
          description: item.description || '',
          image:       item.image || '',
          date:        item.date ? new Date(item.date).toISOString() : new Date().toISOString(),
          source:      item.source || '',
          color:       item.color  || '#333',
          icon:        item.icon   || '📰',
          cat:         item.cat    || 'tech',
        };
      });
      await set(ref(this.db, 'news_cache/items'), data);
      await set(ref(this.db, 'news_cache/updated'), new Date().toISOString());
      console.log('✅ News cached to RTDB:', items.length, 'items');
      return true;
    } catch (e) {
      console.error('saveNews failed:', e.message);
      return null;
    }
  },

  async getNews() {
    if (!this.db) return null;
    try {
      const { ref, get } = this.modules;
      const snap = await get(ref(this.db, 'news_cache'));
      if (!snap.exists()) return null;
      const data = snap.val();
      if (!data || !data.items) return null;
      const items = Object.values(data.items).map(item => ({
        ...item,
        date: item.date ? new Date(item.date) : new Date(),
      }));
      return { items, updated: data.updated };
    } catch (e) {
      console.error('getNews failed:', e.message);
      return null;
    }
  },
};

// news methods added inside DB object below

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
  },

  async updateUser(id, data) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.updateUser(id, data);
    const users = lsGet('kirengaUsers', []);
    const i = users.findIndex(u => u.id === id);
    if (i > -1) { users[i] = { ...users[i], ...data }; lsSet('kirengaUsers', users); }
    return true;
  },

  async getPosts() {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.getPosts();
    console.warn('⚠️ Falling back to localStorage for getPosts');
    return lsGet('kirengaBlogPosts', []);
  },

  async createPost(p) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.createPost(p);
    console.warn('⚠️ Falling back to localStorage for createPost');
    const posts = lsGet('kirengaBlogPosts', []);
    const np = { ...p, id: Date.now().toString(36) + Math.random().toString(36).slice(2), iso: new Date().toISOString(), date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), reactions: {}, myReactions: {}, comments: [] };
    posts.unshift(np); lsSet('kirengaBlogPosts', posts); return np;
  },

  async deletePost(id) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.deletePost(id);
    console.warn('⚠️ Falling back to localStorage for deletePost');
    lsSet('kirengaBlogPosts', lsGet('kirengaBlogPosts', []).filter(x => x.id !== id));
    return true;
  },

  async setReaction(postId, userId, emoji) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.setReaction(postId, userId, emoji);
    return true;
  },

  async getComments(postId) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.getComments(postId);
    console.warn('⚠️ Falling back to localStorage for getComments');
    return lsGet('kirengaBlogPosts', []).find(p => p.id === postId)?.comments || [];
  },

  async addComment(postId, parentId, author, text) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.addComment(postId, parentId, author, text);
    console.warn('⚠️ Falling back to localStorage for addComment');
    const posts = lsGet('kirengaBlogPosts', []);
    const idx = posts.findIndex(p => p.id === postId);
    if (idx === -1) return null;
    const c = { id: Date.now().toString(36), postId, parentId: parentId || null, author: author.name, username: author.username || '', email: author.email, text, likes: 0, likedBy: [], replies: [], iso: new Date().toISOString() };
    posts[idx].comments = posts[idx].comments || [];
    posts[idx].comments.push(c);
    lsSet('kirengaBlogPosts', posts);
    return c;
  },

  async likeComment(postId, commentId, userId) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.likeComment(postId, commentId, userId);
    return true;
  },

  // ✅ News cache methods — merged here to avoid Object.assign before declaration
  async saveNews(items) {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.saveNews(items);
    try {
      localStorage.setItem('kirengaNewsCache', JSON.stringify(items));
      localStorage.setItem('kirengaNewsCacheTime', new Date().toISOString());
    } catch(e) {}
    return true;
  },

  async getNews() {
    await RTDB.init();
    if (DB_READY && RTDB.initialized) return await RTDB.getNews();
    const cached = localStorage.getItem('kirengaNewsCache');
    const updated = localStorage.getItem('kirengaNewsCacheTime');
    if (!cached) return null;
    return { items: JSON.parse(cached), updated };
  }
};

// Initialize eagerly so it's ready before the user clicks anything
RTDB.init();
