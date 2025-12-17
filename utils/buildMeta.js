function buildAbsUrl(req, path) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host).split(',')[0].trim();
  const url = new URL(`${proto}://${host}${path}`);
  const site = (req.query.site || '').toString().trim();
  if (site) url.searchParams.set('site', site);
  return url.toString();
}

function normalizeNameForSeo(name) {
  const s = Array.isArray(name) ? name.filter(Boolean).join(' ') : String(name || '');
  return decodeURIComponent(s).trim().replace(/\s+/g, ' ');
}

function buildListMeta({ req, type, name, page, totalPages, siteName = 'porncvd' }) {
  const kw = normalizeNameForSeo(name);
  const isBadKw = !kw || kw.length > 40;         // 关键词太长/空 -> 当垃圾页
  const isBadPage = !Number.isFinite(page) || page < 1 || page > (totalPages || 1) || page > 200;

  const basePath = `/${type}/${encodeURIComponent(kw)}/`; // 注意：保持你路由风格
  const pagePath = page > 1 ? `${basePath}${page}` : basePath;

  const canonical = buildAbsUrl(req, pagePath);

  // title/desc
 const typeLabel = type === 'tag' ? '相關影片' : '分類影片';

const titleBase = `${kw}${typeLabel} - ${siteName}`;
const title =
  page > 1
    ? `${kw}${typeLabel} - 第${page}頁 - ${siteName}`
    : titleBase;

const descBase =
  type === 'tag'
    ? `收錄${kw}相關影片，包含最新更新與熱門推薦，支援線上播放與分頁瀏覽。`
    : `收錄${kw}分類影片合集，依更新時間與熱門程度瀏覽，支援分頁與篩選。`;

const desc =
  page > 1
    ? `${descBase}（第${page}頁）`
    : descBase;


  // prev/next
  const prev = page > 1 ? buildAbsUrl(req, page === 2 ? basePath : `${basePath}${page - 1}`) : '';
  const next = (totalPages && page < totalPages) ? buildAbsUrl(req, `${basePath}${page + 1}`) : '';

  // robots：坏关键词/坏分页/空结果 -> noindex
  const robots = (isBadKw || isBadPage || (totalPages === 0))
    ? 'noindex,follow,noarchive'
    : 'index,follow,noarchive';

  return {
    title,
    keywords: `${kw},${type},${siteName}`,
    desc,
    canonical,
    prev,
    next,
    robots,
  };
}
module.exports = { buildListMeta };