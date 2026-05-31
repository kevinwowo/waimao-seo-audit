---
name: seo-audit
description: Run a full-site SEO audit on a cross-border DTC / 外贸独立站 (Shopify, WooCommerce, Wix, custom). Crawls the whole site (sitemap-first, robots-respecting, optional JS render), detects P0–P3 issues, builds TF-IDF keyword clusters, generates Fan-Out candidate queries with ✓/✗ coverage, and outputs a brandable HTML report + Excel. Use when the user asks to "audit"/"体检"/"诊断" a store's SEO, check a site's SEO health, find why a store has no traffic, or generate a client-ready SEO report. Triggers on a store URL plus words like SEO audit, 外贸 SEO, 独立站 SEO, Shopify SEO, sitemap/title/meta/收录 check.
---

# 外贸独立站 SEO 体检 (waimao-seo-audit)

This skill runs the bundled open-source crawler+auditor and presents the findings. It is tuned for cross-border DTC stores (Shopify / WooCommerce / Wix / custom), goes beyond single-page tools like Lighthouse, and produces a **branded, shareable report** that doubles as a lead-gen hook for an SEO consultant.

## When to use

- User gives a store URL and wants an SEO audit / 体检 / 诊断 / health check.
- User wants a client-ready SEO report (HTML + Excel) for a cross-border store.
- User asks why a store isn't getting search traffic, or wants keyword-cannibalization / content-gap analysis.

Prefer this over a generic SEO checklist when there is a real URL to crawl.

## How to run

The tool lives in this plugin/repo. Use `${CLAUDE_PLUGIN_ROOT}` as the tool root (or the repo root if running from a clone).

1. **Install deps once** (only if `node_modules/` is missing):
   ```bash
   cd "${CLAUDE_PLUGIN_ROOT}" && npm install
   ```

2. **Run the audit.** Default to `--render` for modern stores (most are JS-heavy); raise `--max-pages` for bigger catalogs:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" <URL> --render --max-pages 30 --out ./seo-report
   ```
   Drop `--render` only if the user says it's a static/server-rendered site or speed matters.

3. **Read the result** at `./seo-report/data.json` (full structured audit) and tell the user the HTML report is at `./seo-report/体检报告.html` (open in a browser) and the Excel at `./seo-report/体检数据.xlsx`.

## What to present

Parse `data.json` and summarize for the user:

- **Headline**: platform (`site.platform`), pages crawled, `issueStats` (instances / distinct, by severity).
- **P0 / P1 first** (from `issues`, already sorted): for each, `title` + `affectedCount` + the one-line `detail` (fix). These are the talking points.
- **Keyword clusters** with `cannibalCount > 0` (pages fighting for the same term).
- **Fan-Out coverage**: `fanout[].totalUncovered` — the uncovered queries are the content-gap to-do list.
- Per-page data carries `pageType` (home/product/collection/blog/legal/other), `issueTags`, `issueCounts` — use for "which product pages are worst".

Keep it concrete and prioritized (what to fix first). Point the user to the HTML report for the full branded version.

## Branding (the hook)

The report's footer renders a contact card + WeChat QR driven by `contact.json` (copy from `contact.example.json`). For a consultant, this turns every free audit into a lead. If the user wants to set it up, have them fill `contact.json` and drop their WeChat QR as `qr-wechat.png` in the repo root. Personal WeChat QRs expire (~7 days) — for a long-lived landing page use a 企业微信/公众号 permanent QR.

## Build a lead-gen landing site (optional)

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/build-site.js" --sample ./seo-report/data.json --repo <repo-url>
```
Produces a deployable `site/` (landing page + sample report) for Netlify / Vercel / GitHub Pages.

## Notes

- Open source (MIT). Runs locally; target-site data does not leave the machine.
- Respects robots.txt by default (`--ignore-robots` to override); seeds from sitemap.xml when present.
- Requires Node ≥ 18 and, for `--render`, a local Chrome (`--chrome <path>` or `CHROME_PATH`).
