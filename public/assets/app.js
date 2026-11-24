// ALOK POCKET controls: cursor, controller, keyboard, knobs, options panel, sound, clock,
// reading progress, the phone reading strip and the cable between the TV and the controller.
//
// Controller:  D-pad = move (or scroll while reading) · A = open (or next page) · B = back
//              OPTIONS = settings panel · HOME = main menu
// TV knobs:    CHANNEL = next shelf · TINT = screen colour · speaker = sound on/off
(() => {
  'use strict';
  const root = document.documentElement;
  const mode = root.dataset.mode || 'menu';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Phones read in the whole window; larger screens read inside the TV.
  const PHONE = matchMedia('(max-width: 720px), (orientation: landscape) and (max-height: 520px)');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* storage blocked */ } },
    remove(k) { try { sessionStorage.removeItem(k); } catch { /* storage blocked */ } },
  };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // ---- sound: tiny square-wave blips, off by default ----
  let audio = null;
  let soundOn = store.get('sound') === 'on';
  function beep(freq = 520, dur = 0.04) {
    if (!soundOn) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const t = audio.currentTime;
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + dur + 0.01);
    } catch { /* no audio */ }
  }

  // ---- settings ----
  const TINTS = ['amber', 'mint', 'ice', 'night'];
  const SIZES = ['s', 'm', 'l'];
  const size = () => (SIZES.includes(root.dataset.size) ? root.dataset.size : 'm');
  function labels() {
    $$('[data-tint-label]').forEach((el) => { el.textContent = (root.dataset.tint || 'amber').toUpperCase(); });
    $$('[data-sound-label]').forEach((el) => { el.textContent = soundOn ? 'ON' : 'OFF'; });
    $$('[data-size-label]').forEach((el) => { el.textContent = size().toUpperCase(); });
  }
  function cycleTint() {
    const next = TINTS[(TINTS.indexOf(root.dataset.tint) + 1) % TINTS.length];
    root.dataset.tint = next;
    store.set('tint', next);
    labels();
    beep(660, 0.06);
  }
  function toggleSound() {
    soundOn = !soundOn;
    store.set('sound', soundOn ? 'on' : 'off');
    labels();
    beep(880, 0.08);
  }
  function cycleSize() {
    // Keep the same spot in the text when the size changes.
    const s = scroller();
    const at = s.scrollHeight > s.clientHeight ? s.scrollTop / (s.scrollHeight - s.clientHeight) : 0;
    const next = SIZES[(SIZES.indexOf(size()) + 1) % SIZES.length];
    root.dataset.size = next;
    store.set('size', next);
    s.scrollTop = at * (s.scrollHeight - s.clientHeight);
    labels();
    beep(600, 0.05);
  }
  labels();

  // ---- navigation helpers ----
  const screen = $('#screen');
  const viewport = $('#viewport');
  function bump() {
    beep(140, 0.08);
    if (reduced || !screen) return;
    screen.classList.remove('bump');
    void screen.offsetWidth;
    screen.classList.add('bump');
  }
  // fuzz: show static on the next page, like changing channel on an old TV.
  function go(url, { fuzz = false } = {}) {
    if (!url) return bump();
    beep(740, 0.05);
    if (fuzz) session.set('fuzz', '1');
    location.href = url;
  }
  async function randomPost() {
    try {
      const urls = (await (await fetch('/posts.json')).json()).filter((u) => u !== location.pathname);
      if (!urls.length) return bump();
      go(urls[Math.floor(Math.random() * urls.length)]);
    } catch {
      bump();
    }
  }

  // ---- what scrolls: the TV screen, or the whole window when reading on a phone ----
  const windowScrolls = () => mode === 'read' && PHONE.matches;
  const scroller = () => (windowScrolls() ? document.scrollingElement : viewport);
  function scrollStep(dir, amount) {
    const s = scroller();
    s.scrollBy({ top: dir * s.clientHeight * amount, behavior: reduced ? 'auto' : 'smooth' });
  }

  // ---- a cursor that highlights one item in a list ----
  function cursor(els, storeKey) {
    let i = -1;
    const c = {
      els,
      get current() { return els[i]; },
      set(n, { scroll = true, sound = true, focus = false } = {}) {
        if (!els.length) return;
        n = (n + els.length) % els.length;
        const changed = n !== i;
        if (changed) {
          els[i]?.classList.remove('sel');
          i = n;
          els[i].classList.add('sel');
          if (sound) beep(520, 0.03);
          if (storeKey) session.set(storeKey, String(i));
        }
        if (focus) els[i].focus({ preventScroll: true });
        if (scroll && changed) els[i].scrollIntoView({ block: 'nearest' });
      },
      move(d) { c.set(i + d, { focus: true }); },
      activate() {
        const el = els[i];
        if (!el) return;
        if (el.dataset.action) return el.click();
        beep(990, 0.07);
        setTimeout(() => el.click(), soundOn ? 60 : 0);
      },
    };
    els.forEach((el, n) => {
      // The mouse moves the highlight; if the keyboard focus is in this list, it follows,
      // so there is never a highlight in one place and a focus ring in another.
      el.addEventListener('pointermove', () => c.set(n, { scroll: false, sound: false, focus: els.includes(document.activeElement) }));
      el.addEventListener('focus', () => c.set(n, { sound: false }));
    });
    return c;
  }

  const selKey = 'sel:' + location.pathname;
  const menu = cursor($$('[data-item]'), selKey);
  if (menu.els.length) {
    const start = Number(session.get(selKey)) || 0;
    menu.set(Math.min(start, menu.els.length - 1), { sound: false });
  }

  // ---- options panel ----
  const panelEl = $('#options');
  const panel = cursor(panelEl ? [...panelEl.querySelectorAll('[data-pitem]')] : []);
  let panelOpen = false;
  let returnFocus = null;
  function openPanel() {
    if (!panelEl || panelOpen) return;
    returnFocus = document.activeElement;
    panelEl.hidden = false;
    panelOpen = true;
    panel.set(0, { sound: false, focus: true });
    beep(880, 0.05);
  }
  function closePanel() {
    if (!panelOpen) return;
    panelEl.hidden = true;
    panelOpen = false;
    beep(330, 0.05);
    const back = menu.current || (mode === 'read' && !windowScrolls() ? viewport : returnFocus);
    back?.focus?.({ preventScroll: true });
  }
  panelEl?.addEventListener('click', (e) => { if (e.target === panelEl) closePanel(); });

  // Every [data-action] element (menu items and panel items) runs through here.
  const ACTIONS = { tint: cycleTint, sound: toggleSound, size: cycleSize, options: openPanel, close: closePanel, random: randomPost };
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element && e.target.closest('[data-action]');
    if (el) ACTIONS[el.dataset.action]?.();
  });

  // ---- what each button does ----
  const read = mode === 'read';
  const shelf = mode === 'list';
  const actions = {
    up: () => (panelOpen ? panel.move(-1) : read ? scrollStep(-1, 0.3) : menu.move(-1)),
    down: () => (panelOpen ? panel.move(1) : read ? scrollStep(1, 0.3) : menu.move(1)),
    left: () => (panelOpen ? null : go(root.dataset.prev, { fuzz: shelf })),
    right: () => (panelOpen ? null : go(root.dataset.next, { fuzz: shelf })),
    a: () => (panelOpen ? panel.activate() : read ? scrollStep(1, 0.85) : menu.activate()),
    b: () => (panelOpen ? closePanel() : go(root.dataset.back)),
    options: () => (panelOpen ? closePanel() : openPanel()),
    home: () => (panelOpen ? closePanel() : location.pathname === '/' ? bump() : go('/')),
    tint: cycleTint,
  };

  // ---- the TV's knobs ----
  const chDial = $('[data-knob="channel"]');
  chDial?.addEventListener('click', (e) => {
    e.preventDefault();
    // Turn the dial one notch, then change channel.
    const ptr = chDial.querySelector('.ptr');
    const ch = Number(getComputedStyle(chDial).getPropertyValue('--ch')) || 0;
    if (ptr && !reduced) ptr.style.transform = `rotate(${-125 + (ch + 1) * 50}deg)`;
    beep(300, 0.04);
    setTimeout(() => go(chDial.getAttribute('href'), { fuzz: true }), reduced ? 0 : 140);
  });
  $('[data-knob="tint"]')?.addEventListener('click', cycleTint);
  $('[data-knob="sound"]')?.addEventListener('click', toggleSound);

  // ---- keyboard ----
  const COMMON = { Escape: 'b', Backspace: 'b', x: 'b', o: 'options', m: 'home', t: 'tint' };
  const MENU_KEYS = { ...COMMON, ArrowUp: 'up', ArrowDown: 'down', k: 'up', j: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', ' ': 'a', z: 'a' };
  // While reading, up/down/space/enter keep their normal scrolling and link behaviour.
  const READ_KEYS = { ...COMMON, ArrowLeft: 'left', ArrowRight: 'right', k: 'left', j: 'right' };
  // Scroll keys pressed while the focus is outside the TV screen still scroll the text.
  const SCROLL_KEYS = { ArrowDown: 0.12, ArrowUp: -0.12, PageDown: 0.85, PageUp: -0.85, ' ': 0.85 };

  function press(name) {
    for (const b of $$(`[data-btn="${name}"]`)) {
      b.classList.add('pressed');
      clearTimeout(b._t);
      b._t = setTimeout(() => b.classList.remove('pressed'), 120);
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (read && !panelOpen && !windowScrolls() && key in SCROLL_KEYS && !viewport.contains(document.activeElement)) {
      e.preventDefault();
      viewport.focus({ preventScroll: true });
      scrollStep(key === ' ' && e.shiftKey ? -1 : Math.sign(SCROLL_KEYS[key]), Math.abs(SCROLL_KEYS[key]));
      return;
    }
    const act = (read && !panelOpen ? READ_KEYS : MENU_KEYS)[key];
    if (!act) return;
    // Enter/Space on a focused link or button outside the active list keeps its normal behaviour.
    const active = panelOpen ? panel.els : menu.els;
    if (act === 'a' && target?.matches('a, button') && !active.includes(target)) return;
    e.preventDefault();
    if (e.repeat && act !== 'up' && act !== 'down') return;
    press(act);
    actions[act]();
  });

  // ---- controller and strip buttons (mouse and touch), with hold-to-repeat on up/down ----
  $$('[data-btn]').forEach((b) => {
    const name = b.dataset.btn;
    let hold;
    let rep;
    const stop = () => { b.classList.remove('pressed'); clearTimeout(hold); clearInterval(rep); };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (b.disabled) return;
      b.classList.add('pressed');
      if (navigator.vibrate) navigator.vibrate(8);
      actions[name]();
      if (name === 'up' || name === 'down') hold = setTimeout(() => { rep = setInterval(actions[name], 110); }, 380);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => b.addEventListener(t, stop));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // ---- clock ----
  const clocks = $$('[data-clock]');
  const tick = () => {
    const d = new Date();
    const s = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    clocks.forEach((c) => { c.textContent = s; });
  };
  tick();
  setInterval(tick, 15000);

  if (read) {
    // ---- a thin line along the top fills as you read ----
    const line = $('[data-batt]');
    const progress = () => {
      if (!line) return;
      const s = scroller();
      const max = s.scrollHeight - s.clientHeight;
      line.style.setProperty('--p', (max > 0 ? Math.min(1, Math.max(0, s.scrollTop / max)) : 1).toFixed(3));
    };
    addEventListener('scroll', progress, { passive: true });
    viewport.addEventListener('scroll', progress, { passive: true });
    addEventListener('resize', progress);
    progress();

    // On larger screens the text scrolls inside the TV, so give it the focus for arrow keys and Space.
    if (!PHONE.matches && !location.hash) viewport.focus({ preventScroll: true });

    // ---- phone: the strip hides while scrolling down, returns on scroll up, at the top and end, or on a tap ----
    const strip = $('.strip');
    if (strip) {
      let last = scrollY;
      addEventListener('scroll', () => {
        if (!PHONE.matches) return;
        const y = scrollY;
        const max = document.scrollingElement.scrollHeight - innerHeight;
        if (y < 60 || y > max - 90) strip.classList.remove('away');
        else if (y > last + 4) strip.classList.add('away');
        else if (y < last - 4) strip.classList.remove('away');
        last = y;
      }, { passive: true });
      viewport.addEventListener('click', (e) => {
        if (!PHONE.matches || e.target.closest('a, button, pre, table, input, summary')) return;
        if (String(getSelection?.() || '')) return;
        strip.classList.toggle('away');
      });
    }
  }

  // ---- static when arriving from a channel change ----
  const staticEl = $('.static');
  if (session.get('fuzz')) {
    session.remove('fuzz');
    if (staticEl && !reduced) {
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      const x = c.getContext('2d');
      const img = x.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      staticEl.style.backgroundImage = `url(${c.toDataURL()})`;
      staticEl.classList.add('on');
      staticEl.addEventListener('animationend', () => staticEl.classList.remove('on'), { once: true });
    }
  }

  // ---- the cable: from the TV to the controller's plug ----
  const scene = $('#scene');
  const tv = $('.tv');
  const plug = $('.plug');
  const paths = $$('.cable path');
  function drawCable() {
    if (!scene || !tv || !plug || !paths.length) return;
    if (!plug.offsetParent || getComputedStyle($('.cable')).display === 'none') return;
    const s = scene.getBoundingClientRect();
    const t = tv.getBoundingClientRect();
    const p = plug.getBoundingClientRect();
    const ex = p.left + p.width / 2 - s.left;
    const ey = p.top + 3 - s.top;
    let d;
    if (p.top > t.bottom) {
      // controller below the TV
      const sx = t.left + t.width * 0.72 - s.left;
      const sy = t.bottom - s.top - 6;
      d = `M ${sx} ${sy} C ${sx} ${sy + 40}, ${ex + 50} ${ey - 50}, ${ex} ${ey}`;
    } else {
      // controller beside the TV
      const sx = t.right - s.left - 4;
      const sy = t.top + t.height * 0.8 - s.top;
      const lift = Math.min(120, Math.max(40, ey - sy + 60));
      d = `M ${sx} ${sy} C ${sx + 70} ${sy + 10}, ${sx + 10} ${ey - lift}, ${(sx + ex) / 2 + 20} ${ey - lift * 0.75} S ${ex} ${ey - 50}, ${ex} ${ey}`;
    }
    paths.forEach((path) => path.setAttribute('d', d));
  }
  drawCable();
  if ('ResizeObserver' in window && scene) new ResizeObserver(drawCable).observe(scene);
  document.fonts?.ready.then(drawCable);

  // ---- page transitions: changing channel quickly can cut a transition short; that's fine ----
  const quiet = (t) => { t?.ready?.catch(() => {}); t?.finished?.catch(() => {}); t?.updateCallbackDone?.catch(() => {}); };
  addEventListener('pagereveal', (e) => quiet(e.viewTransition));
  addEventListener('pageswap', (e) => quiet(e.viewTransition));

  // ---- boot screen: plays once per visit, any key or tap skips it ----
  if (root.classList.contains('booting')) {
    const end = () => {
      root.classList.remove('booting');
      removeEventListener('keydown', end, true);
      removeEventListener('pointerdown', end, true);
    };
    setTimeout(end, 1950);
    addEventListener('keydown', end, true);
    addEventListener('pointerdown', end, true);
  }
})();
