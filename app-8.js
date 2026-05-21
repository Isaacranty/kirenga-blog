/* ═══════════════════════════════════════════════════════
   Kirenga Blog — app.js  v3.0 Final
   Drawer · Panels · Posts · Auth · Reactions · Comments
   Replies · Share · Chatbot · DB integration
═══════════════════════════════════════════════════════ */
'use strict';

/* ── Safety guard: stub DB if db-firebase.js not loaded ───────── */
if (typeof DB === 'undefined') {
  window.lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
  window.lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  window.DB = {
    isReady: false,
    async getPosts() { return lsGet('kirengaBlogPosts', []); },
    async createPost(p) {
      const posts = lsGet('kirengaBlogPosts', []);
      const np = { ...p, id: Date.now().toString(36) + Math.random().toString(36).slice(2), iso: new Date().toISOString(), date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), reactions: {}, myReactions: {}, comments: [] };
      posts.unshift(np); lsSet('kirengaBlogPosts', posts); return np;
    },
    async deletePost(id) { lsSet('kirengaBlogPosts', lsGet('kirengaBlogPosts', []).filter(x => x.id !== id)); return true; },
    async getUserByEmail(email) { return lsGet('kirengaUsers', []).find(u => u.email === email) || null; },
    async createUser(d) { const users = lsGet('kirengaUsers', []); const nu = { ...d, id: Date.now().toString(36), joined_at: new Date().toISOString() }; users.push(nu); lsSet('kirengaUsers', users); return nu; },
    async updateUser(id, data) { const users = lsGet('kirengaUsers', []); const i = users.findIndex(u => u.id === id || u.email === data.email); if (i > -1) { users[i] = { ...users[i], ...data }; lsSet('kirengaUsers', users); } return true; },
    async setReaction() { return true; },
    async getComments(postId) { return lsGet('kirengaBlogPosts', []).find(p => p.id === postId)?.comments || []; },
    async addComment(postId, parentId, author, text) {
      const posts = lsGet('kirengaBlogPosts', []);
      const idx = posts.findIndex(p => p.id === postId);
      if (idx === -1) return null;
      const c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), postId, parentId: parentId || null, author: author.name, username: author.username || '', email: author.email, via: author.via || 'email', profilePic: author.profilePic || null, text, likes: 0, likedBy: [], replies: [], iso: new Date().toISOString() };
      posts[idx].comments = posts[idx].comments || [];
      if (parentId) {
        const fn = (arr) => { for (const x of arr) { if (x.id === parentId) { x.replies = x.replies || []; x.replies.push(c); return true; } if (x.replies && fn(x.replies)) return true; } };
        fn(posts[idx].comments);
      } else { posts[idx].comments.unshift(c); }
      lsSet('kirengaBlogPosts', posts); return c;
    },
    async likeComment(commentId, userEmail, liked) {
      const posts = lsGet('kirengaBlogPosts', []);
      const fn = (arr) => { for (const c of arr) { if (c.id === commentId) { c.likedBy = c.likedBy || []; const i = c.likedBy.indexOf(userEmail); if (liked) { if (i > -1) { c.likedBy.splice(i, 1); c.likes = Math.max(0, c.likes - 1); } } else { if (i === -1) { c.likedBy.push(userEmail); c.likes = (c.likes || 0) + 1; } } return true; } if (c.replies && fn(c.replies)) return true; } };
      posts.forEach(p => { if (p.comments) fn(p.comments); });
      lsSet('kirengaBlogPosts', posts); return true;
    },
    async subscribe(email) { const s = lsGet('kirengaSubs', []); if (s.includes(email)) return 'already'; s.push(email); lsSet('kirengaSubs', s); return 'ok'; },
    async sendContact(d) { const m = lsGet('kirengaMessages', []); m.unshift({ ...d, date: new Date().toLocaleString() }); lsSet('kirengaMessages', m); return true; },
    async sendFeedback(d) { const f = lsGet('kirengaFeedbacks', []); f.unshift({ ...d, date: new Date().toLocaleString() }); lsSet('kirengaFeedbacks', f); return true; },
    async saveMedia() { return true; },
    subscribeToPostChanges() { return null; },
  };
  // Stub only — real initDB() is defined below and will override this
  window._stubInitDB = async () => { console.log('%c🟡 localStorage mode (add Firebase keys to db-firebase.js for cloud DB)', 'color:#f9ab00;font-weight:700'); };
}

/* ════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════ */
let posts = [], currentUser = null, currentImageData = null;

// ── Blog owner — only this account can write/publish posts ──────────────────
const OWNER_EMAIL = 'kirengaisaac@gmail.com';
const isOwner = () => !!(currentUser && currentUser.email === OWNER_EMAIL);

/* ── reCAPTCHA Enterprise helper ───────────────────────────────
   Generates a token client-side. Server verification is optional
   — if /api/verify-recaptcha is unavailable, we still get the
   token and attach it to form submissions for future audit.
──────────────────────────────────────────────────────────────── */
async function verifyRecaptcha(action = 'submit') {
  try {
    if (typeof grecaptcha === 'undefined' || !grecaptcha.enterprise) return true;
    const token = await new Promise((resolve, reject) => {
      grecaptcha.enterprise.ready(() => {
        grecaptcha.enterprise.execute('6LfNutMsAAAAABlh3bxByzb1aitxFfCJrBAvBYTX', { action })
          .then(resolve).catch(reject);
      });
    });
    // Store token for reference
    const field = document.getElementById('signup-recaptcha-token');
    if (field) field.value = token;
    // Try server verification — if unavailable, allow through
    try {
      const res = await fetch('/api/verify-recaptcha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
        signal: AbortSignal.timeout(3000), // 3s timeout
      });
      if (res.ok) {
        const data = await res.json();
        return data.success !== false;
      }
    } catch (_) { /* server not available — allow through */ }
    return true;
  } catch (e) {
    console.warn('[reCAPTCHA] error — allowing through:', e.message);
    return true;
  }
}
let chatOpen = false, currentSort = 'newest', currentFilter = '';
let openModalIndex = null, currentRating = 0, currentFeedbackType = 'suggestion';
let mediaLibrary = [], activePanel = null;
let discountCountdownTimer = null, discountSecondsLeft = 86399;

/* ════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════ */
const AVATAR_COLORS = ['#1a73e8','#34a853','#e53935','#f9ab00','#7c3aed','#0288d1','#d81b60','#00897b'];
/* ════════════════════════════════════════════════════
   DATABASE INITIALIZATION
════════════════════════════════════════════════════ */
async function initDB() {
  if (typeof DB !== 'undefined' && typeof DB.init === 'function') {
    try {
      await DB.init();
      console.log('✅ Database initialized successfully');
      return true;
    } catch (e) {
      console.warn('⚠️ DB.init() failed, falling back to localStorage:', e.message);
      return false;
    }
  } else {
    console.warn('⚠️ DB object not found - using localStorage only');
    return false;
  }
}

function avatarColor(s) { let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h); return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]; }
function initials(n) { return (n || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function escapeHTML(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escapeJS(s) { return String(s || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"').replace(/\r?\n/g,'\\n'); }
function showAlert(id, msg, type = 'success') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `alert alert-${type} show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'alert'; }, 5000);
}
function formatDate(iso) { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function readingTime(t) { return Math.max(1, Math.round((t || '').trim().split(/\s+/).length / 200)) + ' min read'; }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function load(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }

/* ════════════════════════════════════════════════════
   DRAWER
════════════════════════════════════════════════════ */
function openDrawer() {
  document.getElementById('side-drawer')?.classList.add('open');
  document.getElementById('drawer-overlay')?.classList.add('open');
  const hb = document.getElementById('hamburger-btn');
  if (hb) { hb.classList.add('open'); hb.setAttribute('aria-expanded', 'true'); }
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  document.getElementById('side-drawer')?.classList.remove('open');
  document.getElementById('drawer-overlay')?.classList.remove('open');
  const hb = document.getElementById('hamburger-btn');
  if (hb) { hb.classList.remove('open'); hb.setAttribute('aria-expanded', 'false'); }
  document.body.style.overflow = '';
}
function drawerSearch(val) {
  const s = document.getElementById('search');
  if (s) s.value = val;
  currentFilter = val.toLowerCase().trim();
  renderPosts();
}
function updateDrawerProfile() {
  const nameEl = document.getElementById('drawer-user-name');
  const emailEl = document.getElementById('drawer-user-email');
  const avatarEl = document.getElementById('drawer-avatar');
  const loggedOut = document.getElementById('drawer-auth-logged-out');
  const loggedIn = document.getElementById('drawer-auth-logged-in');
  if (currentUser) {
    if (nameEl) nameEl.textContent = currentUser.name;
    if (emailEl) emailEl.textContent = currentUser.email;
    if (avatarEl) {
      const pic = currentUser.profilePic;
      if (pic) { avatarEl.innerHTML = `<img src="${pic}" alt="avatar">`; avatarEl.style.background = 'transparent'; }
      else { avatarEl.textContent = initials(currentUser.name); avatarEl.style.background = avatarColor(currentUser.name); }
    }
    if (loggedOut) loggedOut.hidden = true;
    if (loggedIn) loggedIn.hidden = false;
  } else {
    if (nameEl) nameEl.textContent = 'Guest';
    if (emailEl) emailEl.textContent = 'Not signed in';
    if (avatarEl) { avatarEl.textContent = '👤'; avatarEl.style.background = '#9ca3af'; }
    if (loggedOut) loggedOut.hidden = false;
    if (loggedIn) loggedIn.hidden = true;
  }
}

/* ════════════════════════════════════════════════════
   PANELS
════════════════════════════════════════════════════ */
const PANELS = ['search','settings','feedback','solutions','resources','learn','media','share','terms','privacy','admin','faq'];

function openPanel(id) {
  closeDrawer();
  PANELS.forEach(p => { const el = document.getElementById('panel-' + p); if (el) { el.hidden = true; el.classList.remove('open'); } });
  const panel = document.getElementById('panel-' + id);
  if (!panel) return;
  panel.hidden = false;
  document.getElementById('panel-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => panel.classList.add('open'));
  activePanel = id;
  if (id === 'settings') initSettingsPanel();
  if (id === 'learn') {
    initLearnPanel('html');
    const lbt = document.getElementById('lmt-languages');
    if (lbt) switchLearnMainTab('languages', lbt);
    setTimeout(() => { pgPopulateSnippetDropdown(); pgRenderSnippetGallery(); }, 200);
  }
  if (id === 'media') renderMediaGrid();
  if (id === 'search') setTimeout(() => document.getElementById('panel-search-input')?.focus(), 200);
}
function closePanel() {
  PANELS.forEach(p => { const el = document.getElementById('panel-' + p); if (el) { el.classList.remove('open'); setTimeout(() => { el.hidden = true; }, 320); } });
  document.getElementById('panel-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
  activePanel = null;
}

/* ── Search panel ──────────────────────────────────── */
function liveSearch(val) {
  const results = document.getElementById('panel-search-results');
  if (!results) return;
  const q = val.trim().toLowerCase();
  if (!q) { results.innerHTML = '<div class="panel-search-empty">Start typing to search posts…</div>'; return; }
  const matches = posts.filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.content.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q) ||
    (p.tags || []).some(t => t.includes(q))
  );
  if (!matches.length) { results.innerHTML = `<div class="panel-search-empty">No posts found for "${escapeHTML(val)}"</div>`; return; }
  results.innerHTML = matches.map(p => {
    const idx = posts.indexOf(p);
    return `<div class="panel-search-result" onclick="closePanel();openModal(${idx})">
      <div class="psr-title">${escapeHTML(p.title)}</div>
      <div class="psr-meta">${escapeHTML(p.category)} • ${escapeHTML(p.date)} • ${readingTime(p.content)}</div>
    </div>`;
  }).join('');
}

/* ── Settings panel ────────────────────────────────── */
function initSettingsPanel() {
  const settings = load('kirengaSettings', {}); const u = currentUser || {};
  const fields = { 'settings-name': settings.name || u.name || '', 'settings-username': settings.username || u.username || '', 'settings-bio': settings.bio || u.bio || '', 'settings-website': settings.website || u.website || '' };
  Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });
  updateSettingsPicPreview();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const sw = document.getElementById('dark-toggle-switch');
  if (sw) sw.classList.toggle('active', isDark);
  const lang = load('kirengaLang', 'en');
  const sl = document.getElementById('settings-lang');
  if (sl) sl.value = lang;
}
function updateSettingsPicPreview() {
  const preview = document.getElementById('profile-pic-preview');
  if (!preview) return;
  const pic = currentUser?.profilePic || load('kirengaProfilePic', null);
  if (pic) { preview.innerHTML = `<img src="${pic}" alt="Profile">`; preview.style.background = 'transparent'; }
  else { const name = currentUser?.name || 'KI'; preview.textContent = initials(name); preview.style.background = avatarColor(name); }
}
function uploadProfilePic(e) {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 3 * 1024 * 1024) { alert('Max 3 MB for profile pictures.'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const data = ev.target.result;
    save('kirengaProfilePic', data);
    if (currentUser) { currentUser.profilePic = data; save('kirengaCurrentUser', currentUser); }
    updateSettingsPicPreview(); updateAllAvatars();
  };
  reader.readAsDataURL(file);
}
function removeProfilePic() {
  localStorage.removeItem('kirengaProfilePic');
  if (currentUser) { delete currentUser.profilePic; save('kirengaCurrentUser', currentUser); }
  updateSettingsPicPreview(); updateAllAvatars();
}
function saveSettings() {
  const name = document.getElementById('settings-name')?.value.trim();
  const username = document.getElementById('settings-username')?.value.trim();
  const bio = document.getElementById('settings-bio')?.value.trim();
  const website = document.getElementById('settings-website')?.value.trim();
  save('kirengaSettings', { name, username, bio, website });
  if (currentUser && name) {
    currentUser.name = name; if (username) currentUser.username = username;
    if (bio) currentUser.bio = bio; if (website) currentUser.website = website;
    save('kirengaCurrentUser', currentUser); updateAuthUI(); updateDrawerProfile();
  }
  const sdn = document.getElementById('sidebar-display-name'); const sbt = document.getElementById('sidebar-bio-text');
  if (sdn && name) sdn.textContent = name; if (sbt && bio) sbt.textContent = bio;
  showAlert('settings-alert', '✅ Profile saved!');
}
function updateAllAvatars() {
  const pic = currentUser?.profilePic || load('kirengaProfilePic', null);
  const btn = document.getElementById('user-avatar-btn'); const initEl = document.getElementById('user-avatar-initials');
  if (btn && pic) btn.innerHTML = `<img src="${pic}" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  else if (initEl && currentUser) initEl.textContent = initials(currentUser.name);
  ['sidebar-avatar-display', 'about-avatar-display'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    if (pic) el.innerHTML = `<img src="${pic}" alt="avatar">`;
    else el.textContent = currentUser ? initials(currentUser.name) : 'KI';
  });
  updateDrawerProfile();
}
function toggleCompact() {
  document.body.classList.toggle('compact');
  const sw = document.getElementById('compact-toggle');
  if (sw) sw.classList.toggle('active', document.body.classList.contains('compact'));
}

/* ── Feedback panel ────────────────────────────────── */
function setFeedbackType(btn) { document.querySelectorAll('.feedback-type-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentFeedbackType = btn.dataset.type; }
function setRating(n) { currentRating = n; document.querySelectorAll('.star-rating button').forEach((b, i) => b.classList.toggle('lit', i < n)); }
async function submitFeedback() {
  const text = document.getElementById('feedback-text')?.value.trim();
  const email = document.getElementById('feedback-email')?.value.trim();
  if (!text) { showAlert('feedback-alert', '⚠️ Please write some feedback.', 'error'); return; }
  await DB.sendFeedback({ type: currentFeedbackType, rating: currentRating, text, email });
  showAlert('feedback-alert', '🙏 Thank you for your feedback!');
  document.getElementById('feedback-text').value = ''; document.getElementById('feedback-email').value = ''; setRating(0);
}

/* ── Learn panel ───────────────────────────────────── */
const LEARN_DATA = {
  html: { sections: [
    { title: 'What is HTML?', body: 'HTML (HyperText Markup Language) is the backbone of every webpage. It defines structure and content using elements called tags.', code: '<!DOCTYPE html>\n<html lang="en">\n  <head><title>My Page</title></head>\n  <body>\n    <h1>Hello, World!</h1>\n    <p>This is a paragraph.</p>\n  </body>\n</html>' },
    { title: 'Common Tags', body: 'Key tags: `<h1>`–`<h6>` headings, `<p>` paragraphs, `<a>` links, `<img>` images, `<ul>`/`<ol>` lists, `<div>` containers, `<span>` inline.', code: '<a href="https://example.com" target="_blank">Click here</a>\n<img src="photo.jpg" alt="A description">\n<ul>\n  <li>Item one</li>\n  <li>Item two</li>\n</ul>' },
    { title: 'Forms', body: 'Forms collect user input. Use `<form>`, `<input>`, `<textarea>`, `<select>` and `<button>`. Always add `labels` for accessibility.', code: '<form onsubmit="handleSubmit(event)">\n  <label for="name">Your name</label>\n  <input type="text" id="name" required>\n  <button type="submit">Send</button>\n</form>' },
    { title: 'Semantic HTML', body: 'Semantic tags give meaning to your structure: `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<footer>`. Better for SEO and screen readers.', code: '<header><nav><a href="#home">Home</a></nav></header>\n<main>\n  <article>\n    <h2>Post Title</h2>\n    <p>Content here...</p>\n  </article>\n</main>\n<footer><p>© 2026</p></footer>' },
  ]},
  css: { sections: [
    { title: 'Selectors & Properties', body: 'CSS controls how elements look. Target with selectors, style with properties. Use classes (`.name`) and IDs (`#name`) to target specific elements.', code: 'h1 { color: navy; font-size: 2rem; }\n.card { background: white; padding: 20px;\n  border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.1); }\n#hero { background: linear-gradient(135deg,#1a73e8,#34a853); }' },
    { title: 'Box Model', body: 'Every element is a box: content → padding → border → margin. Always use `box-sizing: border-box` so padding doesn\'t expand your element width.', code: '* { box-sizing: border-box; }\n.box {\n  width: 300px;\n  padding: 20px;\n  border: 2px solid #ddd;\n  margin: 10px auto;\n}' },
    { title: 'Flexbox', body: 'Flexbox is for 1D layouts (rows or columns). Use `display:flex`, then `justify-content`, `align-items`, and `gap` to arrange children.', code: '.nav {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  gap: 16px;\n}\n.nav a { color: white; text-decoration: none; }' },
    { title: 'CSS Grid', body: 'CSS Grid is for 2D layouts. Define columns with `grid-template-columns` and rows automatically fill in.', code: '.layout {\n  display: grid;\n  grid-template-columns: 250px 1fr;\n  gap: 24px;\n}\n.cards {\n  display: grid;\n  grid-template-columns: repeat(3,1fr);\n  gap: 16px;\n}' },
    { title: 'CSS Variables & Dark Mode', body: 'CSS custom properties (variables) make theming easy. Define them on `:root` and override for dark mode.', code: ':root {\n  --bg: #f4f6fb;\n  --text: #1c1c2e;\n  --blue: #1a73e8;\n}\n[data-theme="dark"] {\n  --bg: #0f1117;\n  --text: #e8eaf0;\n}\nbody { background: var(--bg); color: var(--text); }' },
  ]},
  js: { sections: [
    { title: 'Variables & Functions', body: 'Use `const` for values that don\'t change and `let` for values that do. Arrow functions are the modern way to write functions.', code: 'const name = "Isaac";\nlet score = 0;\nconst greet = (person) => `Hello, ${person}!`;\nconsole.log(greet(name)); // Hello, Isaac!' },
    { title: 'Arrays & Objects', body: 'Arrays store ordered lists. Objects store key-value pairs. Both are essential in JavaScript.', code: 'const fruits = ["apple","banana","cherry"];\nfruits.forEach(f => console.log(f));\n\nconst user = { name: "Isaac", age: 22 };\nconsole.log(user.name); // Isaac' },
    { title: 'DOM Manipulation', body: 'The DOM lets JS read and change HTML. Use `getElementById`, `querySelector`, `addEventListener` and `innerHTML`.', code: 'const btn = document.getElementById("myBtn");\nconst box = document.querySelector(".box");\nbtn.addEventListener("click", () => {\n  box.style.background = "coral";\n  box.textContent = "Clicked!";\n});' },
    { title: 'Fetch API & Async/Await', body: 'Fetch data from APIs using `fetch()`. Use `async/await` to keep your code clean and readable.', code: 'async function loadPosts() {\n  const res = await fetch("https://jsonplaceholder.typicode.com/posts");\n  const posts = await res.json();\n  posts.slice(0,3).forEach(p => console.log(p.title));\n}\nloadPosts();' },
    { title: 'localStorage', body: 'Store data in the browser without a server. Perfect for offline-first apps.', code: 'localStorage.setItem("theme", "dark");\nconst theme = localStorage.getItem("theme"); // "dark"\nlocalStorage.removeItem("theme");\n\n// Store objects\nconst user = { name: "Isaac", role: "admin" };\nlocalStorage.setItem("user", JSON.stringify(user));\nconst back = JSON.parse(localStorage.getItem("user"));' },
  ]},
  python: { sections: [
    { title: 'Getting Started with Python', body: 'Python is one of the most popular languages — great for beginners, web backends, data science and automation. Simple and readable syntax.', code: '# Hello World\nprint("Hello, World!")\n\n# Variables\nname = "Isaac"\nage = 22\nprint(f"My name is {name} and I am {age} years old.")' },
    { title: 'Data Types & Collections', body: 'Python has strings, integers, floats, booleans, lists, tuples, dictionaries and sets.', code: '# Lists\nfruits = ["apple", "banana", "cherry"]\nfruits.append("mango")\nprint(fruits[0]) # apple\n\n# Dictionaries\nuser = {"name": "Isaac", "age": 22}\nprint(user["name"]) # Isaac\n\n# Tuples (immutable)\ncoords = (4.0, 36.8)' },
    { title: 'Functions & Loops', body: 'Define functions with `def`. Use `for` loops to iterate over sequences, and `while` for conditional loops.', code: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("Isaac")) # Hello, Isaac!\n\nfor i in range(5):\n    print(i)  # 0 1 2 3 4\n\nnums = [1,2,3,4,5]\nsquares = [x**2 for x in nums]\nprint(squares) # [1,4,9,16,25]' },
    { title: 'File I/O & Error Handling', body: 'Read and write files with `open()`. Use `try/except` to handle errors gracefully.', code: '# Write to file\nwith open("notes.txt", "w") as f:\n    f.write("My first note")\n\n# Read from file\nwith open("notes.txt", "r") as f:\n    content = f.read()\n    print(content)\n\n# Error handling\ntry:\n    result = 10 / 0\nexcept ZeroDivisionError:\n    print("Cannot divide by zero!")' },
    { title: 'Python for Web: Flask Basics', body: 'Flask is a lightweight Python web framework. Build APIs and websites with just a few lines.', code: 'from flask import Flask, jsonify\n\napp = Flask(__name__)\n\n@app.route("/")\ndef home():\n    return "Hello from Flask!"\n\n@app.route("/api/posts")\ndef get_posts():\n    return jsonify([{"id":1,"title":"My Post"}])\n\nif __name__ == "__main__":\n    app.run(debug=True)' },
  ]},
  sql: { sections: [
    { title: 'What is SQL?', body: 'SQL (Structured Query Language) is used to manage and query relational databases. Used in MySQL, PostgreSQL, SQLite and more.', code: '-- Create a table\nCREATE TABLE posts (\n  id SERIAL PRIMARY KEY,\n  title TEXT NOT NULL,\n  content TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\n\n-- Insert a row\nINSERT INTO posts (title, content) VALUES (\'My Post\', \'Hello World!\');' },
    { title: 'SELECT Queries', body: 'Fetch data with `SELECT`. Filter with `WHERE`, sort with `ORDER BY`, and limit with `LIMIT`.', code: '-- Get all posts\nSELECT * FROM posts;\n\n-- Filter\nSELECT title, created_at FROM posts\nWHERE title LIKE \'%blog%\'\nORDER BY created_at DESC\nLIMIT 10;' },
    { title: 'JOIN & Relationships', body: 'JOINs combine rows from two tables based on a related column — great for relational data like users and posts.', code: 'SELECT p.title, u.name AS author\nFROM posts p\nINNER JOIN users u ON p.author_id = u.id\nWHERE u.name = \'Isaac\'\nORDER BY p.created_at DESC;' },
    { title: 'Firebase', body: 'Kirenga Blog uses Firebase Realtime Database. Here\'s how to query your blog data directly in the Firebase Editor.', code: '-- Count reactions per post\nSELECT p.title, COUNT(r.id) AS total_reactions\nFROM posts p\nLEFT JOIN reactions r ON r.post_id = p.id\nGROUP BY p.title\nORDER BY total_reactions DESC;' },
  ]},
  php: { sections: [
    { title: 'PHP Basics', body: 'PHP is a server-side scripting language widely used for web development. It runs on the server and outputs HTML.', code: '<?php\n  $name = "Isaac";\n  $age = 22;\n  echo "Hello, $name! You are $age years old.";\n?>' },
    { title: 'Arrays & Functions', body: 'PHP arrays can hold multiple values. Functions are defined with `function` and support default parameters.', code: '<?php\n  $fruits = ["apple", "banana", "cherry"];\n  foreach ($fruits as $fruit) {\n      echo $fruit . "\n";\n  }\n\n  function greet($name = "World") {\n      return "Hello, $name!";\n  }\n  echo greet("Isaac"); // Hello, Isaac!\n?>' },
    { title: 'PHP & MySQL', body: 'PHP connects to MySQL databases using PDO or MySQLi. Always use prepared statements to prevent SQL injection.', code: '<?php\n  $pdo = new PDO("mysql:host=localhost;dbname=blog", $user, $pass);\n  $stmt = $pdo->prepare("SELECT * FROM posts WHERE id = ?");\n  $stmt->execute([$_GET["id"]]);\n  $post = $stmt->fetch();\n  echo $post["title"];\n?>' },
  ]},
  c: { sections: [
    { title: 'C Basics', body: 'C is a low-level, compiled language that underpins most operating systems and embedded systems. Fast and precise.', code: '#include <stdio.h>\n\nint main() {\n    int age = 22;\n    char name[] = "Isaac";\n    printf("Hello, %s! Age: %d\\n", name, age);\n    return 0;\n}' },
    { title: 'Pointers', body: 'Pointers store memory addresses. They\'re fundamental to C and let you manage memory directly.', code: 'int x = 42;\nint *ptr = &x;  // ptr holds the address of x\n\nprintf("Value: %d\\n", *ptr);  // 42\nprintf("Address: %p\\n", ptr);\n\n*ptr = 100;  // changes x via the pointer\nprintf("x is now: %d\\n", x);  // 100' },
    { title: 'Structs & Memory', body: 'Structs group related data. Use `malloc` and `free` for dynamic memory allocation.', code: '#include <stdlib.h>\ntypedef struct {\n    char title[100];\n    int views;\n} Post;\n\nPost *p = malloc(sizeof(Post));\nsnprintf(p->title, 100, "My Blog Post");\np->views = 42;\nprintf("%s: %d views\\n", p->title, p->views);\nfree(p);' },
  ]},
  cpp: { sections: [
    { title: 'C++ Basics', body: 'C++ extends C with object-oriented features. Used in game development, system software and performance-critical apps.', code: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string name = "Isaac";\n    cout << "Hello, " << name << "!" << endl;\n    return 0;\n}' },
    { title: 'Classes & Objects', body: 'Classes are blueprints for objects. They encapsulate data (attributes) and behaviour (methods).', code: 'class Post {\npublic:\n    string title;\n    int views = 0;\n\n    Post(string t) : title(t) {}\n\n    void display() {\n        cout << title << " (" << views << " views)" << endl;\n    }\n};\n\nPost p("My First Post");\np.views = 42;\np.display();' },
  ]},
  java: { sections: [
    { title: 'Java Basics', body: 'Java is a strongly-typed, object-oriented language. Write once, run anywhere — it compiles to bytecode that runs on the JVM.', code: 'public class Main {\n    public static void main(String[] args) {\n        String name = "Isaac";\n        int age = 22;\n        System.out.println("Hello " + name + "! Age: " + age);\n    }\n}' },
    { title: 'Classes & Inheritance', body: 'Java is purely object-oriented. Every program is a class. Inheritance lets one class extend another.', code: 'class Animal {\n    String name;\n    Animal(String n) { this.name = n; }\n    void speak() { System.out.println(name + " makes a sound"); }\n}\n\nclass Dog extends Animal {\n    Dog(String n) { super(n); }\n    void speak() { System.out.println(name + " barks!"); }\n}\n\nDog d = new Dog("Rex");\nd.speak(); // Rex barks!' },
    { title: 'Android with Java', body: 'Android apps are built with Java (or Kotlin). A basic Activity is the entry point of any Android app.', code: 'import android.os.Bundle;\nimport android.widget.TextView;\nimport androidx.appcompat.app.AppCompatActivity;\n\npublic class MainActivity extends AppCompatActivity {\n    @Override\n    protected void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        setContentView(R.layout.activity_main);\n        TextView tv = findViewById(R.id.myText);\n        tv.setText("Hello from Java!");\n    }\n}' },
  ]},
  kotlin: { sections: [
    { title: 'Kotlin Basics', body: 'Kotlin is the modern language for Android development. It\'s concise, null-safe and fully interoperable with Java.', code: 'fun main() {\n    val name = "Isaac"  // immutable\n    var score = 0       // mutable\n    println("Hello, $name!")\n    score += 10\n    println("Score: $score")\n}' },
    { title: 'Android with Kotlin', body: 'Kotlin is the preferred language for Android. Coroutines make async code simple and clean.', code: 'class MainActivity : AppCompatActivity() {\n    override fun onCreate(savedInstanceState: Bundle?) {\n        super.onCreate(savedInstanceState)\n        setContentView(R.layout.activity_main)\n        val button = findViewById<Button>(R.id.myBtn)\n        button.setOnClickListener {\n            Toast.makeText(this, "Clicked!", Toast.LENGTH_SHORT).show()\n        }\n    }\n}' },
  ]},
  swift: { sections: [
    { title: 'Swift Basics', body: 'Swift is Apple\'s language for iOS and macOS development. Safe, fast and expressive.', code: 'let name = "Isaac"\nvar score = 0\nprint("Hello, \\(name)!")\nscore += 10\n\nlet fruits = ["apple", "banana", "cherry"]\nfor fruit in fruits {\n    print(fruit)\n}' },
    { title: 'Optionals & Safety', body: 'Swift\'s optional types prevent null pointer crashes. Use `?` to declare optionals and `if let` to safely unwrap.', code: 'var username: String? = nil\nusername = "isaac_k"\n\nif let name = username {\n    print("Welcome, \\(name)!")\n} else {\n    print("Please log in.")\n}\n\n// Nil coalescing\nlet display = username ?? "Guest"\nprint(display)' },
  ]},
  rust: { sections: [
    { title: 'Rust Basics', body: 'Rust is a systems language focused on safety and performance. It prevents memory bugs at compile time through its ownership system.', code: 'fn main() {\n    let name = String::from("Isaac");\n    let age: u32 = 22;\n    println!("Hello, {}! Age: {}", name, age);\n\n    let numbers = vec![1, 2, 3, 4, 5];\n    let sum: u32 = numbers.iter().sum();\n    println!("Sum: {}", sum);\n}' },
    { title: 'Ownership & Borrowing', body: 'Rust\'s ownership system ensures memory safety without a garbage collector. Each value has one owner; you can borrow references.', code: 'fn print_length(s: &String) {\n    println!("Length: {}", s.len());\n} // s goes out of scope but doesn\'t drop the value\n\nfn main() {\n    let s = String::from("hello world");\n    print_length(&s); // borrow, not move\n    println!("{}", s); // s still valid here\n}' },
  ]},
  go: { sections: [
    { title: 'Go Basics', body: 'Go (Golang) is a statically typed, compiled language from Google. Excellent for web servers, APIs and cloud tools.', code: 'package main\nimport "fmt"\n\nfunc greet(name string) string {\n    return fmt.Sprintf("Hello, %s!", name)\n}\n\nfunc main() {\n    msg := greet("Isaac")\n    fmt.Println(msg)\n}' },
    { title: 'Goroutines & Concurrency', body: 'Go makes concurrency easy with goroutines (lightweight threads) and channels for communication.', code: 'package main\nimport (\n    "fmt"\n    "sync"\n)\n\nfunc worker(id int, wg *sync.WaitGroup) {\n    defer wg.Done()\n    fmt.Printf("Worker %d done\\n", id)\n}\n\nfunc main() {\n    var wg sync.WaitGroup\n    for i := 1; i <= 5; i++ {\n        wg.Add(1)\n        go worker(i, &wg)\n    }\n    wg.Wait()\n}' },
  ]},
  cybersecurity: { sections: [
    { title: 'What is Cybersecurity?', body: 'Cybersecurity protects systems, networks and data from digital attacks, theft and damage. It covers offensive (red team) and defensive (blue team) disciplines.', code: '# Core cybersecurity domains:\n# 1. Network Security — firewalls, IDS/IPS, VPNs\n# 2. Application Security — OWASP Top 10, code review\n# 3. Cryptography — AES, RSA, TLS, hashing\n# 4. Incident Response — detect, contain, eradicate\n# 5. Penetration Testing — ethical hacking\n# 6. Social Engineering — phishing awareness' },
    { title: 'OWASP Top 10', body: 'The OWASP Top 10 lists the most critical web application vulnerabilities. Every developer should know these.', code: '# OWASP Top 10 (2021)\n# A01: Broken Access Control\n# A02: Cryptographic Failures\n# A03: Injection (SQLi, XSS, etc.)\n# A04: Insecure Design\n# A05: Security Misconfiguration\n# A06: Vulnerable Components\n# A07: Auth & Session Failures\n# A08: Software Integrity Failures\n# A09: Logging & Monitoring Failures\n# A10: SSRF (Server-Side Request Forgery)\n\n# Test for SQLi:\n# Input: admin\' OR \'1\'=\'1\' --\n# Safe code uses parameterised queries!' },
    { title: 'SQL Injection', body: 'SQL injection lets attackers manipulate database queries by injecting malicious SQL into input fields. Always use parameterised queries.', code: `-- VULNERABLE (never do this!)
SELECT * FROM users WHERE name = 'userInput';

-- Attacker input: ' OR 1=1 --
-- Becomes: SELECT * FROM users WHERE name = '' OR 1=1 --'
-- Returns ALL users!

-- SAFE: Parameterised query (Python)
cursor.execute(
    "SELECT * FROM users WHERE name = ?",
    (username,)  # Input sanitised automatically
)` },
    { title: 'XSS (Cross-Site Scripting)', body: 'XSS lets attackers inject malicious scripts into web pages viewed by other users. Always escape output and sanitise input.', code: '// VULNERABLE\ndocument.getElementById("output").innerHTML = userInput;\n// If userInput = "<script>document.cookie</script>"\n// The attacker runs code in your browser!\n\n// SAFE: use textContent, not innerHTML\ndocument.getElementById("output").textContent = userInput;\n\n// Or sanitise:\nfunction escapeHTML(s) {\n  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;")\n          .replace(/>/g,"&gt;").replace(/"/g,"&quot;");\n}' },
    { title: 'Cryptography Basics', body: 'Cryptography protects data in transit and at rest. Know the difference between hashing, symmetric and asymmetric encryption.', code: '# Hashing (one-way) — passwords\nimport hashlib\nhash = hashlib.sha256("mypassword".encode()).hexdigest()\nprint(hash)  # Never reversible\n\n# Better: use bcrypt for passwords!\nimport bcrypt\npw = bcrypt.hashpw(b"mypassword", bcrypt.gensalt())\nprint(bcrypt.checkpw(b"mypassword", pw))  # True\n\n# TLS: HTTPS encrypts data between browser and server\n# AES: symmetric encryption for files and disks\n# RSA: asymmetric encryption for key exchange' },
    { title: 'Linux Security Commands', body: 'Security professionals rely on Linux. These commands help with reconnaissance, monitoring and hardening.', code: '# Check open ports\nnmap -sV 192.168.1.1\n\n# View listening services\nnetstat -tlnp\nss -tlnp\n\n# Check failed login attempts\ngrep "Failed password" /var/log/auth.log\n\n# File permissions\nchmod 600 ~/.ssh/id_rsa   # Private key: owner-only\nchown root:root /etc/passwd\n\n# Check running processes\nps aux | grep suspicious_process\n\n# Firewall rules (ufw)\nufw allow ssh\nufw enable\nufw status' },
    { title: 'Password & Auth Security', body: 'Weak authentication is one of the most common attack vectors. Follow these best practices.', code: '# Password rules:\n# ✅ Min 12 characters\n# ✅ Mix of upper, lower, numbers, symbols\n# ✅ Use a password manager\n# ❌ Never reuse passwords\n# ❌ Never store in plain text\n\n# Multi-Factor Authentication (MFA):\n# Something you KNOW (password)\n# Something you HAVE (phone/TOTP)\n# Something you ARE (biometrics)\n\n# JWT example (Node.js):\nconst token = jwt.sign(\n  { userId: 123, role: "admin" },\n  process.env.JWT_SECRET,\n  { expiresIn: "1h" }\n);\n// Verify: jwt.verify(token, secret)' },
  ]},
  networking: { sections: [
    { title: 'How the Internet Works', body: 'The internet is a global network of computers communicating via standardised protocols. Every device has an IP address; data travels in packets.', code: '# Key networking concepts:\n# IP Address — unique identifier for each device\n#   IPv4: 192.168.1.1  (4 billion addresses)\n#   IPv6: 2001:0db8::1 (340 undecillion addresses)\n# MAC Address — hardware identifier (local network)\n# DNS — translates domain names to IP addresses\n# ISP — your Internet Service Provider routes packets\n\n# How a website loads:\n# 1. You type kiregablog.netlify.app\n# 2. DNS resolves it to an IP (e.g. 104.18.32.1)\n# 3. TCP 3-way handshake establishes connection\n# 4. TLS handshake encrypts the connection (HTTPS)\n# 5. HTTP request sent, server responds with HTML' },
    { title: 'OSI Model', body: 'The OSI model has 7 layers explaining how data moves from application to physical transmission. "Please Do Not Throw Sausage Pizza Away."', code: '# OSI Layers (top to bottom):\n# 7. Application  — HTTP, HTTPS, FTP, DNS, SMTP\n# 6. Presentation — TLS/SSL, encoding, compression\n# 5. Session      — manages connections\n# 4. Transport    — TCP (reliable), UDP (fast)\n# 3. Network      — IP addressing, routing\n# 2. Data Link    — MAC addresses, Ethernet, Wi-Fi\n# 1. Physical     — cables, radio waves, fibre\n\n# TCP vs UDP:\n# TCP: reliable, ordered, error-checked (web, email)\n# UDP: fast, no guarantees (video, DNS, gaming)' },
    { title: 'TCP/IP & Ports', body: 'TCP/IP is the foundational protocol suite of the internet. Ports identify which application receives data on a device.', code: '# Common ports to memorise:\n# 20/21  — FTP (file transfer)\n# 22     — SSH (secure shell)\n# 23     — Telnet (insecure, avoid)\n# 25     — SMTP (email sending)\n# 53     — DNS (domain lookup)\n# 80     — HTTP (unencrypted web)\n# 443    — HTTPS (encrypted web)\n# 3306   — MySQL\n# 5432   — PostgreSQL\n# 8080   — HTTP alternative / dev servers\n\n# Check your machine\'s open ports:\n# nmap -sV localhost\n# netstat -tlnp' },
    { title: 'DNS Deep Dive', body: 'DNS (Domain Name System) is the internet\'s phone book. It translates human-readable domains to machine IP addresses.', code: '# DNS record types:\n# A     — maps domain to IPv4 address\n# AAAA  — maps domain to IPv6 address\n# CNAME — alias (blog.site.com → site.com)\n# MX    — mail server records\n# TXT   — text records (SPF, DKIM, verification)\n# NS    — name server records\n\n# DNS lookup chain:\n# You → Recursive Resolver → Root NS → TLD NS → Auth NS\n\n# Commands:\n# nslookup kiregablog.netlify.app\n# dig kiregablog.netlify.app A\n# dig @8.8.8.8 google.com MX  # Use Google DNS' },
    { title: 'Firewalls & VPNs', body: 'Firewalls filter traffic by rules. VPNs encrypt your connection and hide your IP. Both are key network security tools.', code: '# Firewall types:\n# Packet Filter — checks IP/port headers only\n# Stateful — tracks connection state\n# Application — deep packet inspection (DPI)\n# Next-Gen (NGFW) — IDS/IPS, app awareness\n\n# Linux ufw firewall:\nufw default deny incoming\nufw default allow outgoing\nufw allow 22/tcp   # SSH\nufw allow 80/tcp   # HTTP\nufw allow 443/tcp  # HTTPS\nufw enable\n\n# VPN protocols:\n# OpenVPN — open source, very secure\n# WireGuard — modern, fast, simple\n# IPSec/IKEv2 — enterprise standard' },
    { title: 'Subnetting & CIDR', body: 'Subnetting divides a network into smaller sub-networks. CIDR notation specifies IP ranges compactly.', code: '# CIDR notation: IP/prefix-length\n# 192.168.1.0/24 = 256 addresses (.0 to .255)\n# 10.0.0.0/8     = 16,777,216 addresses\n# 172.16.0.0/16  = 65,536 addresses\n\n# Private IP ranges (not routable on internet):\n# 10.0.0.0/8\n# 172.16.0.0/12\n# 192.168.0.0/16\n\n# Calculate subnet:\n# /24 → subnet mask 255.255.255.0\n#      → 254 usable hosts\n# /25 → 255.255.255.128 → 126 usable hosts\n# /30 → 255.255.255.252 → 2 usable hosts (point-to-point)' },
  ]},
  linux: { sections: [
    { title: 'Linux Basics', body: 'Linux is the OS of the internet — servers, cloud, Android and embedded systems all run on it. The terminal is your superpower.', code: '# Essential commands:\nls -la           # list all files with details\ncd /path/to/dir  # change directory\npwd              # print working directory\nmkdir mydir      # create directory\ncp src dest      # copy file\nmv old new       # move/rename\nrm -rf dir       # delete (careful!)\ncat file.txt     # display file contents\ngrep "term" file # search in file\nchmod +x script  # make executable\nsudo command     # run as root' },
    { title: 'File Permissions', body: 'Linux permissions control who can read, write or execute files. Every file has an owner, a group and "others".', code: '# Permission format: rwxrwxrwx\n# r=read(4), w=write(2), x=execute(1)\n# [owner][group][others]\n\nls -la myfile\n# -rwxr-xr-- 1 isaac staff 1024 Apr 8 10:00 myfile\n# owner: rwx=7, group: r-x=5, others: r--=4\n\n# Set permissions:\nchmod 755 script.sh  # owner rwx, others r-x\nchmod 600 secret.key # owner rw only (private!)\nchmod +x run.sh      # add execute bit\nchown isaac:staff myfile  # change owner' },
    { title: 'Process & System Management', body: 'Monitor running processes, system resources and services with these essential commands.', code: '# Processes:\nps aux                    # list all processes\ntop                       # live process monitor\nhtop                      # better version of top\nkill -9 PID              # force kill a process\npkill firefox            # kill by name\n\n# System info:\nuname -a                  # kernel info\ndf -h                     # disk usage\nfree -h                   # memory usage\nuptime                    # how long running\n\n# Services (systemd):\nsystemctl status nginx    # check service\nsystemctl start nginx     # start service\nsystemctl enable nginx    # start on boot\njournalctl -u nginx -f   # view logs' },
  ]},
  ctf: { sections: [
    { title: 'What is CTF?', body: 'Capture The Flag (CTF) competitions are cybersecurity challenges where you find hidden "flags" (text strings) by exploiting vulnerabilities or solving puzzles. Great for learning hacking legally.', code: '# CTF categories:\n# Web      — SQLi, XSS, IDOR, SSRF\n# Crypto   — cipher breaking, RSA, hashes\n# Forensics — file analysis, steganography\n# Binary   — buffer overflow, ROP chains\n# Reversing — disassemble executables\n# OSINT    — open-source intelligence\n# Misc     — logic puzzles, coding challenges\n\n# Flag format examples:\n# picoCTF{this_is_a_flag}\n# HTB{s0m3_s3cr3t_here}\n# flag{found_it!}' },
    { title: 'Essential CTF Tools', body: 'These tools will solve the majority of beginner-to-intermediate CTF challenges.', code: '# Reconnaissance:\nnmap -sV -sC target.ip     # port & service scan\nwhois domain.com           # domain info\ndig domain.com ANY         # DNS records\n\n# Web:\nburpsuite                  # intercept HTTP\ncurl -v https://target/api # raw HTTP requests\nnikto -h http://target     # web vulnerability scanner\n\n# Crypto & Encoding:\nbase64 -d <<< "aGVsbG8="   # decode base64\necho "hex" | xxd -r -p     # hex to ASCII\ncipher tools: CyberChef, dCode.fr\n\n# Forensics:\nfile suspicious.bin        # identify file type\nbinwalk image.png          # extract hidden files\nexiftool photo.jpg         # view metadata\nstrings binary | grep flag # find readable strings\n\n# Networking:\ntcpdump -r capture.pcap    # analyse traffic\nwireshark                  # GUI packet analyser' },
    { title: 'Common Challenges', body: 'Most beginner CTFs involve encoding, basic crypto and web vulnerabilities. Start with picoCTF and TryHackMe.', code: '# Challenge: Decode this Base64\necho "cGljb0NURntmNGtlX2ZsNGd9" | base64 -d\n# Result: picoCTF{f4ke_fl4g}\n\n# Challenge: ROT13 cipher\necho "Xverthoe Oybt vf njrfbzr" | tr A-Za-z N-ZA-Mn-za-m\n# Result: Kirenga Blog is awesome\n\n# Challenge: Find hidden text in image\nstrings image.png | grep -i "flag\\|ctf\\|secret"\n\n# Challenge: Weak SQL in login\n# Username: admin\'--\n# Password: anything\n# Bypasses: SELECT * FROM users WHERE user=\'admin\'--\' AND pass=\'...\'' },
  ]},
  git: { sections: [
    { title: 'Git Basics', body: 'Git is the world\'s most popular version control system. It tracks every change to your code so you can collaborate and roll back mistakes.', code: '# Initialise a repo\ngit init\n\n# Stage and commit changes\ngit add .\ngit commit -m "First commit"\n\n# View history\ngit log --oneline\n\n# Check status\ngit status\n\n# Connect to GitHub\ngit remote add origin https://github.com/you/repo.git\ngit push -u origin main' },
    { title: 'Branches & Merging', body: 'Branches let you work on features without affecting the main codebase. Merge when ready.', code: '# Create and switch to a branch\ngit checkout -b feature/pricing\n\n# Make changes, then commit\ngit add .\ngit commit -m "Add pricing section"\n\n# Switch back to main\ngit checkout main\n\n# Merge the feature branch\ngit merge feature/pricing\n\n# Delete branch after merge\ngit branch -d feature/pricing\n\n# Push branch to GitHub\ngit push origin feature/pricing' },
  ]},
  blog: { sections: [
    { title: 'Writing Great Posts', body: 'Start with a hook that grabs attention. Use short paragraphs and clear headings. Add real code examples or photos. End with a takeaway or question.', code: '' },
    { title: 'SEO for Bloggers', body: 'Get found on Google with these SEO basics. Focus on one keyword per post, write naturally, and build links.', code: '<title>How to Build a Blog on Your Phone — Kirenga Blog</title>\n<meta name="description" content="Step-by-step guide to building a full-featured blog on Android using TrebEdit and VS Code.">\n<meta property="og:title" content="Build a Blog on Your Phone">' },
    { title: 'Growing Your Audience', body: 'Share on Twitter, LinkedIn, dev.to, Hashnode and Reddit. Engage with comments. Build an email newsletter. Post consistently.', code: '# Content calendar template:\n# Week 1: Tutorial post (how-to)\n# Week 2: Opinion piece\n# Week 3: Case study / project\n# Week 4: Resource roundup\n\n# Share checklist per post:\n# ✅ Twitter/X with relevant hashtags\n# ✅ LinkedIn for professional reach\n# ✅ dev.to cross-post (canonical URL)\n# ✅ Reddit: r/webdev, r/programming\n# ✅ Reply to all comments within 24h' },
  ]},
};
function initLearnPanel(tab = 'html') {
  const data = LEARN_DATA[tab]; const content = document.getElementById('learn-content'); if (!content || !data) return;
  content.innerHTML = data.sections.map(s => `<div class="learn-section"><h4>${escapeHTML(s.title)}</h4><p>${s.body.replace(/`([^`]+)`/g, '<code>$1</code>')}</p>${s.code ? `<div class="learn-code-block">${escapeHTML(s.code)}</div>` : ''}</div>`).join('');
}
function switchLearnTab(tab, btn) { document.querySelectorAll('.learn-tab').forEach(b => b.classList.remove('active')); btn.classList.add('active'); initLearnPanel(tab); }

/* ── Media panel ───────────────────────────────────── */
function handleMediaUpload(e) {
  Array.from(e.target.files).forEach(file => {
    if (file.size > 10 * 1024 * 1024) { alert(`${file.name} is too large (max 10 MB).`); return; }
    const reader = new FileReader();
    reader.onload = ev => {
      mediaLibrary.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2), name: file.name, type: file.type, size: file.size, data: ev.target.result, date: new Date().toISOString() });
      try { save('kirengaMedia', mediaLibrary.map(m => ({ ...m, data: m.type.startsWith('image/') ? m.data : '[non-image]' }))); } catch (err) {}
      renderMediaGrid();
    };
    reader.readAsDataURL(file);
  });
  if (e.target.value !== undefined) e.target.value = '';
}
function renderMediaGrid() {
  const grid = document.getElementById('media-grid'); const countEl = document.getElementById('media-count'); if (!grid) return;
  if (countEl) countEl.textContent = `${mediaLibrary.length} file${mediaLibrary.length !== 1 ? 's' : ''}`;
  if (!mediaLibrary.length) { grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:.85rem;padding:20px 0">No files uploaded yet.</p>'; return; }
  grid.innerHTML = mediaLibrary.map((m, i) => {
    const isImg = m.type.startsWith('image/');
    const icon = m.type.startsWith('video/') ? '🎬' : m.type.startsWith('audio/') ? '🎵' : m.type.includes('pdf') ? '📄' : m.type.includes('zip') ? '🗜' : '📝';
    return `<div class="media-item">${isImg ? `<img src="${m.data}" alt="${escapeHTML(m.name)}" loading="lazy">` : `<div class="media-item-icon">${icon}</div>`}<div class="media-item-name">${escapeHTML(m.name)}</div><button class="media-item-del" onclick="deleteMediaItem(${i})" title="Delete">✕</button></div>`;
  }).join('');
}
function deleteMediaItem(i) { mediaLibrary.splice(i, 1); save('kirengaMedia', mediaLibrary); renderMediaGrid(); }
function clearMediaLibrary() { if (!confirm('Delete all uploaded media?')) return; mediaLibrary = []; save('kirengaMedia', []); renderMediaGrid(); }
function setupMediaDragDrop() {
  const zone = document.getElementById('media-drop-zone'); if (!zone) return;
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('dragover'); }));
  zone.addEventListener('drop', e => { handleMediaUpload({ target: { files: e.dataTransfer.files } }); });
}

/* ── Share site panel ──────────────────────────────── */
function shareSite(platform) {
  const url = encodeURIComponent(window.location.href);
  const text = encodeURIComponent('Check out Kirenga Blog — Notes, Ideas & Reflections!');
  const map = {
    twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    whatsapp: `https://wa.me/?text=${text}%20${url}`,
    telegram: `https://t.me/share/url?url=${url}&text=${text}`,
    linkedin: `https://www.linkedin.com/shareArticle?mini=true&url=${url}&title=${text}`,
    reddit: `https://reddit.com/submit?url=${url}&title=${text}`,
    pinterest: `https://pinterest.com/pin/create/button/?url=${url}&description=${text}`,
    instagram: `https://www.instagram.com/`,
    tiktok: `https://www.tiktok.com/`,
    discord: `https://discord.com/`,
    snapchat: `https://www.snapchat.com/`,
    email: `mailto:?subject=Check%20out%20Kirenga%20Blog&body=${text}%20${url}`,
  };
  if (map[platform]) window.open(map[platform], '_blank', 'noopener,width=600,height=500');
}
function copySiteLink() {
  navigator.clipboard.writeText(window.location.href)
    .then(() => { const btn = document.querySelector('.sp-copy'); if (btn) { const o = btn.innerHTML; btn.innerHTML = '✅ Copied!'; setTimeout(() => { btn.innerHTML = o; }, 2000); } })
    .catch(() => alert('Copy this link: ' + window.location.href));
}

/* ── Language switcher ─────────────────────────────── */
const LANG = {
  en: { title: 'Notes, Ideas & Reflections', sub: 'Coding tips, daily thoughts and photos — saved right in your browser.' },
  fr: { title: 'Notes, Idées & Réflexions', sub: 'Conseils de codage et pensées quotidiennes — sauvegardés dans votre navigateur.' },
  sw: { title: 'Maelezo, Mawazo na Tafakari', sub: 'Vidokezo vya coding na mawazo ya kila siku — zilizohifadhiwa kwenye kivinjari chako.' },
  es: { title: 'Notas, Ideas y Reflexiones', sub: 'Consejos de programación y pensamientos diarios — guardados en tu navegador.' },
  de: { title: 'Notizen, Ideen & Reflexionen', sub: 'Codier-Tipps und tägliche Gedanken — direkt im Browser gespeichert.' },
  zh: { title: '笔记、想法与反思', sub: '编程技巧和日常想法 — 保存在您的浏览器中。' },
  ar: { title: 'ملاحظات وأفكار وتأملات', sub: 'نصائح البرمجة والأفكار اليومية — محفوظة في متصفحك.' },
  pt: { title: 'Notas, Ideias e Reflexões', sub: 'Dicas de programação e pensamentos diários — salvos no seu navegador.' },
  hi: { title: 'नोट्स, विचार और प्रतिबिंब', sub: 'कोडिंग टिप्स और दैनिक विचार — आपके ब्राउज़र में सहेजे गए।' },
  ja: { title: 'ノート、アイデア＆リフレクション', sub: 'コーディングのヒントと日々の思考 — ブラウザに保存されます。' },
  ru: { title: 'Заметки, Идеи и Размышления', sub: 'Советы по коду и мысли — сохраняются прямо в браузере.' },
  ko: { title: '노트, 아이디어 & 성찰', sub: '코딩 팁과 일상적인 생각 — 브라우저에 저장됩니다.' },
};
function changeLanguage(code) {
  save('kirengaLang', code);
  const s = LANG[code] || LANG.en;
  const h1 = document.querySelector('.hero h1'); const sub = document.querySelector('.hero-sub');
  if (h1) h1.innerHTML = s.title.replace(/&/g, '&amp;');
  if (sub) sub.textContent = s.sub;
  document.querySelectorAll('#lang-select,#settings-lang').forEach(el => { if (el) el.value = code; });
  document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
}

/* ════════════════════════════════════════════════════
   AUTH
════════════════════════════════════════════════════ */
function showAuth(panel = 'login') {
  const overlay = document.getElementById('auth-overlay'); if (!overlay) return;
  overlay.hidden = false;
  ['login', 'signup', 'forgot'].forEach(id => { const m = document.getElementById('modal-' + id); if (m) m.hidden = (id !== panel); });
  document.body.style.overflow = 'hidden';
}
function closeAuth() { const o = document.getElementById('auth-overlay'); if (o) o.hidden = true; document.body.style.overflow = ''; }

async function doLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-password').value;
  if (!email || !pw) { showAlert('login-alert', '⚠️ Fill in all fields.', 'error'); return; }

  // Use Firebase Auth if available — issues a real token so DB writes work
  if (window.OAuthManager && window.OAuthManager.isInitialized) {
    const btn = document.querySelector('#modal-login button[type=submit]');
    if (btn) btn.disabled = true;
    const result = await window.OAuthManager.emailLogin(email, pw);
    if (btn) btn.disabled = false;
    if (!result.ok) { showAlert('login-alert', result.message, 'error'); return; }
    // loginUser() is called automatically by onAuthStateChanged — just close modal
    closeAuth();
    return;
  }

  // Fallback: localStorage-only check (no Firebase token, limited functionality)
  const user = await DB.getUserByEmail(email);
  if (!user) { showAlert('login-alert', '❌ No account found with that email.', 'error'); return; }
  if (user.via === 'email' || !user.via) {
    if (!user.password || user.password !== pw) { showAlert('login-alert', '❌ Incorrect password. Please try again.', 'error'); return; }
  }
  loginUser(user); closeAuth();
}
async function doSignup(e) {
  e.preventDefault();
  const fname    = document.getElementById('signup-fname').value.trim();
  const lname    = document.getElementById('signup-lname').value.trim();
  const username = document.getElementById('signup-username').value.trim().replace(/^@/, '');
  const email    = document.getElementById('signup-email').value.trim();
  const pw       = document.getElementById('signup-password').value;
  const agreed   = document.getElementById('agree-terms').checked;

  if (!fname || !lname || !username || !email || !pw) { showAlert('signup-alert', '⚠️ Please fill in all fields.', 'error'); return; }
  if (pw.length < 6) { showAlert('signup-alert', '⚠️ Password must be at least 6 characters.', 'error'); return; }
  if (!agreed) { showAlert('signup-alert', '⚠️ You must agree to the terms.', 'error'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAlert('signup-alert', '⚠️ Invalid email address.', 'error'); return; }

  // Use Firebase Auth if available
  if (window.OAuthManager && window.OAuthManager.isInitialized) {
    const btn = document.querySelector('#modal-signup button[type=submit]');
    if (btn) btn.disabled = true;
    // Verify reCAPTCHA before creating account
    const human = await verifyRecaptcha('signup');
    if (!human) {
      if (btn) btn.disabled = false;
      showAlert('signup-alert', '⚠️ reCAPTCHA check failed. Please try again.', 'error');
      return;
    }
    const result = await window.OAuthManager.emailSignup(fname, lname, username, email, pw);
    if (btn) btn.disabled = false;
    if (!result.ok) { showAlert('signup-alert', result.message, 'error'); return; }
    // loginUser() is called automatically by onAuthStateChanged
    closeAuth();
    return;
  }

  // Fallback: localStorage-only signup
  const existing = await DB.getUserByEmail(email);
  if (existing) { showAlert('signup-alert', '⚠️ An account with this email already exists.', 'error'); return; }
  const newUser = await DB.createUser({ name: `${fname} ${lname}`, username, email, password: pw, via: 'email' });
  if (!newUser) { showAlert('signup-alert', '⚠️ Could not create account. Please try again.', 'error'); return; }
  loginUser(newUser); closeAuth();
}
async function socialLogin(provider) {
  // ✅ FIX: defer to window.socialLogin set by oauth-firebase.js if available
  if (window.OAuthManager) {
    await window.OAuthManager.init();
    await window.OAuthManager.loginWithProvider(provider);
    return;
  }
  console.warn('OAuthManager not available, social login failed');
  showAlert("login-alert", "⚠️ Auth service not ready. Please refresh and try again.", "error");
}
function loginUser(user) {
  currentUser = user;
  save('kirengaCurrentUser', user);
  // Clear stale comment rate-limit data from previous sessions
  localStorage.removeItem('kirengaCommentTimes');
  updateAuthUI(); updateAllAvatars(); updateDrawerProfile(); updateMemberCount(); renderPosts(); updateCommentUI();
}
async function logout() {
  // Sign out from Firebase Auth first (invalidates the token)
  if (window.OAuthManager && window.OAuthManager.auth) {
    try {
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
      await signOut(window.OAuthManager.auth);
    } catch (e) { console.warn('[logout] Firebase signOut error:', e.message); }
  }
  currentUser = null;
  localStorage.removeItem('kirengaCurrentUser');
  updateAuthUI(); updateDrawerProfile(); updateCommentUI(); renderPosts();
  const dd = document.getElementById('user-dropdown'); if (dd) dd.hidden = true;
}
function updateAuthUI() {
  const authBtns = document.getElementById('auth-buttons');
  const userMenu = document.getElementById('user-menu');
  const initEl = document.getElementById('user-avatar-initials');
  const nameEl = document.getElementById('dropdown-name');
  const emailEl = document.getElementById('dropdown-email');

  // Show/hide write controls based on ownership
  const writeLinks = document.querySelectorAll(
    'a[href="#write"], #write, .write-only, [data-owner-only]'
  );
  writeLinks.forEach(el => {
    // For the actual write section itself, keep it in DOM but guard submission
    if (el.id === 'write') return;
    el.style.display = isOwner() ? '' : 'none';
  });

  if (currentUser) {
    if (authBtns) authBtns.style.display = 'none';
    if (userMenu) userMenu.hidden = false;
    if (initEl) initEl.textContent = initials(currentUser.name);
    if (nameEl) nameEl.textContent = currentUser.name;
    if (emailEl) emailEl.textContent = currentUser.email;
  } else {
    if (authBtns) authBtns.style.display = '';
    if (userMenu) userMenu.hidden = true;
  }
}
function toggleUserMenu(forceClose = false) { const dd = document.getElementById('user-dropdown'); if (!dd) return; dd.hidden = forceClose ? true : !dd.hidden; }
async function doForgot(e) {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) { showAlert('forgot-alert', '⚠️ Please enter your email.', 'error'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAlert('forgot-alert', '⚠️ Invalid email address.', 'error'); return; }
  try {
    if (window.OAuthManager && window.OAuthManager.auth) {
      const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
      await sendPasswordResetEmail(window.OAuthManager.auth, email);
      showAlert('forgot-alert', '📧 Password reset email sent! Check your inbox (and spam folder).', 'success');
    } else {
      // Firebase not ready — show generic message (don't reveal if account exists)
      showAlert('forgot-alert', '📧 If an account exists for ' + escapeHTML(email) + ', a reset link has been sent.');
    }
    document.getElementById('forgot-form').reset();
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      // Still show success to avoid email enumeration
      showAlert('forgot-alert', '📧 If an account exists, a reset link has been sent.');
      document.getElementById('forgot-form').reset();
    } else {
      showAlert('forgot-alert', '⚠️ Could not send reset email. Try again later.', 'error');
    }
  }
}
function togglePw(id, btn) { const input = document.getElementById(id); if (!input) return; input.type = input.type === 'text' ? 'password' : 'text'; btn.textContent = input.type === 'text' ? '🙈' : '👁'; }
function setupPasswordStrength() {
  const input = document.getElementById('signup-password'); const bar = document.getElementById('pw-strength'); if (!input || !bar) return;
  input.addEventListener('input', () => {
    const v = input.value;
    let s = '';
    if (v.length === 0) s = '';
    else if (v.length >= 8 && /[A-Z]/.test(v) && /[0-9]/.test(v)) s = 'strong';
    else if (v.length >= 6) s = 'medium';
    else s = 'weak';
    bar.setAttribute('data-s', s);
  });
}
function updateMemberCount() { const users = load('kirengaUsers', []); const el = document.getElementById('stat-members'); if (el) el.textContent = users.length; }

/* ════════════════════════════════════════════════════
   POSTS
════════════════════════════════════════════════════ */
const REACTIONS = [
  { key: 'like', emoji: '👍', label: 'Like' }, { key: 'love', emoji: '❤️', label: 'Love' },
  { key: 'haha', emoji: '😂', label: 'Haha' }, { key: 'wow', emoji: '😮', label: 'Wow' },
  { key: 'sad', emoji: '😢', label: 'Sad' }, { key: 'angry', emoji: '😡', label: 'Angry' },
];
function totalReactions(post) { return Object.values(post.reactions || {}).reduce((s, v) => s + v, 0); }

async function loadPosts() {
  try {
    const dbPosts = await DB.getPosts();
    posts = dbPosts;
    try { localStorage.setItem('kirengaBlogPosts', JSON.stringify(posts)); } catch (e) {}
  } catch (e) {
    const s = localStorage.getItem('kirengaBlogPosts');
    posts = s ? JSON.parse(s) : [];
  }
  renderPosts(); updateAllSidebars();
}
async function savePosts() { try { localStorage.setItem('kirengaBlogPosts', JSON.stringify(posts)); } catch (e) {} }

function getSortedFilteredPosts() {
  let list = [...posts];
  if (currentFilter) {
    const f = currentFilter.toLowerCase();
    list = list.filter(p =>
      p.title.toLowerCase().includes(f) ||
      p.content.toLowerCase().includes(f) ||
      p.category.toLowerCase().includes(f) ||
      (p.tags || []).some(t => t.toLowerCase().includes(f))
    );
  }
  if (currentSort === 'oldest') list.reverse();
  else if (currentSort === 'az') list.sort((a, b) => a.title.localeCompare(b.title));
  else if (currentSort === 'popular') list.sort((a, b) => totalReactions(b) - totalReactions(a));
  return list;
}

function renderPosts() {
  const container = document.getElementById('posts-container'); if (!container) return;
  const list = getSortedFilteredPosts();
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">${currentFilter ? '🔎' : '📝'}</div><p>${currentFilter ? `No posts match "<strong>${escapeHTML(currentFilter)}</strong>".` : 'No posts yet — write your first one below!'}</p>${currentFilter ? `<button class="btn btn-outline btn-sm" onclick="clearSearch()" style="margin-top:12px">✕ Clear</button>` : ''}</div>`;
    return;
  }
  container.innerHTML = list.map((post, i) => {
    const realIdx = posts.indexOf(post);
    const tags = (post.tags || []).map(t => `<span class="post-tag" onclick="filterByTag('${escapeJS(t)}')">#${escapeHTML(t)}</span>`).join('');
    const commentCount = (post.comments || []).length;
    const gateHTML = currentUser ? '' : `<div class="post-gate"><p>🔒 <strong>Sign in to read the full post</strong>, comment and react.</p><div class="gate-btns"><button class="btn btn-sm btn-primary" onclick="showAuth('login')">Log in</button><button class="btn btn-sm btn-outline" onclick="showAuth('signup')">Sign up</button></div></div>`;
    const reactBtns = REACTIONS.map(r => {
      const count = (post.reactions || {})[r.key] || 0;
      const mine = currentUser && (post.myReactions || {})[currentUser.email] === r.key;
      return `<button class="reaction-btn${mine ? ' active' : ''}" onclick="reactToPost(${realIdx},'${r.key}')" title="${r.label}">${r.emoji}<span class="reaction-count">${count || ''}</span></button>`;
    }).join('');
    return `<article class="post" style="animation-delay:${i * 0.05}s">
      <div class="post-header"><h3 class="post-title" onclick="openModal(${realIdx})">${escapeHTML(post.title)}</h3><span class="badge">${escapeHTML(post.category)}</span></div>
      <p class="post-meta"><span>📅 ${escapeHTML(post.date)}</span><span class="post-meta-divider">•</span><span>⏱ ${readingTime(post.content)}</span><span class="post-meta-divider">•</span><span>💬 ${commentCount}</span></p>
      <p class="post-preview">${escapeHTML(post.content)}</p>
      ${gateHTML}
      ${post.image ? `<img src="${post.image}" alt="Post photo" loading="lazy" onclick="openLightbox('${escapeJS(post.image)}','${escapeJS(post.title)}')" style="cursor:zoom-in">` : ''}
      ${tags ? `<div class="post-tags">${tags}</div>` : ''}
      <div class="post-reactions-row">${reactBtns}</div>
      <div class="post-actions">
        <button class="btn btn-sm btn-outline" onclick="openModal(${realIdx})">📖 Read more</button>
        <button class="btn btn-sm btn-outline" onclick="openModal(${realIdx},true)">💬 Comment</button>
        <button class="btn btn-danger" onclick="deletePost(${realIdx})">🗑 Delete</button>
      </div>
    </article>`;
  }).join('');
}

async function reactToPost(index, reactionKey) {
  if (!currentUser) { showAuth('login'); return; }
  const post = posts[index]; if (!post) return;
  post.reactions = post.reactions || {}; post.myReactions = post.myReactions || {};
  const prev = post.myReactions[currentUser.email];
  const toggling = prev === reactionKey;
  if (prev) { post.reactions[prev] = Math.max(0, (post.reactions[prev] || 1) - 1); delete post.myReactions[currentUser.email]; }
  if (!toggling) { post.reactions[reactionKey] = (post.reactions[reactionKey] || 0) + 1; post.myReactions[currentUser.email] = reactionKey; }
  try { await DB.setReaction(post.id, currentUser.email, currentUser.id || null, toggling ? null : reactionKey); } catch (e) {}
  await savePosts(); renderPosts(); if (openModalIndex === index) refreshReactionsBar(index);
}

async function publishPost(e) {
  e.preventDefault();
  if (!isOwner()) { showAlert('post-alert', '🔒 Only the blog owner can publish posts.', 'error'); return; }
  const title = document.getElementById('new-title').value.trim();
  const category = document.getElementById('new-category').value;
  const content = document.getElementById('new-content').value.trim();
  const rawTags = document.getElementById('new-tags').value;
  if (!title || !content) { showAlert('post-alert', '⚠️ Title and content are required.', 'error'); return; }
  const tags = rawTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const draft = { title, category, content, tags, image: currentImageData, authorName: currentUser?.name || 'Anonymous', authorId: currentUser?.id || null };
  const saved = await DB.createPost(draft);
  posts.unshift(saved); await savePosts(); renderPosts(); updateAllSidebars(); resetForm();
  showAlert('post-alert', DB.isReady ? '✅ Post published to database!' : '✅ Post published (saved locally)!');
  document.getElementById('posts').scrollIntoView({ behavior: 'smooth' });
}

async function deletePost(index) {
  if (!isOwner()) { return; } // silently ignore for non-owners
  if (!confirm('Delete this post permanently?')) return;
  const post = posts[index]; if (!post) return;
  if (post.id) await DB.deletePost(post.id);
  posts.splice(index, 1); await savePosts(); renderPosts(); updateAllSidebars();
}

function resetForm() {
  document.getElementById('post-form').reset();
  document.getElementById('image-preview').innerHTML = '';
  document.getElementById('title-count').textContent = '0 / 120';
  document.getElementById('content-count').textContent = '0 / 5000';
  currentImageData = null;
}
function searchPosts() { currentFilter = document.getElementById('search').value.toLowerCase().trim(); const ss = document.getElementById('sidebar-search'); if (ss) ss.value = document.getElementById('search').value; renderPosts(); }
function clearSearch() { currentFilter = ''; document.getElementById('search').value = ''; const ss = document.getElementById('sidebar-search'); if (ss) ss.value = ''; renderPosts(); }
function sortAndRender() { currentSort = document.getElementById('sort-select').value; renderPosts(); }
function filterByCategory(cat) { currentFilter = cat.toLowerCase(); document.getElementById('search').value = cat; renderPosts(); document.getElementById('posts').scrollIntoView({ behavior: 'smooth' }); }
function filterByTag(tag) { currentFilter = tag.toLowerCase(); document.getElementById('search').value = tag; renderPosts(); document.getElementById('posts').scrollIntoView({ behavior: 'smooth' }); }

function previewImage(e) {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 5 * 1024 * 1024) { alert('Max 5 MB.'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = ev => { currentImageData = ev.target.result; document.getElementById('image-preview').innerHTML = `<img src="${currentImageData}" alt="Preview">`; };
  reader.readAsDataURL(file);
}
function setupDragDrop() {
  const area = document.getElementById('drop-area'); if (!area) return;
  ['dragenter', 'dragover'].forEach(ev => area.addEventListener(ev, e => { e.preventDefault(); area.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(ev => area.addEventListener(ev, e => { e.preventDefault(); area.classList.remove('dragover'); }));
  area.addEventListener('drop', e => { const file = e.dataTransfer.files[0]; if (!file || !file.type.startsWith('image/')) return; const dt = new DataTransfer(); dt.items.add(file); document.getElementById('media-upload').files = dt.files; previewImage({ target: { files: dt.files } }); });
}
function setupCharCounters() {
  [['new-title', 'title-count', 120], ['new-content', 'content-count', 5000], ['comment-text', 'comment-count', 500]].forEach(([inp, cnt, max]) => {
    const el = document.getElementById(inp); const cel = document.getElementById(cnt); if (!el || !cel) return;
    el.addEventListener('input', () => { const n = el.value.length; cel.textContent = `${n} / ${max}`; cel.style.color = n > max * 0.85 ? 'var(--red)' : 'var(--muted)'; });
  });
}

/* ════════════════════════════════════════════════════
   POST MODAL
════════════════════════════════════════════════════ */
function openModal(index, focusComment = false) {
  const post = posts[index]; if (!post) return;
  openModalIndex = index;
  const tags = (post.tags || []).map(t => `<span class="post-tag" style="cursor:default">#${escapeHTML(t)}</span>`).join('');
  document.getElementById('modal-content').innerHTML = `
    ${post.image ? `<img src="${post.image}" alt="Post photo" class="modal-post-img">` : ''}
    <h2 class="modal-post-title" id="modal-title">${escapeHTML(post.title)}</h2>
    <div class="modal-post-meta">
      <span>📅 ${escapeHTML(post.date)}</span><span>•</span>
      <span>${escapeHTML(post.category)}</span><span>•</span>
      <span>⏱ ${readingTime(post.content)}</span>
    </div>
    <p class="modal-post-body">${escapeHTML(post.content)}</p>
    ${tags ? `<div class="post-tags" style="margin-top:16px">${tags}</div>` : ''}`;
  refreshReactionsBar(index); renderComments(index); updateCommentUI();
  const modal = document.getElementById('post-modal'); modal.hidden = false; document.body.style.overflow = 'hidden';
  if (focusComment) setTimeout(() => { if (currentUser) document.getElementById('comment-text')?.focus(); else document.getElementById('comment-login-prompt')?.scrollIntoView({ behavior: 'smooth' }); }, 200);
}
function closeModal() { document.getElementById('post-modal').hidden = true; document.body.style.overflow = ''; openModalIndex = null; }

function refreshReactionsBar(index) {
  const bar = document.getElementById('reactions-bar'); const post = posts[index]; if (!bar || !post) return;
  bar.innerHTML = REACTIONS.map(r => {
    const count = (post.reactions || {})[r.key] || 0;
    const mine = currentUser && (post.myReactions || {})[currentUser.email] === r.key;
    return `<button class="reaction-btn${mine ? ' active' : ''}" onclick="reactToPost(${index},'${r.key}')" title="${r.label}">${r.emoji}<span class="reaction-count">${count || ''}</span></button>`;
  }).join('');
}

function sharePost(platform) {
  const post = posts[openModalIndex]; if (!post) return;
  const text = encodeURIComponent(`"${post.title}" — Kirenga Blog`); const url = encodeURIComponent(window.location.href);
  const map = { twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`, facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`, whatsapp: `https://wa.me/?text=${text}%20${url}`, telegram: `https://t.me/share/url?url=${url}&text=${text}`, linkedin: `https://www.linkedin.com/shareArticle?mini=true&url=${url}&title=${text}`, reddit: `https://reddit.com/submit?url=${url}&title=${text}` };
  if (map[platform]) window.open(map[platform], '_blank', 'noopener,width=600,height=500');
}
function copyLink() {
  navigator.clipboard.writeText(window.location.href)
    .then(() => { const btn = document.querySelector('.share-copy'); if (btn) { const o = btn.textContent; btn.textContent = '✅ Copied!'; setTimeout(() => { btn.textContent = o; }, 2000); } })
    .catch(() => alert('Copy: ' + window.location.href));
}

/* ════════════════════════════════════════════════════
   COMMENTS
════════════════════════════════════════════════════ */
function updateCommentUI() {
  const inputArea = document.getElementById('comment-input-area');
  const loginPrompt = document.getElementById('comment-login-prompt');
  const avatarEl = document.getElementById('commenter-avatar');
  if (!inputArea || !loginPrompt) return;
  if (currentUser) {
    inputArea.hidden = false; loginPrompt.hidden = true;
    if (avatarEl) {
      const pic = currentUser.profilePic;
      if (pic) { avatarEl.innerHTML = `<img src="${pic}" alt="avatar">`; avatarEl.style.background = 'transparent'; }
      else { avatarEl.textContent = initials(currentUser.name); avatarEl.style.background = avatarColor(currentUser.name); }
    }
  } else { inputArea.hidden = true; loginPrompt.hidden = false; }
}

async function submitComment() {
  if (!currentUser) { showAuth('login'); return; }
  // Honeypot spam check
  const hp = document.getElementById('comment-hp');
  if (hp && hp.value.trim()) { document.getElementById('comment-text').value = ''; return; }
  const textEl = document.getElementById('comment-text'); const text = textEl?.value.trim(); if (!text) return;
  const post = posts[openModalIndex]; if (!post) return;
  post.comments = post.comments || [];
  const saved = await DB.addComment(post.id || null, null, currentUser, text);
  if (saved) post.comments.unshift(saved);
  await savePosts(); textEl.value = ''; document.getElementById('comment-count').textContent = '0 / 500';
  renderComments(openModalIndex); renderPosts();
}

function renderComments(index) {
  const post = posts[index]; if (!post) return;
  const list = post.comments || [];
  const countEl = document.getElementById('comments-count');
  if (countEl) countEl.textContent = list.reduce((s, c) => s + 1 + (c.replies || []).length, 0);
  const container = document.getElementById('comments-list'); if (!container) return;
  if (!list.length) { container.innerHTML = '<p style="text-align:center;color:var(--muted);font-size:.88rem;padding:20px 0">No comments yet. Be the first!</p>'; return; }
  container.innerHTML = list.map(c => renderComment(c, index, false)).join('');
}

function renderComment(c, postIndex, isReply) {
  const bgColor = avatarColor(c.author);
  const likedByMe = currentUser && (c.likedBy || []).includes(currentUser.email);
  const replies = (c.replies || []).map(r => renderComment(r, postIndex, true)).join('');
  const viaTag = c.via && c.via !== 'email' ? `<span class="comment-via">via ${escapeHTML(c.via)}</span>` : '';
  const picHTML = c.profilePic ? `<img src="${c.profilePic}" alt="avatar">` : initials(c.author);
  const picStyle = c.profilePic ? 'background:transparent' : `background:${bgColor}`;
  return `<div class="comment-item" id="comment-${escapeHTML(c.id)}">
    <div class="comment-avatar" style="${picStyle}">${picHTML}</div>
    <div class="comment-body">
      <div class="comment-header">
        <span class="comment-author">${escapeHTML(c.author)}</span>
        ${c.username ? `<span class="comment-via">@${escapeHTML(c.username)}</span>` : ''}
        ${viaTag}<span class="comment-time">${timeAgo(c.iso)}</span>
      </div>
      <p class="comment-text">${escapeHTML(c.text)}</p>
      <div class="comment-footer">
        <button class="comment-like-btn${likedByMe ? ' active' : ''}" onclick="likeComment('${escapeJS(c.id)}',${postIndex})">❤️ ${c.likes > 0 ? c.likes : ''}</button>
        ${!isReply ? `<button class="comment-reply-btn" onclick="showReplyForm('${escapeJS(c.id)}',${postIndex})">↩ Reply</button>` : ''}
      </div>
      ${!isReply && replies ? `<div class="replies-list">${replies}</div>` : ''}
      <div id="reply-form-${escapeJS(c.id)}" hidden>
        <div class="reply-form-wrap">
          <textarea id="reply-text-${escapeJS(c.id)}" placeholder="Write a reply…" maxlength="500" rows="2"></textarea>
          <div class="reply-actions">
            <button class="btn btn-outline btn-sm" onclick="document.getElementById('reply-form-${escapeJS(c.id)}').hidden=true">Cancel</button>
            <button class="btn btn-primary btn-sm" onclick="submitReply('${escapeJS(c.id)}',${postIndex})">Reply</button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

async function likeComment(commentId, postIndex) {
  if (!currentUser) { showAuth('login'); return; }
  const post = posts[postIndex]; if (!post) return;
  const findLiked = (arr) => { for (const c of arr) { if (c.id === commentId) return (c.likedBy || []).includes(currentUser.email); if (c.replies) { const r = findLiked(c.replies); if (r !== undefined) return r; } } };
  const liked = findLiked(post.comments || []) || false;
  await DB.likeComment(commentId, currentUser.email, liked);
  await savePosts();
  const stored = load('kirengaBlogPosts', []); const sp = stored.find(p => p.id === post.id);
  if (sp) posts[postIndex] = sp;
  renderComments(postIndex);
}

function showReplyForm(commentId, postIndex) {
  if (!currentUser) { showAuth('login'); return; }
  const form = document.getElementById('reply-form-' + commentId); if (!form) return;
  form.hidden = !form.hidden;
  if (!form.hidden) document.getElementById('reply-text-' + commentId)?.focus();
}

async function submitReply(commentId, postIndex) {
  if (!currentUser) { showAuth('login'); return; }
  const textEl = document.getElementById('reply-text-' + commentId); if (!textEl || !textEl.value.trim()) return;
  const post = posts[postIndex]; if (!post) return;
  await DB.addComment(post.id || null, commentId, currentUser, textEl.value.trim());
  await savePosts();
  const stored = load('kirengaBlogPosts', []); const sp = stored.find(p => p.id === post.id); if (sp) posts[postIndex] = sp;
  textEl.value = ''; document.getElementById('reply-form-' + commentId).hidden = true;
  renderComments(postIndex); renderPosts();
}

/* ════════════════════════════════════════════════════
   SIDEBAR
════════════════════════════════════════════════════ */
function updateAllSidebars() {
  const total = posts.length; const photos = posts.filter(p => p.image).length; const cats = new Set(posts.map(p => p.category));
  const hs1 = document.getElementById('hs-posts'); const hs2 = document.getElementById('hs-photos');
  if (hs1) hs1.textContent = total; if (hs2) hs2.textContent = photos;
  const fields = { 'stat-posts': total, 'stat-photos': photos, 'stat-cats': cats.size };
  Object.entries(fields).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });
  const su = document.getElementById('stat-updated');
  if (su) su.textContent = total > 0 ? formatDate(posts[0].iso || new Date().toISOString()).split(',')[0] : '—';
  updateMemberCount();
  // Categories
  const catsEl = document.getElementById('sidebar-categories');
  if (catsEl) {
    if (!total) { catsEl.innerHTML = '<p style="font-size:.78rem;color:var(--muted)">No posts yet.</p>'; }
    else {
      const counts = {}; posts.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
      catsEl.innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([cat, n]) =>
        `<div class="sidebar-cat-item" onclick="filterByCategory('${escapeJS(cat)}')" role="button" tabindex="0"><span>${escapeHTML(cat)}</span><span class="sidebar-cat-count">${n}</span></div>`).join('');
    }
  }
  // Recent posts
  const recentEl = document.getElementById('sidebar-recent');
  if (recentEl) {
    if (!total) { recentEl.innerHTML = '<p style="font-size:.78rem;color:var(--muted)">No posts yet.</p>'; }
    else {
      recentEl.innerHTML = posts.slice(0, 5).map((p, i) =>
        `<div class="sidebar-recent-item" onclick="openModal(${i})" role="button" tabindex="0">${escapeHTML(p.title)}<span class="sidebar-recent-date">${escapeHTML(p.date)}</span></div>`).join('');
    }
  }
  // Tags
  const tagEl = document.getElementById('sidebar-tags');
  if (tagEl) {
    const allTags = {}; posts.forEach(p => (p.tags || []).forEach(t => { allTags[t] = (allTags[t] || 0) + 1; }));
    const entries = Object.entries(allTags).sort((a, b) => b[1] - a[1]).slice(0, 20);
    tagEl.innerHTML = entries.length
      ? entries.map(([t]) => `<span class="tag-pill" onclick="filterByTag('${escapeJS(t)}')">#${escapeHTML(t)}</span>`).join('')
      : '<p style="font-size:.78rem;color:var(--muted)">No tags yet.</p>';
  }
}

/* ════════════════════════════════════════════════════
   CONTACT / NEWSLETTER
════════════════════════════════════════════════════ */
async function sendContact(e) {
  e.preventDefault();
  const name    = document.getElementById('contact-name').value.trim();
  const email   = document.getElementById('contact-email').value.trim();
  const subject = document.getElementById('contact-subject').value.trim();
  const message = document.getElementById('contact-message').value.trim();
  if (!name || !email || !message) { showAlert('contact-alert', '⚠️ Fill required fields.', 'error'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAlert('contact-alert', '⚠️ Invalid email.', 'error'); return; }
  const human = await verifyRecaptcha('contact');
  if (!human) { showAlert('contact-alert', '⚠️ reCAPTCHA check failed. Please try again.', 'error'); return; }
  await DB.sendContact({ name, email, subject, message });
  showAlert('contact-alert', `✅ Thanks ${escapeHTML(name)}! Your message has been sent.`);
  document.getElementById('contact-form').reset();
}
async function subscribeNewsletter(e) {
  e.preventDefault();
  const email = document.getElementById('nl-email').value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAlert('nl-alert', '⚠️ Valid email required.', 'error'); return; }
  const result = await DB.subscribe(email);
  if (result === 'already') { showAlert('nl-alert', '📬 Already subscribed!'); return; }
  showAlert('nl-alert', `🎉 Subscribed!${DB.isReady ? ' Saved to database.' : ' Saved locally.'}`);
  document.getElementById('newsletter-form').reset();
}

/* ════════════════════════════════════════════════════
   MISC
════════════════════════════════════════════════════ */
function acceptCookies() { localStorage.setItem('cookiesAccepted', '1'); const b = document.getElementById('cookie-banner'); if (b) { b.classList.add('hidden'); setTimeout(() => b.remove(), 500); } }
function clearAllData() { if (!confirm('Delete ALL posts, accounts and settings? This cannot be undone.')) return; localStorage.clear(); posts = []; currentUser = null; mediaLibrary = []; renderPosts(); updateAllSidebars(); updateAuthUI(); updateDrawerProfile(); alert('✅ All data cleared.'); }
function initTheme() { const saved = localStorage.getItem('kirengaTheme'); const prefersDark = window.matchMedia('(prefers-color-scheme:dark)').matches; applyTheme(saved || (prefersDark ? 'dark' : 'light')); }
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('kirengaTheme', t); const btn = document.getElementById('theme-toggle'); if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙'; const sw = document.getElementById('dark-toggle-switch'); if (sw) sw.classList.toggle('active', t === 'dark'); }
function toggleTheme() { applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
function setFooterYear() { const el = document.getElementById('footer-year'); if (el) el.textContent = new Date().getFullYear(); }

function initScrollEffects() {
  const header = document.getElementById('site-header'); const progress = document.getElementById('reading-progress'); const backTop = document.getElementById('back-to-top');
  window.addEventListener('scroll', () => {
    const y = window.scrollY; const max = document.documentElement.scrollHeight - window.innerHeight; const pct = max > 0 ? (y / max) * 100 : 0;
    if (header) header.classList.toggle('scrolled', y > 60);
    if (progress) { progress.style.width = pct + '%'; progress.setAttribute('aria-valuenow', Math.round(pct)); }
    if (backTop) backTop.classList.toggle('show', y > 400);
  }, { passive: true });
  if (backTop) backTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
function initMobileNav() {
  const toggle = document.getElementById('nav-toggle'); const nav = document.getElementById('main-nav'); if (!toggle || !nav) return;
  toggle.addEventListener('click', () => { const o = nav.classList.toggle('open'); toggle.classList.toggle('open', o); toggle.setAttribute('aria-expanded', o); });
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { nav.classList.remove('open'); toggle.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }));
}
function initActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const topLinks = document.querySelectorAll('#main-nav a');
  const sideLinks = document.querySelectorAll('.sidebar-link');
  function markActive(id) { [...topLinks, ...sideLinks].forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id)); }
  const obs = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) markActive(e.target.id); }), { threshold: 0.3, rootMargin: '-80px 0px 0px 0px' });
  sections.forEach(s => obs.observe(s));
}

/* ════════════════════════════════════════════════════
   CHATBOT
════════════════════════════════════════════════════ */
const BOT_KB = [
  { p: ['hi','hello','hey','sup','hiya'],         r: "Hi! 👋 I'm <strong>Isaac Bot</strong>. Ask me anything about Kirenga Blog!" },
  { p: ['menu','hamburger','drawer'],              r: "Click the <strong>☰</strong> icon (top-left) to open the full side menu — Search, Learn, Solutions, Resources, Media, Settings, Feedback, Share, Terms and Privacy!" },
  { p: ['settings','profile','picture','avatar'],  r: "Open ☰ → Settings to upload a profile picture, edit your name/bio, toggle dark mode and change language!" },
  { p: ['language','lang','translate'],            r: "Go to ☰ → Settings → Language. Choose from 12 languages: English, French, Kiswahili, Spanish, German, Chinese, Arabic, Portuguese, Hindi, Japanese, Russian, Korean!" },
  { p: ['media','upload','file','video','audio'],  r: "Go to ☰ → Upload Media. Upload images, videos, audio, PDFs, Word docs and ZIP files — up to 10 MB each, with drag & drop!" },
  { p: ['learn','tutorial','html','css','js'],     r: "Go to ☰ → Learn. Interactive tutorials for HTML, CSS, JavaScript and Blogging tips with live code examples!" },
  { p: ['solutions'],                              r: "☰ → Solutions shows 6 use cases: Personal Blogging, Dev Notes, Photo Journal, Teaching Tool, Community Hub and Mobile-First." },
  { p: ['resources','links','reference'],          r: "☰ → Resources has curated links: MDN, CSS-Tricks, JavaScript.info, freeCodeCamp, Hashnode, Figma and more!" },
  { p: ['share','whatsapp','telegram','social'],   r: "☰ → Share Site lets you share on 13 platforms: Twitter, Facebook, WhatsApp, Telegram, LinkedIn, Instagram, TikTok, Pinterest, Reddit, Discord, Snapchat, Email and Copy Link!" },
  { p: ['login','sign in','log in','account'],     r: "Click <strong>Log in</strong> in the header. Use email/password or 6 social logins: Google, GitHub, Facebook, Twitter, Discord, LinkedIn." },
  { p: ['signup','register','create account'],     r: "Click <strong>Sign up</strong> in the header. Fill in your name, email and password — or use a social login. It's free!" },
  { p: ['forgot','password','reset'],              r: "On the login screen click <em>Forgot password?</em> to receive reset instructions." },
  { p: ['comment','reply'],                        r: "Open any post → scroll to Comments. You must be logged in to comment or reply." },
  { p: ['react','like','love','emoji','reaction'], r: "Click any emoji reaction (👍❤️😂😮😢😡) on post cards or inside the full post view. Login required!" },
  { p: ['post','write','publish'],                 r: "Fill the <strong>Write a New Post</strong> form: title, category, optional tags, content and optional photo. Click Publish!" },
  { p: ['dark','theme','mode','night'],            r: "Click 🌙 in the header or go to ☰ → Settings → Appearance to toggle dark mode. Your choice is remembered." },
  { p: ['search','find','filter'],                 r: "Use the search bar above posts — filters by title, content, tags or category in real time!" },
  { p: ['database','firebase','db','cloud'],       r: "Kirenga Blog uses Firebase Realtime Database! Data syncs in real-time across all devices. Just add your Firebase credentials to db-firebase.js and you're connected! 🔥" },
  { p: ['deploy','host','netlify','github','online'], r: "For deployment: use Netlify (drag & drop your folder — done in 2 minutes!), GitHub Pages or Vercel. All free!" },
  { p: ['terms','legal'],                          r: "☰ → Terms of Use, or check the footer." },
  { p: ['privacy','data'],                         r: "☰ → Privacy Policy. All data stays in your browser unless you connect Firebase Realtime Database." },
  { p: ['feedback','bug','suggestion'],            r: "☰ → Feedback to leave suggestions, bug reports or praise — with a 5-star rating!" },
  { p: ['newsletter','subscribe'],                 r: "Fill the newsletter section below the About section. Your email is saved locally or synced to Firebase if connected." },
];

// Chat history for context (per session)
const _chatHistory = [];

async function getBotReply(msg) {
  _chatHistory.push({ role: 'user', content: msg });
  const trimmed = _chatHistory.slice(-10);
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        system: `You are Isaac Bot, the friendly AI assistant for Kirenga Blog — a personal blog platform built by Kirenga Isaac, a professional system developer from Kampala, Uganda. The blog has: posts, comments, reactions, bookmarks, newsletter, contact form, dark/light theme, media library, collaboration tools, a code playground, and Firebase Realtime Database. Help visitors navigate the site and answer questions. Keep replies concise and warm. Use light markdown for clarity. You are not a general-purpose AI — gently redirect off-topic requests back to the blog.`,
        messages: trimmed,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();
    const reply = data.content?.[0]?.text || "Sorry, I couldn't get a response right now. Try again!";
    _chatHistory.push({ role: 'assistant', content: reply });
    return reply;
  } catch (e) {
    // Proxy not available — fall back to keyword replies silently
    const l = msg.toLowerCase();
    for (const entry of BOT_KB) { if (entry.p.some(p => l.includes(p))) return entry.r; }
    return "Hi! 👋 I'm Isaac Bot. Ask me about posts, comments, features or anything about Kirenga Blog!";
  }
}
function addMessage(text, type) {
  const msgs = document.getElementById('chat-messages'); if (!msgs) return;
  const d = document.createElement('div'); d.className = 'message ' + type; d.innerHTML = text;
  msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
}
function showTyping() {
  const msgs = document.getElementById('chat-messages'); if (!msgs) return;
  const t = document.createElement('div'); t.className = 'typing-indicator'; t.id = 'typing'; t.innerHTML = '<span></span><span></span><span></span>';
  msgs.appendChild(t); msgs.scrollTop = msgs.scrollHeight;
}
function hideTyping() { document.getElementById('typing')?.remove(); }
async function sendChatMessage() {
  const input = document.getElementById('chat-input'); if (!input) return;
  const text = input.value.trim(); if (!text) return;
  addMessage(escapeHTML(text), 'user-message'); input.value = '';
  showTyping();
  const reply = await getBotReply(text);
  hideTyping();
  addMessage(reply, 'bot-message');
}
function toggleChat() {
  chatOpen = !chatOpen;
  const win = document.getElementById('chat-window'); if (!win) return;
  win.classList.toggle('open', chatOpen);
  const badge = document.getElementById('chat-badge'); if (badge) badge.classList.add('hidden');
  if (chatOpen) setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
}
function closeChat() { chatOpen = false; document.getElementById('chat-window')?.classList.remove('open'); }

/* ════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setFooterYear();

  // Restore session — only for non-OAuth users (OAuth is handled by onAuthStateChanged)
  const savedUser = load('kirengaCurrentUser');
  if (savedUser && !savedUser.firebaseUid) {
    // Email/password user — restore immediately from localStorage
    currentUser = savedUser; updateAuthUI(); updateAllAvatars();
  } else if (savedUser && savedUser.firebaseUid) {
    // OAuth user — restore UI optimistically, onAuthStateChanged will confirm/reject
    currentUser = savedUser; updateAuthUI(); updateAllAvatars();
  }
  updateDrawerProfile();

  // Restore media library
  mediaLibrary = load('kirengaMedia', []).filter(m => m && m.name);

  // Cookie banner
  if (localStorage.getItem('cookiesAccepted')) { const b = document.getElementById('cookie-banner'); if (b) b.remove(); }

  // Language
  const lang = load('kirengaLang', 'en');
  if (lang && lang !== 'en') changeLanguage(lang);
  document.querySelectorAll('#lang-select,#settings-lang').forEach(el => { if (el) el.value = lang; });

  // DB init then load posts, then wire realtime
  initDB().then(() => {
    loadPosts();
    if (typeof DB !== 'undefined' && DB.isReady) {
      DB.subscribeToPostChanges(
        newPost => { if (!posts.find(p => p.id === newPost.id)) { posts.unshift(newPost); renderPosts(); updateAllSidebars(); showAlert('post-alert', '🔴 New post just published!', 'info'); } },
        deletedId => { const idx = posts.findIndex(p => p.id === deletedId); if (idx > -1) { posts.splice(idx, 1); renderPosts(); updateAllSidebars(); } }
      );
    }
  }).catch(() => loadPosts());

  updateMemberCount();
  initScrollEffects();
  initMobileNav();
  initActiveNav();
  setupDragDrop();
  setupMediaDragDrop();
  setupCharCounters();
  setupPasswordStrength();

  // Event listeners
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

  // Chatbot — three ways to trigger
  document.getElementById('chat-toggle')?.addEventListener('click', toggleChat);
  document.getElementById('chat-send-btn')?.addEventListener('click', sendChatMessage);
  document.getElementById('chat-input')?.addEventListener('keypress', e => { if (e.key === 'Enter') sendChatMessage(); });

  // Search
  document.getElementById('search')?.addEventListener('input', searchPosts);
  document.getElementById('sidebar-search')?.addEventListener('input', e => { const s = document.getElementById('search'); if (s) s.value = e.target.value; searchPosts(); });

  // Overlay backdrops
  document.getElementById('auth-overlay')?.addEventListener('click', e => { if (e.target === document.getElementById('auth-overlay')) closeAuth(); });
  document.getElementById('post-modal')?.addEventListener('click', e => { if (e.target === document.getElementById('post-modal')) closeModal(); });

  // Escape key closes everything
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('post-modal');
    const authOverlay = document.getElementById('auth-overlay');
    const drawer = document.getElementById('side-drawer');
    if (modal && !modal.hidden) closeModal();
    else if (authOverlay && !authOverlay.hidden) closeAuth();
    else if (activePanel) closePanel();
    else if (drawer && drawer.classList.contains('open')) closeDrawer();
    else if (chatOpen) closeChat();
  });

  // Close user dropdown on outside click
  document.addEventListener('click', e => {
    const dd = document.getElementById('user-dropdown'); const um = document.getElementById('user-menu');
    if (dd && !dd.hidden && um && !um.contains(e.target)) dd.hidden = true;
  });

  // Welcome bot message
  setTimeout(() => {
    addMessage("Hi! 👋 I'm <strong>Isaac Bot</strong>.<br>Ask me anything — posts, settings, database, deployment or click ☰ to explore!", 'bot-message');
  }, 1000);

  console.log('%c✅ Kirenga Blog v3.0 — Final Edition', 'color:#1a73e8;font-weight:700;font-size:13px');
});

/* ════════════════════════════════════════════════════
   PRICING & BILLING
════════════════════════════════════════════════════ */
let billingPlan = 'pro';
let billingAnnual = false;
let couponApplied = false;
let selectedPayMethod = 'card';
let teamSize = '2-5';

const PLANS = {
  pro:  { name:'Pro',  monthly:9,  annual:6,  icon:'🚀', desc:'Unlock cloud sync, media library and more.' },
  team: { name:'Team', monthly:24, annual:17, icon:'🤝', desc:'Everything in Pro plus team collaboration tools.' },
};
const VALID_COUPONS = { 'KIRENGA30':30, 'BLOG20':20, 'LAUNCH50':50 };

function toggleBilling() {
  billingAnnual = !billingAnnual;
  const toggle = document.getElementById('billing-toggle');
  if (toggle) toggle.classList.toggle('annual', billingAnnual);
  // Update all prices in the grid
  document.querySelectorAll('.pricing-amount[data-monthly]').forEach(el => {
    el.textContent = billingAnnual ? el.dataset.annual : el.dataset.monthly;
  });
}

function openBillingModal(plan = 'pro') {
  if (!currentUser) { showAuth('login'); return; }
  billingPlan = plan; couponApplied = false;
  const p = PLANS[plan];
  document.getElementById('billing-modal-icon').textContent = p.icon;
  document.getElementById('billing-modal-title').textContent = `Upgrade to ${p.name}`;
  document.getElementById('billing-modal-desc').textContent = p.desc;
  updateBillingSummary();
  document.getElementById('billing-modal').hidden = false;
  document.body.style.overflow = 'hidden';
  document.getElementById('billing-email').value = currentUser?.email || '';
  document.getElementById('billing-alert').className = 'alert';
  document.getElementById('coupon-alert').className = 'alert';
  document.getElementById('coupon-input').value = '';
  document.getElementById('billing-form').reset();
  document.getElementById('billing-email').value = currentUser?.email || '';
}
function closeBillingModal() { document.getElementById('billing-modal').hidden = true; document.body.style.overflow = ''; }

function updateBillingSummary() {
  const p = PLANS[billingPlan];
  const price = billingAnnual ? p.annual : p.monthly;
  const period = billingAnnual ? 'Annual' : 'Monthly';
  document.getElementById('bs-plan').textContent = `${p.name} — ${period}`;
  document.getElementById('bs-price').textContent = `$${price}.00/${billingAnnual ? 'month (billed annually)' : 'month'}`;
  const discRow = document.getElementById('bs-discount-row');
  if (couponApplied && discRow) {
    const pct = VALID_COUPONS[document.getElementById('coupon-input').value.trim().toUpperCase()] || 0;
    const disc = (price * pct / 100).toFixed(2);
    const total = (price - parseFloat(disc)).toFixed(2);
    discRow.hidden = false;
    document.getElementById('bs-discount').textContent = `-$${disc}`;
    document.getElementById('bs-total').textContent = `$${total}`;
  } else {
    if (discRow) discRow.hidden = true;
    document.getElementById('bs-total').textContent = `$${price}.00`;
  }
}

function applyCoupon() {
  const code = document.getElementById('coupon-input').value.trim().toUpperCase();
  if (!code) { showAlert('coupon-alert','⚠️ Enter a coupon code.','error'); return; }
  const pct = VALID_COUPONS[code];
  if (!pct) { showAlert('coupon-alert','❌ Invalid coupon code.','error'); couponApplied = false; updateBillingSummary(); return; }
  couponApplied = true;
  showAlert('coupon-alert',`🎉 Coupon applied! ${pct}% off.`,'success');
  updateBillingSummary();
}

function selectPayMethod(btn, method) {
  document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedPayMethod = method;
  // Show/hide card fields based on method
  const cardFields = document.getElementById('billing-card')?.closest('.form-group');
  const expiryRow = document.getElementById('billing-expiry')?.closest('.form-row');
  const cvvRow = document.getElementById('billing-cvv')?.closest('.form-row');
  const show = method === 'card';
  if (cardFields) cardFields.style.display = show ? '' : 'none';
  if (expiryRow) expiryRow.style.display = show ? '' : 'none';
  if (cvvRow) cvvRow.style.display = show ? '' : 'none';
}

function formatCard(input) {
  let v = input.value.replace(/\D/g,'').slice(0,16);
  input.value = v.replace(/(.{4})/g,'$1 ').trim();
}
function formatExpiry(input) {
  let v = input.value.replace(/\D/g,'');
  if (v.length >= 2) v = v.slice(0,2) + ' / ' + v.slice(2,4);
  input.value = v;
}

async function processBilling(e) {
  e.preventDefault();
  const btn = document.getElementById('billing-submit-btn');
  const name  = document.getElementById('billing-name').value.trim();
  const email = document.getElementById('billing-email').value.trim();
  if (!name || !email) { showAlert('billing-alert','⚠️ Please fill in all fields.','error'); return; }
  if (selectedPayMethod === 'card') {
    const card = document.getElementById('billing-card').value.replace(/\s/g,'');
    if (card.length < 13) { showAlert('billing-alert','⚠️ Please enter a valid card number.','error'); return; }
  }
  btn.textContent = '⏳ Processing…'; btn.disabled = true;
  try {
    const sub = {
      plan: billingPlan,
      annual: billingAnnual,
      method: selectedPayMethod,
      email, name,
      date: new Date().toISOString(),
      coupon: couponApplied ? document.getElementById('coupon-input')?.value.trim().toUpperCase() : null,
      status: 'active',
      uid: currentUser?.firebaseUid || null,
    };
    // Save to Firebase DB
    await DB.sendFeedback({ type: 'subscription', ...sub });
    // Also update the user's record with their plan
    if (currentUser) {
      currentUser.plan = billingPlan;
      save('kirengaCurrentUser', currentUser);
      if (currentUser.id) await DB.updateUser(currentUser.id, { plan: billingPlan });
    }
    save('kirengaSubscription', sub);
    btn.textContent = '✅ Payment Successful!'; btn.style.background = 'var(--green)';
    showAlert('billing-alert','🎉 Welcome to ' + PLANS[billingPlan].name + '! Your account has been upgraded.');
    setTimeout(() => { closeBillingModal(); btn.textContent = '🔒 Complete Payment'; btn.disabled = false; btn.style.background = ''; }, 3000);
  } catch (err) {
    console.error('Billing error:', err);
    showAlert('billing-alert','⚠️ Payment processing failed. Please try again.','error');
    btn.textContent = '🔒 Complete Payment'; btn.disabled = false;
  }
}

/* ════════════════════════════════════════════════════
   COLLABORATION PLATFORM
════════════════════════════════════════════════════ */
let teamMembers = [];
let selectedTeamSize = '2-5';

function openCollabModal() {
  if (!currentUser) { showAuth('login'); return; }
  document.getElementById('collab-modal').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeCollabModal() { document.getElementById('collab-modal').hidden = true; document.body.style.overflow = ''; }

function selectTeamSize(btn, size) {
  document.querySelectorAll('.team-size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); selectedTeamSize = size;
}

async function createTeam(e) {
  e.preventDefault();
  const name = document.getElementById('team-name').value.trim();
  const desc = document.getElementById('team-desc').value.trim();
  if (!name) { showAlert('collab-modal-alert','⚠️ Please enter a team name.','error'); return; }
  const team = { name, desc, size: selectedTeamSize, owner: currentUser.name, ownerEmail: currentUser.email, members: [{ name: currentUser.name, email: currentUser.email, role: 'admin', joined: new Date().toISOString() }], created: new Date().toISOString() };
  save('kirengaTeam', team);
  teamMembers = team.members;
  renderCollabMembers();
  showAlert('collab-modal-alert','🎉 Team "' + escapeHTML(name) + '" created! Now invite your teammates.');
  setTimeout(() => { closeCollabModal(); document.getElementById('collaboration').scrollIntoView({ behavior:'smooth' }); }, 1500);
}

async function sendCollabInvite() {
  if (!currentUser) { showAuth('login'); return; }
  const email = document.getElementById('collab-invite-email').value.trim();
  const role  = document.getElementById('collab-invite-role').value;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showAlert('collab-invite-alert','⚠️ Please enter a valid email address.','error'); return; }
  if (teamMembers.find(m => m.email === email)) { showAlert('collab-invite-alert','⚠️ This person is already in your team.','error'); return; }
  const member = { name: email.split('@')[0].replace(/[._]/g,' ').replace(/\b\w/g, c=>c.toUpperCase()), email, role, status: 'invited', joined: new Date().toISOString(), invitedBy: currentUser.email };
  teamMembers.push(member);
  const team = load('kirengaTeam', {});
  team.members = teamMembers;
  save('kirengaTeam', team);
  // Save invite to Firebase so it's persisted
  await DB.sendFeedback({ type: 'collab-invite', teamName: team.name || 'Unknown', invitedEmail: email, role, invitedBy: currentUser.email, date: new Date().toISOString() });
  renderCollabMembers();
  showAlert('collab-invite-alert','✅ Invite sent to ' + escapeHTML(email) + '! They\'ll get a free 14-day trial.');
  document.getElementById('collab-invite-email').value = '';
}

function renderCollabMembers() {
  const list = document.getElementById('collab-members-list'); if (!list) return;
  const label = '<p class="sidebar-section-label" style="margin-bottom:12px">Your Team Members</p>';
  if (!teamMembers.length) {
    list.innerHTML = label + '<div class="collab-empty-state"><span>👥</span><p>No teammates yet. Send an invite above!</p></div>';
    return;
  }
  const ROLE_COLORS = { admin:'#7c3aed', editor:'#1a73e8', author:'#34a853', viewer:'#6b7280' };
  list.innerHTML = label + teamMembers.map(m => `
    <div class="collab-member-item">
      <div class="collab-member-av" style="background:${avatarColor(m.name)}">${initials(m.name)}</div>
      <div class="collab-member-info">
        <strong>${escapeHTML(m.name)}</strong>
        <span>${escapeHTML(m.email)} ${m.status === 'invited' ? '· <em>Invite pending</em>' : ''}</span>
      </div>
      <span class="collab-member-role" style="background:${ROLE_COLORS[m.role] || '#6b7280'}20;color:${ROLE_COLORS[m.role] || '#6b7280'}">${escapeHTML(m.role)}</span>
    </div>`).join('');
}

function loadCollabData() {
  const team = load('kirengaTeam', null);
  if (team && team.members) { teamMembers = team.members; renderCollabMembers(); }
}

/* ════════════════════════════════════════════════════
   DISCOUNT POPUP
════════════════════════════════════════════════════ */

function showDiscountPopup(force = false) {
  if (!force && localStorage.getItem('discountDismissed')) return;
  if (!force && localStorage.getItem('discountShown')) return;
  localStorage.setItem('discountShown', '1');
  document.getElementById('discount-popup').hidden = false;
  document.getElementById('discount-overlay').hidden = false;
  document.body.style.overflow = 'hidden';
  startDiscountCountdown();
}

function closeDiscount() {
  document.getElementById('discount-popup').hidden = true;
  document.getElementById('discount-overlay').hidden = true;
  document.body.style.overflow = '';
  if (discountCountdownTimer) clearInterval(discountCountdownTimer);
}

function dismissDiscountForever() {
  localStorage.setItem('discountDismissed', '1');
  closeDiscount();
}

function copyDiscountCode() {
  const code = document.getElementById('discount-code-text')?.textContent || 'KIRENGA30';
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector('.discount-copy-btn');
    if (btn) { const o = btn.innerHTML; btn.innerHTML = '✅ Copied!'; setTimeout(() => { btn.innerHTML = o; }, 2000); }
    // Auto-fill the coupon input if billing modal is open
    const couponInput = document.getElementById('coupon-input');
    if (couponInput) couponInput.value = code;
  }).catch(() => alert('Code: ' + code));
}

function startDiscountCountdown() {
  // Restore remaining time from storage
  const saved = localStorage.getItem('discountExpiry');
  if (saved) {
    discountSecondsLeft = Math.max(0, Math.floor((parseInt(saved) - Date.now()) / 1000));
  } else {
    const expiry = Date.now() + discountSecondsLeft * 1000;
    localStorage.setItem('discountExpiry', expiry.toString());
  }
  updateCountdownDisplay();
  discountCountdownTimer = setInterval(() => {
    discountSecondsLeft = Math.max(0, discountSecondsLeft - 1);
    updateCountdownDisplay();
    if (discountSecondsLeft <= 0) { clearInterval(discountCountdownTimer); closeDiscount(); }
  }, 1000);
}

function updateCountdownDisplay() {
  const h = Math.floor(discountSecondsLeft / 3600);
  const m = Math.floor((discountSecondsLeft % 3600) / 60);
  const s = discountSecondsLeft % 60;
  const hEl = document.getElementById('cd-hours');
  const mEl = document.getElementById('cd-mins');
  const sEl = document.getElementById('cd-secs');
  if (hEl) hEl.textContent = String(h).padStart(2,'0');
  if (mEl) mEl.textContent = String(m).padStart(2,'0');
  if (sEl) sEl.textContent = String(s).padStart(2,'0');
}

/* ── Wire everything into DOMContentLoaded ─────────── */
const _origInit = window.addEventListener;
document.addEventListener('DOMContentLoaded', () => {
  // Load collab data
  loadCollabData();
  // Show discount popup after 8 seconds (only once per session unless dismissed forever)
  setTimeout(() => showDiscountPopup(false), 8000);
  // Close modals on Escape — extend existing listener
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('billing-modal').hidden) closeBillingModal();
    if (!document.getElementById('collab-modal').hidden) closeCollabModal();
    if (!document.getElementById('discount-popup').hidden) closeDiscount();
  });
  // Backdrop clicks
  document.getElementById('billing-modal')?.addEventListener('click', e => { if (e.target === document.getElementById('billing-modal')) closeBillingModal(); });
  document.getElementById('collab-modal')?.addEventListener('click', e => { if (e.target === document.getElementById('collab-modal')) closeCollabModal(); });
});

/* ════════════════════════════════════════════════════
   TOAST NOTIFICATION SYSTEM
════════════════════════════════════════════════════ */
function toast(message, type = 'info', title = '', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span>
    <div class="toast-body">${title ? `<div class="toast-title">${escapeHTML(title)}</div>` : ''}<div class="toast-msg">${escapeHTML(message)}</div></div>
    <button class="toast-close-btn" onclick="this.closest('.toast').remove()">✕</button>`;
  container.appendChild(t);
  setTimeout(() => {
    t.classList.add('toast-out');
    setTimeout(() => t.remove(), 350);
  }, duration);
}

/* ════════════════════════════════════════════════════
   DRAFT AUTO-SAVE
════════════════════════════════════════════════════ */
let autosaveTimer = null;
function setupAutosave() {
  const fields = ['new-title','new-content','new-tags','new-category'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      clearTimeout(autosaveTimer);
      const status = document.getElementById('autosave-status');
      if (status) { status.textContent = 'Saving…'; status.className = 'autosave-status saving'; }
      autosaveTimer = setTimeout(() => {
        saveDraft(true);
        if (status) { status.textContent = 'Draft saved ✓'; status.className = 'autosave-status'; setTimeout(() => { status.textContent = ''; }, 3000); }
      }, 1500);
    });
  });
}
function saveDraft(silent = false) {
  const draft = {
    title: document.getElementById('new-title')?.value || '',
    content: document.getElementById('new-content')?.value || '',
    tags: document.getElementById('new-tags')?.value || '',
    category: document.getElementById('new-category')?.value || 'General',
    pinned: document.getElementById('post-pinned')?.checked || false,
    featured: document.getElementById('post-featured')?.checked || false,
    savedAt: new Date().toISOString(),
  };
  if (!draft.title && !draft.content) return;
  save('kirengaDraft', draft);
  if (!silent) toast('Draft saved successfully!', 'success', 'Saved');
}
function loadDraft() {
  const draft = load('kirengaDraft', null);
  if (!draft) { toast('No draft found.', 'warning', 'Draft'); return; }
  const t = document.getElementById('new-title'); if (t) t.value = draft.title || '';
  const c = document.getElementById('new-content'); if (c) c.value = draft.content || '';
  const tg = document.getElementById('new-tags'); if (tg) tg.value = draft.tags || '';
  const cat = document.getElementById('new-category'); if (cat) cat.value = draft.category || 'General';
  const pin = document.getElementById('post-pinned'); if (pin) pin.checked = draft.pinned || false;
  const feat = document.getElementById('post-featured'); if (feat) feat.checked = draft.featured || false;
  updateWordCount();
  toast(`Draft from ${formatDate(draft.savedAt)} loaded!`, 'success', 'Draft Loaded');
  document.getElementById('write').scrollIntoView({ behavior: 'smooth' });
}

/* ════════════════════════════════════════════════════
   WORD COUNT & READING TIME
════════════════════════════════════════════════════ */
function updateWordCount() {
  const content = document.getElementById('new-content')?.value || '';
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const mins = Math.max(1, Math.round(words / 200));
  const el = document.getElementById('word-count');
  if (el) el.textContent = `${words.toLocaleString()} word${words !== 1 ? 's' : ''} · ${mins} min read`;
}

/* ════════════════════════════════════════════════════
   BOOKMARKS
════════════════════════════════════════════════════ */
function toggleBookmark(postIndex) {
  if (!currentUser) { showAuth('login'); return; }
  const post = posts[postIndex]; if (!post) return;
  const bookmarks = load('kirengaBookmarks', []);
  const idx = bookmarks.findIndex(b => b.id === post.id);
  if (idx > -1) {
    bookmarks.splice(idx, 1);
    save('kirengaBookmarks', bookmarks);
    toast('Bookmark removed.', 'info');
    renderPosts();
  } else {
    bookmarks.unshift({ id: post.id, title: post.title, category: post.category, date: post.date, postIndex });
    save('kirengaBookmarks', bookmarks);
    toast('Post bookmarked! 🔖', 'success', 'Bookmarked');
    renderPosts();
  }
}
function isBookmarked(postId) {
  return load('kirengaBookmarks', []).some(b => b.id === postId);
}
function showBookmarks() {
  if (!currentUser) { showAuth('login'); return; }
  const modal = document.getElementById('bookmarks-modal'); if (!modal) return;
  const bookmarks = load('kirengaBookmarks', []);
  const list = document.getElementById('bookmarks-list');
  if (!list) return;
  if (!bookmarks.length) {
    list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-icon">🔖</div><p>No bookmarks yet. Click the 🔖 on any post to save it.</p></div>';
  } else {
    list.innerHTML = bookmarks.map((b, i) => `
      <div class="bookmark-item" onclick="closeBookmarksModal();openModal(${posts.findIndex(p=>p.id===b.id)})">
        <span style="font-size:1.1rem">📄</span>
        <div style="flex:1;min-width:0">
          <div class="bookmark-item-title">${escapeHTML(b.title)}</div>
          <div class="bookmark-item-meta">${escapeHTML(b.category)} • ${escapeHTML(b.date)}</div>
        </div>
        <button class="bookmark-remove" onclick="event.stopPropagation();removeBookmark('${escapeJS(b.id)}')" title="Remove bookmark">🗑</button>
      </div>`).join('');
  }
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}
function removeBookmark(id) {
  const bookmarks = load('kirengaBookmarks', []).filter(b => b.id !== id);
  save('kirengaBookmarks', bookmarks);
  showBookmarks();
  toast('Bookmark removed.', 'info');
}
function closeBookmarksModal() { document.getElementById('bookmarks-modal').hidden = true; document.body.style.overflow = ''; }

/* ════════════════════════════════════════════════════
   POST VIEW COUNTER
════════════════════════════════════════════════════ */
function incrementViewCount(postId) {
  const views = load('kirengaViews', {});
  views[postId] = (views[postId] || 0) + 1;
  save('kirengaViews', views);
  return views[postId];
}
function getViewCount(postId) {
  return load('kirengaViews', {})[postId] || 0;
}

/* ════════════════════════════════════════════════════
   IMAGE LIGHTBOX
════════════════════════════════════════════════════ */
let lightboxImages = [];
let lightboxIndex = 0;
function openLightbox(src, caption = '', allImages = []) {
  lightboxImages = allImages.length ? allImages : [{ src, caption }];
  lightboxIndex = allImages.findIndex(i => i.src === src);
  if (lightboxIndex < 0) lightboxIndex = 0;
  renderLightbox();
  document.getElementById('lightbox').hidden = false;
  document.body.style.overflow = 'hidden';
}
function renderLightbox() {
  const img = lightboxImages[lightboxIndex] || {};
  document.getElementById('lightbox-img').src = img.src || '';
  document.getElementById('lightbox-caption').textContent = img.caption || '';
  const prev = document.querySelector('.lightbox-prev');
  const next = document.querySelector('.lightbox-next');
  if (prev) prev.style.display = lightboxImages.length > 1 ? '' : 'none';
  if (next) next.style.display = lightboxImages.length > 1 ? '' : 'none';
}
function lightboxNav(dir) {
  lightboxIndex = (lightboxIndex + dir + lightboxImages.length) % lightboxImages.length;
  renderLightbox();
}
function closeLightbox() { document.getElementById('lightbox').hidden = true; document.body.style.overflow = ''; }

/* ════════════════════════════════════════════════════
   EMOJI PICKER
════════════════════════════════════════════════════ */
const EMOJIS = ['😀','😂','😍','🥹','😎','🤔','😅','🙏','👍','❤️','🔥','✨','🎉','💯','🚀','💡','📝','🐛','⭐','🌍','💻','📱','🎓','💪','👏','🤝','🙌','💬','📖','🏆','😭','🥲','😮','😡','😢','🤯','💔','👎','😴','🤗'];
let emojiTargetId = null;
function setupEmojiPicker() {
  const grid = document.getElementById('emoji-grid');
  if (!grid) return;
  grid.innerHTML = EMOJIS.map(e =>
    `<button class="emoji-btn" onclick="insertEmoji('${e}')" title="${e}">${e}</button>`
  ).join('');
  document.addEventListener('click', e => {
    const picker = document.getElementById('emoji-picker');
    if (picker && !picker.hidden && !picker.contains(e.target) && !e.target.classList.contains('comment-emoji-btn')) {
      picker.hidden = true;
    }
  });
}
function toggleEmojiPicker(targetId) {
  const picker = document.getElementById('emoji-picker');
  if (!picker) return;
  const btn = document.querySelector(`[data-emoji-target="${targetId}"]`) || document.getElementById('emoji-trigger-' + targetId);
  emojiTargetId = targetId;
  if (picker.hidden) {
    if (btn) {
      const rect = btn.getBoundingClientRect();
      picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
      picker.style.right = (window.innerWidth - rect.right) + 'px';
    }
    picker.hidden = false;
  } else { picker.hidden = true; }
}
function insertEmoji(emoji) {
  const input = document.getElementById(emojiTargetId || 'comment-text');
  if (!input) return;
  const start = input.selectionStart; const end = input.selectionEnd;
  input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
  input.selectionStart = input.selectionEnd = start + emoji.length;
  input.focus();
  document.getElementById('emoji-picker').hidden = true;
  input.dispatchEvent(new Event('input'));
}

/* ════════════════════════════════════════════════════
   CODE SYNTAX HIGHLIGHT & COPY
════════════════════════════════════════════════════ */
function highlightCodeBlocks(container) {
  container.querySelectorAll('pre code, .learn-code-block').forEach(block => {
    if (block.dataset.highlighted) return;
    block.dataset.highlighted = '1';
    let html = escapeHTML(block.textContent || '');
    html = html
      .replace(/\b(const|let|var|function|return|if|else|for|while|class|new|this|import|export|from|async|await|typeof|null|undefined|true|false)\b/g, '<span class="token-keyword">$1</span>')
      .replace(/(["'`])([^"'`]*)\1/g, '<span class="token-string">$1$2$1</span>')
      .replace(/\/\/.*$/gm, '<span class="token-comment">$&</span>')
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="token-number">$1</span>')
      .replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, '<span class="token-function">$1</span>');
    const wrap = document.createElement('div');
    wrap.className = 'code-block-wrap';
    const pre = document.createElement('pre');
    pre.className = 'highlighted';
    pre.innerHTML = html;
    const copyBtn = document.createElement('button');
    copyBtn.className = 'code-copy-btn';
    copyBtn.textContent = '📋 Copy';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(block.textContent || '').then(() => {
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
      });
    };
    wrap.appendChild(pre);
    wrap.appendChild(copyBtn);
    block.parentNode.replaceChild(wrap, block);
  });
}

/* ════════════════════════════════════════════════════
   TABLE OF CONTENTS (for post modal)
════════════════════════════════════════════════════ */
function buildTableOfContents(content) {
  const lines = content.split('\n');
  const headings = lines.filter(l => l.startsWith('# ') || l.startsWith('## ') || l.startsWith('### '));
  if (headings.length < 3) return '';
  const items = headings.map((h, i) => {
    const level = h.startsWith('### ') ? 'toc-h3' : h.startsWith('## ') ? 'toc-h2' : 'toc-h1';
    const text = h.replace(/^#+\s/, '');
    return `<li class="toc-item ${level}"><a href="#" onclick="return false">${escapeHTML(text)}</a></li>`;
  }).join('');
  return `<div class="toc-wrap"><div class="toc-title">📋 Table of Contents</div><ul class="toc-list">${items}</ul></div>`;
}

/* ════════════════════════════════════════════════════
   RELATED POSTS (in modal)
════════════════════════════════════════════════════ */
function buildRelatedPosts(currentPost) {
  const related = posts.filter(p =>
    p.id !== currentPost.id && (
      p.category === currentPost.category ||
      (p.tags || []).some(t => (currentPost.tags || []).includes(t))
    )
  ).slice(0, 4);
  if (!related.length) return '';
  const cards = related.map(p => {
    const idx = posts.indexOf(p);
    return `<div class="related-card" onclick="openModal(${idx})">
      <div class="related-card-title">${escapeHTML(p.title)}</div>
      <div class="related-card-meta">${escapeHTML(p.category)} • ${escapeHTML(p.date)}</div>
    </div>`;
  }).join('');
  return `<div class="related-posts"><h4>Related Posts</h4><div class="related-grid">${cards}</div></div>`;
}

/* ════════════════════════════════════════════════════
   EXPORT / IMPORT POSTS
════════════════════════════════════════════════════ */
function exportPosts() {
  if (!posts.length) { toast('No posts to export.', 'warning'); return; }
  const data = JSON.stringify({ version: '3.0', exported: new Date().toISOString(), posts }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `kirenga-blog-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  toast(`${posts.length} posts exported successfully!`, 'success', 'Export Done');
}
function importPosts(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const data = JSON.parse(ev.target.result);
      const imported = data.posts || (Array.isArray(data) ? data : null);
      if (!imported) { toast('Invalid file format.', 'error', 'Import Failed'); return; }
      let added = 0;
      imported.forEach(p => {
        if (!posts.find(x => x.id === p.id)) {
          posts.push(p); added++;
        }
      });
      await savePosts(); renderPosts(); updateAllSidebars();
      toast(`${added} posts imported!`, 'success', 'Import Done');
    } catch (err) { toast('Could not parse file. Make sure it is a valid JSON export.', 'error', 'Import Failed'); }
    e.target.value = '';
  };
  reader.readAsText(file);
}
function printPost() {
  if (openModalIndex === null) return;
  const post = posts[openModalIndex]; if (!post) return;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${post.title}</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;padding:20px;line-height:1.8;color:#222}h1{margin-bottom:8px}img{max-width:100%;border-radius:8px;margin:12px 0}pre{background:#f4f4f4;padding:16px;border-radius:6px;overflow-x:auto}@media print{body{margin:0;padding:10px}}</style></head><body><h1>${escapeHTML(post.title)}</h1><p style="color:#666;font-size:.9rem">${escapeHTML(post.category)} · ${escapeHTML(post.date)}</p>${post.image ? `<img src="${post.image}" alt="Post image">` : ''}<div style="white-space:pre-wrap">${escapeHTML(post.content)}</div></body></html>`);
  win.document.close();
  win.print();
}

/* ════════════════════════════════════════════════════
   ADMIN DASHBOARD
════════════════════════════════════════════════════ */
const PANELS_EXTENDED = ['search','settings','feedback','solutions','resources','learn','media','share','terms','privacy','admin','faq'];
// Override openPanel to include extended panels
const _origOpenPanel = openPanel;
window.openPanel = function(id) {
  PANELS_EXTENDED.forEach(p => { const el = document.getElementById('panel-' + p); if (el) { el.hidden = true; el.classList.remove('open'); } });
  const panel = document.getElementById('panel-' + id); if (!panel) return;
  panel.hidden = false;
  document.getElementById('panel-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => panel.classList.add('open'));
  activePanel = id;
  if (id === 'settings') initSettingsPanel();
  if (id === 'learn') initLearnPanel('html');
  if (id === 'media') renderMediaGrid();
  if (id === 'search') setTimeout(() => document.getElementById('panel-search-input')?.focus(), 200);
  if (id === 'admin') initAdminDashboard();
  if (id === 'faq') initFAQ();
};
const _origClosePanel = closePanel;
window.closePanel = function() {
  PANELS_EXTENDED.forEach(p => { const el = document.getElementById('panel-' + p); if (el) { el.classList.remove('open'); setTimeout(() => { el.hidden = true; }, 320); } });
  document.getElementById('panel-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
  activePanel = null;
};

function initAdminDashboard() {
  const views = load('kirengaViews', {});
  const totalViews = Object.values(views).reduce((s, v) => s + v, 0);
  const totalComments = posts.reduce((s, p) => s + (p.comments || []).length, 0);
  const totalReactions = posts.reduce((s, p) => s + Object.values(p.reactions || {}).reduce((a, b) => a + b, 0), 0);
  const users = load('kirengaUsers', []);
  // Stats grid
  const sg = document.getElementById('admin-stats-grid');
  if (sg) sg.innerHTML = [
    { label: 'Total Posts', value: posts.length, icon: '📝' },
    { label: 'Total Views', value: totalViews.toLocaleString(), icon: '👁️' },
    { label: 'Comments', value: totalComments, icon: '💬' },
    { label: 'Reactions', value: totalReactions, icon: '❤️' },
    { label: 'Members', value: users.length, icon: '👥' },
    { label: 'Bookmarks', value: load('kirengaBookmarks', []).length, icon: '🔖' },
  ].map(s => `<div class="admin-stat-card"><span class="ast-value">${s.value}</span><span class="ast-label">${s.icon} ${s.label}</span></div>`).join('');
  // Top posts by views
  const tp = document.getElementById('admin-top-posts');
  if (tp) {
    const sorted = [...posts].sort((a, b) => (views[b.id] || 0) - (views[a.id] || 0)).slice(0, 5);
    tp.innerHTML = sorted.length ? sorted.map((p, i) => `
      <div class="admin-post-row" onclick="openModal(${posts.indexOf(p)});closePanel()">
        <span style="font-size:.8rem;color:var(--muted);width:18px">${i + 1}</span>
        <div class="admin-post-title">${escapeHTML(p.title)}</div>
        <span class="admin-post-views">👁 ${views[p.id] || 0}</span>
        <span class="badge" style="margin-left:4px">${escapeHTML(p.category)}</span>
      </div>`).join('') : '<p style="color:var(--muted);font-size:.85rem">No posts yet.</p>';
  }
  // Recent activity
  const ra = document.getElementById('admin-activity');
  if (ra) {
    const activities = [];
    posts.slice(0, 3).forEach(p => activities.push({ icon:'📝', text:`Post published: "${p.title}"`, time: p.date }));
    const bookmarks = load('kirengaBookmarks', []).slice(0, 2);
    bookmarks.forEach(b => activities.push({ icon:'🔖', text:`Post bookmarked: "${b.title}"`, time: b.date || '' }));
    if (!activities.length) { ra.innerHTML = '<p style="color:var(--muted);font-size:.85rem">No activity yet.</p>'; return; }
    ra.innerHTML = activities.slice(0, 5).map(a => `<div class="admin-activity-item"><span class="admin-activity-icon">${a.icon}</span><div><div style="font-weight:600;color:var(--text)">${escapeHTML(a.text)}</div><div style="font-size:.72rem;color:var(--muted)">${a.time}</div></div></div>`).join('');
  }
}

/* ════════════════════════════════════════════════════
   FAQ
════════════════════════════════════════════════════ */
const FAQ_DATA = [
  { q: 'What is Kirenga Blog?', a: 'A personal blogging platform built from scratch on an Android phone using TrebEdit, then polished in VS Code. It supports posts, comments, reactions, dark mode, and can connect to a Firebase cloud database.' },
  { q: 'Is it free to use?', a: 'Yes! The Free plan is completely free — unlimited posts, comments and reactions, all saved in your browser. Pro and Team plans unlock cloud sync, media library and collaboration tools.' },
  { q: 'Where is my data stored?', a: 'By default, all your data (posts, accounts, settings) is stored in your browser\'s localStorage — nothing is sent to any server. You can optionally connect a free Firebase database for cloud sync.' },
  { q: 'How do I enable cloud sync?', a: 'Sign up at firebase.google.com, create a free project, copy your Project URL and anon key, paste them into db-firebase.js, and run db-firebase.js in the Firebase Editor. Your blog will show a 🔵 Firebase (realtimedb) badge.' },
  { q: 'Can I collaborate with others?', a: 'Yes! With the Team plan, you can invite teammates, assign roles (Admin, Editor, Author, Viewer), co-author posts, and share a media library. Use the Collaboration section or ☰ menu → Collaboration.' },
  { q: 'How do I deploy this blog online?', a: 'The easiest way is Netlify Drop — zip your files, go to netlify.com/drop, and drag the folder. You\'ll have a live link in under 2 minutes. GitHub Pages and Vercel are also free options.' },
  { q: 'How do I use the discount code?', a: 'Click ☰ → Get 30% Discount (or wait 8 seconds for it to appear). Copy the code KIRENGA30 and enter it in the billing checkout modal. It gives 30% off Pro or Team for 3 months.' },
  { q: 'Can I export my posts?', a: 'Yes! Go to ☰ → Export Posts to download all your posts as a JSON file. You can re-import them on another device using ☰ → Import Posts.' },
  { q: 'What keyboard shortcuts are available?', a: 'Press ? anywhere on the page to see all shortcuts. Key ones: Ctrl+/ opens search, Ctrl+D toggles dark mode, Ctrl+S saves a draft, and G H / G P / G W navigate between sections.' },
  { q: 'How do I bookmark a post?', a: 'Click the 🔖 bookmark button on any post card. View your bookmarks via the user menu (top right) → Bookmarks, or ☰ → Bookmarks.' },
  { q: 'How do I reset everything?', a: 'Go to ☰ → Settings → Danger Zone → Delete All My Data. This permanently clears all posts, accounts and settings from your browser. This cannot be undone.' },
  { q: 'Is the blog accessible?', a: 'Yes! It includes skip links, ARIA labels, keyboard navigation, focus-visible styles, prefers-reduced-motion support, and high contrast mode support.' },
];
function initFAQ() {
  renderFAQ(FAQ_DATA);
}
function filterFAQ(query) {
  const q = query.toLowerCase();
  const filtered = q ? FAQ_DATA.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)) : FAQ_DATA;
  renderFAQ(filtered);
}
function renderFAQ(data) {
  const list = document.getElementById('faq-list'); if (!list) return;
  if (!data.length) { list.innerHTML = '<p style="color:var(--muted);font-size:.86rem;padding:12px 0">No questions found.</p>'; return; }
  list.innerHTML = data.map((f, i) => `
    <div class="faq-item" id="faq-${i}">
      <div class="faq-question" onclick="toggleFAQ(${i})">
        <span>${escapeHTML(f.q)}</span>
        <span class="faq-chevron">›</span>
      </div>
      <div class="faq-answer">${escapeHTML(f.a)}</div>
    </div>`).join('');
}
function toggleFAQ(i) {
  const item = document.getElementById('faq-' + i); if (!item) return;
  item.classList.toggle('open');
}

/* ════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS MODAL
════════════════════════════════════════════════════ */
function showKeyboardShortcuts() { document.getElementById('shortcuts-modal').hidden = false; document.body.style.overflow = 'hidden'; }
function closeShortcutsModal() { document.getElementById('shortcuts-modal').hidden = true; document.body.style.overflow = ''; }

/* ════════════════════════════════════════════════════
   ONBOARDING TOUR
════════════════════════════════════════════════════ */
const TOUR_STEPS = [
  { selector: '#hamburger-btn', title: '☰ Main Menu', body: 'Click here to open the full side menu — Settings, Learn, Solutions, Resources, Media, Share, FAQ, Admin Dashboard and more!' },
  { selector: '#posts', title: '📰 Posts Feed', body: 'This is where all blog posts appear. Search, sort by newest/oldest/popular, filter by category or tag.' },
  { selector: '#write', title: '✏️ Write Posts', body: 'Create new posts here. Add a title, category, tags, content and photos. Drafts auto-save every 1.5 seconds!' },
  { selector: '#pricing', title: '💳 Pricing Plans', body: 'Choose Free, Pro or Team. Toggle between monthly and annual billing. Use code KIRENGA30 for 30% off!' },
  { selector: '#collaboration', title: '🤝 Collaborate', body: 'Invite teammates to co-author posts, share media and assign roles. Great for team blogs!' },
  { selector: '#auth-buttons', title: '🔑 Account', body: 'Log in or create a free account to comment, react, bookmark posts and collaborate with others.' },
  { selector: '.chatbot-fab', title: '💬 Isaac Bot', body: 'Click the chat button anytime to ask Isaac Bot about any feature — it knows everything about the blog!' },
];
let tourStep = 0;
function startOnboardingTour() {
  if (localStorage.getItem('tourCompleted') && !confirm('Take the tour again?')) return;
  tourStep = 0;
  document.getElementById('tour-overlay').hidden = false;
  showTourStep();
}
function showTourStep() {
  const step = TOUR_STEPS[tourStep]; if (!step) { completeTour(); return; }
  const target = document.querySelector(step.selector);
  const tooltip = document.getElementById('tour-tooltip');
  const indicator = document.getElementById('tour-step-indicator');
  const title = document.getElementById('tour-title');
  const body = document.getElementById('tour-body');
  const nextBtn = document.getElementById('tour-next-btn');
  if (indicator) indicator.textContent = `Step ${tourStep + 1} of ${TOUR_STEPS.length}`;
  if (title) title.textContent = step.title;
  if (body) body.textContent = step.body;
  if (nextBtn) nextBtn.textContent = tourStep < TOUR_STEPS.length - 1 ? 'Next →' : '🎉 Finish Tour';
  tooltip.hidden = false;
  if (target) {
    const rect = target.getBoundingClientRect();
    const scrollTop = window.scrollY;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      const r = target.getBoundingClientRect();
      let top = r.bottom + window.scrollY + 12;
      let left = Math.max(10, Math.min(r.left, window.innerWidth - 320));
      if (top + 180 > window.scrollY + window.innerHeight) top = r.top + window.scrollY - 190;
      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';
      tooltip.style.position = 'absolute';
    }, 400);
  }
}
function tourNext() { tourStep++; if (tourStep >= TOUR_STEPS.length) completeTour(); else showTourStep(); }
function completeTour() {
  document.getElementById('tour-overlay').hidden = true;
  document.getElementById('tour-tooltip').hidden = true;
  localStorage.setItem('tourCompleted', '1');
  toast('Tour complete! 🎉 Explore at your own pace.', 'success', 'All Done!');
}
function skipTour() {
  document.getElementById('tour-overlay').hidden = true;
  document.getElementById('tour-tooltip').hidden = true;
  toast('Tour skipped. You can restart it from ☰ → Take a Tour.', 'info');
}

/* ════════════════════════════════════════════════════
   PAGINATION / LOAD MORE
════════════════════════════════════════════════════ */
let postsPage = 1;
const POSTS_PER_PAGE = 5;
function renderPostsPaginated() {
  const container = document.getElementById('posts-container'); if (!container) return;
  const list = getSortedFilteredPosts();
  const visible = list.slice(0, postsPage * POSTS_PER_PAGE);
  const hasMore = visible.length < list.length;
  if (!visible.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">${currentFilter ? '🔎' : '📝'}</div><p>${currentFilter ? `No posts match "<strong>${escapeHTML(currentFilter)}</strong>".` : 'No posts yet — write your first one below!'}</p>${currentFilter ? `<button class="btn btn-outline btn-sm" onclick="clearSearch()" style="margin-top:12px">✕ Clear</button>` : ''}</div>`;
    return;
  }
  // Build post HTML (same as renderPosts but limited)
  const views = load('kirengaViews', {});
  container.innerHTML = visible.map((post, i) => {
    const realIdx = posts.indexOf(post);
    const tags = (post.tags || []).map(t => `<span class="post-tag" onclick="filterByTag('${escapeJS(t)}')">#${escapeHTML(t)}</span>`).join('');
    const commentCount = (post.comments || []).length;
    const bookmarked = isBookmarked(post.id);
    const viewCount = views[post.id] || 0;
    const gateHTML = currentUser ? '' : `<div class="post-gate"><p>🔒 <strong>Sign in to read the full post</strong>, comment and react.</p><div class="gate-btns"><button class="btn btn-sm btn-primary" onclick="showAuth('login')">Log in</button><button class="btn btn-sm btn-outline" onclick="showAuth('signup')">Sign up</button></div></div>`;
    const reactBtns = REACTIONS.map(r => { const count = (post.reactions || {})[r.key] || 0; const mine = currentUser && (post.myReactions || {})[currentUser.email] === r.key; return `<button class="reaction-btn${mine ? ' active' : ''}" onclick="reactToPost(${realIdx},'${r.key}')" title="${r.label}">${r.emoji}<span class="reaction-count">${count || ''}</span></button>`; }).join('');
    const pinnedBadge = post.pinned ? '<span class="post-badge-pinned">📌 Pinned</span>' : '';
    const featuredBadge = post.featured ? '<span class="post-badge-featured">⭐ Featured</span>' : '';
    return `<article class="post" style="animation-delay:${i * .05}s">
      ${(pinnedBadge || featuredBadge) ? `<div class="post-badges">${pinnedBadge}${featuredBadge}</div>` : ''}
      <div class="post-header"><h3 class="post-title" onclick="openModal(${realIdx})">${escapeHTML(post.title)}</h3><span class="badge">${escapeHTML(post.category)}</span></div>
      <p class="post-meta">
        <span>📅 ${escapeHTML(post.date)}</span><span class="post-meta-divider">•</span>
        <span>⏱ ${readingTime(post.content)}</span><span class="post-meta-divider">•</span>
        <span>💬 ${commentCount}</span><span class="post-meta-divider">•</span>
        <span class="view-count">👁 ${viewCount}</span>
      </p>
      <p class="post-preview">${escapeHTML(post.content)}</p>
      ${gateHTML}
      ${post.image ? `<img src="${post.image}" alt="Post photo" loading="lazy" onclick="openLightbox('${escapeJS(post.image)}','${escapeJS(post.title)}')" style="cursor:zoom-in">` : ''}
      ${tags ? `<div class="post-tags">${tags}</div>` : ''}
      <div class="post-reactions-row">${reactBtns}</div>
      <div class="post-actions">
        <button class="btn btn-sm btn-outline" onclick="openModal(${realIdx})">📖 Read more</button>
        <button class="btn btn-sm btn-outline" onclick="openModal(${realIdx},true)">💬 Comment</button>
        <button class="bookmark-btn${bookmarked ? ' bookmarked' : ''}" onclick="toggleBookmark(${realIdx})" title="${bookmarked ? 'Remove bookmark' : 'Bookmark'}">🔖</button>
        <button class="btn btn-danger" onclick="deletePost(${realIdx})">🗑</button>
      </div>
    </article>`;
  }).join('');
  if (hasMore) {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.textContent = `📄 Load more posts (${list.length - visible.length} remaining)`;
    loadMoreBtn.onclick = () => { postsPage++; renderPostsPaginated(); };
    container.appendChild(loadMoreBtn);
  }
}

/* ════════════════════════════════════════════════════
   ENHANCED openModal with views, TOC, related, lightbox
════════════════════════════════════════════════════ */
const _origOpenModal = openModal;
window.openModal = function(index, focusComment = false) {
  const post = posts[index]; if (!post) return;
  openModalIndex = index;
  // Increment view count
  incrementViewCount(post.id);
  const tags = (post.tags || []).map(t => `<span class="post-tag" style="cursor:default">#${escapeHTML(t)}</span>`).join('');
  const toc = buildTableOfContents(post.content);
  const related = buildRelatedPosts(post);
  document.getElementById('modal-content').innerHTML = `
    ${post.image ? `<img src="${post.image}" alt="Post photo" class="modal-post-img" onclick="openLightbox('${escapeJS(post.image)}','${escapeJS(post.title)}')" style="cursor:zoom-in">` : ''}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:6px">
      <h2 class="modal-post-title" id="modal-title">${escapeHTML(post.title)}</h2>
      <button onclick="printPost()" class="btn btn-outline btn-sm" title="Print post">🖨️ Print</button>
    </div>
    <div class="modal-post-meta">
      <span>📅 ${escapeHTML(post.date)}</span><span>•</span>
      <span>${escapeHTML(post.category)}</span><span>•</span>
      <span>⏱ ${readingTime(post.content)}</span><span>•</span>
      <span>👁 ${getViewCount(post.id)} views</span>
    </div>
    ${toc}
    <p class="modal-post-body">${escapeHTML(post.content)}</p>
    ${tags ? `<div class="post-tags" style="margin-top:16px">${tags}</div>` : ''}
    ${related}`;
  // Highlight code in modal
  setTimeout(() => highlightCodeBlocks(document.getElementById('modal-content')), 100);
  refreshReactionsBar(index);
  renderComments(index);
  updateCommentUI();
  // Add emoji button to comment area
  const commentActions = document.querySelector('.comment-actions-row');
  if (commentActions && !commentActions.querySelector('.comment-emoji-btn')) {
    const emojiBtn = document.createElement('button');
    emojiBtn.type = 'button';
    emojiBtn.className = 'comment-emoji-btn';
    emojiBtn.title = 'Add emoji';
    emojiBtn.textContent = '😊';
    emojiBtn.onclick = () => toggleEmojiPicker('comment-text');
    commentActions.insertBefore(emojiBtn, commentActions.firstChild);
  }
  const modal = document.getElementById('post-modal'); modal.hidden = false; document.body.style.overflow = 'hidden';
  if (focusComment) setTimeout(() => { if (currentUser) document.getElementById('comment-text')?.focus(); else document.getElementById('comment-login-prompt')?.scrollIntoView({ behavior: 'smooth' }); }, 200);
};

/* ════════════════════════════════════════════════════
   GLOBAL KEYBOARD SHORTCUTS
════════════════════════════════════════════════════ */
let keySequence = '';
let keyTimer = null;
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    // Skip if user is typing in an input/textarea
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveDraft(); }
      if (e.ctrlKey && e.key === 'Enter') { document.getElementById('post-form')?.requestSubmit(); }
      return;
    }
    if (e.key === '?') { showKeyboardShortcuts(); return; }
    if (e.ctrlKey && e.key === '/') { e.preventDefault(); openPanel('search'); return; }
    if (e.ctrlKey && e.key === 'd') { e.preventDefault(); toggleTheme(); return; }
    // G + key sequences
    clearTimeout(keyTimer);
    keySequence += e.key.toUpperCase();
    keyTimer = setTimeout(() => { keySequence = ''; }, 500);
    if (keySequence === 'GH') { document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' }); keySequence = ''; }
    if (keySequence === 'GP') { document.getElementById('posts')?.scrollIntoView({ behavior: 'smooth' }); keySequence = ''; }
    if (keySequence === 'GW') { document.getElementById('write')?.scrollIntoView({ behavior: 'smooth' }); keySequence = ''; }
    if (keySequence === 'GC') { document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); keySequence = ''; }
  });
}

/* ════════════════════════════════════════════════════
   INIT — wire new features
════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Auto-save + word count
  setupAutosave();
  document.getElementById('new-content')?.addEventListener('input', updateWordCount);
  // Emoji picker
  setupEmojiPicker();
  // Keyboard shortcuts
  initKeyboardShortcuts();
  // Lightbox keyboard nav
  document.addEventListener('keydown', e => {
    if (document.getElementById('lightbox').hidden) return;
    if (e.key === 'ArrowLeft') lightboxNav(-1);
    if (e.key === 'ArrowRight') lightboxNav(1);
    if (e.key === 'Escape') closeLightbox();
  });
  // Shortcuts modal backdrop
  document.getElementById('shortcuts-modal')?.addEventListener('click', e => { if (e.target === document.getElementById('shortcuts-modal')) closeShortcutsModal(); });
  // Bookmarks modal backdrop
  document.getElementById('bookmarks-modal')?.addEventListener('click', e => { if (e.target === document.getElementById('bookmarks-modal')) closeBookmarksModal(); });
  // Lightbox backdrop
  document.getElementById('lightbox')?.addEventListener('click', e => { if (e.target === document.getElementById('lightbox')) closeLightbox(); });
  // Onboarding tour — show to first-time visitors after 3s
  if (!localStorage.getItem('tourCompleted') && !localStorage.getItem('tourDismissed')) {
    setTimeout(() => { if (!chatOpen) startOnboardingTour(); }, 3000);
    localStorage.setItem('tourDismissed', '1');
  }
  // Highlight code in learn panel when opened
  document.getElementById('learn-content')?.addEventListener('DOMSubtreeModified', () => {
    highlightCodeBlocks(document.getElementById('learn-content'));
  });
  // Toast: welcome back message
  const sub = load('kirengaSubscription', null);
  if (sub) { setTimeout(() => toast(`Welcome back! You're on the ${sub.plan} plan. 🚀`, 'info', 'Active Plan'), 2000); }
  // Escape key additions
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('shortcuts-modal')?.hidden) closeShortcutsModal();
    if (!document.getElementById('bookmarks-modal')?.hidden) closeBookmarksModal();
    if (!document.getElementById('lightbox')?.hidden) closeLightbox();
  });
});

/* ════════════════════════════════════════════════════
   SIGNUP PLAN SELECTION
════════════════════════════════════════════════════ */
let selectedSignupPlan = 'free';
function selectSignupPlan(card, plan) {
  document.querySelectorAll('.signup-plan').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.sp-select').forEach(b => { b.textContent = b.id === 'sp-' + plan ? '✓ Selected' : b.id.replace('sp-','').charAt(0).toUpperCase() + b.id.replace('sp-','').slice(1); b.classList.toggle('active', b.id === 'sp-' + plan); });
  card.classList.add('selected');
  document.getElementById('sp-' + plan).textContent = '✓ Selected';
  document.getElementById('sp-' + plan).classList.add('active');
  selectedSignupPlan = plan;
  if (plan !== 'free') {
    // Pre-select plan in billing modal when they submit signup
    toast('Great choice! After signing up, you\'ll be taken to checkout for ' + plan.charAt(0).toUpperCase() + plan.slice(1) + '.', 'info', plan.charAt(0).toUpperCase() + plan.slice(1) + ' Plan Selected');
  }
}

/* ════════════════════════════════════════════════════
   LEARN PANEL — switchLearnTabById (for programmatic use)
════════════════════════════════════════════════════ */
function switchLearnTabById(tabId) {
  // First ensure we're on the languages main tab (unless tabId is playground or games)
  if (tabId === 'playground') {
    const btn = document.getElementById('lmt-playground');
    if (btn) switchLearnMainTab('playground', btn);
    return;
  }
  if (tabId === 'games') {
    const btn = document.getElementById('lmt-games');
    if (btn) switchLearnMainTab('games', btn);
    return;
  }
  const languagesBtn = document.getElementById('lmt-languages');
  if (languagesBtn) switchLearnMainTab('languages', languagesBtn);
  const btn = document.getElementById('ltab-' + tabId);
  if (btn) switchLearnTab(tabId, btn);
}

function switchLearnMainTab(tab, btn) {
  // Update main tab buttons
  document.querySelectorAll('.learn-main-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Show/hide tab content
  ['languages', 'playground', 'games'].forEach(t => {
    const el = document.getElementById('learn-tab-' + t);
    if (el) el.hidden = (t !== tab);
  });
  // Init playground when switching to it
  if (tab === 'playground') {
    setTimeout(() => {
      pgPopulateSnippetDropdown();
      pgRenderSnippetGallery();
      pgRunHTML();
      pgSetupEditorKeys();
    }, 100);
  }
  // Init languages default
  if (tab === 'languages') {
    const activeTab = document.querySelector('.learn-tab.active');
    if (!activeTab) initLearnPanel('html');
  }
}

/* ════════════════════════════════════════════════════
   CODE PLAYGROUND
════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════
   CODE PLAYGROUND  — real multi-language execution
   HTML/CSS/JS runs locally in an iframe.
   All other languages execute via Piston API
   (https://emkc.org/api/v2/piston/execute — free, no key)
════════════════════════════════════════════════════ */

/* ── Language config ─────────────────────────────── */
const PG_LANGS = {
  html:       { name:'HTML/CSS/JS', icon:'🌐', piston:null,       ext:'html', mode:'html' },
  javascript: { name:'JavaScript',  icon:'⚡', piston:'javascript',ext:'js',   mode:'single',
    starter: '// JavaScript — runs instantly in your browser\nconst greet = name => `Hello, ${name}!`;\nconsole.log(greet("Kirenga Blog"));\n\nconst nums = [1,2,3,4,5];\nconst sum = nums.reduce((a,b)=>a+b,0);\nconsole.log("Sum:", sum);\nconsole.log("Squares:", nums.map(n=>n*n));' },
  python:     { name:'Python',      icon:'🐍', piston:'python',    ext:'py',  mode:'single',
    starter: '# Python 3\ndef fibonacci(n):\n    a, b = 0, 1\n    for _ in range(n):\n        print(a, end=" ")\n        a, b = b, a + b\n\nprint("Fibonacci sequence:")\nfibonacci(12)\nprint()\n\nfruits = ["apple", "banana", "mango"]\nfor i, f in enumerate(fruits, 1):\n    print(f"{i}. {f.capitalize()}")' },
  java:       { name:'Java',        icon:'☕', piston:'java',      ext:'java',mode:'single',
    starter: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n\n        // Fibonacci\n        int a = 0, b = 1;\n        System.out.print("Fibonacci: ");\n        for (int i = 0; i < 10; i++) {\n            System.out.print(a + " ");\n            int tmp = a + b;\n            a = b; b = tmp;\n        }\n        System.out.println();\n    }\n}' },
  c:          { name:'C',           icon:'⚙️', piston:'c',         ext:'c',   mode:'single',
    starter: '#include <stdio.h>\n#include <math.h>\n\nint isPrime(int n) {\n    if (n < 2) return 0;\n    for (int i = 2; i <= sqrt(n); i++)\n        if (n % i == 0) return 0;\n    return 1;\n}\n\nint main() {\n    printf("Prime numbers up to 50:\\n");\n    for (int i = 2; i <= 50; i++)\n        if (isPrime(i)) printf("%d ", i);\n    printf("\\n");\n    return 0;\n}' },
  cpp:        { name:'C++',         icon:'➕', piston:'cpp',       ext:'cpp', mode:'single',
    starter: '#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    vector<int> nums = {5,3,8,1,9,2,7,4,6};\n    cout << "Before: ";\n    for (int n : nums) cout << n << " ";\n    cout << endl;\n\n    sort(nums.begin(), nums.end());\n    cout << "Sorted: ";\n    for (int n : nums) cout << n << " ";\n    cout << endl;\n    return 0;\n}' },
  go:         { name:'Go',          icon:'🐹', piston:'go',        ext:'go',  mode:'single',
    starter: 'package main\nimport (\n    "fmt"\n    "strings"\n)\n\nfunc reverseString(s string) string {\n    runes := []rune(s)\n    for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {\n        runes[i], runes[j] = runes[j], runes[i]\n    }\n    return string(runes)\n}\n\nfunc main() {\n    fmt.Println("Hello from Go!")\n    words := []string{"Kirenga", "Blog", "Golang"}\n    fmt.Println(strings.Join(words, " "))\n    fmt.Println(reverseString("Hello World"))\n}' },
  rust:       { name:'Rust',        icon:'🦀', piston:'rust',      ext:'rs',  mode:'single',
    starter: 'fn is_palindrome(s: &str) -> bool {\n    let cleaned: String = s.chars()\n        .filter(|c| c.is_alphanumeric())\n        .map(|c| c.to_lowercase().next().unwrap())\n        .collect();\n    cleaned == cleaned.chars().rev().collect::<String>()\n}\n\nfn main() {\n    println!("Hello from Rust!");\n    let words = vec!["racecar", "hello", "level", "world"];\n    for w in &words {\n        println!("{}: palindrome = {}", w, is_palindrome(w));\n    }\n}' },
  php:        { name:'PHP',         icon:'🐘', piston:'php',       ext:'php', mode:'single',
    starter: '<?php\n// PHP string & array operations\n$name = "Kirenga Blog";\necho "Hello from " . $name . "!\\n";\n\n$fruits = ["Mango", "Banana", "Orange", "Apple"];\nsort($fruits);\nforeach ($fruits as $i => $fruit) {\n    echo ($i + 1) . ". " . $fruit . "\\n";\n}\n\n// FizzBuzz\necho "\\nFizzBuzz (1-20):\\n";\nfor ($i = 1; $i <= 20; $i++) {\n    if ($i % 15 == 0) echo "FizzBuzz ";\n    elseif ($i % 3 == 0) echo "Fizz ";\n    elseif ($i % 5 == 0) echo "Buzz ";\n    else echo $i . " ";\n}\n?>' },
  ruby:       { name:'Ruby',        icon:'💎', piston:'ruby',      ext:'rb',  mode:'single',
    starter: '# Ruby\nputs "Hello from Ruby!"\n\n# Blocks and iterators\n[1,2,3,4,5].each { |n| puts "#{n} squared = #{n**2}" }\n\n# Hash\nperson = { name: "Isaac", role: "Developer", lang: "Ruby" }\nperson.each { |k,v| puts "#{k}: #{v}" }\n\n# String methods\nwords = "kirenga blog is awesome"\nputs words.split.map(&:capitalize).join(" ")' },
  typescript: { name:'TypeScript',  icon:'🔷', piston:'typescript',ext:'ts',  mode:'single',
    starter: '// TypeScript\ninterface User {\n  name: string;\n  role: "admin" | "editor" | "viewer";\n  joined: Date;\n}\n\nfunction greetUser(user: User): string {\n  return `Welcome, ${user.name}! Role: ${user.role}`;\n}\n\nconst user: User = {\n  name: "Isaac",\n  role: "admin",\n  joined: new Date()\n};\n\nconsole.log(greetUser(user));\nconsole.log("TypeScript runs with full type safety!");\n\nconst nums: number[] = [1,2,3,4,5];\nconst doubled = nums.map((n): number => n * 2);\nconsole.log("Doubled:", doubled);' },
  kotlin:     { name:'Kotlin',      icon:'🤖', piston:'kotlin',    ext:'kt',  mode:'single',
    starter: 'fun main() {\n    println("Hello from Kotlin!")\n\n    // Data classes\n    data class Post(val title: String, val views: Int)\n\n    val posts = listOf(\n        Post("Hello World", 120),\n        Post("Kotlin Basics", 340),\n        Post("Android Dev", 89)\n    )\n\n    posts.sortedByDescending { it.views }\n         .forEach { println("${it.title}: ${it.views} views") }\n\n    // Lambda\n    val doubled = (1..5).map { it * 2 }\n    println("Doubled: $doubled")\n}' },
  swift:      { name:'Swift',       icon:'🍎', piston:'swift',     ext:'swift',mode:'single',
    starter: '// Swift\nprint("Hello from Swift!")\n\n// Structs\nstruct Post {\n    let title: String\n    var likes: Int\n    \n    func describe() -> String {\n        return "\\(title) — \\(likes) likes"\n    }\n}\n\nvar posts = [\n    Post(title: "Hello World", likes: 42),\n    Post(title: "Swift Basics", likes: 128),\n    Post(title: "iOS Tips", likes: 77)\n]\n\nlet sorted = posts.sorted { $0.likes > $1.likes }\nfor p in sorted { print(p.describe()) }\n\n// Closures\nlet squared = (1...5).map { $0 * $0 }\nprint("Squared:", squared)' },
  bash:       { name:'Bash',        icon:'🖥️', piston:'bash',      ext:'sh',  mode:'single',
    starter: '#!/bin/bash\n# Bash scripting basics\necho "Hello from Bash!"\necho "Today is: $(date +%Y-%m-%d)"\n\n# Array\nlangs=(Python JavaScript Rust Go Ruby)\necho "\\nLanguages in this playground:"\nfor lang in "${langs[@]}"; do\n    echo "  - $lang"\ndone\n\n# Arithmetic\necho "\\nNumbers 1-10 and their squares:"\nfor i in {1..10}; do\n    echo "  $i^2 = $((i*i))"\ndone\n\n# String operations\nname="Kirenga Blog"\necho "\\nUppercase: ${name^^}"\necho "Length: ${#name} chars"' },
  r:          { name:'R',           icon:'📊', piston:'r',         ext:'r',   mode:'single',
    starter: '# R — statistical computing\ncat("Hello from R!\\n")\n\n# Vector operations\nnums <- c(23, 45, 12, 67, 34, 89, 56, 11)\ncat("Mean:", mean(nums), "\\n")\ncat("Median:", median(nums), "\\n")\ncat("SD:", round(sd(nums), 2), "\\n")\ncat("Max:", max(nums), "Min:", min(nums), "\\n")\n\n# Sorted\ncat("Sorted:", sort(nums), "\\n")\n\n# Fibonacci\nfib <- function(n) {\n  a <- 0; b <- 1\n  for (i in seq_len(n)) {\n    cat(a, "")\n    temp <- a + b; a <- b; b <- temp\n  }\n  cat("\\n")\n}\ncat("Fibonacci (12):\\n")\nfib(12)' },
  lua:        { name:'Lua',         icon:'🌙', piston:'lua',       ext:'lua', mode:'single',
    starter: '-- Lua scripting\nprint("Hello from Lua!")\n\n-- Tables (arrays/maps)\nlocal fruits = {"Mango","Banana","Orange","Apple"}\nfor i, f in ipairs(fruits) do\n    print(i .. ". " .. f)\nend\n\n-- Function\nlocal function factorial(n)\n    if n <= 1 then return 1 end\n    return n * factorial(n - 1)\nend\n\nfor i = 1, 10 do\n    print(string.format("%d! = %d", i, factorial(i)))\nend\n\n-- String\nlocal s = "kirenga blog"\nprint(s:upper())\nprint(#s .. " characters")' },
  perl:       { name:'Perl',        icon:'🐪', piston:'perl',      ext:'pl',  mode:'single',
    starter: '#!/usr/bin/perl\nuse strict;\nuse warnings;\n\nprint "Hello from Perl!\\n";\n\n# Arrays\nmy @langs = ("Python","JavaScript","Rust","Go","Ruby");\nforeach my $lang (@langs) {\n    printf "  - %s\\n", $lang;\n}\n\n# Hash\nmy %scores = (Alice => 95, Bob => 87, Carol => 92);\nforeach my $name (sort keys %scores) {\n    printf "%s: %d\\n", $name, $scores{$name};\n}\n\n# Regex\nmy $text = "The quick brown fox jumps over the lazy dog";\nmy @words = ($text =~ /\\b\\w{4}\\b/g);\nprint "4-letter words: @words\\n";' },
};

/* ── Snippets per language ───────────────────────── */
const PG_SNIPPETS = {
  html: [
    { label:'👋 Hello World',  html:'<h1 style="color:#1a73e8;font-family:sans-serif">Hello, World!</h1>\n<p>Edit me above!</p>',css:'body{padding:20px;background:#f4f6fb;font-family:sans-serif;}',js:'console.log("Hello from JS!");' },
    { label:'🎨 CSS Animation',html:'<div class="box">Hover me!</div>',css:'.box{width:100px;height:100px;background:linear-gradient(135deg,#1a73e8,#34a853);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;cursor:pointer;transition:transform .3s,box-shadow .3s;margin:40px auto;font-family:sans-serif}.box:hover{transform:scale(1.2) rotate(8deg);box-shadow:0 16px 40px rgba(26,115,232,.5)}',js:'' },
    { label:'🖩 Calculator',   html:'<div class="calc"><div id="disp" class="disp">0</div><div class="btns"><button onclick="c()">C</button><button onclick="o(\'+\')">+</button><button onclick="o(\'-\')">-</button><button onclick="o(\'*\')">×</button><button onclick="n(7)">7</button><button onclick="n(8)">8</button><button onclick="n(9)">9</button><button onclick="o(\'/\')">÷</button><button onclick="n(4)">4</button><button onclick="n(5)">5</button><button onclick="n(6)">6</button><button onclick="n(0)">0</button><button onclick="n(1)">1</button><button onclick="n(2)">2</button><button onclick="n(3)">3</button><button class="eq" onclick="eq()">=</button></div></div>',css:'.calc{max-width:220px;margin:20px auto;font-family:sans-serif}.disp{background:#1c1c2e;color:white;padding:14px;font-size:1.4rem;border-radius:8px 8px 0 0;text-align:right}.btns{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;background:#f4f6fb;padding:6px;border-radius:0 0 8px 8px}button{padding:12px;border:none;border-radius:5px;font-size:.95rem;background:white;cursor:pointer}.eq{background:#1a73e8;color:white}',js:'let cu="0",op="",pr="";const up=()=>document.getElementById("disp").textContent=cu;function n(d){cu=cu==="0"?String(d):cu+d;up()}function o(x){pr=cu;cu="0";op=x}function c(){cu="0";op="";pr="";up()}function eq(){if(!op)return;cu=String(Math.round(eval(pr+op+cu)*1e8)/1e8);op="";up()}' },
    { label:'📝 To-Do App',    html:'<div class="todo"><h2>My Tasks</h2><div class="row"><input id="inp" placeholder="New task…" onkeypress="if(event.key===\'Enter\')add()"><button onclick="add()">Add</button></div><ul id="list"></ul></div>',css:'.todo{max-width:360px;margin:20px auto;font-family:sans-serif}h2{color:#1a73e8}.row{display:flex;gap:8px;margin-bottom:12px}input{flex:1;padding:9px;border:2px solid #ddd;border-radius:8px;font-size:.95rem}button{padding:9px 16px;background:#1a73e8;color:white;border:none;border-radius:8px;cursor:pointer}ul{list-style:none}li{display:flex;align-items:center;gap:8px;padding:9px 10px;background:#f4f6fb;border-radius:7px;margin-bottom:5px}li.done span{text-decoration:line-through;opacity:.45}li span{flex:1}.del{background:none;border:none;color:#e53935;cursor:pointer;font-size:.95rem}',js:'function add(){const i=document.getElementById("inp"),t=i.value.trim();if(!t)return;const li=document.createElement("li");li.innerHTML=`<input type="checkbox" onchange="this.parentNode.classList.toggle(\'done\',this.checked)"><span>${t}</span><button class="del" onclick="this.parentNode.remove()">✕</button>`;document.getElementById("list").appendChild(li);i.value=""}' },
    { label:'⏱ Stopwatch',    html:'<div class="sw"><div id="d" class="disp">00:00.00</div><div class="btns"><button onclick="ss()" id="sb">▶ Start</button><button onclick="rs()">↺ Reset</button></div></div>',css:'.sw{text-align:center;font-family:monospace;padding:30px}.disp{font-size:3rem;font-weight:700;color:#1a73e8;margin-bottom:16px}.btns{display:flex;gap:12px;justify-content:center}button{padding:12px 28px;border:none;border-radius:50px;font-size:1rem;font-family:sans-serif;cursor:pointer;background:#1a73e8;color:white}button:last-child{background:#e53935}',js:'let run=false,st=0,el=0,raf;const pad=n=>String(Math.floor(n)).padStart(2,"0");const fmt=ms=>{const s=ms/1000;return pad(s/60%60)+":"+pad(s%60)+"."+pad(ms%1000/10)};function ss(){run=!run;document.getElementById("sb").textContent=run?"⏸ Pause":"▶ Resume";if(run){st=performance.now()-el;tick()}else cancelAnimationFrame(raf)}function tick(){el=performance.now()-st;document.getElementById("d").textContent=fmt(el);raf=requestAnimationFrame(tick)}function rs(){run=false;el=0;cancelAnimationFrame(raf);document.getElementById("d").textContent="00:00.00";document.getElementById("sb").textContent="▶ Start"}' },
    { label:'🌈 Gradient Gen', html:'<div class="wrap"><label>Colour 1: <input type="color" id="c1" value="#1a73e8" oninput="upd()"></label><label>Colour 2: <input type="color" id="c2" value="#34a853" oninput="upd()"></label><select id="dir" onchange="upd()"><option>to right</option><option>to bottom</option><option>to bottom right</option><option>135deg</option></select><div id="box" class="box"></div><div id="code" class="code"></div></div>',css:'.wrap{font-family:sans-serif;padding:20px;display:flex;flex-direction:column;gap:10px}.box{height:100px;border-radius:12px;transition:background .3s}.code{background:#1c1c2e;color:#cdd6f4;padding:10px;border-radius:8px;font-family:monospace;font-size:.82rem;word-break:break-all}label{display:flex;align-items:center;gap:8px}select{padding:6px;border-radius:6px;border:1.5px solid #ddd}',js:'function upd(){const c1=document.getElementById("c1").value,c2=document.getElementById("c2").value,dir=document.getElementById("dir").value;const g=`linear-gradient(${dir},${c1},${c2})`;document.getElementById("box").style.background=g;document.getElementById("code").textContent=`background: ${g};`}upd()' },
  ],
  python: [
    { label:'🔢 Fibonacci',   code:'def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        print(a, end=" ")\n        a, b = b, a + b\n\nprint("Fibonacci (15):")\nfib(15)' },
    { label:'📊 Statistics',  code:'import statistics\nnums = [4,7,2,9,1,6,3,8,5,10,7,4,6]\nprint("Data:", nums)\nprint("Mean:", round(statistics.mean(nums),2))\nprint("Median:", statistics.median(nums))\nprint("Mode:", statistics.mode(nums))\nprint("StdDev:", round(statistics.stdev(nums),2))\nprint("Max:", max(nums), "  Min:", min(nums))' },
    { label:'🔐 Hash Demo',   code:'import hashlib\nmessages = ["hello","password","Isaac","KirengaBlog"]\nfor m in messages:\n    h = hashlib.sha256(m.encode()).hexdigest()\n    print(f"SHA-256({m!r}):\\n  {h[:32]}...")' },
    { label:'🎲 Guessing Game',code:'import random\nsecret = random.randint(1,100)\nprint(f"I picked a number 1-100. Can you guess it?")\nprint(f"(Answer: {secret}) — In a real app, remove this!")\nfor attempt in range(1,6):\n    # Demo: simulate guesses\n    guess = random.randint(1,100)\n    print(f"Attempt {attempt}: Guess = {guess}", end=" ")\n    if guess < secret: print("→ Too low")\n    elif guess > secret: print("→ Too high")\n    else: print("→ Correct! 🎉"); break' },
  ],
  javascript: [
    { label:'🔢 Primes',    code:'function sieve(n){\n  const a=Array(n+1).fill(true);\n  a[0]=a[1]=false;\n  for(let i=2;i*i<=n;i++) if(a[i]) for(let j=i*i;j<=n;j+=i) a[j]=false;\n  return a.map((v,i)=>v?i:-1).filter(n=>n>-1);\n}\nconsole.log("Primes up to 100:");\nconsole.log(sieve(100).join(", "));' },
    { label:'🗂 JSON',     code:'const posts=[\n  {id:1,title:"Hello World",views:120,tags:["blog","intro"]},\n  {id:2,title:"JS Tips",views:340,tags:["javascript","tips"]},\n  {id:3,title:"CSS Tricks",views:85,tags:["css"]}\n];\nconst top=posts.sort((a,b)=>b.views-a.views);\nconsole.log("Posts by views:");\ntop.forEach(p=>console.log(` ${p.title}: ${p.views} views`));\nconsole.log("\\nJSON:", JSON.stringify(posts[0],null,2));' },
    { label:'🔐 Encode',   code:'// Base64 encode/decode\nconst text="Hello, Kirenga Blog!";\nconst encoded=btoa(text);\nconst decoded=atob(encoded);\nconsole.log("Original:", text);\nconsole.log("Base64:  ", encoded);\nconsole.log("Decoded: ", decoded);\n// URL encode\nconst url="https://kiregablog.netlify.app/post?title=Hello World&cat=Coding";\nconsole.log("\\nURL encoded:", encodeURIComponent(url));' },
  ],
  c: [
    { label:'📊 Sorting',   code:'#include <stdio.h>\nvoid bubbleSort(int arr[], int n){\n  for(int i=0;i<n-1;i++)\n    for(int j=0;j<n-i-1;j++)\n      if(arr[j]>arr[j+1]){int t=arr[j];arr[j]=arr[j+1];arr[j+1]=t;}\n}\nint main(){\n  int a[]={64,34,25,12,22,11,90};\n  int n=sizeof(a)/sizeof(a[0]);\n  printf("Before: ");\n  for(int i=0;i<n;i++) printf("%d ",a[i]);\n  bubbleSort(a,n);\n  printf("\\nSorted: ");\n  for(int i=0;i<n;i++) printf("%d ",a[i]);\n  printf("\\n");\n  return 0;\n}' },
  ],
  rust: [
    { label:'🎯 Ownership',  code:'fn largest(nums: &[i32]) -> i32 {\n    let mut max = nums[0];\n    for &n in nums { if n > max { max = n; } }\n    max\n}\nfn main() {\n    let nums = vec![34,50,25,100,65,72,88];\n    println!("Largest: {}", largest(&nums));\n\n    // String ownership\n    let s1 = String::from("hello");\n    let s2 = &s1;  // borrow\n    println!("{} {}!", s2, "world");\n    println!("s1 still valid: {}", s1);\n}' },
  ],
};

/* ── State ───────────────────────────────────────── */
let pgCurrentLang = 'html';

/* ── Core functions ──────────────────────────────── */
function pgSelectLang(btn) {
  document.querySelectorAll('.pg-lang-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  pgCurrentLang = btn.dataset.lang;
  const cfg = PG_LANGS[pgCurrentLang];
  if (!cfg) return;

  // Update label
  const label = document.getElementById('pg-lang-label');
  if (label) label.textContent = cfg.icon + ' ' + cfg.name;

  // Show/hide panels
  const htmlEditors = document.getElementById('pg-html-editors');
  const singleEditor = document.getElementById('pg-single-editor');
  const stdinWrap = document.getElementById('pg-stdin-wrap');
  const iframe = document.getElementById('pg-iframe');
  const output = document.getElementById('pg-output');
  const singleLabel = document.getElementById('pg-single-label');

  if (cfg.mode === 'html') {
    if (htmlEditors) htmlEditors.hidden = false;
    if (singleEditor) singleEditor.hidden = true;
    if (stdinWrap) stdinWrap.hidden = true;
    if (iframe) iframe.hidden = false;
    if (output) output.hidden = true;
    pgRunHTML();
  } else {
    if (htmlEditors) htmlEditors.hidden = true;
    if (singleEditor) singleEditor.hidden = false;
    if (stdinWrap) stdinWrap.hidden = false;
    if (iframe) iframe.hidden = true;
    if (output) { output.hidden = false; output.textContent = ''; }
    if (singleLabel) singleLabel.textContent = cfg.icon + ' ' + cfg.name;
    // Load starter code if editor is empty
    const codeEl = document.getElementById('pg-code');
    if (codeEl && (!codeEl.value || codeEl.dataset.lastLang !== pgCurrentLang)) {
      codeEl.value = cfg.starter || '';
      codeEl.dataset.lastLang = pgCurrentLang;
    }
  }

  // Update run info
  const runInfo = document.getElementById('pg-run-info');
  if (runInfo) {
    if (cfg.mode === 'html') runInfo.textContent = '⚡ Live preview — updates as you type';
    else runInfo.textContent = `🚀 Runs via Piston engine (server-side ${cfg.name})`;
  }

  // Load snippets for this language
  pgPopulateSnippetDropdown();
  pgRenderSnippetGallery();
}

function pgRunHTML() {
  const html  = document.getElementById('pg-html')?.value || '';
  const css   = document.getElementById('pg-css')?.value  || '';
  const js    = document.getElementById('pg-js')?.value   || '';
  const frame = document.getElementById('pg-iframe');
  if (!frame) return;
  frame.srcdoc = `<!DOCTYPE html><html><head><style>${css}</style></head><body>${html}<script>${js}<\/script></body></html>`;
}

async function pgRun() {
  const cfg = PG_LANGS[pgCurrentLang];
  if (!cfg) return;

  if (cfg.mode === 'html') { pgRunHTML(); return; }

  const code  = document.getElementById('pg-code')?.value.trim() || '';
  const stdin = document.getElementById('pg-stdin')?.value || '';
  if (!code) { pgShowOutput('⚠️ Please write some code first.', 'error'); return; }

  const btn = document.getElementById('pg-run-btn');
  if (btn) { btn.textContent = '⏳ Running…'; btn.disabled = true; }

  const output = document.getElementById('pg-output');
  if (output) { output.hidden = false; output.className = 'pg-output pg-output--running'; output.textContent = '⏳ Executing…'; }

  try {
    // Special case: JavaScript can run locally without network
    if (pgCurrentLang === 'javascript') {
      const result = pgRunJSLocally(code);
      pgShowOutput(result, 'success');
    } else {
      const res = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: cfg.piston,
          version: '*',
          files: [{ name: 'main.' + cfg.ext, content: code }],
          stdin: stdin,
          run_timeout: 5000,
          compile_timeout: 10000,
        }),
      });
      if (!res.ok) throw new Error('API error: ' + res.status);
      const data = await res.json();
      const stdout = data.run?.stdout || '';
      const stderr = data.run?.stderr || '';
      const compile_err = data.compile?.stderr || '';
      if (compile_err) pgShowOutput('🔴 Compile Error:\n' + compile_err, 'error');
      else if (stderr)  pgShowOutput((stdout ? '📤 Output:\n' + stdout + '\n\n' : '') + '⚠️ Stderr:\n' + stderr, 'warning');
      else if (stdout)  pgShowOutput('✅ Output:\n\n' + stdout, 'success');
      else              pgShowOutput('✅ Ran successfully (no output)', 'success');
    }
  } catch (err) {
    if (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed')) {
      pgShowOutput('⚠️ Could not reach the execution server.\n\nThis usually means:\n• No internet connection\n• The Piston API is temporarily down\n\nThe Piston API is free: emkc.org/api/v2/piston\nTry again in a moment.', 'error');
    } else {
      pgShowOutput('❌ Error: ' + err.message, 'error');
    }
  } finally {
    if (btn) { btn.textContent = '▶ Run Code'; btn.disabled = false; }
  }
}

/* Run JS locally (no network needed) */
function pgRunJSLocally(code) {
  const logs = [];
  const sandbox = {
    console: {
      log:   (...a) => logs.push(a.map(pgStringify).join(' ')),
      error: (...a) => logs.push('❌ ' + a.map(pgStringify).join(' ')),
      warn:  (...a) => logs.push('⚠️ ' + a.map(pgStringify).join(' ')),
      info:  (...a) => logs.push('ℹ️ ' + a.map(pgStringify).join(' ')),
      table: (...a) => logs.push('[table] ' + pgStringify(a[0])),
    },
    Math, JSON, Date, Array, Object, String, Number, parseInt, parseFloat, isNaN, isFinite,
    setTimeout: () => {}, setInterval: () => {}, clearTimeout: () => {}, clearInterval: () => {},
    btoa, atob, encodeURIComponent, decodeURIComponent,
  };
  try {
    const fn = new Function(...Object.keys(sandbox), code);
    fn(...Object.values(sandbox));
    return logs.length ? logs.join('\n') : '✅ Ran successfully (no output)';
  } catch (e) {
    return '❌ ' + e.name + ': ' + e.message;
  }
}
function pgStringify(v) {
  if (typeof v === 'object' && v !== null) {
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }
  return String(v);
}

function pgShowOutput(text, type = 'success') {
  const output = document.getElementById('pg-output');
  if (!output) return;
  output.hidden = false;
  output.className = 'pg-output pg-output--' + type;
  output.textContent = text;
}

function pgClearEditor() {
  if (pgCurrentLang === 'html') {
    ['pg-html','pg-css','pg-js'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    pgRunHTML();
  } else {
    const el = document.getElementById('pg-code'); if (el) el.value = '';
    pgShowOutput('', 'success');
  }
}

function pgClearOutput() {
  const output = document.getElementById('pg-output'); if (output) output.textContent = '';
  const frame = document.getElementById('pg-iframe'); if (frame && pgCurrentLang === 'html') pgRunHTML();
}

function pgCopyCode() {
  let code = '';
  if (pgCurrentLang === 'html') {
    code = [document.getElementById('pg-html')?.value, document.getElementById('pg-css')?.value, document.getElementById('pg-js')?.value].filter(Boolean).join('\n\n');
  } else {
    code = document.getElementById('pg-code')?.value || '';
  }
  navigator.clipboard.writeText(code).then(() => toast('Code copied to clipboard!', 'success')).catch(() => {});
}

/* ── Snippets ────────────────────────────────────── */
function pgPopulateSnippetDropdown() {
  const sel = document.getElementById('pg-snippet-select'); if (!sel) return;
  const snippets = PG_SNIPPETS[pgCurrentLang] || [];
  sel.innerHTML = '<option value="">📂 Starter snippets…</option>' +
    snippets.map((s,i) => `<option value="${i}">${s.label}</option>`).join('');
}

function pgLoadSnippet(idxStr) {
  const idx = parseInt(idxStr); if (isNaN(idx) || idx < 0) return;
  const snippets = PG_SNIPPETS[pgCurrentLang] || []; const s = snippets[idx]; if (!s) return;
  if (pgCurrentLang === 'html') {
    const h = document.getElementById('pg-html'); const c = document.getElementById('pg-css'); const j = document.getElementById('pg-js');
    if (h) h.value = s.html || ''; if (c) c.value = s.css || ''; if (j) j.value = s.js || '';
    pgRunHTML();
  } else {
    const el = document.getElementById('pg-code'); if (el) { el.value = s.code || ''; el.dataset.lastLang = pgCurrentLang; }
    pgShowOutput('', 'success');
  }
  toast(`"${s.label}" loaded!`, 'success');
  document.getElementById('pg-snippet-select').value = '';
}

function pgRenderSnippetGallery() {
  const grid = document.getElementById('pg-snippets-grid'); if (!grid) return;
  const snippets = PG_SNIPPETS[pgCurrentLang] || [];
  const all = Object.entries(PG_SNIPPETS).flatMap(([lang, snips]) =>
    snips.map((s, i) => ({ lang, idx: i, label: s.label }))
  );
  if (!all.length) { grid.innerHTML = ''; return; }
  // Show current language first, then others
  const current = snippets.map((s,i) => ({ lang: pgCurrentLang, idx: i, label: s.label }));
  const others = Object.entries(PG_SNIPPETS)
    .filter(([l]) => l !== pgCurrentLang)
    .flatMap(([l, snips]) => snips.map((s,i) => ({ lang: l, idx: i, label: s.label, icon: PG_LANGS[l]?.icon || '' })));
  const combined = [...current, ...others].slice(0, 20);
  grid.innerHTML = combined.map(s =>
    `<button class="snippet-btn ${s.lang !== pgCurrentLang ? 'snippet-btn--other' : ''}" onclick="pgLoadSnippetByLang('${s.lang}',${s.idx})" title="${PG_LANGS[s.lang]?.name || s.lang}">${s.lang !== pgCurrentLang ? (PG_LANGS[s.lang]?.icon || '') + ' ' : ''}${s.label}</button>`
  ).join('');
}

function pgLoadSnippetByLang(lang, idx) {
  // If different language, switch first
  if (lang !== pgCurrentLang) {
    const btn = document.querySelector(`.pg-lang-btn[data-lang="${lang}"]`);
    if (btn) pgSelectLang(btn);
  }
  pgLoadSnippet(idx);
}

/* ── Tab key indentation in editors ─────────────── */
function pgSetupEditorKeys() {
  document.querySelectorAll('.pg-editor').forEach(ta => {
    ta.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = s + 2;
        if (pgCurrentLang === 'html') pgRunHTML();
      }
    });
  });
}

/* ── Init ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Load default HTML snippet
  const def = PG_SNIPPETS.html?.[0];
  if (def) {
    const h = document.getElementById('pg-html'); const c = document.getElementById('pg-css'); const j = document.getElementById('pg-js');
    if (h) h.value = def.html || ''; if (c) c.value = def.css || ''; if (j) j.value = def.js || '';
  }
  setTimeout(pgRunHTML, 300);
  pgPopulateSnippetDropdown();
  pgRenderSnippetGallery();
  pgSetupEditorKeys();
  // Update run info default
  const runInfo = document.getElementById('pg-run-info');
  if (runInfo) runInfo.textContent = '⚡ Live preview — updates as you type';
  // iframe live update
  ['pg-html','pg-css','pg-js'].forEach(id => document.getElementById(id)?.addEventListener('input', pgRunHTML));
});

/* ════════════════════════════════════════════════════
   SETTINGS — EXTENDED FUNCTIONS
════════════════════════════════════════════════════ */

/* Font size */
function setFontSize(size) {
  const map = { small: '14px', normal: '16px', large: '18px', xlarge: '20px' };
  document.documentElement.style.setProperty('--content-font-size', map[size] || '16px');
  document.querySelectorAll('.font-size-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('fs-' + size)?.classList.add('active');
  save('kirengaFontSize', size);
}

/* Font family */
function setFontFamily(family) {
  const map = {
    'dm-sans': "'DM Sans', sans-serif",
    'inter': "'Inter', sans-serif",
    'georgia': "Georgia, 'Times New Roman', serif",
    'mono': "'Courier New', Consolas, monospace",
    'system': "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };
  document.documentElement.style.setProperty('--body-font', map[family] || map['dm-sans']);
  document.body.style.fontFamily = map[family] || map['dm-sans'];
  save('kirengaFontFamily', family);
}

/* Accent colour */
function setAccentColor(btn, color) {
  document.querySelectorAll('.accent-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.documentElement.style.setProperty('--blue', color);
  // Derive dark variant (darken ~15%)
  const darken = (hex, amt) => {
    const r = Math.max(0, parseInt(hex.slice(1,3),16)-amt);
    const g = Math.max(0, parseInt(hex.slice(3,5),16)-amt);
    const b = Math.max(0, parseInt(hex.slice(5,7),16)-amt);
    return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  };
  document.documentElement.style.setProperty('--blue-dark', darken(color, 30));
  document.documentElement.style.setProperty('--blue-light', color + '22');
  save('kirengaAccentColor', color);
  toast('Accent colour updated!', 'success');
}

/* Reading mode — wider content, larger line height */
function toggleReadingMode() {
  const body = document.body;
  body.classList.toggle('reading-mode');
  const sw = document.getElementById('reading-mode-toggle');
  if (sw) sw.classList.toggle('active', body.classList.contains('reading-mode'));
  save('kirengaReadingMode', body.classList.contains('reading-mode'));
  toast(body.classList.contains('reading-mode') ? 'Reading mode on' : 'Reading mode off', 'info');
}

/* Reduce motion */
function toggleReduceMotion() {
  const body = document.body;
  body.classList.toggle('reduce-motion');
  const sw = document.getElementById('reduce-motion-toggle');
  if (sw) sw.classList.toggle('active', body.classList.contains('reduce-motion'));
  save('kirengaReduceMotion', body.classList.contains('reduce-motion'));
}

/* Spellcheck toggle in editors */
function toggleSpellcheck() {
  const enabled = document.getElementById('spellcheck-toggle')?.classList.contains('active');
  document.querySelectorAll('.pg-editor, textarea').forEach(el => { el.spellcheck = !enabled; });
  document.getElementById('spellcheck-toggle')?.classList.toggle('active');
}

/* Posts per page */
function setPostsPerPage(n) {
  window.POSTS_PER_PAGE_SETTING = parseInt(n) || 10;
  save('kirengaPostsPerPage', n);
  renderPosts();
}

/* Default category */
function setDefaultCategory(cat) {
  save('kirengaDefaultCategory', cat);
  const el = document.getElementById('new-category');
  if (el) el.value = cat;
}

/* Date format */
function setDateFormat(fmt) {
  save('kirengaDateFormat', fmt);
  toast('Date format updated — will apply to new posts.', 'info');
}

/* Timezone */
function setTimezone(tz) {
  save('kirengaTimezone', tz);
  toast('Timezone set to ' + tz, 'info');
}

/* Extended initSettingsPanel — load all saved settings */
const _origInitSettings = initSettingsPanel;
function initSettingsPanel() {
  _origInitSettings();
  // Social links
  const t = document.getElementById('settings-twitter'); if (t) t.value = load('kirengaTwitter','isaacranty');
  const g = document.getElementById('settings-github'); if (g) g.value = load('kirengaGithub','isaacranty');
  const e1 = document.getElementById('settings-email1'); if (e1) e1.value = load('kirengaEmail1','Kirengaisaac@gmail.com');
  const e2 = document.getElementById('settings-email2'); if (e2) e2.value = load('kirengaEmail2','isaackirenga01@gmail.com');
  const p1 = document.getElementById('settings-phone1'); if (p1) p1.value = load('kirengaPhone1','+256 743 836 859');
  const p2 = document.getElementById('settings-phone2'); if (p2) p2.value = load('kirengaPhone2','');
  const loc = document.getElementById('settings-location'); if (loc) loc.value = load('kirengaLocation','Kampala, Uganda');
  // Font
  const fs = load('kirengaFontSize','normal');
  document.querySelectorAll('.font-size-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('fs-'+fs)?.classList.add('active');
  const ff = load('kirengaFontFamily','dm-sans');
  const ffEl = document.getElementById('settings-font'); if (ffEl) ffEl.value = ff;
  // Accent colour
  const ac = load('kirengaAccentColor','#1a73e8');
  document.querySelectorAll('.accent-btn').forEach(b => b.classList.toggle('active', b.dataset.color === ac));
  // Reading mode
  const rm = load('kirengaReadingMode',false);
  document.getElementById('reading-mode-toggle')?.classList.toggle('active', rm);
  // Posts per page
  const pp = document.getElementById('posts-per-page'); if (pp) pp.value = load('kirengaPostsPerPage','10');
  // Default category
  const dc = document.getElementById('default-category'); if (dc) dc.value = load('kirengaDefaultCategory','General');
  // Date format
  const df = document.getElementById('date-format'); if (df) df.value = load('kirengaDateFormat','long');
  // Timezone
  const tz = document.getElementById('timezone-select'); if (tz) tz.value = load('kirengaTimezone','Africa/Kampala');
}

/* Extended saveSettings — save all fields */
const _origSaveSettings = saveSettings;
function saveSettings() {
  _origSaveSettings();
  // Save social links
  save('kirengaTwitter', document.getElementById('settings-twitter')?.value.trim() || '');
  save('kirengaGithub', document.getElementById('settings-github')?.value.trim() || '');
  save('kirengaEmail1', document.getElementById('settings-email1')?.value.trim() || '');
  save('kirengaEmail2', document.getElementById('settings-email2')?.value.trim() || '');
  save('kirengaPhone1', document.getElementById('settings-phone1')?.value.trim() || '');
  save('kirengaPhone2', document.getElementById('settings-phone2')?.value.trim() || '');
  save('kirengaLocation', document.getElementById('settings-location')?.value.trim() || '');
  // Update SEO fields
  const seoTag = document.getElementById('seo-tagline')?.value.trim();
  const seoKw = document.getElementById('seo-keywords')?.value.trim();
  if (seoTag) save('kirengaSeoTagline', seoTag);
  if (seoKw) save('kirengaSeoKeywords', seoKw);
  toast('All settings saved! ✅', 'success', 'Saved');
}

/* Apply saved appearance on load */
document.addEventListener('DOMContentLoaded', () => {
  const fs = load('kirengaFontSize', null); if (fs) setFontSize(fs);
  const ff = load('kirengaFontFamily', null); if (ff) setFontFamily(ff);
  const ac = load('kirengaAccentColor', null);
  if (ac && ac !== '#1a73e8') {
    document.documentElement.style.setProperty('--blue', ac);
    const darken = (hex, amt) => { const r=Math.max(0,parseInt(hex.slice(1,3),16)-amt),g=Math.max(0,parseInt(hex.slice(3,5),16)-amt),b=Math.max(0,parseInt(hex.slice(5,7),16)-amt); return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); };
    document.documentElement.style.setProperty('--blue-dark', darken(ac, 30));
  }
  if (load('kirengaReadingMode', false)) document.body.classList.add('reading-mode');
  if (load('kirengaReduceMotion', false)) document.body.classList.add('reduce-motion');
  const pp = load('kirengaPostsPerPage', null); if (pp) window.POSTS_PER_PAGE_SETTING = parseInt(pp);
  const dc = load('kirengaDefaultCategory', null);
  if (dc) { const el = document.getElementById('new-category'); if (el) el.value = dc; }
});

/* ════════════════════════════════════════════════════
   COMPATIBILITY ALIASES
   Some HTML buttons reference old function names.
   These aliases ensure everything wires up correctly.
════════════════════════════════════════════════════ */
// Old playground function names → new pg* names
function runPlayground()   { pgRunHTML(); }
function clearPlayground() { pgClearEditor(); }
function setPlaygroundMode(btn, mode) {
  if (mode === 'html') { pgSelectLang(document.querySelector('[data-lang="html"]') || btn); }
  else if (mode === 'snippets') { pgRenderSnippetGallery(); }
}

/* ════════════════════════════════════════════════════
   UX POLISH — smooth scroll fix for missing anchors
════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Fix any href="#pricing" links (section removed — redirect to signup)
  document.querySelectorAll('a[href="#pricing"]').forEach(a => {
    a.addEventListener('click', e => { e.preventDefault(); showAuth('signup'); });
  });

  // Sidebar nav: update to include new sections
  const sidebarNav = document.querySelector('.sidebar-nav');
  if (sidebarNav && !sidebarNav.querySelector('a[href="#services"]')) {
    const servicesLink = document.createElement('a');
    servicesLink.href = '#services';
    servicesLink.className = 'sidebar-link';
    servicesLink.innerHTML = '<span class="sidebar-link-icon">🚀</span>Services';
    const aboutLink = sidebarNav.querySelector('a[href="#about"]');
    if (aboutLink) sidebarNav.insertBefore(servicesLink, aboutLink);
  }
});

/* ════════════════════════════════════════════════════
   MISSING CLOSEMODAL FUNCTIONS (defensive)
════════════════════════════════════════════════════ */
if (typeof closeShortcutsModal === 'undefined') {
  window.closeShortcutsModal = function() {
    const m = document.getElementById('shortcuts-modal');
    if (m) m.hidden = true;
    document.body.style.overflow = '';
  };
}
if (typeof showKeyboardShortcuts === 'undefined') {
  window.showKeyboardShortcuts = function() {
    const m = document.getElementById('shortcuts-modal');
    if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; }
  };
}
if (typeof closeBookmarksModal === 'undefined') {
  window.closeBookmarksModal = function() {
    const m = document.getElementById('bookmarks-modal');
    if (m) m.hidden = true;
    document.body.style.overflow = '';
  };
}

/* ════════════════════════════════════════════════════
   1. RSS FEED GENERATOR
   Generates valid RSS 2.0 XML from current posts
   and lets the user download it or copy the URL.
════════════════════════════════════════════════════ */
function openRSSModal() {
  const modal = document.getElementById('rss-modal');
  if (modal) { modal.hidden = false; document.body.style.overflow = 'hidden'; }
}
function closeRSSModal() {
  const modal = document.getElementById('rss-modal');
  if (modal) modal.hidden = true;
  document.body.style.overflow = '';
}
function copyRSSUrl() {
  const url = 'https://kiregablog.co.ug/feed.xml';
  navigator.clipboard.writeText(url).then(() => {
    showAlert('rss-copy-alert', '✅ RSS URL copied to clipboard!');
  }).catch(() => showAlert('rss-copy-alert', 'URL: ' + url, 'info'));
}
function generateAndDownloadRSS() {
  const siteUrl  = 'https://kiregablog.co.ug';
  const siteTitle = 'Kirenga Blog — Notes, Ideas & Reflections';
  const siteDesc  = 'Dev notes, ideas and reflections from Kampala, Uganda 🇺🇬';
  const now = new Date().toUTCString();
  const items = posts.slice(0, 20).map(p => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${siteUrl}/#post-${p.id}</link>
      <guid isPermaLink="false">${siteUrl}/#post-${p.id}</guid>
      <description><![CDATA[${p.content.slice(0, 500)}${p.content.length > 500 ? '…' : ''}]]></description>
      <category><![CDATA[${p.category}]]></category>
      <author>Kirengaisaac@gmail.com (${p.authorName || 'Kirenga Isaac'})</author>
      <pubDate>${new Date(p.iso || Date.now()).toUTCString()}</pubDate>
      ${(p.tags || []).map(t => `<category><![CDATA[${t}]]></category>`).join('')}
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${siteTitle}]]></title>
    <link>${siteUrl}</link>
    <description><![CDATA[${siteDesc}]]></description>
    <language>en-ug</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${siteUrl}/og-image.png</url>
      <title>${siteTitle}</title>
      <link>${siteUrl}</link>
    </image>
    ${items}
  </channel>
</rss>`;

  const blob = new Blob([xml], { type: 'application/rss+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'feed.xml';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('RSS feed downloaded as feed.xml!', 'success', 'RSS Feed');
  closeRSSModal();
}

/* ════════════════════════════════════════════════════
   2. SITEMAP + ROBOTS.TXT GENERATOR
   (accessible from admin dashboard / settings)
════════════════════════════════════════════════════ */
function generateSitemap() {
  const siteUrl = 'https://kiregablog.co.ug';
  const today = new Date().toISOString().split('T')[0];
  const staticPages = [
    { url: siteUrl + '/', priority: '1.0', changefreq: 'daily' },
    { url: siteUrl + '/#posts', priority: '0.9', changefreq: 'daily' },
    { url: siteUrl + '/#about', priority: '0.7', changefreq: 'monthly' },
    { url: siteUrl + '/#contact', priority: '0.6', changefreq: 'monthly' },
    { url: siteUrl + '/#services', priority: '0.8', changefreq: 'weekly' },
  ];
  const postPages = posts.map(p => ({
    url: `${siteUrl}/#post-${p.id}`,
    priority: '0.8',
    changefreq: 'weekly',
    lastmod: (p.iso || new Date().toISOString()).split('T')[0],
  }));
  const allPages = [...staticPages, ...postPages];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(p => `  <url>
    <loc>${p.url}</loc>
    <lastmod>${p.lastmod || today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  const blob = new Blob([xml], { type: 'application/xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'sitemap.xml';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  toast('sitemap.xml downloaded!', 'success', 'Sitemap');
}

function generateRobotsTxt() {
  const txt = `User-agent: *
Allow: /

Sitemap: https://kiregablog.co.ug/sitemap.xml

# Kirenga Blog — Kampala, Uganda
# Built with ❤️ by Isaac Kirenga (@isaacranty)`;
  const blob = new Blob([txt], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'robots.txt';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  toast('robots.txt downloaded!', 'success', 'robots.txt');
}

/* ════════════════════════════════════════════════════
   3. POST SCHEDULING
   Saves a scheduled publish time with the draft.
   A timer checks every minute and auto-publishes.
════════════════════════════════════════════════════ */
let scheduledPostTimer = null;

function openScheduleModal() {
  const modal = document.getElementById('schedule-modal');
  if (!modal) return;
  // Set minimum to now + 5 minutes
  const min = new Date(Date.now() + 5 * 60000);
  const local = new Date(min.getTime() - min.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const input = document.getElementById('schedule-date');
  if (input) { input.min = local; input.value = local; }
  modal.hidden = false; document.body.style.overflow = 'hidden';
}
function closeScheduleModal() {
  document.getElementById('schedule-modal').hidden = true;
  document.body.style.overflow = '';
}
function confirmSchedule() {
  const dateVal = document.getElementById('schedule-date')?.value;
  if (!dateVal) { showAlert('schedule-alert', '⚠️ Please pick a date and time.', 'error'); return; }
  const scheduled = new Date(dateVal).toISOString();
  // Save scheduled draft
  const draft = load('kirengaDraft', {});
  draft.scheduled = scheduled;
  save('kirengaDraft', draft);
  const friendly = new Date(dateVal).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' });
  closeScheduleModal();
  toast(`Post scheduled for ${friendly} (EAT)! 📅`, 'success', 'Scheduled');
  startSchedulerWatcher();
}
function startSchedulerWatcher() {
  if (scheduledPostTimer) clearInterval(scheduledPostTimer);
  scheduledPostTimer = setInterval(() => {
    const draft = load('kirengaDraft', null);
    if (!draft || !draft.scheduled) return;
    if (new Date(draft.scheduled) <= new Date()) {
      // Auto-publish
      const titleEl = document.getElementById('new-title');
      const contentEl = document.getElementById('new-content');
      const categoryEl = document.getElementById('new-category');
      const tagsEl = document.getElementById('new-tags');
      if (titleEl) titleEl.value = draft.title || '';
      if (contentEl) contentEl.value = draft.content || '';
      if (categoryEl) categoryEl.value = draft.category || 'General';
      if (tagsEl) tagsEl.value = draft.tags || '';
      delete draft.scheduled;
      save('kirengaDraft', draft);
      clearInterval(scheduledPostTimer);
      document.getElementById('post-form')?.requestSubmit();
      toast('🚀 Scheduled post published automatically!', 'success', 'Auto-Published');
    }
  }, 30000); // check every 30 seconds
}

/* ════════════════════════════════════════════════════
   4. POST SERIES / CHAPTERS
════════════════════════════════════════════════════ */
function openSeriesModal() {
  const modal = document.getElementById('series-modal');
  if (modal) { modal.hidden = false; document.body.style.overflow = 'hidden'; renderSeriesList(); }
}
function closeSeriesModal() {
  document.getElementById('series-modal').hidden = true;
  document.body.style.overflow = '';
}
function saveSeriesInfo() {
  const name = document.getElementById('series-name')?.value.trim();
  const part = document.getElementById('series-part')?.value;
  const desc = document.getElementById('series-desc')?.value.trim();
  if (!name) { showAlert('series-alert', '⚠️ Series name is required.', 'error'); return; }
  const series = load('kirengaSeries', []);
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const existing = series.findIndex(s => s.id === id);
  const entry = { id, name, desc, part: parseInt(part) || 1, postCount: 0, created: new Date().toISOString() };
  if (existing > -1) series[existing] = { ...series[existing], ...entry };
  else series.push(entry);
  save('kirengaSeries', series);
  // Tag the current draft
  const draft = load('kirengaDraft', {});
  draft.series = id; draft.seriesName = name; draft.seriesPart = entry.part;
  save('kirengaDraft', draft);
  showAlert('series-alert', `✅ Added to series "${name}" (Part ${entry.part}).`);
  renderSeriesList();
}
function renderSeriesList() {
  const list = document.getElementById('series-list'); if (!list) return;
  const series = load('kirengaSeries', []);
  if (!series.length) { list.innerHTML = '<p style="color:var(--muted);font-size:.85rem">No series yet. Create one above.</p>'; return; }
  list.innerHTML = series.map(s => `
    <div class="series-item">
      <div>
        <strong>${escapeHTML(s.name)}</strong>
        <span class="series-meta">${s.part} part${s.part !== 1 ? 's' : ''} · ${s.desc ? escapeHTML(s.desc.slice(0,60)) : 'No description'}</span>
      </div>
      <button class="btn btn-sm btn-danger" onclick="deleteSeries('${escapeJS(s.id)}')">🗑</button>
    </div>`).join('');
}
function deleteSeries(id) {
  const series = load('kirengaSeries', []).filter(s => s.id !== id);
  save('kirengaSeries', series);
  renderSeriesList();
  toast('Series deleted.', 'info');
}

/* ════════════════════════════════════════════════════
   5. AUTHOR BIO ON EACH POST (in modal)
   Injects author card below post body.
════════════════════════════════════════════════════ */
function buildAuthorBio(post) {
  const settings = load('kirengaSettings', {});
  const authorName = post.authorName || settings.name || 'Kirenga Isaac';
  const bio = settings.bio || 'Developer · Kampala, Uganda 🇺🇬 — building cool things one post at a time.';
  const pic  = load('kirengaProfilePic', null);
  const tw   = load('kirengaTwitter', 'isaacranty');
  const gh   = load('kirengaGithub', 'isaacranty');
  const avatar = pic
    ? `<img src="${pic}" alt="${escapeHTML(authorName)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:1.2rem;font-weight:700;color:white">${initials(authorName)}</span>`;
  const avatarBg = pic ? 'transparent' : avatarColor(authorName);
  return `<div class="author-bio-card">
    <div class="author-bio-avatar" style="background:${avatarBg}">${avatar}</div>
    <div class="author-bio-info">
      <div class="author-bio-label">Written by</div>
      <strong class="author-bio-name">${escapeHTML(authorName)}</strong>
      <p class="author-bio-text">${escapeHTML(bio)}</p>
      <div class="author-bio-links">
        ${tw ? `<a href="https://twitter.com/${encodeURIComponent(tw)}" target="_blank" rel="noopener" class="author-bio-link">𝕏 @${escapeHTML(tw)}</a>` : ''}
        ${gh ? `<a href="https://github.com/${encodeURIComponent(gh)}" target="_blank" rel="noopener" class="author-bio-link">🐙 GitHub</a>` : ''}
        <a href="mailto:Kirengaisaac@gmail.com" class="author-bio-link">✉️ Email</a>
      </div>
    </div>
  </div>`;
}

/* ════════════════════════════════════════════════════
   6. POST REVISION HISTORY
   Saves a snapshot every time a post is published
   or a draft is saved. User can restore any version.
════════════════════════════════════════════════════ */
function saveRevision(postId, title, content) {
  const key = 'kirengaRevisions_' + postId;
  const revisions = load(key, []);
  revisions.unshift({
    id: Date.now().toString(36),
    title, content,
    savedAt: new Date().toISOString(),
    savedBy: currentUser?.name || 'Anonymous'
  });
  // Keep last 10 revisions per post
  if (revisions.length > 10) revisions.splice(10);
  save(key, revisions);
}
function openRevisionModal(postIndex) {
  const post = posts[postIndex]; if (!post) return;
  const modal = document.getElementById('revision-modal');
  if (!modal) return;
  const revisions = load('kirengaRevisions_' + post.id, []);
  const list = document.getElementById('revision-list');
  if (!list) return;
  if (!revisions.length) {
    list.innerHTML = '<p style="color:var(--muted);font-size:.86rem">No revisions saved yet. Revisions are saved each time you publish or save a draft.</p>';
  } else {
    list.innerHTML = revisions.map((r, i) => `
      <div class="revision-item">
        <div class="revision-info">
          <strong>${escapeHTML(r.title)}</strong>
          <span class="revision-meta">Saved ${formatDate(r.savedAt)} by ${escapeHTML(r.savedBy)} · ${r.content.split(' ').length} words</span>
        </div>
        <div class="revision-actions">
          <button class="btn btn-sm btn-outline" onclick="previewRevision(${postIndex},${i})">👁 Preview</button>
          <button class="btn btn-sm btn-primary" onclick="restoreRevision(${postIndex},${i})">↩ Restore</button>
        </div>
      </div>`).join('');
  }
  modal.hidden = false; document.body.style.overflow = 'hidden';
}
function closeRevisionModal() {
  document.getElementById('revision-modal').hidden = true;
  document.body.style.overflow = '';
}
function previewRevision(postIndex, revIdx) {
  const post = posts[postIndex]; if (!post) return;
  const rev = load('kirengaRevisions_' + post.id, [])[revIdx]; if (!rev) return;
  const win = window.open('', '_blank', 'width=700,height=600');
  win.document.write(`<!DOCTYPE html><html><head><title>Preview: ${escapeHTML(rev.title)}</title><style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:20px;line-height:1.8;color:#222}h1{margin-bottom:8px}.meta{color:#666;font-size:.85rem;margin-bottom:20px}.content{white-space:pre-wrap}</style></head><body><h1>${escapeHTML(rev.title)}</h1><p class="meta">Revision from ${formatDate(rev.savedAt)}</p><div class="content">${escapeHTML(rev.content)}</div></body></html>`);
  win.document.close();
}
function restoreRevision(postIndex, revIdx) {
  if (!confirm('Restore this revision? The current post content will be overwritten.')) return;
  const post = posts[postIndex]; if (!post) return;
  const rev = load('kirengaRevisions_' + post.id, [])[revIdx]; if (!rev) return;
  post.title = rev.title; post.content = rev.content;
  savePosts();
  renderPosts(); updateAllSidebars();
  closeRevisionModal();
  toast('✅ Revision restored successfully!', 'success', 'Restored');
}

/* Patch publishPost to save revision */
const _origPublishPost = window.publishPost || publishPost;

/* ════════════════════════════════════════════════════
   7. COMMENT MODERATION QUEUE
   Comments can be pending, approved, or spam.
   By default all are approved (open blog).
   Can be toggled in privacy settings.
════════════════════════════════════════════════════ */
let currentModTab = 'pending';

function openModeration() { openPanel('moderation'); }

function switchModTab(tab, btn) {
  currentModTab = tab;
  document.querySelectorAll('.mod-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderModerationList();
}

function renderModerationList() {
  const modList = document.getElementById('mod-list'); if (!modList) return;
  const allComments = [];
  posts.forEach((post, pi) => {
    (post.comments || []).forEach(c => {
      allComments.push({ ...c, postTitle: post.title, postIndex: pi });
      (c.replies || []).forEach(r => allComments.push({ ...r, postTitle: post.title, postIndex: pi, isReply: true }));
    });
  });
  const filtered = allComments.filter(c => (c.status || 'approved') === currentModTab ||
    (currentModTab === 'pending' && !c.status) ||
    (currentModTab === 'approved' && (c.status === 'approved' || !c.spam)));
  // Update counts
  document.getElementById('mod-count-pending').textContent = allComments.filter(c => c.status === 'pending').length;
  document.getElementById('mod-count-approved').textContent = allComments.filter(c => !c.status || c.status === 'approved').length;
  document.getElementById('mod-count-spam').textContent = allComments.filter(c => c.status === 'spam').length;
  if (!filtered.length) {
    modList.innerHTML = `<div class="empty-state" style="padding:32px"><div class="empty-icon">💬</div><p>No ${currentModTab} comments.</p></div>`;
    return;
  }
  modList.innerHTML = filtered.map(c => `
    <div class="mod-comment-item">
      <div class="mod-comment-header">
        <strong>${escapeHTML(c.author)}</strong>
        <span class="mod-comment-meta">on "${escapeHTML(c.postTitle?.slice(0,30) || '')}" · ${timeAgo(c.iso)}</span>
      </div>
      <p class="mod-comment-text">${escapeHTML(c.text)}</p>
      <div class="mod-comment-actions">
        <button class="btn btn-sm btn-primary" onclick="modAction('${escapeJS(c.id)}','approve')">✅ Approve</button>
        <button class="btn btn-sm btn-outline" onclick="modAction('${escapeJS(c.id)}','spam')">🚫 Spam</button>
        <button class="btn btn-sm btn-danger" onclick="modAction('${escapeJS(c.id)}','delete')">🗑 Delete</button>
      </div>
    </div>`).join('');
}

function modAction(commentId, action) {
  posts.forEach(post => {
    const updateComment = (arr) => {
      arr.forEach(c => {
        if (c.id === commentId) {
          if (action === 'approve') c.status = 'approved';
          else if (action === 'spam') c.status = 'spam';
          else if (action === 'delete') { const i = arr.indexOf(c); if (i > -1) arr.splice(i, 1); }
        }
        if (c.replies) updateComment(c.replies);
      });
    };
    updateComment(post.comments || []);
  });
  savePosts(); renderModerationList();
  const msgs = { approve: '✅ Comment approved.', spam: '🚫 Marked as spam.', delete: '🗑 Comment deleted.' };
  toast(msgs[action] || 'Done.', action === 'approve' ? 'success' : 'warning');
}

/* ════════════════════════════════════════════════════
   8. SPAM HONEYPOT PROTECTION
   Adds a hidden field to the contact + comment forms.
   Bots fill it, humans don't. If filled → reject.
════════════════════════════════════════════════════ */
function setupHoneypots() {
  // Contact form
  const contactForm = document.getElementById('contact-form');
  if (contactForm && !contactForm.querySelector('.hp-field')) {
    const hp = document.createElement('div');
    hp.style.cssText = 'position:absolute;left:-9999px;opacity:0;height:0;overflow:hidden';
    hp.setAttribute('aria-hidden', 'true');
    hp.innerHTML = '<label>Leave this blank<input type="text" id="contact-hp" name="website" tabindex="-1" autocomplete="off"></label>';
    hp.className = 'hp-field';
    contactForm.insertBefore(hp, contactForm.firstChild);
  }
  // Comment area
  const commentBox = document.getElementById('comment-text');
  if (commentBox && !document.getElementById('comment-hp')) {
    const hp = document.createElement('input');
    hp.type = 'text'; hp.id = 'comment-hp'; hp.name = 'phone2';
    hp.style.cssText = 'position:absolute;left:-9999px;opacity:0;height:0';
    hp.setAttribute('aria-hidden','true'); hp.tabIndex = -1;
    hp.setAttribute('autocomplete','off');
    commentBox.parentNode?.insertBefore(hp, commentBox);
  }
}

// Patch sendContact to check honeypot
const _origSendContact = sendContact;
async function sendContact(e) {
  const hp = document.getElementById('contact-hp');
  if (hp && hp.value.trim()) {
    // Silently reject bot submission
    e.preventDefault();
    showAlert('contact-alert', '✅ Message sent! We\'ll be in touch soon.');
    document.getElementById('contact-form')?.reset();
    return;
  }
  return _origSendContact.call(this, e);
}

/* ════════════════════════════════════════════════════
   9. SUBSCRIBER COUNT DISPLAY
   Shows newsletter + member counts as social proof
   in the hero stats, sidebar and newsletter section.
════════════════════════════════════════════════════ */
function updateSubscriberCount() {
  const subs = load('kirengaSubs', []).length;
  const users = load('kirengaUsers', []).length;
  const total = subs + users;
  // Update hero stats with subscribers if > 0
  const hsSubs = document.getElementById('hs-posts'); // reuse to check existence
  if (total > 0) {
    const subEl = document.getElementById('hs-subs');
    if (!subEl) {
      const heroStats = document.getElementById('hero-stats');
      if (heroStats) {
        const stat = document.createElement('div');
        stat.className = 'hero-stat';
        stat.innerHTML = `<strong id="hs-subs">${total}</strong><span>Subscribers</span>`;
        heroStats.appendChild(stat);
      }
    } else {
      subEl.textContent = total;
    }
  }
  // Update newsletter section
  const nlNote = document.getElementById('nl-subscriber-count');
  if (nlNote) nlNote.textContent = total > 0 ? `Join ${total.toLocaleString()} subscribers` : 'No spam, ever. Just great posts.';
}

/* Patch subscribeNewsletter to update count */
const _origSubscribe = subscribeNewsletter;
async function subscribeNewsletter(e) {
  await _origSubscribe.call(this, e);
  updateSubscriberCount();
}

/* ════════════════════════════════════════════════════
   10. EXTEND openModal WITH AUTHOR BIO, REVISIONS, SERIES
════════════════════════════════════════════════════ */
const _origOpenModalFull = window.openModal;
window.openModal = function(index, focusComment = false) {
  _origOpenModalFull(index, focusComment);
  const post = posts[index]; if (!post) return;
  // Inject author bio after post body
  const modalContent = document.getElementById('modal-content');
  if (modalContent) {
    // Add author bio
    const bioPrev = modalContent.querySelector('.author-bio-card');
    if (!bioPrev) modalContent.insertAdjacentHTML('beforeend', buildAuthorBio(post));
    // Add series badge if post is in a series
    const seriesInfo = post.series || load('kirengaDraft', {}).series;
    if (seriesInfo && !modalContent.querySelector('.series-badge')) {
      const series = load('kirengaSeries', []).find(s => s.id === seriesInfo);
      if (series) {
        const badge = document.createElement('div');
        badge.className = 'series-badge';
        badge.innerHTML = `📚 Part of series: <strong>${escapeHTML(series.name)}</strong>`;
        modalContent.insertAdjacentElement('afterbegin', badge);
      }
    }
  }
  // Add revision/series buttons to modal
  const shareBar = document.querySelector('.share-bar');
  if (shareBar && !shareBar.querySelector('.revision-btn')) {
    const revBtn = document.createElement('button');
    revBtn.className = 'share-btn revision-btn';
    revBtn.innerHTML = '🕐 History';
    revBtn.title = 'View revision history';
    revBtn.onclick = () => openRevisionModal(index);
    shareBar.appendChild(revBtn);
  }
};

/* ════════════════════════════════════════════════════
   EXTEND PANELS LIST + ADMIN DASHBOARD ADDITIONS
════════════════════════════════════════════════════ */
// Add moderation + new tools to openPanel
const _origOpenPanelFull = window.openPanel;
window.openPanel = function(id) {
  if (id === 'moderation') {
    // Close others first
    ['search','settings','feedback','solutions','resources','learn','media','share',
     'terms','privacy','admin','faq','moderation'].forEach(p => {
      const el = document.getElementById('panel-' + p);
      if (el) { el.hidden = true; el.classList.remove('open'); }
    });
    const panel = document.getElementById('panel-moderation'); if (!panel) return;
    panel.hidden = false;
    document.getElementById('panel-overlay')?.classList.add('open');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => panel.classList.add('open'));
    activePanel = id;
    renderModerationList();
    return;
  }
  _origOpenPanelFull(id);
};

// Extend admin dashboard with sitemap/robots/RSS buttons
const _origInitAdmin = initAdminDashboard;
function initAdminDashboard() {
  _origInitAdmin();
  const manage = document.getElementById('admin-posts-list');
  if (manage && !manage.querySelector('.admin-seo-tools')) {
    const tools = document.createElement('div');
    tools.className = 'admin-seo-tools';
    tools.innerHTML = `
      <p class="sidebar-section-label" style="margin:14px 0 10px">SEO &amp; Publishing Tools</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm btn-outline" onclick="generateAndDownloadRSS()">📡 Download RSS</button>
        <button class="btn btn-sm btn-outline" onclick="generateSitemap()">🗺️ Download sitemap.xml</button>
        <button class="btn btn-sm btn-outline" onclick="generateRobotsTxt()">🤖 Download robots.txt</button>
        <button class="btn btn-sm btn-outline" onclick="openRSSModal()">📡 RSS Info</button>
      </div>`;
    manage.appendChild(tools);
  }
}

/* ════════════════════════════════════════════════════
   INIT — wire all new features on DOMContentLoaded
════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setupHoneypots();
  updateSubscriberCount();
  startSchedulerWatcher();
  // Update newsletter subscriber text
  const nlEl = document.querySelector('#newsletter .newsletter-inner p');
  if (nlEl) nlEl.id = 'nl-subscriber-count';
  updateSubscriberCount();
  // Wire modal backdrops for new modals
  ['rss-modal','schedule-modal','series-modal','revision-modal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      if (e.target === document.getElementById(id)) {
        e.target.hidden = true; document.body.style.overflow = '';
      }
    });
  });
  // Escape closes all new modals
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    ['rss-modal','schedule-modal','series-modal','revision-modal'].forEach(id => {
      const m = document.getElementById(id);
      if (m && !m.hidden) { m.hidden = true; document.body.style.overflow = ''; }
    });
  });
});

/* ════════════════════════════════════════════════════
   NEWS FEED — RSS aggregator (Priority batch loading)
   Priority feeds show in ~2-3s, secondary loads in background
════════════════════════════════════════════════════ */

// ── Priority feeds: fastest & most reliable, show first ──
const NEWS_FEEDS_PRIMARY = [
  { url:'https://feeds.feedburner.com/TechCrunch',      cat:'tech',     name:'TechCrunch',    color:'#0a0a0a', icon:'💻' },
  { url:'https://www.theverge.com/rss/index.xml',       cat:'tech',     name:'The Verge',     color:'#7c3aed', icon:'🔷' },
  { url:'https://feeds.feedburner.com/TheHackersNews',  cat:'cyber',    name:'Hacker News',   color:'#e53935', icon:'🔐' },
  { url:'https://www.bleepingcomputer.com/feed/',       cat:'cyber',    name:'BleepingComp',  color:'#1565c0', icon:'🛡️' },
  { url:'https://www.bbc.co.uk/sport/football/rss.xml', cat:'football', name:'BBC Football',  color:'#c0392b', icon:'⚽' },
  { url:'https://dev.to/feed',                          cat:'dev',      name:'Dev.to',        color:'#0a0a0a', icon:'👨‍💻' },
  { url:'https://venturebeat.com/category/ai/feed/',    cat:'ai',       name:'VentureBeat AI',color:'#e63946', icon:'💡' },
  { url:'https://techcabal.com/feed/',                  cat:'africa',   name:'TechCabal',     color:'#f9ab00', icon:'🌍' },
];

// ── Secondary feeds: load silently after first results show ──
const NEWS_FEEDS_SECONDARY = [
  { url:'https://www.wired.com/feed/rss',               cat:'tech',     name:'Wired',         color:'#e63946', icon:'⚡' },
  { url:'https://www.engadget.com/rss.xml',             cat:'tech',     name:'Engadget',      color:'#00a8e0', icon:'📱' },
  { url:'https://feeds.arstechnica.com/arstechnica/index',cat:'tech',   name:'Ars Technica',  color:'#e55c00', icon:'🖥️' },
  { url:'https://openai.com/blog/rss.xml',              cat:'ai',       name:'OpenAI',        color:'#10a37f', icon:'🤖' },
  { url:'https://blog.google/technology/ai/rss/',       cat:'ai',       name:'Google AI',     color:'#1a73e8', icon:'🧠' },
  { url:'https://huggingface.co/blog/feed.xml',         cat:'ai',       name:'HuggingFace',   color:'#ff9d00', icon:'🤗' },
  { url:'https://krebsonsecurity.com/feed/',            cat:'cyber',    name:'Krebs Security',color:'#2e7d32', icon:'🔒' },
  { url:'https://www.darkreading.com/rss.xml',          cat:'cyber',    name:'Dark Reading',  color:'#212121', icon:'🌑' },
  { url:'https://www.espn.com/espn/rss/soccer/news',   cat:'football', name:'ESPN Soccer',   color:'#d50000', icon:'🎯' },
  { url:'https://www.goal.com/feeds/en/news',           cat:'football', name:'Goal.com',      color:'#00897b', icon:'🏆' },
  { url:'https://disrupt-africa.com/feed/',             cat:'africa',   name:'Disrupt Africa',color:'#e65100', icon:'🚀' },
  { url:'https://www.itnewsafrica.com/feed/',           cat:'africa',   name:'IT News Africa',color:'#1b5e20', icon:'🌱' },
  { url:'https://css-tricks.com/feed/',                 cat:'dev',      name:'CSS-Tricks',    color:'#f06292', icon:'🎨' },
  { url:'https://stackoverflow.blog/feed/',             cat:'dev',      name:'Stack Overflow',color:'#f48024', icon:'📚' },
  { url:'https://github.blog/feed/',                    cat:'dev',      name:'GitHub Blog',   color:'#24292e', icon:'🐙' },
];

const NEWS_FEEDS    = [...NEWS_FEEDS_PRIMARY, ...NEWS_FEEDS_SECONDARY];
// ✅ Multiple proxy fallbacks — if one fails, tries the next
const RSS_PROXIES = [
  url => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&count=6`,
  url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];
const NEWS_CACHE_MS = 30 * 60 * 1000; // 30 min cache
const FETCH_TIMEOUT = 6000;           // 6s per feed

let _allNewsItems = [];
let _newsTab      = 'all';
let _newsPage     = 0;
let _newsQuery    = '';
let _newsItemMap  = {};
const NEWS_PER_PAGE = 12;

// Parse RSS XML directly (used when allorigins/corsproxy returns raw XML)
function parseRSSXML(xmlText, feed) {
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xmlText, 'text/xml');
    const items  = Array.from(doc.querySelectorAll('item, entry'));
    return items.slice(0, 6).map(item => {
      const get  = tag => item.querySelector(tag)?.textContent?.trim() || '';
      const getAttr = (tag, attr) => item.querySelector(tag)?.getAttribute(attr) || '';
      const title = get('title');
      const link  = get('link') || getAttr('link', 'href') || get('id') || '#';
      const desc  = get('description') || get('summary') || get('content') || '';
      const date  = get('pubDate') || get('published') || get('updated') || '';
      const image = getAttr('enclosure', 'url') || getAttr('media\:content', 'url') || '';
      return {
        title:       title,
        link:        link,
        description: desc.replace(/<[^>]+>/g, '').slice(0, 200),
        image:       image,
        date:        date ? new Date(date) : new Date(),
        source:      feed.name,
        color:       feed.color,
        icon:        feed.icon,
        cat:         feed.cat,
      };
    }).filter(i => i.title);
  } catch (e) { return []; }
}

async function fetchFeed(feed) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);

  // ── Proxy 1: rss2json (fastest when it works) ──
  try {
    const r = await fetch(RSS_PROXIES[0](feed.url), { signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) {
      const d = await r.json();
      if (d.status === 'ok' && d.items && d.items.length) {
        return d.items.map(i => ({
          title:       i.title || '',
          link:        i.link  || i.guid || '#',
          description: (i.description || i.content || '').replace(/<[^>]+>/g, '').slice(0, 200),
          image:       i.thumbnail || i.enclosure?.link || '',
          date:        i.pubDate ? new Date(i.pubDate) : new Date(),
          source:      feed.name, color: feed.color, icon: feed.icon, cat: feed.cat,
        }));
      }
    }
  } catch (e) { clearTimeout(timer); }

  // ── Proxy 2: allorigins (returns raw RSS XML) ──
  try {
    const ctrl2  = new AbortController();
    const timer2 = setTimeout(() => ctrl2.abort(), FETCH_TIMEOUT);
    const r2 = await fetch(RSS_PROXIES[1](feed.url), { signal: ctrl2.signal });
    clearTimeout(timer2);
    if (r2.ok) {
      const d2 = await r2.json();
      const xml = d2.contents || '';
      if (xml) {
        const items = parseRSSXML(xml, feed);
        if (items.length) return items;
      }
    }
  } catch (e) {}

  // ── Proxy 3: corsproxy.io (direct RSS XML) ──
  try {
    const ctrl3  = new AbortController();
    const timer3 = setTimeout(() => ctrl3.abort(), FETCH_TIMEOUT);
    const r3 = await fetch(RSS_PROXIES[2](feed.url), { signal: ctrl3.signal });
    clearTimeout(timer3);
    if (r3.ok) {
      const xml = await r3.text();
      if (xml && xml.includes('<item') || xml.includes('<entry')) {
        const items = parseRSSXML(xml, feed);
        if (items.length) return items;
      }
    }
  } catch (e) {}

  return []; // all proxies failed — silently skip this feed
}

function newsCard(item, index) {
  _newsItemMap[index] = item;
  const timeAgoStr = newsTimeAgo(item.date);
  const imgHTML = item.image
    ? `<img src="${escapeHTML(item.image)}" class="news-card-img" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="news-card-img-placeholder" style="display:none">${item.icon}</div>`
    : `<div class="news-card-img-placeholder">${item.icon}</div>`;
  return `<div class="news-card" onclick="openNewsModal(${index})" style="cursor:pointer">
    ${imgHTML}
    <div class="news-card-body">
      <div class="news-card-source">
        <span class="news-source-badge" style="background:${item.color}">${item.icon} ${escapeHTML(item.source)}</span>
        <span class="news-card-meta">${timeAgoStr}</span>
      </div>
      <div class="news-card-title">${escapeHTML(item.title)}</div>
      ${item.description ? `<div class="news-card-desc">${escapeHTML(item.description)}</div>` : ''}
      <div class="news-card-footer">
        <span class="news-read-btn">Read more →</span>
        <span class="news-card-meta">${escapeHTML(item.source)}</span>
      </div>
    </div>
  </div>`;
}

function openNewsModal(index) {
  const item = _newsItemMap[index];
  if (!item) return;
  const modal    = document.getElementById('news-modal');
  const badge    = document.getElementById('news-modal-badge');
  const img      = document.getElementById('news-modal-img');
  const title    = document.getElementById('news-modal-title');
  const source   = document.getElementById('news-modal-source');
  const date     = document.getElementById('news-modal-date');
  const body     = document.getElementById('news-modal-body');
  const extlink  = document.getElementById('news-modal-extlink');
  const fulllink = document.getElementById('news-modal-fulllink');
  if (badge)  { badge.textContent = item.icon + ' ' + item.source; badge.style.background = item.color; }
  if (img)    { if (item.image) { img.src = item.image; img.style.display = 'block'; img.onerror = () => img.style.display = 'none'; } else img.style.display = 'none'; }
  if (title)  title.textContent  = item.title;
  if (source) source.textContent = '📰 ' + item.source;
  if (date)   date.textContent   = '📅 ' + new Date(item.date).toLocaleDateString('en-UG', { year:'numeric', month:'long', day:'numeric' });
  if (extlink)  extlink.href  = item.link;
  if (fulllink) fulllink.href = item.link;
  if (body) body.innerHTML = item.description
    ? `<p style="line-height:1.8">${escapeHTML(item.description)}</p><div style="margin-top:16px;padding:12px 14px;background:var(--bg-2,#f4f6fb);border-radius:10px;border-left:3px solid var(--blue,#1a73e8)"><p style="font-size:.82rem;color:var(--muted);margin:0">📌 Preview only — click <strong>Read Full Article</strong> for the complete story on ${escapeHTML(item.source)}.</p></div>`
    : `<p style="color:var(--muted)">No preview. Click Read Full Article to read on ${escapeHTML(item.source)}.</p>`;
  if (modal) { modal.hidden = false; document.body.style.overflow = 'hidden'; }
}

function closeNewsModal() {
  const modal = document.getElementById('news-modal');
  if (modal) modal.hidden = true;
  document.body.style.overflow = '';
}

function newsTimeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)     return 'just now';
  if (s < 3600)   return Math.floor(s / 60) + 'm ago';
  if (s < 86400)  return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return new Date(date).toLocaleDateString('en-UG', { month:'short', day:'numeric' });
}

function getFilteredNews() {
  return _allNewsItems.filter(item => {
    const matchTab   = _newsTab === 'all' || item.cat === _newsTab;
    const matchQuery = !_newsQuery || item.title.toLowerCase().includes(_newsQuery) || item.source.toLowerCase().includes(_newsQuery);
    return matchTab && matchQuery;
  });
}

function renderNews() {
  const grid   = document.getElementById('news-grid');
  const lmBtn  = document.getElementById('news-load-more');
  if (!grid) return;
  const filtered = getFilteredNews();
  const visible  = filtered.slice(0, (_newsPage + 1) * NEWS_PER_PAGE);
  if (!visible.length) {
    grid.innerHTML = '<div class="news-empty">😕 No news found. Try a different tab or refresh.</div>';
    if (lmBtn) lmBtn.hidden = true;
    return;
  }
  grid.innerHTML = visible.map((item, i) => newsCard(item, i)).join('');
  if (lmBtn) lmBtn.hidden = visible.length >= filtered.length;
}

async function loadAllFeeds(forceRefresh = false) {
  const grid   = document.getElementById('news-grid');
  const refBtn = document.getElementById('news-refresh-btn');
  if (!grid) return;

  // Show 30-min cache instantly — zero spinner for returning visitors
  if (!forceRefresh) {
    try {
      const cached    = localStorage.getItem('kbNewsCache');
      const cacheTime = localStorage.getItem('kbNewsCacheTime');
      if (cached && cacheTime && (Date.now() - parseInt(cacheTime)) < NEWS_CACHE_MS) {
        _allNewsItems = JSON.parse(cached).map(i => ({ ...i, date: new Date(i.date) }));
        _newsPage = 0;
        renderNews();
        if (refBtn) refBtn.title = 'Cached · ' + Math.round((Date.now() - parseInt(cacheTime)) / 60000) + 'min ago';
        return; // cache still fresh
      }
    } catch (e) {}
  }

  // No fresh cache — show spinner and load priority batch first
  grid.innerHTML = '<div class="news-loading"><div class="news-spinner"></div><p style="font-size:.85rem">Loading top stories...</p></div>';
  if (refBtn) { refBtn.textContent = '⏳'; refBtn.disabled = true; }

  // STEP 1: Fetch priority feeds first — show results fast
  const primaryResults = await Promise.allSettled(NEWS_FEEDS_PRIMARY.map(f => fetchFeed(f)));
  const primaryItems   = primaryResults
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (primaryItems.length) {
    _allNewsItems = primaryItems;
    _newsPage     = 0;
    renderNews(); // Show first results immediately
  }
  if (refBtn) { refBtn.textContent = '🔄 Refresh'; refBtn.disabled = false; }

  // STEP 2: Load secondary feeds silently in background
  Promise.allSettled(NEWS_FEEDS_SECONDARY.map(f => fetchFeed(f))).then(secondaryResults => {
    const secondaryItems = secondaryResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (!secondaryItems.length) return;
    const seen     = new Set(_allNewsItems.map(i => i.title));
    const newItems = secondaryItems.filter(i => !seen.has(i.title));
    const allItems = [..._allNewsItems, ...newItems].sort((a, b) => new Date(b.date) - new Date(a.date));
    _allNewsItems  = allItems;
    // Save to localStorage cache
    try {
      localStorage.setItem('kbNewsCache',     JSON.stringify(allItems));
      localStorage.setItem('kbNewsCacheTime', Date.now().toString());
    } catch (e) {}
    // Save to Firebase DB if available
    if (typeof DB !== 'undefined' && DB.saveNews) {
      try { DB.saveNews(allItems.slice(0, 150)); } catch (e) {}
    }
    // Re-render only on 'all' tab
    if (_newsTab === 'all') renderNews();
  });
}

function switchNewsTab(tab, btn) {
  _newsTab  = tab;
  _newsPage = 0;
  document.querySelectorAll('.news-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderNews();
}

function filterNews(query) {
  _newsQuery = query.toLowerCase().trim();
  _newsPage  = 0;
  renderNews();
}

function loadMoreNews() {
  _newsPage++;
  renderNews();
}

// Auto-load news on page ready
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => loadAllFeeds(), 1200);
  document.getElementById('news-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('news-modal')) closeNewsModal();
  });
});

// Close news modal on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const nm = document.getElementById('news-modal');
    if (nm && !nm.hidden) closeNewsModal();
  }
});
