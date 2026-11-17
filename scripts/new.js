// npm run new -- "Title of the resource"
// Writes database/Title_of_the_resource.yaml from the template, with a fresh ULID.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

// ULID: 10 chars of millisecond timestamp, 16 chars (80 bits) of randomness.
function ulid(ms = Date.now()) {
  let time = '';
  for (let i = 0; i < 10; i++, ms = Math.floor(ms / 32)) time = B32[ms % 32] + time;
  return time + [...crypto.randomBytes(16)].map(b => B32[b % 32]).join('');
}

module.exports = { ulid };

if (require.main === module) {
  const title = process.argv.slice(2).join(' ').trim();
  if (!title) { console.error('Usage: npm run new -- "Title"'); process.exit(1); }
  const db = path.join(__dirname, '..', 'database');
  const file = path.join(db, title.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') + '.yaml');
  if (fs.existsSync(file)) { console.error(`${file} already exists`); process.exit(1); }
  const template = fs.readFileSync(path.join(db, 'template.yaml_'), 'utf8');
  fs.writeFileSync(file, template
    .replace(/^id: null.*$/m, `id: ${ulid()}`)
    .replace(/^title: null.*$/m, `title: ${JSON.stringify(title)}`), { flag: 'wx' });
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
}
