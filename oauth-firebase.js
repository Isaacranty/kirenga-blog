/* ════════════════════════════════════════════════════════════════════════════
   ENHANCED FIREBASE OAUTH - FIX FOR GOOGLE/GITHUB NOT RESPONDING
   
   This file REPLACES oauth-universal.js
   Fixes the issue where OAuth providers don't respond on signup
   Works with existing code - NO changes needed!
════════════════════════════════════════════════════════════════════════════ */

const OAUTH_CONFIG = {
  ENABLED: true,
  TIMEOUT: 30000,  // 30 second timeout
  DEBUG: true      // Set to false in production
};

const OAUTH_PROVIDERS = {
  google: {
    name: 'Google',
    icon: '🔍',
    enabled: true,  // Auto-enable if Firebase available
    firebaseProvider: null
  },
  github: {
    name: 'GitHub',
    icon: '🐙',
    enabled: true,
    firebaseProvider: null
  },
  facebook: {
    name: 'Facebook',
    icon: 'f',
    enabled: true,
    firebaseProvider: null
  },
  microsoft: {
    name: 'Microsoft',
    icon: '⊞',
    enabled: true,
    firebaseProvider: null
  },
  twitter: {
    name: 'Twitter',
    icon: '𝕏',
    enabled: true,
    firebaseProvider: null
  },
  discord: {
    name: 'Discord',
    icon: '⚙️',
    enabled: true,
    firebaseProvider: null
  }
};

// Enhanced OAuth Handler
const OAuthManager = {
  auth: null,
  isInitialized: false,

  async init() {
    if (this.isInitialized) return;
    
    try {
      // Wait for Firebase to load
      if (!window.firebase || !window.firebase.auth) {
        console.warn('⚠️ Firebase not loaded yet, retrying...');
        setTimeout(() => this.init(), 1000);
        return;
      }

      this.auth = window.firebase.auth();
      this.setupProviders();
      this.setupAuthStateListener();
      this.isInitialized = true;

      console.log('✅ OAuth Manager initialized');
      console.log('Ready providers:', 
        Object.entries(OAUTH_PROVIDERS)
          .filter(([_, p]) => p.enabled && p.firebaseProvider)
          .map(([_, p]) => p.name)
          .join(', ')
      );
    } catch (e) {
      console.error('OAuth init error:', e.message);
    }
  },

  setupProviders() {
    try {
      // Google
      OAUTH_PROVIDERS.google.firebaseProvider = new window.firebase.auth.GoogleAuthProvider();
      OAUTH_PROVIDERS.google.firebaseProvider.addScope('profile');
      OAUTH_PROVIDERS.google.firebaseProvider.addScope('email');

      // GitHub
      OAUTH_PROVIDERS.github.firebaseProvider = new window.firebase.auth.GithubAuthProvider();
      OAUTH_PROVIDERS.github.firebaseProvider.addScope('user:email');

      // Facebook
      try {
        OAUTH_PROVIDERS.facebook.firebaseProvider = new window.firebase.auth.FacebookAuthProvider();
        OAUTH_PROVIDERS.facebook.firebaseProvider.addScope('email');
      } catch (e) {
        OAUTH_PROVIDERS.facebook.enabled = false;
      }

      // Microsoft
      try {
        OAUTH_PROVIDERS.microsoft.firebaseProvider = new window.firebase.auth.OAuthProvider('microsoft.com');
        OAUTH_PROVIDERS.microsoft.firebaseProvider.addScope('mail.read');
      } catch (e) {
        OAUTH_PROVIDERS.microsoft.enabled = false;
      }

      // Twitter
      try {
        OAUTH_PROVIDERS.twitter.firebaseProvider = new window.firebase.auth.TwitterAuthProvider();
      } catch (e) {
        OAUTH_PROVIDERS.twitter.enabled = false;
      }

      // Discord - requires custom setup
      OAUTH_PROVIDERS.discord.enabled = false;

      console.log('✅ OAuth providers configured');
    } catch (e) {
      console.error('Provider setup error:', e.message);
    }
  },

  setupAuthStateListener() {
    this.auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        await this.handleOAuthLogin(firebaseUser);
      }
    });
  },

  async handleOAuthLogin(firebaseUser) {
    try {
      const provider = firebaseUser.providerData[0];
      const providerName = provider?.providerId.split('.')[0].toUpperCase() || 'EMAIL';

      const oauthUser = {
        name: firebaseUser.displayName || 'User',
        email: firebaseUser.email,
        username: firebaseUser.email?.split('@')[0] || `user_${Date.now()}`,
        avatar: firebaseUser.photoURL || null,
        profilePic: firebaseUser.photoURL || null,
        bio: '',
        via: providerName,
        firebaseUid: firebaseUser.uid,
        password: '',
        joinedAt: new Date().toISOString()
      };

      // Check if user exists
      let dbUser = await DB.getUserByEmail(oauthUser.email);

      if (!dbUser) {
        // Create new user
        dbUser = await DB.createUser(oauthUser);
        console.log(`✅ New user created via ${providerName}`);
      } else {
        // Update user with OAuth data
        dbUser.avatar = oauthUser.avatar || dbUser.avatar;
        dbUser.via = providerName;
        console.log(`✅ User logged in via ${providerName}`);
      }

      // Login user
      if (dbUser && typeof loginUser === 'function') {
        loginUser(dbUser);
        if (typeof closeAuth === 'function') {
          closeAuth();
        }
      }
    } catch (error) {
      console.error('OAuth login error:', error.message);
    }
  },

  async loginWithProvider(providerName) {
    if (!this.auth || !this.isInitialized) {
      console.warn('OAuth not initialized');
      this.init();
      return;
    }

    const providerLower = providerName.toLowerCase();
    const provider = OAUTH_PROVIDERS[providerLower];

    if (!provider || !provider.enabled || !provider.firebaseProvider) {
      console.warn(`${providerName} not available`);
      // Fall back to demo
      if (window._origSocialLogin) {
        window._origSocialLogin(providerName);
      }
      return;
    }

    try {
      console.log(`Starting ${providerName} OAuth...`);
      
      // Set popup behavior
      this.auth.useDeviceLanguage();

      // Sign in with popup
      const result = await this.auth.signInWithPopup(provider.firebaseProvider);
      console.log(`✅ ${providerName} auth successful`);
      
      return result;
    } catch (error) {
      console.error(`${providerName} OAuth error:`, error);

      if (error.code === 'auth/popup-blocked') {
        alert('📱 Popup blocked! Please enable popups for this site and try again.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        console.log('User closed login popup');
      } else if (error.code === 'auth/cancelled-popup-request') {
        console.log('Another login attempt in progress');
      } else if (error.code === 'auth/network-request-failed') {
        alert('⚠️ Network error. Check your connection and try again.');
      } else {
        console.error('Unknown error:', error.message);
      }

      // Fall back to demo
      if (window._origSocialLogin) {
        window._origSocialLogin(providerName);
      }
    }
  }
};

// Save original socialLogin
const _origSocialLogin = typeof socialLogin !== 'undefined' ? socialLogin : null;

// Override socialLogin to use OAuth
async function socialLogin(provider) {
  if (OAuthManager.isInitialized && OAUTH_CONFIG.ENABLED) {
    await OAuthManager.loginWithProvider(provider);
  } else if (window._origSocialLogin) {
    window._origSocialLogin(provider);
  } else {
    console.error('No login method available');
  }
}

// Make globally accessible
window.OAuthManager = OAuthManager;
window.socialLogin = socialLogin;

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => OAuthManager.init());
} else {
  // Small delay to ensure Firebase is loaded
  setTimeout(() => OAuthManager.init(), 500);
}

console.log('%c🔐 Enhanced OAuth Module Loaded', 'color:#4285f4;font-weight:700;font-size:12px');
