async function generateEpub(article) {
  const zip = new ZipWriter();

  const title = article.title || 'Bez názvu';
  const author = article.author || 'Neznámy autor';
  const content = article.content || '';
  const coverUrl = article.coverUrl;
  const url = article.url || '';
  const date = new Date().toISOString().replace(/[T]/g, ' ').substring(0, 19);
  const epubId = `urn:uuid:${crypto.randomUUID()}`;

  let coverData = article.coverData || null;

  if (!coverData && coverUrl) {
    try {
      const resp = await fetch(coverUrl, { mode: 'cors' });
      if (resp.ok) {
        const blob = await resp.blob();
        coverData = new Uint8Array(await blob.arrayBuffer());
      }
    } catch (e) {
      console.warn('Nepodarilo sa stiahnuť obrázok obálky:', e);
    }
  }

  if (!coverData || coverData.length === 0) {
    coverData = await generateCoverPlaceholder(title, author);
  }

  const coverExt = coverData === null ? 'png' : 'png';

  zip.addFile('mimetype', new TextEncoder().encode('application/epub+zip'), { store: true });

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.addFile('META-INF/container.xml', new TextEncoder().encode(containerXml));

  const chapterContent = buildChapterXhtml(content, title);

  const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Obálka</title>
<link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <div class="cover-page">
    <div class="cover-image-wrapper">
      <img src="images/cover.${coverExt}" alt="Obálka" class="cover-image"/>
    </div>
    <h1 class="cover-title">${escapeXml(title)}</h1>
    <p class="cover-author">${escapeXml(author)}</p>
  </div>
</body>
</html>`;

  const stylesheet = `@namespace epub "http://www.idpf.org/2007/ops";
body {
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.8;
  margin: 0;
  padding: 0;
  color: #1a1a1a;
  background: #fafafa;
}
.cover-page {
  text-align: center;
  padding: 0;
  page-break-after: always;
  background: linear-gradient(135deg, #2c3e50 0%, #1a252f 100%);
  color: #ffffff;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}
.cover-image-wrapper {
  max-width: 300px;
  margin: 0 auto 2em;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.cover-image {
  display: block;
  width: 100%;
  height: auto;
}
.cover-title {
  font-size: 2.2em;
  font-weight: 700;
  margin: 0.5em 1em 0.3em;
  line-height: 1.2;
  color: #ffffff;
  text-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.cover-author {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 1.2em;
  color: #bdc3c7;
  margin: 0 1em 2em;
  font-weight: 400;
  letter-spacing: 0.5px;
}
h1, h2, h3 {
  font-family: Arial, Helvetica, sans-serif;
  color: #2c3e50;
  line-height: 1.3;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}
h1 { font-size: 1.8em; border-bottom: 2px solid #3498db; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; color: #34495e; }
h3 { font-size: 1.3em; color: #555; }
p {
  margin: 0.8em 0;
  text-align: justify;
  text-indent: 1.5em;
}
.chapter {
  max-width: 700px;
  margin: 0 auto;
  padding: 2em 1.5em;
}
.title-page {
  text-align: center;
  page-break-after: always;
  padding: 4em 1em;
}
.title-page h1 {
  font-size: 2.5em;
  border: none;
  margin-bottom: 0.3em;
}
.title-page .author-line {
  font-size: 1.3em;
  color: #7f8c8d;
}
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5em auto;
  border-radius: 4px;
}
figure {
  margin: 1.5em 0;
  text-align: center;
}
figcaption {
  font-style: italic;
  color: #666;
  font-size: 0.9em;
  margin-top: 0.5em;
}
blockquote {
  border-left: 4px solid #3498db;
  margin: 1.5em 0;
  padding: 1em 1.5em;
  background: #f8f9fa;
  font-style: italic;
  color: #555;
}
pre, code {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.9em;
  background: #f4f4f4;
  border-radius: 3px;
  padding: 0.2em 0.4em;
}
pre {
  padding: 1em;
  overflow-x: auto;
  border: 1px solid #ddd;
}
pre code {
  background: none;
  padding: 0;
}
a { color: #3498db; text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { margin: 0.8em 0; padding-left: 2em; }
li { margin: 0.4em 0; }
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}
th, td {
  border: 1px solid #ddd;
  padding: 0.6em;
  text-align: left;
}
th { background: #f4f4f4; font-weight: 600; }
hr {
  border: none;
  border-top: 1px solid #ddd;
  margin: 2em 0;
}
.section-title {
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 600;
  color: #2c3e50;
}
`;

  zip.addFile('OEBPS/stylesheet.css', new TextEncoder().encode(stylesheet));

  zip.addFile('OEBPS/cover.xhtml', new TextEncoder().encode(coverXhtml));
  zip.addFile('OEBPS/chapter-1.xhtml', new TextEncoder().encode(chapterContent));

  if (coverData && coverData.length > 0) {
    zip.addFile(`OEBPS/images/cover.${coverExt}`, coverData);
  }

  const coverId = 'cover-image';
  const coverHref = `images/cover.${coverExt}`;
  const coverMediaType = coverExt === 'png' ? 'image/png' : 'image/jpeg';

  const manifestItems = [
    { id: 'cover', href: 'cover.xhtml', mediaType: 'application/xhtml+xml' },
    { id: 'chapter-1', href: 'chapter-1.xhtml', mediaType: 'application/xhtml+xml' },
    { id: 'css', href: 'stylesheet.css', mediaType: 'text/css' },
  ];
  if (coverData && coverData.length > 0) {
    manifestItems.push({ id: coverId, href: coverHref, mediaType: coverMediaType });
  }

  const spineItems = [
    { idref: 'cover', linear: 'yes' },
    { idref: 'chapter-1', linear: 'yes' },
  ];

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId">${escapeXml(epubId)}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator opf:role="aut">${escapeXml(author)}</dc:creator>
    <dc:language>sk</dc:language>
    <dc:date>${escapeXml(date)}</dc:date>
    <dc:source>${escapeXml(url)}</dc:source>
    <meta name="cover" content="${coverData ? coverId : ''}"/>
  </metadata>
  <manifest>
${manifestItems.map(i => `    <item id="${i.id}" href="${i.href}" media-type="${i.mediaType}"/>`).join('\n')}
  </manifest>
  <spine toc="ncx">
${spineItems.map(i => `    <itemref idref="${i.idref}" linear="${i.linear}"/>`).join('\n')}
  </spine>
  <guide>
    <reference type="cover" title="Obálka" href="cover.xhtml"/>
  </guide>
</package>`;
  zip.addFile('OEBPS/content.opf', new TextEncoder().encode(contentOpf));

  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(epubId)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(title)}</text>
  </docTitle>
  <docAuthor>
    <text>${escapeXml(author)}</text>
  </docAuthor>
  <navMap>
    <navPoint id="navpoint-1" playOrder="1">
      <navLabel><text>Obálka</text></navLabel>
      <content src="cover.xhtml"/>
    </navPoint>
    <navPoint id="navpoint-2" playOrder="2">
      <navLabel><text>${escapeXml(title)}</text></navLabel>
      <content src="chapter-1.xhtml"/>
    </navPoint>
  </navMap>
</ncx>`;
  zip.addFile('OEBPS/toc.ncx', new TextEncoder().encode(tocNcx));

  return await zip.toBlob();
}

function buildChapterXhtml(content, title) {
  const bodyContent = content || '<p>Článok sa nepodarilo načítať.</p>';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <div class="chapter">
    <p style="text-align:center; color:#7f8c8d; font-size:0.9em; margin-bottom:2em;">Prebraté z webového článku</p>
    ${bodyContent}
  </div>
</body>
</html>`;
}

async function generateCoverPlaceholder(title, author) {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 600, 900);
  gradient.addColorStop(0, '#2c3e50');
  gradient.addColorStop(1, '#1a252f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 600, 900);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(60, 72, 480, 4);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Georgia, "Times New Roman", serif';
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 8;

  const lines = wrapText(ctx, title, 450, 36);
  const lineHeight = 50;
  const startY = 315 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, i) => ctx.fillText(line, 300, startY + i * lineHeight));

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#bdc3c7';
  ctx.font = '20px Arial, sans-serif';
  ctx.fillText(author, 300, 558);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(60, 828, 480, 4);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { console.error('generateCoverPlaceholder: blob is null'); resolve(new Uint8Array(0)); return; }
      resolve(new Uint8Array(blob));
    }, 'image/png');
  });
}

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
