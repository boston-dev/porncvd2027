/**
 * seo.controller.js (DMCA-hardened + SEO-balanced)
 *
 * 目标：
 * - 避免 sitemap 暴露全量详情页清单（版权方脚本最爱）
 * - 仍然给 Google 足够的“发现入口”：分类/Top标签 + 最近更新 + 随机子集
 *
 * 默认策略（推荐）：
 * - /sitemap.xml 仅包含 3 个 sitemap：
 *    1) /sitemap-javs.xml   (最近更新 RECENT + 随机 RANDOM，总数 TOTAL)
 *    2) /sitemap-tag.xml    (Top 标签 TOP_N)
 *    3) /sitemap-cat.xml
 * - 旧版 /sitemap-javs-:shard.xml 默认关闭（ALLOW_SHARDED_SITEMAP=0）
 *
 * 路由建议（Express）：
 *   router.get('/robots.txt', seo.robots);
 *   router.get(['/sitemap.xml', '/sitemap.xml.gz'], seo.sitemapIndex);
 *   router.get(['/sitemap-javs.xml', '/sitemap-javs.xml.gz'], seo.sitemapJavsMix);
 *   router.get(['/sitemap-tag.xml', '/sitemap-tag.xml.gz'], seo.sitemapTagTop);
 *   router.get(['/sitemap-cat.xml', '/sitemap-cat.xml.gz'], seo.sitemapCat);
 *   // 旧接口（默认关闭）
 *   router.get(['/sitemap-javs-:shard(\\d+)\\.xml', '/sitemap-javs-:shard(\\d+)\\.xml\\.gz'], seo.sitemapJavsShard);
 */

const zlib = require('zlib');
const Jav = require('../models/Jav');
const ESSENCE = require('./tags_top200.json'); 
const ENTRY_TAGS = new Set(ESSENCE.map(x => x.tag));
const navs = require('../nav.json');
let genreNav = require('../genreNav.json');
genreNav = genreNav.map((v) => `/cat/${encodeURIComponent(v)}/`);

// =======================
// 可配置参数（环境变量）
// =======================
const SITEMAP_TTL_MS = Number(process.env.SITEMAP_TTL_MS || 10 * 60 * 1000);

// 详情 sitemap：混合策略（推荐）
const SITEMAP_JAVS_TOTAL = Number(process.env.SITEMAP_JAVS_TOTAL || 5000);
const SITEMAP_JAVS_RECENT = Number(process.env.SITEMAP_JAVS_RECENT || 2000);
const SITEMAP_JAVS_RANDOM = Number(process.env.SITEMAP_JAVS_RANDOM || (SITEMAP_JAVS_TOTAL - SITEMAP_JAVS_RECENT));

// 详情/标签 sitemap 的缓存（建议 1 天：86400000）
const SITEMAP_JAVS_TTL_MS = Number(process.env.SITEMAP_JAVS_TTL_MS || 24 * 60 * 60 * 1000);
const SITEMAP_TAG_TTL_MS = Number(process.env.SITEMAP_TAG_TTL_MS || 24 * 60 * 60 * 1000);

// tag sitemap：只输出 Top 标签（按出现次数 cnt 排序）
const SITEMAP_TAG_TOP = Number(process.env.SITEMAP_TAG_TOP || 5000);

// 是否允许旧版 shard（强烈建议默认 0）
const ALLOW_SHARDED_SITEMAP = String(process.env.ALLOW_SHARDED_SITEMAP || '0') === '1';
const MAX_SHARDS = Number(process.env.SITEMAP_MAX_SHARDS || 3);
const SHARD_SIZE = Number(process.env.SITEMAP_SHARD_SIZE || 5000); // 即使开启 shard，也限制每片只返回随机 N

// =======================
// 简单内存缓存
// =======================
const cache = new Map();
async function cached(key, ttl, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) return hit.val;
  const val = await fn();
  cache.set(key, { val, exp: now + ttl });
  return val;
}

// =======================
// 工具函数
// =======================
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
function normalizeTagInput(s) {
  let t = String(s ?? '').trim();

  // 删除末尾的计数后缀： (6) / （6） / ( 6 ) / （ 6 ）
  t = t.replace(/\s*(?:\(|（)\s*\d+\s*(?:\)|）)\s*$/, '');

  // 顺便把末尾多余空格再清一下
  return t.trim();
}

 const baseQuery={ disable: { $ne: 1 },site:"hanime" }


function ymd(d) {
  const dt = d ? new Date(d) : new Date();
  return isNaN(dt.getTime()) ? new Date().toISOString().slice(0, 10) : dt.toISOString().slice(0, 10);
}

function gzipBuf(xml) {
  return zlib.gzipSync(Buffer.from(xml), { level: 6 });
}

function wantsGzip(req) {
  if ((req.path || '').toLowerCase().endsWith('.gz')) return true;
  if (String(req.query.gz || '') === '1') return true;
  const ae = String(req.headers['accept-encoding'] || '');
  return ae.includes('gzip');
}

function setXmlHeaders(res, isGz) {
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=600, s-maxage=600');
  res.set('Vary', 'Accept-Encoding');
  if (isGz) res.set('Content-Encoding', 'gzip');
  else res.removeHeader('Content-Encoding');
}

function sendXml(res, xml, isGz) {
  setXmlHeaders(res, isGz);
  if (isGz) return res.send(gzipBuf(xml));
  return res.send(xml);
}

// =======================
// robots.txt
// =======================
exports.robots = async (req, res) => {
  const site = getSiteUrl(req);
  res.type('text/plain; charset=utf-8');
  res.send(`User-agent: *
Allow: /

Sitemap: ${site}/sitemap.xml
`);
};

// =======================
// 1) sitemap index（只暴露 3 个入口）
// =======================
exports.sitemapIndex = async (req, res) => {
  const site = getSiteUrl(req);
  const isGz = wantsGzip(req);
  const key = `smi:${site}`;

  const xml = await cached(key, SITEMAP_TTL_MS, async () => {
    const now = new Date().toISOString();

    const hanimeLoc = `${site}/sitemap-hanime.xml`;
    const tagLoc = `${site}/sitemap-tag.xml`;
    const catLoc = `${site}/sitemap-cat.xml`;

    const items =
      `<sitemap><loc>${hanimeLoc}</loc><lastmod>${now}</lastmod></sitemap>` +
      `<sitemap><loc>${tagLoc}</loc><lastmod>${now}</lastmod></sitemap>` +
      `<sitemap><loc>${catLoc}</loc><lastmod>${now}</lastmod></sitemap>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`;
  });

  return sendXml(res, xml, isGz);
};

// =======================
// 2) 详情 sitemap：最近更新 + 随机（混合）
//    - 既照顾新内容收录，又避免全量清单被扫
// =======================
exports.sitemapJavsMix = async (req, res) => {
  const site = getSiteUrl(req);
  const isGz = wantsGzip(req);

  // 防止配错：确保 RANDOM >= 0
  const RECENT = Math.max(0, Math.min(SITEMAP_JAVS_RECENT, SITEMAP_JAVS_TOTAL));
  const RANDOM = Math.max(0, Math.min(SITEMAP_JAVS_RANDOM, SITEMAP_JAVS_TOTAL - RECENT));
  const TOTAL = RECENT + RANDOM;

  const key = `smj:mix:main:${site}:t${TOTAL}:r${RECENT}:x${RANDOM}`;

  const xml = await cached(key, SITEMAP_JAVS_TTL_MS, async () => {
    // 最近更新 RECENT
    let recentDocs = [];
    const baseQuery={ disable: { $ne: 1 },site:{$ne:"hanime"} }
    if (RECENT > 0) {
      recentDocs = await Jav.find(baseQuery)
        .sort({ updatedAt: -1, date: -1, _id: -1 })
        .select({ _id: 1, updatedAt: 1, date: 1 })
        .limit(RECENT)
        .lean();
    }

    // 随机 RANDOM（MongoDB 端随机）
    let randomDocs = [];
    if (RANDOM > 0) {
      randomDocs = await Jav.aggregate([
        { $match: baseQuery },
        { $sample: { size: RANDOM } },
        { $project: { _id: 1, updatedAt: 1, date: 1 } },
      ]);
    }

    // 合并去重（避免 recent 与 random 重叠）
    const seen = new Set();
    const merged = [];

    for (const d of recentDocs) {
      const id = String(d._id);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(d);
    }
    for (const d of randomDocs) {
      const id = String(d._id);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(d);
    }

    // 如果去重后 < TOTAL，用最近更新补齐（尽量不再额外 random，降低波动）
    if (merged.length < TOTAL) {
      const need = TOTAL - merged.length;
      const filler = await Jav.find({ ...baseQuery, _id: { $nin: Array.from(seen) } })
        .sort({ updatedAt: -1, date: -1, _id: -1 })
        .select({ _id: 1, updatedAt: 1, date: 1 })
        .limit(need)
        .lean();
      for (const d of filler) merged.push(d);
    }

    const urls = merged
      .slice(0, TOTAL)
      .map((d) => {
        const u = d.updatedAt || d.date;
        return `<url><loc>${site}/hanime/${d._id}.html</loc><lastmod>${ymd(u)}</lastmod></url>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  });

  return sendXml(res, xml, isGz);
};
exports.sitemapHanime = async (req, res) => {
  const site = getSiteUrl(req);
  const isGz = wantsGzip(req);

  // 防止配错：确保 RANDOM >= 0
  const RECENT = Math.max(0, Math.min(SITEMAP_JAVS_RECENT, SITEMAP_JAVS_TOTAL));
  const RANDOM = Math.max(0, Math.min(SITEMAP_JAVS_RANDOM, SITEMAP_JAVS_TOTAL - RECENT));
  const TOTAL = RECENT + RANDOM;

  const key = `smj:mix:hanime:${site}:t${TOTAL}:r${RECENT}:x${RANDOM}`;
 
  const xml = await cached(key, SITEMAP_JAVS_TTL_MS, async () => {
    // 最近更新 RECENT
    let recentDocs = [];
    if (RECENT > 0) {
      recentDocs = await Jav.find(baseQuery)
        .sort({ updatedAt: -1, date: -1, _id: -1 })
        .select({ _id: 1, updatedAt: 1, date: 1 })
        .limit(RECENT)
        .lean();
    }

    // 随机 RANDOM（MongoDB 端随机）
    let randomDocs = [];
    if (RANDOM > 0) {
      randomDocs = await Jav.aggregate([
        { $match: baseQuery },
        { $sample: { size: RANDOM } },
        { $project: { _id: 1, updatedAt: 1, date: 1 } },
      ]);
    }

    // 合并去重（避免 recent 与 random 重叠）
    const seen = new Set();
    const merged = [];

    for (const d of recentDocs) {
      const id = String(d._id);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(d);
    }
    for (const d of randomDocs) {
      const id = String(d._id);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(d);
    }

    // 如果去重后 < TOTAL，用最近更新补齐（尽量不再额外 random，降低波动）
    if (merged.length < TOTAL) {
      const need = TOTAL - merged.length;
      const filler = await Jav.find({ ...baseQuery, _id: { $nin: Array.from(seen) } })
        .sort({ updatedAt: -1, date: -1, _id: -1 })
        .select({ _id: 1, updatedAt: 1, date: 1 })
        .limit(need)
        .lean();
      for (const d of filler) merged.push(d);
    }

    const urls = merged
      .slice(0, TOTAL)
      .map((d) => {
        const u = d.updatedAt || d.date;
        return `<url><loc>${site}/hanime/${d._id}.html</loc><lastmod>${ymd(u)}</lastmod></url>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  });

  return sendXml(res, xml, isGz);
};
// =======================
// 3) tag sitemap：只输出 Top 标签（按 cnt 倒序）
//    - 把“长尾 tag 清单”从 sitemap 移除，降低被脚本顺藤摸瓜
// =======================
exports.sitemapTagTop = async (req, res) => {
  const site = getSiteUrl(req);
  const isGz = wantsGzip(req);
  const TOP = Math.max(0, SITEMAP_TAG_TOP);

  const key = `smt:top:${site}:${TOP}`;

  const xml = await cached(key, SITEMAP_TAG_TTL_MS, async () => {
    if (TOP === 0) {
      return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;
    }

    let agg = await Jav.aggregate([
      { $match: { ...baseQuery, tag: { $exists: true, $ne: null } } },
      { $project: { tag: 1 } },
      { $project: { tags: { $cond: [{ $isArray: '$tag' }, '$tag', ['$tag']] } } },
      { $unwind: '$tags' },
      { $match: { tags: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$tags', cnt: { $sum: 1 } } },
      { $sort: { cnt: -1 } },
      { $limit: TOP },
    ]);
     agg = agg.map(value=> {
      return {
        ...value,
        _id:normalizeTagInput(value._id)
      }
     }).filter(v => {
      const norm = v._id;
      // 1) 过滤导航占位词
      if (navs.some(d => norm.includes(d))) return false;
      // 2) 只保留精华tag（白名单）
      if (!ENTRY_TAGS.has(norm)) return false;
      return true;
    });
    console.log(agg)
    // tag sitemap 里的 lastmod：用“今天”即可（tag 页不是具体作品）
    const today = ymd(new Date());

    const urls = agg
      .map((t) => {
        const name = encodeURIComponent(String(t._id));
        return `<url><loc>${site}/tag/${name}/</loc><lastmod>${today}</lastmod></url>`;
      })
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  });

  return sendXml(res, xml, isGz);
};

// =======================
// 4) 分类/栏目 sitemap（保留你原逻辑）
// =======================
exports.sitemapCat = async (req, res) => {
  const site = process.env.SITE_URL || `https://${req.hostname}`;


  let cats = []

  genreNav.forEach((v) => cats.push({ href: `${site}${v}` }));

  const urls = cats
    .map(({ href }) => {
      return `
  <url>
    <loc>${href}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    })
    .filter(Boolean)
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
};

// =======================
// 5) 旧版 shard（默认关闭；即使开启也只返回随机 N）
// =======================
exports.sitemapJavsShard = async (req, res) => {
  if (!ALLOW_SHARDED_SITEMAP) return res.status(404).send('not found');

  const site = getSiteUrl(req);
  const isGz = wantsGzip(req);

  const shardRaw = String(req.params.shard || '1');
  const shard = Math.max(1, parseInt(shardRaw.replace(/\D+/g, '') || '1', 10));
  if (shard > MAX_SHARDS) return res.status(404).send('not found');

  const key = `smj:shard:${site}:${shard}:n${SHARD_SIZE}`;

  const xml = await cached(key, SITEMAP_JAVS_TTL_MS, async () => {
    const docs = await Jav.aggregate([
      { $match: { disable: { $ne: 1 } } },
      { $sample: { size: SHARD_SIZE } },
      { $project: { _id: 1, u: { $ifNull: ['$updatedAt', '$date'] } } },
    ]);

    const urls = docs
      .map((d) => `<url><loc>${site}/hanime/${d._id}.html</loc><lastmod>${ymd(d.u)}</lastmod></url>`)
      .join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
  });

  return sendXml(res, xml, isGz);
};
