// Renders data/skills.json + data/mcp.json into a static site in dist/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const { generatedAt, sources, skills } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/skills.json'), 'utf8'));
const mcp = fs.existsSync(path.join(ROOT, 'data/mcp.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mcp.json'), 'utf8')) : [];
const CATS = cfg.categories;
const BASE = cfg.basePath.replace(/\/$/, '');
const BUILD = Date.now().toString(36);

// ---------- helpers ----------
const u = p => `${BASE}${p}`;
const abs = p => `${cfg.siteUrl.replace(/\/$/, '')}${BASE}${p}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const n = x => x.toLocaleString('en-US');
const catalogNo = i => String(i + 1).padStart(4, '0');
const plural = (k, w) => `${n(k)} ${w}${k === 1 ? '' : 's'}`;
const ago = d => {
  const s = (Date.parse(generatedAt) - Date.parse(d)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 45) return `${Math.round(s / 86400)} days ago`;
  return fmtDate(d);
};
function write(rel, html) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

// Stable catalog numbers: oldest first.
skills.sort((a, b) => String(a.addedAt || a.updatedAt).localeCompare(String(b.addedAt || b.updatedAt)) || a.slug.localeCompare(b.slug));
skills.forEach((s, i) => { s.no = catalogNo(i); });
const bySlug = new Map(skills.map(s => [s.slug, s]));
const byCat = Object.fromEntries(Object.keys(CATS).map(c => [c, skills.filter(s => s.category === c)]));
const usedCats = Object.keys(CATS).filter(c => byCat[c].length);
const recent = [...skills].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
const trusted = [...skills].sort((a, b) => b.trust.score - a.trust.score || b.repoStars - a.repoStars);
const collections = [...new Set(skills.map(s => s.collection))].map(name => {
  const list = skills.filter(s => s.collection === name);
  return { name, id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), list, repos: [...new Set(list.map(s => s.repo))], stars: Math.max(...list.map(s => s.repoStars)) };
}).sort((a, b) => b.list.length - a.list.length);
// Round-robin across collections so home-page picks aren't all from one source.
const mix = list => {
  const groups = Object.values(list.reduce((m, s) => ((m[s.collection] ||= []).push(s), m), {}));
  const out = [];
  for (let i = 0; out.length < list.length; i++) for (const g of groups) if (g[i]) out.push(g[i]);
  return out;
};
const agentsFor = s => s.agents ? cfg.agents.filter(a => s.agents.includes(a.id) || ['claude-ai', 'claude-desktop', 'chatgpt'].includes(a.id)) : cfg.agents;

// ---------- markdown ----------
function markdownFor(skill) {
  const blob = `${skill.repoUrl}/blob/${skill.branch}/${skill.path}/`;
  const raw = `https://raw.githubusercontent.com/${skill.repo}/${skill.branch}/${skill.path}/`;
  const isRel = h => h && !/^([a-z]+:|#|\/\/)/i.test(h);
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      html(t) { return esc(typeof t === 'string' ? t : t.text); },
      link(t) {
        const href = isRel(t.href) ? new URL(t.href, blob).href : t.href;
        return `<a href="${esc(href)}" rel="nofollow noopener" target="_blank">${this.parser.parseInline(t.tokens)}</a>`;
      },
      image(t) {
        const src = isRel(t.href) ? new URL(t.href, raw).href : t.href;
        return /^https:/.test(src) ? `<img src="${esc(src)}" alt="${esc(t.text)}" loading="lazy">` : '';
      },
      code(t) {
        return `<div class="code"><button class="copy" data-copy-next aria-label="Copy code">Copy</button><pre><code>${esc(t.text)}</code></pre></div>`;
      },
    },
  });
  return md.parse(skill.body);
}

// ---------- ads ----------
const adsLive = cfg.ads.enabled && !/^ca-pub-0+$/.test(cfg.ads.adsenseClient);
function ad(kind, cls = '') {
  if (!cfg.ads.enabled) return '';
  const slot = cfg.ads.slots[kind];
  const fmt = kind === 'sidebar' ? 'data-ad-format="auto"' : kind === 'inFeed' ? 'data-ad-format="fluid" data-ad-layout-key="-fb+5w+4e-db+86"' : 'data-ad-format="auto" data-full-width-responsive="true"';
  const inner = adsLive
    ? `<ins class="adsbygoogle" style="display:block" data-ad-client="${cfg.ads.adsenseClient}" data-ad-slot="${slot}" ${fmt}></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script>`
    : `<div class="ad__ph"><span>Ad space</span><small>${kind} · AdSense slot ${slot}</small></div>`;
  return `<aside class="ad ad--${kind} ${cls}" aria-label="Advertisement"><span class="ad__label">Advertisement</span>${inner}</aside>`;
}

// ---------- components ----------
const stamp = (t, size = '') => `<span class="stamp stamp--${t.level} ${size}" title="Automated trust score ${t.score}/100"><b>${t.score}</b><i>${t.level === 'trusted' ? 'Trusted' : t.level === 'review' ? 'Review' : 'Caution'}</i></span>`;

function card(s, i = 0) {
  const c = CATS[s.category];
  return `<a class="card reveal" style="--d:${Math.min(i, 12) * 40}ms" href="${u(`/skills/${s.slug}/`)}"
    data-name="${esc(s.name.toLowerCase())}" data-text="${esc(`${s.name} ${s.id} ${s.description} ${s.tags.join(' ')} ${s.collection}`.toLowerCase())}"
    data-cat="${s.category}" data-coll="${esc(s.collection)}" data-agents="${(s.agents || cfg.agents.map(a => a.id)).join(' ')}"
    data-trust="${s.trust.score}" data-updated="${Date.parse(s.updatedAt)}" data-stars="${s.repoStars}">
    <div class="card__top"><span class="mono">№ ${s.no}</span><span class="card__cat">${c.glyph} ${esc(c.label)}</span></div>
    <h3>${esc(s.name)}</h3>
    <p>${esc(s.description)}</p>
    <div class="card__foot mono"><span>${esc(s.collection)}</span>${s.version ? `<span>v${esc(s.version)}</span>` : ''}<span>${ago(s.updatedAt)}</span></div>
    ${stamp(s.trust)}
  </a>`;
}

function grid(list, { feedAds = false } = {}) {
  const every = cfg.ads.inFeedEvery;
  return `<div class="grid" data-grid>${list.map((s, i) => card(s, i) + (feedAds && (i + 1) % every === 0 ? ad('inFeed', 'grid-ad') : '')).join('')}</div>`;
}

const NAV = [
  ['/skills/', 'Skills'], ['/categories/', 'Categories'], ['/bundles/', 'Bundles'], ['/mcp/', 'MCP'],
  ['/agents/', 'Agents'], ['/guides/', 'Guides'], ['/stats/', 'Stats'], ['/whats-new/', "What's new"],
];

function layout({ title, description = cfg.description, path: p, body, schema, wide = false }) {
  const fullTitle = title ? `${title} · ${cfg.name}` : `${cfg.name}: ${cfg.tagline}`;
  const a = cfg.analytics;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description.slice(0, 300))}">
<link rel="canonical" href="${abs(p)}">
<meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(description.slice(0, 300))}">
<meta property="og:type" content="website"><meta property="og:url" content="${abs(p)}"><meta property="og:image" content="${abs('/og.svg')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f4efe4" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#121110" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${u('/favicon.svg')}" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.name)} updates" href="${u('/feed.xml')}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Schibsted+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${u(`/assets/styles.css?v=${BUILD}`)}">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
${adsLive ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cfg.ads.adsenseClient}" crossorigin="anonymous"></script>` : ''}
${a.plausibleDomain ? `<script defer data-domain="${esc(a.plausibleDomain)}" src="https://plausible.io/js/script.js"></script>` : ''}
${a.gaMeasurementId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(a.gaMeasurementId)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(a.gaMeasurementId)}')</script>` : ''}
${schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body data-base="${BASE}">
<a class="skip" href="#main">Skip to content</a>
<div class="ticker"><span class="pulse"></span> Index refreshed <time data-ago="${generatedAt}">${ago(generatedAt)}</time> · ${n(skills.length)} skills from ${sources.length} open-source repos · <a href="${u('/whats-new/')}">See what changed →</a></div>
<header class="hdr">
  <a class="logo" href="${u('/')}" aria-label="${esc(cfg.name)} home"><span class="logo__mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${esc(cfg.name)}</span></a>
  <nav class="nav" id="nav">${NAV.map(([h, l]) => `<a href="${u(h)}"${p.startsWith(h) ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
  <div class="hdr__tools">
    <button class="search-btn" data-palette-open aria-label="Search skills"><span>Search</span><kbd>⌘K</kbd></button>
    <button class="icon-btn" data-theme-toggle aria-label="Toggle dark mode">◐</button>
    <a class="btn btn--accent btn--sm" href="${u('/submit/')}">Submit a skill</a>
    <button class="icon-btn menu-btn" data-menu aria-label="Menu" aria-controls="nav">☰</button>
  </div>
</header>
${p === '/' ? '' : ad('header', 'wrap')}
<main id="main" class="${wide ? 'main main--wide' : 'main'}">
${body}
</main>
${ad('footer', 'wrap')}
<footer class="ftr">
  <div class="ftr__grid wrap">
    <div class="ftr__brand"><a class="logo" href="${u('/')}"><span class="logo__mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${esc(cfg.name)}</span></a>
      <p>${esc(cfg.tagline)}. Every skill is open source, indexed straight from GitHub and credited to its authors.</p></div>
    <div><h4>Browse</h4>${[['/skills/', 'All skills'], ['/categories/', 'Categories'], ['/bundles/', 'Bundles'], ['/collections/', 'Collections'], ['/mcp/', 'MCP servers']].map(([h, l]) => `<a href="${u(h)}">${l}</a>`).join('')}</div>
    <div><h4>Learn</h4>${[['/get-started/', 'Get started'], ['/guides/', 'Guides'], ['/agents/', 'Supported agents'], ['/security/', 'How we scan'], ['/stats/', 'Stats']].map(([h, l]) => `<a href="${u(h)}">${l}</a>`).join('')}</div>
    <div><h4>${esc(cfg.name)}</h4>${[['/about/', 'About'], ['/submit/', 'Submit a skill'], ['/advertise/', 'Advertise'], ['/contact/', 'Contact'], ['/privacy/', 'Privacy'], ['/terms/', 'Terms']].map(([h, l]) => `<a href="${u(h)}">${l}</a>`).join('')}<a href="${u('/feed.xml')}">RSS feed</a></div>
  </div>
  <p class="ftr__fine wrap mono">Skills are © their respective authors and redistributed under their open-source licenses. ${esc(cfg.name)} is an independent index and is not affiliated with Anthropic, OpenAI, Google, GitHub or the listed projects.</p>
</footer>
<div class="palette" data-palette hidden>
  <div class="palette__box" role="dialog" aria-label="Search skills">
    <input type="search" placeholder="Search ${n(skills.length)} skills…" data-palette-input autocomplete="off">
    <ul data-palette-results></ul>
    <p class="palette__hint mono">↑↓ to move · Enter to open · Esc to close</p>
  </div>
</div>
<script src="${u(`/assets/app.js?v=${BUILD}`)}" defer></script>
</body>
</html>`;
}

const crumbs = items => `<nav class="crumbs mono" aria-label="Breadcrumb">${items.map(([h, l], i) => i === items.length - 1 ? `<span>${esc(l)}</span>` : `<a href="${u(h)}">${esc(l)}</a>`).join('<i>/</i>')}</nav>`;
const pageHead = (kicker, title, lede) => `<header class="phead wrap"><p class="kicker mono">${kicker}</p><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}</header>`;

const DISCLAIMERS = { 'tax-and-finance': 'tax', 'legal-tech': 'legal', 'health-services': 'medical', investing: 'financial or investment', accounting: 'accounting' };

// ---------- pages ----------
const FAQ = [
  ['What is a skill?', 'A skill is a folder with a <code>SKILL.md</code> file: instructions, plus optional scripts and reference files, that teach an AI agent how to do one job well. The agent reads the short description, and loads the full instructions only when your request matches.'],
  [`Is ${esc(cfg.name)} free?`, 'Yes. Every skill here is open source (MIT, Apache-2.0 and similar). We are supported by advertising and sponsorships, never by charging for skills.'],
  ['Do I need to code?', `No. On Claude.ai or Claude Desktop you download a ZIP and upload it. Our <a href="${u('/get-started/')}">get-started wizard</a> walks you through it for each tool.`],
  ['Which agents does this work with?', `Claude (web, desktop and Claude Code), Codex CLI, GitHub Copilot, Cursor, Gemini CLI, and any agent that reads the open SKILL.md format. ChatGPT users can paste the instructions into a Project. See <a href="${u('/agents/')}">all agents</a>.`],
  ['How do you know a skill is safe?', `Every build runs an automated scan of every file in every skill: remote-script piping, destructive commands, encoded blobs, hard-coded secrets and prompt-injection phrasing. That becomes a transparent trust score. It is a signal, not a guarantee, so read the scripts before running them. <a href="${u('/security/')}">How the scan works</a>.`],
  ['How often is the library updated?', `Automatically, several times a day. A scheduled job re-reads every source repository, picks up new and changed skills, and republishes the site. The banner at the top shows the last refresh.`],
  ['Can I add my skill?', `Yes. Put it in a public GitHub repo with an open-source license and <a href="${u('/submit/')}">submit the repo</a>. Once it's added, every future update you push shows up here automatically.`],
  ['What is the difference between a skill and an MCP server?', `A skill is knowledge and procedure: <em>how</em> to do something. An MCP server is a live connection to a tool or data source: <em>access</em> to something. They work well together. We list both, see <a href="${u('/mcp/')}">MCP servers</a>.`],
];

function home() {
  const cats = usedCats.map((c, i) => `<a class="cat reveal" style="--d:${i * 30}ms" href="${u(`/categories/${c}/`)}"><span class="cat__glyph">${CATS[c].glyph}</span><span class="cat__name">${esc(CATS[c].label)}</span><span class="cat__n mono">${byCat[c].length}</span></a>`).join('');
  const body = `
<section class="hero wrap">
  <div class="hero__copy">
    <p class="kicker mono reveal"><span class="pulse"></span> ${n(skills.length)} open-source skills · refreshed <time data-ago="${generatedAt}">${ago(generatedAt)}</time></p>
    <h1 class="reveal" style="--d:60ms">Teach your AI <em>new tricks.</em></h1>
    <p class="lede reveal" style="--d:120ms">Skills are like apps for your AI assistant. Each one teaches it a new job, from IRS forms and court filings to ad campaigns and code reviews. Ready to install, scanned for risks, and free.</p>
    <form class="hero__search reveal" style="--d:180ms" action="${u('/skills/')}" role="search">
      <input name="q" type="search" placeholder="Try “1099”, “LLC”, “small claims”, “SEO”…" aria-label="Search skills">
      <button class="btn btn--accent">Find skills</button>
    </form>
    <div class="hero__chips reveal" style="--d:240ms">${['tax-and-finance', 'legal-tech', 'investing', 'marketing-growth', 'developer-tools', 'health-services'].filter(c => byCat[c]?.length).map(c => `<a class="chip" href="${u(`/categories/${c}/`)}">${CATS[c].glyph} ${esc(CATS[c].label)}</a>`).join('')}<a class="chip chip--ghost" href="${u('/get-started/')}">New here? Start →</a></div>
  </div>
  <div class="hero__stack" aria-hidden="true">
    ${['tax-and-finance', 'legal-tech', 'investing'].map(c => [...(byCat[c] || [])].sort((a, b) => b.trust.score - a.trust.score)[0]).filter(Boolean).map((s, i) => `<div class="float float--${i}">${card(s)}</div>`).join('')}
  </div>
</section>

<section class="counters wrap">
  ${[[skills.length, 'skills'], [usedCats.length, 'categories'], [sources.length, 'source repos'], [mcp.length, 'MCP servers'], [cfg.agents.length, 'agents supported']].map(([k, l]) => `<div><b data-count="${k}">${n(k)}</b><span class="mono">${l}</span></div>`).join('')}
</section>
${ad('header', 'wrap')}

<section class="marquee" aria-label="Collections indexed"><div class="marquee__track">${[...collections, ...collections].map(c => `<a href="${u(`/collections/${c.id}/`)}">${esc(c.name)} <span class="mono">${c.list.length}</span></a>`).join('<i>✦</i>')}</div></section>

<section class="wrap section">
  <div class="section__head"><h2>How it <em>works</em></h2><a class="more" href="${u('/guides/install-without-code/')}">Read the beginner guide →</a></div>
  <ol class="steps">
    <li class="reveal"><span class="steps__n">01</span><h3>Pick a skill</h3><p>Browse by category or search. Every page explains what the skill does and when your AI will use it.</p></li>
    <li class="reveal" style="--d:80ms"><span class="steps__n">02</span><h3>Add it to your AI</h3><p>No code: download the ZIP and upload it to Claude. Developers copy one terminal command instead.</p></li>
    <li class="reveal" style="--d:160ms"><span class="steps__n">03</span><h3>Just ask</h3><p>Talk to your assistant as usual. When a request matches, it loads the skill automatically.</p></li>
  </ol>
</section>

<section class="wrap section">
  <div class="section__head"><h2>What can your AI <em>do?</em></h2><a class="more" href="${u('/categories/')}">All categories →</a></div>
  <div class="cats">${cats}</div>
</section>

<section class="wrap section">
  <div class="section__head"><h2>Fresh off <em>the press</em></h2><a class="more" href="${u('/skills/?sort=updated')}">Recently updated →</a></div>
  ${grid(mix(recent.filter(s => ['tax-and-finance', 'legal-tech', 'investing', 'marketing-growth', 'product-business', 'hr-careers', 'health-services'].includes(s.category))).slice(0, 8))}
</section>

${ad('inArticle', 'wrap')}

<section class="wrap section">
  <div class="section__head"><h2>Highest <em>trust</em> scores</h2><a class="more" href="${u('/skills/?sort=trust')}">See ranking →</a></div>
  ${grid(mix(trusted).slice(3, 11))}
</section>

<section class="dark-band">
  <div class="wrap security">
    <div>
      <p class="kicker mono">Security</p>
      <h2>Every file in every skill is <em>scanned</em> on every build.</h2>
      <p>Skills can ship scripts your AI will run. So before anything is listed, our scanner reads all of it and the result becomes a public, explainable trust score.</p>
      <a class="btn btn--ghost-light" href="${u('/security/')}">How the scan works</a>
    </div>
    <ul class="checks">
      <li><b>Remote code</b><span>curl | sh and other “download and run” patterns</span></li>
      <li><b>Destructive commands</b><span>Recursive deletes on home or root</span></li>
      <li><b>Hidden payloads</b><span>Large encoded blobs and dynamic eval</span></li>
      <li><b>Leaked secrets</b><span>API keys and tokens in source</span></li>
      <li><b>Prompt injection</b><span>Instructions that try to override your agent</span></li>
      <li><b>License check</b><span>Only open-source skills are published</span></li>
    </ul>
  </div>
</section>

<section class="wrap section">
  <div class="section__head"><h2>Works with your <em>favorite</em> agent</h2><a class="more" href="${u('/agents/')}">Install guides →</a></div>
  <div class="agents">${cfg.agents.map(a => `<a href="${u(`/agents/${a.id}/`)}" class="agent"><span class="agent__dot">${esc(a.name[0])}</span>${esc(a.name)}</a>`).join('')}</div>
</section>

<section class="wrap section split">
  <div class="cta-card">
    <p class="kicker mono">Builders</p>
    <h2>Have a skill worth <em>sharing?</em></h2>
    <p>Point us to a public GitHub repo. We index it, scan it, and keep it in sync every time you push.</p>
    <div class="row"><a class="btn btn--accent" href="${u('/submit/')}">Submit a skill</a><a class="btn btn--ghost" href="${u('/guides/write-your-own-skill/')}">Write your first one</a></div>
  </div>
  ${newsletter()}
</section>

<section class="wrap section faq">
  <div class="section__head"><h2>Questions, <em>answered</em></h2></div>
  ${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}
</section>`;
  return layout({
    path: '/', body,
    schema: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.name, url: abs('/'), potentialAction: { '@type': 'SearchAction', target: `${abs('/skills/')}?q={q}`, 'query-input': 'required name=q' } },
      { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q.replace(/<[^>]+>/g, ''), acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })) },
    ],
  });
}

function newsletter() {
  const action = cfg.newsletter.formAction;
  return `<div class="cta-card cta-card--alt">
    <p class="kicker mono">Newsletter</p>
    <h2>The best new skills, <em>weekly.</em></h2>
    <p>One short email with the most useful skills, guides and agent news. No spam, unsubscribe anytime.</p>
    ${action
      ? `<form class="signup" action="${esc(action)}" method="post" target="_blank"><input type="email" name="email" required placeholder="you@company.com" aria-label="Email"><button class="btn btn--accent">Subscribe</button></form>`
      : `<p class="mono note">Signup form coming soon. Follow the <a href="${u('/feed.xml')}">RSS feed</a> meanwhile.</p>`}
  </div>`;
}

function skillsIndex() {
  const body = `${pageHead(`Library · ${n(skills.length)} skills`, 'All <em>skills</em>', 'Search, filter and sort the whole library. Everything here is open source and free to install.')}
<section class="wrap">
  <div class="filters" data-filters>
    <input type="search" data-q placeholder="Search by name, task or tag…" aria-label="Search">
    <select data-cat aria-label="Category"><option value="">All categories</option>${usedCats.map(c => `<option value="${c}">${esc(CATS[c].label)} (${byCat[c].length})</option>`).join('')}</select>
    <select data-coll aria-label="Collection"><option value="">All collections</option>${collections.map(c => `<option value="${esc(c.name)}">${esc(c.name)} (${c.list.length})</option>`).join('')}</select>
    <select data-agent aria-label="Agent"><option value="">Any agent</option>${cfg.agents.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>
    <select data-sort aria-label="Sort"><option value="updated">Recently updated</option><option value="trust">Trust score</option><option value="stars">Most starred source</option><option value="name">A–Z</option><option value="new">Catalog № (newest)</option></select>
  </div>
  <p class="mono count" data-count-out>${n(skills.length)} skills</p>
  ${grid(recent, { feedAds: true })}
  <p class="center"><button class="btn btn--ghost" data-more hidden>Show more skills</button></p>
  <p class="empty" data-empty hidden>No skills match. Try fewer words, or <a href="${u('/submit/')}">suggest one</a>.</p>
</section>`;
  return layout({ title: 'All skills', path: '/skills/', body, description: `Browse ${skills.length} open-source AI agent skills for Claude, Codex, Cursor, Copilot and more.` });
}

function installBlock(s) {
  const zip = u(`/zips/${s.slug}.zip`);
  const zipAbs = abs(`/zips/${s.slug}.zip`);
  const agents = agentsFor(s);
  const tabs = agents.map((a, i) => `<button role="tab" aria-selected="${i === 0}" data-tab="${a.id}">${esc(a.name)}</button>`).join('');
  const panels = agents.map((a, i) => {
    let inner;
    if (a.kind === 'zip') inner = `<a class="btn btn--accent btn--lg" href="${zip}" download>⤓ Download ZIP</a><ol>${a.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
    else if (a.kind === 'paste') inner = `<button class="btn btn--accent" data-copy-target="#skill-md">Copy instructions</button><ol>${a.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
    else {
      const cmd = `mkdir -p ${a.dir} && curl -fsSL ${zipAbs} -o /tmp/${s.slug}.zip && unzip -o /tmp/${s.slug}.zip -d ${a.dir}`;
      inner = `<p>Install for all your projects:</p><div class="code"><button class="copy" data-copy-next>Copy</button><pre><code>${esc(cmd)}</code></pre></div>
        <p>Or just this project: unzip into <code>${esc(a.projectDir)}/</code>. Restart ${esc(a.name)} and the skill is picked up automatically.</p>`;
    }
    return `<div role="tabpanel" data-panel="${a.id}"${i ? ' hidden' : ''}>${inner}</div>`;
  }).join('');
  const git = `git clone --depth 1 --filter=blob:none --sparse ${s.repoUrl}.git && cd ${s.repo.split('/')[1]} && git sparse-checkout set "${s.path}"`;
  return `<section class="install" id="install">
    <h2>Install this skill</h2>
    <div class="tabs" role="tablist" data-tabs>${tabs}</div>
    <div class="panels">${panels}</div>
    <details class="dev"><summary>From source (git)</summary><div class="code"><button class="copy" data-copy-next>Copy</button><pre><code>${esc(git)}</code></pre></div></details>
  </section>`;
}

function skillPage(s) {
  const c = CATS[s.category];
  const related = [...byCat[s.category].filter(x => x !== s)].sort((a, b) => (b.collection === s.collection) - (a.collection === s.collection) || b.trust.score - a.trust.score).slice(0, 3);
  const realFindings = s.findings.filter(f => f.sev !== 'info');
  const body = `
<div class="wrap">${crumbs([['/', 'Home'], ['/skills/', 'Skills'], [`/categories/${s.category}/`, c.label], ['', s.name]])}</div>
<article class="skill wrap">
  <div class="skill__main">
    <header class="skill__head">
      <p class="kicker mono">№ ${s.no} · <a href="${u(`/categories/${s.category}/`)}">${c.glyph} ${esc(c.label)}</a></p>
      <h1>${esc(s.name)}</h1>
      <p class="skill__desc">${esc(s.description)}</p>
      <div class="skill__meta mono">
        <span>by <a href="https://github.com/${esc(s.author)}" rel="nofollow noopener" target="_blank">${esc(s.author)}</a></span>
        <span><a href="${u(`/collections/${collections.find(x => x.name === s.collection).id}/`)}">${esc(s.collection)}</a></span>
        ${s.version ? `<span>v${esc(s.version)}</span>` : ''}
        <span>${esc(s.license)}</span>
        <span>★ ${n(s.repoStars)}</span>
        <span>Updated ${fmtDate(s.updatedAt)}</span>
      </div>
      ${s.tags.length ? `<div class="tags">${s.tags.map(t => `<a class="chip" href="${u(`/skills/?q=${encodeURIComponent(t)}`)}">#${esc(t)}</a>`).join('')}</div>` : ''}
      <div class="row"><a class="btn btn--accent" href="#install">Install</a><a class="btn btn--ghost" href="${u(`/zips/${s.slug}.zip`)}" download>⤓ ZIP</a><a class="btn btn--ghost" href="${esc(s.sourceUrl)}" rel="nofollow noopener" target="_blank">View on GitHub ↗</a><button class="btn btn--ghost" data-share>Share</button></div>
    </header>

    ${DISCLAIMERS[s.category] ? `<p class="disclaimer"><b>Not ${DISCLAIMERS[s.category]} advice.</b> This skill helps your AI draft and organize. Laws, rates and rules change, so verify the output with official sources or a licensed ${DISCLAIMERS[s.category] === 'medical' ? 'clinician' : DISCLAIMERS[s.category] === 'legal' ? 'attorney' : 'professional'} before you rely on it.</p>` : ''}

    ${installBlock(s)}

    ${ad('inArticle')}

    <section class="doc">
      <div class="doc__bar"><h2>Skill instructions</h2><button class="btn btn--ghost btn--sm" data-copy-target="#skill-md">Copy SKILL.md</button></div>
      <div class="prose" data-collapsible>${markdownFor(s)}</div>
      <button class="btn btn--ghost expand" data-expand>Show full instructions ↓</button>
      <textarea id="skill-md" hidden>${esc(s.body)}</textarea>
    </section>

    <section class="files">
      <h2>Files <span class="mono">${s.files.length} · ${(s.size / 1024).toFixed(1)} KB</span></h2>
      <ul class="tree mono">${s.files.slice(0, 60).map(f => `<li><a href="${esc(`${s.repoUrl}/blob/${s.branch}/${s.path}/${f}`)}" rel="nofollow noopener" target="_blank">${esc(f)}</a></li>`).join('')}${s.files.length > 60 ? `<li>… ${s.files.length - 60} more</li>` : ''}</ul>
    </section>

    ${s.history?.length ? `<section class="history"><h2>Changelog</h2><ol>${s.history.map(h => `<li><time class="mono">${fmtDate(h.date)}</time><a href="${esc(h.url)}" rel="nofollow noopener" target="_blank">${esc(h.message)}</a></li>`).join('')}</ol></section>` : ''}
  </div>

  <aside class="skill__side">
    <div class="trust trust--${s.trust.level}">
      ${stamp(s.trust, 'stamp--lg')}
      <h3>Automated trust score</h3>
      <ul>${s.trust.why.map(w => `<li class="${w.delta >= 0 ? 'up' : 'down'}"><span class="mono">${w.delta > 0 ? '+' : ''}${w.delta}</span>${esc(w.msg)}</li>`).join('')}</ul>
      ${realFindings.length ? `<div class="findings"><h4>Scanner flags</h4>${realFindings.map(f => `<p><b class="sev sev--${f.sev}">${f.sev}</b> ${esc(f.label)}<br><span class="mono">${f.files.map(esc).join(', ')}</span></p>`).join('')}<p class="note">Flags are often harmless (docs showing install commands, for example). Read the files before running scripts.</p></div>` : ''}
      ${s.findings.some(f => f.sev === 'info') ? `<p class="note mono">Notes: ${s.findings.filter(f => f.sev === 'info').map(f => esc(f.label.toLowerCase())).join(' · ')}</p>` : ''}
      <a class="more" href="${u('/security/')}">How scoring works →</a>
    </div>
    ${ad('sidebar', 'sticky')}
  </aside>
</article>
${related.length ? `<section class="wrap section"><div class="section__head"><h2>Related <em>skills</em></h2><a class="more" href="${u(`/categories/${s.category}/`)}">More in ${esc(c.label)} →</a></div>${grid(related)}</section>` : ''}`;
  return layout({
    title: `${s.name}: AI agent skill`, path: `/skills/${s.slug}/`, body, description: s.description,
    schema: {
      '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: s.name, description: s.description,
      applicationCategory: 'DeveloperApplication', operatingSystem: 'Any', license: s.license, softwareVersion: s.version || undefined,
      author: { '@type': 'Organization', name: s.author }, codeRepository: s.sourceUrl, dateModified: s.updatedAt,
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD' },
    },
  });
}

function categoriesIndex() {
  const body = `${pageHead('Browse', 'Categories', 'Find skills by the job you need done.')}
<section class="wrap"><div class="cats cats--big">${usedCats.map((c, i) => `<a class="cat reveal" style="--d:${i * 30}ms" href="${u(`/categories/${c}/`)}"><span class="cat__glyph">${CATS[c].glyph}</span><span class="cat__name">${esc(CATS[c].label)}</span><span class="cat__blurb">${esc(CATS[c].blurb)}</span><span class="cat__n mono">${plural(byCat[c].length, 'skill')}</span></a>`).join('')}</div></section>`;
  return layout({ title: 'Categories', path: '/categories/', body });
}

function categoryPage(c) {
  const list = [...byCat[c]].sort((a, b) => b.trust.score - a.trust.score);
  const body = `<div class="wrap">${crumbs([['/', 'Home'], ['/categories/', 'Categories'], ['', CATS[c].label]])}</div>
${pageHead(`${CATS[c].glyph} ${plural(list.length, 'skill')}`, esc(CATS[c].label), esc(CATS[c].blurb))}
<section class="wrap"><div class="row"><a class="btn btn--ghost" href="${u(`/bundles/#${c}`)}">⤓ Get the ${esc(CATS[c].label)} starter bundle</a></div>${grid(list, { feedAds: true })}</section>`;
  return layout({ title: `${CATS[c].label} skills`, path: `/categories/${c}/`, body, description: `${list.length} open-source AI agent skills for ${CATS[c].label.toLowerCase()}: ${CATS[c].blurb}` });
}

function collectionsIndex() {
  const body = `${pageHead('Sources', 'Collections', 'Every skill comes from an open-source GitHub collection. These are the ones we index today.')}
<section class="wrap"><div class="colls">${collections.map(c => `<a class="coll" href="${u(`/collections/${c.id}/`)}"><h3>${esc(c.name)}</h3><p class="mono">${plural(c.list.length, 'skill')} · ★ ${n(c.stars)} · ${plural(c.repos.length, 'repo')}</p><p>${esc(sources.find(s => s.repo === c.repos[0])?.description || '')}</p></a>`).join('')}</div></section>`;
  return layout({ title: 'Collections', path: '/collections/', body });
}

function collectionPage(c) {
  const body = `<div class="wrap">${crumbs([['/', 'Home'], ['/collections/', 'Collections'], ['', c.name]])}</div>
${pageHead(plural(c.list.length, 'skill'), esc(c.name), `Indexed from ${c.repos.map(r => `<a href="https://github.com/${esc(r)}" rel="nofollow noopener" target="_blank">${esc(r)}</a>`).join(', ')}.`)}
<section class="wrap">${grid([...c.list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), { feedAds: true })}</section>`;
  return layout({ title: `${c.name} collection`, path: `/collections/${c.id}/`, body });
}

const bundles = usedCats.map(c => ({ id: c, cat: CATS[c], list: [...byCat[c]].sort((a, b) => b.trust.score - a.trust.score).slice(0, 6) })).filter(b => b.list.length >= 2);
function bundlesPage() {
  const body = `${pageHead('Starter packs', 'Bundles', 'The highest-scoring skills in each category, packed into one download. Unzip into your skills folder, or upload each folder to Claude.')}
<section class="wrap bundles">${bundles.map(b => `<article class="bundle" id="${b.id}">
  <div class="bundle__head"><span class="cat__glyph">${b.cat.glyph}</span><div><h2>${esc(b.cat.label)} starter pack</h2><p class="mono">${plural(b.list.length, 'skill')}</p></div><a class="btn btn--accent" href="${u(`/bundles/${b.id}.zip`)}" download>⤓ Download bundle</a></div>
  <ul>${b.list.map(s => `<li><a href="${u(`/skills/${s.slug}/`)}">${esc(s.name)}</a><span class="mono">${s.trust.score}</span></li>`).join('')}</ul>
</article>`).join('')}</section>`;
  return layout({ title: 'Skill bundles', path: '/bundles/', body });
}

function agentsIndex() {
  const body = `${pageHead('Compatibility', 'Supported <em>agents</em>', 'Skills follow an open format, so one folder works across many AI tools. Pick yours for exact install steps.')}
<section class="wrap"><div class="colls">${cfg.agents.map(a => `<a class="coll" href="${u(`/agents/${a.id}/`)}"><span class="agent__dot agent__dot--lg">${esc(a.name[0])}</span><h3>${esc(a.name)}</h3><p class="mono">${a.kind === 'zip' ? 'Upload a ZIP, no code' : a.kind === 'paste' ? 'Paste instructions' : `Skills folder: ${esc(a.dir)}`}</p></a>`).join('')}</div></section>`;
  return layout({ title: 'Supported agents', path: '/agents/', body });
}

function agentPage(a) {
  const list = skills.filter(s => agentsFor(s).includes(a));
  const how = a.kind === 'cli'
    ? `<ol><li>Create the skills folder if it doesn't exist: <code>${esc(a.dir)}</code> (all projects) or <code>${esc(a.projectDir)}</code> (one project).</li><li>Download any skill's ZIP from ${esc(cfg.name)} and unzip it there. Every skill page also has a copy-paste command.</li><li>Restart ${esc(a.name)}. Each skill's description is loaded, and its full instructions are read only when your request matches.</li></ol><p class="note">Folder paths can change between versions of ${esc(a.name)}. If a skill isn't detected, check the tool's docs for its current skills directory.</p>`
    : `<ol>${a.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
  const body = `<div class="wrap">${crumbs([['/', 'Home'], ['/agents/', 'Agents'], ['', a.name]])}</div>
${pageHead(`${plural(list.length, 'compatible skill')}`, `Skills for <em>${esc(a.name)}</em>`, `How to install AI skills in ${esc(a.name)}, plus every compatible skill in the library.`)}
<section class="wrap"><div class="howto">${how}</div>${grid(list.sort((x, y) => y.trust.score - x.trust.score).slice(0, 60), { feedAds: true })}<p class="center"><a class="btn btn--ghost" href="${u(`/skills/?agent=${a.id}`)}">See all ${n(list.length)} →</a></p></section>`;
  return layout({ title: `${a.name} skills: install guide`, path: `/agents/${a.id}/`, body, description: `Install open-source skills in ${a.name}. Step-by-step guide and ${list.length} compatible skills.` });
}

function mcpPage() {
  const body = `${pageHead(`${n(mcp.length)} servers · official registry`, 'MCP <em>servers</em>', 'Model Context Protocol servers give your AI live access to tools and data. This list mirrors the official MCP registry and refreshes on every build.')}
<section class="wrap">
  <div class="filters"><input type="search" data-mcp-q placeholder="Search MCP servers…" aria-label="Search MCP servers"><select data-mcp-kind aria-label="Type"><option value="">Any type</option><option value="remote">Remote (hosted)</option><option value="npm">npm</option><option value="pypi">PyPI</option><option value="oci">Docker</option></select></div>
  <p class="mono count" data-mcp-count></p>
  <div class="mcp-list" data-mcp-list></div>
  <p class="center"><button class="btn btn--ghost" data-mcp-more>Load more</button></p>
  ${ad('inArticle')}
</section>`;
  return layout({ title: 'MCP servers', path: '/mcp/', body, description: `Directory of ${mcp.length} Model Context Protocol servers, synced from the official MCP registry.` });
}

// ---------- guides ----------
const guides = fs.readdirSync(path.join(ROOT, 'content/guides')).filter(f => f.endsWith('.md')).map(f => {
  const raw = fs.readFileSync(path.join(ROOT, 'content/guides', f), 'utf8');
  const [, fm, md] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = Object.fromEntries(fm.split('\n').map(l => l.split(/:\s(.+)/).slice(0, 2)));
  return { slug: f.replace(/\.md$/, ''), ...meta, order: Number(meta.order || 99), html: new Marked({ gfm: true }).parse(md.replaceAll('{{site}}', cfg.name).replaceAll('{{base}}', BASE)) };
}).sort((a, b) => a.order - b.order);

function guidesIndex() {
  const body = `${pageHead('Learn', 'Guides', 'Plain-English guides to getting more out of AI skills.')}
<section class="wrap"><div class="colls">${guides.map((g, i) => `<a class="coll guide-card" href="${u(`/guides/${g.slug}/`)}"><span class="mono">Guide ${String(i + 1).padStart(2, '0')} · ${esc(g.level)}</span><h3>${esc(g.title)}</h3><p>${esc(g.description)}</p></a>`).join('')}</div></section>`;
  return layout({ title: 'Guides', path: '/guides/', body });
}

function guidePage(g) {
  const body = `<div class="wrap">${crumbs([['/', 'Home'], ['/guides/', 'Guides'], ['', g.title]])}</div>
<article class="wrap article">
  <header><p class="kicker mono">${esc(g.level)} · ${esc(g.minutes)} min read</p><h1>${esc(g.title)}</h1><p class="lede">${esc(g.description)}</p></header>
  <div class="prose">${g.html.replace(/(<\/p>)/, `$1${ad('inArticle')}`)}</div>
  <nav class="next">${guides.filter(x => x !== g).slice(0, 3).map(x => `<a class="coll" href="${u(`/guides/${x.slug}/`)}"><span class="mono">Next guide</span><h3>${esc(x.title)}</h3></a>`).join('')}</nav>
</article>`;
  return layout({ title: g.title, path: `/guides/${g.slug}/`, body, description: g.description, schema: { '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, dateModified: generatedAt } });
}

function getStarted() {
  const body = `${pageHead('Start here', 'Your first skill in <em>two minutes</em>', 'Pick the AI tool you use. We will show you exactly what to do.')}
<section class="wrap wizard" data-wizard>
  <div class="wizard__step"><h2><span class="mono">1</span> Which AI do you use?</h2>
    <div class="choices">${cfg.agents.map(a => `<button class="choice" data-pick="${a.id}">${esc(a.name)}</button>`).join('')}</div></div>
  ${cfg.agents.map(a => `<div class="wizard__step" data-for="${a.id}" hidden><h2><span class="mono">2</span> Add a skill to ${esc(a.name)}</h2>
    ${a.kind === 'cli' ? `<ol><li>Open any skill page and choose the <b>${esc(a.name)}</b> tab under “Install”.</li><li>Copy the one-line command and paste it into your terminal.</li><li>Restart ${esc(a.name)}. Done.</li></ol>` : `<ol>${a.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`}
    <h2><span class="mono">3</span> Try one of these</h2>${grid(trusted.filter(s => agentsFor(s).includes(a)).slice(0, 3))}</div>`).join('')}
</section>`;
  return layout({ title: 'Get started', path: '/get-started/', body });
}

function statsPage() {
  const bar = (rows, max) => `<div class="bars">${rows.map(([l, v, h]) => `<a class="bar" ${h ? `href="${u(h)}"` : ''}><span class="bar__l">${esc(l)}</span><span class="bar__t"><i style="--w:${(v / max) * 100}%"></i></span><span class="bar__v mono">${n(v)}</span></a>`).join('')}</div>`;
  const catRows = usedCats.map(c => [CATS[c].label, byCat[c].length, `/categories/${c}/`]).sort((a, b) => b[1] - a[1]);
  const collRows = collections.map(c => [c.name, c.list.length, `/collections/${c.id}/`]);
  const lic = Object.entries(skills.reduce((m, s) => (m[s.license] = (m[s.license] || 0) + 1, m), {})).sort((a, b) => b[1] - a[1]);
  const trustRows = [['Trusted (80+)', skills.filter(s => s.trust.level === 'trusted').length], ['Review (60–79)', skills.filter(s => s.trust.level === 'review').length], ['Caution (<60)', skills.filter(s => s.trust.level === 'caution').length]];
  const months = {};
  for (const s of skills) for (const h of s.history || []) { const k = h.date.slice(0, 7); months[k] = (months[k] || 0) + 1; }
  const mRows = Object.entries(months).sort().slice(-12).map(([k, v]) => [new Date(`${k}-01`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), v]);
  const mMax = Math.max(...mRows.map(r => r[1]), 1);
  const body = `${pageHead(`Generated ${fmtDate(generatedAt)}`, 'Library <em>stats</em>', 'Live numbers from the latest index run.')}
<section class="wrap stats">
  <section class="counters">${[[skills.length, 'skills'], [sources.length, 'repos'], [mcp.length, 'MCP servers'], [skills.reduce((a, s) => a + s.files.length, 0), 'files scanned'], [Math.round(skills.reduce((a, s) => a + s.trust.score, 0) / skills.length), 'avg. trust']].map(([k, l]) => `<div><b>${n(k)}</b><span class="mono">${l}</span></div>`).join('')}</section>
  <div class="stats__grid">
    <div class="panel"><h2>Skills by category</h2>${bar(catRows, catRows[0][1])}</div>
    <div class="panel"><h2>Skills by collection</h2>${bar(collRows, collRows[0][1])}</div>
    <div class="panel"><h2>Updates per month</h2><div class="cols">${mRows.map(([l, v]) => `<div class="col"><i style="--h:${(v / mMax) * 100}%" title="${v} updates"></i><span class="mono">${l}</span></div>`).join('')}</div></div>
    <div class="panel"><h2>Trust levels</h2>${bar(trustRows, skills.length)}<h2 class="mt">Licenses</h2>${bar(lic, skills.length)}</div>
  </div>
</section>`;
  return layout({ title: 'Stats', path: '/stats/', body });
}

const feedItems = skills.flatMap(s => (s.history || []).map(h => ({ ...h, s }))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 120);
function whatsNew() {
  let lastDay = '';
  const items = feedItems.map(it => {
    const day = fmtDate(it.date);
    const head = day !== lastDay ? `<li class="day mono">${day}</li>` : '';
    lastDay = day;
    return `${head}<li class="entry"><a class="entry__skill" href="${u(`/skills/${it.s.slug}/`)}">${esc(it.s.name)}</a><span>${esc(it.message)}</span><a class="mono" href="${esc(it.url)}" rel="nofollow noopener" target="_blank">${it.sha}</a></li>`;
  }).join('');
  const body = `${pageHead('Changelog', "What's <em>new</em>", `Every change to every skill, pulled from upstream commits. Subscribe via <a href="${u('/feed.xml')}">RSS</a>.`)}
<section class="wrap"><ul class="feed">${items}</ul></section>`;
  return layout({ title: "What's new", path: '/whats-new/', body });
}

function securityPage() {
  const body = `${pageHead('Trust & safety', 'How we <em>scan</em> skills', 'Skills can include scripts that your AI will run on your machine. Here is exactly what we check, and what the score means.')}
<article class="wrap article"><div class="prose">
<h2>On every build</h2>
<p>Several times a day, an automated job downloads every source repository fresh from GitHub and reads every text file in every skill folder. Nothing is cached from earlier runs, so a change upstream is re-checked within hours.</p>
<h2>What the scanner looks for</h2>
<table><thead><tr><th>Check</th><th>Severity</th><th>Why it matters</th></tr></thead><tbody>
<tr><td>Download-and-run (<code>curl … | sh</code>)</td><td>High</td><td>Runs code that isn't in the skill and could change at any time.</td></tr>
<tr><td>Destructive deletes on home or root</td><td>High</td><td>Can wipe files if executed blindly.</td></tr>
<tr><td>Prompt-injection phrasing</td><td>High</td><td>Text that tries to override your agent's instructions.</td></tr>
<tr><td>Dynamic eval / encoded blobs</td><td>Medium</td><td>Can hide behavior from a human reviewer.</td></tr>
<tr><td>Hard-coded secrets</td><td>Medium</td><td>Leaked credentials, a sign of poor hygiene.</td></tr>
<tr><td>Network calls / shell commands</td><td>Info</td><td>Normal for many skills, shown so you know.</td></tr>
</tbody></table>
<h2>The trust score</h2>
<p>Every skill starts at a neutral baseline. Points are added for an open license, a clear description, versioned releases, cited sources, recent maintenance and an established upstream repository. Points are subtracted for each scanner flag. Each skill page shows the full breakdown, line by line.</p>
<ul><li><b>80–99 Trusted.</b> No serious flags and a healthy project.</li><li><b>60–79 Review.</b> Something deserves a look before you run scripts.</li><li><b>Below 60 Caution.</b> Read every file before installing.</li></ul>
<h2>What it is not</h2>
<p>The score is an automated signal, not a human audit or a guarantee. Many flags are harmless, such as documentation that shows an install command. Always read a skill's scripts before letting your agent run them, especially with access to sensitive files or accounts.</p>
<h2>Licensing</h2>
<p>We only publish skills with an open-source license (MIT, Apache-2.0, BSD, ISC, MPL and similar). Skills marked proprietary or without a license are skipped automatically. Every page credits the author and links to the original source.</p>
<h2>Report a problem</h2>
<p>Found something unsafe? <a href="https://github.com/${esc(cfg.repo)}/issues/new?title=Security%20report">Open an issue</a> or email <a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a>. We pull flagged skills while we investigate.</p>
</div></article>`;
  return layout({ title: 'How we scan skills', path: '/security/', body });
}

function submitPage() {
  const issue = `https://github.com/${cfg.repo}/issues/new?title=${encodeURIComponent('Add skill source: owner/repo')}&body=${encodeURIComponent('Repository URL:\n\nLicense:\n\nWhat do these skills do?\n')}`;
  const body = `${pageHead('Contribute', 'Submit a <em>skill</em>', 'Share your skill with everyone who uses AI agents. It takes one link.')}
<article class="wrap article"><div class="prose">
<ol class="steps steps--inline">
  <li><span class="steps__n">01</span><h3>Publish on GitHub</h3><p>A public repo with one folder per skill, each containing a <code>SKILL.md</code>.</p></li>
  <li><span class="steps__n">02</span><h3>Add a license</h3><p>MIT or Apache-2.0 recommended. Unlicensed skills can't be listed.</p></li>
  <li><span class="steps__n">03</span><h3>Send the link</h3><p>We add the repo to our sources. From then on, every push syncs automatically.</p></li>
</ol>
<p><a class="btn btn--accent btn--lg" href="${issue}" target="_blank" rel="noopener">Submit your repo on GitHub ↗</a></p>
<h2>Checklist for a great listing</h2>
<ul>
<li><b>A sharp description.</b> The <code>description</code> in your frontmatter is what the agent reads to decide when to use the skill. Say what it does <em>and</em> when to use it.</li>
<li><b>Optional <code>metadata.json</code></b> with <code>display_name</code>, <code>tags</code>, <code>version</code> and <code>category</code> gives you a nicer page.</li>
<li><b>Keep scripts readable.</b> No minified or encoded code. The scanner will flag it.</li>
<li><b>Cite sources</b> for factual claims (rules, rates, laws) so users can trust the output.</li>
</ul>
<p>New to writing skills? Read <a href="${u('/guides/write-your-own-skill/')}">Write your own skill</a>.</p>
</div></article>`;
  return layout({ title: 'Submit a skill', path: '/submit/', body });
}

function simplePage(slug, title, html) {
  return layout({ title, path: `/${slug}/`, body: `${pageHead(cfg.name, title)}<article class="wrap article"><div class="prose">${html}</div></article>` });
}

const ABOUT = `<p>${esc(cfg.name)} is an independent, open index of skills for AI agents. Skills are small folders of instructions and tools that teach assistants like Claude, Codex, Copilot and Cursor to do specific jobs well.</p>
<p>There are thousands of great skills scattered across GitHub, but they are hard to find, hard to judge, and hard to install. We fix that: one searchable library, a transparent safety scan, and one-click install for every major agent.</p>
<h2>Where the skills come from</h2><p>Every listing is pulled automatically from open-source repositories, including:</p><ul>${sources.map(s => `<li><a href="${esc(s.url)}" rel="nofollow noopener" target="_blank">${esc(s.repo)}</a> (${esc(s.license || 'per-skill license')}, ${plural(s.count, 'skill')})</li>`).join('')}</ul>
<p>All credit goes to the authors. We never rewrite their skills, and each page links back to the original source.</p>
<h2>How we keep the lights on</h2><p>The library is free, supported by advertising and <a href="${u('/advertise/')}">sponsorships</a>.</p>`;
const ADVERTISE = `<p>${esc(cfg.name)} reaches developers, founders and power users who are actively choosing AI tools. They are looking for new capabilities right when they land here.</p>
<h2>Options</h2><ul><li><b>Featured skill or MCP server:</b> top placement on the home page and in its category.</li><li><b>Category sponsorship:</b> own a category page, like “Developer Tools, presented by…”.</li><li><b>Newsletter sponsorship:</b> one slot per weekly issue.</li></ul>
<p>Email <a href="mailto:${esc(cfg.contactEmail)}?subject=Advertising">${esc(cfg.contactEmail)}</a> for rates and traffic numbers.</p>`;
const PRIVACY = `<p><i>Last updated ${fmtDate(generatedAt)}.</i> Replace this template with a policy reviewed for your jurisdiction before launch.</p>
<h2>What we collect</h2><p>${esc(cfg.name)} has no accounts. We store a theme preference in your browser. If analytics are enabled, we collect aggregate, anonymized usage statistics.</p>
<h2>Advertising</h2><p>We use Google AdSense to show ads. Google and its partners may use cookies to serve ads based on your visits to this and other websites. You can opt out of personalized advertising at <a href="https://adssettings.google.com" rel="noopener" target="_blank">Google Ads Settings</a>. See <a href="https://policies.google.com/technologies/partner-sites" rel="noopener" target="_blank">how Google uses data from partner sites</a>. Visitors in the EEA, UK and Switzerland are asked for consent through a certified consent management platform.</p>
<h2>Third-party content</h2><p>Skill files are downloaded from our servers. Links to GitHub and other sites are governed by those sites' policies.</p>
<h2>Contact</h2><p><a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a></p>`;
const TERMS = `<p><i>Last updated ${fmtDate(generatedAt)}.</i> Replace this template with terms reviewed for your jurisdiction before launch.</p>
<h2>Use of skills</h2><p>Skills are provided by third-party authors under their own open-source licenses, as is, without warranty. You are responsible for reviewing any skill and its scripts before installing or running it.</p>
<h2>Trust scores</h2><p>Trust scores are automated signals, not security certifications or endorsements.</p>
<h2>Takedowns</h2><p>Authors can request removal or correction at any time via <a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a>.</p>`;
const CONTACT = `<p>Questions, takedown requests, partnerships or press: <a href="mailto:${esc(cfg.contactEmail)}">${esc(cfg.contactEmail)}</a>.</p><p>Bugs and skill suggestions: <a href="https://github.com/${esc(cfg.repo)}/issues" rel="noopener" target="_blank">GitHub issues</a>.</p>`;

// ---------- feeds & meta files ----------
function feedXml() {
  const items = feedItems.slice(0, 50).map(it => `<item><title>${esc(`${it.s.name}: ${it.message}`)}</title><link>${abs(`/skills/${it.s.slug}/`)}</link><guid isPermaLink="false">${it.s.slug}-${it.sha}</guid><pubDate>${new Date(it.date).toUTCString()}</pubDate><description>${esc(it.s.description)}</description></item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(cfg.name)}: skill updates</title><link>${abs('/')}</link><description>${esc(cfg.description)}</description><lastBuildDate>${new Date(generatedAt).toUTCString()}</lastBuildDate>${items}</channel></rss>`;
}
const pagesForSitemap = [];
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#17140f"/><rect x="6" y="9" width="4" height="15" fill="#f4efe4"/><rect x="11.5" y="6" width="4" height="18" fill="#ff4f1f"/><rect x="17" y="10" width="4" height="14" fill="#f4efe4"/><rect x="22" y="8" width="4" height="16" fill="#f4efe4" transform="rotate(12 24 16)"/><rect x="5" y="24" width="22" height="2.5" fill="#f4efe4"/></svg>`;
const og = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#f4efe4"/><text x="80" y="300" font-family="Georgia,serif" font-size="110" fill="#17140f">Teach your AI</text><text x="80" y="420" font-family="Georgia,serif" font-style="italic" font-size="110" fill="#ff4f1f">new tricks.</text><text x="80" y="540" font-family="monospace" font-size="34" fill="#4a443a">${esc(cfg.name)} · ${skills.length} open-source agent skills</text></svg>`;

// ---------- build ----------
function emit(rel, html) { write(rel, html); if (rel.endsWith('index.html')) pagesForSitemap.push(`/${rel.replace(/index\.html$/, '')}`); }

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.cpSync(path.join(ROOT, 'src'), path.join(DIST, 'assets'), { recursive: true });

emit('index.html', home());
emit('skills/index.html', skillsIndex());
for (const s of skills) emit(`skills/${s.slug}/index.html`, skillPage(s));
emit('categories/index.html', categoriesIndex());
for (const c of usedCats) emit(`categories/${c}/index.html`, categoryPage(c));
emit('collections/index.html', collectionsIndex());
for (const c of collections) emit(`collections/${c.id}/index.html`, collectionPage(c));
emit('bundles/index.html', bundlesPage());
emit('agents/index.html', agentsIndex());
for (const a of cfg.agents) emit(`agents/${a.id}/index.html`, agentPage(a));
emit('mcp/index.html', mcpPage());
emit('guides/index.html', guidesIndex());
for (const g of guides) emit(`guides/${g.slug}/index.html`, guidePage(g));
emit('get-started/index.html', getStarted());
emit('stats/index.html', statsPage());
emit('whats-new/index.html', whatsNew());
emit('security/index.html', securityPage());
emit('submit/index.html', submitPage());
emit('about/index.html', simplePage('about', 'About', ABOUT));
emit('advertise/index.html', simplePage('advertise', 'Advertise', ADVERTISE));
emit('privacy/index.html', simplePage('privacy', 'Privacy policy', PRIVACY));
emit('terms/index.html', simplePage('terms', 'Terms of use', TERMS));
emit('contact/index.html', simplePage('contact', 'Contact', CONTACT));
write('404.html', layout({ title: 'Not found', path: '/404', body: `${pageHead('404', 'This shelf is <em>empty.</em>', `The page moved or never existed. <a href="${u('/skills/')}">Browse all skills →</a>`)}` }));

// Search index for the ⌘K palette, and the MCP list.
write('data/index.json', JSON.stringify(skills.map(s => [s.slug, s.name, s.description.slice(0, 140), CATS[s.category].label, s.tags.join(' ')])));
write('data/mcp.json', JSON.stringify(mcp.map(m => [m.title, m.name, m.description, m.version, m.website, m.remote, m.packages.map(p => p.type).join(' '), m.packages[0]?.id || ''])));

write('feed.xml', feedXml());
write('favicon.svg', favicon);
write('og.svg', og);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${abs('/sitemap.xml')}\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pagesForSitemap.map(p => `<url><loc>${abs(p)}</loc><lastmod>${generatedAt.slice(0, 10)}</lastmod></url>`).join('')}</urlset>`);
if (adsLive) write('ads.txt', `google.com, ${cfg.ads.adsenseClient.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n`);
if (cfg.siteUrl && !/example\.com/.test(cfg.siteUrl) && !BASE) write('CNAME', new URL(cfg.siteUrl).host);
write('.nojekyll', '');

// ZIPs: one per skill (folder named after the skill) and one per bundle.
const stage = path.join(ROOT, '.cache', 'zipstage');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'zips'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'bundles'), { recursive: true });
for (const s of skills) {
  const dir = path.join(stage, s.slug, s.id);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.cpSync(path.join(ROOT, s.cacheDir), dir, { recursive: true, filter: src => !/(SKILL_[A-Z]{2}\.md|optimization-log\.json|\/\.git)$/.test(src) });
  if (s.repoLicenseFile) fs.copyFileSync(path.join(ROOT, s.repoLicenseFile), path.join(dir, 'LICENSE'));
  execFileSync('zip', ['-qr', path.join(DIST, 'zips', `${s.slug}.zip`), s.id], { cwd: path.join(stage, s.slug) });
}
for (const b of bundles) {
  const dir = path.join(stage, `bundle-${b.id}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const s of b.list) fs.cpSync(path.join(stage, s.slug, s.id), path.join(dir, s.id), { recursive: true });
  execFileSync('zip', ['-qr', path.join(DIST, 'bundles', `${b.id}.zip`), '.'], { cwd: dir });
}
fs.rmSync(stage, { recursive: true, force: true });

console.log(`Built ${pagesForSitemap.length} pages, ${skills.length} skill ZIPs, ${bundles.length} bundles → dist/`);
