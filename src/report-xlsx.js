// 生成中文 Excel 报告。
import ExcelJS from 'exceljs';

const FONT = { name: 'Arial', size: 10 };
const HDR_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
const HDR_FONT = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const SEV_FILL = {
  P0: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } },
  P1: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } },
  P2: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } },
  P3: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } },
};
const WRAP = { wrapText: true, vertical: 'top' };
const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
const BORDER = { top: thin, bottom: thin, left: thin, right: thin };

function header(ws, headers, widths) {
  ws.addRow(headers);
  const r = ws.getRow(1);
  r.height = 28;
  r.eachCell((c, i) => { c.fill = HDR_FILL; c.font = HDR_FONT; c.alignment = { wrapText: true, vertical: 'middle' }; c.border = BORDER; ws.getColumn(i).width = widths[i - 1] || 18; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}
function styleRows(ws, fromRow = 2) {
  for (let r = fromRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    row.eachCell(c => { c.font = FONT; c.alignment = WRAP; c.border = BORDER; });
  }
}

export async function buildXlsx({ outPath, audit, contact }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'waimao-seo-audit';
  wb.created = new Date();

  // ① 总览
  let ws = wb.addWorksheet('① 总览');
  ws.addRow([`外贸独立站 SEO 体检 — ${audit.site.host}`]);
  ws.getRow(1).font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1F4E78' } };
  ws.addRow([]);
  ws.addRow(['起点 URL', audit.input.startUrl]);
  ws.addRow(['抓取模式', audit.input.render ? '渲染模式（执行 JS）' : '静态模式（仅原始 HTML）']);
  ws.addRow(['抓取页面数', audit.pages.length]);
  ws.addRow(['发现问题数', audit.issues.length]);
  ws.addRow(['建站平台', audit.site.platform]);
  const cm = audit.crawlMeta || {};
  ws.addRow(['Sitemap 种子', cm.sitemapSeedCount ? `从 sitemap 取了 ${cm.sitemapSeedCount} 个 URL 作为种子` : '未使用 sitemap 种子（BFS 模式）']);
  ws.addRow(['robots.txt 遵守', cm.robotsActive ? `已遵守，跳过 ${cm.robotsSkipped || 0} 个 Disallow 路径` : '未生效或被显式忽略']);
  ws.addRow(['生成时间', new Date().toLocaleString('zh-CN')]);
  ws.addRow([]);
  ws.addRow(['问题严重程度分布']);
  ws.getRow(ws.rowCount).font = { bold: true };
  const sevCounts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const i of audit.issues) sevCounts[i.severity] = (sevCounts[i.severity] || 0) + 1;
  for (const [sev, n] of Object.entries(sevCounts)) {
    const row = ws.addRow([sev, n, sev === 'P0' ? '致命 / 阻塞收录' : sev === 'P1' ? '重要 / 严重影响排名' : sev === 'P2' ? '一般质量问题' : '优化项']);
    row.getCell(1).fill = SEV_FILL[sev]; row.getCell(1).font = { bold: true };
  }
  ws.addRow([]);
  ws.addRow(['Excel 包含以下页签：']);
  ws.getRow(ws.rowCount).font = { bold: true };
  for (const t of ['② 逐页详情', '③ Title+Meta 体检', '④ 内链清单', '⑤ 关键词聚类', '⑥ 各页关键词（TF-IDF）', '⑦ Fan-Out 候选 query', '⑧ 站点级体检', '⑨ 问题清单 P0-P3', '⑩ 联系方式']) ws.addRow(['', t]);
  ws.getColumn(1).width = 24; ws.getColumn(2).width = 32; ws.getColumn(3).width = 50;

  // ② 逐页详情
  const PT_ZH = { home: '首页', product: '产品', collection: '类目', blog: '博客', legal: '法务', other: '其他' };
  ws = wb.addWorksheet('② 逐页详情');
  header(ws, ['#', 'URL', '类型', '状态码', 'P0+P1', '问题标签', 'Title', 'Title 字数', 'Meta description', 'Meta 字数', 'H1', '词数', '内链数', '外链数', '缺 alt', 'canonical', 'lang'], [5, 46, 8, 7, 7, 30, 32, 8, 42, 8, 30, 7, 8, 8, 8, 10, 7]);
  audit.pages.forEach((p, i) => {
    const ic = p.issueCounts || { p0: 0, p1: 0 };
    const tags = (p.issueTags || []).map(t => t.label).join('、');
    ws.addRow([i + 1, p.url, PT_ZH[p.pageType] || p.pageType, p.status, ic.p0 + ic.p1, tags, p.title, p.titleLength, p.metaDescription, p.metaDescriptionLength, (p.h1 || []).join(' | '), p.wordCount, p.internalLinkCount, p.externalLinkCount, p.imgNoAlt, p.canonical || '', p.lang || '']);
  });
  styleRows(ws);

  // ③ Title+Meta
  ws = wb.addWorksheet('③ Title+Meta 体检');
  header(ws, ['#', 'URL', '当前 Title', 'Title 问题', '当前 Meta description', 'Meta 问题'], [5, 45, 35, 28, 50, 28]);
  const tCount = new Map(), mCount = new Map();
  audit.pages.forEach(p => { const t = (p.title || '').trim(); if (t) tCount.set(t, (tCount.get(t) || 0) + 1); const m = (p.metaDescription || '').trim(); if (m) mCount.set(m, (mCount.get(m) || 0) + 1); });
  audit.pages.forEach((p, i) => {
    const tIss = []; if (!p.title) tIss.push('缺失'); else { if (p.titleLength > 65) tIss.push('超 65 字符'); if ((tCount.get(p.title) || 0) > 1) tIss.push(`与其他 ${tCount.get(p.title) - 1} 个页面重复`); }
    const mIss = []; if (!p.metaDescription) mIss.push('缺失'); else { if (p.metaDescriptionLength > 160) mIss.push('超 160 字符'); if (p.metaDescDuplicateTags > 1) mIss.push(`${p.metaDescDuplicateTags} 个重复标签`); if ((mCount.get(p.metaDescription) || 0) > 1) mIss.push(`与其他 ${mCount.get(p.metaDescription) - 1} 个页面重复`); }
    ws.addRow([i + 1, p.url, p.title, tIss.join('；'), p.metaDescription, mIss.join('；')]);
  });
  styleRows(ws);

  // ④ 内链清单
  ws = wb.addWorksheet('④ 内链清单');
  header(ws, ['#', '来源页', '目标路径', '锚文本', 'rel'], [5, 45, 45, 35, 12]);
  let n = 1;
  for (const p of audit.pages) for (const l of p.internalLinks) ws.addRow([n++, p.url, l.href, l.anchor, l.rel || '']);
  styleRows(ws);

  // ⑤ 关键词聚类
  ws = wb.addWorksheet('⑤ 关键词聚类');
  header(ws, ['聚类 #', '页面数', '内耗数', '主题', '代表页', '高权重关键词', '高权重短语', '成员页面'], [8, 7, 7, 22, 30, 42, 38, 55]);
  for (const c of audit.clusters) ws.addRow([c.id, c.size, c.cannibalCount || 0, c.primaryTopic, c.representativePage || '', c.topKeywords.join(', '), c.topPhrases.join(', '), c.pages.join('\n')]);
  styleRows(ws);

  // ⑥ 各页关键词
  ws = wb.addWorksheet('⑥ 各页关键词');
  header(ws, ['#', 'URL', '高权重单词（TF-IDF）', '高权重短语（TF-IDF）'], [5, 45, 55, 55]);
  audit.keywords.pages.forEach((p, i) => ws.addRow([i + 1, p.url, p.unigrams.map(([t, w]) => `${t} (${w.toFixed(2)})`).join(', '), p.bigrams.map(([t, w]) => `${t} (${w.toFixed(2)})`).join(', ')]));
  styleRows(ws);

  // ⑦ Fan-Out（每条 query 前面打 ✓/✗ 表示是否已被页面正文覆盖）
  ws = wb.addWorksheet('⑦ Fan-Out 候选 query');
  header(ws, ['#', 'URL', '主关键词', '所属聚类主题', '整体覆盖%', '未覆盖数', '信息类', '商业类', '对比类', '导航类', '问答类', '长尾类'], [5, 38, 22, 20, 9, 9, 38, 38, 38, 32, 32, 38]);
  const fmt = qs => qs.map(({ q, covered }) => `${covered ? '✓' : '✗'} ${q}`).join('\n');
  audit.fanout.forEach((f, i) => ws.addRow([
    i + 1, f.url, f.primaryKeyword, f.clusterTopic || '', f.coveragePct + '%', f.totalUncovered,
    fmt(f.fanout.informational),
    fmt(f.fanout.commercial),
    fmt(f.fanout.comparative),
    fmt(f.fanout.navigational),
    fmt(f.fanout.question),
    fmt(f.fanout.longTail),
  ]));
  styleRows(ws);

  // ⑧ 站点级
  ws = wb.addWorksheet('⑧ 站点级体检');
  header(ws, ['检查项', '结果', '详情'], [30, 12, 80]);
  const s = audit.site;
  ws.addRow([`主域（${s.apex}）解析`, s.dns.apex.A_error ? '❌' : '✅', s.dns.apex.A_error || (s.dns.apex.A || []).join(', ')]);
  ws.addRow(['www 解析', s.dns.www.A_error ? '❌' : '✅', s.dns.www.A_error || (s.dns.www.A || []).join(', ')]);
  ws.addRow(['robots.txt', s.robots.hasFile ? '✅' : '❌', `HTTP ${s.robots.status}`]);
  ws.addRow(['robots 声明 Sitemap', s.robots.declaresSitemap ? '✅' : '❌', s.robots.declaresSitemap ? '' : '请添加 `Sitemap: <URL>`']);
  for (const sm of s.sitemaps) ws.addRow([`Sitemap: ${sm.url}`, sm.valid ? `✅ ${sm.urlCount} 条` : '❌', sm.valid ? (sm.isIndex ? '索引型' : '') : `HTTP ${sm.status}，非有效 XML`]);
  ws.addRow(['建站平台', '🔍', s.platform]);
  ws.addRow(['Google Analytics / GTM', (s.analytics.googleAnalytics || s.analytics.googleTagManager) ? '✅' : '❌', '']);
  ws.addRow(['Search Console 验证', s.analytics.googleSearchConsole ? '✅' : '❌', '']);
  ws.addRow(['Meta Pixel', (s.analytics.facebookPixel || s.analytics.metaPixel) ? '✅' : '❌', '']);
  for (const [k, v] of Object.entries(s.securityHeaders)) ws.addRow([`响应头：${k}`, v ? '✅' : '⚠️', v || '缺失']);
  styleRows(ws);

  // ⑨ 问题清单
  ws = wb.addWorksheet('⑨ 问题清单 P0-P3');
  header(ws, ['ID', '等级', '编码', '范围', '问题', '修复建议', '影响页数', '受影响页面 / 证据'], [8, 9, 22, 8, 34, 46, 9, 50]);
  audit.issues.forEach((it) => {
    const affected = it.scope === 'page'
      ? it.affectedUrls.map(u => { try { return new URL(u).pathname; } catch { return u; } }).join('\n')
      : (it.evidence || '全站');
    const row = ws.addRow([it.id, it.severity, it.code, it.scope === 'site' ? '站点' : '逐页', it.title, it.detail, it.affectedCount, affected]);
    row.getCell(2).fill = SEV_FILL[it.severity] || {};
    row.getCell(2).font = { name: 'Arial', size: 10, bold: true };
  });
  styleRows(ws);

  // ⑩ 联系方式
  ws = wb.addWorksheet('⑩ 联系方式');
  ws.addRow(['本报告由开源工具 waimao-seo-audit 生成。基于报告内容的复杂改造，可联系：']);
  ws.getRow(1).font = { name: 'Arial', size: 11 };
  ws.addRow([]);
  ws.addRow(['品牌 / 姓名', contact.brand]);
  if (contact.tagline) ws.addRow(['标签', contact.tagline]);
  if (contact.wechat) ws.addRow(['微信', contact.wechat]);
  if (contact.email) ws.addRow(['邮箱', contact.email]);
  if (contact.website) ws.addRow(['网站', contact.website]);
  ws.addRow([]);
  if (contact.note) ws.addRow(['说明', contact.note]);
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    row.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
    row.eachCell(c => { c.alignment = WRAP; });
  }
  ws.getColumn(1).width = 18; ws.getColumn(2).width = 80;

  await wb.xlsx.writeFile(outPath);
  return outPath;
}
