# SkillShelf

An auto-updating, ad-supported directory of open-source AI agent skills (SKILL.md) and MCP servers.
US-first: IRS tax forms, US legal and court filings, finance & investing, marketing, HR and product skills, plus general agent skills from Anthropic, Superpowers, Hugging Face and more.

## How it works

```
sources.json ──► scripts/fetch.mjs ──► data/skills.json, data/mcp.json ──► scripts/build.mjs ──► dist/ (static site)
                 (GitHub tarballs,       (license filter, security scan,      (357 pages, ZIPs,
                  commit history,         trust score, changelog)               sitemap, RSS, ads)
                  MCP registry)
```

GitHub Actions (`.github/workflows/update.yml`) runs fetch + build **every 6 hours** and deploys to GitHub Pages. No server, no database, no cost.

## Run locally

```bash
npm install
npm run dev        # fetch + build + serve at http://localhost:4321
```

## Go live (one-time)

1. Create a GitHub repo and push this folder to `main`.
2. Repo → Settings → Pages → Source: **GitHub Actions**.
3. Edit `site.config.json`: `siteUrl`, `repo`, `contactEmail` (and `basePath: "/repo-name"` if you use `user.github.io/repo-name` without a custom domain).
4. Optional custom domain: set `siteUrl` to it. The build writes a `CNAME` file automatically.

## Monetization

- **AdSense:** apply at adsense.google.com with your live domain. Once approved, set `ads.adsenseClient` (`ca-pub-…`) and the 5 slot IDs in `site.config.json`. The build then switches the placeholder boxes to real ads and writes `ads.txt`.
  Ad slots: header leaderboard, in-feed (every 9 cards), in-article, sticky sidebar on skill pages, footer.
- **EU/UK consent:** turn on Google's CMP in AdSense → Privacy & messaging (no code needed).
- **Direct sponsorships:** the `/advertise/` page sells featured placements, category sponsorships and newsletter slots.
- **Newsletter:** paste a Buttondown/Beehiiv form action into `newsletter.formAction`.
- **Analytics:** `analytics.plausibleDomain` or `analytics.gaMeasurementId`.

## Adding sources

Add a repo to `sources.json`. Only skills with an open license (MIT, Apache-2.0, BSD, ISC, MPL…) are published. Proprietary or unlicensed skills are skipped automatically.

## Before launch

- Review `/privacy/` and `/terms/` (templates) for your jurisdiction.
- The install folder paths per agent live in `site.config.json → agents`. Update them if a tool changes its skills directory.

## "Try this skill" chat

Every skill page has a **Try this skill** box.

- **Without setup** it opens Claude.ai in a new tab with the skill's instructions linked (no cost to you).
- **With the chat worker** it becomes a live, streaming chat right on the page. The worker (`worker/`) runs on Cloudflare Workers (free tier). It loads the skill from this site, never from the browser, so it can't be used as an open proxy. It's rate-limited per visitor (8 messages/minute, see `wrangler.toml`) and caps replies at `MAX_OUTPUT_TOKENS`.

Deploy it once:

```bash
cd worker && npm install
npx wrangler login                          # free Cloudflare account
npx wrangler secret put ANTHROPIC_API_KEY   # key from console.anthropic.com
npx wrangler deploy                         # prints https://skillshelf-chat.<you>.workers.dev
```

Then put that URL in `site.config.json → chat.endpoint` and push. Set a monthly spend limit in the Anthropic Console. `MODEL` in `wrangler.toml` defaults to `claude-opus-5-5`. Switching it to `claude-haiku-5-5` cuts the cost per message roughly 40×.
