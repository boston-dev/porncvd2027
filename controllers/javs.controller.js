'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { buildListMeta,sanitizeUnicode,saveRankJson} = require('../utils/buildMeta');
const { detailLimiter,withPageRange} = require('../middleware/rateLimit');
const renderFallback = require('../utils/renderFallback');
const OpenCC = require('opencc-js')
const toTwp = OpenCC.Converter({ from: 'cn', to: 'twp' })
const Jav = require('../models/Jav');
const OldUrlMap = require('../models/OldUrlMap');
/**
 * 线上一致：字段不改、集合不改、分页使用 mongoose-paginate-v2
 * 视图模板：继续用你线上 porncvd.com 的 ejs（home/search/tag/cat/nice/boot 等）
 */
function escReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
   const slectConfig= {
    _id:1,
      url: 1,
      keywords: 1,
      desc: 1,
      title: 1,
      source: 1,
      img: 1,
      tag: 1,
      site: 1,
      disable: 1,
      title_en: 1,
      keywords_en: 1,
      desc_en: 1,
      cat: 1,
      date: 1,
      id: 1,
      path: 1,
      vipView: 1,
      actor: 1,
      type: 1,
    } 
exports.home = asyncHandler(async (req, res) => {
  const {siteArr}=res.locals
  // 首页：最新
   const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = 40;
  const query = {site: { $nin: siteArr }};

  const result = await Jav.paginate(query, {
    page,
    limit,
    sort: { date: -1 },
    select: 'title title_en img url site tag cat date id path vipView  source site',
    lean: true,
    leanWithId: false,
  });
  Object.assign(result,{
    ...withPageRange(result,{prelink:'/?page=pageTpl'})
  })
   const {t,isCN}=res.locals
  if(isCN){
    result.docs=result.docs.map(video =>{
      const isHanime=video.site == 'hanime'
      if(isHanime) return video
      return {
        ...video,
        title:t(video.title),
        keywords:t(video.title),
        desc:t(video.desc),
      }
    })
  }
  if(req.query.ajax){
       return  res.send( result);
   }
  return res.render('boot', result);
});

exports.search = asyncHandler(async (req, res) => {
  let qRaw = (req.query.search_query || '').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = 40;

  // 防刷：太长直接拒绝（避免 regex 被滥用）
  if (qRaw.length > 60) return res.status(400).send('Bad Request');
 if(res.locals.isCN){
  qRaw=toTwp(qRaw)
 }
  const query = { };
  if (qRaw) {
    const reg = new RegExp(escReg(qRaw), 'i');
    query.$or = [
      { title: reg },
      { desc: reg },
    ];
  }
  const result = await Jav.paginate(query, {
    page,
    limit,
    sort: { date: -1 },
    select: 'title title_en img url site tag cat date id path vipView  source  site',
    lean: true,
    leanWithId: false,
  });

  result.search_query = qRaw;
   Object.assign(result,{
    ...withPageRange(result,{prelink:`/search/javs?search_query=${qRaw}&page=pageTpl`})
  })
  const {t,isCN}=res.locals
  if(isCN){
    result.docs=result.docs.map(video =>{
      const isHanime=video.site == 'hanime'
      if(isHanime) return video
      return {
        ...video,
        title:t(video.title),
        keywords:t(video.title),
        desc:t(video.desc),
      }
    })
  }
   if(req.query.ajax){
       return  res.send( result);
   }
  return res.render('boot', result);
});


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
exports.tag = asyncHandler(async (req, res) => {
  const site= decodeURIComponent((req.query.site || '').trim())
  const name = decodeURIComponent((req.params.name || '').trim());
  const page = Math.max(1, parseInt(req.params.p || '1', 10));
  const limit = 40;

  if (!name) return renderFallback(req, res, { status: 404, view: 'boot', limit: 16 });
    const keywords = Array.isArray(name) ? name : [name];
    const optRegexp = keywords
      .filter(Boolean)
      .map(k => new RegExp(escapeRegExp(k.trim()), 'i'));
     
    const query = optRegexp.length
      ? { tag: { $in: optRegexp } }
      : {}; // 没关键词就不加条件，避免 $in: []
    let prelink = buildPrelinkByUrl(req);
     if(site){
      res.locals.curSite=site
      Object.assign(query,{
          site
      })
        prelink.includes('?') ? prelink+=`&site=${site}` : prelink+=`?site=${site}`
    }
  const result = await Jav.paginate(query, {
    page,
    limit,
    sort: { date: -1 },
    select: 'title title_en img url site tag cat date id path vipView  source site',
    lean: true,
    leanWithId: false,
  });
  result.name = name;
  res.locals.meta = buildListMeta({
    req,
    type: req.path.startsWith('/tag') ? 'tag' :'cat',
    name,
    page,
    totalPages: result.totalPages, // 你 paginate 的返回
    siteName: process.env.SITE_NAME
  });
  Object.assign(result,{
    ...withPageRange(result,{prelink})
  })
  const {t,isCN}=res.locals
  if(isCN){
    result.docs=result.docs.map(video =>{
      const isHanime=video.site == 'hanime'
      if(isHanime) return video
      return {
        ...video,
        title:t(video.title),
        keywords:t(video.title),
        desc:t(video.desc),
      }
    })
  }
  if(req.query.ajax){
       return  res.send( result);
   }
  return res.render('boot', result);
});
exports.genre = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.params.p || '1', 10));
  const limit = 40;
  res.locals.curSite='hanime'
    const query = {site:{$eq:'hanime'}}
  const prelink=`/genre/pageTpl`
  const result = await Jav.paginate(query, {
    page,
    limit,
    sort: { date: -1 },
    select: 'title title_en img url site tag cat date id path vipView  source site',
    lean: true,
    leanWithId: false,
  });

  Object.assign(result,{
    ...withPageRange(result,{prelink})
  })
  res.locals.meta = buildListMeta({
    req,
    type:'cat',
    name:'動漫',
    page,
    totalPages: result.totalPages, // 你 paginate 的返回
    siteName: process.env.SITE_NAME
  });
  return res.render('boot', result);
});
// 随机取一个“可播放”的视频（你按自己字段改筛选条件）
async function pickOnePlayableVideo(site) {
  const match = { };
  const [doc] = await Jav.aggregate([
    { $match: match },
    { $sample: { size: 1 } },
    { $project: slectConfig }
  ]);
  console.log(doc)
  return doc
}
/**
 * Detail: strongest stability.
 * - detail limiter
 * - ObjectId regex validation BEFORE hitting Mongo
 * - unified fallback page on invalid/404
 */
exports.detail = [
  detailLimiter,
  asyncHandler(async (req, res) => {
    if (req.url.includes('/javs/realte.html')) return res.redirect('/');

    const raw = req.params.id || '';
    let id = raw.replace(/\.html$/i, '');
    const {t,isCN}=res.locals
    // ✅ fast ObjectId regex validation
    if (id.length !== 24 || !/^[a-f\d]{24}$/i.test(id)) {
      return res.redirect('/')
     // return renderFallback(req, res, { status: 404, view: 'boot', limit: 16 });
    }
 
    let video = await Jav.findById(id).select(slectConfig).lean();

    if (!video) {
      const oldId=id
      const findQuery={ oldId }
      let map = await OldUrlMap.findOne(findQuery).lean();
      if (!map) {
        const picked = await pickOnePlayableVideo();
        // 用 upsert 防并发：同一个 oldId 只会插入一次
        await OldUrlMap.findOneAndUpdate(
          { oldId },
          {
            $setOnInsert: {
              oldId,
              newId: picked._id,
            },
          },
          { upsert: true, new: true }
        );
        video=picked
      }else{
         video = await Jav.findById(map.newId).lean();
      }
      //return renderFallback(req, res, { status: 200, view: '404', limit: 16 });
      //随机取出16个数据，第一个当做 播放视频详情，其他当做推荐
    }
    const isHanime=video.site == 'hanime'
    if(isHanime){
        res.locals.curSite='hanime'
     }
     
    const tags = Array.isArray(video.tag) ? video.tag.filter(Boolean) : [];
    const relateDoc = {
      _id: { $ne: video._id },
      ...(tags.length ? { tag: { $in: tags } } : {}),
    };
    if (video.site === 'hanime') relateDoc.site = { $eq: 'hanime' };
    else relateDoc.site = { $ne: 'hanime' };

    const docs = await Jav.find(relateDoc)
      .sort({ date: -1 })
      .limit(22)
      .select({ title: 1, img: 1, site: 1, tag: 1, cat: 1, date: 1, id: 1, path: 1 ,source: 1,})
      .lean();
    
    

    const SITE = process.env.SITE_URL || 'https://porncvd.com';

    const url = `${SITE}${res.locals.basePath}/javs/${video._id}.html`;
    let title =sanitizeUnicode(video.title || 'Video') ;
    let desc = sanitizeUnicode((video.desc || title).slice(0, 160));
    if(isCN && !isHanime){
      title=t(title)
      desc=t(desc)
      docs.forEach(v =>{
        if(v.site !== 'hanime'){
          v.title=t(v.title)
          v.desc=t(v.desc)
        }
      })
    }
    video.title=title
    video.desc=desc
    const img=`${video.source}${video.img}`
   const uploadDate = new Date(Number(video.date || Date.now())).toISOString();
    
    res.locals.meta={
      title: `${title} - ${process.env.SITE_NAME}`,
      keywords: Array.isArray(video.tag) ? video.tag.join(',') : '',
      desc,
      canonical: url,
      og: {
        type: 'video.other',
        title,
        desc,
        image: img
      },

      // ✅ VideoObject（SEO 核心）
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name":title,
        "description":desc,
        "thumbnailUrl":img,
        "uploadDate": uploadDate,
        "embedUrl": url
      }
    }
    const fentData={ video,docs}
    if (req.query.ajax) return res.send(fentData);

    return res.render('nice', fentData);
  }),
];
exports.resourcePost = asyncHandler(async (req, res) => {
  const obj = req.body || {};

  // 基础校验：避免空写入/脏数据
  if (!obj.id || !obj.site) {
    return res.status(400).json({ ok: false, msg: 'id 和 site 必填' });
  }

 
  const $set =obj;

  // upsert：有就更新，没有就创建
  const doc = await Jav.findOneAndUpdate(
    { id: obj.id, site: obj.site },
    { $set },
    {
      upsert: true,
      new: true,              // 返回更新后的文档
      setDefaultsOnInsert: true,
    }
  ).lean();

  return res.json({ ok: true, data: doc });
});

exports.resourceFind = asyncHandler(async (req, res) => {
  const obj = req.body || {};
  console.log(obj,'-------')
  // upsert：有就更新，没有就创建
  const doc = await Jav.findOne(obj).lean();
  if(doc){
   return res.json({
    code:600,
    msg:'已经存在',
    data:doc
   })
  }
  return res.json({ code: 200, data: doc });
});
 
exports.chatsHost=asyncHandler(async (req, res) => {
  const arr = req.body || {};
  if(!arr.length) {
     return res.json({
      code:600,
      msg:'不能是空数组',
    })
  }
  const file= await saveRankJson({site:arr[0].site,data:arr})
   return res.json({
      code:200,
      file,
    })
});

exports.hot = asyncHandler(async (req, res) => {
  const {siteArr}=res.locals
  // 首页：最新
   const page = Math.max(1, parseInt(req.params.p || '1', 10));
  const limit = 40;
  const query = {hot: { $gt: 0 }};

  const result = await Jav.paginate(query, {
    page,
    limit,
    sort: { hot: -1, date: -1 },
    select: 'title title_en img url site tag cat date id path vipView  source site',
    lean: true,
    leanWithId: false,
  });
  Object.assign(result,{
    ...withPageRange(result,{prelink:'/?page=pageTpl'})
  })
   const {t,isCN}=res.locals
  if(isCN){
    result.docs=result.docs.map(video =>{
      const isHanime=video.site == 'hanime'
      if(isHanime) return video
      return {
        ...video,
        title:t(video.title),
        keywords:t(video.title),
        desc:t(video.desc),
      }
    })
  }
  if(req.query.ajax){
       return  res.send( result);
   }
  return res.render('boot', result);
});