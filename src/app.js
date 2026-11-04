// SkillShelf client: theme, menu, reveal, copy, tabs, filters, ⌘K palette, MCP list, wizard.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const BASE = document.body.dataset.base || '';
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  // Theme
  $('[data-theme-toggle]')?.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('theme', next);
  });
  $('[data-menu]')?.addEventListener('click', () => $('#nav').classList.toggle('open'));

  // Reveal on scroll
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -40px' }) : null;
  $$('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('in'));
  // Safety net: never leave content hidden if the observer misses something (print, odd embeds).
  addEventListener('load', () => setTimeout(() => $$('.reveal:not(.in)').forEach(el => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); }), 1200));
  addEventListener('beforeprint', () => $$('.reveal').forEach(el => el.classList.add('in')));

  // Relative time in ticker
  $$('[data-ago]').forEach(el => {
    const s = (Date.now() - Date.parse(el.dataset.ago)) / 1000;
    el.textContent = s < 3600 ? `${Math.max(1, Math.round(s / 60))} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
  });

  // Copy buttons
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    const old = btn.textContent; btn.textContent = 'Copied ✓'; btn.classList.add('ok');
    setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 1500);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-copy-next]');
    if (b) return copy(b.nextElementSibling.innerText, b);
    const t = e.target.closest('[data-copy-target]');
    if (t) return copy($(t.dataset.copyTarget).value, t);
    const sh = e.target.closest('[data-share]');
    if (sh) { navigator.share ? navigator.share({ title: document.title, url: location.href }).catch(() => {}) : copy(location.href, sh); }
  });

  // Install tabs, remembered across skills
  $$('[data-tabs]').forEach(tabs => {
    const root = tabs.parentElement;
    const pick = id => {
      $$('[data-tab]', tabs).forEach(b => b.setAttribute('aria-selected', b.dataset.tab === id));
      $$('[data-panel]', root).forEach(p => { p.hidden = p.dataset.panel !== id; });
    };
    tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { pick(b.dataset.tab); store.set('agent', b.dataset.tab); } });
    const saved = store.get('agent');
    if (saved && $(`[data-tab="${saved}"]`, tabs)) pick(saved);
  });

  // Collapsible SKILL.md
  const col = $('[data-collapsible]');
  if (col && col.scrollHeight > 760) {
    col.classList.add('collapsed');
    $('[data-expand]').addEventListener('click', e => { col.classList.toggle('collapsed'); e.target.textContent = col.classList.contains('collapsed') ? 'Show full instructions ↓' : 'Collapse ↑'; });
  } else $('[data-expand]')?.remove();

  // Skills filtering (DOM-based: all cards are pre-rendered for SEO)
  const filters = $('[data-filters]');
  if (filters) {
    const grid = $('[data-grid]');
    const cards = $$('.card', grid);
    const ads = $$('.grid-ad', grid);
    const every = 9;
    const q = $('[data-q]'), cat = $('[data-cat]'), coll = $('[data-coll]'), agent = $('[data-agent]'), sort = $('[data-sort]');
    const params = new URLSearchParams(location.search);
    q.value = params.get('q') || ''; cat.value = params.get('category') || ''; coll.value = params.get('collection') || '';
    agent.value = params.get('agent') || ''; sort.value = params.get('sort') || 'updated';
    const sorters = {
      updated: (a, b) => b.dataset.updated - a.dataset.updated,
      trust: (a, b) => b.dataset.trust - a.dataset.trust,
      stars: (a, b) => b.dataset.stars - a.dataset.stars,
      name: (a, b) => a.dataset.name.localeCompare(b.dataset.name),
      new: (a, b) => b.querySelector('.mono').textContent.localeCompare(a.querySelector('.mono').textContent),
    };
    const apply = () => {
      const words = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      const shown = cards.filter(c => {
        const ok = words.every(w => c.dataset.text.includes(w)) && (!cat.value || c.dataset.cat === cat.value) &&
          (!coll.value || c.dataset.coll === coll.value) && (!agent.value || c.dataset.agents.split(' ').includes(agent.value));
        c.hidden = !ok;
        return ok;
      }).sort(sorters[sort.value] || sorters.updated);
      const frag = document.createDocumentFragment();
      const used = new Set();
      shown.forEach((c, i) => { if (i >= limit) c.hidden = true; });
      shown.forEach((c, i) => {
        c.classList.add('in'); frag.append(c);
        const ad = i < limit && (i + 1) % every === 0 && ads[(i + 1) / every - 1];
        if (ad) { frag.append(ad); used.add(ad); }
      });
      cards.filter(c => c.hidden).forEach(c => frag.append(c));
      ads.forEach(a => { a.hidden = !used.has(a); });
      grid.append(frag);
      $('[data-count-out]').textContent = `${shown.length.toLocaleString()} skill${shown.length === 1 ? '' : 's'}`;
      more.hidden = shown.length <= limit;
      $('[data-empty]').hidden = shown.length > 0;
      const p = new URLSearchParams();
      if (q.value) p.set('q', q.value); if (cat.value) p.set('category', cat.value); if (coll.value) p.set('collection', coll.value);
      if (agent.value) p.set('agent', agent.value); if (sort.value !== 'updated') p.set('sort', sort.value);
      history.replaceState(null, '', `${location.pathname}${p.toString() ? `?${p}` : ''}`);
    };
    const PAGE = 48;
    let limit = PAGE;
    const more = $('[data-more]');
    more.addEventListener('click', () => { limit += PAGE; apply(); });
    const reset = () => { limit = PAGE; apply(); };
    let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(reset, 120); });
    [cat, coll, agent, sort].forEach(el => el.addEventListener('change', reset));
    apply();
  }

  // ⌘K palette
  const pal = $('[data-palette]');
  let index = null, sel = 0, hits = [];
  const input = $('[data-palette-input]'), list = $('[data-palette-results]');
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function openPal() {
    pal.hidden = false; input.value = ''; input.focus();
    if (!index) index = await fetch(`${BASE}/data/index.json`).then(r => r.json()).catch(() => []);
    search();
  }
  function search() {
    const words = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    hits = (words.length ? index.map(r => {
      const name = r[1].toLowerCase(), hay = `${r[0]} ${name} ${r[2]} ${r[3]} ${r[4]}`.toLowerCase();
      if (!words.every(w => hay.includes(w))) return null;
      return [r, words.reduce((s, w) => s + (name.startsWith(w) ? 5 : name.includes(w) ? 3 : 1), 0)];
    }).filter(Boolean).sort((a, b) => b[1] - a[1]).map(x => x[0]) : index).slice(0, 12);
    sel = 0; render();
  }
  function render() {
    list.innerHTML = hits.length ? hits.map((r, i) => `<li class="${i === sel ? 'on' : ''}"><a href="${BASE}/skills/${r[0]}/"><b>${esc(r[1])}</b><span>${esc(r[3])} · ${esc(r[2])}</span></a></li>`).join('')
      : `<li><a href="${BASE}/skills/?q=${encodeURIComponent(input.value)}"><b>Search the full library for “${esc(input.value)}”</b></a></li>`;
  }
  $$('[data-palette-open]').forEach(b => b.addEventListener('click', openPal));
  input?.addEventListener('input', search);
  pal?.addEventListener('click', e => { if (e.target === pal) pal.hidden = true; });
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? openPal() : (pal.hidden = true); }
    else if (e.key === '/' && pal.hidden && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openPal(); }
    if (pal.hidden) return;
    if (e.key === 'Escape') pal.hidden = true;
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, hits.length - 1); render(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); render(); e.preventDefault(); }
    if (e.key === 'Enter') { const a = list.querySelectorAll('a')[sel]; if (a) location.href = a.href; }
  });

  // MCP directory (client-rendered from data/mcp.json)
  const mlist = $('[data-mcp-list]');
  if (mlist) {
    let all = [], view = [], shown = 0;
    const mq = $('[data-mcp-q]'), mk = $('[data-mcp-kind]'), more = $('[data-mcp-more]');
    const row = m => `<article class="mcp"><h3>${esc(m[0])}</h3><span class="mono">${esc(m[1])} · v${esc(m[3] || '?')}</span><p>${esc(m[2])}</p>
      ${m[5] ? `<span class="mono">Remote: ${esc(m[5])}</span>` : m[7] ? `<span class="mono">${esc(m[6].split(' ')[0])}: ${esc(m[7])}</span>` : ''}
      <div class="mcp__tags">${m[5] ? '<span>remote</span>' : ''}${m[6] ? m[6].split(' ').filter((v, i, a) => a.indexOf(v) === i).map(t => `<span>${esc(t)}</span>`).join('') : ''}${m[4] ? ` <a href="${esc(m[4])}" rel="nofollow noopener" target="_blank">Website ↗</a>` : ''}</div></article>`;
    const page = () => { mlist.insertAdjacentHTML('beforeend', view.slice(shown, shown + 60).map(row).join('')); shown += 60; more.hidden = shown >= view.length; };
    const apply = () => {
      const words = mq.value.toLowerCase().split(/\s+/).filter(Boolean);
      view = all.filter(m => words.every(w => `${m[0]} ${m[1]} ${m[2]}`.toLowerCase().includes(w)) && (!mk.value || (mk.value === 'remote' ? !!m[5] : m[6].includes(mk.value))));
      mlist.innerHTML = ''; shown = 0; page();
      $('[data-mcp-count]').textContent = `${view.length.toLocaleString()} servers`;
    };
    fetch(`${BASE}/data/mcp.json`).then(r => r.json()).then(d => { all = d; apply(); });
    let t; mq.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 150); });
    mk.addEventListener('change', apply); more.addEventListener('click', page);
  }

  // Get-started wizard
  const wiz = $('[data-wizard]');
  if (wiz) wiz.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    $$('[data-pick]', wiz).forEach(x => x.setAttribute('aria-pressed', x === b));
    $$('[data-for]', wiz).forEach(s => { s.hidden = s.dataset.for !== b.dataset.pick; });
    const step = $(`[data-for="${b.dataset.pick}"]`, wiz);
    $$('.reveal', step).forEach(el => el.classList.add('in'));
    step.scrollIntoView({ behavior: 'smooth', block: 'start' });
    store.set('agent', b.dataset.pick);
  });
})();

// "Try this skill" chat
(() => {
  const box = document.querySelector('[data-chat]');
  if (!box) return;
  const { slug, endpoint, name, raw } = box.dataset;
  const log = box.querySelector('[data-log]');
  const form = box.querySelector('[data-form]');
  const input = form.querySelector('textarea');
  const btn = form.querySelector('button');
  const history = [];
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = s => esc(s).replace(/```([\s\S]*?)```/g, '<code>$1</code>').replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  const bubble = (cls, text = '') => { const d = document.createElement('div'); d.className = `msg msg--${cls}`; d.innerHTML = md(text); log.append(d); log.scrollTop = log.scrollHeight; return d; };

  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  box.querySelectorAll('[data-ask]').forEach(c => c.addEventListener('click', () => { input.value = c.textContent; form.requestSubmit(); }));

  function openInClaude(text) {
    const prompt = `Act as the AI skill "${name}". Its full instructions are at ${raw}. Read them first and follow them for this conversation.\n\nMy request: ${text}`;
    window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, '_blank', 'noopener');
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || btn.disabled) return;
    input.value = ''; input.style.height = 'auto';
    if (!endpoint) return openInClaude(text);

    bubble('user', text);
    history.push({ role: 'user', content: text });
    const out = bubble('bot'); out.classList.add('typing');
    btn.disabled = true;
    let reply = '';
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, messages: history.slice(-12) }) });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'The preview is unavailable right now.');
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop();
        for (const p of parts) {
          if (!p.startsWith('data: ')) continue;
          const ev = JSON.parse(p.slice(6));
          if (ev.t) { reply += ev.t; out.innerHTML = md(reply); log.scrollTop = log.scrollHeight; }
          if (ev.error) throw new Error(ev.error);
        }
      }
      history.push({ role: 'assistant', content: reply || '…' });
    } catch (err) {
      if (!reply) { out.remove(); history.pop(); }
      bubble('err', err.message);
    } finally {
      out.classList.remove('typing');
      btn.disabled = false;
      input.focus();
    }
  });
})();
