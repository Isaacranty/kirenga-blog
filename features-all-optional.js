/* ════════════════════════════════════════════════════════════════════════════
   ALL OPTIONAL FEATURES IN ONE FILE
   
   Includes:
   1. Social Sharing (Twitter, Facebook, LinkedIn)
   2. Post Analytics (view counts, trending)
   3. User Badges & Achievements
   4. Notifications Bell System
   5. Popular Tags
   
   NO code changes needed!
════════════════════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════════════════
// 1. SOCIAL SHARING
// ═══════════════════════════════════════════════════════════════════════════

const SocialSharing = {
  sharePost(postId, postTitle) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const postUrl = `${window.location.origin}?post=${postId}`;
    const text = `Check out: ${postTitle}`;

    // Twitter
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(postUrl)}`;
    
    // Facebook
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`;
    
    // LinkedIn
    const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(postUrl)}`;
    
    // WhatsApp
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + postUrl)}`;

    return {
      twitter: twitterUrl,
      facebook: fbUrl,
      linkedin: linkedinUrl,
      whatsapp: whatsappUrl,
      email: `mailto:?subject=${encodeURIComponent(postTitle)}&body=${encodeURIComponent(text + '\n' + postUrl)}`
    };
  },

  openShare(platform, postId) {
    const urls = this.sharePost(postId, posts.find(p => p.id === postId)?.title);
    if (urls[platform]) {
      window.open(urls[platform], '_blank', 'width=600,height=400');
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. POST ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

const PostAnalytics = {
  data: {},

  init() {
    this.loadAnalytics();
    // Guard trackPageViews — posts may not be defined yet
    try { this.trackPageViews(); } catch(e) {}
  },

  loadAnalytics() {
    const saved = localStorage.getItem('postAnalytics');
    this.data = saved ? JSON.parse(saved) : {};
  },

  saveAnalytics() {
    localStorage.setItem('postAnalytics', JSON.stringify(this.data));
  },

  // ✅ FIX: trackPageViews was called in init() but never defined
  trackPageViews() {
    // Track the current page/post if a post ID is present in the URL hash
    const hash = window.location.hash.replace('#', '');
    if (hash && hash.startsWith('post-')) {
      this.trackView(hash);
    }
    // Also track on hash changes (when user navigates to a post)
    window.addEventListener('hashchange', () => {
      const newHash = window.location.hash.replace('#', '');
      if (newHash && newHash.startsWith('post-')) {
        this.trackView(newHash);
      }
    });
  },

  // Track when a post is viewed
  trackView(postId) {
    if (!this.data[postId]) {
      this.data[postId] = { views: 0, likes: 0, comments: 0, lastViewed: new Date() };
    }
    this.data[postId].views++;
    this.data[postId].lastViewed = new Date();
    this.saveAnalytics();
  },

  // Get trending posts (most viewed in last 7 days)
  getTrendingPosts(limit = 5) {
    return Object.entries(this.data)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  },

  // Get post stats
  getStats(postId) {
    return this.data[postId] || { views: 0, likes: 0, comments: 0 };
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. USER BADGES & ACHIEVEMENTS
// ═══════════════════════════════════════════════════════════════════════════

const UserBadges = {
  badges: {
    first_post: { name: '🚀 First Post', description: 'Published your first post' },
    ten_posts: { name: '📝 Prolific Writer', description: '10 posts published' },
    fifty_posts: { name: '🔥 Super Blogger', description: '50 posts published' },
    many_comments: { name: '💬 Commentator', description: '10 comments made' },
    many_reactions: { name: '❤️ Loved', description: '50 reactions received' },
    daily_visitor: { name: '📅 Consistent', description: 'Visited for 7 days in a row' },
    helper: { name: '🙋 Helper', description: 'Replied to 5+ comments' }
  },

  userBadges: {},

  init() {
    this.loadBadges();
    this.checkAndAwardBadges();
  },

  loadBadges() {
    const saved = localStorage.getItem('userBadges');
    this.userBadges = saved ? JSON.parse(saved) : {};
  },

  saveBadges() {
    localStorage.setItem('userBadges', JSON.stringify(this.userBadges));
  },

  // Award a badge to user
  awardBadge(badgeId) {
    const userId = currentUser?.id;
    if (!userId || this.userBadges[badgeId]) return false;

    this.userBadges[badgeId] = { awardedAt: new Date() };
    this.saveBadges();

    console.log(`🏆 Badge awarded: ${this.badges[badgeId].name}`);
    showAlert('achievement-alert', `🏆 ${this.badges[badgeId].name} unlocked!`, 'success');
    return true;
  },

  // Check for achievement criteria
  checkAndAwardBadges() {
    if (typeof currentUser === 'undefined' || !currentUser) return;
    if (typeof posts === 'undefined') return;
    const userId = currentUser?.id;
    if (!userId) return;

    const userPosts = posts.filter(p => p.authorId === userId);
    const allComments = posts.flatMap(p => p.comments || []);
    const userComments = allComments.filter(c => c.authorId === userId);

    // First post
    if (userPosts.length === 1 && !this.userBadges.first_post) {
      this.awardBadge('first_post');
    }

    // 10 posts
    if (userPosts.length >= 10 && !this.userBadges.ten_posts) {
      this.awardBadge('ten_posts');
    }

    // 50 posts
    if (userPosts.length >= 50 && !this.userBadges.fifty_posts) {
      this.awardBadge('fifty_posts');
    }

    // Commentator
    if (userComments.length >= 10 && !this.userBadges.many_comments) {
      this.awardBadge('many_comments');
    }

    // Helper
    const userReplies = allComments.filter(c => c.authorId === userId && c.parentCommentId).length;
    if (userReplies >= 5 && !this.userBadges.helper) {
      this.awardBadge('helper');
    }
  },

  // Get user's badges
  getUserBadges() {
    return Object.keys(this.userBadges).map(id => this.badges[id]);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. NOTIFICATIONS BELL SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

const NotificationSystem = {
  notifications: [],

  addNotification(message, type = 'info', duration = 5000) {
    const notification = {
      id: Date.now(),
      message,
      type,  // 'info', 'success', 'warning', 'error'
      timestamp: new Date(),
      read: false
    };

    this.notifications.unshift(notification);
    
    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        this.removeNotification(notification.id);
      }, duration);
    }

    return notification;
  },

  removeNotification(id) {
    this.notifications = this.notifications.filter(n => n.id !== id);
  },

  markAsRead(id) {
    const notif = this.notifications.find(n => n.id === id);
    if (notif) notif.read = true;
  },

  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  },

  getAll() {
    return this.notifications;
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. POPULAR TAGS
// ═══════════════════════════════════════════════════════════════════════════

const PopularTags = {
  getPopularTags(limit = 10) {
    const tagCounts = {};

    posts.forEach(post => {
      (post.tags || []).forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  },

  getTrendingTags(days = 7) {
    const now = new Date();
    const pastDate = new Date(now - days * 24 * 60 * 60 * 1000);

    const tagCounts = {};
    posts.filter(p => new Date(p.createdAt) > pastDate).forEach(post => {
      (post.tags || []).forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    PostAnalytics.init();
    UserBadges.init();
    console.log('✅ All optional features loaded');
  });
} else {
  PostAnalytics.init();
  UserBadges.init();
  console.log('✅ All optional features loaded');
}

// Make globally accessible
window.SocialSharing = SocialSharing;
window.PostAnalytics = PostAnalytics;
window.UserBadges = UserBadges;
window.NotificationSystem = NotificationSystem;
window.PopularTags = PopularTags;

console.log('⭐ Features available: Sharing, Analytics, Badges, Notifications, Popular Tags');
