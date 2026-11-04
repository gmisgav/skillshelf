// Pulls every source repo from GitHub, indexes its SKILL.md folders, scans them,
// and writes data/skills.json + data/mcp.json. Run on a schedule by CI.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'repos');
const DATA = path.join(ROOT, 'data');
const { sources } = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || tryGhToken();
const OPEN_LICENSES = /^(MIT|Apache-2\.0|BSD-[23]-Clause|ISC|MPL-2\.0|CC-BY-4\.0|CC0-1\.0|Unlicense|0BSD)$/i;

function tryGhToken() {
  try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim(); } catch { return ''; }
}

async function gh(url, { raw = false } = {}) {
  const res = await fetch(url.startsWith('http') ? url : `https://api.github.com/${url}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'skillshelf-indexer', ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }) },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// ---------- license detection ----------
function detectLicenseText(text) {
  if (/MIT License|Permission is hereby granted, free of charge/i.test(text)) return 'MIT';
  if (/Apache License[\s,]*Version 2\.0/i.test(text)) return 'Apache-2.0';
  if (/BSD 3-Clause|Redistribution and use in source and binary forms/i.test(text)) return 'BSD-3-Clause';
  if (/ISC License/i.test(text)) return 'ISC';
  if (/Mozilla Public License,? v(ersion)? ?2\.0/i.test(text)) return 'MPL-2.0';
  return null;
}

function resolveLicense(front, skillDir, repoLicense) {
  const declared = String(front.license || '').trim();
  if (/proprietary|all rights reserved|source-available/i.test(declared)) return null;
  if (OPEN_LICENSES.test(declared)) return declared.toUpperCase() === 'MIT' ? 'MIT' : declared;
  for (const f of ['LICENSE', 'LICENSE.txt', 'LICENSE.md']) {
    const p = path.join(skillDir, f);
    if (fs.existsSync(p)) {
      const text = fs.readFileSync(p, 'utf8');
      if (/proprietary|all rights reserved/i.test(text.slice(0, 2000))) return null;
      const l = detectLicenseText(text);
      if (l) return l;
    }
  }
  if (repoLicense && OPEN_LICENSES.test(repoLicense)) return repoLicense;
  return null;
}

// ---------- automated scan ----------
const RISK_RULES = [
  { id: 'pipe-to-shell', sev: 'high', re: /(curl|wget)[^\n|]*\|\s*(ba|z)?sh\b/, label: 'Downloads and pipes a remote script into a shell' },
  { id: 'rm-rf-root', sev: 'high', re: /rm\s+-rf\s+(\/|~|\$HOME)(\s|$)/, label: 'Destructive recursive delete on home/root' },
  { id: 'eval', sev: 'medium', re: /(?<![.\w])eval\s*\(|\bexec\s*\(\s*(base64|atob|compile)/, label: 'Dynamic code evaluation' },
  { id: 'base64-blob', sev: 'medium', re: /[A-Za-z0-9+/]{400,}={0,2}/, label: 'Large encoded blob' },
  { id: 'secrets', sev: 'medium', re: /(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{36})/, label: 'Looks like a hard-coded secret' },
  { id: 'prompt-injection', sev: 'high', re: /ignore (all )?(previous|prior) instructions|disregard (the )?system prompt/i, label: 'Prompt-injection phrasing' },
  { id: 'network', sev: 'info', re: /\b(requests\.(get|post)|fetch\(|axios\.|urllib\.request|http\.client)/, label: 'Makes network requests' },
  { id: 'subprocess', sev: 'info', re: /\b(subprocess\.|child_process|os\.system\()/, label: 'Runs shell commands' },
];
const TEXT_EXT = /\.(md|txt|py|js|mjs|ts|sh|json|ya?ml|toml|html|css|rb|go)$/i;

function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, acc);
    else acc.push({ rel: path.relative(base, p), size: fs.statSync(p).size });
  }
  return acc;
}

function scan(skillDir, files) {
  const findings = new Map();
  for (const f of files) {
    if (!TEXT_EXT.test(f.rel) || f.size > 512_000) continue;
    const text = fs.readFileSync(path.join(skillDir, f.rel), 'utf8');
    for (const r of RISK_RULES) {
      if (r.re.test(text)) {
        const k = findings.get(r.id) || { ...r, re: undefined, files: [] };
        if (k.files.length < 4) k.files.push(f.rel);
        findings.set(r.id, k);
      }
    }
  }
  return [...findings.values()].map(({ re, ...f }) => f);
}

function trustScore(s) {
  let score = 58;
  const why = [];
  const add = (n, msg) => { score += n; why.push({ delta: n, msg }); };
  add(10, `Open-source license (${s.license})`);
  if (s.description.length >= 160) add(6, 'Detailed trigger description');
  else if (s.description.length < 60) add(-6, 'Very short description');
  if (s.version) add(4, `Versioned release (v${s.version})`);
  if (s.hasReferences) add(4, 'Ships reference material');
  if (s.hasEvidence) add(6, 'Cites sources for its claims');
  const ageDays = (Date.now() - Date.parse(s.updatedAt)) / 864e5;
  if (ageDays < 60) add(6, 'Updated in the last 60 days');
  else if (ageDays > 365) add(-6, 'Not updated for over a year');
  if (s.repoStars > 1000) add(6, 'Popular upstream repository');
  else if (s.repoStars > 50) add(3, 'Established upstream repository');
  for (const f of s.findings) {
    if (f.sev === 'high') add(-18, f.label);
    else if (f.sev === 'medium') add(-7, f.label);
  }
  if (!s.findings.some(f => f.sev !== 'info')) add(4, 'No risky patterns found by the scanner');
  score = Math.max(5, Math.min(99, Math.round(score)));
  const level = score >= 80 ? 'trusted' : score >= 60 ? 'review' : 'caution';
  return { score, level, why };
}

// ---------- category inference ----------
const CATEGORY_HINTS = [
  ['documents-data', /\b(pdf|docx|xlsx|spreadsheet|csv|document|excel|word|pptx|slides|data analysis|dataset)\b/i],
  ['ai-ml', /\b(model|training|fine-tun|inference|hugging ?face|llm|embedding|transformers|gradio)\b/i],
  ['design-creative', /\b(design|art|brand|theme|illustrat|image|visual|css|figma|ui)\b/i],
  ['security-compliance', /\b(security|vulnerab|privacy|gdpr|audit|compliance)\b/i],
  ['workflow', /\b(plan|brainstorm|debug|tdd|test-driven|review|refactor|commit|worktree)\b/i],
  ['marketing-growth', /\b(seo|marketing|social media|campaign|ads?\b|growth)\b/i],
  ['communication', /\b(email|slack|message|newsletter|comms)\b/i],
  ['developer-tools', /\b(code|api|git|deploy|cli|sdk|build|plugin|mcp|hook)\b/i],
];
function inferCategory(text) {
  for (const [cat, re] of CATEGORY_HINTS) if (re.test(text)) return cat;
  return 'other';
}

// ---------- per-source indexing ----------
function parseSkillMd(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { front: {}, body: raw };
  let front = {};
  try { front = YAML.parse(m[1]) || {}; } catch { /* malformed frontmatter: keep body */ }
  return { front, body: m[2] };
}

function findSkillDirs(dir, depth = 0, acc = []) {
  if (depth > 5) return acc;
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) { acc.push(dir); return acc; }
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || ['node_modules', 'template', 'templates', 'spec', 'tests', 'examples'].includes(e.name)) continue;
    findSkillDirs(path.join(dir, e.name), depth + 1, acc);
  }
  return acc;
}

const ACRONYMS = { mcp: 'MCP', api: 'API', pdf: 'PDF', ui: 'UI', ux: 'UX', hf: 'HF', cli: 'CLI', seo: 'SEO', ai: 'AI', llm: 'LLM', sdk: 'SDK', gpu: 'GPU', css: 'CSS', html: 'HTML', md: 'MD', gif: 'GIF', imessage: 'iMessage', github: 'GitHub', vat: 'VAT', rtl: 'RTL', ocr: 'OCR', nlp: 'NLP', wcag: 'WCAG', tdd: 'TDD' };
function humanize(name) {
  return name.split(/[-_\s]+/).map(w => ACRONYMS[w.toLowerCase()] || w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function indexSource(src) {
  const [owner, name] = src.repo.split('/');
  const repo = await gh(`repos/${src.repo}`);
  const dest = path.join(CACHE, `${owner}__${name}`);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const tgz = await gh(`repos/${src.repo}/tarball/${repo.default_branch}`, { raw: true });
  const tgzPath = `${dest}.tgz`;
  fs.writeFileSync(tgzPath, tgz);
  execFileSync('tar', ['-xzf', tgzPath, '-C', dest, '--strip-components=1']);
  fs.rmSync(tgzPath);

  const skills = [];
  let skipped = 0;
  for (const dir of findSkillDirs(dest)) {
    const relPath = path.relative(dest, dir);
    const { front, body } = parseSkillMd(path.join(dir, 'SKILL.md'));
    const license = resolveLicense(front, dir, repo.license?.spdx_id);
    if (!license) { skipped++; continue; }
    let meta = {};
    const metaFile = path.join(dir, 'metadata.json');
    if (fs.existsSync(metaFile)) { try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch {} }
    const id = String(front.name || path.basename(dir)).trim();
    const description = String(meta.display_description?.en || front.description || '').trim();
    if (!description) { skipped++; continue; }
    const files = walk(dir).filter(f => !/(^|\/)(SKILL_[A-Z]{2}\.md|optimization-log\.json)$/.test(f.rel));
    const category =
      src.categories?.[id] || src.category || meta.category ||
      (src.categoryFromRepo ? name : null) ||
      inferCategory(`${id} ${description} ${relPath}`);
    skills.push({
      id,
      name: meta.display_name?.en || humanize(id),
      description,
      category: config.categories[category] ? category : 'other',
      tags: (meta.tags?.en || front.tags || []).slice(0, 8).map(String),
      version: meta.version || front.version || null,
      author: meta.author || owner,
      collection: src.collection || owner,
      license,
      agents: meta.supported_agents || null,
      repo: src.repo,
      repoUrl: repo.html_url,
      branch: repo.default_branch,
      path: relPath,
      sourceUrl: `${repo.html_url}/tree/${repo.default_branch}/${relPath}`,
      repoStars: repo.stargazers_count,
      updatedAt: repo.pushed_at,
      files: files.map(f => f.rel).sort(),
      size: files.reduce((a, f) => a + f.size, 0),
      hasReferences: files.some(f => /^references\//.test(f.rel)),
      hasScripts: files.some(f => /^scripts\//.test(f.rel)),
      hasEvidence: files.some(f => f.rel === 'evidence.json'),
      findings: scan(dir, files),
      body,
      cacheDir: path.relative(ROOT, dir),
    });
  }
  console.log(`  ${src.repo}: ${skills.length} skills${skipped ? `, ${skipped} skipped (license/description)` : ''}`);
  return { repo, skills };
}

// Per-skill commit history → changelog + accurate "updated" dates.
async function attachHistory(skill) {
  try {
    const commits = await gh(`repos/${skill.repo}/commits?path=${encodeURIComponent(skill.path)}&sha=${skill.branch}&per_page=8`);
    skill.history = commits.map(c => ({
      sha: c.sha.slice(0, 7),
      date: c.commit.author.date,
      message: c.commit.message.split('\n')[0].slice(0, 160),
      url: c.html_url,
    }));
    if (skill.history.length) skill.updatedAt = skill.history[0].date;
    if (skill.history.length && skill.history.length < 8) skill.addedAt = skill.history.at(-1).date;
  } catch { skill.history = []; }
}

async function fetchMcp() {
  const out = new Map();
  let cursor = '';
  for (let page = 0; page < 30; page++) {
    const url = `https://registry.modelcontextprotocol.io/v0/servers?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) break;
    const j = await res.json();
    for (const { server, _meta } of j.servers || []) {
      const off = _meta?.['io.modelcontextprotocol.registry/official'] || {};
      if (off.status && off.status !== 'active') continue;
      const prev = out.get(server.name);
      if (prev && !off.isLatest) continue;
      out.set(server.name, {
        name: server.name,
        title: server.title || server.name.split('/').pop(),
        description: server.description || '',
        version: server.version,
        website: server.websiteUrl || server.repository?.url || null,
        remote: server.remotes?.[0]?.url || null,
        packages: (server.packages || []).map(p => ({ type: p.registryType, id: p.identifier })),
        updatedAt: off.updatedAt || off.publishedAt || null,
      });
    }
    cursor = j.metadata?.nextCursor;
    if (!cursor) break;
  }
  return [...out.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(DATA, { recursive: true });
  console.log(`Indexing ${sources.length} sources${TOKEN ? '' : ' (no GitHub token: rate limits apply)'}…`);
  const results = await pool(sources, 4, s => indexSource(s).catch(e => { console.warn(`  ! ${s.repo}: ${e.message}`); return null; }));

  // De-duplicate slugs across sources: prefer the parent folder (plugin name), then the owner.
  const all = results.filter(Boolean).flatMap(r => r.skills).filter(s => !/(^|\/)example[-_]/.test(s.path));
  const clean = x => x.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  const counts = new Map();
  for (const s of all) counts.set(clean(s.id), (counts.get(clean(s.id)) || 0) + 1);
  const taken = new Set();
  for (const s of all) {
    let slug = clean(s.id);
    if (counts.get(slug) > 1) {
      const parent = s.path.split('/').filter(p => !['skills', 'plugins', 'external_plugins', s.id].includes(p)).pop();
      if (parent) { slug = clean(`${parent}-${s.id}`); s.name = `${humanize(parent)} ${s.name}`; }
    }
    if (taken.has(slug)) slug = clean(`${s.repo.split('/')[0]}-${slug}`);
    for (let n = 2; taken.has(slug); n++) slug = `${slug.replace(/-\d+$/, '')}-${n}`;
    taken.add(slug);
    s.slug = slug;
  }

  if (TOKEN) {
    console.log(`Fetching history for ${all.length} skills…`);
    await pool(all, 8, attachHistory);
  }
  for (const s of all) Object.assign(s, { trust: trustScore(s) });

  let mcp = [];
  try { mcp = await fetchMcp(); console.log(`MCP registry: ${mcp.length} servers`); }
  catch (e) { console.warn(`  ! MCP registry: ${e.message}`); }

  const sourcesOut = results.filter(Boolean).map(r => ({
    repo: r.repo.full_name, url: r.repo.html_url, stars: r.repo.stargazers_count,
    license: r.repo.license?.spdx_id || null, count: r.skills.length, description: r.repo.description,
  }));

  // Never overwrite good data with an empty run (e.g. GitHub outage).
  if (all.length < 20) {
    console.error(`Only ${all.length} skills fetched; refusing to publish a broken index.`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(DATA, 'skills.json'), JSON.stringify({ generatedAt: new Date().toISOString(), sources: sourcesOut, skills: all }, null, 1));
  if (mcp.length) fs.writeFileSync(path.join(DATA, 'mcp.json'), JSON.stringify(mcp));
  console.log(`Done: ${all.length} skills from ${sourcesOut.length} repos.`);
}

main().catch(e => { console.error(e); process.exit(1); });
