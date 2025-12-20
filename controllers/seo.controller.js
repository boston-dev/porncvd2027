const zlib = require('zlib');
const Jav = require('../models/Jav'); // TODO 改成你真实路径

const SITEMAP_PAGE_SIZE = Number(process.env.SITEMAP_PAGE_SIZE || 20000);
const SITEMAP_TTL_MS = Number(process.env.SITEMAP_TTL_MS || 10 * 60 * 1000);

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
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function ymd(d) {
  const dt = d ? new Date(d) : new Date();
  return isNaN(dt.getTime()) ? new Date().toISOString().slice(0,10) : dt.toISOString().slice(0,10);
}

function gzip(xml) {
  return zlib.gzipSync(Buffer.from(xml), { level: 6 });
}

function setXmlGz(res) {
  res.type('application/xml; charset=utf-8');
  res.set('Content-Encoding', 'gzip');
  res.set('Cache-Control', 'public, max-age=600, s-maxage=600');
  res.set('X-Robots-Tag', 'noindex');
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

// ✅ sitemap index (挂在 /sitemap.xml)
exports.sitemapIndex = async (req, res) => {
  const site = getSiteUrl(req);
  const key = `smi:${site}`;

  const gz = await cached(key, SITEMAP_TTL_MS, async () => {
    const total = await Jav.countDocuments({ disable: { $ne: 1 } });
    const pages = Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE));
    const now = new Date().toISOString();

    let items = '';
    for (let i = 1; i <= pages; i++) {
      items += `<sitemap><loc>${site}/sitemap-girls-${i}.xml.gz</loc><lastmod>${now}</lastmod></sitemap>`;
    }
    items += `<sitemap><loc>${site}/sitemap-tag.xml.gz</loc><lastmod>${now}</lastmod></sitemap>`;
    items += `<sitemap><loc>${site}/sitemap-cat.xml.gz</loc><lastmod>${now}</lastmod></sitemap>`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`;

    return gzip(xml);
  });

  setXmlGz(res);
  res.send(gz);
};

// ✅ javs 分片（/sitemap-javs-1.xml.gz）
exports.sitemapJavsShard = async (req, res) => {
  const site = getSiteUrl(req);
  const shard = Math.max(1, parseInt(req.params.shard || '1', 10));
  const key = `smj:${site}:${shard}`;

  const gz = await cached(key, SITEMAP_TTL_MS, async () => {
    const skip = (shard - 1) * SITEMAP_PAGE_SIZE;

    const docs = await Jav.find({ disable: { $ne: 1 } })
      .sort({ updatedAt: -1, date: -1, _id: -1 })
      .skip(skip)
      .limit(SITEMAP_PAGE_SIZE)
      .select({ _id: 1, updatedAt: 1, date: 1,id:1 })
      .lean();
    const urls = docs.map(d => {
      const lastmod = ymd(d.updatedAt || d.date);
      return `<url><loc>${site}/girls/${d.id}</loc><lastmod>${lastmod}</lastmod></url>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return gzip(xml);
  });

  setXmlGz(res);
  res.send(gz);
};

// ✅ tag sitemap（只收录有内容的 tag）
exports.sitemapTag = async (req, res) => {
  const site = getSiteUrl(req);
  const key = `smt:${site}`;

  const gz = await cached(key, SITEMAP_TTL_MS, async () => {
    const agg = await Jav.aggregate([
      { $match: { disable: { $ne: 1 }, tag: { $exists: true, $ne: null } } },
      { $project: { tag: 1, u: { $ifNull: ["$updatedAt", "$date"] } } },
      { $project: { tags: { $cond: [{ $isArray: "$tag" }, "$tag", ["$tag"]] }, u: 1 } },
      { $unwind: "$tags" },
      { $match: { tags: { $type: "string", $ne: "" } } },
      { $group: { _id: "$tags", last: { $max: "$u" }, cnt: { $sum: 1 } } },
      { $match: { cnt: { $gte: 1 } } },
      { $sort: { last: -1 } },
      { $limit: 50000 }
    ]);

    const urls = agg.map(t => {
      const name = encodeURIComponent(String(t._id));
      return `<url><loc>${site}/tag/${name}/</loc><lastmod>${ymd(t.last)}</lastmod></url>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return gzip(xml);
  });

  setXmlGz(res);
  res.send(gz);
};

// ✅ cat sitemap（你的分类字段如果叫 cat，就不用改；如果叫 category，自行改字段）
exports.sitemapCat = async (req, res) => {
  const site = getSiteUrl(req);
  const key = `smc:${site}`;

  const catField = process.env.CAT_FIELD || 'cat';

  const gz = await cached(key, SITEMAP_TTL_MS, async () => {
    const agg = await Jav.aggregate([
      { $match: { disable: { $ne: 1 }, [catField]: { $exists: true, $ne: null } } },
      { $project: { c: `$${catField}`, u: { $ifNull: ["$updatedAt", "$date"] } } },
      { $project: { cats: { $cond: [{ $isArray: "$c" }, "$c", ["$c"]] }, u: 1 } },
      { $unwind: "$cats" },
      { $match: { cats: { $type: "string", $ne: "" } } },
      { $group: { _id: "$cats", last: { $max: "$u" }, cnt: { $sum: 1 } } },
      { $match: { cnt: { $gte: 1 } } },
      { $sort: { last: -1 } },
      { $limit: 50000 }
    ]);

    const urls = agg.map(c => {
      const name = encodeURIComponent(String(c._id));
      return `<url><loc>${site}/cat/${name}/</loc><lastmod>${ymd(c.last)}</lastmod></url>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return gzip(xml);
  });

  setXmlGz(res);
  res.send(gz);
};
