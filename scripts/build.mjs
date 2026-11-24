#!/usr/bin/env node
// Builds the site into dist/. Usage: node scripts/build.mjs [--dev]   (--dev includes drafts)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import * as T from './templates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.env.OUT_DIR || 'dist');
const dev = process.argv.includes('--dev');
const version = Date.now().toString(36);

const site = JSON.parse(await fs.readFile(path.join(ROOT, 'site.config.json'), 'utf8'));
const cats = site.categories;

const marked = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
);

// --- footnotes: [^id] in the text, "[^id]: note" on its own line anywhere in the post ---
// Notes are numbered in the order they're first referenced and listed under "Notes" at the end.
let fn = null; // footnote state for the post being parsed
marked.use({
  extensions: [{
    name: 'fnref',
    level: 'inline',
    start: (src) => src.indexOf('[^'),
    tokenizer(src) {
      const m = /^\[\^([^\]\s]+)\]/.exec(src);
      if (m) return { type: 'fnref', raw: m[0], id: m[1] };
    },
    renderer({ id, raw }) {
      if (!fn?.defs.has(id)) {
        fn?.missing.add(id);
        return T.esc(raw);
      }
      let i = fn.order.indexOf(id);
      const first = i < 0;
      if (first) i = fn.order.push(id) - 1;
      const n = i + 1;
      return `<sup class="fnref"><a href="#fn-${n}"${first ? ` id="fnref-${n}"` : ''}>[${n}]</a></sup>`;
    },
  }],
});

function takeFootnotes(body) {
  const defs = new Map();
  const out = [];
  let fence = false;
  let cur = null;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence) {
      const m = line.match(/^\[\^([^\]\s]+)\]:\s*(.*)$/);
      if (m) { cur = m[1]; defs.set(cur, m[2]); continue; }
      if (cur && /^(\s{2,}|\t)\S/.test(line)) { defs.set(cur, `${defs.get(cur)} ${line.trim()}`); continue; }
    }
    cur = null;
    out.push(line);
  }
  return { body: out.join('\n'), defs };
}

function render(src, file) {
  const { body, defs } = takeFootnotes(src);
  fn = { defs, order: [], missing: new Set() };
  const html = marked.parse(body);
  const notes = fn.order.map((id, i) => ({ n: i + 1, html: marked.parseInline(defs.get(id)) }));
  for (const id of fn.missing) console.warn(`${file}: footnote [^${id}] is used but never defined.`);
  for (const id of defs.keys()) if (!fn.order.includes(id)) console.warn(`${file}: footnote [^${id}] is defined but never used.`);
  fn = null;
  return { html, notes, words: body.split(/\s+/).filter(Boolean).length };
}

// --- front matter: a small YAML subset (key: value, [a, b] lists, true/false) ---
const unquote = (s) => (/^(["']).*\1$/.test(s) ? s.slice(1, -1) : s);
function parseFrontMatter(src, file) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i < 0) throw new Error(`${file}: can't read front matter line "${line}". Use "key: value".`);
    const key = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((s) => unquote(s.trim())).filter(Boolean);
    else if (v === 'true' || v === 'false') v = v === 'true';
    else v = unquote(v);
    data[key] = v;
  }
  return { data, body: m[2] };
}

async function write(rel, content) {
  const file = path.join(OUT, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

// --- load posts ---
// EXTRA_POSTS adds another folder of posts (used by the QA script for test fixtures).
const postDirs = [path.join(ROOT, 'content/posts'), ...(process.env.EXTRA_POSTS ? [path.resolve(process.env.EXTRA_POSTS)] : [])];
const postFiles = [];
for (const dir of postDirs) for (const f of await fs.readdir(dir)) if (f.endsWith('.md')) postFiles.push([dir, f]);
const posts = [];
for (const [dir, f] of postFiles) {
  const { data, body } = parseFrontMatter(await fs.readFile(path.join(dir, f), 'utf8'), f);
  if (data.draft && !dev) continue;
  const m = f.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
  const slug = data.slug || (m ? m[2] : f.replace(/\.md$/, ''));
  const dateStr = data.date || (m && m[1]);
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (!data.title) throw new Error(`${f}: missing "title:" in front matter.`);
  if (!dateStr || Number.isNaN(date.getTime())) throw new Error(`${f}: missing or invalid "date:" (use YYYY-MM-DD).`);
  const cat = cats.find((c) => c.key === data.category);
  if (!cat) throw new Error(`${f}: "category:" must be one of ${cats.map((c) => c.key).join(', ')}.`);
  if (posts.some((p) => p.slug === slug)) throw new Error(`${f}: another post already uses the slug "${slug}".`);
  const { html, notes, words } = render(body, f);
  posts.push({ ...data, slug, date, cat, url: `/posts/${slug}/`, html, notes, minutes: Math.max(1, Math.round(words / 230)) });
}
posts.sort((a, b) => b.date - a.date || a.title.localeCompare(b.title));

// --- write pages ---
await fs.rm(OUT, { recursive: true, force: true });
await fs.cp(path.join(ROOT, 'public'), OUT, { recursive: true });

// Channels, as on the TV's dial: 0 is the main menu, 1 is every post, then one per category.
const channels = [
  { key: 'menu', url: '/', label: 'Main menu', short: 'MENU' },
  { key: 'all', url: '/posts/', label: 'All posts', short: 'ALL', blurb: 'Everything, newest first.' },
  ...cats.map((c) => ({ ...c, url: `/${c.key}/` })),
];
const chOf = (key) => channels.findIndex((c) => c.key === key);
const common = { version, channels };
const byCat = Object.fromEntries(cats.map((c) => [c.key, posts.filter((p) => p.cat.key === c.key)]));
const counts = Object.fromEntries(cats.map((c) => [c.key, byCat[c.key].length]));

await write('index.html', T.page(site, { ...common, path: '/', mode: 'menu', status: site.system, body: T.menuBody(site, { posts, counts, channels }) }));

// Shelves: ← → step through channels 1…n and wrap, skipping the main menu.
const shelves = channels.length - 1;
for (let ch = 1; ch < channels.length; ch++) {
  const c = channels[ch];
  const list = c.key === 'all' ? posts : byCat[c.key];
  const prev = channels[ch === 1 ? shelves : ch - 1];
  const next = channels[ch === shelves ? 1 : ch + 1];
  await write(`${c.url.slice(1)}index.html`, T.page(site, {
    ...common, ch, path: c.url, mode: 'list', title: c.label, description: c.blurb,
    back: '/', prev: prev.url, next: next.url,
    status: `CH ${ch} · ${c.short} · ${list.length} FILE${list.length === 1 ? '' : 'S'}`,
    body: T.listBody({ ch, channel: c, posts: list, showCat: c.key === 'all' }),
  }));
}

for (const p of posts) {
  const list = byCat[p.cat.key];
  const i = list.indexOf(p);
  const newer = list[i - 1];
  const older = list[i + 1];
  await write(`posts/${p.slug}/index.html`, T.page(site, {
    ...common, ch: chOf(p.cat.key), path: p.url, mode: 'read', title: p.title, description: p.summary || site.description,
    back: `/${p.cat.key}/`, backLabel: p.cat.label, prev: newer?.url, next: older?.url,
    body: T.postBody(p, { newer, older }),
  }));
}

const about = parseFrontMatter(await fs.readFile(path.join(ROOT, 'content/pages/about.md'), 'utf8'), 'about.md');
await write('about/index.html', T.page(site, {
  ...common, path: '/about/', mode: 'read', title: about.data.title || 'About', back: '/', backLabel: 'Main menu',
  body: T.aboutBody(about.data.title || 'About', render(about.body, 'about.md').html),
}));

await write('404.html', T.page(site, { ...common, path: '/404.html', mode: 'menu', title: 'Page not found', status: 'ERROR 404', body: T.notFoundBody() }));

// --- feeds ---
const cdata = (s) => `<![CDATA[${s.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
await write('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${T.esc(site.title)}</title>
<link>${site.url}/</link>
<atom:link href="${site.url}/feed.xml" rel="self" type="application/rss+xml"/>
<description>${T.esc(site.description)}</description>
<language>en</language>
${posts.slice(0, 20).map((p) => `<item>
<title>${T.esc(p.title)}</title>
<link>${site.url}${p.url}</link>
<guid>${site.url}${p.url}</guid>
<pubDate>${p.date.toUTCString()}</pubDate>
<category>${T.esc(p.cat.label)}</category>
<description>${T.esc(p.summary || '')}</description>
<content:encoded>${cdata(p.html)}</content:encoded>
</item>`).join('\n')}
</channel>
</rss>
`);

await write('posts.json', JSON.stringify(posts.map((p) => p.url)));

const urls = ['/', '/posts/', '/about/', ...cats.map((c) => `/${c.key}/`), ...posts.map((p) => p.url)];
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${site.url}${u}</loc></url>`).join('\n')}
</urlset>
`);
await write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);

console.log(`Built ${posts.length} post${posts.length === 1 ? '' : 's'}${dev ? ' (drafts included)' : ''} into dist/`);
