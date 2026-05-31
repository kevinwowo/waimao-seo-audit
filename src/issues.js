// 外贸独立站专项问题检测（含跨境/多语种/电商场景）。
// v1.2：结构化输出 —— 每条问题带 id / scope / affectedUrls / affectedCount / instanceCount / tag；
//        逐页问题按 code 聚合（一条"缺 H1 影响 38 页"，而非 38 条）；
//        导出 attachIssueTags() 把问题回挂到 pages[].issueTags / issueCounts。

// 这些 code 会作为「逐页徽章」展示（其余 P2 普遍性问题仍进总清单，但不刷屏到每页徽章）。
const PAGE_TAG_CODES = new Set([
  'spa-empty-shell', 'no-h1', 'multi-h1', 'no-title', 'no-meta-desc', 'duplicate-meta-tag',
  'thin-content', 'images-missing-alt', 'title-too-long', 'meta-too-long',
  'lang-mismatch', 'duplicate-title', 'duplicate-meta', 'product-no-schema',
]);

const SEV_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function detectIssues(pages, siteResult) {
  const total = pages.length || 1;
  const siteIssues = [];
  const pushSite = (severity, code, title, detail, evidence) =>
    siteIssues.push({ severity, code, title, detail, scope: 'site', tag: null,
      affectedUrls: [], affectedCount: total, instanceCount: 1, evidence: evidence || null });

  // === 站点级 ===
  if (siteResult) {
    const s = siteResult;
    const realSitemaps = s.sitemaps.filter(x => x.valid);
    if (!realSitemaps.length) pushSite('P0', 'no-sitemap', '没有有效的 sitemap.xml',
      '搜索引擎找不到 sitemap，无法高效发现你的所有页面（尤其是产品/分类深页）。建议在构建流程中自动生成 sitemap，并在 robots.txt 用 Sitemap: 行声明、提交至 Google Search Console。',
      s.sitemaps.map(x => `${x.url} -> ${x.status}, valid=${x.valid}`).join('\n'));
    if (s.robots.hasFile && !s.robots.declaresSitemap)
      pushSite('P1', 'robots-no-sitemap', 'robots.txt 未声明 Sitemap',
        '请在 robots.txt 加一行 `Sitemap: <你的 sitemap 完整 URL>`，帮助爬虫发现全部页面。', null);
    if (!s.robots.hasFile)
      pushSite('P1', 'no-robots', '没有 robots.txt', '建议放一个明确的 robots.txt（即使只是允许全部抓取），并在其中声明 Sitemap。', null);

    if (s.dns.apex.A_error) pushSite('P0', 'apex-dns-missing', `主域 ${s.apex} 无法解析（仅 www 可访问）`,
      '裸域名（不带 www）没有 DNS A/CNAME 记录。用户直接输域名打不开；也无法做 apex→www 跳转，约 30% 直接流量会丢失。',
      s.dns.apex.A_error);

    const sh = s.securityHeaders;
    if (!sh['strict-transport-security']) pushSite('P2', 'no-hsts', '缺少 HSTS 响应头',
      '建议加 Strict-Transport-Security: max-age=31536000，强制 HTTPS、加分安全信号。', null);
    if (!sh['x-content-type-options']) pushSite('P2', 'no-xcto', '缺少 X-Content-Type-Options',
      '加 `X-Content-Type-Options: nosniff`，防止浏览器猜测 MIME 类型。', null);
    if (!sh['x-frame-options'] && !sh['content-security-policy']) pushSite('P2', 'no-frame-protection',
      '没有点击劫持防护', '加 X-Frame-Options: DENY 或在 CSP 里加 frame-ancestors。', null);
    if (!sh['cache-control']) pushSite('P3', 'no-cache-control', 'HTML 缺 Cache-Control 头',
      '设置明确的 Cache-Control（例如 public, max-age=300）。', null);

    if (s.platform === '未识别')
      pushSite('P3', 'platform-unknown', '未识别建站平台', '不影响 SEO，但接入跟踪/分析时需手动适配。', null);
    if (!s.analytics.googleAnalytics && !s.analytics.googleTagManager)
      pushSite('P1', 'no-ga', '未检测到 Google Analytics / GTM',
        '外贸独立站务必接入 GA4（或 GTM），否则无法衡量 SEO 流量、关键词与转化。', null);
    if (!s.analytics.googleSearchConsole)
      pushSite('P1', 'no-gsc-verify', '未发现 Google Search Console 验证标签',
        '请用 google-site-verification meta 或 DNS TXT 方式完成 GSC 验证，否则看不到 Google 收录与点击数据。', null);
    if (!s.analytics.facebookPixel && !s.analytics.metaPixel)
      pushSite('P3', 'no-meta-pixel', '未检测到 Meta Pixel（Facebook Pixel）',
        '跨境投放（Facebook/Instagram Ads）的标配，建议接入。', null);
  }

  // === 逐页：按 code 聚合 ===
  // agg: code -> { severity, code, title(模板), detail, tag, urls:Set, weight }
  const agg = new Map();
  const addPage = (code, severity, title, detail, tag, url, weight = 1) => {
    let a = agg.get(code);
    if (!a) { a = { code, severity, title, detail, tag, urls: new Set(), weight: 0 }; agg.set(code, a); }
    a.urls.add(url);
    a.weight += weight;
  };

  const titleMap = new Map(), metaMap = new Map();
  for (const p of pages) {
    if (!p.title) addPage('no-title', 'P1', '页面缺少 <title>', '页面没有渲染出 title 元素，搜索结果无标题。', 'title 缺失', p.url);
    if (!p.metaDescription) addPage('no-meta-desc', 'P1', '缺少 meta description',
      '会让 Google 用页面里随机一段文字做摘要，难看且不可控。建议每页写 120–160 字符的独有描述。', '缺 meta desc', p.url);
    if (p.metaDescDuplicateTags > 1) addPage('duplicate-meta-tag', 'P1', '出现多个 meta description 标签',
      '同页存在多个 description 标签属非标准用法，Google 只取第一个。', 'meta 标签重复', p.url);
    if (!p.canonical) addPage('no-canonical', 'P2', '缺少 canonical',
      '同内容多 URL 时会被判重复，给每页加 canonical 指向标准 URL。', '无 canonical', p.url);
    if (!p.og || !Object.keys(p.og).length) addPage('no-og', 'P2', '缺少 Open Graph 标签',
      '社交分享（Facebook / WhatsApp / LinkedIn）没有标题和缩略图，点击率低。', '无 OG', p.url);
    if (!p.jsonldCount) addPage('no-jsonld', 'P2', '缺少结构化数据 JSON-LD',
      '产品页加 Product schema 可在 Google 显示价格/评分；首页加 Organization。', '无结构化', p.url);
    if (p.h1Count === 0) addPage('no-h1', 'P1', '页面缺少 H1',
      '每页必须有且仅有一个 H1，承载主关键词。', '缺 H1', p.url);
    if (p.h1Count > 1) addPage('multi-h1', 'P3', '页面有多个 H1', '每页应只有一个 H1。', '多 H1', p.url);
    if (p.wordCount < 100) addPage('thin-content', 'P2', '内容过薄（不足 100 词）',
      '空内容页会被 Google 判为低质量。补充产品描述、参数、FAQ。', '薄内容', p.url);
    if (p.imgNoAlt) addPage('images-missing-alt', 'P2', '图片缺 alt 属性',
      '外贸独立站产品图必须有 alt（写明产品名+卖点），是图片搜索流量的关键。', '缺 alt', p.url, p.imgNoAlt);
    if (p.titleLength > 65) addPage('title-too-long', 'P3', 'Title 超过 65 字符（会截断）',
      '搜索结果标题会被截断，控制在 60 字符内。', 'title 过长', p.url);
    if (p.metaDescriptionLength > 160) addPage('meta-too-long', 'P3', 'Meta description 超过 160 字符',
      '描述会被截断，控制在 160 字符内。', 'meta 过长', p.url);

    // SPA 空壳
    if (p.h1Count === 0 && p.wordCount < 50)
      addPage('spa-empty-shell', 'P0', '疑似 SPA 空壳（无 H1、内容极少）',
        '页面 HTML 几乎是空的，正文靠 JS 渲染。Google 渲染有延迟与预算限制，会严重影响收录。建议做 SSR 或预渲染。', 'SPA 空壳', p.url);

    // hreflang
    if (!p.hreflang || !p.hreflang.length)
      addPage('no-hreflang', 'P2', '未设置 hreflang',
        '外贸独立站若做多语种或多地区（US/EU/UK 等），缺 hreflang 会让搜索引擎搞混语言版本。', '无 hreflang', p.url);

    // 语言标记错位
    if (p.lang && /^zh/.test(p.lang) && /^[A-Za-z\s.,!?'"-]+$/.test((p.mainText || p.text || '').slice(0, 400)))
      addPage('lang-mismatch', 'P2', `<html lang> 标记与正文语言不符`,
        '语言标记错误会误导搜索引擎与无障碍工具，外贸英文站请把 lang 设为 en。', 'lang 错配', p.url);

    // 产品页缺 Product 结构化数据
    if (p.pageType === 'product' && !(p.jsonldTypes || []).some(t => /product/i.test(t)))
      addPage('product-no-schema', 'P2', '产品页缺少 Product 结构化数据',
        '产品页加 Product schema（含 offers 价格、aggregateRating 评分）可在 Google 搜索结果展示富媒体卡片，显著提升点击率。', '缺 Product schema', p.url);

    const t = (p.title || '').trim().toLowerCase();
    if (t) { if (!titleMap.has(t)) titleMap.set(t, []); titleMap.get(t).push(p.url); }
    const md = (p.metaDescription || '').trim().toLowerCase();
    if (md) { if (!metaMap.has(md)) metaMap.set(md, []); metaMap.get(md).push(p.url); }
  }

  // 把聚合的逐页问题落成 issue 对象
  const pageIssues = [];
  for (const a of agg.values()) {
    const urls = [...a.urls];
    let title = a.title;
    if (a.code === 'images-missing-alt') title = `${a.weight} 张图片缺 alt 属性`;
    else if (urls.length > 1) title = `${title}（${urls.length} 个页面）`;
    pageIssues.push({
      severity: a.severity, code: a.code, title, detail: a.detail, tag: a.tag,
      scope: 'page', affectedUrls: urls, affectedCount: urls.length, instanceCount: urls.length,
      evidence: null,
    });
  }

  // 重复 title / meta：每个重复值一条
  for (const [t, urls] of titleMap) if (urls.length > 1)
    pageIssues.push({ severity: 'P1', code: 'duplicate-title', tag: 'title 重复',
      title: `Title 在 ${urls.length} 个页面上重复`,
      detail: `重复的 Title："${t.slice(0, 80)}"。每页应有独有 title，含目标关键词。`,
      scope: 'page', affectedUrls: urls, affectedCount: urls.length, instanceCount: urls.length, evidence: null });
  for (const [m, urls] of metaMap) if (urls.length > 1)
    pageIssues.push({ severity: 'P1', code: 'duplicate-meta', tag: 'meta 重复',
      title: `Meta description 在 ${urls.length} 个页面上重复`,
      detail: `重复内容开头："${m.slice(0, 80)}…"。每页应有独有描述。`,
      scope: 'page', affectedUrls: urls, affectedCount: urls.length, instanceCount: urls.length, evidence: null });

  // 跨页：被引用但未抓到的路径
  const seen = new Set(pages.map(p => new URL(p.url).pathname.replace(/\/+$/, '') || '/'));
  const referenced = new Map();
  for (const p of pages) for (const l of p.internalLinks) {
    const path = l.href.split('?')[0].replace(/\/+$/, '') || '/';
    if (!referenced.has(path)) referenced.set(path, new Set());
    referenced.get(path).add(p.url);
  }
  const orphan = [];
  for (const [path, fromSet] of referenced) if (!seen.has(path)) orphan.push({ path, from: [...fromSet] });
  if (orphan.length)
    siteIssues.push({ severity: 'P2', code: 'unreachable-refs', scope: 'site', tag: null,
      title: `${orphan.length} 个被引用但未抓到的路径`,
      detail: '这些路径被其它页面链接到，但抓取时没拿到——可能是 404、需登录、或超出抓取上限。',
      affectedUrls: [], affectedCount: orphan.length, instanceCount: 1,
      evidence: orphan.slice(0, 20).map(o => `${o.path}  ←  ${o.from.slice(0, 3).join(', ')}`).join('\n') });

  // 合并、按严重度排序、编号 i-001…
  const all = [...siteIssues, ...pageIssues].sort((a, b) =>
    (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || (b.affectedCount - a.affectedCount));
  all.forEach((it, i) => { it.id = 'i-' + String(i + 1).padStart(3, '0'); });
  return all;
}

// 把问题回挂到每个页面：pages[].issueTags（精选徽章）+ issueCounts（按严重度全量计数）
export function attachIssueTags(pages, issues) {
  const byUrl = new Map(pages.map(p => [p.url, []]));
  const pathIndex = new Map();
  for (const p of pages) pathIndex.set(new URL(p.url).pathname.replace(/\/+$/, '') || '/', p.url);

  for (const it of issues) {
    if (it.scope !== 'page') continue;
    for (const u of it.affectedUrls) {
      let key = byUrl.has(u) ? u : null;
      if (!key) { // 容错：affectedUrls 可能是 pathname
        try { key = pathIndex.get(new URL(u, pages[0]?.url || 'http://x').pathname.replace(/\/+$/, '') || '/'); }
        catch { key = pathIndex.get(u); }
      }
      if (key && byUrl.has(key)) byUrl.get(key).push(it);
    }
  }

  for (const p of pages) {
    const its = byUrl.get(p.url) || [];
    p.issueCounts = { p0: 0, p1: 0, p2: 0, p3: 0 };
    for (const it of its) p.issueCounts[it.severity.toLowerCase()]++;
    p.issueTags = its
      .filter(it => PAGE_TAG_CODES.has(it.code))
      .map(it => ({ code: it.code, severity: it.severity, label: it.tag || it.code }));
  }
}
