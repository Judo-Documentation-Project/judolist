// Builds dist/: reads database/*.yaml, fetches the latest RSS item per
// resource and renders page.mustache. `--offline` skips the RSS fetch.
const fs = require('fs/promises');
const path = require('path');
const yaml = require('js-yaml');
const mustache = require('mustache');
const { marked } = require('marked');
const Parser = require('rss-parser');
const { existsSync } = require('fs');
const { cachePath } = require('./scripts/images.js');

const OFFLINE = process.argv.includes('--offline');
const DIST = path.join(__dirname, 'dist');
const SITE = 'https://list.judoc.org';
const FRESH_DAYS = 14;
const MARTIALIS_HELP = 'Persons, styles, or events mentioned in this resource that have an entry in Martialis, the Martial Arts Lineage Database.';

// One tiny page per resource at r/<id>/: social crawlers read its preview
// card, people get sent on to the list filtered to that resource.
const CARD_PAGE = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>{{title}} – The Judo List</title>
<meta name="description" content="{{summary}}">
<link rel="canonical" href="${SITE}/r/{{id}}/">
<meta property="og:site_name" content="The Judo List">
<meta property="og:type" content="article">
<meta property="og:title" content="{{title}}">
<meta property="og:description" content="{{summary}}">
<meta property="og:url" content="${SITE}/r/{{id}}/">
{{#image}}<meta property="og:image" content="{{absolute}}">
<meta property="og:image:alt" content="{{title}}">{{/image}}
<meta name="twitter:card" content="summary">
<meta name="twitter:creator" content="@fredericomunoz">
<script>location.replace('../../?id={{id}}' + location.hash)</script>
</head><body><a href="../../?id={{id}}">{{title}} on The Judo List</a></body></html>
`;

// Plain-text description for previews: markdown marks dropped, cut at a word.
function summary(text = '', max = 200) {
  const plain = String(text).replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length <= max ? plain : plain.slice(0, plain.lastIndexOf(' ', max - 1)) + '…';
}

// Tags not listed here are topics. Languages come from the `language` field.
const GROUPS = {
  Format: ['anime', 'book', 'channel', 'cinema', 'documentary', 'federation', 'forum', 'game',
           'interview', 'news', 'paper', 'podcast', 'short', 'store', 'video', 'website'],
  Place: ['australia', 'belgium', 'brazil', 'canada', 'france', 'germany', 'iceland', 'italy',
          'japan', 'netherlands', 'norway', 'portugal', 'uk', 'usa'],
};
const groupOf = tag => Object.keys(GROUPS).find(g => GROUPS[g].includes(tag)) || 'Topic';

// BCP 47 code -> lowercase English name ("yue" -> "cantonese"); undefined if unknown.
const LANGUAGES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
const languageName = code => { try { return LANGUAGES.of(code)?.toLowerCase(); } catch { return undefined; } };
const languagesOf = r => [].concat(r.language ?? []).map(String);

// Kinds of martial.is entity an `about` entry can point at.
const KINDS = ['person', 'org', 'style', 'place', 'event', 'source'];
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

// Curators, as martialis agents: `curatedBy: agent:FSM` -> https://martial.is/agent/FSM.
const AGENTS = { FSM: 'Frederico Muñoz' };
const agentOf = curie => curie?.match(/^agent:([\w-]+)$/)?.[1];
const kindOf = a => KINDS.find(k => k in a);

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

const isText = v => typeof v === 'string' && v.trim() !== '';
const isUrl = v => { try { return /^https?:$/.test(new URL(v).protocol); } catch { return false; } };

function validate(resources) {
  const errors = [], seen = new Map();
  const languageNames = new Set(resources.flatMap(r => languagesOf(r).map(languageName)));
  for (const r of resources) {
    const err = msg => errors.push(`${r.filename}: ${msg}`);
    if (r.type !== 'Resource') err(`type must be Resource, not "${r.type}"`);
    if (!ULID.test(r.id || '')) err(`bad id "${r.id}" (want a ULID: npm run new)`);
    else if (seen.has(r.id)) err(`id ${r.id} already used by ${seen.get(r.id)}`);
    else seen.set(r.id, r.filename);
    if (!isText(r.title)) err('missing title');
    if (!(agentOf(r.curatedBy) in AGENTS)) err(`curatedBy must be a known agent (${Object.keys(AGENTS).map(a => 'agent:' + a).join(', ')}), not "${r.curatedBy}"`);
    if (![].concat(r.url ?? []).length || ![].concat(r.url).every(isUrl)) err('url must be one or more http(s) URLs');
    if (r.rss != null && !isUrl(r.rss)) err('rss must be a URL');
    if (r.unavailable != null) {
      if (!/^\d{4}(-\d{2}){0,2}$/.test(r.unavailable.since)) err('unavailable.since must be a date: YYYY, YYYY-MM or YYYY-MM-DD');
      if (r.unavailable.note != null && !isText(r.unavailable.note.en)) err('unavailable.note must be a language map with an "en" entry');
    }
    if (r.image != null && !isUrl(r.image.contentUrl)) err('image needs a contentUrl');
    for (const field of ['description', 'comment'])
      if (r[field] != null && !isText(r[field].en)) err(`${field} must be a language map with an "en" entry`);
    if (!Array.isArray(r.tags) || !r.tags.length) err('missing tags');
    for (const code of languagesOf(r)) if (!languageName(code)) err(`unknown language code "${code}"`);
    for (const t of r.tags || []) if (languageNames.has(t)) err(`tag "${t}" is a language: use the language field`);
    for (const a of r.about || [])
      if (!kindOf(a) || !ULID.test(a[kindOf(a)]) || !isText(a.name))
        err(`about entries need one of ${KINDS.join('/')} with a ULID, and a name`);
    for (const u of r.sameAs || []) if (!isUrl(u)) err(`sameAs "${u}" is not a URL`);
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
    console.warn(`  ✗ ${r.title}: ${e.message.split('\n')[0]}`);
    return null;
  }
}

async function main() {
  const dir = path.join(__dirname, 'database');
  const files = (await fs.readdir(dir)).filter(f => /^[^#.].*\.yaml$/.test(f));
  const resources = await Promise.all(files.map(async filename => ({
    ...yaml.load(await fs.readFile(path.join(dir, filename), 'utf8')), filename,
  })));
  // An unquoted YAML date loads as a Date; keep it as the text that was written.
  for (const r of resources)
    if (r.unavailable?.since instanceof Date) r.unavailable.since = r.unavailable.since.toISOString().slice(0, 10);

  const errors = validate(resources);
  if (errors.length) throw new Error('Invalid database:\n  ' + errors.join('\n  '));
  console.log(`${resources.length} resources OK`);
  if (process.argv.includes('--check')) return;

  const feeds = resources.filter(r => r.rss && !r.unavailable);
  if (!OFFLINE) console.log(`Fetching ${feeds.length} feeds…`);
  const now = Date.now();
  const latest = new Map(await Promise.all(feeds.map(async r => [r.id, OFFLINE ? null : await latestItem(r)])));
  if (!OFFLINE) console.log(`  ${[...latest.values()].filter(Boolean).length}/${feeds.length} feeds updated`);

  const uncached = [];
  const prepared = resources.map(r => {
    const tags = r.tags.map(String);
    const facets = [
      ...tags.map(t => ({ tag: t, group: groupOf(t) })),
      ...languagesOf(r).map(code => ({ tag: languageName(code), group: 'Language' })),
    ].map(f => ({ ...f, hue: hue(f.tag) }));
    const martialis = (r.sameAs || []).find(u => u.startsWith('https://martial.is/'));
    const cached = r.image && existsSync(path.join(__dirname, cachePath(r.image.contentUrl)));
    if (r.image && !cached) uncached.push(r.title);
    const ep = latest.get(r.id);
    return {
      ...r,
      tags: facets,
      tagList: facets.map(f => f.tag).join(' '),
      urls: [].concat(r.url).map(url => ({ url, icon: iconFor(url), host: new URL(url).hostname.replace(/^www\./, '') })),
      descriptionHtml: r.description ? marked.parse(r.description.en) : '',
      commentHtml: r.comment ? marked.parse(r.comment.en) : '',
      about: (r.about || []).map(a => ({ id: a[kindOf(a)], name: a.name, isPerson: kindOf(a) === 'person' })),
      martialis,
      image: r.image && {
        src: cached ? cachePath(r.image.contentUrl) : r.image.contentUrl,
        absolute: cached ? `${SITE}/${cachePath(r.image.contentUrl)}` : r.image.contentUrl,
      },
      curator: { slug: agentOf(r.curatedBy), name: AGENTS[agentOf(r.curatedBy)] },
      gone: r.unavailable && {
        since: r.unavailable.since,
        noteHtml: r.unavailable.note ? marked.parse(r.unavailable.note.en) : '',
      },
      hasMartialis: Boolean(martialis || r.about?.length),
      episode: ep && {
        ...ep,
        fresh: now - Date.parse(ep.date) < FRESH_DAYS * 864e5,
        label: tags.includes('podcast') ? 'Last episode' : tags.includes('channel') ? 'Last video' : 'Last post',
        icon: tags.includes('podcast') ? 'podcast' : tags.includes('channel') ? 'tv' : 'newspaper',
      },
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  if (uncached.length) console.warn(`  ${uncached.length} images not cached, linked from their source (npm run images): ${uncached.join(', ')}`);

  const all = new Map(prepared.flatMap(r => r.tags).map(f => [f.tag, f]));
  const groups = ['Format', 'Language', 'Topic', 'Place'].map(name => ({
    name,
    tags: [...all.values()].filter(f => f.group === name).sort((a, b) => a.tag.localeCompare(b.tag)),
  })).filter(g => g.tags.length);

  const template = await fs.readFile(path.join(__dirname, 'page.mustache'), 'utf8');
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST);
  await fs.writeFile(path.join(DIST, 'index.html'),
    mustache.render(template, { resources: prepared, groups, total: prepared.length, martialisHelp: MARTIALIS_HELP, built: new Date().toISOString().slice(0, 10), year: new Date().getFullYear() }));
  for (const r of prepared) {
    await fs.mkdir(path.join(DIST, 'r', r.id), { recursive: true });
    await fs.writeFile(path.join(DIST, 'r', r.id, 'index.html'),
      mustache.render(CARD_PAGE, { ...r, summary: summary((r.description || r.comment)?.en) }));
  }
  for (const d of ['styles', 'js', 'images'])
    await fs.cp(path.join(__dirname, d), path.join(DIST, d), { recursive: true, filter: s => !/[#~]$|\/\.#/.test(s) });
  console.log('Wrote dist/');
}

main().catch(e => { console.error(e.message); process.exitCode = 1; });
