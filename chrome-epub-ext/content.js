(function () {
  const article = {
    title: extractTitle(),
    author: extractAuthor(),
    coverUrl: extractCoverImage(),
    content: extractContent(),
    url: window.location.href,
    images: extractArticleImages(),
  };

  chrome.runtime.sendMessage({ type: 'ARTICLE_DATA', data: article });

  function extractTitle() {
    const meta = document.querySelector('meta[property="og:title"]') ||
                 document.querySelector('meta[name="twitter:title"]') ||
                 document.querySelector('meta[name="title"]');
    if (meta) return meta.getAttribute('content');

    const h1 = document.querySelector('article h1') ||
               document.querySelector('h1');
    if (h1) return h1.textContent.trim();

    const titleTag = document.querySelector('title');
    if (titleTag) {
      let t = titleTag.textContent.trim();
      const parts = t.split(/[|–—-]/);
      return parts[0].trim();
    }

    return document.title;
  }

  function extractAuthor() {
    const selectors = [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="twitter:creator"]',
      '[rel="author"]',
      '.author',
      '.byline',
      '.post-author',
      '.entry-author',
      'article .author',
      'article [itemprop="author"]',
      '[itemprop="author"] [itemprop="name"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.getAttribute('content') || el.textContent || '';
        const clean = text.replace(/^(By|Autor|Autor:|Napísal|Published)\s*/i, '').trim();
        if (clean) return clean;
      }
    }
    return '';
  }

  function extractCoverImage() {
    const selectors = [
      'meta[property="og:image"]',
      'meta[name="twitter:image"]',
      'meta[name="thumbnail"]',
      'article img:first-of-type',
      '.post-thumbnail img',
      '.featured-image img',
      'figure img',
      'img[itemprop="image"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const src = el.getAttribute('content') || el.src || '';
        if (src && isValidImageUrl(src)) return makeAbsoluteUrl(src);
      }
    }

    const imgs = document.querySelectorAll('img');
    let best = null;
    let bestArea = 0;
    for (const img of imgs) {
      const src = img.src || '';
      if (!src || !isValidImageUrl(src)) continue;
      const area = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0);
      if (area > bestArea && area > 10000) {
        bestArea = area;
        best = src;
      }
    }
    return best ? makeAbsoluteUrl(best) : null;
  }

  function isValidImageUrl(url) {
    return url.startsWith('http') && !url.includes('logo') && !url.includes('icon') && !url.includes('avatar') && !url.includes('spacer') && !url.includes('pixel');
  }

  function makeAbsoluteUrl(url) {
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return window.location.protocol + url;
    if (url.startsWith('/')) return new URL(url, window.location.origin).href;
    return new URL(url, window.location.href).href;
  }

  function extractContent() {
    const articleEl = document.querySelector('article') ||
                      document.querySelector('[role="main"]') ||
                      document.querySelector('main') ||
                      document.querySelector('.post-content') ||
                      document.querySelector('.article-content') ||
                      document.querySelector('.entry-content') ||
                      document.querySelector('.content') ||
                      document.querySelector('#content');

    if (!articleEl) {
      const body = document.body;
      removeNoise(body);
      return body.innerHTML;
    }

    const clone = articleEl.cloneNode(true);
    removeNoise(clone);
    return cleanHtml(clone.innerHTML);
  }

  function removeNoise(root) {
    const selectors = [
      'script', 'style', 'nav', 'header', 'footer', 'aside',
      '.sidebar', '.advertisement', '.ads', '.ad', '.social-share',
      '.comments', '.comment', '.related-posts', '.recommended',
      '.newsletter', '.subscribe', '.share', '.sharing',
      '.cookie', '.popup', '.modal', '.overlay', '[role="complementary"]',
      '.menu', '.navigation', '.breadcrumbs',
      '.hidden', '[hidden]', '.screen-reader-text',
      '.author-bio', '.post-meta', '.entry-meta', '.tags',
      '.categories', '[aria-hidden="true"]',
      'iframe', 'noscript',
    ];
    selectors.forEach(sel => {
      root.querySelectorAll(sel).forEach(el => el.remove());
    });
  }

  function cleanHtml(html) {
    return html
      .replace(/<svg[^>]*>.*?<\/svg>/gis, '')
      .replace(/class="[^"]*"/g, '')
      .replace(/id="[^"]*"/g, '')
      .replace(/style="[^"]*"/g, '')
      .replace(/on\w+="[^"]*"/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
  }

  function extractArticleImages() {
    const articleEl = document.querySelector('article') ||
                      document.querySelector('[role="main"]') ||
                      document.querySelector('main') ||
                      document.querySelector('.post-content') ||
                      document.querySelector('.article-content') ||
                      document.querySelector('.entry-content') ||
                      document.querySelector('.content') ||
                      document.querySelector('#content');
    const root = articleEl || document.body;
    const imgs = root.querySelectorAll('img');
    const result = [];
    const seen = new Set();
    for (const img of imgs) {
      const src = makeAbsoluteUrl(img.src || '');
      if (!src || !isValidImageUrl(src) || seen.has(src)) continue;
      seen.add(src);
      const area = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0);
      if (area < 5000) continue;
      result.push({
        src: src,
        alt: (img.alt || '').substring(0, 200),
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
      });
      if (result.length >= 20) break;
    }
    return result;
  }
})();
