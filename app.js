// Main application
const BOOKS_PER_SHELF = 12;
let currentFilter = 'all';
let currentSearch = '';
let currentSort = 'added';
let draggedBook = null;
let draggedElement = null;

// Init
let html5QrCode = null;

async function init() {
  await db.init();
  AppSettings.init();
  FirebaseSync.init();
  renderBookshelf();
  setupEventListeners();
}

// Login modal
function showLoginModal() {
  document.getElementById('modal-login').classList.remove('hidden');
}

function hideLoginModal() {
  document.getElementById('modal-login').classList.add('hidden');
}

async function handleGoogleLogin() {
  try {
    await FirebaseSync.signInWithGoogle();
    hideLoginModal();
  } catch (error) {
    alert('Error al iniciar sesión: ' + error.message);
  }
}

async function handleEmailLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  try {
    await FirebaseSync.signInWithEmail(email, password);
    hideLoginModal();
  } catch (error) {
    alert('Error al iniciar sesión: ' + error.message);
  }
}

async function handleLogout() {
  if (confirm('¿Cerrar sesión? Tus libros seguirán guardados en este dispositivo.')) {
    await FirebaseSync.signOut();
  }
}

// Render the entire bookshelf
async function renderBookshelf() {
  const bookshelf = document.getElementById('bookshelf');
  const emptyState = document.getElementById('empty-state');
  
  let books;
  if (currentFilter === 'all') {
    books = await db.getAllBooks();
  } else {
    books = await db.getBooksByStatus(currentFilter);
  }
  
  // Apply search filter
  if (currentSearch.trim()) {
    const query = currentSearch.toLowerCase().trim();
    books = books.filter(book => {
      const title = (book.title || '').toLowerCase();
      const author = (book.author || '').toLowerCase();
      const isbn = (book.isbn || '').toLowerCase();
      return title.includes(query) || author.includes(query) || isbn.includes(query);
    });
  }
  
  // Apply sorting
  books = sortBooks(books, currentSort);
  
  if (books.length === 0) {
    bookshelf.innerHTML = '';
    if (currentSearch.trim()) {
      emptyState.innerHTML = `<p>No se encontraron libros para "<strong>${currentSearch}</strong>"</p>`;
    } else {
      emptyState.innerHTML = `<p>Tu estantería está vacía</p><button id="btn-add-empty" class="btn-primary">Añadir tu primer libro</button>`;
      document.getElementById('btn-add-empty')?.addEventListener('click', openAddModal);
    }
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';
  
  // Split books into shelves using settings
  const booksPerShelf = AppSettings.booksPerShelf || 12;
  const shelves = [];
  for (let i = 0; i < books.length; i += booksPerShelf) {
    shelves.push(books.slice(i, i + booksPerShelf));
  }
  
  const theme = AppSettings.themes[AppSettings.theme] || AppSettings.themes['dark-wood'];
  
  bookshelf.innerHTML = shelves.map((shelfBooks, shelfIndex) => {
    const isLastShelf = shelfIndex === shelves.length - 1;
    let decorations = '';
    
    if (AppSettings.showPlants) {
      decorations += `<span class="shelf-decoration plant-left">🪴</span>`;
      if (isLastShelf) {
        decorations += `<span class="shelf-decoration plant-right">🌿</span>`;
      }
    }
    
    if (AppSettings.showBookends && isLastShelf) {
      decorations += `<span class="shelf-decoration bookend">📚</span>`;
    }
    
    return `
      <div class="shelf" data-shelf="${shelfIndex}" style="background: ${theme.shelfBg}; border-bottom: 4px solid ${theme.shelfEdge}; box-shadow: 0 4px 8px rgba(0,0,0,0.5);">
        <span class="shelf-label">Estantería ${shelfIndex + 1}</span>
        ${decorations}
        ${shelfBooks.map(book => renderBook(book)).join('')}
      </div>
    `;
  }).join('');
  
  // Setup drag and drop on new elements
  setupDragAndDrop();
}

// Render a single book element
function renderBook(book) {
  if (book.orientation === 'cover') {
    return renderBookCover(book);
  }
  return renderBookSpine(book);
}

function renderBookSpine(book) {
  const width = Math.max(30, Math.min(55, (book.title || '').length * 2.5 + 15));
  const hasSpineImage = book.spineImage;
  const hasCoverImage = book.coverImage;
  
  let bgStyle = '';
  if (hasSpineImage) {
    bgStyle = `background-image: url('${book.spineImage}')`;
  } else if (book.color) {
    bgStyle = `background: ${book.color}`;
  } else {
    bgStyle = `background: ${generateBookColor(book.title)}`;
  }
  
  return `
    <div class="book-spine" 
         data-id="${book.id}" 
         data-status="${book.status || 'read'}"
         style="width: ${width}px; min-width: ${width}px; ${bgStyle}"
         draggable="true">
      ${!hasSpineImage ? `<span class="spine-text">${escapeHtml(book.title || '')}</span>` : ''}
      <div class="book-info">
        <div class="book-title">${escapeHtml(book.title || '')}</div>
        ${book.author ? `<div class="book-author">${escapeHtml(book.author)}</div>` : ''}
        <div class="book-actions">
          <button class="btn-toggle-view" onclick="toggleView('${book.id}')">🖼️</button>
          <button class="btn-edit" onclick="editBook('${book.id}')">✏️</button>
          <button class="btn-delete" onclick="deleteBook('${book.id}')">🗑️</button>
        </div>
      </div>
    </div>
  `;
}

function renderBookCover(book) {
  const hasCoverImage = book.coverImage;
  
  let coverContent;
  if (hasCoverImage) {
    coverContent = `<img class="cover-image" src="${book.coverImage}" alt="${escapeHtml(book.title)}" loading="lazy">`;
  } else {
    const color = book.color || generateBookColor(book.title);
    coverContent = `<div class="cover-placeholder" style="background: ${color}">${escapeHtml(book.title || '')}</div>`;
  }
  
  return `
    <div class="book-cover" 
         data-id="${book.id}" 
         data-status="${book.status || 'read'}"
         draggable="true">
      ${coverContent}
      <div class="book-info">
        <div class="book-title">${escapeHtml(book.title || '')}</div>
        ${book.author ? `<div class="book-author">${escapeHtml(book.author)}</div>` : ''}
        <div class="book-actions">
          <button class="btn-toggle-view" onclick="toggleView('${book.id}')">📏</button>
          <button class="btn-edit" onclick="editBook('${book.id}')">✏️</button>
          <button class="btn-delete" onclick="deleteBook('${book.id}')">🗑️</button>
        </div>
      </div>
    </div>
  `;
}

// Setup event listeners
function setupEventListeners() {
  // Add book buttons
  document.getElementById('btn-add').addEventListener('click', openAddModal);
  document.getElementById('btn-add-empty').addEventListener('click', openAddModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel').addEventListener('click', closeModal);
  
  // Form submission
  document.getElementById('form-add-book').addEventListener('submit', handleAddBook);
  
  // Filter button
  document.getElementById('btn-filter').addEventListener('click', cycleFilter);
  
  // Sort button
  document.getElementById('btn-sort').addEventListener('click', cycleSort);
  
  // Search
  document.getElementById('btn-search').addEventListener('click', toggleSearch);
  document.getElementById('search-input').addEventListener('input', handleSearch);
  document.getElementById('search-clear').addEventListener('click', clearSearch);
  
  // Scan ISBN button
  document.getElementById('btn-scan-isbn').addEventListener('click', openScanner);
  document.getElementById('scanner-close').addEventListener('click', closeScanner);
  document.getElementById('btn-manual-isbn').addEventListener('click', manualISBNSearch);
  document.getElementById('scanner-manual-isbn').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') manualISBNSearch();
  });
  
  // Camera buttons
  document.getElementById('btn-capture-spine').addEventListener('click', () => openCamera('spine'));
  document.getElementById('btn-upload-spine').addEventListener('click', () => document.getElementById('book-spine-file').click());
  document.getElementById('camera-close').addEventListener('click', closeCamera);
  document.getElementById('btn-capture').addEventListener('click', capturePhoto);
  document.getElementById('btn-recapture').addEventListener('click', recapture);
  document.getElementById('btn-crop-confirm').addEventListener('click', confirmCrop);
  
  // Status buttons
  document.querySelectorAll('.btn-status').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-status').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  // Orientation buttons
  document.querySelectorAll('.btn-orientation').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-orientation').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  
  // Cover image preview
  document.getElementById('book-cover-url').addEventListener('change', (e) => {
    if (e.target.value) {
      showPreview('cover-preview', e.target.value);
    }
  });
  
  document.getElementById('book-cover-file').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      readFileAsDataURL(e.target.files[0]).then(dataUrl => {
        showPreview('cover-preview', dataUrl);
      });
    }
  });
  
  document.getElementById('book-spine-file').addEventListener('change', (e) => {
    if (e.target.files[0]) {
      readFileAsDataURL(e.target.files[0]).then(dataUrl => {
        showPreview('spine-preview', dataUrl);
      });
    }
  });
  
  // Close modal on background click
  document.getElementById('modal-add').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-add')) {
      closeModal();
    }
  });
  
  document.getElementById('modal-scanner').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-scanner')) {
      closeScanner();
    }
  });
  
  document.getElementById('modal-camera').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-camera')) {
      closeCamera();
    }
  });
  
  // Sync button and modal
  document.getElementById('btn-sync').addEventListener('click', () => {
    document.getElementById('modal-sync').classList.remove('hidden');
    ObsidianSync.init();
    updateSyncUI();
  });
  document.getElementById('sync-close').addEventListener('click', () => {
    document.getElementById('modal-sync').classList.add('hidden');
  });
  document.getElementById('modal-sync').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-sync')) {
      document.getElementById('modal-sync').classList.add('hidden');
    }
  });
  
  // Login modal
  document.getElementById('login-close').addEventListener('click', hideLoginModal);
  document.getElementById('modal-login').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-login')) hideLoginModal();
  });
  document.getElementById('btn-google-login').addEventListener('click', handleGoogleLogin);
  document.getElementById('form-email-login').addEventListener('submit', handleEmailLogin);
  
  // Import from Obsidian
  document.getElementById('btn-import-obsidian').addEventListener('click', () => {
    document.getElementById('import-obsidian-file').click();
  });
  
  document.getElementById('import-obsidian-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const books = await BulkImport.loadFromFile(file);
    if (books.length === 0) {
      alert('No se encontraron libros en el archivo.');
      return;
    }
    
    if (!confirm(`Se importarán ${books.length} libros con portadas automáticas. ¿Continuar?`)) {
      return;
    }
    
    const progressEl = document.getElementById('import-progress');
    const barEl = document.getElementById('import-bar-fill');
    const statusEl = document.getElementById('import-status');
    
    progressEl.classList.remove('hidden');
    
    const result = await BulkImport.importAll((progress) => {
      const pct = Math.round((progress.current / progress.total) * 100);
      barEl.style.width = pct + '%';
      statusEl.textContent = progress.done 
        ? `✅ ${progress.imported} importados, ${progress.failed} fallos`
        : `${progress.current}/${progress.total} — ${progress.title}`;
    });
    
    await renderBookshelf();
    
    setTimeout(() => {
      progressEl.classList.add('hidden');
    }, 5000);
    
    e.target.value = '';
  });
  
  // Sync mode buttons
  document.querySelectorAll('.btn-sync-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-sync-mode').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      document.getElementById('sync-manual').classList.toggle('hidden', mode !== 'manual');
      document.getElementById('sync-api').classList.toggle('hidden', mode !== 'api');
    });
  });
  
  // Sync export/import
  document.getElementById('btn-sync-export').addEventListener('click', async () => {
    const books = await db.getAllBooks();
    await ObsidianSync.downloadAll(books);
    showSyncStatus('success', `📤 Exportados ${books.length} libros`);
  });
  
  document.getElementById('btn-sync-import').addEventListener('click', () => {
    document.getElementById('sync-import-file').click();
  });
  
  document.getElementById('sync-import-file').addEventListener('change', async (e) => {
    const files = e.target.files;
    let imported = 0;
    
    for (const file of files) {
      const book = await ObsidianSync.importFromFile(file);
      if (book && book.title) {
        await db.addBook(book);
        imported++;
      }
    }
    
    if (imported > 0) {
      showSyncStatus('success', `📥 Importados ${imported} libros`);
      await renderBookshelf();
    } else {
      showSyncStatus('error', 'No se encontraron libros válidos');
    }
    
    e.target.value = '';
  });
  
  // Sync API
  document.getElementById('btn-sync-test').addEventListener('click', async () => {
    ObsidianSync.config.apiUrl = document.getElementById('sync-api-url').value;
    ObsidianSync.config.apiKey = document.getElementById('sync-api-key').value;
    
    const result = await ObsidianSync.testConnection();
    if (result.success) {
      showSyncStatus('success', `✅ Conectado. ${result.files} archivos en el vault.`);
    } else {
      showSyncStatus('error', `❌ Error: ${result.error}`);
    }
  });
  
  document.getElementById('btn-sync-save').addEventListener('click', () => {
    ObsidianSync.config.enabled = true;
    ObsidianSync.config.apiUrl = document.getElementById('sync-api-url').value;
    ObsidianSync.config.apiKey = document.getElementById('sync-api-key').value;
    ObsidianSync.config.vaultPath = document.getElementById('sync-vault-path').value;
    ObsidianSync.config.autoSync = document.getElementById('sync-auto').checked;
    ObsidianSync.saveConfig();
    
    if (ObsidianSync.config.autoSync) {
      ObsidianSync.startAutoSync();
    } else {
      ObsidianSync.stopAutoSync();
    }
    
    showSyncStatus('success', '💾 Configuración guardada');
  });
  
  // Sync push/pull
  document.getElementById('btn-sync-push').addEventListener('click', async () => {
    const books = await db.getAllBooks();
    const result = await ObsidianSync.exportToObsidian(books);
    if (result.success !== false) {
      showSyncStatus('success', `📤 Sincronizados ${result.exported} libros con Obsidian`);
    } else {
      showSyncStatus('error', `❌ ${result.error || 'Error al sincronizar'}`);
    }
  });
  
  document.getElementById('btn-sync-pull').addEventListener('click', async () => {
    const result = await ObsidianSync.importFromObsidian();
    if (result.success) {
      let imported = 0;
      for (const book of result.books) {
        const existing = await db.getAllBooks();
        const found = existing.find(b => b.title === book.title);
        if (!found) {
          await db.addBook(book);
          imported++;
        }
      }
      showSyncStatus('success', `📥 Importados ${imported} libros nuevos de Obsidian`);
      await renderBookshelf();
    } else {
      showSyncStatus('error', `❌ ${result.error}`);
    }
  });
  
  // Settings
  document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('modal-settings').classList.remove('hidden');
    updateSettingsUI();
  });
  document.getElementById('settings-close').addEventListener('click', () => {
    document.getElementById('modal-settings').classList.add('hidden');
  });
  document.getElementById('modal-settings').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-settings')) {
      document.getElementById('modal-settings').classList.add('hidden');
    }
  });
  
  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppSettings.theme = btn.dataset.theme;
      AppSettings.save();
      AppSettings.apply();
      renderBookshelf();
    });
  });
  
  // Books per shelf slider
  document.getElementById('setting-books-per-shelf').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    document.getElementById('books-per-shelf-value').textContent = val;
    AppSettings.booksPerShelf = val;
    AppSettings.save();
    renderBookshelf();
  });
  
  // Background color buttons
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppSettings.bgColor = btn.dataset.bg;
      AppSettings.save();
      AppSettings.apply();
    });
  });
  
  // Decoration toggles
  document.getElementById('setting-show-plants').addEventListener('change', (e) => {
    AppSettings.showPlants = e.target.checked;
    AppSettings.save();
    renderBookshelf();
  });
  document.getElementById('setting-show-bookends').addEventListener('change', (e) => {
    AppSettings.showBookends = e.target.checked;
    AppSettings.save();
    renderBookshelf();
  });
  
  // Reset settings
  document.getElementById('btn-settings-reset').addEventListener('click', () => {
    AppSettings.theme = 'dark-wood';
    AppSettings.booksPerShelf = 12;
    AppSettings.bgColor = '#1a1a2e';
    AppSettings.showPlants = true;
    AppSettings.showBookends = false;
    AppSettings.save();
    AppSettings.apply();
    updateSettingsUI();
    renderBookshelf();
  });
}

// Drag and drop
function setupDragAndDrop() {
  const books = document.querySelectorAll('.book-spine, .book-cover');
  const shelves = document.querySelectorAll('.shelf');
  
  books.forEach(book => {
    book.addEventListener('dragstart', handleDragStart);
    book.addEventListener('dragend', handleDragEnd);
    book.addEventListener('touchstart', handleTouchStart, { passive: false });
    book.addEventListener('touchmove', handleTouchMove, { passive: false });
    book.addEventListener('touchend', handleTouchEnd);
  });
  
  shelves.forEach(shelf => {
    shelf.addEventListener('dragover', handleDragOver);
    shelf.addEventListener('drop', handleDrop);
    shelf.addEventListener('dragleave', handleDragLeave);
  });
}

function handleDragStart(e) {
  draggedBook = e.target.closest('.book-spine, .book-cover');
  draggedBook.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedBook.dataset.id);
}

function handleDragEnd(e) {
  if (draggedBook) {
    draggedBook.classList.remove('dragging');
  }
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  draggedBook = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  
  const shelf = e.target.closest('.shelf');
  if (!shelf) return;
  
  // Remove existing indicators
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  
  // Find insert position
  const afterElement = getDragAfterElement(shelf, e.clientX);
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  
  if (afterElement) {
    shelf.insertBefore(indicator, afterElement);
  } else {
    shelf.appendChild(indicator);
  }
}

function handleDragLeave(e) {
  const shelf = e.target.closest('.shelf');
  if (shelf) {
    shelf.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  }
}

async function handleDrop(e) {
  e.preventDefault();
  
  const shelf = e.target.closest('.shelf');
  if (!shelf || !draggedBook) return;
  
  const bookId = e.dataTransfer.getData('text/plain');
  const afterElement = getDragAfterElement(shelf, e.clientX);
  
  // Get all books in order
  const allBooks = await db.getAllBooks();
  const movedBook = allBooks.find(b => b.id === bookId);
  
  if (!movedBook) return;
  
  // Calculate new order
  const shelfIndex = parseInt(shelf.dataset.shelf);
  const booksInShelf = [...shelf.querySelectorAll('.book-spine, .book-cover')].map(el => el.dataset.id);
  
  // Insert at position
  if (afterElement) {
    const afterIndex = booksInShelf.indexOf(afterElement.dataset.id);
    booksInShelf.splice(afterIndex, 0, bookId);
  } else {
    booksInShelf.push(bookId);
  }
  
  // Update order in DB
  const updatedBooks = booksInShelf.map((id, i) => {
    const book = allBooks.find(b => b.id === id);
    if (book) {
      book.order = i;
      book.shelf = `shelf-${shelfIndex}`;
    }
    return book;
  }).filter(Boolean);
  
  await db.updateOrder(updatedBooks);
  await renderBookshelf();
}

function getDragAfterElement(shelf, x) {
  const draggableElements = [...shelf.querySelectorAll('.book-spine:not(.dragging), .book-cover:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Touch support for drag and drop
let touchStartX, touchStartY, touchStartTime;
let longPressTimer;

function handleTouchStart(e) {
  const bookEl = e.target.closest('.book-spine, .book-cover');
  if (!bookEl) return;
  
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  touchStartTime = Date.now();
  
  longPressTimer = setTimeout(() => {
    draggedBook = bookEl;
    draggedBook.classList.add('dragging');
    // Vibrate if available
    if (navigator.vibrate) navigator.vibrate(50);
  }, 500);
}

function handleTouchMove(e) {
  if (!draggedBook) {
    clearTimeout(longPressTimer);
    return;
  }
  
  e.preventDefault();
  
  const touch = e.touches[0];
  const shelf = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.shelf');
  
  if (shelf) {
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    const afterElement = getDragAfterElement(shelf, touch.clientX);
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';
    
    if (afterElement) {
      shelf.insertBefore(indicator, afterElement);
    } else {
      shelf.appendChild(indicator);
    }
  }
}

async function handleTouchEnd(e) {
  clearTimeout(longPressTimer);
  
  if (!draggedBook) return;
  
  const touch = e.changedTouches[0];
  const shelf = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.shelf');
  
  if (shelf) {
    const bookId = draggedBook.dataset.id;
    const afterElement = getDragAfterElement(shelf, touch.clientX);
    
    const allBooks = await db.getAllBooks();
    const booksInShelf = [...shelf.querySelectorAll('.book-spine, .book-cover')].map(el => el.dataset.id);
    
    if (afterElement) {
      const afterIndex = booksInShelf.indexOf(afterElement.dataset.id);
      booksInShelf.splice(afterIndex, 0, bookId);
    } else {
      booksInShelf.push(bookId);
    }
    
    const shelfIndex = parseInt(shelf.dataset.shelf);
    const updatedBooks = booksInShelf.map((id, i) => {
      const book = allBooks.find(b => b.id === id);
      if (book) {
        book.order = i;
        book.shelf = `shelf-${shelfIndex}`;
      }
      return book;
    }).filter(Boolean);
    
    await db.updateOrder(updatedBooks);
  }
  
  draggedBook.classList.remove('dragging');
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  draggedBook = null;
  
  await renderBookshelf();
}

// Modal functions
function openAddModal(skipReset) {
  document.getElementById('modal-add').classList.remove('hidden');
  
  if (!skipReset) {
    document.getElementById('form-add-book').reset();
    document.getElementById('cover-preview').innerHTML = '';
    document.getElementById('spine-preview').innerHTML = '';
    document.querySelectorAll('.btn-status').forEach(b => b.classList.remove('active'));
    document.querySelector('.btn-status[data-status="read"]').classList.add('active');
    document.querySelectorAll('.btn-orientation').forEach(b => b.classList.remove('active'));
    document.querySelector('.btn-orientation[data-orientation="spine"]').classList.add('active');
    
    // Reset editing state
    window._editingBookId = null;
    window._capturedSpineImage = null;
    window._capturedCoverImage = null;
    document.getElementById('modal-title').textContent = 'Añadir libro';
    document.querySelector('#form-add-book button[type="submit"]').textContent = 'Guardar';
  }
  
  document.getElementById('book-title').focus();
}

function closeModal() {
  document.getElementById('modal-add').classList.add('hidden');
}

// Add book handler
async function handleAddBook(e) {
  e.preventDefault();
  
  const title = document.getElementById('book-title').value.trim();
  const author = document.getElementById('book-author').value.trim();
  const isbn = document.getElementById('book-isbn').value.trim();
  const color = document.getElementById('book-color').value;
  const coverUrl = document.getElementById('book-cover-url').value.trim();
  const status = document.querySelector('.btn-status.active')?.dataset.status || 'read';
  const orientation = document.querySelector('.btn-orientation.active')?.dataset.orientation || 'spine';
  
  if (!title) return;
  
  // Get cover image
  let coverImage = coverUrl;
  const coverFile = document.getElementById('book-cover-file').files[0];
  if (coverFile) {
    coverImage = await readFileAsDataURL(coverFile);
  }
  if (window._capturedCoverImage) {
    coverImage = window._capturedCoverImage;
    window._capturedCoverImage = null;
  }
  
  // Get spine image
  let spineImage = null;
  const spineFile = document.getElementById('book-spine-file').files[0];
  if (spineFile) {
    spineImage = await readFileAsDataURL(spineFile);
  }
  if (window._capturedSpineImage) {
    spineImage = window._capturedSpineImage;
    window._capturedSpineImage = null;
  }
  
  // Check if we're editing
  if (window._editingBookId) {
    const existingBook = await db.getBook(window._editingBookId);
    if (existingBook) {
      existingBook.title = title;
      existingBook.author = author;
      existingBook.isbn = isbn;
      existingBook.color = color;
      existingBook.status = status;
      existingBook.orientation = orientation;
      if (coverImage) existingBook.coverImage = coverImage;
      if (spineImage) existingBook.spineImage = spineImage;
      
      // Metadata from scan
      const form = document.getElementById('form-add-book');
      if (form.dataset.publisher) existingBook.publisher = form.dataset.publisher;
      if (form.dataset.publishDate) existingBook.publishDate = form.dataset.publishDate;
      if (form.dataset.pages) existingBook.pages = form.dataset.pages;
      if (form.dataset.language) existingBook.language = form.dataset.language;
      if (form.dataset.genre) existingBook.genre = form.dataset.genre;
      if (form.dataset.description) existingBook.description = form.dataset.description;
      
      await db.updateBook(existingBook);
      window._editingBookId = null;
      
      // Sync to Firebase if logged in
      if (FirebaseSync.isLoggedIn()) {
        FirebaseSync.saveBook(existingBook);
      }
      
      closeModal();
      await renderBookshelf();
      return;
    }
  }
  
  // Create new book
  const form = document.getElementById('form-add-book');
  
  const book = {
    title,
    author,
    isbn,
    color,
    coverImage,
    spineImage,
    status,
    orientation,
    shelf: 'default',
    // Metadata from scan
    publisher: form.dataset.publisher || null,
    publishDate: form.dataset.publishDate || null,
    pages: form.dataset.pages || null,
    language: form.dataset.language || null,
    genre: form.dataset.genre || null,
    description: form.dataset.description || null
  };
  
  const savedBook = await db.addBook(book);
  
  // Sync to Firebase if logged in
  if (FirebaseSync.isLoggedIn() && savedBook) {
    FirebaseSync.saveBook(savedBook);
  }
  
  closeModal();
  await renderBookshelf();
}

// Toggle between spine and cover view
async function toggleView(id) {
  const book = await db.getBook(id);
  if (!book) return;
  
  book.orientation = book.orientation === 'spine' ? 'cover' : 'spine';
  await db.updateBook(book);
  await renderBookshelf();
}

// Edit book
async function editBook(id) {
  const book = await db.getBook(id);
  if (!book) return;
  
  // Open modal with book data
  openAddModal();
  
  // Change modal title
  document.getElementById('modal-title').textContent = 'Editar libro';
  
  // Fill all fields
  document.getElementById('book-title').value = book.title || '';
  document.getElementById('book-author').value = book.author || '';
  document.getElementById('book-color').value = book.color || '#8B4513';
  document.getElementById('book-isbn').value = book.isbn || '';
  document.getElementById('book-cover-url').value = book.coverImage || '';
  
  if (book.coverImage) {
    showPreview('cover-preview', book.coverImage);
  }
  
  // Load spine image
  if (book.spineImage) {
    document.getElementById('spine-preview').innerHTML = `<img src="${book.spineImage}" alt="Lomo">`;
    window._capturedSpineImage = book.spineImage;
  }
  
  // Set status
  document.querySelectorAll('.btn-status').forEach(b => b.classList.remove('active'));
  const statusBtn = document.querySelector(`.btn-status[data-status="${book.status || 'read'}"]`);
  if (statusBtn) statusBtn.classList.add('active');
  
  // Set orientation
  document.querySelectorAll('.btn-orientation').forEach(b => b.classList.remove('active'));
  const orientBtn = document.querySelector(`.btn-orientation[data-orientation="${book.orientation || 'spine'}"]`);
  if (orientBtn) orientBtn.classList.add('active');
  
  // Store the book ID for editing
  window._editingBookId = id;
  
  // Change submit button text
  document.querySelector('#form-add-book button[type="submit"]').textContent = 'Actualizar';
}

// Delete book
async function deleteBook(id) {
  if (confirm('¿Eliminar este libro de la estantería?')) {
    await db.deleteBook(id);
    
    // Sync to Firebase if logged in
    if (FirebaseSync.isLoggedIn()) {
      FirebaseSync.deleteBook(id);
    }
    
    await renderBookshelf();
  }
}

// Filter
function cycleFilter() {
  const filters = ['all', 'read', 'reading', 'tbr'];
  const labels = ['Todos', 'Leídos', 'Leyendo', 'Por leer'];
  const currentIndex = filters.indexOf(currentFilter);
  const nextIndex = (currentIndex + 1) % filters.length;
  
  currentFilter = filters[nextIndex];
  document.getElementById('btn-filter').textContent = labels[nextIndex];
  renderBookshelf();
}

// Sort
function sortBooks(books, sortBy) {
  const sorted = [...books];
  
  switch (sortBy) {
    case 'title-asc':
      return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    case 'title-desc':
      return sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    case 'author':
      return sorted.sort((a, b) => (a.author || '').localeCompare(b.author || ''));
    case 'added':
      return sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    case 'added-old':
      return sorted.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    default:
      return sorted;
  }
}

function cycleSort() {
  const sorts = ['added', 'added-old', 'title-asc', 'title-desc', 'author'];
  const labels = ['Recientes', 'Antiguos', 'A-Z', 'Z-A', 'Autor'];
  const currentIndex = sorts.indexOf(currentSort);
  const nextIndex = (currentIndex + 1) % sorts.length;
  
  currentSort = sorts[nextIndex];
  document.getElementById('btn-sort').textContent = '↕️ ' + labels[nextIndex];
  renderBookshelf();
}

// Search
function toggleSearch() {
  const searchBar = document.getElementById('search-bar');
  const searchInput = document.getElementById('search-input');
  
  if (searchBar.classList.contains('hidden')) {
    searchBar.classList.remove('hidden');
    searchInput.focus();
  } else {
    searchBar.classList.add('hidden');
    clearSearch();
  }
}

function handleSearch() {
  currentSearch = document.getElementById('search-input').value;
  renderBookshelf();
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  currentSearch = '';
  renderBookshelf();
}

// Helpers
function generateBookColor(title) {
  const colors = [
    '#8B4513', '#A0522D', '#6B3A2A', '#556B2F', '#2F4F4F',
    '#4A2545', '#1B3A4B', '#3D1C02', '#614051', '#5D3954',
    '#2C3E50', '#1A5276', '#7B241C', '#6C3483', '#1E8449',
    '#B7950B', '#884EA0', '#2E86C1', '#28B463', '#D4AC0D'
  ];
  
  let hash = 0;
  for (let i = 0; i < (title || '').length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function readFileAsDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function showPreview(elementId, src) {
  const el = document.getElementById(elementId);
  el.innerHTML = `<img src="${src}" alt="Preview">`;
}

// Scanner functions
function openScanner() {
  document.getElementById('modal-scanner').classList.remove('hidden');
  document.getElementById('scanner-result').classList.add('hidden');
  
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode('scanner-video');
  }
  
  html5QrCode.start(
    { facingMode: 'environment' },
    {
      fps: 10,
      qrbox: { width: 250, height: 150 },
      aspectRatio: 1.333
    },
    onScanSuccess,
    onScanFailure
  ).catch(err => {
    console.error('Camera error:', err);
    document.getElementById('scanner-result').classList.remove('hidden');
    document.getElementById('scanner-result-text').textContent = 'No se pudo acceder a la cámara. Usa el ISBN manual.';
  });
}

function closeScanner() {
  document.getElementById('modal-scanner').classList.add('hidden');
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().catch(err => console.error('Stop error:', err));
  }
}

function onScanSuccess(decodedText) {
  // Extract ISBN (remove any non-digit characters except X)
  const isbn = decodedText.replace(/[^0-9X]/gi, '');
  
  if (isbn.length >= 10) {
    // Close scanner (add modal stays open underneath)
    closeScanner();
    
    // Fill ISBN immediately
    document.getElementById('book-isbn').value = isbn;
    
    // Show loading overlay
    showLoading('Buscando ISBN: ' + isbn);
    
    // Fetch book data
    fetchBookByISBN(isbn).catch(err => {
      console.error('Fetch error:', err);
      hideLoading();
    });
  }
}

function onScanFailure(error) {
  // Ignore scan failures (normal when no code is in frame)
}

async function manualISBNSearch() {
  const isbn = document.getElementById('scanner-manual-isbn').value.trim().replace(/[^0-9X]/gi, '');
  
  if (isbn.length >= 10) {
    closeScanner();
    showLoading('Buscando ISBN: ' + isbn);
    await fetchBookByISBN(isbn);
  }
}

// Open Library API
async function fetchBookByISBN(isbn) {
  try {
    console.log('Fetching ISBN:', isbn);
    
    // Try Open Library first
    const olData = await fetchFromOpenLibrary(isbn);
    if (olData) {
      hideLoading();
      showMetadataPreview(olData, isbn);
      return;
    }
    
    // Fallback: Google Books
    const gData = await fetchFromGoogleBooks(isbn);
    if (gData) {
      hideLoading();
      showMetadataPreview(gData, isbn);
      return;
    }
    
    // Nothing found
    hideLoading();
    document.getElementById('book-isbn').value = isbn;
    console.log('No metadata found for ISBN:', isbn);
    
  } catch (error) {
    console.error('Fetch error:', error);
    hideLoading();
    document.getElementById('book-isbn').value = isbn;
  }
}

// Fetch from Open Library
async function fetchFromOpenLibrary(isbn) {
  try {
    const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    const data = await response.json();
    const bookKey = `ISBN:${isbn}`;
    
    if (!data[bookKey]) return null;
    
    const book = data[bookKey];
    
    // Get additional details from the work page
    let pages = null;
    let genres = [];
    let description = null;
    let publisher = null;
    let publishDate = null;
    let language = null;
    
    if (book.number_of_pages) pages = book.number_of_pages;
    if (book.publishers && book.publishers.length > 0) publisher = book.publishers[0].name || book.publishers[0];
    if (book.publish_date) publishDate = book.publish_date;
    if (book.subjects) genres = book.subjects.slice(0, 5).map(s => typeof s === 'string' ? s : s.name || '');
    
    // Try to get language
    if (book.languages && book.languages.length > 0) {
      const langKey = book.languages[0].key;
      language = langKey.split('/').pop();
    }
    
    // Cover URL
    let coverUrl = null;
    if (book.cover) {
      coverUrl = book.cover.large || book.cover.medium || book.cover.small;
    }
    if (!coverUrl) {
      coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    }
    
    return {
      title: book.title || null,
      author: book.authors ? book.authors.map(a => a.name).join(', ') : null,
      coverUrl,
      publisher,
      publishDate,
      pages,
      language,
      genres: genres.filter(g => g),
      description,
      isbn,
      source: 'Open Library'
    };
  } catch (e) {
    console.error('Open Library error:', e);
    return null;
  }
}

// Fetch from Google Books
async function fetchFromGoogleBooks(isbn) {
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) return null;
    
    const info = data.items[0].volumeInfo;
    
    return {
      title: info.title || null,
      author: info.authors ? info.authors.join(', ') : null,
      coverUrl: info.imageLinks ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail) : null,
      publisher: info.publisher || null,
      publishDate: info.publishedDate || null,
      pages: info.pageCount || null,
      language: info.language || null,
      genres: info.categories || [],
      description: info.description || null,
      isbn,
      source: 'Google Books'
    };
  } catch (e) {
    console.error('Google Books error:', e);
    return null;
  }
}

// Show metadata preview for user confirmation
function showMetadataPreview(meta, isbn) {
  // Fill form fields, but DON'T overwrite manually edited fields
  const form = document.getElementById('form-add-book');
  
  // Only fill empty fields (don't overwrite manual edits)
  const titleField = document.getElementById('book-title');
  if (!titleField.value.trim() && meta.title) titleField.value = meta.title;
  
  const authorField = document.getElementById('book-author');
  if (!authorField.value.trim() && meta.author) authorField.value = meta.author;
  
  const isbnField = document.getElementById('book-isbn');
  if (!isbnField.value.trim()) isbnField.value = isbn;
  
  // New fields - store in data attributes for later
  if (meta.publisher) form.dataset.publisher = meta.publisher;
  if (meta.publishDate) form.dataset.publishDate = meta.publishDate;
  if (meta.pages) form.dataset.pages = meta.pages;
  if (meta.language) form.dataset.language = meta.language;
  if (meta.genres && meta.genres.length > 0) form.dataset.genre = meta.genres[0];
  if (meta.description) form.dataset.description = meta.description;
  
  // Auto-download cover
  if (meta.coverUrl) {
    document.getElementById('book-cover-url').value = meta.coverUrl;
    showPreview('cover-preview', meta.coverUrl);
    
    // Download as data URL for offline
    fetch(meta.coverUrl)
      .then(r => r.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => {
          window._capturedCoverImage = reader.result;
          document.getElementById('book-cover-url').value = '';
          showPreview('cover-preview', reader.result);
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => console.log('Could not download cover'));
  }
  
  // Set orientation to cover if we have one
  if (meta.coverUrl) {
    document.querySelectorAll('.btn-orientation').forEach(b => b.classList.remove('active'));
    document.querySelector('.btn-orientation[data-orientation="cover"]').classList.add('active');
  }
  
  // Show metadata source
  const sourceEl = document.getElementById('metadata-source');
  if (sourceEl) sourceEl.textContent = `Datos de: ${meta.source}`;
}

async function fetchBookByISBNAlternative(isbn) {
  try {
    const response = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
    
    if (response.ok) {
      const data = await response.json();
      
      hideLoading();
      document.getElementById('book-title').value = data.title || '';
      document.getElementById('book-isbn').value = isbn;
      
      // Try to get author
      if (data.authors && data.authors.length > 0) {
        const authorKey = data.authors[0].key;
        const authorResp = await fetch(`https://openlibrary.org${authorKey}.json`);
        if (authorResp.ok) {
          const authorData = await authorResp.json();
          document.getElementById('book-author').value = authorData.name || '';
        }
      }
      
      // Auto-download cover
      const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
      document.getElementById('book-cover-url').value = coverUrl;
      showPreview('cover-preview', coverUrl);
      
      try {
        const imgResponse = await fetch(coverUrl);
        if (imgResponse.ok) {
          const blob = await imgResponse.blob();
          const reader = new FileReader();
          reader.onload = () => {
            window._capturedCoverImage = reader.result;
            document.getElementById('book-cover-url').value = '';
            showPreview('cover-preview', reader.result);
          };
          reader.readAsDataURL(blob);
        }
      } catch (imgErr) {
        console.log('Could not download cover:', imgErr);
      }
      
      // Set orientation to cover
      document.querySelectorAll('.btn-orientation').forEach(b => b.classList.remove('active'));
      document.querySelector('.btn-orientation[data-orientation="cover"]').classList.add('active');
      
    } else {
      throw new Error('Not found');
    }
  } catch (error) {
    console.error('Alternative fetch error:', error);
    hideLoading();
    document.getElementById('book-isbn').value = isbn;
  }
}

// Search by title (from Open Library)
async function searchBookByTitle(title) {
  try {
    const response = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=5`);
    const data = await response.json();
    
    if (data.docs && data.docs.length > 0) {
      const book = data.docs[0];
      
      document.getElementById('book-title').value = book.title || '';
      document.getElementById('book-author').value = book.author_name ? book.author_name.join(', ') : '';
      
      if (book.isbn && book.isbn.length > 0) {
        document.getElementById('book-isbn').value = book.isbn[0];
        const coverUrl = `https://covers.openlibrary.org/b/isbn/${book.isbn[0]}-L.jpg`;
        document.getElementById('book-cover-url').value = coverUrl;
        showPreview('cover-preview', coverUrl);
      }
      
      return book;
    }
  } catch (error) {
    console.error('Search error:', error);
  }
  return null;
}

// Loading modal
function showLoading(text) {
  document.getElementById('loading-text').textContent = text || 'Buscando...';
  document.getElementById('modal-loading').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('modal-loading').classList.add('hidden');
}

// Book detail sheet (tap on book)
let selectedBookId = null;

async function showBookDetail(bookId) {
  selectedBookId = bookId;
  
  const book = await db.getBook(bookId);
  if (!book) return;
  
  // Cover image
  const coverEl = document.getElementById('detail-cover');
  if (book.coverImage) {
    coverEl.innerHTML = `<img src="${book.coverImage}" alt="${book.title}">`;
  } else if (book.spineImage) {
    coverEl.innerHTML = `<img src="${book.spineImage}" alt="${book.title}">`;
  } else {
    const color = book.color || generateBookColor(book.title);
    coverEl.innerHTML = `<div class="detail-cover-placeholder" style="background:${color}; font-size:24px; color:white; padding:20px; text-align:center;">${book.title || ''}</div>`;
  }
  
  // Title & author
  document.getElementById('detail-title').textContent = book.title || 'Sin título';
  document.getElementById('detail-author').textContent = book.author || '';
  document.getElementById('detail-author').style.display = book.author ? '' : 'none';
  
  // Status badge
  const statusEl = document.getElementById('detail-status');
  const statusMap = {
    read: { label: '✅ Leído', class: 'status-read' },
    reading: { label: '📖 Leyendo', class: 'status-reading' },
    tbr: { label: '📋 Por leer', class: 'status-tbr' }
  };
  const status = statusMap[book.status] || statusMap.read;
  statusEl.className = `detail-status ${status.class}`;
  statusEl.textContent = status.label;
  
  // Status change button
  const nextStatus = { read: 'reading', reading: 'tbr', tbr: 'read' };
  const nextStatusInfo = {
    reading: { icon: '📖', text: 'Marcar leyendo' },
    tbr: { icon: '📋', text: 'Marcar por leer' },
    read: { icon: '✅', text: 'Marcar leído' }
  };
  const next = nextStatus[book.status || 'read'];
  document.getElementById('detail-status-icon').textContent = nextStatusInfo[next].icon;
  document.getElementById('detail-status-text').textContent = nextStatusInfo[next].text;
  
  // Toggle view button
  const isSpine = book.orientation === 'spine' || (!book.orientation && !book.coverImage);
  document.getElementById('detail-toggle-view').querySelector('span:last-child').textContent = 
    isSpine ? 'Ver portada' : 'Ver lomo';
  
  // Metadata
  const isbnRow = document.getElementById('detail-isbn-row');
  const isbnEl = document.getElementById('detail-isbn');
  if (book.isbn) {
    isbnEl.textContent = book.isbn;
    isbnRow.classList.remove('hidden');
  } else {
    isbnRow.classList.add('hidden');
  }
  
  const pagesRow = document.getElementById('detail-pages-row');
  const pagesEl = document.getElementById('detail-pages');
  if (book.pages) {
    pagesEl.textContent = book.pages;
    pagesRow.classList.remove('hidden');
  } else {
    pagesRow.classList.add('hidden');
  }
  
  // New metadata fields
  const publisherRow = document.getElementById('detail-publisher-row');
  const publisherEl = document.getElementById('detail-publisher');
  if (book.publisher) {
    publisherEl.textContent = book.publisher;
    publisherRow.classList.remove('hidden');
  } else {
    publisherRow.classList.add('hidden');
  }
  
  const languageRow = document.getElementById('detail-language-row');
  const languageEl = document.getElementById('detail-language');
  if (book.language) {
    const langNames = { spa: 'Español', eng: 'Inglés', fre: 'Francés', ger: 'Alemán', ita: 'Italiano', por: 'Portugués', jpn: 'Japonés' };
    languageEl.textContent = langNames[book.language] || book.language;
    languageRow.classList.remove('hidden');
  } else {
    languageRow.classList.add('hidden');
  }
  
  const genreRow = document.getElementById('detail-genre-row');
  const genreEl = document.getElementById('detail-genre');
  if (book.genre) {
    genreEl.textContent = book.genre;
    genreRow.classList.remove('hidden');
  } else {
    genreRow.classList.add('hidden');
  }
  
  const descriptionRow = document.getElementById('detail-description-row');
  const descriptionEl = document.getElementById('detail-description');
  if (book.description) {
    descriptionEl.textContent = book.description;
    descriptionRow.classList.remove('hidden');
  } else {
    descriptionRow.classList.add('hidden');
  }
  
  const addedEl = document.getElementById('detail-added');
  if (book.createdAt) {
    const d = new Date(book.createdAt);
    addedEl.textContent = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  } else {
    addedEl.textContent = 'Desconocido';
  }
  
  // Show detail sheet
  document.getElementById('book-detailsheet').classList.remove('hidden');
}

function hideBookDetail() {
  document.getElementById('book-detailsheet').classList.add('hidden');
  selectedBookId = null;
}

// Touch handler for books
let actionTouchStart = 0;
let actionTouchMoved = false;

document.addEventListener('touchstart', (e) => {
  const book = e.target.closest('.book-spine, .book-cover');
  if (book) {
    actionTouchStart = Date.now();
    actionTouchMoved = false;
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  actionTouchMoved = true;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  const book = e.target.closest('.book-spine, .book-cover');
  if (!book) return;
  
  const duration = Date.now() - actionTouchStart;
  
  // Quick tap = show detail sheet (not during drag)
  if (duration < 300 && !actionTouchMoved && !book.classList.contains('dragging')) {
    e.preventDefault();
    showBookDetail(book.dataset.id);
  }
});

// Mouse click handler for desktop
document.addEventListener('click', (e) => {
  if (e.target.closest('.book-actions')) return;
  if (e.target.closest('.detail-content')) return;
  if (e.target.closest('.action-sheet-content')) return;
  
  const book = e.target.closest('.book-spine, .book-cover');
  if (book) {
    showBookDetail(book.dataset.id);
  }
});

// Detail sheet button handlers
document.getElementById('detail-close').addEventListener('click', hideBookDetail);
document.getElementById('book-detailsheet').addEventListener('click', (e) => {
  if (e.target === document.getElementById('book-detailsheet')) hideBookDetail();
});

document.getElementById('detail-change-status').addEventListener('click', async () => {
  if (!selectedBookId) return;
  const book = await db.getBook(selectedBookId);
  if (!book) return;
  
  const nextStatus = { read: 'reading', reading: 'tbr', tbr: 'read' };
  book.status = nextStatus[book.status || 'read'];
  await db.updateBook(book);
  
  if (FirebaseSync.isLoggedIn()) FirebaseSync.saveBook(book);
  
  hideBookDetail();
  await renderBookshelf();
});

document.getElementById('detail-toggle-view').addEventListener('click', async () => {
  if (selectedBookId) {
    await toggleView(selectedBookId);
    hideBookDetail();
  }
});

document.getElementById('detail-edit').addEventListener('click', () => {
  if (selectedBookId) {
    hideBookDetail();
    editBook(selectedBookId);
  }
});

document.getElementById('detail-delete').addEventListener('click', () => {
  if (selectedBookId) {
    hideBookDetail();
    deleteBook(selectedBookId);
  }
});
const AppSettings = {
  theme: 'dark-wood',
  booksPerShelf: 12,
  bgColor: '#1a1a2e',
  showPlants: true,
  showBookends: false,
  
  themes: {
    'dark-wood': {
      shelfBg: 'linear-gradient(to bottom, #4a2c1a, #2c1810)',
      shelfEdge: '#1a0e08',
      shelfLight: '#4a2c1a'
    },
    'light-wood': {
      shelfBg: 'linear-gradient(to bottom, #c4a57b, #a0845c)',
      shelfEdge: '#8b7355',
      shelfLight: '#c4a57b'
    },
    'white': {
      shelfBg: 'linear-gradient(to bottom, #f5f5f5, #e0e0e0)',
      shelfEdge: '#ccc',
      shelfLight: '#f5f5f5'
    },
    'black': {
      shelfBg: 'linear-gradient(to bottom, #333, #1a1a1a)',
      shelfEdge: '#000',
      shelfLight: '#333'
    },
    'industrial': {
      shelfBg: 'linear-gradient(to bottom, #555, #3a3a3a)',
      shelfEdge: '#2a2a2a',
      shelfLight: '#555'
    },
    'vintage': {
      shelfBg: 'linear-gradient(to bottom, #6b4c3b, #4a3328)',
      shelfEdge: '#3a2518',
      shelfLight: '#6b4c3b'
    }
  },
  
  init() {
    const saved = localStorage.getItem('bookshelf-settings');
    if (saved) {
      try {
        Object.assign(this, JSON.parse(saved));
      } catch (e) {}
    }
    this.apply();
  },
  
  save() {
    localStorage.setItem('bookshelf-settings', JSON.stringify({
      theme: this.theme,
      booksPerShelf: this.booksPerShelf,
      bgColor: this.bgColor,
      showPlants: this.showPlants,
      showBookends: this.showBookends
    }));
  },
  
  apply() {
    // Apply background color
    document.body.style.background = this.bgColor;
    document.documentElement.style.setProperty('--bg', this.bgColor);
    
    // Apply shelf theme
    const theme = this.themes[this.theme];
    if (theme) {
      document.documentElement.style.setProperty('--shelf-bg', theme.shelfLight);
      document.documentElement.style.setProperty('--shelf-light', theme.shelfLight);
      document.documentElement.style.setProperty('--shelf-edge', theme.shelfEdge);
      
      document.querySelectorAll('.shelf::after').forEach(el => {
        el.style.background = theme.shelfBg;
      });
    }
    
    // Update books per shelf value
    const slider = document.getElementById('setting-books-per-shelf');
    if (slider) slider.value = this.booksPerShelf;
    const valueEl = document.getElementById('books-per-shelf-value');
    if (valueEl) valueEl.textContent = this.booksPerShelf;
  }
};

document.addEventListener('click', (e) => {
  // Ignore clicks on buttons inside the popup
  if (e.target.closest('.book-actions')) return;
  
  const book = e.target.closest('.book-spine, .book-cover');
  
  // Close all other popups
  document.querySelectorAll('.book-info').forEach(info => {
    if (!book || !book.contains(info)) {
      info.style.display = 'none';
    }
  });
  
  // Toggle this book's popup
  if (book) {
    const info = book.querySelector('.book-info');
    if (info) {
      info.style.display = info.style.display === 'block' ? 'none' : 'block';
    }
  }
});

// Camera and Crop
function updateSyncUI() {
  if (ObsidianSync.config.enabled) {
    document.getElementById('sync-api-url').value = ObsidianSync.config.apiUrl;
    document.getElementById('sync-api-key').value = ObsidianSync.config.apiKey;
    document.getElementById('sync-vault-path').value = ObsidianSync.config.vaultPath;
    document.getElementById('sync-auto').checked = ObsidianSync.config.autoSync;
  }
  if (ObsidianSync._lastSync) {
    document.getElementById('sync-last').textContent = `Última sync: ${ObsidianSync._lastSync.toLocaleString()}`;
  }
}

function updateSettingsUI() {
  // Theme
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === AppSettings.theme);
  });
  
  // Books per shelf
  document.getElementById('setting-books-per-shelf').value = AppSettings.booksPerShelf;
  document.getElementById('books-per-shelf-value').textContent = AppSettings.booksPerShelf;
  
  // Background color
  document.querySelectorAll('.color-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.bg === AppSettings.bgColor);
  });
  
  // Decorations
  document.getElementById('setting-show-plants').checked = AppSettings.showPlants;
  document.getElementById('setting-show-bookends').checked = AppSettings.showBookends;
}

function showSyncStatus(type, message) {
  const el = document.getElementById('sync-status');
  el.className = `sync-status ${type}`;
  el.textContent = message;
  setTimeout(() => { el.className = 'sync-status'; }, 5000);
}

let cameraStream = null;
let capturedImage = null;
let cropState = { x: 0, y: 0, w: 200, h: 300, dragging: false, resizing: null, startX: 0, startY: 0 };
let currentCaptureTarget = null; // 'spine' or 'cover'

function openCamera(target) {
  currentCaptureTarget = target;
  document.getElementById('modal-camera').classList.remove('hidden');
  document.getElementById('camera-title').textContent = target === 'spine' ? 'Fotografiar lomo' : 'Fotografiar portada';
  
  // Show video, hide crop
  document.getElementById('camera-video').classList.remove('hidden');
  document.getElementById('camera-canvas').classList.add('hidden');
  document.getElementById('crop-overlay').classList.add('hidden');
  document.getElementById('btn-capture').classList.remove('hidden');
  document.getElementById('btn-recapture').classList.add('hidden');
  document.getElementById('btn-crop-confirm').classList.add('hidden');
  document.querySelector('.camera-hint').textContent = target === 'spine' 
    ? 'Enmarca el lomo del libro y pulsa Capturar' 
    : 'Enmarca la portada del libro y pulsa Capturar';
  
  // Start camera
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
  }).then(stream => {
    cameraStream = stream;
    document.getElementById('camera-video').srcObject = stream;
  }).catch(err => {
    console.error('Camera error:', err);
    document.querySelector('.camera-hint').textContent = 'No se pudo acceder a la cámara. Usa subir imagen.';
  });
}

function closeCamera() {
  document.getElementById('modal-camera').classList.add('hidden');
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

function capturePhoto() {
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('camera-canvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  
  // Stop video
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  
  // Show crop tool
  video.classList.add('hidden');
  canvas.classList.add('hidden');
  
  const cropOverlay = document.getElementById('crop-overlay');
  const cropCanvas = document.getElementById('crop-canvas');
  const cropCtx = cropCanvas.getContext('2d');
  const container = document.getElementById('camera-container');
  
  // Scale image to fit container
  const containerWidth = container.offsetWidth;
  const containerHeight = container.offsetHeight || 400;
  const imgRatio = canvas.width / canvas.height;
  const containerRatio = containerWidth / containerHeight;
  
  let displayW, displayH;
  if (imgRatio > containerRatio) {
    displayW = containerWidth;
    displayH = containerWidth / imgRatio;
  } else {
    displayH = containerHeight;
    displayW = containerHeight * imgRatio;
  }
  
  cropCanvas.width = displayW;
  cropCanvas.height = displayH;
  cropCanvas.style.width = displayW + 'px';
  cropCanvas.style.height = displayH + 'px';
  cropCtx.drawImage(canvas, 0, 0, displayW, displayH);
  
  // Store original canvas for final crop
  window._originalCaptureCanvas = canvas;
  
  cropOverlay.classList.remove('hidden');
  
  // Set initial crop rect (centered)
  if (currentCaptureTarget === 'spine') {
    const cropW = displayW * 0.3;
    const cropH = displayH * 0.7;
    cropState = {
      x: (displayW - cropW) / 2,
      y: (displayH - cropH) / 2,
      w: cropW,
      h: cropH,
      dragging: false,
      resizing: null
    };
  } else {
    const cropW = displayW * 0.5;
    const cropH = displayH * 0.7;
    cropState = {
      x: (displayW - cropW) / 2,
      y: (displayH - cropH) / 2,
      w: cropW,
      h: cropH,
      dragging: false,
      resizing: null
    };
  }
  
  updateCropRect();
  setupCropDrag();
  
  // Toggle buttons
  document.getElementById('btn-capture').classList.add('hidden');
  document.getElementById('btn-recapture').classList.remove('hidden');
  document.getElementById('btn-crop-confirm').classList.remove('hidden');
  document.querySelector('.camera-hint').textContent = 'Ajusta el recorte al lomo y pulsa Usar recorte';
}

function updateCropRect() {
  const cropCanvas = document.getElementById('crop-canvas');
  const rect = document.getElementById('crop-rect');
  
  // Position relative to the canvas
  rect.style.left = cropState.x + 'px';
  rect.style.top = cropState.y + 'px';
  rect.style.width = cropState.w + 'px';
  rect.style.height = cropState.h + 'px';
}

function setupCropDrag() {
  const rect = document.getElementById('crop-rect');
  const cropCanvas = document.getElementById('crop-canvas');
  
  let startState = {};
  
  function getPos(e) {
    const touch = e.touches ? e.touches[0] : e;
    const canvasRect = cropCanvas.getBoundingClientRect();
    return {
      x: touch.clientX - canvasRect.left,
      y: touch.clientY - canvasRect.top
    };
  }
  
  function onStart(e) {
    e.preventDefault();
    const pos = getPos(e);
    const target = e.target;
    
    if (target.classList.contains('crop-handle')) {
      cropState.resizing = target.classList[1]; // crop-handle-tl etc
    } else {
      cropState.dragging = true;
    }
    
    cropState.startX = pos.x;
    cropState.startY = pos.y;
    startState = { x: cropState.x, y: cropState.y, w: cropState.w, h: cropState.h };
  }
  
  function onMove(e) {
    e.preventDefault();
    if (!cropState.dragging && !cropState.resizing) return;
    
    const pos = getPos(e);
    const dx = pos.x - cropState.startX;
    const dy = pos.y - cropState.startY;
    
    if (cropState.dragging) {
      cropState.x = Math.max(0, Math.min(cropCanvas.width - startState.w, startState.x + dx));
      cropState.y = Math.max(0, Math.min(cropCanvas.height - startState.h, startState.y + dy));
    } else if (cropState.resizing) {
      const minSize = 50;
      
      if (cropState.resizing.includes('br')) {
        cropState.w = Math.max(minSize, startState.w + dx);
        cropState.h = Math.max(minSize, startState.h + dy);
      } else if (cropState.resizing.includes('bl')) {
        cropState.x = Math.max(0, startState.x + dx);
        cropState.w = Math.max(minSize, startState.w - dx);
        cropState.h = Math.max(minSize, startState.h + dy);
      } else if (cropState.resizing.includes('tr')) {
        cropState.w = Math.max(minSize, startState.w + dx);
        cropState.y = Math.max(0, startState.y + dy);
        cropState.h = Math.max(minSize, startState.h - dy);
      } else if (cropState.resizing.includes('tl')) {
        cropState.x = Math.max(0, startState.x + dx);
        cropState.y = Math.max(0, startState.y + dy);
        cropState.w = Math.max(minSize, startState.w - dx);
        cropState.h = Math.max(minSize, startState.h - dy);
      }
    }
    
    updateCropRect();
  }
  
  function onEnd(e) {
    cropState.dragging = false;
    cropState.resizing = null;
  }
  
  // Mouse events
  rect.addEventListener('mousedown', onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  
  // Touch events
  rect.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
}

function confirmCrop() {
  const cropCanvas = document.getElementById('crop-canvas');
  const originalCanvas = window._originalCaptureCanvas || cropCanvas;
  
  // Calculate scale from display to original
  const scaleX = originalCanvas.width / cropCanvas.width;
  const scaleY = originalCanvas.height / cropCanvas.height;
  
  // Create a new canvas with just the cropped area (from original resolution)
  const resultCanvas = document.createElement('canvas');
  const cropX = Math.round(cropState.x * scaleX);
  const cropY = Math.round(cropState.y * scaleY);
  const cropW = Math.round(cropState.w * scaleX);
  const cropH = Math.round(cropState.h * scaleY);
  
  resultCanvas.width = cropW;
  resultCanvas.height = cropH;
  const resultCtx = resultCanvas.getContext('2d');
  
  resultCtx.drawImage(
    originalCanvas,
    cropX, cropY, cropW, cropH,
    0, 0, cropW, cropH
  );
  
  // Convert to data URL
  const dataUrl = resultCanvas.toDataURL('image/jpeg', 0.8);
  capturedImage = dataUrl;
  
  // Set the image in the form
  if (currentCaptureTarget === 'spine') {
    document.getElementById('spine-preview').innerHTML = `<img src="${dataUrl}" alt="Lomo">`;
    window._capturedSpineImage = dataUrl;
  } else {
    document.getElementById('book-cover-url').value = '';
    showPreview('cover-preview', dataUrl);
    window._capturedCoverImage = dataUrl;
  }
  
  closeCamera();
}

function recapture() {
  openCamera(currentCaptureTarget);
}

// Start the app
init();
