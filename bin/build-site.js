#!/usr/bin/env node
// 生成可部署的静态站：site/index.html（落地页）+ 可选 site/report-sample.html（示例报告）。
// 用法：node bin/build-site.js [--contact contact.json] [--sample <data.json>] [--repo <url>] [--out site]
import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLanding } from '../src/landing.js';
import { buildHtml } from '../src/report-html.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const program = new Command();
program
  .name('waimao-seo-build-site')
  .description('生成可部署的静态引流站（落地页 + 示例报告）')
  .option('-o, --out <dir>', '输出目录', './site')
  .option('--contact <file>', '联系方式 JSON', './contact.json')
  .option('--sample <file>', '用某次体检的 data.json 生成示例报告')
  .option('--repo <url>', '开源仓库链接', '#')
  .parse();

const opts = program.opts();

async function loadContact(p) {
  for (const tp of [path.resolve(p), path.join(ROOT, 'contact.json'), path.join(ROOT, 'contact.example.json')]) {
    try { return JSON.parse(await fs.readFile(tp, 'utf8')); } catch {}
  }
  return { brand: 'SEOcheck · 体检' };
}

(async () => {
  const contact = await loadContact(opts.contact);
  await fs.mkdir(opts.out, { recursive: true });

  let sampleHref = 'report-sample.html';
  let hasSample = false;
  if (opts.sample) {
    try {
      const audit = JSON.parse(await fs.readFile(path.resolve(opts.sample), 'utf8'));
      await buildHtml({ outPath: path.join(opts.out, 'report-sample.html'), audit, contact });
      hasSample = true;
    } catch (e) { console.error('  ⚠️  示例报告生成失败：', e.message); }
  }
  if (!hasSample) sampleHref = '#start'; // 没有示例时，"报告示例"先指向开始区

  await buildLanding({
    outPath: path.join(opts.out, 'index.html'),
    contact, sampleReportHref: sampleHref, repoUrl: opts.repo,
  });

  console.log(`\n✓ 静态站已生成到 ${opts.out}/`);
  console.log(`  • index.html        落地页`);
  if (hasSample) console.log(`  • report-sample.html 示例报告`);
  console.log(`\n  部署：把 ${opts.out}/ 目录拖到 Netlify / Vercel / GitHub Pages 即可。`);
  if (!opts.sample) console.log(`  生成示例报告：先 node bin/cli.js <某个站> --render，再 --sample <输出>/data.json 重跑本命令。\n`);
})().catch(e => { console.error('✗ 出错：', e.message); process.exit(1); });
