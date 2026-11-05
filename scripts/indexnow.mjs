// Tells Bing, Yandex, Seznam and Naver (and through Bing, ChatGPT search and Copilot) which pages changed.
// Runs after deploy. FULL=1 submits every page; otherwise only pages modified in the last HOURS (default 7).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const key = cfg.seo?.indexNowKey;
if (!key) { console.log('No seo.indexNowKey set, skipping IndexNow.'); process.exit(0); }

const sitemap = fs.readFileSync(path.join(ROOT, 'dist/sitemap.xml'), 'utf8');
const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)].map(m => ({ url: m[1], mod: Date.parse(m[2]) }));
const since = Date.now() - Number(process.env.HOURS || 7) * 3600e3;
const base = `${cfg.siteUrl.replace(/\/$/, '')}${cfg.basePath.replace(/\/$/, '')}`;
const always = ['/', '/skills/', '/whats-new/'].map(p => `${base}${p}`);
const urls = [...new Set(process.env.FULL === '1' ? pages.map(p => p.url) : [...always, ...pages.filter(p => p.mod >= since).map(p => p.url)])].slice(0, 10000);

const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(cfg.siteUrl).host, key, keyLocation: `${base}/${key}.txt`, urlList: urls }),
});
// 200/202 = accepted. 403/422 usually mean the key file isn't live yet; never fail the deploy over it.
console.log(`IndexNow: submitted ${urls.length} URLs → HTTP ${res.status} ${await res.text().catch(() => '')}`.trim());
