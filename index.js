// Builds dist/: reads database/*.yaml, fetches the latest RSS item per
// resource and renders page.mustache. `--offline` skips the RSS fetch.
const fs = require('fs/promises');
const path = require('path');
const yaml = require('js-yaml');
const mustache = require('mustache');
const { marked } = require('marked');
const Parser = require('rss-parser');

const OFFLINE = process.argv.includes('--offline');
const DIST = path.join(__dirname, 'dist');
const FRESH_DAYS = 14;

// Tags not listed here are topics. A tag can only sit in one group.
const GROUPS = {
  Format: ['anime', 'book', 'channel', 'cinema', 'documentary', 'federation', 'forum', 'game',
           'interview', 'news', 'paper', 'podcast', 'short', 'store', 'video', 'website'],
  Language: ['cantonese', 'chinese', 'dutch', 'english', 'french', 'german', 'italian',
             'japanese', 'portuguese'],
  Place: ['australia', 'brazil', 'italy', 'japan', 'portugal', 'uk'],
};
const groupOf = tag => Object.keys(GROUPS).find(g => GROUPS[g].includes(tag)) || 'Topic';

const ICONS = [
  ['podcasts.apple.com', 'fab fa-apple'], ['spotify.com', 'fab fa-spotify'],
  ['tiktok.com', 'fab fa-tiktok'], ['facebook.com', 'fab fa-facebook'],
  ['instagram.com', 'fab fa-instagram'], ['youtube.com', 'fab fa-youtube'],
  ['archive.org', 'fas fa-landmark-flag'], ['megaphone.fm', 'fas fa-podcast'],
  ['podbean.com', 'fas fa-podcast'], ['anchor.fm', 'fas fa-podcast'],
];
const iconFor = url => (ICONS.find(([p]) => url.includes(p)) || [, 'fas fa-globe'])[1];

// Stable hue per tag; lightness/saturation live in CSS so every tag stays readable.
const hue = str => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;

function validate(resources) {
  const errors = [], seen = new Map();
  for (const r of resources) {
    const where = r.filename;
    if (!/^JDP-R-\d+$/.test(r.id || '')) errors.push(`${where}: bad id "${r.id}"`);
    else if (seen.has(r.id)) errors.push(`${where}: id ${r.id} already used by ${seen.get(r.id)}`);
    else seen.set(r.id, where);
    if (!r.name) errors.push(`${where}: missing name`);
    if (!r.url) errors.push(`${where}: missing url`);
    if (!Array.isArray(r.tags) || !r.tags.length) errors.push(`${where}: missing tags`);
    for (const p of r.people || [])
      if (!p.id || !p.name) errors.push(`${where}: people entries need id and name`);
  }
  return errors;
}

const parser = new Parser({ timeout: 15000 });

async function latestItem(r) {
  try {
    const res = await fetch(r.rss, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const item = (await parser.parseString(await res.text())).items?.[0];
    if (!item?.isoDate) throw new Error('no dated items');
    return { date: item.isoDate.slice(0, 10), title: item.title || 'Untitled', link: item.link || item.enclosure?.url || r.rss };
  } catch (e) {
    console.warn(`  ✗ ${r.name}: ${e.message.split('\n')[0]}`);
    return null;
  }
}

async function main() {
  const dir = path.join(__dirname, 'database');
  const files = (await fs.readdir(dir)).filter(f => /^[^#.].*\.yaml$/.test(f));
  const resources = await Promise.all(files.map(async filename => ({
    ...yaml.load(await fs.readFile(path.join(dir, filename), 'utf8')).resource, filename,
  })));

  const errors = validate(resources);
  if (errors.length) throw new Error('Invalid database:\n  ' + errors.join('\n  '));
  console.log(`${resources.length} resources OK`);
  if (process.argv.includes('--check')) return;

  const feeds = resources.filter(r => r.rss);
  if (!OFFLINE) console.log(`Fetching ${feeds.length} feeds…`);
  const now = Date.now();
  const latest = new Map(await Promise.all(feeds.map(async r => [r.id, OFFLINE ? null : await latestItem(r)])));
  if (!OFFLINE) console.log(`  ${[...latest.values()].filter(Boolean).length}/${feeds.length} feeds updated`);

  const prepared = resources.map(r => {
    const tags = r.tags.map(String);
    const ep = latest.get(r.id);
    return {
      ...r,
      num: +r.id.split('-')[2],
      tags: tags.map(t => ({ tag: t, hue: hue(t) })),
      tagList: tags.join(' '),
      urls: [].concat(r.url).map(url => ({ url, icon: iconFor(url), host: new URL(url).hostname.replace(/^www\./, '') })),
      descriptionHtml: r.description ? marked.parse(String(r.description)) : '',
      commentHtml: r.comment ? marked.parse(String(r.comment)) : '',
      episode: ep && {
        ...ep,
        fresh: now - Date.parse(ep.date) < FRESH_DAYS * 864e5,
        label: tags.includes('podcast') ? 'Last episode' : tags.includes('channel') ? 'Last video' : 'Last post',
        icon: tags.includes('podcast') ? 'podcast' : tags.includes('channel') ? 'tv' : 'newspaper',
      },
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const groups = ['Format', 'Language', 'Topic', 'Place'].map(name => ({
    name,
    tags: [...new Set(prepared.flatMap(r => r.tags.map(t => t.tag)))]
      .filter(t => groupOf(t) === name).sort().map(t => ({ tag: t, hue: hue(t), group: name })),
  })).filter(g => g.tags.length);
  for (const r of prepared) for (const t of r.tags) t.group = groupOf(t.tag);

  const template = await fs.readFile(path.join(__dirname, 'page.mustache'), 'utf8');
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST);
  await fs.writeFile(path.join(DIST, 'index.html'),
    mustache.render(template, { resources: prepared, groups, total: prepared.length, built: new Date().toISOString().slice(0, 10) }));
  for (const d of ['styles', 'js', 'images'])
    await fs.cp(path.join(__dirname, d), path.join(DIST, d), { recursive: true, filter: s => !/[#~]$|\/\.#/.test(s) });
  console.log('Wrote dist/');
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
