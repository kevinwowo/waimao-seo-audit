// Extract per-page SEO signals from fetched HTML.
import * as cheerio from 'cheerio';

// 页面类型识别：先看 JSON-LD @type（最可靠），再退到 URL 规则。
// 取值：home | product | collection | blog | legal | other
function classifyPageType(pathname, jsonldTypes) {
  const types = (jsonldTypes || []).map(t => String(t).toLowerCase());
  if (types.some(t => /product/.test(t))) return 'product';
  if (types.some(t => /(blogposting|article|newsarticle)/.test(t))) return 'blog';
  if (types.some(t => /(collectionpage|itemlist|offercatalog)/.test(t))) return 'collection';
  const p = (pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  if (p === '/') return 'home';
  if (/^\/(products?|item|p|goods)(\/|$)/.test(p)) return 'product';
  if (/^\/(collections?|category|categories|shop|catalog)(\/|$)/.test(p)) return 'collection';
  if (/^\/(blogs?|news|articles?|posts?|stories)(\/|$)/.test(p)) return 'blog';
  if (/(about|contact|privacy|terms|policy|policies|faq|shipping|returns?|refund|legal|tos|impressum|agreement)/.test(p)) return 'legal';
  return 'other';
}

function extractJsonldTypes($) {
  const out = [];
  $('script[type="application/ld+json"]').each((_, e) => {
    let raw = $(e).contents().text() || $(e).text() || '';
    try {
      const data = JSON.parse(raw);
      const collect = (o) => {
        if (!o) return;
        if (Array.isArray(o)) return o.forEach(collect);
        if (typeof o === 'object') {
          if (o['@type']) [].concat(o['@type']).forEach(t => out.push(String(t)));
          if (o['@graph']) collect(o['@graph']);
        }
      };
      collect(data);
    } catch { /* malformed JSON-LD ignored */ }
  });
  return [...new Set(out)];
}

export function extractPage(raw) {
  const $ = cheerio.load(raw.html || '');
  const url = new URL(raw.url);
  const host = url.hostname;

  const titles = $('title').map((_, e) => $(e).text().trim()).get();
  const metaDescs = $('meta[name="description"]').map((_, e) => $(e).attr('content') || '').get();
  const canonical = $('link[rel="canonical"]').attr('href') || null;
  const og = {};
  $('meta[property^="og:"]').each((_, e) => { og[$(e).attr('property')] = $(e).attr('content') || ''; });
  const tw = {};
  $('meta[name^="twitter:"]').each((_, e) => { tw[$(e).attr('name')] = $(e).attr('content') || ''; });
  const jsonld = $('script[type="application/ld+json"]').length;
  const jsonldTypes = extractJsonldTypes($);
  const lang = $('html').attr('lang') || null;
  const hreflang = $('link[rel="alternate"][hreflang]').map((_, e) => $(e).attr('hreflang')).get();
  const robots = $('meta[name="robots"]').attr('content') || null;

  const h1 = $('h1').map((_, e) => $(e).text().trim()).get().filter(Boolean);
  const h2 = $('h2').map((_, e) => $(e).text().trim()).get().filter(Boolean);
  const h3 = $('h3').map((_, e) => $(e).text().trim()).get().filter(Boolean);

  $('script, style, noscript').remove();
  // Insert a space at block/text boundaries so adjacent element text doesn't concatenate.
  $('br,p,div,li,h1,h2,h3,h4,h5,h6,td,th,section,article,header,footer,nav,span,a,button,label,option,figcaption').each((_, el) => $(el).append(' '));
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = text ? text.split(' ').length : 0;

  const imgs = $('img').map((_, e) => ({ src: $(e).attr('src') || '', alt: $(e).attr('alt') })).get();
  const imgNoAlt = imgs.filter(i => i.alt == null || i.alt === '').length;

  const internal = [], external = [];
  for (const l of raw.links) {
    try {
      const u = new URL(l.href);
      const ent = { href: u.pathname + (u.search || ''), anchor: l.text, rel: l.rel, fullUrl: l.href };
      if (u.hostname === host) internal.push(ent);
      else external.push({ ...ent, hostname: u.hostname });
    } catch {}
  }

  // Body without nav/footer chrome (best-effort)
  const main = $('main, article, [role="main"]').first();
  const mainText = (main.length ? main.text() : text).replace(/\s+/g, ' ').trim();

  return {
    url: raw.url,
    status: raw.status,
    requested: raw.requested,
    error: raw.error || null,
    headers: raw.headers,
    title: titles[0] || '',
    titleAll: titles,
    titleLength: (titles[0] || '').length,
    metaDescription: metaDescs[0] || '',
    metaDescriptionAll: metaDescs,
    metaDescriptionLength: (metaDescs[0] || '').length,
    metaDescDuplicateTags: metaDescs.length,
    canonical,
    og, twitter: tw, jsonldCount: jsonld, jsonldTypes,
    pageType: classifyPageType(url.pathname, jsonldTypes),
    lang, hreflang, robots,
    h1, h2, h3,
    h1Count: h1.length,
    wordCount,
    imgCount: imgs.length,
    imgNoAlt,
    internalLinks: internal,
    externalLinks: external,
    internalLinkCount: internal.length,
    externalLinkCount: external.length,
    text, mainText,
  };
}
