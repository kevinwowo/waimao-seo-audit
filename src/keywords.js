// Keyword extraction (TF-IDF) and page clustering by topical similarity.

const STOP = new Set(("a about above after again against all am an and any are aren't as at be because been before being below between both but by can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves get got also use using used new like just one two three four five home page site sign log search free menu dark light close open back next prev top bottom https http www com").split(' '));

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^a-z0-9\s一-鿿.\-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && w.length <= 30 && !STOP.has(w) && !/^[\d.\-]+$/.test(w));
}

function ngrams(tokens, n) {
  const out = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    const g = tokens.slice(i, i + n);
    if (g.some(t => STOP.has(t))) continue;
    out.push(g.join(' '));
  }
  return out;
}

function freq(arr) {
  const m = new Map();
  for (const t of arr) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

export function extractKeywords(pages, { topN = 20 } = {}) {
  // pages: [{ url, title, h1[], mainText, text }]
  const docs = pages.map(p => {
    const t = tokenize([p.title || '', p.h1.join(' '), p.mainText || p.text || ''].join(' '));
    return { uni: freq(t), bi: freq(ngrams(t, 2)) };
  });

  const N = pages.length;
  const dfUni = new Map(), dfBi = new Map();
  for (const d of docs) {
    for (const k of d.uni.keys()) dfUni.set(k, (dfUni.get(k) || 0) + 1);
    for (const k of d.bi.keys()) dfBi.set(k, (dfBi.get(k) || 0) + 1);
  }
  function tfidf(termMap, df) {
    const out = [];
    for (const [t, f] of termMap) {
      const idf = Math.log(1 + N / (df.get(t) || 1));
      out.push([t, f * idf]);
    }
    return out.sort((a, b) => b[1] - a[1]);
  }

  const enriched = pages.map((p, i) => {
    const uniTop = tfidf(docs[i].uni, dfUni).slice(0, topN);
    const biTop = tfidf(docs[i].bi, dfBi).slice(0, Math.ceil(topN / 2));
    return { url: p.url, title: p.title, h1: p.h1, unigrams: uniTop, bigrams: biTop, _doc: docs[i] };
  });

  return { pages: enriched, idf: { uni: dfUni, bi: dfBi }, N };
}

function vectorise(termMap, df, N, terms) {
  const v = new Map();
  for (const t of terms) {
    const f = termMap.get(t) || 0;
    if (f === 0) continue;
    const idf = Math.log(1 + N / (df.get(t) || 1));
    v.set(t, f * idf);
  }
  return v;
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [k, va] of a) { na += va * va; if (b.has(k)) dot += va * b.get(k); }
  for (const vb of b.values()) nb += vb * vb;
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * na > 0 ? na : 1) / Math.sqrt(nb);
}

// 干净化 H1 / title 作为聚类主题
function cleanTopic(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ')
    .replace(/^[^:|—•·]{2,30}:\s+/, '')          // 去掉 "Provider:" / "Section:" 前缀
    .replace(/\s*[|·—•]\s*[^|·—•]*$/, '')        // 去掉 " | 站名" 后缀
    .trim();
}

export function clusterPages(kw, allPages = [], { threshold = 0.18, topTerms = 60 } = {}) {
  const { pages, idf, N } = kw;

  const vocab = new Set();
  for (const p of pages) for (const [t] of p.unigrams.slice(0, topTerms)) vocab.add(t);
  const terms = [...vocab];

  const vecs = pages.map(p => vectorise(p._doc.uni, idf.uni, N, terms));
  const sims = [];
  for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
    const s = cosine(vecs[i], vecs[j]);
    if (s >= threshold) sims.push([i, j, s]);
  }
  sims.sort((a, b) => b[2] - a[2]);

  const parent = pages.map((_, i) => i);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  for (const [i, j] of sims) { const ri = find(i), rj = find(j); if (ri !== rj) parent[rj] = ri; }
  const groups = new Map();
  for (let i = 0; i < pages.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }

  // 内链入度：每个 URL 被引用的次数（用于挑"代表页"）
  const pathToUrl = new Map();
  for (const p of allPages) pathToUrl.set(new URL(p.url).pathname.replace(/\/+$/, '') || '/', p.url);
  const inbound = new Map();
  for (const p of allPages) {
    for (const l of p.internalLinks || []) {
      const path = (l.href || '').split('?')[0].replace(/\/+$/, '') || '/';
      const tgt = pathToUrl.get(path);
      if (tgt && tgt !== p.url) inbound.set(tgt, (inbound.get(tgt) || 0) + 1);
    }
  }
  const urlToPage = new Map(allPages.map(p => [p.url, p]));

  const clusters = [...groups.values()].map((idxs) => {
    const agg = new Map();
    for (const i of idxs) for (const [t, w] of pages[i].unigrams.slice(0, 20)) agg.set(t, (agg.get(t) || 0) + w);
    const shared = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
    const biAgg = new Map();
    for (const i of idxs) for (const [t, w] of pages[i].bigrams.slice(0, 10)) biAgg.set(t, (biAgg.get(t) || 0) + w);
    const sharedBi = [...biAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);

    // 主题：被引最多页面的 H1 / title；找不到合适的回退到 top bigram / top unigram
    const memberUrls = idxs.map(i => pages[i].url);
    const ranked = memberUrls
      .map(u => ({ url: u, score: inbound.get(u) || 0, page: urlToPage.get(u) }))
      .sort((a, b) => b.score - a.score);
    let primaryTopic = '', representativePage = null;
    for (const r of ranked) {
      if (!r.page) continue;
      const h1 = cleanTopic((r.page.h1 || [])[0] || '');
      const ttl = cleanTopic(r.page.title || '');
      const candidate = (h1 && h1.length >= 3 && h1.length <= 60) ? h1
                       : (ttl && ttl.length >= 3 && ttl.length <= 60) ? ttl : '';
      if (candidate) { primaryTopic = candidate; representativePage = r.url; break; }
    }
    if (!primaryTopic) primaryTopic = sharedBi[0] || shared[0] || '(unknown)';

    // 关键词内耗：簇内有多少页在抢同一个主词。
    // 每页取其归一化主词（H1/title 清洗后），cannibalCount = 成员数 - 去重后的主词数。
    const memberKeys = memberUrls.map(u => {
      const pg = urlToPage.get(u);
      const key = cleanTopic((pg && (pg.h1 || [])[0]) || (pg && pg.title) || u).toLowerCase().trim();
      return key || u;
    });
    const distinctKeys = new Set(memberKeys).size;
    const cannibalCount = Math.max(0, memberUrls.length - distinctKeys);

    return {
      size: idxs.length,
      pages: memberUrls,
      representativePage,
      topKeywords: shared,
      topPhrases: sharedBi,
      primaryTopic,
      cannibalCount,
    };
  }).sort((a, b) => b.size - a.size);

  clusters.forEach((c, i) => c.id = i + 1);
  return clusters;
}
