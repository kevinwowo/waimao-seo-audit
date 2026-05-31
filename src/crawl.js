// 抓取一个站点：静态 fetch（默认）或 puppeteer-core 渲染。
// v1.1 改进：
//  - 遵守 robots.txt（可用 --ignore-robots 关闭）
//  - sitemap-first 种子（默认开，可用 --no-sitemap-seed 关闭）
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { XMLParser } from 'fast-xml-parser';

const UA = 'Mozilla/5.0 (compatible; waimao-seo-audit/1.1; +https://github.com/waimao-seo-audit)';

async function fetchStatic(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' }, redirect: 'follow', signal: ctrl.signal });
    const html = await res.text();
    return { status: res.status, url: res.url, html, headers: Object.fromEntries(res.headers) };
  } catch (e) {
    return { status: 0, url, html: '', headers: {}, error: e.message };
  } finally { clearTimeout(t); }
}

async function loadPuppeteer(chromePath) {
  let puppeteer;
  try { puppeteer = (await import('puppeteer-core')).default; }
  catch { throw new Error('puppeteer-core 未安装。请运行 `npm i puppeteer-core` 后再使用 --render。'); }
  const candidates = chromePath ? [chromePath] : [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      const browser = await puppeteer.launch({ executablePath: p, headless: 'new', args: ['--no-sandbox'] });
      return browser;
    } catch {}
  }
  throw new Error('未找到 Chrome。请设置 CHROME_PATH 或传 --chrome <路径>。');
}

async function fetchRendered(browser, url, waitMs = 5000, timeoutMs = 30000) {
  // 用 domcontentloaded 比 networkidle2 更稳：
  // 很多 SPA 长连接会让 network 永远不 idle，导致 networkidle2 超时
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1366, height: 900 });
  let status = 0, finalUrl = url, headers = {};
  page.on('response', r => { if (r.url() === url || r.url() === url + '/') { status = r.status(); headers = r.headers(); } });
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (resp) { status = resp.status(); finalUrl = resp.url(); headers = resp.headers(); }
    // 给 SPA 时间渲染 + 让 networkidle 尝试一次（但不强求）
    await Promise.race([
      page.waitForNetworkIdle({ idleTime: 800, timeout: waitMs }).catch(() => {}),
      new Promise(r => setTimeout(r, waitMs)),
    ]);
    const html = await page.content();
    await page.close();
    return { status, url: finalUrl, html, headers };
  } catch (e) {
    // 即使 goto 失败,也尝试拿到当前 DOM(可能已经有内容)
    let html = '';
    try { html = await page.content(); } catch {}
    try { await page.close(); } catch {}
    return { status, url: finalUrl, html, headers, error: e.message };
  }
}

function normaliseUrl(href, base) {
  try {
    const u = new URL(href, base);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch { return null; }
}

function isSamePublicPage(u, hostnames) {
  try {
    const url = new URL(u);
    if (!hostnames.has(url.hostname)) return false;
    const p = url.pathname.toLowerCase();
    if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|map|pdf|zip|mp4|woff2?)$/i.test(p)) return false;
    return true;
  } catch { return false; }
}

// ---- robots.txt ----
function parseRobots(text) {
  // 取 User-agent: * 段落里的 Allow/Disallow（多个 * 段合并）
  const lines = (text || '').split('\n');
  let inStar = false;
  const disallow = [], allow = [];
  for (const raw of lines) {
    const l = raw.replace(/#.*/, '').trim();
    if (!l) continue;
    const m = l.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') inStar = (val === '*');
    else if (inStar) {
      if (key === 'disallow' && val) disallow.push(val);
      else if (key === 'allow' && val) allow.push(val);
    }
  }
  return { disallow, allow };
}
function isAllowedByRobots(pathname, rules) {
  // 最长匹配优先（按 Google 的实现近似）
  let best = { len: -1, allow: true };
  for (const a of rules.allow) if (pathname.startsWith(a) && a.length > best.len) best = { len: a.length, allow: true };
  for (const d of rules.disallow) if (pathname.startsWith(d) && d.length > best.len) best = { len: d.length, allow: false };
  return best.allow;
}

async function loadRobots(baseUrl) {
  try {
    const r = await fetch(new URL('/robots.txt', baseUrl).toString(), { headers: { 'User-Agent': UA } });
    if (!r.ok) return { rules: { disallow: [], allow: [] }, sitemaps: [], status: r.status };
    const text = await r.text();
    const sitemaps = (text.match(/^Sitemap:\s*(.+)$/gim) || [])
      .map(l => l.replace(/^\s*Sitemap:\s*/i, '').trim());
    return { rules: parseRobots(text), sitemaps, status: 200 };
  } catch {
    return { rules: { disallow: [], allow: [] }, sitemaps: [], status: 0 };
  }
}

// ---- sitemap seeding ----
async function loadSitemapUrls(baseUrl, robotsSitemaps, maxUrls = 5000) {
  const candidates = new Set([
    ...robotsSitemaps,
    new URL('/sitemap.xml', baseUrl).toString(),
    new URL('/sitemap_index.xml', baseUrl).toString(),
  ]);
  const xml = new XMLParser({ ignoreAttributes: false });
  const urls = new Set();
  const visited = new Set();
  async function ingest(url) {
    if (urls.size >= maxUrls || visited.has(url)) return;
    visited.add(url);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) return;
      const t = await r.text();
      if (!/<(urlset|sitemapindex)/i.test(t)) return;
      const p = xml.parse(t);
      if (p.urlset && p.urlset.url) {
        for (const u of [].concat(p.urlset.url)) {
          if (urls.size >= maxUrls) break;
          const loc = typeof u === 'string' ? u : u.loc;
          if (loc) urls.add(String(loc).trim());
        }
      } else if (p.sitemapindex && p.sitemapindex.sitemap) {
        for (const s of [].concat(p.sitemapindex.sitemap)) {
          const loc = typeof s === 'string' ? s : s.loc;
          if (loc) await ingest(String(loc).trim());
        }
      }
    } catch {}
  }
  for (const c of candidates) await ingest(c);
  return [...urls];
}

export async function crawl({
  startUrl, maxPages = 50, concurrency = 4, render = false, chromePath = null,
  allowSubdomains = false, respectRobots = true, sitemapFirst = true, onProgress
}) {
  const start = new URL(startUrl);
  const hostnames = new Set([start.hostname]);
  if (allowSubdomains) hostnames.add(start.hostname.replace(/^www\./, ''));

  // robots
  const robots = await loadRobots(startUrl);
  const robotsActive = respectRobots && (robots.rules.disallow.length || robots.rules.allow.length);

  // sitemap seed
  const seeds = [start.toString()];
  let sitemapSeedCount = 0;
  if (sitemapFirst) {
    const sitemapUrls = await loadSitemapUrls(startUrl, robots.sitemaps, maxPages * 3);
    for (const u of sitemapUrls) {
      if (!isSamePublicPage(u, hostnames)) continue;
      seeds.push(normaliseUrl(u, startUrl) || u);
    }
    sitemapSeedCount = seeds.length - 1;
  }

  const queue = [...new Set(seeds)];
  const seen = new Set(queue);
  const skippedByRobots = new Set();
  const results = [];
  const limit = pLimit(concurrency);

  let browser = null;
  if (render) browser = await loadPuppeteer(chromePath);

  async function process(url) {
    if (respectRobots) {
      const u = new URL(url);
      if (!isAllowedByRobots(u.pathname + (u.search || ''), robots.rules)) { skippedByRobots.add(url); return; }
    }
    const fetched = render ? await fetchRendered(browser, url) : await fetchStatic(url);
    const $ = cheerio.load(fetched.html || '');
    const links = [];
    $('a[href]').each((_, a) => {
      const href = $(a).attr('href'); if (!href) return;
      const n = normaliseUrl(href, fetched.url);
      if (!n) return;
      const text = $(a).text().trim().replace(/\s+/g, ' ').slice(0, 80);
      const rel = $(a).attr('rel') || '';
      links.push({ href: n, text, rel });
    });
    results.push({ url: fetched.url, requested: url, status: fetched.status, html: fetched.html, headers: fetched.headers, links, error: fetched.error });
    if (onProgress) onProgress(results.length, queue.length + results.length, url);

    if (results.length < maxPages) {
      for (const l of links) {
        if (results.length + queue.length >= maxPages) break;
        if (seen.has(l.href)) continue;
        if (!isSamePublicPage(l.href, hostnames)) continue;
        if (respectRobots) {
          const u = new URL(l.href);
          if (!isAllowedByRobots(u.pathname + (u.search || ''), robots.rules)) { skippedByRobots.add(l.href); continue; }
        }
        seen.add(l.href);
        queue.push(l.href);
      }
    }
  }

  while (queue.length && results.length < maxPages) {
    const batch = [];
    while (queue.length && batch.length < concurrency && results.length + batch.length < maxPages) batch.push(queue.shift());
    await Promise.all(batch.map(u => limit(() => process(u))));
  }

  if (browser) await browser.close();
  return {
    pages: results,
    meta: {
      sitemapSeedCount,
      robotsActive,
      robotsRules: { disallow: robots.rules.disallow.length, allow: robots.rules.allow.length },
      robotsSkipped: skippedByRobots.size,
      robotsSkippedSample: [...skippedByRobots].slice(0, 8),
    },
  };
}
