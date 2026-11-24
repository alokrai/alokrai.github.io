#!/usr/bin/env node
// End-to-end QA: drives a real Chrome through every page, button and key at phone and desktop sizes.
// Usage: npm run qa            (uses Google Chrome; set CHROME_PATH to point elsewhere)
//        npm run qa -- --only "options"   (run tests whose name contains the text)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QA = path.join(ROOT, '.qa');
const OUT = path.join(QA, 'dist');
const FIX = path.join(QA, 'fixtures');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].toLowerCase() : '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- fixtures: extra tech posts so shelves have neighbours, plus overflow traps ----------
fs.rmSync(FIX, { recursive: true, force: true });
fs.mkdirSync(FIX, { recursive: true });
fs.writeFileSync(path.join(FIX, '2026-11-10-qa-older.md'), `---
title: QA: an older tech post with a deliberately long title that has to wrap onto several lines without breaking anything
date: 2026-11-10
category: tech
summary: A long summary that keeps going so that the list item has to wrap it across more than one line on a small phone screen.
thanks: the QA robot
---

A footnote at the top.[^a] A very long URL: https://example.com/${'a'.repeat(180)}

Averyveryverylongwordwithoutanyspacesthatcouldpushthelayoutwiderthanthescreenifwrappingisbroken.

${'Paragraph text to make the post long enough to scroll. '.repeat(120)}

[^a]: The note, which lives at the very end of the post.
`);
fs.writeFileSync(path.join(FIX, '2026-11-05-qa-oldest.md'), `---
title: QA oldest
date: 2026-11-05
category: tech
summary: The oldest post on the tech shelf.
---

Short post.
`);

execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs'), '--dev'], {
  env: { ...process.env, OUT_DIR: OUT, EXTRA_POSTS: FIX }, stdio: 'inherit',
});

// ---------- a static server that behaves like GitHub Pages ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.json': 'application/json', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.normalize(path.join(OUT, url));
  if (!file.startsWith(OUT)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!url.endsWith('/')) return res.writeHead(301, { Location: url + '/' }).end();
    file = path.join(file, 'index.html');
  }
  let status = 200;
  if (!fs.existsSync(file)) { status = 404; file = path.join(OUT, '404.html'); }
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-first-run', '--no-default-browser-check', '--hide-scrollbars'],
});

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  laptop: { width: 1024, height: 640 },
  tablet: { width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  'small phone': { width: 360, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  'phone landscape': { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

// ---------- harness ----------
const results = [];
async function test(name, fn) {
  if (only && !name.toLowerCase().includes(only)) return;
  const opened = [];
  try {
    await fn((...a) => open(...a).then((p) => (opened.push(p), p)));
    results.push({ name, ok: true });
    process.stdout.write('.');
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    process.stdout.write('F');
  } finally {
    for (const p of opened) await p.ctx.close().catch(() => {});
  }
}
function assert(c, msg) { if (!c) throw new Error(msg); }

async function open(vp, url, { boot = false, js = true, scheme, reduced, storage } = {}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  p.ctx = ctx;
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(`page error: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) p.errors.push(`console: ${m.text()}`); });
  p.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400 && !r.url().includes('missing')) p.errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await p.setViewport(VIEWPORTS[vp]);
  if (!js) await p.setJavaScriptEnabled(false);
  const feats = [];
  if (scheme) feats.push({ name: 'prefers-color-scheme', value: scheme });
  if (reduced) feats.push({ name: 'prefers-reduced-motion', value: 'reduce' });
  if (feats.length) await p.emulateMediaFeatures(feats);
  if (!boot && js) await p.evaluateOnNewDocument(() => { try { sessionStorage.setItem('booted', '1'); } catch { /* */ } });
  if (storage && js) await p.evaluateOnNewDocument((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  await p.goto(BASE + url, { waitUntil: 'networkidle0', timeout: 20000 });
  return p;
}

const where = (p) => new URL(p.url()).pathname;
const selIndex = (p, s = '[data-item]') => p.$$eval(s, (els) => els.findIndex((e) => e.classList.contains('sel')));
const count = (p, s) => p.$$eval(s, (els) => els.length);
const panelOpen = (p) => p.$eval('#options', (e) => !e.hidden && e.getBoundingClientRect().height > 0);
const tint = (p) => p.evaluate(() => document.documentElement.dataset.tint);
const PHONES = ['phone', 'small phone', 'phone landscape'];
// How far the reading text has scrolled: inside the TV screen, or the whole window on a phone.
const readScroll = (p) => p.evaluate(() => Math.max(scrollY, document.getElementById('viewport').scrollTop));
const readMax = (p) => p.evaluate(() => { const v = document.getElementById('viewport'); return Math.max(document.scrollingElement.scrollHeight - innerHeight, v.scrollHeight - v.clientHeight); });

async function center(p, s) {
  const el = await p.$(s);
  assert(el, `element ${s} is missing`);
  await el.evaluate((e) => { const r = e.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight) e.scrollIntoView({ block: 'center' }); });
  await sleep(50);
  // Use the first line box, so links that wrap onto two lines are tapped on the link itself.
  const b = await el.evaluate((e) => { const r = e.getClientRects()[0]; return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null; });
  assert(b && b.width > 0 && b.height > 0, `element ${s} is not visible`);
  return [b.x + b.width / 2, b.y + b.height / 2];
}
async function click(p, s) { const [x, y] = await center(p, s); await p.mouse.click(x, y); }
async function tap(p, s) { const [x, y] = await center(p, s); await p.touchscreen.tap(x, y); }
const btn = (name) => `[data-btn="${name}"]`;
// On a phone the reading strip holds the buttons; elsewhere the controller does.
const tapOrClick = async (p, vp, s) => {
  const inStrip = await p.evaluate((s) => { const e = document.querySelector('.strip ' + s); return !!e && e.getBoundingClientRect().height > 0; }, s);
  return inStrip ? tap(p, '.strip ' + s) : click(p, s);
};

async function expectNav(p, action, expected, label = '') {
  const from = where(p);
  await Promise.all([p.waitForNavigation({ timeout: 5000, waitUntil: 'networkidle0' }).catch(() => {}), action()]);
  await sleep(100);
  const got = where(p);
  const ok = typeof expected === 'function' ? expected(got) : got === expected;
  assert(ok, `${label}expected to go from ${from} to ${expected}, but ended on ${got}`);
}
async function expectStay(p, action, label) {
  const from = where(p);
  await action();
  await sleep(700);
  assert(where(p) === from, `${label}: should stay on ${from}, but went to ${where(p)}`);
}
function noErrors(p) { assert(!p.errors.length, p.errors.join(' | ')); }

// ---------- layout: every page at every size ----------
async function layout(p, label) {
  const r = await p.evaluate(() => {
    const de = document.documentElement;
    const box = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: b.left, y: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, shown: cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0 }; };
    const q = (s) => { const e = document.querySelector(s); return e ? box(e) : null; };
    const btns = ['up', 'down', 'left', 'right', 'a', 'b', 'options', 'home'].map((n) => {
      const e = document.querySelector(`[data-btn="${n}"]`);
      if (!e) return [n, null, false];
      const b = box(e);
      const hit = b.shown ? document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2) : null;
      return [n, b, !!hit && (hit === e || e.contains(hit))];
    });
    const wide = [...document.querySelectorAll('.viewport *')].filter((e) => {
      if (e.closest('pre, table')) return false;
      const b = e.getBoundingClientRect();
      return b.width > 0 && b.right > innerWidth + 1;
    }).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${e.className}`);
    const clipped = [...document.querySelectorAll('.item, .essay-head h1, .shelf h1, .readout')].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim().slice(0, 40));
    // Text inside a menu item must stay inside it and must not run into its neighbours.
    const collisions = [];
    for (const item of document.querySelectorAll('.item')) {
      if (!item.offsetParent) continue;
      const ib = item.getBoundingClientRect();
      const parts = [...item.children].filter((e) => e.offsetParent).map((e) => [e, e.getBoundingClientRect()]);
      for (const [e, b] of parts) if (b.right > ib.right + 1 || b.left < ib.left - 1) collisions.push(`"${e.textContent.trim().slice(0, 25)}" sticks out of its item`);
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const [ea, a] = parts[i]; const [eb, b] = parts[j];
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) collisions.push(`"${ea.textContent.trim().slice(0, 20)}" overlaps "${eb.textContent.trim().slice(0, 20)}"`);
      }
    }
    const groups = ['.tv', '.dpad', '.ab', '.ss'].map((s) => [s, q(s)]).filter(([, b]) => b && b.shown);
    const strip = [...document.querySelectorAll('.strip [data-btn]')].map((e) => [e.dataset.btn, box(e)]);
    const phone = matchMedia('(max-width: 720px), (orientation: landscape) and (max-height: 520px)').matches;
    return { mode: de.dataset.mode, phone, iw: innerWidth, ih: innerHeight, sw: de.scrollWidth, sh: de.scrollHeight, screen: q('.screen'), view: q('.viewport'), btns, wide, clipped, groups, collisions, strip };
  });
  const L = `${label}`;
  assert(r.sw <= r.iw + 1, `${L}: page scrolls sideways (${r.sw}px content in a ${r.iw}px window)`);
  assert(!r.wide.length, `${L}: content wider than the window: ${r.wide.join(', ')}`);
  assert(!r.clipped.length, `${L}: text cut off: ${r.clipped.join(' | ')}`);
  assert(!r.collisions.length, `${L}: ${r.collisions.slice(0, 3).join('; ')}`);
  if (r.mode !== 'read' || !r.phone) {
    assert(r.sh <= r.ih + 1, `${L}: TV and controller are taller than the window (${r.sh}px in ${r.ih}px), so buttons need scrolling`);
    assert(r.view && r.view.h >= 120, `${L}: screen area is only ${Math.round(r.view?.h ?? 0)}px tall`);
    for (const [n, b, hit] of r.btns) {
      assert(b && b.shown, `${L}: button ${n} is not visible`);
      assert(b.x >= -1 && b.y >= -1 && b.r <= r.iw + 1 && b.b <= r.ih + 1, `${L}: button ${n} is partly off-screen`);
      assert(hit, `${L}: button ${n} is covered by another element and can't be clicked`);
    }
    for (let i = 0; i < r.groups.length; i++) for (let j = i + 1; j < r.groups.length; j++) {
      const [na, a] = r.groups[i]; const [nb, b] = r.groups[j];
      const ox = Math.min(a.r, b.r) - Math.max(a.x, b.x); const oy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
      assert(!(ox > 2 && oy > 2), `${L}: ${na} overlaps ${nb}`);
    }
    assert(!r.strip.some(([, b]) => b.shown), `${L}: the phone reading strip shows on a larger screen`);
  } else {
    for (const [n, b] of r.btns) assert(!b || !b.shown, `${L}: controller button ${n} still shows while reading on a phone`);
    assert(r.screen.x <= 1 && r.screen.r >= r.iw - 1, `${L}: reading screen doesn't fill the phone's width`);
    assert(r.strip.length === 4 && r.strip.every(([, b]) => b.shown && b.b <= r.ih + 1), `${L}: reading strip is missing or off-screen`);
  }
}

const PAGES = ['/', '/tech/', '/games/', '/essays/', '/projects/', '/posts/', '/about/',
  '/posts/press-start/', '/posts/how-this-blog-works/', '/posts/alok-pocket/', '/posts/formatting-sample/', '/posts/qa-older/', '/missing-page/'];

for (const vp of Object.keys(VIEWPORTS)) {
  for (const url of PAGES) {
    await test(`layout [${vp}] ${url}`, async (open) => {
      const p = await open(vp, url);
      await layout(p, `${url} at ${vp}`);
      if (!url.includes('missing')) noErrors(p);
    });
  }
  await test(`layout [${vp}] options panel fits on screen`, async (open) => {
    const p = await open(vp, '/');
    await p.keyboard.press('o');
    await sleep(250);
    const b = await p.$eval('.panel', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; });
    const vpSize = VIEWPORTS[vp];
    assert(b.x >= 0 && b.y >= 0 && b.r <= vpSize.width && b.b <= vpSize.height, `panel is partly off-screen (${JSON.stringify(b)})`);
    const clipped = await p.$$eval('.panel .item', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    assert(!clipped, 'panel items are cut off');
  });
}

// ---------- interactions ----------
for (const vp of ['desktop', 'phone']) {
  const T = (n, fn) => test(`[${vp}] ${n}`, fn);

  await T('menu: first item highlighted on load, no errors', async (open) => {
    const p = await open(vp, '/');
    assert((await selIndex(p)) === 0, `highlight is on item ${await selIndex(p)}`);
    noErrors(p);
  });
  await T('menu: ↓ ↑ keys move the highlight and wrap around', async (open) => {
    const p = await open(vp, '/');
    const n = await count(p, '[data-item]');
    await p.keyboard.press('ArrowDown');
    assert((await selIndex(p)) === 1, 'ArrowDown did not move to item 1');
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('ArrowUp');
    assert((await selIndex(p)) === n - 1, `ArrowUp from the top should wrap to the last item (${n - 1}), got ${await selIndex(p)}`);
    await p.keyboard.press('j');
    assert((await selIndex(p)) === 0, 'j should move down');
  });
  await T('menu: d-pad up/down move the highlight', async (open) => {
    const p = await open(vp, '/');
    await click(p, btn('down'));
    await click(p, btn('down'));
    assert((await selIndex(p)) === 2, `two d-pad downs should reach item 2, got ${await selIndex(p)}`);
    await click(p, btn('up'));
    assert((await selIndex(p)) === 1, 'd-pad up should go back to item 1');
  });
  await T('menu: holding d-pad down keeps moving', async (open) => {
    const p = await open(vp, '/');
    const [x, y] = await center(p, btn('down'));
    await p.mouse.move(x, y);
    await p.mouse.down();
    await sleep(900);
    await p.mouse.up();
    const i = await selIndex(p);
    assert(i >= 3, `holding down for ~1s only moved to item ${i}`);
    await sleep(400);
    assert((await selIndex(p)) === i, 'highlight kept moving after the button was released');
  });
  await T('menu: highlighted item stays visible when moving to the bottom', async (open) => {
    const p = await open(vp, '/');
    await p.keyboard.press('ArrowUp'); // wrap to last
    const inView = await p.evaluate(() => {
      const el = document.querySelector('[data-item].sel'); const v = document.querySelector('.viewport');
      const a = el.getBoundingClientRect(); const b = v.getBoundingClientRect();
      return a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
    });
    assert(inView, 'last item is highlighted but scrolled out of view');
  });
  await T('menu: Enter opens the highlighted item', async (open) => {
    const p = await open(vp, '/');
    await p.keyboard.press('ArrowDown');
    await expectNav(p, () => p.keyboard.press('Enter'), '/tech/');
  });
  await T('menu: A button opens the highlighted item', async (open) => {
    const p = await open(vp, '/');
    await click(p, btn('down'));
    await expectNav(p, () => click(p, btn('a')), '/tech/');
  });
  await T('menu: B, HOME, ← and → do nothing on the main menu', async (open) => {
    const p = await open(vp, '/');
    await expectStay(p, () => click(p, btn('b')), 'B');
    await expectStay(p, () => click(p, btn('home')), 'HOME');
    await expectStay(p, () => click(p, btn('left')), 'left');
    await expectStay(p, () => click(p, btn('right')), 'right');
    await expectStay(p, () => p.keyboard.press('Escape'), 'Esc');
    noErrors(p);
  });
  await T('menu: clicking an item opens it', async (open) => {
    const p = await open(vp, '/');
    const items = await p.$$('[data-item]');
    const href = await items[3].evaluate((e) => e.getAttribute('href'));
    await items[3].hover();
    assert((await selIndex(p)) === 3, 'hovering an item should highlight it');
    await expectNav(p, () => items[3].click(), href);
  });
  await T('menu: highlight is remembered after going back', async (open) => {
    const p = await open(vp, '/');
    for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowDown');
    const href = await p.$eval('[data-item].sel', (e) => e.getAttribute('href'));
    await expectNav(p, () => p.keyboard.press('Enter'), href);
    await expectNav(p, () => p.keyboard.press('Escape'), '/');
    assert((await selIndex(p)) === 3, `came back to item ${await selIndex(p)} instead of 3`);
  });

  await T('options: OPTIONS button opens and closes the panel', async (open) => {
    const p = await open(vp, '/');
    await click(p, btn('options'));
    assert(await panelOpen(p), 'panel did not open');
    assert((await selIndex(p, '[data-pitem]')) === 0, 'first panel item should be highlighted');
    await click(p, btn('options'));
    assert(!(await panelOpen(p)), 'second press did not close the panel');
  });
  await T('options: d-pad moves inside the panel, not the menu behind it', async (open) => {
    const p = await open(vp, '/');
    await click(p, btn('options'));
    await click(p, btn('down'));
    assert((await selIndex(p, '[data-pitem]')) === 1, 'd-pad down did not move the panel highlight');
    assert((await selIndex(p)) === 0, 'the menu behind the panel moved too');
  });
  await T('options: A on Screen tint cycles the tint and updates the label', async (open) => {
    const p = await open(vp, '/');
    const before = await tint(p);
    await click(p, btn('options'));
    await click(p, btn('down'));
    await click(p, btn('a'));
    const after = await tint(p);
    assert(after && after !== before, `tint stayed ${before}`);
    const labels = await p.$$eval('[data-tint-label]', (els) => els.map((e) => e.textContent));
    assert(labels.every((l) => l === after.toUpperCase()), `labels say ${labels}, tint is ${after}`);
    assert(await panelOpen(p), 'panel closed after changing tint');
  });
  await T('options: Sound toggles and is remembered', async (open) => {
    const p = await open(vp, '/');
    await click(p, btn('options'));
    await click(p, btn('down'));
    await click(p, btn('down'));
    await click(p, btn('a'));
    assert((await p.$eval('.panel [data-sound-label]', (e) => e.textContent)) === 'ON', 'sound label did not switch to ON');
    await p.reload({ waitUntil: 'networkidle0' });
    await p.keyboard.press('o');
    assert((await p.$eval('.panel [data-sound-label]', (e) => e.textContent)) === 'ON', 'sound setting was forgotten after reload');
    noErrors(p);
  });
  await T('options: B, Esc, HOME, Close and clicking outside all close it without leaving', async (open) => {
    const p = await open(vp, '/tech/');
    const ways = {
      B: () => click(p, btn('b')),
      Esc: () => p.keyboard.press('Escape'),
      HOME: () => click(p, btn('home')),
      Close: () => click(p, '[data-action="close"]'),
      outside: async () => { const b = await (await p.$('#options')).boundingBox(); await p.mouse.click(b.x + 4, b.y + b.height - 4); },
    };
    for (const [name, fn] of Object.entries(ways)) {
      await p.keyboard.press('o');
      assert(await panelOpen(p), `panel did not open before testing ${name}`);
      await expectStay(p, fn, name);
      assert(!(await panelOpen(p)), `${name} did not close the panel`);
    }
  });
  await T('options: ← → are ignored while the panel is open', async (open) => {
    const p = await open(vp, '/tech/');
    await click(p, btn('options'));
    await expectStay(p, () => click(p, btn('right')), 'right');
    await expectStay(p, () => p.keyboard.press('ArrowLeft'), 'ArrowLeft');
    assert(await panelOpen(p), 'panel closed');
  });
  await T('options: "Options" item in the main menu opens the panel', async (open) => {
    const p = await open(vp, '/');
    const idx = await p.$$eval('[data-item]', (els) => els.findIndex((e) => e.dataset.action === 'options'));
    assert(idx >= 0, 'no Options item in the menu');
    for (let i = 0; i < idx; i++) await p.keyboard.press('ArrowDown');
    await p.keyboard.press('Enter');
    assert(await panelOpen(p), 'Enter on Options did not open the panel');
    await p.keyboard.press('Escape');
    await click(p, `[data-item][data-action="options"]`);
    assert(await panelOpen(p), 'clicking Options did not open the panel');
  });
  await T('options: Random post opens a post', async (open) => {
    const p = await open(vp, '/');
    await click(p, btn('options'));
    await click(p, btn('down'));
    await click(p, btn('down'));
    await click(p, btn('down'));
    await expectNav(p, () => click(p, btn('a')), (u) => u.startsWith('/posts/') && u !== '/posts/');
  });
  await T('options: Text size changes the reading text and is remembered', async (open) => {
    const p = await open(vp, '/posts/how-this-blog-works/');
    const fs = () => p.$eval('.prose p', (e) => parseFloat(getComputedStyle(e).fontSize));
    const m = await fs();
    await p.keyboard.press('o');
    await p.keyboard.press('Enter');
    const l = await fs();
    assert(l > m, `text size went from ${m} to ${l}, expected bigger`);
    assert((await p.$eval('[data-size-label]', (e) => e.textContent)) === 'L', 'size label did not say L');
    await p.reload({ waitUntil: 'networkidle0' });
    assert((await fs()) === l, 'text size was forgotten after reload');
    await p.keyboard.press('o');
    await p.keyboard.press('Enter');
    assert((await fs()) < m, 'pressing again should go to the small size');
  });
  await T('options: tint carries over to other pages', async (open) => {
    const p = await open(vp, '/');
    await p.keyboard.press('t');
    const t = await tint(p);
    await p.goto(BASE + '/posts/press-start/', { waitUntil: 'networkidle0' });
    assert((await tint(p)) === t, `tint was ${t} on the menu but ${await tint(p)} on a post`);
  });
  await T('options: focus moves into the panel and back', async (open) => {
    const p = await open(vp, '/');
    await p.keyboard.press('o');
    assert(await p.evaluate(() => !!document.activeElement.closest('#options')), 'focus is not inside the open panel');
    await p.keyboard.press('Escape');
    assert(await p.evaluate(() => !document.activeElement.closest('#options')), 'focus stayed in the closed panel');
  });

  await T('shelf: → ← and the d-pad change channel in order, wrapping through All posts', async (open) => {
    const p = await open(vp, '/tech/');
    await expectNav(p, () => p.keyboard.press('ArrowRight'), '/games/');
    await expectNav(p, () => click(p, btn('right')), '/essays/');
    await expectNav(p, () => p.keyboard.press('ArrowLeft'), '/games/');
    await expectNav(p, () => click(p, btn('left')), '/tech/');
    await expectNav(p, () => click(p, btn('left')), '/posts/');
    await expectNav(p, () => click(p, btn('left')), '/projects/');
    await expectNav(p, () => click(p, btn('right')), '/posts/');
    await expectNav(p, () => click(p, btn('right')), '/tech/');
    noErrors(p);
  });
  await T('shelf: changing channel plays static on the next page', async (open) => {
    const p = await open(vp, '/tech/');
    await expectNav(p, () => p.keyboard.press('ArrowRight'), '/games/');
    assert(await p.$eval('.static', (e) => e.classList.contains('on') || !!e.style.backgroundImage), 'no static after changing channel');
  });
  await T('knobs: CHANNEL knob steps through every channel and back to the menu', async (open) => {
    const p = await open(vp, '/');
    const order = ['/posts/', '/tech/', '/games/', '/essays/', '/projects/', '/'];
    for (const u of order) await expectNav(p, () => click(p, '[data-knob="channel"]'), u, 'CHANNEL knob: ');
    assert((await p.$eval('.knobs .readout', (e) => e.textContent)) === 'MENU', 'channel readout should say MENU on the main menu');
  });
  await T('knobs: TINT knob and the speaker change tint and sound', async (open) => {
    const p = await open(vp, '/tech/');
    const before = await tint(p);
    await click(p, '[data-knob="tint"]');
    const after = await tint(p);
    assert(after !== before, 'TINT knob did not change the tint');
    assert((await p.$eval('.knobs [data-tint-label]', (e) => e.textContent)) === after.toUpperCase(), 'tint readout is wrong');
    await click(p, '[data-knob="sound"]');
    assert((await p.$eval('.knobs [data-sound-label]', (e) => e.textContent)) === 'ON', 'speaker did not switch sound on');
    noErrors(p);
  });
  await T('shelf: B, Esc and the ◀ B status bar button go to the main menu', async (open) => {
    const p = await open(vp, '/tech/');
    await expectNav(p, () => click(p, btn('b')), '/');
    await p.goto(BASE + '/tech/', { waitUntil: 'networkidle0' });
    await expectNav(p, () => p.keyboard.press('Escape'), '/');
    await p.goto(BASE + '/tech/', { waitUntil: 'networkidle0' });
    await expectNav(p, () => click(p, '.statusbar .back'), '/');
  });
  await T('shelf: HOME goes to the main menu', async (open) => {
    const p = await open(vp, '/tech/');
    await expectNav(p, () => click(p, btn('home')), '/');
  });
  await T('shelf: A and Enter open the highlighted post', async (open) => {
    const p = await open(vp, '/tech/');
    await expectNav(p, () => click(p, btn('a')), '/posts/how-this-blog-works/');
    await p.goto(BASE + '/tech/', { waitUntil: 'networkidle0' });
    await p.keyboard.press('ArrowDown');
    await expectNav(p, () => p.keyboard.press('Enter'), '/posts/qa-older/');
  });
  await T('shelf: All posts is channel 1, and B goes to the main menu', async (open) => {
    const p = await open(vp, '/posts/');
    assert((await p.$eval('.chan', (e) => e.textContent)) === 'CH 1 · ALL', 'All posts is not labelled CH 1');
    await expectNav(p, () => p.keyboard.press('Escape'), '/');
  });

  await T('read: Esc, B and the ◀ Tech log link go back to the channel', async (open) => {
    const p = await open(vp, '/posts/how-this-blog-works/');
    assert((await p.$eval('.crumb', (e) => e.textContent.trim())) === '◀ Tech log', 'back link should say ◀ Tech log');
    await expectNav(p, () => p.keyboard.press('Escape'), '/tech/');
    await p.goto(BASE + '/posts/how-this-blog-works/', { waitUntil: 'networkidle0' });
    await expectNav(p, () => click(p, '.crumb'), '/tech/');
    await p.goto(BASE + '/posts/how-this-blog-works/', { waitUntil: 'networkidle0' });
    await expectNav(p, () => tapOrClick(p, vp, btn('b')), '/tech/');
  });
  await T('read: the screen is quiet (no clock, battery or hints)', async (open) => {
    const p = await open(vp, '/posts/how-this-blog-works/');
    for (const s of ['.statusbar .where', '[data-clock]', '.batt', '.hints']) assert(!(await p.$(s)), `${s} shows while reading`);
  });
  await T('read: → and ← move to older and newer posts on the same shelf', async (open) => {
    const p = await open(vp, '/posts/how-this-blog-works/');
    await expectStay(p, () => p.keyboard.press('ArrowLeft'), 'ArrowLeft on the newest post');
    await expectNav(p, () => p.keyboard.press('ArrowRight'), '/posts/qa-older/');
    await expectNav(p, () => p.keyboard.press('ArrowRight'), '/posts/qa-oldest/');
    await expectStay(p, () => p.keyboard.press('ArrowRight'), 'ArrowRight on the oldest post');
    await expectNav(p, () => p.keyboard.press('k'), '/posts/qa-older/');
    await expectNav(p, () => p.keyboard.press('j'), '/posts/qa-oldest/');
  });
  await T('read: newer/older links at the end of a post work', async (open) => {
    const p = await open(vp, '/posts/qa-older/');
    await expectNav(p, () => click(p, '.pn.older'), '/posts/qa-oldest/');
    await expectNav(p, () => click(p, '.pn.newer'), '/posts/qa-older/');
  });
  await T('read: ↓ and Space scroll the text', async (open) => {
    const p = await open(vp, '/posts/qa-older/');
    await p.keyboard.press('ArrowDown');
    await sleep(400);
    const y1 = await readScroll(p);
    assert(y1 > 0, 'ArrowDown did not scroll');
    await p.keyboard.press('Space');
    await sleep(600);
    assert((await readScroll(p)) > y1, 'Space did not scroll');
  });
  await T('read: ↓ scrolls even after clicking outside the screen', async (open) => {
    const p = await open(vp, '/posts/qa-older/');
    await p.mouse.click(2, 2);
    await p.keyboard.press('ArrowDown');
    await p.keyboard.press('ArrowDown');
    await sleep(500);
    assert((await readScroll(p)) > 0, 'ArrowDown did not scroll');
  });
  await T('read: the progress line fills as you scroll', async (open) => {
    const p = await open(vp, '/posts/qa-older/');
    const v0 = Number(await p.$eval('[data-batt]', (e) => e.style.getPropertyValue('--p')));
    await p.evaluate(() => { const v = document.getElementById('viewport'); v.scrollTop = v.scrollHeight; scrollTo(0, document.documentElement.scrollHeight); });
    await sleep(300);
    const v1 = Number(await p.$eval('[data-batt]', (e) => e.style.getPropertyValue('--p')));
    assert(v0 < 0.1 && v1 > 0.95, `progress went from ${v0} to ${v1}`);
  });
  await T('read: footnotes jump to the note and back', async (open) => {
    const p = await open(vp, '/posts/qa-older/');
    await click(p, '.fnref a');
    await sleep(700);
    assert(new URL(p.url()).hash === '#fn-1', `URL hash is ${new URL(p.url()).hash}`);
    const visible = (s) => p.$eval(s, (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 0; });
    assert(await visible('#fn-1'), 'the note is not on screen after following the footnote');
    assert(await p.$eval('#fn-1', (e) => e.textContent.includes('The note')), 'note text is missing');
    await click(p, '#fn-1 .fn-back');
    await sleep(700);
    assert(await visible('#fnref-1'), 'the ↩ link did not go back to the text');
    assert((await p.$eval('.thanks', (e) => e.textContent)) === 'Thanks to the QA robot for reading drafts of this.', 'thanks line is wrong');
  });
  await T('read: O opens options over the article, Esc closes without leaving', async (open) => {
    const p = await open(vp, '/posts/qa-older/');
    await p.evaluate(() => { document.getElementById('viewport').scrollTop = 1500; scrollTo(0, 1500); });
    await sleep(100);
    await p.keyboard.press('o');
    assert(await panelOpen(p), 'panel did not open');
    const inView = await p.$eval('.panel', (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    assert(inView, 'panel is not visible after scrolling down');
    await p.keyboard.press('ArrowDown');
    assert((await selIndex(p, '[data-pitem]')) === 1, 'ArrowDown did not move inside the panel');
    await expectStay(p, () => p.keyboard.press('Escape'), 'Esc with panel open');
    assert(!(await panelOpen(p)), 'Esc did not close the panel');
  });
  await T('read: M goes to the main menu', async (open) => {
    const p = await open(vp, '/posts/press-start/');
    await expectNav(p, () => p.keyboard.press('m'), '/');
  });
  await T('read: links inside a post work', async (open) => {
    const p = await open(vp, '/posts/alok-pocket/');
    await expectNav(p, () => click(p, '.prose a[href="/posts/how-this-blog-works/"]'), '/posts/how-this-blog-works/');
  });
  await T('read: the back link goes to the post\'s channel', async (open) => {
    const p = await open(vp, '/posts/alok-pocket/');
    await expectNav(p, () => click(p, '.crumb'), '/projects/');
  });
  await T('about: B goes to the main menu', async (open) => {
    const p = await open(vp, '/about/');
    await expectNav(p, () => p.keyboard.press('Escape'), '/');
  });
  await T('404: shows GAME OVER and Continue goes home', async (open) => {
    const p = await open(vp, '/missing-page/');
    assert((await p.$eval('.logo', (e) => e.textContent)) === 'GAME OVER', '404 page does not say GAME OVER');
    await expectNav(p, () => p.keyboard.press('Enter'), '/');
  });
}

// ---------- one-off behaviour ----------
await test('boot screen plays on first visit, then hides itself', async (open) => {
  const p = await open('desktop', '/', { boot: true });
  assert(await p.evaluate(() => document.documentElement.classList.contains('booting')), 'boot screen did not start');
  await sleep(2300);
  assert(await p.evaluate(() => !document.documentElement.classList.contains('booting')), 'boot screen never finished');
  const visible = await p.$eval('.boot', (e) => getComputedStyle(e).display !== 'none');
  assert(!visible, 'boot screen still visible');
  await p.reload({ waitUntil: 'networkidle0' });
  assert(await p.evaluate(() => !document.documentElement.classList.contains('booting')), 'boot screen played again on reload');
});
await test('boot screen: a key press skips it and still works as input', async (open) => {
  const p = await open('desktop', '/', { boot: true });
  await p.keyboard.press('ArrowDown');
  await sleep(100);
  assert(await p.evaluate(() => !document.documentElement.classList.contains('booting')), 'key press did not skip boot');
});
await test('boot screen is skipped with reduced motion', async (open) => {
  const p = await open('desktop', '/', { boot: true, reduced: true });
  assert(await p.evaluate(() => !document.documentElement.classList.contains('booting')), 'boot screen played with reduced motion on');
});
await test('dark-mode visitors start on the night tint', async (open) => {
  const p = await open('desktop', '/', { scheme: 'dark' });
  assert((await tint(p)) === 'night', `got ${await tint(p)}`);
  const q = await open('desktop', '/', { scheme: 'light' });
  assert((await tint(q)) === 'amber', `light mode got ${await tint(q)}`);
});
await test('saved tint wins over dark mode', async (open) => {
  const p = await open('desktop', '/', { scheme: 'dark', storage: { tint: 'ice' } });
  assert((await tint(p)) === 'ice', `got ${await tint(p)}`);
});
await test('every tint keeps text readable (contrast ≥ 4.5)', async (open) => {
  const p = await open('desktop', '/posts/how-this-blog-works/');
  for (const t of ['amber', 'mint', 'ice', 'night']) {
    const ratios = await p.evaluate((t) => {
      document.documentElement.dataset.tint = t;
      const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const bg = getComputedStyle(document.querySelector('.screen')).backgroundColor;
      return Object.fromEntries(['.prose p', '.essay-date', '.crumb', '.prose code', '.fnref a', '.thanks', '.essay-next span'].map((s) => {
        const e = document.querySelector(s);
        const own = getComputedStyle(e).backgroundColor;
        const back = own === 'rgba(0, 0, 0, 0)' ? bg : own;
        return [s, Math.round(ratio(getComputedStyle(e).color, back) * 10) / 10];
      }));
    }, t);
    for (const [s, r] of Object.entries(ratios)) assert(r >= 4.5, `${t}: ${s} contrast is only ${r}`);
  }
});
await test('every tint keeps menus readable (contrast ≥ 4.5)', async (open) => {
  const p = await open('desktop', '/tech/');
  for (const t of ['amber', 'mint', 'ice', 'night']) {
    const ratios = await p.evaluate((t) => {
      document.documentElement.dataset.tint = t;
      const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const bg = getComputedStyle(document.querySelector('.screen')).backgroundColor;
      return Object.fromEntries(['.statusbar .where', '.blurb', '.chan', '.item-post:not(.sel) .sub'].map((s) => [s, Math.round(ratio(getComputedStyle(document.querySelector(s)).color, bg) * 10) / 10]));
    }, t);
    for (const [s, r] of Object.entries(ratios)) assert(r >= 4.5, `${t}: ${s} contrast is only ${r}`);
  }
});
await test('desktop: the controller still works while reading inside the TV', async (open) => {
  const p = await open('desktop', '/posts/qa-older/');
  await click(p, btn('down'));
  await sleep(400);
  const y1 = await p.$eval('#viewport', (e) => e.scrollTop);
  assert(y1 > 0, 'd-pad down did not scroll the screen');
  await click(p, btn('a'));
  await sleep(600);
  const y2 = await p.$eval('#viewport', (e) => e.scrollTop);
  assert(y2 > y1 + 200, 'A did not move down a page');
  assert((await p.evaluate(() => scrollY)) === 0, 'the window scrolled instead of the screen');
  await expectNav(p, () => click(p, btn('right')), '/posts/qa-oldest/');
});
await test('phone: the reading strip hides on scroll down and comes back on scroll up or a tap', async (open) => {
  const p = await open('phone', '/posts/qa-older/');
  const away = () => p.$eval('.strip', (e) => e.classList.contains('away'));
  assert(!(await away()), 'strip should show at the top of a post');
  for (let y = 200; y <= 1400; y += 200) { await p.evaluate((y) => scrollTo(0, y), y); await sleep(40); }
  await sleep(300);
  assert(await away(), 'strip did not hide while scrolling down');
  await p.evaluate(() => scrollTo(0, scrollY - 300));
  await sleep(300);
  assert(!(await away()), 'strip did not come back on scroll up');
  for (let y = 1500; y <= 2500; y += 200) { await p.evaluate((y) => scrollTo(0, y), y); await sleep(40); }
  await sleep(300);
  await tap(p, '.prose p:nth-of-type(3)');
  await sleep(300);
  assert(!(await away()), 'tapping the text did not bring the strip back');
  await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await sleep(300);
  assert(!(await away()), 'strip should show at the end of a post');
});
await test('phone: strip ◀ ▶ go to newer and older posts, OPTIONS opens the panel', async (open) => {
  const p = await open('phone', '/posts/qa-older/');
  await tap(p, '.strip [data-btn="options"]');
  assert(await panelOpen(p), 'strip OPTIONS did not open the panel');
  await tap(p, '.strip [data-btn="b"]');
  assert(!(await panelOpen(p)), 'strip B did not close the panel');
  await expectNav(p, () => tap(p, '.strip [data-btn="right"]'), '/posts/qa-oldest/');
  await expectNav(p, () => tap(p, '.strip [data-btn="left"]'), '/posts/qa-older/');
  await expectNav(p, () => tap(p, '.strip [data-btn="left"]'), '/posts/how-this-blog-works/');
  assert(await p.$eval('.strip [data-btn="left"]', (e) => e.disabled), '◀ should be disabled on the newest post');
});
await test('menu: hovering with the mouse moves the keyboard focus too (one highlight only)', async (open) => {
  const p = await open('desktop', '/');
  await p.keyboard.press('ArrowDown');
  const items = await p.$$('[data-item]');
  await items[4].hover();
  const r = await p.evaluate(() => ({ sel: [...document.querySelectorAll('[data-item]')].findIndex((e) => e.classList.contains('sel')), focus: [...document.querySelectorAll('[data-item]')].indexOf(document.activeElement) }));
  assert(r.sel === 4 && r.focus === 4, `highlight on ${r.sel}, focus on ${r.focus}`);
});
await test('phone: tapping the on-screen buttons works (touch)', async (open) => {
  const p = await open('phone', '/');
  await tap(p, btn('down'));
  assert((await selIndex(p)) === 1, 'tap on d-pad down did not move the highlight');
  await tap(p, btn('options'));
  assert(await panelOpen(p), 'tap on OPTIONS did not open the panel');
  await tap(p, btn('b'));
  assert(!(await panelOpen(p)), 'tap on B did not close the panel');
  await expectNav(p, () => tap(p, btn('a')), '/tech/');
  await expectNav(p, () => tap(p, btn('home')), '/');
});
await test('phone: tapping a menu item opens it', async (open) => {
  const p = await open('phone', '/');
  await expectNav(p, () => tap(p, '[data-item][href="/essays/"]'), '/essays/');
});
await test('without JavaScript: links still work and JS-only items are hidden', async (open) => {
  const p = await open('desktop', '/', { js: false });
  const hidden = await p.$$eval('[data-action]', (els) => els.every((e) => e.getBoundingClientRect().height === 0));
  assert(hidden, 'buttons that need JavaScript are visible');
  assert(!(await p.$eval('#options', (e) => e.getBoundingClientRect().height > 0)), 'options panel is visible');
  await expectNav(p, () => click(p, '[data-item][href="/tech/"]'), '/tech/');
  await expectNav(p, () => click(p, '[data-knob="channel"]'), '/games/');
  await expectNav(p, () => click(p, '[data-item][href^="/posts/"]'), (u) => u.startsWith('/posts/'));
  assert(await p.$eval('.notes, .prose', (e) => !!e), 'post did not render');
});
await test('every internal link and asset returns 200', async (open) => {
  const p = await open('desktop', '/');
  const seen = new Set(); const bad = [];
  const queue = ['/'];
  while (queue.length) {
    const u = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    const res = await fetch(BASE + u);
    if (res.status !== 200) { bad.push(`${u} → ${res.status}`); continue; }
    if (!(res.headers.get('content-type') || '').includes('html')) continue;
    const html = await res.text();
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
      const link = m[1].split('?')[0];
      if (!seen.has(link)) queue.push(link);
    }
  }
  await p.close();
  assert(!bad.length, `broken links: ${bad.join(', ')}`);
  assert(seen.size > 15, `only crawled ${seen.size} URLs`);
});
await test('feed, sitemap and posts.json are valid', async () => {
  const feed = await (await fetch(BASE + '/feed.xml')).text();
  assert(feed.startsWith('<?xml') && feed.includes('<rss') && feed.includes('<item>'), 'feed.xml looks wrong');
  const sm = await (await fetch(BASE + '/sitemap.xml')).text();
  assert(sm.includes('<urlset') && sm.includes('/posts/press-start/'), 'sitemap.xml looks wrong');
  const list = await (await fetch(BASE + '/posts.json')).json();
  assert(Array.isArray(list) && list.every((u) => u.startsWith('/posts/')), 'posts.json looks wrong');
});
await test('production build leaves out drafts', async () => {
  const out = path.join(QA, 'prod');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { env: { ...process.env, OUT_DIR: out }, stdio: 'pipe' });
  assert(!fs.existsSync(path.join(out, 'posts/formatting-sample')), 'draft post was published');
  assert(!fs.readFileSync(path.join(out, 'feed.xml'), 'utf8').includes('Formatting sample'), 'draft is in the RSS feed');
});

// ---------- report ----------
await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n\n${results.length - failed.length}/${results.length} checks passed.`);
for (const f of failed) console.log(`\n✗ ${f.name}\n  ${f.err}`);
process.exit(failed.length ? 1 : 0);
