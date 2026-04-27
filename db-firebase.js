/* ═══════════════════════════════════════════════════════════════
   Kirenga Blog — db-firebase.js  (Firebase Database Layer)
   Uses Firebase Firestore or Realtime Database for cloud storage.
   Falls back gracefully to localStorage if not configured.

   HOW TO SET UP FIREBASE:
   1. Go to https://console.firebase.google.com → Create a new project
   2. Enable Firestore Database (or Realtime Database)
   3. Go to Project Settings (gear icon) → Service Accounts
   4. Click "Generate New Private Key" to download JSON file
   5. Copy the config values below
   6. Reload your site — the badge changes to 🔵 Firebase DB

═══════════════════════════════════════════════════════════════ */

'use strict';

/* ════════════════════════════════════════════════════════════
   ▶ STEP 1: PASTE YOUR FIREBASE CREDENTIALS HERE
════════════════════════════════════════════════════════════ */
const FIREBASE_CONFIG = {
  apiKey:             'AIzaSyAq3YgnSH3bGGglJugzpBpiOBgoAbEaNCE',                  // ← replace
  authDomain:         'kirenga-blog.firebaseapp.com',       // ← replace
  projectId:          'kirenga-blog',                    // ← replace
  storageBucket:      'kirenga-blog.firebasestorage.app',           // ← replace
  messagingSenderId:  '113895235074',           // ← replace
  appId:              '1:113895235074:web:2edd1553f4012c8fad911b',                   // ← replace
};

// Choose your Firebase Database:
// - 'realtimedb' for Realtime Database (RECOMMENDED - simpler, JSON-based) ✅
// - 'firestore' for Firestore (more features, but more complex)
const FIREBASE_DB_TYPE = 'realtimedb';  // ← Realtime DB is simpler!

/* ════════════════════════════════════════════════════════════
   DB MODE DETECTION
════════════════════════════════════════════════════════════ */
const DB_READY = (
  FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY_HERE' &&
  FIREBASE_CONFIG.projectId !== 'your-project-id' &&
  FIREBASE_CONFIG.projectId.length > 3
);

/* Status badge shown at the bottom-left of the page */
function showDbStatus() {
  const existing = document.getElementById('db-status-badge');
  if (existing) existing.remove();
  const badge = document.createElement('div');
  badge.id = 'db-status-badge';
  badge.style.cssText = 'position:fixed;bottom:80px;left:16px;z-index:99998;padding:6px 12px;border-radius:50px;font-size:.72rem;font-weight:700;font-family:DM Sans,sans-serif;letter-spacing:.3px;box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer;transition:opacity .3s ease;';
  badge.title = DB_READY ? `Connected to Firebase ${FIREBASE_DB_TYPE} database` : 'Using localStorage. Add Firebase credentials to db-firebase.js to enable cloud sync.';
  if (DB_READY) { badge.style.background = '#1f2937'; badge.style.color = '#ffa500'; badge.innerHTML = `🔵 Firebase (${FIREBASE_DB_TYPE})`; }
  else { badge.style.background = '#f9ab00'; badge.style.color = '#1c1c2e'; badge.innerHTML = '🟡 Local Storage'; }
  document.body.appendChild(badge);
  setTimeout(() => { badge.style.opacity = '0'; setTimeout(() => badge.remove(), 400); }, 7000);
  badge.addEventListener('click', () => badge.remove());
}

/* ════════════════════════════════════════════════════════════
   LOCAL STORAGE HELPERS
════════════════════════════════════════════════════════════ */
function lsGet(key, def = null) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } }
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn('localStorage full'); } }

/* ════════════════════════════════════════════════════════════
   DATA NORMALISATION  (Firebase doc → app object)
════════════════════════════════════════════════════════════ */
function normalisePost(doc) {
  const data = doc.data ? doc.data() : doc;
  return {
    id:          doc.id || data.id,
    title:       data.title || '',
    content:     data.content || '',
    category:    data.category || 'General',
    tags:        data.tags || [],
    image:       data.image || null,
    authorName:  data.authorName || 'Anonymous',
    authorId:    data.authorId || null,
    reactions:   data.reactions || {},
    myReactions: {},
    comments:    [],
    iso:         data.createdAt || new Date().toISOString(),
    date:        new Date(data.createdAt || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  };
}

function normaliseUser(doc) {
  const data = doc.data ? doc.data() : doc;
  return {
    id:          doc.id || data.id,
    name:        data.name || '',
    username:    data.username || '',
    email:       data.email || '',
    via:         data.via || 'email',
    bio:         data.bio || '',
    website:     data.website || '',
    profilePic:  data.profilePic || null,
    password:    data.password || '',
    joined:      data.joinedAt || new Date().toISOString(),
  };
}

function normaliseComment(doc) {
  const data = doc.data ? doc.data() : doc;
  return {
    id:        doc.id || data.id,
    postId:    data.postId || '',
    parentId:  data.parentId || null,
    author:    data.authorName || '',
    username:  data.authorUsername || '',
    email:     data.authorEmail || '',
    via:       data.authorVia || 'email',
    text:      data.text || '',
    likes:     data.likes || 0,
    likedBy:   data.likedBy || [],
    replies:   [],
    iso:       data.createdAt || new Date().toISOString(),
  };
}

/* ════════════════════════════════════════════════════════════
   FIREBASE FIRESTORE OPERATIONS
════════════════════════════════════════════════════════════ */
const FSO = {
  db: null,
  initialized: false,

  async init() {
    if (!DB_READY || this.initialized) return;
    try {
      // Import Firebase modules from CDN
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
      const { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, limit, where, getDoc, writeBatch, Timestamp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
      
      // Initialize Firebase
      const app = initializeApp(FIREBASE_CONFIG);
      this.db = getFirestore(app);
      this.Timestamp = Timestamp;
      this.modules = { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, limit, where, getDoc, writeBatch };
      this.initialized = true;
      console.log('✅ Firestore initialized successfully');
    } catch (e) {
      console.error('❌ Firestore init failed:', e.message);
      this.initialized = false;
    }
  },

  async getPosts() {
    if (!this.db) return [];
    try {
      const { collection, getDocs, query, orderBy, limit } = this.modules;
      const q = query(collection(this.db, 'posts'), orderBy('createdAt', 'desc'), limit(200));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => normalisePost(doc));
    } catch (e) {
      console.error('❌ Firestore getPosts failed:', e.message);
      return [];
    }
  },

  async createPost(post) {
    if (!this.db) return null;
    try {
      const { collection, addDoc, Timestamp } = this.modules;
      const docRef = await addDoc(collection(this.db, 'posts'), {
        title:       post.title,
        content:     post.content,
        category:    post.category || 'General',
        tags:        post.tags || [],
        image:       post.image || null,
        authorName:  post.authorName || 'Anonymous',
        authorId:    post.authorId || null,
        reactions:   {},
        createdAt:   Timestamp.now(),
        updatedAt:   Timestamp.now(),
      });
      return normalisePost({ id: docRef.id, data: () => post });
    } catch (e) {
      console.error('❌ Firestore createPost failed:', e.message);
      return null;
    }
  },

  async updatePost(id, updates) {
    if (!this.db) return false;
    try {
      const { doc, updateDoc, Timestamp } = this.modules;
      await updateDoc(doc(this.db, 'posts', id), {
        ...updates,
        updatedAt: Timestamp.now(),
      });
      return true;
    } catch (e) {
      console.error('❌ Firestore updatePost failed:', e.message);
      return false;
    }
  },

  async deletePost(id) {
    if (!this.db) return false;
    try {
      const { doc, deleteDoc } = this.modules;
      await deleteDoc(doc(this.db, 'posts', id));
      return true;
    } catch (e) {
      console.error('❌ Firestore deletePost failed:', e.message);
      return false;
    }
  },

  async createUser(data) {
    if (!this.db) return null;
    try {
      const { collection, addDoc, Timestamp } = this.modules;
      const docRef = await addDoc(collection(this.db, 'users'), {
        name:      data.name,
        username:  data.username,
        email:     data.email,
        password:  data.password || '',
        via:       data.via || 'email',
        bio:       data.bio || '',
        website:   data.website || '',
        joinedAt:  Timestamp.now(),
      });
      return normaliseUser({ id: docRef.id, data: () => data });
    } catch (e) {
      console.error('❌ Firestore createUser failed:', e.message);
      return null;
    }
  },

  async getUserByEmail(email) {
    if (!this.db) return null;
    try {
      const { collection, getDocs, query, where } = this.modules;
      const q = query(collection(this.db, 'users'), where('email', '==', email));
      const snapshot = await getDocs(q);
      return snapshot.empty ? null : normaliseUser(snapshot.docs[0]);
    } catch (e) {
      console.error('❌ Firestore getUserByEmail failed:', e.message);
      return null;
    }
  },

  async setReaction(postId, userEmail, userId, reactionKey) {
    if (!this.db) return false;
    try {
      const { doc, updateDoc } = this.modules;
      const field = `reactions.${userEmail}`;
      await updateDoc(doc(this.db, 'posts', postId), {
        [field]: reactionKey || null,
      });
      return true;
    } catch (e) {
      console.error('❌ Firestore setReaction failed:', e.message);
      return false;
    }
  },

  async addComment(postId, comment) {
    if (!this.db) return null;
    try {
      const { collection, addDoc, Timestamp } = this.modules;
      const docRef = await addDoc(collection(this.db, 'comments'), {
        postId:        postId,
        parentId:      comment.parentId || null,
        authorName:    comment.author || 'Anonymous',
        authorEmail:   comment.email,
        authorUsername: comment.username || '',
        authorVia:     comment.via || 'email',
        text:          comment.text,
        likes:         0,
        likedBy:       [],
        createdAt:     Timestamp.now(),
      });
      return normaliseComment({ id: docRef.id, data: () => comment });
    } catch (e) {
      console.error('❌ Firestore addComment failed:', e.message);
      return null;
    }
  },

  async getComments(postId) {
    if (!this.db) return [];
    try {
      const { collection, getDocs, query, where } = this.modules;
      const q = query(collection(this.db, 'comments'), where('postId', '==', postId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => normaliseComment(doc));
    } catch (e) {
      console.error('❌ Firestore getComments failed:', e.message);
      return [];
    }
  },

  async deleteComment(commentId) {
    if (!this.db) return false;
    try {
      const { doc, deleteDoc } = this.modules;
      await deleteDoc(doc(this.db, 'comments', commentId));
      return true;
    } catch (e) {
      console.error('❌ Firestore deleteComment failed:', e.message);
      return false;
    }
  },
};

/* ════════════════════════════════════════════════════════════
   FIREBASE REALTIME DATABASE OPERATIONS
════════════════════════════════════════════════════════════ */
const RTDB = {
  db: null,
  initialized: false,

  async init() {
    if (!DB_READY || this.initialized) return;
    try {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
      const { getDatabase, ref, push, get, update, remove, onValue, query, orderByChild, limitToLast, set } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js');
      
      const app = initializeApp(FIREBASE_CONFIG);
      this.db = getDatabase(app);
      this.modules = { ref, push, get, update, remove, onValue, query, orderByChild, limitToLast, set };
      this.initialized = true;
      console.log('✅ Realtime Database initialized successfully');
    } catch (e) {
      console.error('❌ Realtime DB init failed:', e.message);
      this.initialized = false;
    }
  },

  async getPosts() {
    if (!this.db) return [];
    try {
      const { ref, get, query, orderByChild, limitToLast } = this.modules;
      const postsRef = ref(this.db, 'posts');
      const snapshot = await get(postsRef);
      if (!snapshot.exists()) return [];
      const posts = [];
      snapshot.forEach((child) => {
        posts.push(normalisePost({ id: child.key, data: () => child.val() }));
      });
      return posts.reverse().slice(0, 200); // Most recent first
    } catch (e) {
      console.error('❌ RTDB getPosts failed:', e.message);
      return [];
    }
  },

  async createPost(post) {
    if (!this.db) return null;
    try {
      const { ref, push } = this.modules;
      const postsRef = ref(this.db, 'posts');
      const newPostRef = await push(postsRef, {
        title:       post.title,
        content:     post.content,
        category:    post.category || 'General',
        tags:        post.tags || [],
        image:       post.image || null,
        authorName:  post.authorName || 'Anonymous',
        authorId:    post.authorId || null,
        reactions:   {},
        createdAt:   new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
      });
      return normalisePost({ id: newPostRef.key, data: () => post });
    } catch (e) {
      console.error('❌ RTDB createPost failed:', e.message);
      return null;
    }
  },

  async updatePost(id, updates) {
    if (!this.db) return false;
    try {
      const { ref, update } = this.modules;
      const postRef = ref(this.db, `posts/${id}`);
      await update(postRef, { ...updates, updatedAt: new Date().toISOString() });
      return true;
    } catch (e) {
      console.error('❌ RTDB updatePost failed:', e.message);
      return false;
    }
  },

  async deletePost(id) {
    if (!this.db) return false;
    try {
      const { ref, remove } = this.modules;
      await remove(ref(this.db, `posts/${id}`));
      return true;
    } catch (e) {
      console.error('❌ RTDB deletePost failed:', e.message);
      return false;
    }
  },

  async createUser(data) {
    if (!this.db) return null;
    try {
      const { ref, push } = this.modules;
      const usersRef = ref(this.db, 'users');
      const newUserRef = await push(usersRef, {
        name:      data.name,
        username:  data.username,
        email:     data.email,
        password:  data.password || '',
        via:       data.via || 'email',
        bio:       data.bio || '',
        website:   data.website || '',
        joinedAt:  new Date().toISOString(),
      });
      return normaliseUser({ id: newUserRef.key, data: () => data });
    } catch (e) {
      console.error('❌ RTDB createUser failed:', e.message);
      return null;
    }
  },

  async getUserByEmail(email) {
    if (!this.db) return null;
    try {
      const { ref, get } = this.modules;
      const usersRef = ref(this.db, 'users');
      const snapshot = await get(usersRef);
      if (!snapshot.exists()) return null;
      let found = null;
      snapshot.forEach((child) => {
        if (child.val().email === email) {
          found = normaliseUser({ id: child.key, data: () => child.val() });
        }
      });
      return found;
    } catch (e) {
      console.error('❌ RTDB getUserByEmail failed:', e.message);
      return null;
    }
  },

  async setReaction(postId, userEmail, userId, reactionKey) {
    if (!this.db) return false;
    try {
      const { ref, update, set } = this.modules;
      if (reactionKey) {
        await update(ref(this.db, `posts/${postId}/reactions`), { [userEmail]: reactionKey });
      } else {
        await update(ref(this.db, `posts/${postId}/reactions`), { [userEmail]: null });
      }
      return true;
    } catch (e) {
      console.error('❌ RTDB setReaction failed:', e.message);
      return false;
    }
  },

  async addComment(postId, comment) {
    if (!this.db) return null;
    try {
      const { ref, push } = this.modules;
      const commentsRef = ref(this.db, `comments/${postId}`);
      const newCommentRef = await push(commentsRef, {
        authorName:    comment.author || 'Anonymous',
        authorEmail:   comment.email,
        authorUsername: comment.username || '',
        authorVia:     comment.via || 'email',
        text:          comment.text,
        likes:         0,
        likedBy:       [],
        createdAt:     new Date().toISOString(),
      });
      return normaliseComment({ id: newCommentRef.key, data: () => comment });
    } catch (e) {
      console.error('❌ RTDB addComment failed:', e.message);
      return null;
    }
  },

  async getComments(postId) {
    if (!this.db) return [];
    try {
      const { ref, get } = this.modules;
      const commentsRef = ref(this.db, `comments/${postId}`);
      const snapshot = await get(commentsRef);
      if (!snapshot.exists()) return [];
      const comments = [];
      snapshot.forEach((child) => {
        comments.push(normaliseComment({ id: child.key, data: () => child.val() }));
      });
      return comments;
    } catch (e) {
      console.error('❌ RTDB getComments failed:', e.message);
      return [];
    }
  },

  async deleteComment(commentId) {
    if (!this.db) return false;
    try {
      const { ref, remove } = this.modules;
      await remove(ref(this.db, `comments/${commentId}`));
      return true;
    } catch (e) {
      console.error('❌ RTDB deleteComment failed:', e.message);
      return false;
    }
  },
};

/* ════════════════════════════════════════════════════════════
   DB PUBLIC API (Automatically chooses Firebase or localStorage)
════════════════════════════════════════════════════════════ */
const DB = {
  isReady: DB_READY,

  async init() {
    if (!DB_READY) return;
    if (FIREBASE_DB_TYPE === 'firestore') {
      await FSO.init();
    } else if (FIREBASE_DB_TYPE === 'realtimedb') {
      await RTDB.init();
    }
  },

  /* ── POSTS ─────────────────────────────────────────── */
  async getPosts() {
    if (!DB_READY) return lsGet('kirengaBlogPosts', []);
    const posts = FIREBASE_DB_TYPE === 'firestore' ? await FSO.getPosts() : await RTDB.getPosts();
    return posts.length > 0 ? posts : lsGet('kirengaBlogPosts', []);
  },

  async createPost(post) {
    if (!DB_READY) {
      const posts = lsGet('kirengaBlogPosts', []);
      const np = { ...post, id: Date.now().toString(36) + Math.random().toString(36).slice(2), iso: new Date().toISOString(), date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), reactions: {}, myReactions: {}, comments: [] };
      posts.unshift(np);
      lsSet('kirengaBlogPosts', posts);
      return np;
    }
    try {
      const created = FIREBASE_DB_TYPE === 'firestore' ? await FSO.createPost(post) : await RTDB.createPost(post);
      if (created) return created;
      throw new Error('Failed to create post');
    } catch (e) {
      console.warn('DB createPost failed, fallback to localStorage', e.message);
      const posts = lsGet('kirengaBlogPosts', []);
      const np = { ...post, id: Date.now().toString(36), iso: new Date().toISOString(), date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), reactions: {}, myReactions: {}, comments: [] };
      posts.unshift(np);
      lsSet('kirengaBlogPosts', posts);
      return np;
    }
  },

  async updatePost(id, updates) {
    if (!DB_READY) {
      const posts = lsGet('kirengaBlogPosts', []);
      const idx = posts.findIndex(p => p.id === id);
      if (idx >= 0) { posts[idx] = { ...posts[idx], ...updates }; lsSet('kirengaBlogPosts', posts); return true; }
      return false;
    }
    return FIREBASE_DB_TYPE === 'firestore' ? await FSO.updatePost(id, updates) : await RTDB.updatePost(id, updates);
  },

  async deletePost(id) {
    if (!DB_READY) {
      lsSet('kirengaBlogPosts', lsGet('kirengaBlogPosts', []).filter(p => p.id !== id));
      return true;
    }
    return FIREBASE_DB_TYPE === 'firestore' ? await FSO.deletePost(id) : await RTDB.deletePost(id);
  },

  /* ── USERS ─────────────────────────────────────────── */
  async createUser(data) {
    if (!DB_READY) {
      const users = lsGet('kirengaUsers', []);
      const nu = { ...data, id: Date.now().toString(36), joined: new Date().toISOString() };
      users.push(nu);
      lsSet('kirengaUsers', users);
      return normaliseUser({ id: nu.id, data: () => nu });
    }
    const created = FIREBASE_DB_TYPE === 'firestore' ? await FSO.createUser(data) : await RTDB.createUser(data);
    return created || null;
  },

  async getUserByEmail(email) {
    if (!DB_READY) return lsGet('kirengaUsers', []).find(u => u.email === email) || null;
    return FIREBASE_DB_TYPE === 'firestore' ? await FSO.getUserByEmail(email) : await RTDB.getUserByEmail(email);
  },

  async setReaction(postId, userEmail, userId, reactionKey) {
    if (!DB_READY) {
      const posts = lsGet('kirengaBlogPosts', []);
      const post = posts.find(p => p.id === postId);
      if (post) {
        post.reactions = post.reactions || {};
        if (reactionKey) { post.reactions[userEmail] = reactionKey; }
        else { delete post.reactions[userEmail]; }
        lsSet('kirengaBlogPosts', posts);
      }
      return !!post;
    }
    return FIREBASE_DB_TYPE === 'firestore' ? await FSO.setReaction(postId, userEmail, userId, reactionKey) : await RTDB.setReaction(postId, userEmail, userId, reactionKey);
  },

  async addComment(postId, comment) {
    if (!DB_READY) {
      const posts = lsGet('kirengaBlogPosts', []);
      const post = posts.find(p => p.id === postId);
      if (post) {
        const nc = { ...comment, id: Date.now().toString(36), iso: new Date().toISOString(), likes: 0, likedBy: [], replies: [] };
        post.comments = post.comments || [];
        post.comments.push(nc);
        lsSet('kirengaBlogPosts', posts);
        return nc;
      }
      return null;
    }
    return FIREBASE_DB_TYPE === 'firestore' ? await FSO.addComment(postId, comment) : await RTDB.addComment(postId, comment);
  },

  async getComments(postId) {
    if (!DB_READY) {
      const posts = lsGet('kirengaBlogPosts', []);
      const post = posts.find(p => p.id === postId);
      return post ? (post.comments || []) : [];
    }
    return FIREBASE_DB_TYPE === 'firestore' ? await FSO.getComments(postId) : await RTDB.getComments(postId);
  },

  async deleteComment(commentId) {
    if (!DB_READY) {
      const posts = lsGet('kirengaBlogPosts', []);
      posts.forEach(p => {
        p.comments = (p.comments || []).filter(c => c.id !== commentId);
      });
      lsSet('kirengaBlogPosts', posts);
      return true;
    }
    return FIREBASE_DB_TYPE === 'firestore' ? await FSO.deleteComment(commentId) : await RTDB.deleteComment(commentId);
  },
};

/* ════════════════════════════════════════════════════════════
   INITIALIZE DATABASE ON PAGE LOAD
════════════════════════════════════════════════════════════ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    DB.init().catch(e => console.error('DB init error:', e));
  });
} else {
  DB.init().catch(e => console.error('DB init error:', e));
}
