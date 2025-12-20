'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { buildListMeta,paginatePics,buildSeo,escapeRegExp,buildPrelinkByUrl,escReg} = require('../utils/buildMeta');
const { detailLimiter,withPageRange} = require('../middleware/rateLimit');
const renderFallback = require('../utils/renderFallback');

const Jav = require('../models/Jav');



exports.home = asyncHandler(async (req, res) => {
  // 首页：最新
   const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = 40;
  const query = { disable: { $ne: 1 } };

  const result = await Jav.paginate(query, {
    page,
    limit,
    sort: { date: -1 },
    select: 'title title_en img url site tag cat date id path vipView  source pics',
    lean: true,
    leanWithId: false,
  });
  Object.assign(result,{
    ...withPageRange(result,{prelink:'/?page=pageTpl'})
  })
  if(req.query.ajax){
       return  res.send( result);
   }
  return res.render('boot', result);
});
exports.hot = asyncHandler(async (req, res) => {
  // 首页：最新
   const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = 40;
  const query = { disable: { $ne: 1 } };

  const result = await Jav.paginate(query, {
    page,
    limit,
    sort: {likes: -1 },
    select: 'title title_en img url site tag cat date id path vipView  source pics',
    lean: true,
    leanWithId: false,
  });
  Object.assign(result,{
    ...withPageRange(result,{prelink:'/?page=pageTpl'})
  })
  if(req.query.ajax){
       return  res.send( result);
   }
  return res.render('boot', result);
});
exports.search = asyncHandler(async (req, res) => {
  const qRaw = (req.query.search_query || '').trim();
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = 40;

  // 防刷：太长直接拒绝（避免 regex 被滥用）
  if (qRaw.length > 60) return res.status(400).send('Bad Request');

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
    select: 'title title_en img url site tag cat date id path vipView  source',
    lean: true,
    leanWithId: false,
  });

  result.search_query = qRaw;
   Object.assign(result,{
    ...withPageRange(result,{prelink:`/search/javs?search_query=${qRaw}&page=pageTpl`})
  })
   if(req.query.ajax){
       return  res.send( result);
   }
  return res.render('boot', result);
});



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
    select: 'title title_en img url site tag cat date id path vipView  source',
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
    select: 'title title_en img url site tag cat date id path vipView  source',
    lean: true,
    leanWithId: false,
  });

  Object.assign(result,{
    ...withPageRange(result,{prelink})
  })
  return res.render('boot', result);
});
/**
 * Detail: strongest stability.
 * - detail limiter
 * - ObjectId regex validation BEFORE hitting Mongo
 * - unified fallback page on invalid/404
 */
exports.detail = [
  detailLimiter,
  asyncHandler(async (req, res) => {

    const raw = req.params.id || '';
    const id = raw?.trim();
    const page = req.params.page || 1;
    // ✅ fast ObjectId regex validation
    if (!id) {
      return renderFallback(req, res, { status: 404, view: 'boot', limit: 16 });
    }
      
    let video = await Jav.findOne({id}).select({
       url: 1,
      keywords: 1,
      desc: 1,
      title: 1,
      source: 1,
      pics: 1,
      Headers:1,
      tag: 1,
      site: 1,
      date:1,
      elseName:1,
      likes:1,
      social:1,
      id:1
    }).lean();

    if (!video || video.disable === 1) {
      return renderFallback(req, res, { status: 404, view: 'boot', limit: 16 });
    }
        const pager = paginatePics(
            video.pics || [],
            page,
            20,
            `/girls/${req.params.id}/pageTpl`   // pageTpl 会被替换成页码
        );
        const similar = await Jav.aggregate([
          { $match: { disable: { $ne: 1 }} },
          { $sample: { size: 12 } },
          { $project: {
            url: 1,
            keywords: 1,
            desc: 1,
            title: 1,
            source: 1,
            pics: 1,
            Headers:1,
            tag: 1,
            site: 1,
            date:1,
            elseName:1,
            likes:1,
            social:1,
            id:1
          } },
        ]);
        const seo = buildSeo(video, page, {
            siteName: 'PicGaze',
            origin:  video.source,                          
            url:     req.protocol + '://' + req.get('host') + req.originalUrl
        });
        video={
            ...pager,
            seo,
            similar,
            ...video,
        } 
        res.locals.meta={
            "title": seo.title,
            "keywords": seo.keywords,
            "desc": seo.description,
        }
        
        if (req.query.ajax) {
            return res.send(video);
        }
        res.render('nice',{
          ...video,
          video
        } );
  }),
];
exports.models = [
  detailLimiter,
  asyncHandler(async (req, res) => {

    const raw = req.params.id || '';
    let id = raw?.trim();
    const page = req.params.page || 1;
    // ✅ fast ObjectId regex validation
    if (!id) {
      return renderFallback(req, res, { status: 404, view: 'boot', limit: 16 });
    }
     id=id.replace(/\.html$/i, '')
    let video = await Jav.findById(id).select({
       url: 1,
      keywords: 1,
      desc: 1,
      title: 1,
      source: 1,
      pics: 1,
      Headers:1,
      tag: 1,
      site: 1,
      date:1,
      elseName:1,
      likes:1,
      social:1
    }).lean();

    if (!video || video.disable === 1) {
      return renderFallback(req, res, { status: 404, view: 'boot', limit: 16 });
    }
    console.log(video.source,'--------------')    
        const pager = paginatePics(
            video.pics || [],
            page,
            20,
            `/girls/${req.params.id}/pageTpl.html`   // pageTpl 会被替换成页码
        );
        const similar = await Jav.aggregate([
          { $match: { disable: { $ne: 1 }} },
          { $sample: { size: 12 } },
          { $project: {
            url: 1,
            keywords: 1,
            desc: 1,
            title: 1,
            source: 1,
            pics: 1,
            Headers:1,
            tag: 1,
            site: 1,
            date:1,
            elseName:1,
            likes:1,
            social:1
          } },
        ]);
        const seo = buildSeo(video, page, {
            siteName: 'PicGaze',
            origin:  video.source,                          
            url:     req.protocol + '://' + req.get('host') + req.originalUrl
        });
        video={
            ...pager,
            seo,
            similar,
            ...video,
        } 
        res.locals.meta={
            "title": seo.title,
            "keywords": seo.keywords,
            "desc": seo.description,
        }
        
        if (req.query.ajax) {
            return res.send(video);
        }
        res.render('nice',{
          ...video,
          video
        } );
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