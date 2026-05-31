// 生成 v2 编辑风格的自包含中文报告：顾问品牌头 + KPI + 五大分区 + 底部二维码大卡。
// 设计还原自「SEOcheck · 体检」report/share 视觉系统（report-theme.css）。
import fs from 'node:fs/promises';
import { qrInner } from './qr.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => (n ?? 0).toLocaleString('en-US');

const PAGETYPE_ZH = { home: '首页', product: '产品', collection: '类目', blog: '博客', legal: '法务', other: '其他' };
const BUCKET_ZH = { informational: '信息', commercial: '商业', comparative: '对比', navigational: '导航', question: '问答', longTail: '长尾' };
const SEV_BADGE = { P0: 'badge--p0', P1: 'badge--p1', P2: 'badge--p2', P3: 'badge--p3' };

function siteCards(s) {
  const cards = [];
  const card = (status, title, detail, foot) => {
    const cls = status === 'ok' ? 'site-card--ok' : status === 'warn' ? 'site-card--warn' : 'site-card--fail';
    const stz = status === 'ok' ? 'is-ok' : status === 'warn' ? 'is-warn' : 'is-fail';
    const stt = status === 'ok' ? '正常' : status === 'warn' ? '注意' : '异常';
    cards.push(`<div class="site-card ${cls}"><div class="site-card__h"><h4>${esc(title)}</h4><span class="site-card__status ${stz}">${stt}</span></div><p class="site-card__detail">${detail}</p>${foot ? `<p class="site-card__foot">— ${esc(foot)}</p>` : ''}</div>`);
  };
  const valid = s.sitemaps.filter(x => x.valid);
  card(s.robots.hasFile ? (s.robots.declaresSitemap ? 'ok' : 'warn') : 'fail', 'robots.txt',
    s.robots.hasFile ? `存在；${s.robots.declaresSitemap ? '已声明 Sitemap' : '<b>未声明 Sitemap</b>'}` : `访问 <b>/robots.txt</b> 失败（HTTP ${s.robots.status}）`,
    s.robots.declaresSitemap ? '' : '建议在 robots.txt 加 Sitemap: 行。');
  card(valid.length ? 'ok' : 'fail', 'sitemap.xml',
    valid.length ? `发现 <b>${valid.map(x => x.urlCount).reduce((a, b) => a + b, 0)}</b> 条 URL` : '未在常规位置发现有效 sitemap',
    valid.length ? '' : '建议自动生成并提交至 GSC。');
  card(s.dns.apex.A_error ? 'fail' : 'ok', `DNS · ${s.apex}`,
    s.dns.apex.A_error ? `apex 域<b>无法解析</b>（${esc(s.dns.apex.A_error)}），仅 www 可访问` : `解析正常：<b>${esc((s.dns.apex.A || []).join(', '))}</b>`,
    s.dns.apex.A_error ? '裸域分享链接约 30% 流量会丢失。' : '');
  card(s.platform === '未识别' ? 'warn' : 'ok', '建站平台',
    `识别为 <b>${esc(s.platform)}</b>`, '');
  const gaOk = s.analytics.googleAnalytics || s.analytics.googleTagManager;
  card(gaOk ? 'ok' : 'fail', 'Google Analytics / GTM',
    gaOk ? '已接入流量分析' : '<b>未检测到</b> GA4 / GTM', gaOk ? '' : '没有它无法衡量 SEO 流量与转化。');
  card(s.analytics.googleSearchConsole ? 'ok' : 'warn', 'Search Console 验证',
    s.analytics.googleSearchConsole ? '已发现验证标签' : '<b>未检测到</b> GSC 验证标签', '影响提交 sitemap 与查看收录数据。');
  card((s.analytics.facebookPixel || s.analytics.metaPixel) ? 'ok' : 'warn', 'Meta Pixel',
    (s.analytics.facebookPixel || s.analytics.metaPixel) ? '已接入 Meta Pixel' : '未检测到 Meta Pixel', '跨境投放标配。');
  card(s.securityHeaders['strict-transport-security'] ? 'ok' : 'warn', 'HSTS',
    s.securityHeaders['strict-transport-security'] ? '已启用强制 HTTPS' : '未配置 Strict-Transport-Security', '建议 max-age=31536000。');
  card(s.securityHeaders['content-security-policy'] ? 'ok' : 'warn', 'Content-Security-Policy',
    s.securityHeaders['content-security-policy'] ? '已配置 CSP' : '未配置 CSP', '');
  return cards.join('\n');
}

export async function buildHtml({ outPath, audit, contact }) {
  const s = audit.site;
  const host = s.host;
  const PRIMARY = contact.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(contact.primaryColor) ? contact.primaryColor : '#1F4E78';
  const ACCENT = contact.accentColor && /^#[0-9A-Fa-f]{6}$/.test(contact.accentColor) ? contact.accentColor : '#D9550B';
  const css = await fs.readFile(new URL('./report-theme.css', import.meta.url), 'utf8');
  const qr = await qrInner(contact, PRIMARY);

  const st = audit.issueStats || { distinct: audit.issues.length, instances: audit.issues.length, bySeverity: {} };
  const distinctBySev = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const it of audit.issues) distinctBySev[it.severity]++;
  const fanTotal = audit.fanout.reduce((a, f) => a + f.totalQueries, 0);
  const fanUncovered = audit.fanout.reduce((a, f) => a + f.totalUncovered, 0);
  const coveragePct = fanTotal ? Math.round(100 * (fanTotal - fanUncovered) / fanTotal) : 0;
  const dateStr = new Date().toLocaleDateString('zh-CN');
  const brandInitial = (contact.brand || 'S').trim().charAt(0);
  const logoHtml = contact.logoUrl
    ? `<img src="${esc(contact.logoUrl)}" alt="${esc(contact.brand)}" style="width:44px;height:44px;border-radius:9px;object-fit:cover;" />`
    : `<div class="adv-logo">${esc(brandInitial)}</div>`;

  // —— 01 问题清单 ——
  const issueRows = audit.issues.map((it, i) => {
    const pct = Math.min(100, Math.round(100 * it.affectedCount / (audit.pages.length || 1)));
    const evid = it.evidence ? `<div class="issue-detail__fix" style="margin-top:10px;"><h5>证据</h5><pre style="margin:0;white-space:pre-wrap;font-family:var(--f-mono);font-size:11px;color:var(--muted);">${esc(it.evidence)}</pre></div>` : '';
    const affected = it.scope === 'page' && it.affectedUrls.length
      ? `<div class="issue-detail__fix" style="margin-top:10px;"><h5>受影响页面 · ${it.affectedCount}</h5><div class="aff-list">${it.affectedUrls.slice(0, 12).map(u => { try { return `<code>${esc(new URL(u).pathname)}</code>`; } catch { return `<code>${esc(u)}</code>`; } }).join('')}${it.affectedUrls.length > 12 ? `<span class="muted">…等 ${it.affectedUrls.length} 个</span>` : ''}</div></div>`
      : '';
    return `<li class="issue-item${i === 0 ? ' is-open' : ''}" data-sev="${it.severity}">
      <div class="issue-row">
        <span class="issue-row__sev"><span class="badge ${SEV_BADGE[it.severity]}">${it.severity}</span></span>
        <span class="issue-row__id">${esc(it.id)}</span>
        <span class="issue-row__title"><b>${esc(it.title)}</b></span>
        <span class="issue-row__impact">影响 <b>${it.affectedCount}</b> / ${audit.pages.length} 页<span class="bar"><i style="width:${pct}%"></i></span></span>
        <span class="issue-row__chev">›</span>
      </div>
      <div class="issue-detail"><div class="issue-detail__inner"><div class="issue-detail__body" style="grid-template-columns:1fr;padding-left:116px;">
        <div class="issue-detail__fix"><h5>修复建议</h5><p>${esc(it.detail || '')}</p></div>
        ${affected}${evid}
      </div></div></div>
    </li>`;
  }).join('\n');

  // —— 03 逐页详情 ——
  const ptCounts = {};
  for (const p of audit.pages) ptCounts[p.pageType] = (ptCounts[p.pageType] || 0) + 1;
  const ptChips = ['全部', ...Object.keys(ptCounts)].map((k, idx) =>
    `<span class="tag-filter${idx === 0 ? ' is-active' : ''}">${idx === 0 ? '全部' : PAGETYPE_ZH[k] || k} <small>${idx === 0 ? audit.pages.length : ptCounts[k]}</small></span>`).join('');
  const pageRows = audit.pages.slice(0, 14).map(p => {
    const tags = (p.issueTags || []).slice(0, 4).map(t => `<span class="badge ${SEV_BADGE[t.severity]}">${esc(t.label)}</span>`).join('');
    const ic = p.issueCounts || { p0: 0, p1: 0, p2: 0, p3: 0 };
    const path = (() => { try { return new URL(p.url).pathname; } catch { return p.url; } })();
    const seg = path.split('/').filter(Boolean);
    const lead = seg.length ? '/' + seg.slice(0, -1).join('/') + (seg.length > 1 ? '/' : '') : '/';
    const last = seg.length ? seg[seg.length - 1] : '';
    return `<tr>
      <td><div class="pg"><span class="pg__url">${esc(seg.length > 1 ? lead : '/')}<b>${esc(last)}</b></span><span class="pg__title">${esc((p.title || '（无 title）').slice(0, 48))}</span></div></td>
      <td><div class="tags">${tags || '<span class="badge badge--ok">无明显问题</span>'}</div></td>
      <td class="num">${ic.p0 + ic.p1}</td>
      <td class="num">${p.internalLinkCount}</td>
      <td class="num">${num(p.wordCount)}</td>
      <td class="num">${p.imgNoAlt ? `<b>${p.imgNoAlt}</b>` : '0'}</td>
      <td><span class="badge badge--info">${PAGETYPE_ZH[p.pageType] || p.pageType}</span></td>
    </tr>`;
  }).join('\n');

  // —— 04 关键词聚类 ——
  const clusterCards = audit.clusters.slice(0, 8).map(c => {
    const cloud = c.topKeywords.map((t, i) => `<span class="kw${i < 2 ? ' kw--lead' : ''}">${esc(t)}</span>`).join('');
    const phrases = c.topPhrases.length ? `<div class="cluster__phrases">高频短语 — ${c.topPhrases.map(t => `<b>${esc(t)}</b>`).join(' · ')}</div>` : '';
    const rep = c.representativePage ? (() => { try { return new URL(c.representativePage).pathname; } catch { return c.representativePage; } })() : '';
    return `<article class="cluster">
      <div class="cluster__h"><div class="cluster__num">${String(c.id).padStart(2, '0')}.</div><div class="cluster__pages"><b>${c.size}</b> 个页面${c.cannibalCount > 0 ? ` · <span style="color:var(--ember)">${c.cannibalCount} 个内耗</span>` : ''}</div></div>
      <h3 class="cluster__topic">主题：<em>${esc(c.primaryTopic)}</em></h3>
      <div class="cluster__cloud">${cloud}</div>
      ${phrases}
      <div class="cluster__foot"><span class="cluster__rep">${rep ? `代表页 · ${esc(rep)}` : ''}</span></div>
    </article>`;
  }).join('\n');

  // —— 05 Fan-Out ——
  const bucketChips = ['全部', 'informational', 'commercial', 'comparative', 'navigational', 'question', 'longTail'].map((b, i) => {
    const cnt = b === '全部' ? fanTotal : audit.fanout.reduce((a, f) => a + (f.fanout[b] ? f.fanout[b].length : 0), 0);
    return `<button class="filter-chip${i === 0 ? ' is-active' : ''}">${b === '全部' ? '全部' : BUCKET_ZH[b]} <span class="filter-chip__count">${num(cnt)}</span></button>`;
  }).join('');
  const fanGroups = audit.fanout.slice(0, 10).map((f, gi) => {
    const covClass = f.coveragePct >= 60 ? '' : f.coveragePct >= 30 ? 'mid' : 'low';
    const rows = Object.entries(f.fanout).flatMap(([bucket, qs]) =>
      qs.map(({ q, covered }) => `<li class="fan-row">
        <span class="fan-row__cov ${covered ? 'is-yes' : 'is-no'}">${covered ? '✓' : '✗'}</span>
        <span class="fan-row__q">${esc(q)}</span>
        <span class="fan-row__bucket">${BUCKET_ZH[bucket] || bucket}</span>
        <span class="fan-row__page${covered ? '' : ' is-miss'}">${covered ? '已覆盖' : '— 未覆盖'}</span>
      </li>`)).join('');
    return `<div class="fan-group${gi === 0 ? ' is-open' : ''}">
      <div class="fan-group__h">
        <div class="fan-group__num">${String(gi + 1).padStart(2, '0')}.</div>
        <h3 class="fan-group__title">${esc(f.primaryKeyword)} <small>· ${f.totalQueries} 条候选 · 未覆盖 ${f.totalUncovered}</small></h3>
        <div class="fan-group__cov"><span>覆盖 <b style="color:var(--ink)">${f.totalCovered}/${f.totalQueries}</b></span><div class="cov-bar"><i class="${covClass}" style="width:${f.coveragePct}%"></i></div></div>
        <span class="fan-group__chev">›</span>
      </div>
      <ul class="fan-list">${rows}</ul>
    </div>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(host)} · SEO 体检报告</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;500;600;700;900&family=Noto+Sans+SC:wght@300;400;500;600&family=Inter:wght@300;400;500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
${css}
:root{ --ink-2:${PRIMARY}; --ember:${ACCENT}; }
.report-shell{ max-width:1240px; margin:0 auto; padding:0 32px; }
.adv-topbar{ border-bottom:1px solid var(--rule); }
.adv-topbar__inner{ max-width:1240px;margin:0 auto;padding:20px 32px;display:flex;justify-content:space-between;align-items:center; }
.adv-brand{ display:flex;align-items:center;gap:14px; }
.adv-logo{ width:44px;height:44px;border-radius:9px;background:var(--ink-2);color:#fff;display:grid;place-items:center;font-family:var(--f-serif);font-size:20px;font-weight:600; }
.adv-brand__bn{ font-family:var(--f-serif);font-size:18px;font-weight:500;color:var(--ink); }
.adv-brand__bt{ font-size:12px;color:var(--muted);margin-top:2px; }
.adv-madeby{ font-family:var(--f-mono);font-size:11px;color:var(--muted);text-align:right;line-height:1.7;letter-spacing:.04em; }
.rep-hero{ padding:52px 0 36px; }
.rep-hero h1{ font-family:var(--f-serif);font-weight:300;font-size:52px;line-height:1.12;letter-spacing:-.01em;margin:14px 0 0;color:var(--ink); }
.rep-hero h1 .host{ color:var(--ink-2);font-weight:400; }
.rep-hero h1 em{ font-style:normal;color:var(--ember);font-weight:500; }
.rep-hero .meta{ font-family:var(--f-mono);font-size:12px;color:var(--muted);margin-top:18px;letter-spacing:.04em; }
.rep-kpi{ display:grid;grid-template-columns:repeat(8,1fr);border-top:1px solid var(--ink);border-bottom:1px solid var(--rule);margin:8px 0 0; }
.rep-kpi__c{ padding:18px 16px;border-left:1px solid var(--rule); }
.rep-kpi__c:first-child{ border-left:0; }
.rep-kpi__l{ font-family:var(--f-mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted); }
.rep-kpi__v{ font-family:var(--f-serif);font-size:32px;font-weight:400;color:var(--ink);margin-top:6px;font-variant-numeric:tabular-nums; }
.rep-kpi__v.p0{ color:var(--p0); } .rep-kpi__v.p1{ color:var(--p1); } .rep-kpi__v.p2{ color:#8E6B17; }
.rep-sec{ padding:56px 0;border-bottom:1px solid var(--rule); }
.rep-sec__head{ display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid var(--ink);padding-bottom:14px;margin-bottom:28px;gap:24px; }
.rep-sec__head h2{ margin:0;font-family:var(--f-serif);font-weight:400;font-size:28px; }
.rep-sec__head .lede{ font-family:var(--f-serif);font-size:13px;color:var(--ink-mute);max-width:380px;text-align:right;line-height:1.6; }
.aff-list{ display:flex;flex-wrap:wrap;gap:6px;margin-top:6px; }
.aff-list code{ font-family:var(--f-mono);font-size:11px;background:var(--paper-2);padding:2px 7px;border-radius:3px;color:var(--ink-mute); }
.adv-foot{ text-align:center;padding:40px 32px 64px;font-family:var(--f-mono);font-size:11px;color:var(--muted);letter-spacing:.06em; }
.adv-foot b{ font-family:var(--f-serif);color:var(--ink); }
.fan-group:not(.is-open) .fan-list{ display:none; }
.fan-group__h{ cursor:pointer; }
@media(max-width:860px){ .rep-kpi{ grid-template-columns:repeat(4,1fr); } .rep-hero h1{ font-size:34px; } .cluster-grid{ grid-template-columns:1fr; } .contact-mega{ flex-direction:column; } .report-shell{ padding:0 18px; } }
</style></head>
<body data-brand>

<header class="adv-topbar">
  <div class="adv-topbar__inner">
    <div class="adv-brand">${logoHtml}<div><div class="adv-brand__bn">${esc(contact.brand)}</div><div class="adv-brand__bt">${esc(contact.tagline || '')}</div></div></div>
    <div class="adv-madeby">由 <b>SEOcheck · 体检</b> 生成<br/>永久免费 · 开源可自托管</div>
  </div>
</header>

<div class="report-shell">

  <section class="rep-hero">
    <div class="eyebrow">SEO 体检报告 <span class="dash">—</span> ${esc(host)}</div>
    <h1>你的站 <span class="host">${esc(host)}</span><br/>这次体检发现了 <em>${num(st.instances)}</em> 处可优化项。</h1>
    <div class="meta">体检于 ${esc(dateStr)} · 抓取 ${audit.pages.length} 个页面 · ${audit.input.render ? '渲染模式' : '静态模式'} · 由 ${esc(contact.brand)} 出具</div>
  </section>

  <section class="rep-kpi">
    <div class="rep-kpi__c"><div class="rep-kpi__l">页面 Pages</div><div class="rep-kpi__v">${audit.pages.length}</div></div>
    <div class="rep-kpi__c"><div class="rep-kpi__l">问题 Issues</div><div class="rep-kpi__v">${num(st.instances)}</div></div>
    <div class="rep-kpi__c"><div class="rep-kpi__l">P0 阻断</div><div class="rep-kpi__v p0">${st.bySeverity.P0 || 0}</div></div>
    <div class="rep-kpi__c"><div class="rep-kpi__l">P1 高优</div><div class="rep-kpi__v p1">${st.bySeverity.P1 || 0}</div></div>
    <div class="rep-kpi__c"><div class="rep-kpi__l">P2 中</div><div class="rep-kpi__v p2">${st.bySeverity.P2 || 0}</div></div>
    <div class="rep-kpi__c"><div class="rep-kpi__l">关键词聚类</div><div class="rep-kpi__v">${audit.clusters.length}</div></div>
    <div class="rep-kpi__c"><div class="rep-kpi__l">Fan-Out</div><div class="rep-kpi__v">${num(fanTotal)}</div></div>
    <div class="rep-kpi__c"><div class="rep-kpi__l">覆盖率</div><div class="rep-kpi__v">${coveragePct}<span style="font-size:16px;color:var(--muted)">%</span></div></div>
  </section>

  <section class="rep-sec" id="issues">
    <div class="rep-sec__head"><h2><span class="section-num">01 ·</span> 问题清单</h2><p class="lede">— 按严重度排序，点击展开修复建议与受影响页面。</p></div>
    <div class="filters">
      <button class="filter-chip is-active">全部 <span class="filter-chip__count">${st.distinct}</span></button>
      <button class="filter-chip"><span class="filter-chip__dot filter-chip__dot--p0"></span> P0 阻断 <span class="filter-chip__count">${distinctBySev.P0}</span></button>
      <button class="filter-chip"><span class="filter-chip__dot filter-chip__dot--p1"></span> P1 高优 <span class="filter-chip__count">${distinctBySev.P1}</span></button>
      <button class="filter-chip"><span class="filter-chip__dot filter-chip__dot--p2"></span> P2 中等 <span class="filter-chip__count">${distinctBySev.P2}</span></button>
      <button class="filter-chip"><span class="filter-chip__dot filter-chip__dot--p3"></span> P3 提示 <span class="filter-chip__count">${distinctBySev.P3}</span></button>
    </div>
    <ul class="issue-acc">${issueRows}</ul>
  </section>

  <section class="rep-sec" id="site">
    <div class="rep-sec__head"><h2><span class="section-num">02 ·</span> 站点级诊断</h2><p class="lede">— DNS、抓取协议、平台识别、跟踪与安全响应头。</p></div>
    <div class="site-grid">${siteCards(s)}</div>
  </section>

  <section class="rep-sec" id="pages">
    <div class="rep-sec__head"><h2><span class="section-num">03 ·</span> 逐页详情</h2><p class="lede">— 标签为该页的具体问题，类型按 URL/结构化数据识别。</p></div>
    <div class="page-toolbar">${ptChips}</div>
    <table class="pages-tbl"><thead><tr><th style="width:34%">URL · title</th><th>问题标签</th><th class="num">P0+P1</th><th class="num">内链</th><th class="num">字数</th><th class="num">缺 alt</th><th>类型</th></tr></thead>
    <tbody>${pageRows}</tbody></table>
    ${audit.pages.length > 14 ? `<p style="margin:18px 0 0;font-family:var(--f-serif);color:var(--muted);font-size:13px;">— 共 ${audit.pages.length} 个页面，此处显示前 14 行；完整逐页清单见配套 Excel。</p>` : ''}
  </section>

  <section class="rep-sec" id="clusters">
    <div class="rep-sec__head"><h2><span class="section-num">04 ·</span> 关键词聚类</h2><p class="lede">— 主题取自被引最多页的 H1；内耗 = 簇内抢同一主词的页面数。</p></div>
    <div class="cluster-grid">${clusterCards || '<p class="muted">页面太少或主题过散，未形成聚类。</p>'}</div>
    ${audit.clusters.length > 8 ? `<p style="margin:24px 0 0;font-family:var(--f-serif);color:var(--muted);font-size:13px;">— 共 ${audit.clusters.length} 个聚类，显示前 8 组。</p>` : ''}
  </section>

  <section class="rep-sec" id="fanout">
    <div class="rep-sec__head"><h2><span class="section-num">05 ·</span> Fan-Out 候选 query</h2><p class="lede">— ✓ 站内已覆盖，✗ 尚未对应任何页面。把 ✗ 当作内容补强清单。</p></div>
    <div class="fan-toolbar">${bucketChips}</div>
    ${fanGroups}
    ${audit.fanout.length > 10 ? `<p style="margin:24px 0 0;font-family:var(--f-serif);color:var(--muted);font-size:13px;">— 共 ${audit.fanout.length} 组、${num(fanTotal)} 条 Fan-Out 候选，显示前 10 组；完整清单见配套 Excel。</p>` : ''}
  </section>

  <section class="rep-sec" id="contact" style="border-bottom:0;">
    <div class="rep-sec__head"><h2><span class="section-num">06 ·</span> 让顾问帮你落地</h2></div>
    <div class="contact-mega" data-brand>
      <div class="contact-mega__left">
        <div class="contact-mega__eyebrow">想让这些问题被修好？</div>
        <div class="contact-mega__brand">${esc(contact.brand)}</div>
        <p class="contact-mega__tag">这份体检是免费的。如果你想让 P0/P1 问题真正被改完上线，扫码找我聊聊。</p>
        <div class="contact-mega__rows">
          ${contact.person && !/^\[/.test(contact.person) ? `<div class="contact-mega__row"><span class="lbl">联系人</span><span class="val">${esc(contact.person)}</span></div>` : ''}
          ${contact.wechat && !/^\[/.test(contact.wechat) ? `<div class="contact-mega__row"><span class="lbl">WeChat</span><span class="val">${esc(contact.wechat)}</span></div>` : ''}
          ${contact.email && !/^\[/.test(contact.email) ? `<div class="contact-mega__row"><span class="lbl">Email</span><span class="val">${esc(contact.email)}</span></div>` : ''}
          ${contact.website && !/^\[/.test(contact.website) ? `<div class="contact-mega__row"><span class="lbl">Website</span><span class="val">${esc(contact.website)}</span></div>` : ''}
        </div>
        ${contact.note ? `<p class="contact-mega__note">${esc(contact.note)}</p>` : ''}
        <a class="contact-mega__btn" href="${contact.website && !/^\[/.test(contact.website) ? esc(contact.website) : '#'}">扫码 / 加微信咨询 →</a>
      </div>
      <div class="contact-mega__right">
        ${qr.hasQr ? `<div class="qr-card">${qr.html}</div><div class="contact-mega__qrhint">微信扫码 · <b>免费诊断</b></div>` : `<div class="qr-card" style="display:grid;place-items:center;color:var(--muted);font-family:var(--f-mono);font-size:12px;text-align:center;padding:24px;">在 contact.json<br/>填 qrImage<br/>用你的微信二维码</div>`}
      </div>
    </div>
  </section>

</div>

<div class="adv-foot">本报告由 <b>SEOcheck · 体检</b> 生成 · 永久免费 · 开源可自托管</div>

<script>
  // 问题/Fan-Out 展开
  document.querySelectorAll('.issue-row').forEach(r => r.addEventListener('click', () => r.parentElement.classList.toggle('is-open')));
  document.querySelectorAll('.fan-group__h').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('is-open')));
  // 问题筛选
  (function(){
    var chips = document.querySelectorAll('#issues .filter-chip');
    var items = document.querySelectorAll('#issues .issue-item');
    var sevs = ['', 'P0', 'P1', 'P2', 'P3'];
    chips.forEach(function(c, i){ c.addEventListener('click', function(){
      chips.forEach(function(x){ x.classList.remove('is-active'); }); c.classList.add('is-active');
      items.forEach(function(it){ it.style.display = (!sevs[i] || it.dataset.sev === sevs[i]) ? '' : 'none'; });
    }); });
  })();
</script>
</body></html>`;

  await fs.writeFile(outPath, html, 'utf8');
  return outPath;
}
