let articleData = null;
let previewObjectUrl = null;
let downloadObjectUrl = null;
let selectedCoverBlob = null;

document.addEventListener('DOMContentLoaded', async () => {
  const titleEl = document.getElementById('title');
  const authorInput = document.getElementById('authorInput');
  const coverPreview = document.getElementById('coverPreview');
  const coverLoading = document.getElementById('coverLoading');
  const filenameDisplay = document.getElementById('filenameDisplay');
  const convertBtn = document.getElementById('convertBtn');
  const imageGallery = document.getElementById('imageGallery');
  const galleryCard = document.getElementById('galleryCard');

  showStatus('Nacitavam clanok...', 'info');
  convertBtn.disabled = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { showStatus('Chyba: nie je otvorena ziadna karta.', 'error'); return; }
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
    showStatus('Tuto stranku nie je mozne spracovat.', 'error'); return;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
  } catch (e) { console.warn('executeScript error:', e); }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title,
        content: (document.querySelector('article') || document.body)?.innerHTML || '',
      }),
    });
    if (results && results[0] && results[0].result) {
      const fb = results[0].result;
      articleData = {
        title: fb.title || tab.title || 'Webova stranka',
        author: '',
        coverUrl: null,
        content: fb.content || '',
        url: tab.url,
        images: [],
      };
    }
  } catch (e) { console.warn('Fallback error:', e); }

  chrome.runtime.onMessage.addListener(function listener(msg) {
    if (msg.type === 'ARTICLE_DATA') {
      chrome.runtime.onMessage.removeListener(listener);
      articleData = msg.data;
      if (!articleData.images) articleData.images = [];
      updateUI();
    }
  });

  authorInput.addEventListener('input', () => {
    if (articleData) {
      articleData.author = authorInput.value.trim();
      updateFilename();
      showPlaceholderPreview();
    }
  });

  setTimeout(updateUI, 1500);

  function updateUI() {
    if (!articleData) return;
    titleEl.textContent = articleData.title || 'Bez nazvu';
    titleEl.className = 'title-display' + (articleData.title ? '' : ' missing');
    authorInput.value = articleData.author || '';
    updateFilename();
    showPlaceholderPreview();
    if (articleData.coverUrl) fetchRealCover(articleData.coverUrl);
    buildGallery();
    convertBtn.disabled = false;
    hideStatus();
  }

  function updateFilename() {
    const name = buildFileName(articleData?.title || 'clanok', articleData?.author || authorInput.value.trim());
    filenameDisplay.textContent = name + '.epub';
  }

  function showPlaceholderPreview() {
    if (!articleData) return;
    try {
      const title = articleData.title || 'Bez nazvu';
      const author = authorInput.value.trim() || 'Neznamy autor';
      if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
      previewObjectUrl = drawCoverPreview(title, author);
      coverLoading.style.display = 'none';
      coverPreview.style.display = 'block';
      coverPreview.src = previewObjectUrl;
      coverPreview.alt = 'Obal (generovany)';
    } catch (e) {
      console.error('Cover preview error:', e);
      coverLoading.textContent = 'Nepodarilo sa vygenerovat obalku';
      coverLoading.style.display = 'flex';
      coverPreview.style.display = 'none';
    }
  }

  async function fetchRealCover(url) {
    try {
      const blob = await fetchImageAsBlob(url);
      if (!blob) return;
      if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); }
      previewObjectUrl = URL.createObjectURL(blob);
      coverLoading.style.display = 'none';
      coverPreview.style.display = 'block';
      coverPreview.src = previewObjectUrl;
      coverPreview.alt = 'Obal';
      selectedCoverBlob = blob;
    } catch (e) {
      console.warn('Failed to fetch cover, keeping placeholder');
    }
  }

  function buildGallery() {
    if (!articleData || !articleData.images || articleData.images.length === 0) {
      galleryCard.style.display = 'none';
      return;
    }
    galleryCard.style.display = 'block';
    imageGallery.innerHTML = '';
    articleData.images.forEach((img, idx) => {
      const thumb = document.createElement('img');
      thumb.className = 'gallery-img';
      thumb.src = img.src;
      thumb.alt = img.alt || 'Obrazok ' + (idx + 1);
      thumb.title = img.alt || ('Klikni pre vyber ako obalku');
      thumb.dataset.src = img.src;
      thumb.onerror = () => { thumb.style.display = 'none'; };
      thumb.onclick = async () => {
        document.querySelectorAll('.gallery-img').forEach(el => el.classList.remove('selected'));
        thumb.classList.add('selected');
        const blob = await fetchImageAsBlob(img.src);
        if (blob) {
          selectedCoverBlob = blob;
          articleData.coverData = new Uint8Array(await blob.arrayBuffer());
          if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); }
          previewObjectUrl = URL.createObjectURL(blob);
          coverLoading.style.display = 'none';
          coverPreview.style.display = 'block';
          coverPreview.src = previewObjectUrl;
          coverPreview.alt = img.alt || 'Obal (vybrany)';
        }
      };
      imageGallery.appendChild(thumb);
    });
  }

  convertBtn.addEventListener('click', async () => {
    if (!articleData) return;
    articleData.author = authorInput.value.trim();
    convertBtn.disabled = true;
    convertBtn.classList.add('loading');
    showStatus('Generujem EPUB...', 'info');

    try {
      if (selectedCoverBlob && !articleData.coverData) {
        articleData.coverData = new Uint8Array(await selectedCoverBlob.arrayBuffer());
      }
      const blob = await generateEpub(articleData);
      downloadObjectUrl = URL.createObjectURL(blob);
      const fileName = buildFileName(articleData.title || 'clanok', articleData.author || '') + '.epub';

      chrome.downloads.download({
        url: downloadObjectUrl,
        filename: fileName,
        saveAs: true,
      });

      convertBtn.classList.remove('loading');
      convertBtn.textContent = 'Zavriet';
      convertBtn.disabled = false;
      convertBtn.onclick = () => {
        if (downloadObjectUrl) URL.revokeObjectURL(downloadObjectUrl);
        window.close();
      };
      showStatus('EPUB sa stahuje: ' + fileName, 'success');
    } catch (e) {
      console.error(e);
      convertBtn.disabled = false;
      convertBtn.classList.remove('loading');
      showStatus('Chyba: ' + e.message, 'error');
    }
  });
});

async function fetchImageAsBlob(url) {
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) return null;
    return await resp.blob();
  } catch (e) {
    try {
      const resp = await fetch(url, { mode: 'no-cors' });
      const blob = await resp.blob();
      if (blob.type.startsWith('image/')) return blob;
    } catch (e2) { /* ignore */ }
    return null;
  }
}

function buildFileName(title, author) {
  const safe = (s) => s.replace(/[<>:"/\\|?*]/g, '_').trim();
  const safeTitle = safe(title) || 'clanok';
  if (!author) return safeTitle;
  const parts = author.trim().split(/\s+/);
  if (parts.length === 1) return parts[0] + ' - ' + safeTitle;
  const surname = parts.pop();
  const rest = parts.join(' ');
  return surname + ', ' + rest + ' - ' + safeTitle;
}

function drawCoverPreview(title, author) {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 450;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 300, 450);
  gradient.addColorStop(0, '#2c3e50');
  gradient.addColorStop(1, '#1a252f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 300, 450);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(30, 36, 240, 3);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px Georgia, "Times New Roman", serif';
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 6;

  const lines = wrapText(ctx, title, 225, 20);
  const lineH = 28;
  const startY = 157 - (lines.length - 1) * lineH / 2;
  lines.forEach((line, i) => ctx.fillText(line, 150, startY + i * lineH));

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#bdc3c7';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText(author, 150, 279);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(30, 414, 240, 3);

  return canvas.toDataURL('image/png');
}

function wrapText(ctx, text, maxWidth, fontSize) {
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : [''];
}

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status ' + type;
  el.style.display = 'block';
}

function hideStatus() {
  const el = document.getElementById('status');
  el.style.display = 'none';
}
