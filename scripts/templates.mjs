// HTML templates for every page. Pure functions: data in, HTML string out.
//
// Every page is the same scene: a small TV (screen + knobs) wired to a controller.
// Menus and shelves show on the coloured screen; posts turn the screen into quiet paper.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const attr = (name, value) => (value ? ` ${name}="${esc(value)}"` : '');

export const monthYear = (d) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export const shortDate = (d) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' }).toUpperCase();

// Runs before first paint: applies the saved tint and text size, and decides whether to play the boot screen.
const headScript = `(function(){var r=document.documentElement,t=null,s=null;try{t=localStorage.getItem('tint');s=localStorage.getItem('size')}catch(e){}
r.dataset.tint=t||(matchMedia('(prefers-color-scheme: dark)').matches?'night':'amber');if(s)r.dataset.size=s;r.classList.add('js');
if(r.dataset.mode==='menu'&&location.pathname==='/'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
try{if(!sessionStorage.getItem('booted')){sessionStorage.setItem('booted','1');r.classList.add('booting')}}catch(e){}}})();`;

const HINTS = {
  menu: [['↑↓', 'move'], ['⏎', 'open'], ['O', 'options']],
  list: [['↑↓', 'move'], ['←→', 'channel'], ['⏎', 'open'], ['esc', 'back']],
  read: [],
};

const chName = (c, i) => (i === 0 ? 'MENU' : `CH${i} ${c.short}`);

function statusBar({ mode, back, backLabel, status }) {
  if (mode === 'read') {
    return `<header class="statusbar">
          ${back ? `<a class="crumb" href="${esc(back)}">◀ ${esc(backLabel)}</a>` : ''}
          <i class="line" data-batt title="Reading progress"></i>
        </header>`;
  }
  return `<header class="statusbar">
          ${back ? `<a class="back" href="${esc(back)}" aria-label="Back">◀ B</a>` : ''}
          <span class="where">${esc(status)}</span>
          <span class="sys" aria-hidden="true"><span class="clock" data-clock></span><span class="batt"><i></i></span></span>
        </header>`;
}

// While reading on a phone, the controller folds into this strip at the bottom.
function strip({ prev, next }) {
  return `<nav class="strip" aria-hidden="true">
  <div class="ctl"><div class="rocker"><button type="button" tabindex="-1" data-btn="left"${prev ? '' : ' disabled'}>◀</button><button type="button" tabindex="-1" data-btn="right"${next ? '' : ' disabled'}>▶</button></div><span class="lbl">NEWER · OLDER</span></div>
  <button type="button" tabindex="-1" class="pill" data-btn="options"><i></i><span class="lbl">OPTIONS</span></button>
  <div class="ctl end"><button type="button" tabindex="-1" class="sb" data-btn="b">B</button><span class="lbl">BACK</span></div>
</nav>`;
}

export function page(site, o) {
  const { title, description = site.description, mode = 'menu', back = '', backLabel = '', prev = '', next = '', status = '', body, path, version, ch = 0, channels } = o;
  const fullTitle = title ? `${title} · ${site.title}` : `${site.title} · ${site.description}`;
  const hints = HINTS[mode];
  const nextCh = channels[(ch + 1) % channels.length];
  const boot = mode === 'menu' && path === '/'
    ? `<div class="boot" aria-hidden="true"><p class="boot-logo">${esc(site.logo)}</p><p class="boot-sub">POCKET</p></div>`
    : '';
  return `<!doctype html>
<html lang="en" data-mode="${mode}"${attr('data-back', back)}${attr('data-prev', prev)}${attr('data-next', next)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(site.url + path)}">
<meta property="og:title" content="${esc(title || site.title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${mode === 'read' ? 'article' : 'website'}">
<meta property="og:url" content="${esc(site.url + path)}">
<meta name="theme-color" content="#3f6ac9">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@400;700&family=Pixelify+Sans:wght@400;600;700&family=Press+Start+2P&display=swap">
<link rel="stylesheet" href="/assets/style.css?v=${version}">
<script>${headScript}</script>
<script src="/assets/app.js?v=${version}" defer></script>
</head>
<body>
<a class="skip" href="#viewport">Skip to content</a>
<div class="scene" id="scene">
  <svg class="cable" aria-hidden="true"><path class="c-shadow"/><path class="c-main"/><path class="c-hi"/></svg>
  <div class="tvwrap">
    <div class="tv">
      <div class="surround">
        <main class="screen" id="screen">
          ${boot}
          ${statusBar({ mode, back, backLabel, status })}
          <div class="viewport" id="viewport" tabindex="-1">
${body}
          </div>
          ${hints.length ? `<footer class="hints" aria-hidden="true">${hints.map(([k, v]) => `<span><b>${k}</b> ${v}</span>`).join('')}</footer>` : ''}
          <div class="static" aria-hidden="true"></div>
          <div class="panel-backdrop" id="options" hidden>
            <div class="panel" role="dialog" aria-modal="true" aria-labelledby="options-title">
              <p class="panel-title" id="options-title">OPTIONS</p>
              <ul class="list">
                <li><button class="item" data-pitem data-action="size" type="button"><span class="t">Text size</span><span class="meta" data-size-label>M</span></button></li>
                <li><button class="item" data-pitem data-action="tint" type="button"><span class="t">Screen tint</span><span class="meta" data-tint-label>AMBER</span></button></li>
                <li><button class="item" data-pitem data-action="sound" type="button"><span class="t">Sound</span><span class="meta" data-sound-label>OFF</span></button></li>
                <li><button class="item" data-pitem data-action="random" type="button"><span class="t">Random post</span></button></li>
                <li><button class="item" data-pitem data-action="close" type="button"><span class="t">Close</span><span class="meta">B</span></button></li>
              </ul>
            </div>
          </div>
        </main>
        <p class="plate" aria-hidden="true"><span>${esc(site.logo)} <i>POCKET</i></span><span>COLOUR 14"</span></p>
      </div>
      <div class="knobs">
        <div class="dialbox">
          <span class="lbl">CHANNEL</span>
          <a class="dial" data-knob="channel" href="${esc(nextCh.url)}" style="--ch:${ch}" aria-label="Channel: switch to ${esc(nextCh.label)}"><span class="ptr"></span></a>
          <span class="readout">${esc(chName(channels[ch], ch))}</span>
        </div>
        <div class="dialbox">
          <span class="lbl">TINT</span>
          <button class="dial tint-dial" data-knob="tint" type="button" aria-label="Screen tint"><span class="ptr"></span></button>
          <span class="readout" data-tint-label>AMBER</span>
        </div>
        <div class="dialbox">
          <button class="grille" data-knob="sound" type="button" aria-label="Sound"></button>
          <span class="lbl"><span class="sw">SOUND </span><span data-sound-label>OFF</span></span>
        </div>
        <div class="power" aria-hidden="true"><span class="led"></span><span class="lbl">POWER</span></div>
      </div>
    </div>
    <div class="feet" aria-hidden="true"><span></span><span></span></div>
  </div>
  <div class="pad">
    <span class="plug" aria-hidden="true"></span>
    <div class="dpad" aria-hidden="true">
      <button type="button" tabindex="-1" class="up" data-btn="up">▲</button>
      <button type="button" tabindex="-1" class="left" data-btn="left">◀</button>
      <span class="hub"></span>
      <button type="button" tabindex="-1" class="right" data-btn="right">▶</button>
      <button type="button" tabindex="-1" class="down" data-btn="down">▼</button>
    </div>
    <div class="ss" aria-hidden="true">
      <button type="button" tabindex="-1" data-btn="options"><i></i>OPTIONS</button>
      <button type="button" tabindex="-1" data-btn="home"><i></i>HOME</button>
    </div>
    <div class="ab" aria-hidden="true">
      <button type="button" tabindex="-1" class="b" data-btn="b">B</button>
      <button type="button" tabindex="-1" class="a" data-btn="a">A</button>
    </div>
  </div>
</div>
${mode === 'read' ? strip({ prev, next }) : ''}
</body>
</html>
`;
}

function postItem(p, { showCat = false } = {}) {
  return `<li><a class="item item-post" data-item href="${p.url}">
  <span class="t">${esc(p.title)}</span>
  <span class="sub">${showCat ? `<span class="tag">${esc(p.cat.short)}</span>` : ''}${p.draft ? '<span class="tag">DRAFT</span>' : ''}<span>${shortDate(p.date)} · ${p.minutes} min</span></span>
  ${p.summary ? `<span class="sum">${esc(p.summary)}</span>` : ''}
</a></li>`;
}

export function menuBody(site, { posts, counts, channels }) {
  const latest = posts[0];
  const chItem = (i, count) => {
    const c = channels[i];
    return `<li><a class="item" data-item href="${c.url}"><span class="t">${esc(c.label)}</span><span class="meta">CH${i} · ${count}</span></a></li>`;
  };
  return `<section class="menu">
  <div class="logo-wrap"><h1 class="logo">${esc(site.logo)}</h1><p class="tagline">${esc(site.description)}</p></div>
  <nav aria-label="Main menu"><ul class="list">
    ${latest ? `<li><a class="item" data-item href="${latest.url}"><span class="tag">NEW</span><span class="t">${esc(latest.title)}</span></a></li>` : ''}
    ${channels.map((c, i) => (i >= 2 ? chItem(i, counts[c.key]) : '')).join('\n    ')}
    ${chItem(1, posts.length)}
    <li><a class="item" data-item href="/about/"><span class="t">About</span></a></li>
    <li><a class="item" data-item href="/feed.xml"><span class="t">RSS feed</span></a></li>
    <li><button class="item" data-item data-action="options" type="button"><span class="t">Options</span><span class="meta">text · tint · sound</span></button></li>
  </ul></nav>
</section>`;
}

export function listBody({ ch, channel, posts, showCat = false }) {
  return `<section class="shelf">
  <p class="chan">CH ${ch} · ${esc(channel.short)}</p>
  <h1>${esc(channel.label)}</h1>
  ${channel.blurb ? `<p class="blurb">${esc(channel.blurb)}</p>` : ''}
  ${posts.length
    ? `<ol class="list">${posts.map((p) => postItem(p, { showCat })).join('\n')}</ol>`
    : `<p class="empty">Nothing on this channel yet.<br>Check back soon.</p>`}
</section>`;
}

// Footnotes collected under "Notes", then the thanks line.
function endMatter(p) {
  const notes = p.notes?.length
    ? `<section class="notes" aria-label="Notes">
<p class="notes-h">Notes</p>
${p.notes.map((n) => `<p class="fn" id="fn-${n.n}">[${n.n}] ${n.html} <a class="fn-back" href="#fnref-${n.n}" aria-label="Back to the text">↩</a></p>`).join('\n')}
</section>`
    : '';
  const thanks = p.thanks ? `<p class="thanks">Thanks to ${esc(p.thanks)} for reading drafts of this.</p>` : '';
  return notes + thanks;
}

export function postBody(p, { newer, older }) {
  const isProject = p.cat.key === 'projects';
  const facts = isProject && (p.status || p.stack)
    ? `<dl class="facts">${p.status ? `<div><dt>Status</dt><dd>${esc(p.status)}</dd></div>` : ''}${p.stack ? `<div><dt>Stack</dt><dd>${esc([].concat(p.stack).join(', '))}</dd></div>` : ''}</dl>`
    : '';
  const links = [p.link && `<a href="${esc(p.link)}">Visit ↗</a>`, p.repo && `<a href="${esc(p.repo)}">Source ↗</a>`].filter(Boolean).join('');
  const nav = (q, dir) =>
    q ? `<p><span>${dir === 'newer' ? 'Newer' : 'Older'}:</span> <a class="pn ${dir}" href="${q.url}">${esc(q.title)}</a></p>` : '';
  const foot = newer || older ? `<nav class="essay-next" aria-label="More from ${esc(p.cat.label)}">${nav(newer, 'newer')}${nav(older, 'older')}</nav>` : '';
  return `<article class="essay">
  <header class="essay-head">
    <h1>${esc(p.title)}</h1>
    <p class="essay-date"><time datetime="${p.date.toISOString().slice(0, 10)}">${monthYear(p.date)}</time>${p.draft ? ' · Draft' : ''}</p>
    ${facts}${links ? `<p class="links">${links}</p>` : ''}
  </header>
  <div class="prose">
${p.html}
${endMatter(p)}
  </div>
  ${foot}
</article>`;
}

export function aboutBody(title, html) {
  return `<article class="essay">
  <header class="essay-head"><h1>${esc(title)}</h1></header>
  <div class="prose">
${html}
  </div>
</article>`;
}

export function notFoundBody() {
  return `<section class="menu gameover">
  <div class="logo-wrap"><h1 class="logo">GAME OVER</h1><p class="tagline">That page doesn't exist. It may have moved, or the link has a typo.</p></div>
  <ul class="list">
    <li><a class="item" data-item href="/"><span class="t">Continue</span><span class="meta">main menu</span></a></li>
    <li><a class="item" data-item href="/posts/"><span class="t">All posts</span></a></li>
  </ul>
</section>`;
}
