// Filtering, search, sorting and sharing. All state lives in the URL
// (?tags=a,b&q=text&sort=name-asc&id=JDP-R-1), so every view is a link.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const norm = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const cards = $$('.card');
const container = $('#cards');
const text = new Map(cards.map(c => [c, norm(c.textContent)]));
const tagsOf = new Map(cards.map(c => [c, new Set(c.dataset.tags.split(' '))]));
const facets = $$('#filters [data-tag]');
const groupOf = Object.fromEntries(facets.map(b => [b.dataset.tag, b.dataset.group]));
// Topics narrow (AND); format, language and place are alternatives (OR).
const isAnd = group => group === 'Topic';
const sorts = [...$('#sort').options].map(o => o.value);

const state = { tags: new Set(), q: '', sort: 'name-asc', ids: new Set() };

function readUrl() {
  const p = new URLSearchParams(location.search);
  state.tags = new Set((p.get('tags') || '').split(',').filter(t => t in groupOf));
  state.q = p.get('q') || '';
  state.sort = sorts.includes(p.get('sort')) ? p.get('sort') : 'name-asc';
  state.ids = new Set((p.get('id') || '').split(',').filter(Boolean));
}

function writeUrl() {
  const p = new URLSearchParams();
  if (state.tags.size) p.set('tags', [...state.tags].join(','));
  if (state.q) p.set('q', state.q);
  if (state.sort !== 'name-asc') p.set('sort', state.sort);
  if (state.ids.size) p.set('id', [...state.ids].join(','));
  const qs = p.toString().replace(/%2C/g, ',');
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

// Does the card pass every filter? `skip` leaves one tag group out, which is
// how an OR group counts what each of its tags would add.
function matches(card, terms, selected, skip) {
  if (state.ids.size && !state.ids.has(card.dataset.id)) return false;
  if (!terms.every(t => text.get(card).includes(t))) return false;
  const has = tagsOf.get(card);
  for (const [group, tags] of selected) {
    if (group === skip) continue;
    if (isAnd(group) ? !tags.every(t => has.has(t)) : !tags.some(t => has.has(t))) return false;
  }
  return true;
}

const compare = {
  name: (a, b) => a.dataset.title.localeCompare(b.dataset.title),
  date: (a, b) => a.dataset.date.localeCompare(b.dataset.date) || compare.name(b, a),
  // ULIDs start with their creation time, so plain string order is age order.
  id: (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
};

function render() {
  const terms = norm(state.q).split(/\s+/).filter(Boolean);
  const selected = new Map();
  for (const t of state.tags) selected.set(groupOf[t], [...(selected.get(groupOf[t]) || []), t]);

  const shown = cards.filter(c => matches(c, terms, selected));
  const visible = new Set(shown);
  const [field, dir] = state.sort.split('-');
  cards.sort((a, b) => (dir === 'asc' ? 1 : -1) * compare[field](a, b))
       .forEach(c => { c.hidden = !visible.has(c); container.append(c); });
  container.append($('#empty'));

  for (const b of facets) {
    const { tag, group } = b.dataset;
    const pool = isAnd(group) ? shown : cards.filter(c => matches(c, terms, selected, group));
    const n = pool.filter(c => tagsOf.get(c).has(tag)).length;
    b.querySelector('.count').textContent = n;
    b.disabled = !n && !state.tags.has(tag);
  }
  $$('[data-tag]').forEach(b => b.setAttribute('aria-pressed', state.tags.has(b.dataset.tag)));

  $('#shown').textContent = shown.length;
  $('#empty').hidden = shown.length > 0;
  $('#clear').hidden = !(state.tags.size || state.q || state.ids.size);
  if ($('#q').value !== state.q) $('#q').value = state.q;
  $('#sort').value = state.sort;
  writeUrl();
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-tag]');
  if (!b) return;
  const t = b.dataset.tag;
  state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t);
  render();
});

$('#q').addEventListener('input', e => { state.q = e.target.value; render(); });
$('#q').addEventListener('keydown', e => { if (e.key === 'Escape') { state.q = ''; render(); } });
$('#sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
$('#clear').addEventListener('click', () => {
  Object.assign(state, { tags: new Set(), q: '', ids: new Set() });
  render();
});

document.addEventListener('keydown', e => {
  if (e.key === '/' && !e.target.closest('input, select, textarea')) {
    e.preventDefault();
    $('#filters').open = true;
    $('#q').focus();
  }
});

// Share buttons: a card's links to its own page (which carries a preview card);
// the toolbar's shares the current view, or that page if the view is one resource.
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-share]');
  if (!b) return;
  e.preventDefault();
  const single = state.ids.size === 1 && !state.tags.size && !state.q;
  const url = b.href || (single ? new URL(`r/${[...state.ids][0]}/`, location.href).href : location.href);
  const title = b.dataset.title ? `${b.dataset.title} – The Judo List` : document.title;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    return navigator.share({ title, url }).catch(() => {});
  }
  const label = b.querySelector('span:last-child');
  try {
    await navigator.clipboard.writeText(url);
    label.textContent = 'Copied';
  } catch {
    prompt('Copy this link:', url);
  }
  setTimeout(() => { label.textContent = 'Share'; }, 2000);
});

readUrl();
// On small screens start collapsed, unless the link carried filters.
if (matchMedia('(max-width: 1023px)').matches && !state.tags.size && !state.q) $('#filters').open = false;
render();
