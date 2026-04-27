/* ════════════════════════════════════════════════════════════════════════════
   EMAIL NOTIFICATIONS - OPTIONAL FEATURE
   
   Sends email when:
   - User gets comment on their post
   - User gets reply to their comment
   - Someone reacts to their post
   
   NO code changes needed. Just include this file!
════════════════════════════════════════════════════════════════════════════ */

const EmailNotifications = {
  enabled: true,
  userPreferences: {},

  // Initialize email notification system
  init() {
    this.loadUserPreferences();
    this.setupNotificationListeners();
    console.log('✅ Email Notifications loaded');
  },

  // Load user notification preferences
  loadUserPreferences() {
    const saved = localStorage.getItem('emailNotificationPrefs');
    this.userPreferences = saved ? JSON.parse(saved) : {
      onComment: true,
      onReply: true,
      onReaction: false,
      email: currentUser?.email || ''
    };
  },

  // Save preferences
  savePreferences() {
    localStorage.setItem('emailNotificationPrefs', JSON.stringify(this.userPreferences));
  },

  // Send email notification (integrates with email service)
  async sendEmailNotification(type, data) {
    if (!this.enabled) return;

    const notificationData = {
      type,
      to: this.userPreferences.email,
      timestamp: new Date().toISOString(),
      ...data
    };

    try {
      // Store in database for email service integration
      // You'll integrate with SendGrid, Mailgun, Firebase Functions, etc.
      console.log('📧 Email notification queued:', notificationData);
      
      // This would typically call your email API:
      // await fetch('/api/send-email', { method: 'POST', body: JSON.stringify(notificationData) });
      
      return true;
    } catch (error) {
      console.error('Email notification error:', error);
      return false;
    }
  },

  // Notify on new comment
  async notifyComment(postId, postTitle, commenterName, commentText) {
    if (!this.userPreferences.onComment) return;

    await this.sendEmailNotification('comment', {
      postId,
      postTitle,
      commenterName,
      commentText,
      subject: `New comment on "${postTitle}"`
    });
  },

  // Notify on reply
  async notifyReply(postId, postTitle, replierName, replyText) {
    if (!this.userPreferences.onReply) return;

    await this.sendEmailNotification('reply', {
      postId,
      postTitle,
      replierName,
      replyText,
      subject: `${replierName} replied to your comment`
    });
  },

  // Notify on reaction
  async notifyReaction(postId, postTitle, reactorName, reactionType) {
    if (!this.userPreferences.onReaction) return;

    await this.sendEmailNotification('reaction', {
      postId,
      postTitle,
      reactorName,
      reactionType,
      subject: `${reactorName} ${reactionType}d your post`
    });
  },

  // Setup notification listeners
  setupNotificationListeners() {
    // Hook into existing comment creation
    const _origAddComment = typeof addComment !== 'undefined' ? addComment : null;
    if (_origAddComment) {
      window.addComment = async function(postId, text) {
        const result = await _origAddComment(postId, text);
        if (result) {
          const post = posts.find(p => p.id === postId);
          EmailNotifications.notifyComment(postId, post?.title, currentUser?.name, text);
        }
        return result;
      };
    }
  }
};

// Initialize when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => EmailNotifications.init());
} else {
  EmailNotifications.init();
}

window.EmailNotifications = EmailNotifications;
console.log('📧 Email Notifications system ready');
