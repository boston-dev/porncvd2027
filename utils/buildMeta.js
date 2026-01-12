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
const typeLabel = type === 'tag' ? '影片合集' : '分類影片';

const titleBase = `${kw}${typeLabel} - ${siteName}`;
const title =
  page > 1
    ? `${kw}${typeLabel} - 第${page}頁 - ${siteName}`
    : titleBase;

const descBase =
  type === 'tag'
    ? `這裡整理了與「${kw}」相關的精選影片資源，內容更新即時、分類清晰，方便快速查找感興趣的相關作品。`
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

function sanitizeUnicode(str = '') {
   if (typeof str !== 'string') return ''
  // 删除未配对的 UTF-16 代理项（半个 emoji）
  return String(str).replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    ''
  );
}
const fs = require("fs/promises");
const path = require("path");

async function saveRankJson({ site, data }) {
  const filePath = path.join(process.cwd(), "ranks",`${site}.json`);
  const dir = path.dirname(filePath);

  // 1) 确保目录存在（ranks/site/）
  await fs.mkdir(dir, { recursive: true });

  // 2) 写文件（格式化，方便排查）
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, json, "utf8");

  return filePath;
}
function encUrl(url) {
  const b64 = Buffer.from(url, "utf8").toString("base64");
  let out = "";
  for (let i = 0; i < b64.length; i++) {
    out += String.fromCharCode(b64.charCodeAt(i) + 3);
  }
  return out;
}
module.exports = {encUrl, buildListMeta,sanitizeUnicode,saveRankJson };