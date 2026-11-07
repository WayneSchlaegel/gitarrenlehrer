// Einrichtungshilfen für den Worker. Deine Einstellungen stehen in wrangler.toml,
// die mit Updates nicht mehr überschrieben wird (Updates bringen nur wrangler.template.toml mit).
//
//   node scripts/config.mjs ensure              wrangler.toml aus der Vorlage anlegen, falls sie fehlt
//   node scripts/config.mjs origin <adresse>    App-Adresse freigeben, z. B. https://name.github.io
//   node scripts/config.mjs kv SYNC|USAGE       KV-Speicher anlegen und eintragen (Abgleich bzw. Tageslimit)

import fs from 'node:fs';
import { execSync } from 'node:child_process';

const FILE = new URL('../wrangler.toml', import.meta.url);
const TEMPLATE = new URL('../wrangler.template.toml', import.meta.url);
const [cmd, arg] = process.argv.slice(2);

function ensure() {
  if (!fs.existsSync(FILE)) {
    fs.copyFileSync(TEMPLATE, FILE);
    console.log('wrangler.toml aus der Vorlage angelegt.');
  }
  // Neue Pflichtwerte aus der Vorlage ergänzen, ohne eigene Werte zu ändern
  let s = fs.readFileSync(FILE, 'utf8');
  if (!/^MAX_TOKENS\s*=/m.test(s)) s = s.replace(/\[vars\]\n/, '[vars]\nMAX_TOKENS = "4000"\n');
  fs.writeFileSync(FILE, s);
}

function origin(url) {
  if (!url || !/^https?:\/\/[^/]+$/.test(url.replace(/\/$/, ''))) {
    console.error('Bitte die Adresse ohne Pfad angeben, z. B.: npm run adresse -- https://name.github.io');
    process.exit(1);
  }
  url = url.replace(/\/$/, '');
  ensure();
  let s = fs.readFileSync(FILE, 'utf8');
  const m = /^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m.exec(s);
  const list = m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
  if (list.includes(url)) { console.log('Adresse ist bereits freigegeben.'); return; }
  list.push(url);
  const line = `ALLOWED_ORIGINS = "${list.join(',')}"`;
  s = m ? s.replace(m[0], line) : s.replace(/\[vars\]\n/, `[vars]\n${line}\n`);
  fs.writeFileSync(FILE, s);
  console.log('Freigegeben: ' + list.join(', '));
  console.log('Jetzt veröffentlichen: npm run deploy');
}

function kv(name) {
  if (!['SYNC', 'USAGE'].includes(name)) { console.error('Nur SYNC oder USAGE möglich.'); process.exit(1); }
  ensure();
  let s = fs.readFileSync(FILE, 'utf8');
  if (new RegExp(`^binding\\s*=\\s*"${name}"`, 'm').test(s)) { console.log(`${name} ist bereits eingetragen.`); return; }
  let out = '';
  try {
    out = execSync(`npx wrangler kv namespace create ${name}`, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  } catch (e) {
    out = String(e.stdout || '');
  }
  process.stdout.write(out);
  const id = /id\s*=\s*"([0-9a-f]{32})"/.exec(out)?.[1] || /"id":\s*"([0-9a-f]{32})"/.exec(out)?.[1];
  if (!id) {
    console.error(`\nKonnte die id nicht lesen. Bitte die id oben von Hand in wrangler.toml eintragen:\n[[kv_namespaces]]\nbinding = "${name}"\nid = "…"`);
    process.exit(1);
  }
  s = s.trimEnd() + `\n\n[[kv_namespaces]]\nbinding = "${name}"\nid = "${id}"\n`;
  fs.writeFileSync(FILE, s);
  console.log(`\n${name} eingetragen. Jetzt veröffentlichen: npm run deploy`);
}

if (cmd === 'ensure') ensure();
else if (cmd === 'origin') origin(arg);
else if (cmd === 'kv') kv(arg);
else { console.log('Befehle: ensure | origin <adresse> | kv SYNC|USAGE'); }
