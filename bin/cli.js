#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawl } from '../src/crawl.js';
import { extractPage } from '../src/extract.js';
import { siteChecks } from '../src/site-checks.js';
import { extractKeywords, clusterPages } from '../src/keywords.js';
import { fanout } from '../src/fanout.js';
import { detectIssues, attachIssueTags } from '../src/issues.js';
import { buildXlsx } from '../src/report-xlsx.js';
import { buildHtml } from '../src/report-html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJ_ROOT = path.resolve(__dirname, '..');

const program = new Command();
program
  .name('waimao-seo')
  .description('外贸独立站 SEO 体检工具 — 抓站、逐页审计、关键词聚类、Fan-Out 候选 query，输出中文 HTML 报告 + Excel + JSON。')
  .version('1.0.0')
  .argument('<url>', '起点 URL（你的独立站首页）')
  .option('-o, --out <dir>', '输出目录', './report')
  .option('-m, --max-pages <n>', '最多抓多少页', v => parseInt(v, 10), 50)
  .option('-c, --concurrency <n>', '并发请求数', v => parseInt(v, 10), 4)
  .option('--render', '执行 JS 渲染（SPA 必开，需本机 Chrome）')
  .option('--chrome <path>', '指定 Chrome 路径（配合 --render）')
  .option('--cluster-threshold <n>', '聚类相似度阈值（0–1）', v => parseFloat(v), 0.18)
  .option('--subdomains', '允许抓取子域名')
  .option('--ignore-robots', '忽略 robots.txt 的 Disallow 规则（不推荐）')
  .option('--no-sitemap-seed', '不从 sitemap.xml 取种子 URL，纯 BFS 抓取')
  .option('--contact <file>', '联系方式 JSON 路径', './contact.json')
  .parse();

const opts = program.opts();
const startUrl = program.args[0];

function log(msg) { process.stderr.write(msg + '\n'); }

async function loadContact(p) {
  const tryPaths = [path.resolve(p), path.join(PROJ_ROOT, 'contact.json'), path.join(PROJ_ROOT, 'contact.example.json')];
  for (const tp of tryPaths) {
    try { const text = await fs.readFile(tp, 'utf8'); return JSON.parse(text); } catch {}
  }
  return { brand: '（未配置）', tagline: '', wechat: '', email: '', website: '', note: '' };
}

(async () => {
  const t0 = Date.now();
  const contact = await loadContact(opts.contact);

  log(`\n▶ 外贸独立站 SEO 体检  ${startUrl}`);
  log(`  抓取模式：${opts.render ? '渲染（执行 JS）' : '静态（仅原始 HTML）'}   最大页面：${opts.maxPages}   并发：${opts.concurrency}\n`);

  // 1. 抓取（v1.1：默认 sitemap-first + 遵守 robots.txt）
  const crawlResult = await crawl({
    startUrl, maxPages: opts.maxPages, concurrency: opts.concurrency,
    render: opts.render, chromePath: opts.chrome, allowSubdomains: !!opts.subdomains,
    respectRobots: !opts.ignoreRobots,
    sitemapFirst: opts.sitemapSeed !== false,
    onProgress: (n, _total, u) => process.stderr.write(`\r  已抓取 ${n} 页（最新：${u.slice(0, 70)}…）            `),
  });
  const raws = crawlResult.pages;
  const crawlMeta = crawlResult.meta;
  process.stderr.write('\n');
  log(`✓ 共抓取 ${raws.length} 个页面`);
  if (crawlMeta.sitemapSeedCount) log(`  ↳ Sitemap 提供了 ${crawlMeta.sitemapSeedCount} 个种子 URL`);
  if (crawlMeta.robotsActive) log(`  ↳ robots.txt 已遵守（跳过 ${crawlMeta.robotsSkipped} 个 Disallow 路径）`);

  // 2. 提取
  const pages = raws.map(extractPage);

  // 3. 站点级
  log('  站点级检查（robots / sitemap / DNS / 平台识别 / 跟踪 / 响应头）…');
  const site = await siteChecks(startUrl);

  // 4. 关键词（聚类主题用"被引最多页的 H1"，更可读）
  log('  关键词提取与聚类（TF-IDF + 余弦相似度 + 并查集）…');
  const keywords = extractKeywords(pages);
  const clusters = clusterPages(keywords, pages, { threshold: opts.clusterThreshold });

  // 5. Fan-Out（每条 query 标 ✓/✗ 是否被页面正文覆盖）
  log('  生成 Fan-Out 候选 query（含覆盖度判定）…');
  const fan = fanout(keywords.pages, clusters, pages);

  // 6. 问题（聚合 + 结构化）+ 回挂逐页标签
  const issues = detectIssues(pages, site);
  attachIssueTags(pages, issues);

  // 问题统计：distinct = 去重后的问题条数；instances = 按受影响页面加权（KPI"问题数"用这个）
  const issueStats = { distinct: issues.length, instances: 0, bySeverity: { P0: 0, P1: 0, P2: 0, P3: 0 } };
  for (const it of issues) {
    issueStats.instances += it.instanceCount || 1;
    issueStats.bySeverity[it.severity] += it.instanceCount || 1;
  }

  const audit = {
    version: '1.2.0',
    input: { startUrl, render: !!opts.render, clusterThreshold: opts.clusterThreshold, maxPages: opts.maxPages },
    site: { host: site.host, ...site },
    crawlMeta,
    issueStats,
    pages: pages.map(p => { const { html, text, mainText, headers, ...rest } = p; return rest; }),
    issues,
    keywords: { pages: keywords.pages.map(p => { const { _doc, ...r } = p; return r; }) },
    clusters,
    fanout: fan,
  };

  await fs.mkdir(opts.out, { recursive: true });
  const htmlPath = path.join(opts.out, '体检报告.html');
  const xlsxPath = path.join(opts.out, '体检数据.xlsx');
  const jsonPath = path.join(opts.out, 'data.json');

  await fs.writeFile(jsonPath, JSON.stringify(audit, null, 2));
  await buildXlsx({ outPath: xlsxPath, audit, contact });
  await buildHtml({ outPath: htmlPath, audit, contact });

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const sev = issueStats.bySeverity;
  log(`\n✓ 体检完成，用时 ${dt} 秒`);
  log(`  页面：${pages.length}   问题：${issueStats.instances} 处（${issueStats.distinct} 类）· P0=${sev.P0}  P1=${sev.P1}  P2=${sev.P2}  P3=${sev.P3}`);
  const totalFan = fan.reduce((a, f) => a + f.totalQueries, 0);
  const totalUncovered = fan.reduce((a, f) => a + f.totalUncovered, 0);
  log(`  聚类：${clusters.length} 个   Fan-Out：${totalFan} 条候选（${totalUncovered} 条页面未覆盖,可作为内容补强清单）`);
  log(`  建站平台：${site.platform}\n`);
  log(`  📄 HTML 报告：${htmlPath}`);
  log(`  📊 Excel 数据：${xlsxPath}`);
  log(`  🗄️  JSON 原始：${jsonPath}\n`);
  if (contact.brand === '（未配置）' || /\[请填入/.test(contact.brand)) {
    log(`  ⚠️  contact.json 未填写联系方式 — 报告里的联系卡片会显示占位文字，请编辑 ${path.join(PROJ_ROOT, 'contact.json')} 后再分发。\n`);
  }
})().catch(e => { console.error('\n✗ 出错：', e.message); process.exit(1); });
