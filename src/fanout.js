// 关键词 Fan-Out：把一页的主关键词扩展成结构化的 query 树，
// 模仿生成式搜索 / AI Overviews 把一个 query 分解为很多子 query 的方式。
//
// 六个桶：
//   informational  - 这是什么 / 怎么工作
//   commercial     - 价格 / 最佳 / 替代
//   navigational   - docs / sdk / github / login
//   question       - 5W1H
//   longTail       - 年份、免费、开源、集成、排错 等修饰组合
//   comparative    - vs 同聚类兄弟页和页内识别到的实体
//
// v1.1 新增：
//  - 动态年份
//  - 每条 query 标 `covered: true/false`（页面正文是否覆盖了关键 token）
//  - 每桶汇总 coverage 比例

const YEAR = new Date().getFullYear();

const TEMPLATES = {
  informational: [
    'what is {kw}', '{kw} explained', '{kw} meaning', '{kw} definition',
    'how does {kw} work', '{kw} overview', '{kw} guide', '{kw} tutorial',
    '{kw} examples', '{kw} use cases', '{kw} benefits', '{kw} limitations',
  ],
  commercial: [
    '{kw} pricing', '{kw} cost', '{kw} price', 'how much does {kw} cost',
    'best {kw}', 'top {kw}', 'cheapest {kw}', '{kw} free tier',
    '{kw} alternatives', '{kw} competitors', '{kw} review', '{kw} reviews',
  ],
  navigational: [
    '{kw} docs', '{kw} documentation', '{kw} api', '{kw} sdk',
    '{kw} github', '{kw} login', '{kw} sign up', '{kw} download',
    '{kw} dashboard', '{kw} pricing page',
  ],
  question: [
    'why use {kw}', 'when to use {kw}', 'who uses {kw}',
    'is {kw} good', 'is {kw} safe', 'does {kw} support',
    'can {kw}', 'should i use {kw}',
  ],
  longTail: [
    `{kw} ${YEAR}`, `{kw} ${YEAR + 1}`, '{kw} latest', 'free {kw}', 'open source {kw}',
    '{kw} integration', '{kw} plugin', '{kw} tutorial youtube',
    '{kw} sample code', '{kw} getting started', '{kw} troubleshooting',
    '{kw} rate limit', '{kw} security', '{kw} self hosted',
  ],
};

// Coverage 判定用：从 query 文本里拿"有信息量"的 token
const COVER_STOP = new Set('what when where who why how is are do does the a an of for with to in on at by from this that vs and or i my your you'.split(' '));

function tokensForCoverage(text) {
  return (text || '').toLowerCase()
    .replace(/[^a-z0-9一-鿿\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
}

function coverageOf(query, primaryKw, pageText) {
  // 把 query 里的"非 primary、非通用停用词"token 拿出来，看页面文本是否覆盖
  const pageToks = new Set(tokensForCoverage(pageText));
  const primaryToks = new Set(tokensForCoverage(primaryKw));
  const queryToks = tokensForCoverage(query)
    .filter(t => t.length >= 2 && !COVER_STOP.has(t) && !primaryToks.has(t));
  if (queryToks.length === 0) {
    // query 除了 primary 没别的信息——保守判：覆盖
    return true;
  }
  // 全部都在页面里 = 覆盖（合理的严格判定）
  return queryToks.every(t => pageToks.has(t));
}

function derivePrimaryKeyword(page, clusterTopic) {
  const clean = s => (s || '')
    .replace(/\s+/g, ' ')
    .replace(/^[^:|—•·]{2,30}:\s+/, '')
    .replace(/\s*[|·—•]\s*[^|·—•]*$/, '')
    .trim();
  if (page.h1 && page.h1.length) {
    const h = clean(page.h1[0]);
    if (h && h.length >= 3 && h.length < 70) return h;
  }
  if (page.title) {
    const t = clean(page.title);
    if (t && t.length >= 3 && t.length < 70) return t;
  }
  if (page.bigrams && page.bigrams.length) return page.bigrams[0][0];
  if (page.unigrams && page.unigrams.length) return page.unigrams[0][0];
  return clusterTopic || 'site';
}

function detectEntities(page) {
  const corpus = [page.title || '', ...(page.h1 || []), ...(page.h2 || [])].join(' . ');
  const matches = corpus.match(/\b([A-Z][a-z0-9]+(?:[ \-][A-Z][a-z0-9]+){0,3})\b/g) || [];
  const seen = new Set(), out = [];
  for (const m of matches) {
    if (m.length < 3 || /^(The|A|An|And|Or|For|With|Best)$/i.test(m)) continue;
    if (seen.has(m.toLowerCase())) continue;
    seen.add(m.toLowerCase()); out.push(m);
  }
  return out.slice(0, 8);
}

function expand(template, kw) {
  return template.replace(/\{kw\}/g, kw).replace(/\s+/g, ' ').trim();
}

export function fanout(pagesKw, clusters, allPages = [], { perBucket = 8 } = {}) {
  const urlToCluster = new Map();
  for (const c of clusters) for (const u of c.pages) urlToCluster.set(u, c);
  const urlToText = new Map(allPages.map(p => [p.url, [(p.title || ''), (p.h1 || []).join(' '), (p.h2 || []).join(' '), p.mainText || p.text || ''].join(' ').toLowerCase()]));

  const out = [];
  for (const p of pagesKw) {
    const cluster = urlToCluster.get(p.url);
    const primary = derivePrimaryKeyword(p, cluster && cluster.primaryTopic);
    const entities = detectEntities(p);
    const pageText = urlToText.get(p.url) || '';

    function withCoverage(qs) {
      return qs.map(q => ({ q, covered: coverageOf(q, primary, pageText) }));
    }

    const buckets = {};
    for (const [name, tpl] of Object.entries(TEMPLATES)) {
      const queries = [...new Set(tpl.map(t => expand(t, primary)))].slice(0, perBucket);
      buckets[name] = withCoverage(queries);
    }

    // comparative
    const peers = [];
    if (cluster) for (const u of cluster.pages) if (u !== p.url) {
      const sib = pagesKw.find(x => x.url === u);
      if (sib) {
        const sibKw = derivePrimaryKeyword(sib, cluster.primaryTopic);
        if (sibKw && sibKw.toLowerCase() !== primary.toLowerCase()) peers.push(sibKw);
      }
    }
    const peerSet = [...new Set([...peers, ...entities])]
      .filter(x => x.toLowerCase() !== primary.toLowerCase())
      .slice(0, 6);
    buckets.comparative = withCoverage(peerSet.map(x => `${primary} vs ${x}`));

    // 汇总 coverage
    const coverage = {};
    for (const [name, qs] of Object.entries(buckets)) {
      const total = qs.length, covered = qs.filter(x => x.covered).length;
      coverage[name] = { covered, total, pct: total ? Math.round(100 * covered / total) : 0 };
    }
    const totalQueries = Object.values(buckets).reduce((s, a) => s + a.length, 0);
    const totalCovered = Object.values(buckets).reduce((s, a) => s + a.filter(x => x.covered).length, 0);

    out.push({
      url: p.url,
      primaryKeyword: primary,
      detectedEntities: entities,
      clusterId: cluster ? cluster.id : null,
      clusterTopic: cluster ? cluster.primaryTopic : null,
      fanout: buckets,
      coverage,
      totalQueries,
      totalCovered,
      totalUncovered: totalQueries - totalCovered,
      coveragePct: totalQueries ? Math.round(100 * totalCovered / totalQueries) : 0,
    });
  }
  return out;
}
