// 站点级检查：robots / sitemap / DNS / 跳转 / 安全响应头 / 平台识别。
import dns from 'node:dns/promises';
import { XMLParser } from 'fast-xml-parser';

// 必须带浏览器 UA：Shopify / Cloudflare 等会对无 UA 请求返回挑战页或 403，
// 导致 sitemap/robots 误判（曾把有 sitemap 的 Shopify 站误报为"无 sitemap"）。
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const H = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

async function head(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual', headers: H });
    return { status: r.status, headers: Object.fromEntries(r.headers), location: r.headers.get('location') };
  } catch (e) { return { status: 0, error: e.message }; }
}

async function fetchText(url) {
  try { const r = await fetch(url, { redirect: 'follow', headers: H }); return { status: r.status, text: await r.text(), url: r.url }; }
  catch (e) { return { status: 0, text: '', error: e.message }; }
}

async function resolveDns(host) {
  const out = { host };
  try { out.A = await dns.resolve4(host); } catch (e) { out.A_error = e.code || e.message; }
  try { out.CNAME = await dns.resolveCname(host); } catch {}
  return out;
}

function detectPlatform(html, headers) {
  const h = (html || '').toLowerCase();
  const s = JSON.stringify(headers || {}).toLowerCase();
  if (h.includes('cdn.shopify.com') || s.includes('shopify')) return 'Shopify';
  if (h.includes('wp-content/') || h.includes('wp-includes/')) return /woocommerce/.test(h) ? 'WordPress + WooCommerce' : 'WordPress';
  if (h.includes('wix.com') || s.includes('x-wix')) return 'Wix';
  if (h.includes('squarespace.com')) return 'Squarespace';
  if (h.includes('webflow.com') || s.includes('webflow')) return 'Webflow';
  if (h.includes('bigcommerce.com')) return 'BigCommerce';
  if (h.includes('magento')) return 'Magento';
  if (h.includes('cdn.shopifycdn') || h.includes('shopify-features')) return 'Shopify';
  if (s.includes('cloudflare')) return '自建（Cloudflare 加速）';
  return '未识别';
}

function detectAnalytics(html) {
  const h = (html || '').toLowerCase();
  return {
    googleAnalytics: /gtag\(|google-analytics|ga\.js|googletagmanager\.com\/gtag/.test(h),
    googleTagManager: /googletagmanager\.com\/gtm\.js/.test(h),
    googleSearchConsole: /google-site-verification/.test(h),
    facebookPixel: /connect\.facebook\.net|fbq\(/.test(h),
    metaPixel: /fbq\('init'/.test(h),
    bingWebmaster: /msvalidate\.01/.test(h),
    baiduAnalytics: /hm\.baidu\.com/.test(h),
  };
}

export async function siteChecks(startUrl) {
  const u = new URL(startUrl);
  const host = u.hostname;
  const apex = host.replace(/^www\./, '');
  const www = host.startsWith('www.') ? host : 'www.' + host;
  const protocol = u.protocol;

  const dnsApex = await resolveDns(apex);
  const dnsWww = await resolveDns(www);

  const httpApex = await head(`http://${apex}/`);
  const httpsApex = await head(`https://${apex}/`);

  // robots
  const robotsRes = await fetchText(`${protocol}//${host}/robots.txt`);
  const robotsText = robotsRes.text || '';
  const sitemaps = [];
  const robotsSitemapLines = robotsText.match(/^Sitemap:\s*(.+)$/gim) || [];
  robotsSitemapLines.forEach(l => sitemaps.push(l.replace(/^\s*Sitemap:\s*/i, '').trim()));
  if (!sitemaps.length) sitemaps.push(`${protocol}//${host}/sitemap.xml`);

  // sitemap parse
  const sitemapResults = [];
  const xml = new XMLParser({ ignoreAttributes: false });
  for (const sm of sitemaps) {
    const res = await fetchText(sm);
    let urlCount = 0, valid = false, isIndex = false;
    if (res.text && /<(urlset|sitemapindex)/i.test(res.text)) {
      valid = true;
      try {
        const parsed = xml.parse(res.text);
        if (parsed.urlset) urlCount = [].concat(parsed.urlset.url || []).length;
        else if (parsed.sitemapindex) { isIndex = true; urlCount = [].concat(parsed.sitemapindex.sitemap || []).length; }
      } catch {}
    }
    sitemapResults.push({ url: sm, status: res.status, valid, isIndex, urlCount });
  }

  // homepage 拿响应头 + HTML 用于平台识别
  const home = await fetchText(`${protocol}//${host}/`);
  const homeHeadersResp = await head(`${protocol}//${host}/`);
  const h = homeHeadersResp.headers || {};
  const securityHeaders = {
    'strict-transport-security': h['strict-transport-security'] || null,
    'content-security-policy': h['content-security-policy'] || null,
    'x-content-type-options': h['x-content-type-options'] || null,
    'x-frame-options': h['x-frame-options'] || null,
    'referrer-policy': h['referrer-policy'] || null,
    'permissions-policy': h['permissions-policy'] || null,
    'cache-control': h['cache-control'] || null,
    'content-encoding': h['content-encoding'] || null,
  };

  return {
    host, apex, www, protocol,
    dns: { apex: dnsApex, www: dnsWww },
    redirects: {
      apexHttpToHttps: (httpApex.headers || {}).location?.startsWith('https://') || false,
      apexToWww: (httpsApex.headers || {}).location?.includes(www) || false,
      httpApexStatus: httpApex.status,
      httpsApexStatus: httpsApex.status,
    },
    robots: {
      status: robotsRes.status,
      hasFile: robotsRes.status === 200 && /User-agent/i.test(robotsText),
      declaresSitemap: robotsSitemapLines.length > 0,
      content: robotsText.slice(0, 1000),
    },
    sitemaps: sitemapResults,
    securityHeaders,
    platform: detectPlatform(home.text, h),
    analytics: detectAnalytics(home.text),
  };
}
