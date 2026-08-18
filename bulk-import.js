// Bulk Import Module
// Imports books from Obsidian vault with auto-cover fetching

const BulkImport = {
  books: [],
  isRunning: false,
  imported: 0,
  failed: 0,
  total: 0,

  // Load books from JSON file
  async loadFromFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          this.books = JSON.parse(e.target.result);
          resolve(this.books);
        } catch (err) {
          console.error('JSON parse error:', err);
          resolve([]);
        }
      };
      reader.readAsText(file);
    });
  },

  // Fetch cover for a book by title + author
  async fetchCover(title, author) {
    try {
      // Try Open Library search
      const query = encodeURIComponent(`${title} ${author}`);
      const response = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=1`);
      const data = await response.json();
      
      if (data.docs && data.docs.length > 0) {
        const doc = data.docs[0];
        
        // Get cover from Open Library covers API
        if (doc.isbn && doc.isbn.length > 0) {
          return `https://covers.openlibrary.org/b/isbn/${doc.isbn[0]}-L.jpg`;
        }
        if (doc.cover_i) {
          return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
        }
      }
      
      // Fallback: try direct title search
      const titleQuery = encodeURIComponent(title);
      const response2 = await fetch(`https://openlibrary.org/search.json?title=${titleQuery}&limit=1`);
      const data2 = await response2.json();
      
      if (data2.docs && data2.docs.length > 0) {
        const doc = data2.docs[0];
        if (doc.isbn && doc.isbn.length > 0) {
          return `https://covers.openlibrary.org/b/isbn/${doc.isbn[0]}-L.jpg`;
        }
        if (doc.cover_i) {
          return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
        }
      }
      
      return null;
    } catch (err) {
      console.error('Cover fetch error:', err);
      return null;
    }
  },

  // Download cover as data URL for offline use
  async downloadCoverAsDataURL(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      return null;
    }
  },

  // Import all books
  async importAll(progressCallback) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.imported = 0;
    this.failed = 0;
    this.total = this.books.length;
    
    for (let i = 0; i < this.books.length; i++) {
      const bookData = this.books[i];
      
      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: this.total,
          title: bookData.title,
          imported: this.imported,
          failed: this.failed
        });
      }
      
      try {
        // Check if book already exists (by title)
        const existing = await db.getAllBooks();
        const found = existing.find(b => b.title === bookData.title);
        if (found) {
          console.log('Already exists:', bookData.title);
          continue;
        }
        
        // Fetch cover
        let coverImage = null;
        const coverUrl = await this.fetchCover(bookData.title, bookData.author);
        if (coverUrl) {
          coverImage = await this.downloadCoverAsDataURL(coverUrl);
        }
        
        // Generate color from title
        const colors = [
          '#8B4513', '#A0522D', '#6B3A2A', '#556B2F', '#2F4F4F',
          '#4A2545', '#1B3A4B', '#3D1C02', '#614051', '#5D3954',
          '#2C3E50', '#1A5276', '#7B241C', '#6C3483', '#1E8449',
          '#B7950B', '#884EA0', '#2E86C1', '#28B463', '#D4AC0D'
        ];
        let hash = 0;
        for (let c = 0; c < (bookData.title || '').length; c++) {
          hash = bookData.title.charCodeAt(c) + ((hash << 5) - hash);
        }
        const color = colors[Math.abs(hash) % colors.length];
        
        // Create book object
        const book = {
          title: bookData.title,
          author: bookData.author,
          status: bookData.status || 'tbr',
          genre: bookData.genre || null,
          saga: bookData.saga || null,
          saga_order: bookData.saga_order || null,
          color: color,
          coverImage: coverImage,
          orientation: coverImage ? 'cover' : 'spine',
          shelf: 'default'
        };
        
        const saved = await db.addBook(book);
        
        // Sync to Firebase if logged in
        if (FirebaseSync.isLoggedIn() && saved) {
          FirebaseSync.saveBook(saved);
        }
        
        this.imported++;
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 300));
        
      } catch (err) {
        console.error('Import error for', bookData.title, err);
        this.failed++;
      }
    }
    
    this.isRunning = false;
    
    if (progressCallback) {
      progressCallback({
        current: this.total,
        total: this.total,
        title: 'Completado',
        imported: this.imported,
        failed: this.failed,
        done: true
      });
    }
    
    return { imported: this.imported, failed: this.failed };
  }
};
