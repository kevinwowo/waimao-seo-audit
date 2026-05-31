---
description: 对一个独立站跑整站 SEO 体检（外贸/Shopify 等），输出 P0-P3 问题、关键词聚类、Fan-Out 与白标报告
argument-hint: <store-url> [--max-pages N] [--no-render]
---

Run a full-site SEO audit on the store URL the user passed: `$ARGUMENTS`

Follow the `seo-audit` skill in this plugin:

1. If `node_modules/` is missing in the plugin root, run `npm install` there first.
2. Run: `node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" $ARGUMENTS --render --max-pages 30 --out ./seo-report`
   - If the user passed `--no-render`, drop `--render`. If they passed `--max-pages`, respect theirs.
3. Read `./seo-report/data.json` and present a prioritized summary: platform + issue stats, then P0/P1 issues (title · affectedCount · fix), keyword clusters with cannibalization, and Fan-Out uncovered-query count.
4. Tell the user where the branded HTML report (`体检报告.html`) and Excel (`体检数据.xlsx`) are.

Be concrete and lead with what to fix first.
