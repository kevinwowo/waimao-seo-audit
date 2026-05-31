// 生成可部署的静态落地页（v2 编辑风格，contact.json 驱动品牌与配色）。
// 零后端留资：hero 输入网址 → 提交后滚到「开始体检」区，预填 mailto + 展示微信二维码。
import fs from 'node:fs/promises';
import { qrInner } from './qr.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function buildLanding({ outPath, contact, sampleReportHref = 'report-sample.html', repoUrl = '#' }) {
  const PRIMARY = contact.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(contact.primaryColor) ? contact.primaryColor : '#1F4E78';
  const ACCENT = contact.accentColor && /^#[0-9A-Fa-f]{6}$/.test(contact.accentColor) ? contact.accentColor : '#D9550B';
  const css = await fs.readFile(new URL('./report-theme.css', import.meta.url), 'utf8');
  const qr = await qrInner(contact, PRIMARY);
  const brand = esc(contact.brand);
  const wechat = esc(contact.wechat || '');
  const email = contact.email && !/^\[/.test(contact.email) ? contact.email : '';
  const mailHref = email ? `mailto:${email}?subject=${encodeURIComponent('免费 SEO 体检申请')}&body=${encodeURIComponent('请帮我体检这个站：\n')}` : '#start';

  const html = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SEOcheck · 体检 — 为外贸独立站做一次认真的 SEO 体检</title>
<meta name="description" content="免费、开源的外贸独立站整站级 SEO 体检：问题分级、关键词内耗、Fan-Out 候选 query、白标分享。5 分钟一份可直接交付给客户的报告。" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;500;600;700;900&family=Noto+Sans+SC:wght@300;400;500;600&family=Inter:wght@300;400;500;600;700&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
${css}
:root{ --ink-2:${PRIMARY}; --ember:${ACCENT}; }
.start-sec{ max-width:1240px; margin:0 auto; padding:120px 32px 40px; }
.start-card{ display:flex; gap:40px; background:var(--card); border:1px solid var(--rule-2); border-radius:12px; padding:40px; align-items:center; flex-wrap:wrap; box-shadow:var(--sh-2); }
.start-card__l{ flex:1; min-width:300px; }
.start-card h3{ font-family:var(--f-serif); font-weight:400; font-size:30px; margin:0 0 10px; }
.start-card h3 em{ font-style:normal; color:var(--ember); }
.start-card p{ font-size:14px; color:var(--ink-mute); line-height:1.7; max-width:520px; }
.start-card__url{ font-family:var(--f-mono); font-size:14px; background:var(--paper-2); border-radius:6px; padding:10px 14px; margin:14px 0; display:inline-block; color:var(--ink); }
.start-card__btns{ display:flex; gap:12px; flex-wrap:wrap; margin-top:8px; }
.start-card__r{ text-align:center; }
.start-card__r .qr-card{ width:180px; height:180px; }
.start-card__r .qrhint{ font-family:var(--f-mono); font-size:11px; color:var(--muted); margin-top:10px; }
.land-cta h2 em{ color:var(--ember); font-style:normal; }
@media(max-width:760px){ .land-hero h1{ font-size:44px!important; } .features{ grid-template-columns:1fr 1fr!important; } .compare{ grid-template-columns:1fr!important; } .personas{ grid-template-columns:1fr!important; } .land-cta__inner,.land-foot__inner{ grid-template-columns:1fr!important; gap:32px!important; } .mini-report{ grid-template-columns:1fr!important; } .start-card{ flex-direction:column; } }
</style></head>
<body>
<div class="land">

  <nav class="land-nav">
    <div class="brand"><span class="brand__mark serif">体</span><span class="brand__name">SEOcheck <em>· 体检</em></span></div>
    <div class="land-nav__links">
      <a href="#features">能力</a>
      <a href="${esc(sampleReportHref)}">报告示例</a>
      <a href="#personas">为顾问而生</a>
      <a href="${esc(repoUrl)}" target="_blank" rel="noopener">开源</a>
    </div>
    <div class="land-nav__cta">
      ${wechat ? `<span style="font-size:13px;color:var(--ink-mute);">微信 ${wechat}</span>` : ''}
      <button class="btn btn--primary btn--sm" onclick="goStart()">免费体检</button>
    </div>
  </nav>

  <section class="land-hero">
    <div class="wrap">
      <span class="land-hero__eyebrow"><span class="star"></span> 开源 · 整站级 SEO 体检 · 永久免费</span>
      <h1>为外贸独立站<br/>做一次 <em>认真的</em><br/><span class="stroke">SEO 体检。</span></h1>
      <p class="land-hero__sub">5 分钟一份可直接交付给客户的<em>整站级</em>审计报告 — 涵盖问题分级、关键词内耗、Fan-Out 候选 query 与白标分享。</p>
      <div class="url-bar">
        <span class="url-bar__protocol">https://</span>
        <input id="auditUrl" type="text" placeholder="your-store.com" />
        <button class="btn btn--accent btn--lg" onclick="goStart()">开始体检 <span class="btn__arrow">→</span></button>
      </div>
      <div class="trust-row">
        <span><span class="tick">✓</span> 永久免费 · 无需注册</span>
        <span><span class="tick">✓</span> 整站抓取 · 非单页</span>
        <span><span class="tick">✓</span> 支持 SPA / 静态站 / Shopify</span>
        <span><span class="tick">✓</span> 开源 CLI 可自托管</span>
      </div>
    </div>
  </section>

  <div class="preview-wrap">
    <div class="preview-frame">
      <div class="preview-frame__chrome">
        <div class="preview-frame__dots"><i></i><i></i><i></i></div>
        <div class="preview-frame__url">${brand} · 体检报告</div>
        <div style="font-family:var(--f-mono);font-size:11px;color:var(--muted);">SEO 体检</div>
      </div>
      <div class="mini-report">
        <aside class="mr-nav">
          <div class="mr-nav__h">报告目录</div>
          <div class="mr-nav__item is-active">问题清单 <small>86</small></div>
          <div class="mr-nav__item">站点级 <small>9</small></div>
          <div class="mr-nav__item">逐页详情 <small>47</small></div>
          <div class="mr-nav__item">关键词聚类 <small>9</small></div>
          <div class="mr-nav__item">Fan-Out queries <small>2,341</small></div>
          <div class="mr-nav__item" style="border-bottom:0;">联系顾问 <small>↗</small></div>
        </aside>
        <div class="mr-body">
          <div class="mr-body__head"><h3>问题清单 <small>Issues, sorted by severity</small></h3><span class="badge">P0 / P1 / P2 / P3</span></div>
          <div class="mr-kpi">
            <div><div class="mr-kpi__label">页面</div><div class="mr-kpi__value">47</div></div>
            <div><div class="mr-kpi__label">问题</div><div class="mr-kpi__value">86</div></div>
            <div><div class="mr-kpi__label">P0 阻断</div><div class="mr-kpi__value"><em>3</em></div></div>
            <div><div class="mr-kpi__label">关键词聚类</div><div class="mr-kpi__value">9</div></div>
            <div><div class="mr-kpi__label">Fan-Out</div><div class="mr-kpi__value">2,341</div></div>
          </div>
          <ul class="mr-problems">
            <li><span class="badge badge--p0">P0</span><span style="font-size:14px;">没有有效的 <span class="mono" style="font-size:13px;">sitemap.xml</span></span><span class="mono" style="font-size:11px;color:var(--muted);">站点级 · 影响 47/47</span></li>
            <li><span class="badge badge--p0">P0</span><span style="font-size:14px;">主域无法解析（仅 www 可访问）</span><span class="mono" style="font-size:11px;color:var(--muted);">DNS · 全站</span></li>
            <li><span class="badge badge--p1">P1</span><span style="font-size:14px;">Title 在 <b>47</b> 个页面上重复</span><span class="mono" style="font-size:11px;color:var(--muted);">逐页 · 47 页</span></li>
            <li><span class="badge badge--p1">P1</span><span style="font-size:14px;">22 张产品图缺 <span class="mono" style="font-size:13px;">alt</span> 属性</span><span class="mono" style="font-size:11px;color:var(--muted);">逐页 · 22 张</span></li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <section class="land-section wrap" id="features">
    <header class="land-section__head">
      <div><div class="eyebrow">Volume 02 <span class="dash">—</span> 它能给你什么</div><h2>四种<br/>可<em>直接交付</em>的<br/>视角。</h2></div>
      <p class="copy">独立站的 SEO 问题，从来不只在某个页面里。它在 robots、在 sitemap、在跨页 title 雷同、在你没意识到的关键词内耗、还在你尚未覆盖的搜索意图里。把这些收纳在一份可直接发给客户的报告里。</p>
    </header>
    <div class="features">
      <article class="feature"><div class="feature__num">01.</div><h3>整站问题清单</h3><p>从 P0 阻断（sitemap 缺失 / SPA 空壳）到 P3 建议，逐条配修复建议、影响范围与受影响页面。</p><div class="feature__meta"><span>SEVERITY</span><b>P0 / P1 / P2 / P3</b></div></article>
      <article class="feature"><div class="feature__num">02.</div><h3>关键词聚类</h3><p>TF-IDF 计算每页主题向量，自动归类。让你看见哪几个产品页在抢同一个词（内耗）。</p><div class="feature__meta"><span>METHOD</span><b>TF-IDF · cosine</b></div></article>
      <article class="feature"><div class="feature__num">03.</div><h3>Fan-Out 候选</h3><p>从一个产品名生成 60+ 待发掘的搜索 query — 信息、商业、对比、长尾全覆盖，标注哪些站内尚未对应。</p><div class="feature__meta"><span>BUCKETS</span><b>×6</b></div></article>
      <article class="feature"><div class="feature__num">04.</div><h3>白标分享</h3><p>把你的 logo、微信、联系方式嵌入报告，客户打开像看你出品的报告 — 而非平台。</p><div class="feature__meta"><span>BRANDED</span><b>报告 = 名片</b></div></article>
    </div>
    <div class="compare">
      <div class="compare__col"><div class="sub">Lighthouse / PageSpeed</div><h4>页面级体检</h4><ul>
        <li>测量单个 URL 的性能、可访问性等浏览器侧指标</li>
        <li>不抓取整站、不识别跨页 SEO 模式</li>
        <li>无法发现 title 重复、关键词内耗、平台识别问题</li>
        <li>报告不可白标、不可作为商务交付物</li>
      </ul></div>
      <div class="compare__col compare__col--us"><div class="sub">SEOcheck · 体检 / 我们补的是</div><h4>整站级 + 跨页诊断</h4><ul>
        <li><b>抓取整站</b>：robots / sitemap / DNS / 平台识别 / 安全头</li>
        <li><b>跨页发现</b>：title 重复、薄内容、内链断裂、SPA 空壳</li>
        <li><b>语义层</b>：TF-IDF 聚类 + Fan-Out query 未覆盖标记</li>
        <li><b>商业层</b>：白标分享 + 联系卡片 = SEO 顾问的获客钩子</li>
      </ul></div>
    </div>
  </section>

  <section class="land-section wrap" id="personas">
    <header class="land-section__head">
      <div><div class="eyebrow">Volume 03 <span class="dash">—</span> 谁在用</div><h2>三类<br/>典型<em>使用者</em>。</h2></div>
      <p class="copy">如果你的工作里包含“向客户解释他的站为什么没流量”，这份报告就是你的素材库。每个能力都按真实场景做过校准。</p>
    </header>
    <div class="personas">
      <article class="persona"><div class="persona__role"><span class="num">i.</span> SEO 顾问 / 个人代运营</div><h4>「我每周给 3–5 个外贸客户跑诊断。」</h4><p class="persona__line">把免费体检报告当作首次合作的钩子，转付费方案。</p><ul><li>白标分享：logo + 微信卡片嵌入报告底部</li><li>批量复跑：客户上线新页面后回归</li><li>导出 Excel，提案直接附上</li></ul></article>
      <article class="persona"><div class="persona__role"><span class="num">ii.</span> 跨境品牌 SEO 负责人</div><h4>「我每月监控自家站的健康度。」</h4><p class="persona__line">看趋势而非单点。</p><ul><li>定期重跑并对比</li><li>研发与内容运营共享同一份报告</li><li>Fan-Out 提供下一季度内容选题</li></ul></article>
      <article class="persona"><div class="persona__role"><span class="num">iii.</span> 跨境代运营 / Agency</div><h4>「我同时管理 20+ 客户站。」</h4><p class="persona__line">需要可白标的客户交付物。</p><ul><li>每个客户站一份独立报告</li><li>统一品牌色与联系卡片</li><li>开源可自托管，数据不出本机</li></ul></article>
    </div>
  </section>

  <section class="start-sec" id="start">
    <div class="start-card">
      <div class="start-card__l">
        <div class="eyebrow">Volume 04 <span class="dash">—</span> 开始</div>
        <h3>把网址发给我，<em>免费</em>帮你跑一份。</h3>
        <p>工具永久免费、开源、无需注册。你可以下载开源 CLI 自己跑，或把网址发给顾问，我用工具跑好、把可交付的报告发回给你，并免费聊 20 分钟优先级修复方案。</p>
        <div class="start-card__url" id="echoUrl" style="display:none;"></div>
        <div class="start-card__btns">
          <a class="btn btn--accent btn--lg" id="mailBtn" href="${esc(mailHref)}">发邮件免费体检 →</a>
          <a class="btn btn--ghost btn--lg" href="${esc(repoUrl)}" target="_blank" rel="noopener">下载开源版自己跑</a>
        </div>
      </div>
      <div class="start-card__r">
        ${qr.hasQr ? `<div class="qr-card">${qr.html}</div><div class="qrhint">微信扫码 · <b>免费诊断</b></div>` : `<div class="qr-card" style="display:grid;place-items:center;color:var(--muted);font-family:var(--f-mono);font-size:12px;text-align:center;padding:20px;">在 contact.json<br/>填 qrImage<br/>用你的微信二维码</div>`}
      </div>
    </div>
  </section>

  <section class="land-cta">
    <div class="land-cta__inner">
      <div><div class="eyebrow" style="color:rgba(250,250,246,.5);margin-bottom:20px;">永久免费</div><h2>跑一份报告，<br/>让顾问帮你<em>落地</em>。</h2></div>
      <div><p>工具永久免费、开源、无需注册。需要有人把这些问题改完上线？扫码找 ${brand}。</p><button class="btn btn--accent" onclick="goStart()">开始体检 →</button></div>
    </div>
  </section>

  <footer class="land-foot">
    <div class="land-foot__inner">
      <div class="land-foot__brand">
        <div class="brand"><span class="brand__mark serif">体</span><span class="brand__name" style="color:var(--paper);">SEOcheck <em style="color:rgba(250,250,246,.5);">· 体检</em></span></div>
        <p>为外贸独立站做一次认真的 SEO 体检。开源 CLI，由 ${brand} 出品与维护。</p>
      </div>
      <div><h5>产品</h5><ul><li><a href="#start">免费体检</a></li><li><a href="${esc(sampleReportHref)}">报告示例</a></li><li><a href="${esc(repoUrl)}" target="_blank" rel="noopener">开源自托管</a></li></ul></div>
      <div><h5>能力</h5><ul><li><a href="#features">整站问题清单</a></li><li><a href="#features">关键词聚类</a></li><li><a href="#features">Fan-Out 候选</a></li></ul></div>
      <div><h5>联系</h5><ul>${wechat ? `<li>微信 · ${wechat}</li>` : ''}${email ? `<li><a href="mailto:${esc(email)}">邮箱 · ${esc(email)}</a></li>` : ''}${contact.website && !/^\[/.test(contact.website) ? `<li><a href="${esc(contact.website)}" target="_blank" rel="noopener">${esc(contact.website)}</a></li>` : ''}</ul></div>
    </div>
    <div class="land-foot__copy"><span>© 2026 SEOcheck · ${brand} 出品</span><span>开源 · 永久免费 · MIT</span></div>
  </footer>

</div>
<script>
  function goStart(){
    var u = (document.getElementById('auditUrl')||{}).value || '';
    u = u.trim().replace(/^https?:\\/\\//,'');
    var echo = document.getElementById('echoUrl');
    var mail = document.getElementById('mailBtn');
    if(u){
      if(echo){ echo.style.display='inline-block'; echo.textContent = '待体检：https://' + u; }
      if(mail && mail.href.indexOf('mailto:')===0){
        mail.href = '${email ? `mailto:${email}?subject=` : '#'}' + encodeURIComponent('免费 SEO 体检申请') + '&body=' + encodeURIComponent('请帮我体检这个站：https://' + u + '\\n');
      }
    }
    document.getElementById('start').scrollIntoView({behavior:'smooth'});
  }
</script>
</body></html>`;

  await fs.writeFile(outPath, html, 'utf8');
  return outPath;
}
