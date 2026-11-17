// npm run images
// Caches each resource's image as a small WebP in images/cache/, named by the
// SHA-1 of its source URL (as cl-martialis does). Only missing images are
// fetched, and files no resource uses any more are removed. The cache is
// committed, so the site never hotlinks and keeps images whose source is gone.
// Needs ImageMagick 7 (`magick`) with WebP support.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(ROOT, 'images', 'cache');
const SIZE = '256x256>'; // fit inside, never enlarge: a thumbnail for identification
const USER_AGENT = 'The Judo List image cache (https://list.judoc.org)';

// Site-relative path of the cached copy of URL.
const cachePath = url => `images/cache/${crypto.createHash('sha1').update(url).digest('hex')}.webp`;

module.exports = { cachePath };

async function main() {
  const yaml = require('js-yaml');
  const db = path.join(ROOT, 'database');
  const urls = new Map(); // cache path -> source URL
  for (const f of fs.readdirSync(db).filter(f => /^[^#.].*\.yaml$/.test(f))) {
    const url = yaml.load(fs.readFileSync(path.join(db, f), 'utf8'))?.image?.contentUrl;
    if (url) urls.set(cachePath(url), url);
  }
  fs.mkdirSync(CACHE, { recursive: true });

  const missing = [...urls].filter(([file]) => !fs.existsSync(path.join(ROOT, file)));
  let failed = 0;
  for (const [file, url] of missing) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const input = Buffer.from(await res.arrayBuffer());
      // [0]: first frame only (GIFs); -strip drops metadata; -auto-orient applies EXIF rotation first.
      const webp = execFileSync('magick', ['-[0]', '-auto-orient', '-resize', SIZE, '-strip', '-quality', '80', 'webp:-'],
        { input, maxBuffer: 16 << 20 });
      fs.writeFileSync(path.join(ROOT, file), webp);
      console.log(`  ✓ ${file} (${(webp.length / 1024).toFixed(1)} KB) ← ${url}`);
    } catch (e) {
      failed++;
      console.warn(`  ✗ ${url}: ${String(e.message).split('\n')[0]}\n` +
        `      to add by hand: magick <downloaded file>'[0]' -auto-orient -resize '${SIZE}' -strip -quality 80 ${file}`);
    }
  }

  const keep = new Set([...urls.keys()].map(f => path.basename(f)));
  for (const f of fs.readdirSync(CACHE)) if (!keep.has(f)) {
    fs.rmSync(path.join(CACHE, f));
    console.log(`  – removed unused ${f}`);
  }
  console.log(`${urls.size} images, ${missing.length - failed} fetched, ${failed} failed`);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
