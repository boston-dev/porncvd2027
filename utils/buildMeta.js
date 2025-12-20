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
// 简单分页函数
function paginatePics(pics, currentPage = 1, pageSize = 20, prelink = '') {
  const total = pics.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  let page = parseInt(currentPage, 10) || 1;
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;

  const start = (page - 1) * pageSize;
  const end   = start + pageSize;

  const option = { prelink };
  const data = {
    page,
    totalPages,
    range: [],
    // 当前页的图片
    curPics: pics.slice(start, end),
    total,
  };
  // ======== 下面就是你原来的逻辑，几乎不动 ========
  let sub = [], size = 3;

  data.range = [{
    href: option.prelink ? option.prelink.replace('pageTpl', data.page) : '',
    class: 'active',
    text: data.page
  }];

  for (let num = data.page + 1; num <= data.page + size; num++) {
    if (num <= data.totalPages) {
      data.range.push({
        href: option.prelink ? option.prelink.replace('pageTpl', num) : '',
        text: num
      });
    }
  }

  for (let num = data.page - size; num < data.page; num++) {
    if (num > 0) {
      sub.push({
        href: option.prelink ? option.prelink.replace('pageTpl', num) : '',
        text: num
      });
    }
  }

  data.range = [...sub, ...data.range];

  if (data.range.findIndex(v => v.text == data.totalPages) < 0) {
    data.range.push({
      href: option.prelink ? option.prelink.replace('pageTpl', data.totalPages) : '',
      text: data.totalPages
    });
  }

  if (data.range.findIndex(v => v.text == 1) < 0) {
    data.range.unshift({
      href: option.prelink ? option.prelink.replace('pageTpl', 1) : '',
      text: 1
    });
  }

  return data;
}
function buildSeo(video, page = 1, totalPages = 1, domain = 'https://picgaze.com') {
  const name = video.title?.trim() || '';
  const elseNames = (video.elseName || [])
    .map(e => e.trim())
    .filter(Boolean);

  const elseStr = elseNames.join(', ');
  const slashNames = elseNames.join(' ');

  // 展示用名字：主名 + 别名
  const displayName = `${name}${slashNames ? ` / ${slashNames}` : ''}`;

  // 粗略判断一下是否跟 OnlyFans 有关（标题 / 别名 / tags 里出现 onlyfans）
  const textForCheck = (
    name + ' ' +
    elseStr + ' ' +
    (video.tags || []).join(' ')
  ).toLowerCase();
  const hasOnlyfans = textForCheck.includes('onlyfans');

  // ✅ Title：干净统一，不加 onlyfans，不带敏感词
  const title =
    `${displayName} Photos & Videos Gallery – PicGaze` +
    (page > 1 ? ` – Page ${page}` : '');

  // ✅ Description：根据是否有 OnlyFans 决定是否带 onlyfans 长尾
  const platformPhrase = hasOnlyfans
    ? 'from OnlyFans and other public social platforms'
    : 'from public social platforms like Instagram and TikTok';

  const description =
    `${displayName} photo and video gallery on PicGaze. ` +
    `Browse curated images and clips ${platformPhrase}, ` +
    `updated regularly with new posts and highlights.`;

  // ✅ Keywords：简单一点，必要信息 + 可选 onlyfans，不要 leaks/nude
  const keywordsArr = [
    name,
    ...elseNames,
    'photos',
    'videos',
    'gallery'
  ];
  if (hasOnlyfans) keywordsArr.push('onlyfans');

  const keywords = keywordsArr
    .filter(Boolean)
    .join(', ');

  // ✅ Longtail：安全长尾，不再用 nude/leaks
  const longtailParts = [
    name && `${name} photos`,
    name && `${name} videos`,
    name && `${name} photo gallery`,
    name && `${name} video collection`,
    ...elseNames.map(e => `${e} photos`),
    ...elseNames.map(e => `${e} videos`),
    ...elseNames.map(e => `${e} photo gallery`)
  ].filter(Boolean);

  const longtailText = longtailParts.join(', ');

  // JSON-LD：保持你原来的 ImageObject 列表逻辑
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": (video.pics || []).slice(0, 20).map((pic, i) => ({
      "@type": "ImageObject",
      "position": i + 1,
      "contentUrl": (video.source || '') + pic
    }))
  };

  return {
    title,
    description,
    keywords,
    longtailText,
    jsonLd: JSON.stringify(jsonLd)
  };
}
function escapeRegExp(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function buildPrelinkByUrl(req, pageTpl = 'pageTpl') {
  // 原始路径：/cat/台灣/2  或 /tag/自拍  或 /genre/2
  const base = req.path.replace(/\/+$/, ''); // 去掉末尾 /

  // 如果末尾是 /数字  => 替换成 /pageTpl
  if (/\/\d+$/.test(base)) {
    return base.replace(/\/\d+$/, `/${pageTpl}`);
  }

  // 如果末尾不是数字 => 直接追加 /pageTpl
  return `${base}/${pageTpl}`;
}
/**
 * 线上一致：字段不改、集合不改、分页使用 mongoose-paginate-v2
 * 视图模板：继续用你线上 porncvd.com 的 ejs（home/search/tag/cat/nice/boot 等）
 */

function escReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
module.exports = { buildListMeta,paginatePics,buildSeo };