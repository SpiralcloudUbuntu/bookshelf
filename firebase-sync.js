// Firebase Integration Module
// Handles authentication and cloud sync for the bookshelf app

const FirebaseSync = {
  app: null,
  auth: null,
  db: null,
  user: null,
  initialized: false,

  // Initialize Firebase
  async init() {
    if (this.initialized) return;
    
    try {
      // Firebase config
      const firebaseConfig = {
        apiKey: "AIzaSyDQ93_92eYWzuhlMWiEWzeYOlzgLHyAXZA",
        authDomain: "bookshelf-app-68ab2.firebaseapp.com",
        projectId: "bookshelf-app-68ab2",
        storageBucket: "bookshelf-app-68ab2.firebasestorage.app",
        messagingSenderId: "964918288629",
        appId: "1:964918288629:web:e2ec942990beb426b425bc"
      };

      // Initialize Firebase
      this.app = firebase.initializeApp(firebaseConfig);
      this.auth = firebase.auth();
      this.db = firebase.firestore();

      // Listen for auth state changes
      this.auth.onAuthStateChanged((user) => {
        this.user = user;
        this.updateUI();
        if (user) {
          console.log('Firebase: User signed in:', user.email);
          this.syncFromCloud();
        } else {
          console.log('Firebase: User signed out');
        }
      });

      this.initialized = true;
      console.log('Firebase initialized');
    } catch (error) {
      console.error('Firebase init error:', error);
    }
  },

  // Sign in with Google
  async signInWithGoogle() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const result = await this.auth.signInWithPopup(provider);
      console.log('Signed in as:', result.user.email);
      return result.user;
    } catch (error) {
      console.error('Google sign-in error:', error);
      throw error;
    }
  },

  // Sign in with email/password
  async signInWithEmail(email, password) {
    try {
      const result = await this.auth.signInWithEmailAndPassword(email, password);
      console.log('Signed in as:', result.user.email);
      return result.user;
    } catch (error) {
      // If user doesn't exist, create account
      if (error.code === 'auth/user-not-found') {
        const result = await this.auth.createUserWithEmailAndPassword(email, password);
        console.log('Account created:', result.user.email);
        return result.user;
      }
      console.error('Email sign-in error:', error);
      throw error;
    }
  },

  // Sign out
  async signOut() {
    try {
      await this.auth.signOut();
      console.log('Signed out');
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  },

  // Get user's books collection reference
  getUserBooksRef() {
    if (!this.user) return null;
    return this.db.collection('users').doc(this.user.uid).collection('books');
  },

  // Save a book to cloud
  async saveBook(book) {
    const ref = this.getUserBooksRef();
    if (!ref) return;

    try {
      // Don't store large images in Firestore (limit is 1MB per doc)
      const cloudBook = { ...book };
      if (cloudBook.coverImage && cloudBook.coverImage.length > 500000) {
        cloudBook.coverImage = ''; // Skip very large images
      }
      if (cloudBook.spineImage && cloudBook.spineImage.length > 500000) {
        cloudBook.spineImage = '';
      }

      await ref.doc(book.id).set({
        ...cloudBook,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log('Book saved to cloud:', book.title);
    } catch (error) {
      console.error('Save book error:', error);
    }
  },

  // Delete a book from cloud
  async deleteBook(bookId) {
    const ref = this.getUserBooksRef();
    if (!ref) return;

    try {
      await ref.doc(bookId).delete();
      console.log('Book deleted from cloud:', bookId);
    } catch (error) {
      console.error('Delete book error:', error);
    }
  },

  // Sync all local books to cloud
  async syncToCloud() {
    const ref = this.getUserBooksRef();
    if (!ref) return;

    try {
      const localBooks = await db.getAllBooks();
      const batch = this.db.batch();

      for (const book of localBooks) {
        const cloudBook = { ...book };
        // Truncate large images for Firestore
        if (cloudBook.coverImage && cloudBook.coverImage.length > 500000) {
          cloudBook.coverImage = '';
        }
        if (cloudBook.spineImage && cloudBook.spineImage.length > 500000) {
          cloudBook.spineImage = '';
        }
        
        const docRef = ref.doc(book.id);
        batch.set(docRef, {
          ...cloudBook,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      await batch.commit();
      console.log(`Synced ${localBooks.length} books to cloud`);
    } catch (error) {
      console.error('Sync to cloud error:', error);
    }
  },

  // Sync from cloud to local
  async syncFromCloud() {
    const ref = this.getUserBooksRef();
    if (!ref) return;

    try {
      const snapshot = await ref.get();
      const cloudBooks = [];
      
      snapshot.forEach(doc => {
        cloudBooks.push({ id: doc.id, ...doc.data() });
      });

      if (cloudBooks.length === 0) {
        // No cloud data, push local data to cloud
        await this.syncToCloud();
        return;
      }

      // Merge cloud books with local books
      const localBooks = await db.getAllBooks();
      const localIds = new Set(localBooks.map(b => b.id));
      
      let imported = 0;
      for (const cloudBook of cloudBooks) {
        if (!localIds.has(cloudBook.id)) {
          // New book from cloud, add to local
          delete cloudBook.updatedAt; // Remove Firestore timestamp
          await db.addBook(cloudBook);
          imported++;
        }
      }

      if (imported > 0) {
        console.log(`Imported ${imported} books from cloud`);
        if (typeof renderBookshelf === 'function') {
          await renderBookshelf();
        }
      }

      // Push any local books that aren't in cloud
      await this.syncToCloud();
      
    } catch (error) {
      console.error('Sync from cloud error:', error);
    }
  },

  // Update UI based on auth state
  updateUI() {
    const loginBtn = document.getElementById('btn-login');
    const logoutBtn = document.getElementById('btn-logout');
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');

    if (this.user) {
      if (loginBtn) loginBtn.classList.add('hidden');
      if (logoutBtn) logoutBtn.classList.remove('hidden');
      if (userInfo) userInfo.classList.remove('hidden');
      if (userName) userName.textContent = this.user.displayName || this.user.email;
    } else {
      if (loginBtn) loginBtn.classList.remove('hidden');
      if (logoutBtn) logoutBtn.classList.add('hidden');
      if (userInfo) userInfo.classList.add('hidden');
    }
  },

  // Check if user is logged in
  isLoggedIn() {
    return !!this.user;
  },

  // Get current user
  getCurrentUser() {
    return this.user;
  }
};
