/**
 * seo.controller.js (fixed)
 * 目标：让 Google Search Console 能稳定抓取 sitemap（包含 .xml 与 .xml.gz 两种格式）
 *
 * 关键修复：
 * 1) 不再给 sitemap 响应加 X-Robots-Tag: noindex（原文件会加，可能引起抓取/解析异常）
 * 2) 同时支持 /sitemap*.xml 以及 /sitemap*.xml.gz（你可以改 index 里用 .xml，老的 .gz 也兼容）
 * 3) 更严格的分片参数校验，避免 params 被路由吞掉导致 shard 解析异常
 * 4) 响应头更标准：Vary: Accept-Encoding，Content-Type 保持 XML
 *
 * 路由建议（Express）：
 *   router.get('/robots.txt', seo.robots);
 *   router.get(['/sitemap.xml', '/sitemap.xml.gz'], seo.sitemapIndex);
 *   router.get(['/sitemap-javs-:shard(\\d+)\\.xml', '/sitemap-javs-:shard(\\d+)\\.xml\\.gz'], seo.sitemapJavsShard);
 *   router.get(['/sitemap-tag.xml', '/sitemap-tag.xml.gz'], seo.sitemapTag);
 *   router.get(['/sitemap-cat.xml', '/sitemap-cat.xml.gz'], seo.sitemapCat);
 */

const zlib = require('zlib');
const Jav = require('../models/Jav'); // TODO：改成你真实路径

const SITEMAP_PAGE_SIZE = Number(process.env.SITEMAP_PAGE_SIZE || 20000);
const SITEMAP_TTL_MS = Number(process.env.SITEMAP_TTL_MS || 10 * 60 * 1000);

// ------------------------------
// helpers: fixed categories + existence check
// ------------------------------
function parseJsonArray(v) {
  if (!v) return null;
  try {
    const arr = JSON.parse(v);
    return Array.isArray(arr) ? arr : null;
  } catch (e) {
    return null;
  }
}

const DEFAULT_FIXED_CATS = [
  "今日吃瓜",
  "每日大瓜",
  "热门大瓜",
  "必看大瓜",
  "网红黑料",
  "学生校园",
  "明星黑料",
  "领导干部",
  "海外吃瓜",
  "内涵段子",
  "人人吃瓜",
  "吃瓜新闻",
  "看片娱乐",
];

// 通过环境变量固定分类（可选）
// 例：CAT_FIXED='["今日吃瓜","每日大瓜"]'
function getFixedCats() {
  // 如果显式设置了 CAT_FIXED（即使是 []），优先使用它
  if (Object.prototype.hasOwnProperty.call(process.env, 'CAT_FIXED')) {
    const arr = parseJsonArray(process.env.CAT_FIXED);
    if (!arr) return null;
    return arr
      .filter((x) => typeof x === 'string' && x.trim() !== '')
      .map((x) => x.trim());
  }

  // 否则使用代码内默认固定分类（你也可以直接改这里）
  return DEFAULT_FIXED_CATS.slice();
}

async function hasCatData(site, catField) {
  const fixed = getFixedCats();
  if (fixed) return fixed.length > 0;

  // 轻量判断：是否存在任何一条带 catField 的数据（无需 distinct）
  // 注意：catField 可能是 string / array，只要存在且非 null 即认为有分类
  const exists = await Jav.exists({ disable: { $ne: 1 }, [catField]: { $exists: true, $ne: null } });
  return !!exists;
}

const cache = new Map();
async function cached(key, ttl, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) return hit.val;
  const val = await fn();
  cache.set(key, { val, exp: now + ttl });
  return val;
}

function getSiteUrl(req) {
  const fixed = process.env.SITE_URL;
  if (fixed) return fixed.replace(/\/+$/, '');

  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https')
    .split(',')[0]
    .trim();

  const host = (req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(',')[0]
    .trim();

  return `${proto}://${host}`.replace(/\/+$/, '');
}

function ymd(d) {
  const dt = d ? new Date(d) : new Date();
  return isNaN(dt.getTime()) ? new Date().toISOString().slice(0, 10) : dt.toISOString().slice(0, 10);
}

function gzipBuf(xml) {
  return zlib.gzipSync(Buffer.from(xml), { level: 6 });
}

function wantsGzip(req) {
  // 1) 明确走 .gz 结尾
  if ((req.path || '').toLowerCase().endsWith('.gz')) return true;
  // 2) 也可以用 ?gz=1 强制
  if (String(req.query.gz || '') === '1') return true;
  return false;
}

function setXmlHeaders(res, isGz) {
  // sitemap 本质是 XML
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=600, s-maxage=600');
  res.set('Vary', 'Accept-Encoding');

  if (isGz) {
    res.set('Content-Encoding', 'gzip');
  } else {
    res.removeHeader('Content-Encoding');
  }
}

function sendXml(res, xml, isGz) {
  setXmlHeaders(res, isGz);
  if (isGz) return res.send(gzipBuf(xml));
  return res.send(xml);
}

// robots.txt
exports.robots = async (req, res) => {
  const site = getSiteUrl(req);
  res.type('text/plain; charset=utf-8');
  res.send(`User-agent: *
Allow: /

Sitemap: ${site}/sitemap.xml
`);
};

// ✅ sitemap index：同时支持 /sitemap.xml 与 /sitemap.xml.gz（由请求决定是否 gzip）
exports.sitemapIndex = async (req, res) => {
  const site = getSiteUrl(req);
  const key = `smi:${site}`;
  const isGz = wantsGzip(req);

  const xml = await cached(key, SITEMAP_TTL_MS, async () => {
    const total = await Jav.countDocuments({ disable: { $ne: 1 } });
    const pages = Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE));
    const now = new Date().toISOString();

    // ✅ 建议在 index 里用 .xml（最稳），但 .xml.gz 也兼容（Google 支持）
    const shardLoc = (i) => `${site}/sitemap-javs-${i}.xml`;
    const tagLoc = `${site}/sitemap-tag.xml`;
    const catLoc = `${site}/sitemap-cat.xml`;
    const catField = process.env.CAT_FIELD || 'cat';
    const includeCat = await hasCatData(site, catField);

    let items = '';
    for (let i = 1; i <= pages; i++) {
      items += `<sitemap><loc>${shardLoc(i)}</loc><lastmod>${now}</lastmod></sitemap>`;
    }
    items += `<sitemap><loc>${tagLoc}</loc><lastmod>${now}</lastmod></sitemap>`;
    if (includeCat) items += `<sitemap><loc>${catLoc}</loc><lastmod>${now}</lastmod></sitemap>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`;
  });

  return sendXml(res, xml, isGz);
};

// ✅ javs 分片：/sitemap-javs-1.xml 或 /sitemap-javs-1.xml.gz
exports.sitemapJavsShard = async (req, res) => {
  const site = getSiteUrl(req);
  const isGz = wantsGzip(req);

  // 强制数字分片（路由没加正则时也能兜底）
  const shardRaw = String(req.params.shard || '1');
  const shard = Math.max(1, parseInt(shardRaw.replace(/\D+/g, '') || '1', 10));

  const key = `smj:${site}:${shard}`;

  const xml = await cached(key, SITEMAP_TTL_MS, async () => {
    const total = await Jav.countDocuments({ disable: { $ne: 1 } });
    const pages = Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE));
    if (shard > pages) return null;

    const skip = (shard - 1) * SITEMAP_PAGE_SIZE;

    const docs = await Jav.find({ disable: { $ne: 1 } })
      .sort({ updatedAt: -1, date: -1, _id: -1 })
      .skip(skip)
      .limit(SITEMAP_PAGE_SIZE)
      .select({ _id: 1, updatedAt: 1, date: 1 })
      .lean();

    const urls = docs
      .map((d) => {
        const lastmod = ymd(d.updatedAt || d.date);
        return `<url><loc>${site}/javs/${d._id}.html</loc><lastmod>${lastmod}</lastmod></url>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  });

  if (!xml) return res.status(404).send('not found');
  return sendXml(res, xml, isGz);
};

// ✅ tag sitemap：/sitemap-tag.xml 或 /sitemap-tag.xml.gz
exports.sitemapTag = async (req, res) => {
  const site = getSiteUrl(req);
  const isGz = wantsGzip(req);
  const key = `smt:${site}`;

  const xml = await cached(key, SITEMAP_TTL_MS, async () => {
    const agg = await Jav.aggregate([
      { $match: { disable: { $ne: 1 }, tag: { $exists: true, $ne: null } } },
      { $project: { tag: 1, u: { $ifNull: ['$updatedAt', '$date'] } } },
      { $project: { tags: { $cond: [{ $isArray: '$tag' }, '$tag', ['$tag']] }, u: 1 } },
      { $unwind: '$tags' },
      { $match: { tags: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$tags', last: { $max: '$u' }, cnt: { $sum: 1 } } },
      { $match: { cnt: { $gte: 1 } } },
      { $sort: { last: -1 } },
      { $limit: 50000 },
    ]);

    const urls = agg
      .map((t) => {
        const name = encodeURIComponent(String(t._id));
        return `<url><loc>${site}/tag/${name}/</loc><lastmod>${ymd(t.last)}</lastmod></url>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  });

  return sendXml(res, xml, isGz);
};

exports.sitemapCat = async (req, res) => {
  const site = process.env.SITE_URL || `https://${req.hostname}`;

  const cats = [
    "今日吃瓜",
    "每日大瓜",
    "热门大瓜",
    "必看大瓜",
    "网红黑料",
    "学生校园",
    "明星黑料",
    "领导干部",
    "海外吃瓜",
    "内涵段子",
    "人人吃瓜",
    "吃瓜新闻",
    "看片娱乐"
  ];

  // 如果你哪天想“不输出分类 sitemap”
  if (!cats.length) {
    return res.status(404).end();
  }

  const urls = cats.map(name => {
    const enc = encodeURIComponent(name);
    return `
      <url>
        <loc>${site}/cat/${enc}/</loc>
        <changefreq>daily</changefreq>
        <priority>0.8</priority>
      </url>
    `;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
};
