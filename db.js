// IndexedDB wrapper for bookshelf storage
const DB_NAME = 'BookshelfDB';
const DB_VERSION = 1;
const STORE_NAME = 'books';

class BookDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('shelf', 'shelf', { unique: false });
          store.createIndex('order', 'order', { unique: false });
        }
      };
      
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };
      
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async addBook(book) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      // Get max order for the shelf
      const index = store.index('shelf');
      const range = IDBKeyRange.only(book.shelf || 'default');
      const countReq = index.count(range);
      
      countReq.onsuccess = () => {
        book.id = book.id || Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        book.order = countReq.result;
        book.createdAt = new Date().toISOString();
        
        const addReq = store.put(book);
        addReq.onsuccess = () => resolve(book);
        addReq.onerror = (e) => reject(e.target.error);
      };
    });
  }

  async updateBook(book) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(book);
      req.onsuccess = () => resolve(book);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteBook(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getBook(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllBooks() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const books = req.result.sort((a, b) => (a.order || 0) - (b.order || 0));
        resolve(books);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getBooksByStatus(status) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('status');
      const req = index.getAll(status);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async updateOrder(books) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      books.forEach((book, i) => {
        book.order = i;
        store.put(book);
      });
      
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async exportToMarkdown() {
    const books = await this.getAllBooks();
    const read = books.filter(b => b.status === 'read');
    const reading = books.filter(b => b.status === 'reading');
    const tbr = books.filter(b => b.status === 'tbr');
    
    let md = '# Mi Estantería\n\n';
    
    if (read.length) {
      md += '## Leídos\n\n';
      read.forEach(b => md += `- ${b.title}${b.author ? ` — ${b.author}` : ''}\n`);
      md += '\n';
    }
    
    if (reading.length) {
      md += '## Leyendo\n\n';
      reading.forEach(b => md += `- ${b.title}${b.author ? ` — ${b.author}` : ''}\n`);
      md += '\n';
    }
    
    if (tbr.length) {
      md += '## Por leer\n\n';
      tbr.forEach(b => md += `- ${b.title}${b.author ? ` — ${b.author}` : ''}\n`);
      md += '\n';
    }
    
    return md;
  }
}

// Global instance
const db = new BookDB();
