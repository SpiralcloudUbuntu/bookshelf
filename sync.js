// Obsidian Sync Module
// Supports: Obsidian Local REST API plugin (auto) + manual export/import

const ObsidianSync = {
  config: {
    enabled: false,
    vaultPath: '',
    apiUrl: 'http://127.0.0.1:27123',
    apiKey: '',
    autoSync: false,
    syncInterval: 30000, // 30 seconds
  },
  
  _syncTimer: null,
  _lastSync: null,

  // Initialize from localStorage
  init() {
    const saved = localStorage.getItem('obsidian-sync-config');
    if (saved) {
      try {
        Object.assign(this.config, JSON.parse(saved));
      } catch (e) {}
    }
    if (this.config.enabled && this.config.autoSync) {
      this.startAutoSync();
    }
  },

  // Save config
  saveConfig() {
    localStorage.setItem('obsidian-sync-config', JSON.stringify(this.config));
  },

  // Test connection to Obsidian REST API
  async testConnection() {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }
      
      const response = await fetch(`${this.config.apiUrl}/vault/`, { headers });
      
      if (response.ok) {
        const data = await response.json();
        return { success: true, files: data.files?.length || 0 };
      }
      return { success: false, error: `HTTP ${response.status}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // Read a file from Obsidian vault
  async readFile(path) {
    const headers = {};
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    
    const response = await fetch(`${this.config.apiKey}/vault/${encodeURIComponent(path)}`, { headers });
    
    if (response.ok) {
      return await response.text();
    }
    return null;
  },

  // Write a file to Obsidian vault
  async writeFile(path, content) {
    const headers = { 'Content-Type': 'text/markdown' };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    
    const response = await fetch(`${this.config.apiUrl}/vault/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers,
      body: content
    });
    
    return response.ok;
  },

  // Search for files matching a pattern
  async searchFiles(query) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    
    const response = await fetch(`${this.config.apiUrl}/search/simple/?query=${encodeURIComponent(query)}&contextLength=0`, { headers });
    
    if (response.ok) {
      return await response.json();
    }
    return [];
  },

  // Convert book to Obsidian markdown
  bookToMarkdown(book) {
    let md = `---\ntitulo: ${book.title || ''}\n`;
    if (book.author) md += `autor: ${book.author}\n`;
    md += `estado: ${book.status || 'read'}\n`;
    if (book.isbn) md += `isbn: ${book.isbn}\n`;
    if (book.orientation) md += `orientacion: ${book.orientation}\n`;
    if (book.color) md += `color_lomo: ${book.color}\n`;
    md += `fecha_agregado: ${book.createdAt || new Date().toISOString()}\n`;
    md += `---\n\n`;
    md += `# ${book.title || 'Sin título'}\n\n`;
    if (book.author) md += `**Autor:** ${book.author}\n\n`;
    if (book.isbn) md += `**ISBN:** ${book.isbn}\n\n`;
    
    const statusLabels = { read: '✅ Leído', reading: '📖 Leyendo', tbr: '📋 Por leer' };
    md += `**Estado:** ${statusLabels[book.status] || book.status}\n\n`;
    
    return md;
  },

  // Parse Obsidian markdown back to book data
  markdownToBook(md, filename) {
    const book = {};
    
    // Parse YAML frontmatter
    const yamlMatch = md.match(/^---\n([\s\S]*?)\n---/);
    if (yamlMatch) {
      const yaml = yamlMatch[1];
      const titleMatch = yaml.match(/titulo:\s*(.+)/);
      const authorMatch = yaml.match(/autor:\s*(.+)/);
      const statusMatch = yaml.match(/estado:\s*(.+)/);
      const isbnMatch = yaml.match(/isbn:\s*(.+)/);
      const orientMatch = yaml.match(/orientacion:\s*(.+)/);
      const colorMatch = yaml.match(/color_lomo:\s*(.+)/);
      
      if (titleMatch) book.title = titleMatch[1].trim();
      if (authorMatch) book.author = authorMatch[1].trim();
      if (statusMatch) book.status = statusMatch[1].trim();
      if (isbnMatch) book.isbn = isbnMatch[1].trim();
      if (orientMatch) book.orientation = orientMatch[1].trim();
      if (colorMatch) book.color = colorMatch[1].trim();
    }
    
    // Fallback: use filename as title
    if (!book.title) {
      book.title = filename.replace('.md', '').replace(/_/g, ' ');
    }
    
    return book;
  },

  // Export all books to Obsidian (app → Obsidian)
  async exportToObsidian(books) {
    if (!this.config.enabled) return { success: false, error: 'Sync no configurado' };
    
    const results = { exported: 0, errors: 0 };
    const basePath = this.config.vaultPath || 'Libros/Estanteria';
    
    for (const book of books) {
      try {
        const filename = `${basePath}/${(book.title || 'Sin título').replace(/[\/\\:*?"<>|]/g, '_')}.md`;
        const content = this.bookToMarkdown(book);
        
        if (this.config.apiUrl && this.config.apiKey) {
          // Use REST API
          const ok = await this.writeFile(filename, content);
          if (ok) results.exported++;
          else results.errors++;
        } else {
          // Generate for manual download
          this.downloadFile(filename, content);
          results.exported++;
        }
      } catch (e) {
        results.errors++;
      }
    }
    
    this._lastSync = new Date();
    return results;
  },

  // Import books from Obsidian (Obsidian → app)
  async importFromObsidian() {
    if (!this.config.enabled) return { success: false, error: 'Sync no configurado' };
    
    const basePath = this.config.vaultPath || 'Libros/Estanteria';
    const imported = [];
    
    try {
      if (this.config.apiUrl && this.config.apiKey) {
        // Use REST API to list files
        const files = await this.searchFiles(basePath);
        
        for (const file of files) {
          if (file.filename?.endsWith('.md')) {
            const content = await this.readFile(file.filename);
            if (content) {
              const book = this.markdownToBook(content, file.filename);
              if (book.title) imported.push(book);
            }
          }
        }
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
    
    this._lastSync = new Date();
    return { success: true, books: imported };
  },

  // Generate markdown files for manual download (export all as zip-like)
  generateExport(books) {
    const basePath = this.config.vaultPath || 'Libros/Estanteria';
    const files = [];
    
    for (const book of books) {
      const filename = `${(book.title || 'Sin título').replace(/[\/\\:*?"<>|]/g, '_')}.md`;
      const content = this.bookToMarkdown(book);
      files.push({ path: `${basePath}/${filename}`, content });
    }
    
    return files;
  },

  // Download a single file
  downloadFile(path, content) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Download all books as individual .md files (zip would need JSZip)
  async downloadAll(books) {
    const files = this.generateExport(books);
    
    if (files.length === 1) {
      this.downloadFile(files[0].path, files[0].content);
      return;
    }
    
    // For multiple files, download one by one with a small delay
    for (let i = 0; i < files.length; i++) {
      this.downloadFile(files[i].path, files[i].content);
      if (i < files.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  },

  // Import from file input
  async importFromFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        const book = this.markdownToBook(content, file.name);
        resolve(book);
      };
      reader.readAsText(file);
    });
  },

  // Auto sync
  startAutoSync() {
    if (this._syncTimer) clearInterval(this._syncTimer);
    this._syncTimer = setInterval(async () => {
      if (this.config.enabled && this.config.autoSync) {
        const books = await db.getAllBooks();
        await this.exportToObsidian(books);
      }
    }, this.config.syncInterval);
  },

  stopAutoSync() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }
  }
};
