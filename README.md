# 外贸独立站 SEO 体检工具

> 给新上线的跨境独立站做一次完整 SEO 体检——5 分钟拿到一份中文报告 + Excel,直接发给开发改。

**适用对象**:外贸工厂 / 跨境品牌 / 独立站运营。Shopify、WordPress、自建站都能跑。

**免费、开源、本地运行**。不上传你的站点数据,不收费,不需要账号。MIT 协议。

---

## 这个工具能告诉你什么

输入网址 → 5 分钟拿到一份中文体检报告,里面有:

- **整站问题清单**(P0–P3 分级):有没有 sitemap、apex 域名能不能解析、robots 写对没、安全响应头全不全、GA/GTM/Search Console 装了没……
- **逐页 Title / Meta 体检**:哪些页 title 重复、哪些过长、哪些根本就没写,Excel 一列看完。
- **图片缺 alt 清单**(外贸产品图缺 alt = 白丢图片流量)。
- **内链清单**:全站谁链到谁、锚文本是什么。
- **关键词聚类**:把内容相近的页面分组,一眼看出哪些页在抢同一个词(关键词内耗)。聚类主题取自**被引最多页面的 H1**,远比 TF-IDF 词更人类可读。
- **Fan-Out 候选 query + 覆盖度**:每页生成 60–80 条"你这页理应能被搜到"的查询,**每条标 ✓ / ✗ 表示页面正文是否已覆盖**——✗ 的就是你的待办清单,补内容就能涨流量。
- **建站平台识别**:Shopify / WooCommerce / Wix / Webflow / 自建,对应给出适配建议。
- **抓取行为合规**:默认遵守 robots.txt 的 `Disallow` 规则,优先从 sitemap.xml 取种子 URL——和搜索引擎看到的页面集对齐。

输出 3 个文件:

```
report/
├── 体检报告.html      ← 浏览器直接打开,可视化,带联系卡片
├── 体检数据.xlsx      ← 10 个页签,可分发给开发/运营
└── data.json          ← 原始数据,自己写脚本进一步分析
```

---

## 三步上手

```bash
# 1. 装依赖(只需一次)
git clone https://github.com/kevinwowo/waimao-seo-audit.git
cd waimao-seo-audit
npm install

# 2. 填上你的联系方式(报告底部会显示)
vi contact.json   # 或用任何编辑器

# 3. 跑体检
node bin/cli.js https://你的独立站.com
```

> 第 2 步:首次请 `cp contact.example.json contact.json` 再填写。`contact.json` 与你的 `qr-wechat.png` 都不会进仓库(已 gitignore)。

---

## 作为 Claude Code 插件 / Skill 使用

本仓库同时是一个 **Claude Code 插件(SEO audit pack)**,内含 `seo-audit` 技能与 `/seo-audit` 斜杠命令。装好后,直接对 Claude 说「帮我体检 https://某店.com」或 `/seo-audit https://某店.com`,它会自动跑整站审计并把 P0/P1 讲给你听。

```
# 在 Claude Code 里添加本仓库为插件市场,然后安装 waimao-seo-audit
/plugin marketplace add kevinwowo/waimao-seo-audit
/plugin install waimao-seo-audit
```

结构:
```
.claude-plugin/plugin.json   插件清单
skills/seo-audit/SKILL.md     技能(何时用 + 如何跑 + 如何解读)
commands/seo-audit.md         /seo-audit 斜杠命令
bin/ · src/                   实际引擎
```

---

## 生成可部署的引流站(落地页 + 示例报告)

除了单份报告,工具还能一键生成一个**可部署的静态营销站**——落地页 + 一份示例报告,全部带你的品牌与微信二维码,拖到 Netlify / Vercel / GitHub Pages 即可上线引流:

```bash
# 先跑一份体检,拿到 data.json 当示例报告
node bin/cli.js https://某个店.com --render --out ./demo

# 生成静态站到 ./site/(落地页 index.html + 示例报告)
node bin/build-site.js --sample ./demo/data.json --repo https://github.com/你/仓库
```

产物:
```
site/
├── index.html           ← 落地页(hero 输入网址 → 预填邮件/扫码找你)
└── report-sample.html   ← 示例报告(带你的品牌 + 二维码)
```

落地页是**零后端**的:访客输入网址点"开始体检",会滚到留资区、预填一封发给你的邮件(带他的网址),并展示你的微信二维码。真正的体检由你用 CLI 跑、把报告发回——这正是免费引流的闭环。

如果你的站是 SPA(React / Vue / 客户端渲染),加 `--render`:

```bash
node bin/cli.js https://你的独立站.com --render --max-pages 80
```

跑完后打开 `report/体检报告.html` 即可。完整使用步骤见 [使用指南.md](使用指南.md)。

---

## 为什么需要它(对比 Lighthouse)

Lighthouse 给你的 SEO 是逐页打分,只看"这一页标签齐不齐"。它**看不到**:

- 50 个产品页的 title 都是同一个;
- sitemap 根本不存在;
- 你那个 SPA 服务器返回的就是空 HTML 壳;
- 哪几个页在抢同一个关键词;
- 你这页本来该被搜到的那 60 个长尾词。

这个工具补的就是这块。Lighthouse 是显微镜,这个是 CT 扫描。

---

## 联系作者

Kevin Fan wechat:kevinfanwaterloo

from 深圳拓海启航科技

---

## 协议

MIT — 见 [LICENSE](LICENSE)。
