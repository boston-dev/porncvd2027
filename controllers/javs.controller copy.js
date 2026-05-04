"use strict";

const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");
const crypto = require("../middleware/crypto");
const {
  encUrl,
  buildListMeta,
  sanitizeUnicode,
  saveRankJson,
} = require("../utils/buildMeta");

const {
  detailLimiter,
  withPageRange,
  fastPageQuery,
} = require("../middleware/rateLimit");

const renderFallback = require("../utils/renderFallback");
const OpenCC = require("opencc-js");
const toTwp = OpenCC.Converter({ from: "cn", to: "twp" });

const Jav = require("../models/Jav");
const Online = require("../models/Online");
const OldUrlMap = require("../models/OldUrlMap");

const tagNav = require("../nav.json")
  .filter((v) => v.href.includes("/cat"))
  .map((v) => {
    return {
      ...v,
      p: v.href.replace("/cat/", "").toLowerCase(),
    };
  });

function escReg(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeRegExp(str = "") {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPrelinkByUrl(req, pageTpl = "pageTpl") {
  const base = req.path.replace(/\/+$/, "");

  if (/\/\d+$/.test(base)) {
    return base.replace(/\/\d+$/, `/${pageTpl}`);
  }

  return `${base}/${pageTpl}`;
}

const queryFirt = {
  disable: { $ne: 1 },
};
const listSkip=120000 
const LIST_SELECT =
  "title title_en img url site tag cat date id path vipView source";

const slectConfig = {
  _id: 1,
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
};

exports.search = asyncHandler(async (req, res) => {
  let qRaw = (req.query.search_query || "").trim();
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = 40;

  if (qRaw.length > 60) {
    return res.status(400).send("Bad Request");
  }

  if (res.locals.isCN) {
    qRaw = toTwp(qRaw);
  }

  const query = { ...queryFirt };

  if (qRaw) {
    const reg = new RegExp(escReg(qRaw), "i");

    query.$or = [
      { title: reg },
      { title_en: reg },
      // 搜索页建议先不要搜 desc，太吃性能
      // { desc: reg },
    ];
  }

  const result = await fastPageQuery(Jav, query, {
    page,
    limit,
    sort: { date: -1 },
    select: LIST_SELECT,
    maxSkip: 1000,
  });

  result.search_query = qRaw;

  Object.assign(result, {
    ...withPageRange(result, {
      prelink: `/search/javs?search_query=${encodeURIComponent(
        qRaw
      )}&page=pageTpl`,
    }),
  });

  const { t, isCN } = res.locals;

  if (isCN) {
    result.docs = result.docs.map((video) => {
      const isHanime = video.site === "hanime";

      if (isHanime) return video;

      return {
        ...video,
        title: t(video.title),
        keywords: t(video.title),
        desc: t(video.desc),
      };
    });
  }

  if (req.query.ajax) {
    return res.send(result);
  }

  return res.render("boot", result);
});

exports.tag = asyncHandler(async (req, res) => {
  const site = decodeURIComponent((req.query.site || "").trim());
  const rawName = decodeURIComponent((req.params.name || "").trim());

  let name = rawName.toLowerCase();

  const findWord = tagNav.find((v) => v.p === name);

  if (findWord) {
    name = findWord.text;
  }

  const page = Math.max(1, parseInt(req.params.p || "1", 10));
  const limit = 40;

  if (!name) {
    return renderFallback(req, res, {
      status: 404,
      view: "boot",
      limit: 16,
    });
  }

  let keywords = Array.isArray(name) ? name : [name];

  if (name.includes("台灣")) keywords.push("台灣");
  if (name.includes("twzp")) keywords.push("TWZP");
  if (name.includes("custom udon")) keywords.push("Custom Udon");

  keywords = [...new Set(keywords)];

  const optRegexp = keywords
    .filter(Boolean)
    .map((k) => new RegExp(escapeRegExp(k.trim()), "i"));

  let query = optRegexp.length ? { tag: { $in: optRegexp } } : {};

  Object.assign(query, queryFirt);

  let prelink = buildPrelinkByUrl(req);

  if (site) {
    res.locals.curSite = site;

    Object.assign(query, {
      site,
    });

    prelink.includes("?")
      ? (prelink += `&site=${site}`)
      : (prelink += `?site=${site}`);
  }

  if (name === "porn5f") {
    query = {
      site: "5f",
      ...queryFirt,
    };
  }

  const result = await fastPageQuery(Jav, query, {
    page,
    limit,
    sort: { date: -1 },
    select: LIST_SELECT,
    maxSkip: listSkip,
  });

  result.name = name;

  res.locals.meta = buildListMeta({
    req,
    type: req.path.startsWith("/tag") ? "tag" : "cat",
    name,
    page,
    totalPages: page + (result.hasNextPage ? 1 : 0),
    siteName: process.env.SITE_NAME,
  });

  res.locals.meta = {
    ...res.locals.meta,
    titlePage: `${name}视频合集`,
    descPage: `
      这里整理了与「${name} 相关的精选视频资源，内容更新及时，分类清晰，
      方便用户快速查找感兴趣的相关作品。
      `,
  };

  Object.assign(result, {
    ...withPageRange(result, { prelink }),
  });

  const { t, isCN } = res.locals;

  if (isCN) {
    result.docs = result.docs.map((video) => {
      const isHanime = video.site === "hanime";

      if (isHanime) return video;

      return {
        ...video,
        title: t(video.title),
        keywords: t(video.title),
        desc: t(video.desc),
      };
    });

    res.locals.meta = {
      ...res.locals.meta,
      title: t(res.locals.meta.title),
      keywords: t(res.locals.meta.title),
      desc: t(res.locals.meta.desc),
      titlePage: t(res.locals.meta.titlePage),
      descPage: t(res.locals.meta.descPage),
    };
  }

  if (req.query.ajax) {
    return res.send(result);
  }

  return res.render("boot", result);
});

exports.genre = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.params.p || "1", 10));
  const limit = 40;

  res.locals.curSite = "hanime";

  const query = {
    site: { $eq: "hanime" },
    ...queryFirt,
  };

  const prelink = "/genre/pageTpl";

  const result = await fastPageQuery(Jav, query, {
    page,
    limit,
    sort: { date: -1 },
    select: LIST_SELECT,
    maxSkip: listSkip,
  });

  Object.assign(result, {
    ...withPageRange(result, { prelink }),
  });

  res.locals.meta = buildListMeta({
    req,
    type: "cat",
    name: "動漫",
    page,
    totalPages: page + (result.hasNextPage ? 1 : 0),
    siteName: process.env.SITE_NAME,
  });

  if (req.query.ajax) {
    return res.send(result);
  }

  return res.render("boot", result);
});

async function pickOnePlayableVideo() {
  const [doc] = await Jav.aggregate([
    { $match: {} },
    { $sample: { size: 1 } },
    { $project: slectConfig },
  ]);

  return doc;
}

exports.detail = [
  detailLimiter,
  asyncHandler(async (req, res) => {
    if (req.url.includes("/javs/realte.html")) {
      return res.redirect("/");
    }

    const raw = req.params.id || "";
    const id = raw.replace(/\.html$/i, "");
    const { t, isCN } = res.locals;

    if (id.length !== 24 || !/^[a-f\d]{24}$/i.test(id)) {
      return res.redirect("/");
    }

    let video = await Jav.findById(id).select(slectConfig).lean();

    if (!video) {
      const oldId = id;
      const findQuery = { oldId };

      const map = await OldUrlMap.findOne(findQuery).lean();

      if (!map) {
        const picked = await pickOnePlayableVideo();

        await OldUrlMap.findOneAndUpdate(
          { oldId },
          {
            $setOnInsert: {
              oldId,
              newId: picked._id,
            },
          },
          {
            upsert: true,
            new: true,
          }
        );

        video = picked;
      } else {
        video = await Jav.findById(map.newId).lean();

        if (!video) {
          return res.redirect("/");
        }
      }
    }

    if (video.disable) {
      return renderFallback(req, res, {
        status: 410,
        view: "404",
        limit: 16,
      });
    }

    const isHanime = video.site === "hanime";

    if (isHanime) {
      res.locals.curSite = "hanime";
    }

    const tags = Array.isArray(video.tag) ? video.tag.filter(Boolean) : [];

    const relateDoc = {
      _id: { $ne: video._id },
      ...(tags.length ? { tag: { $in: tags } } : {}),
    };

    if (video.site === "hanime") {
      relateDoc.site = { $eq: "hanime" };
    } else {
      relateDoc.site = { $ne: "hanime" };
    }

    const docs = await Jav.find(relateDoc)
      .sort({ date: -1 })
      .limit(22)
      .select({
        title: 1,
        img: 1,
        site: 1,
        tag: 1,
        cat: 1,
        date: 1,
        id: 1,
        path: 1,
        source: 1,
      })
      .lean();

    const SITE = crypto.getSiteUrl(req);
    const url = `${SITE}${res.locals.basePath}/javs/${video._id}.html`;

    let title = sanitizeUnicode(video.title || "Video");
    let desc = sanitizeUnicode((video.desc || title).slice(0, 160));

    if (isCN && !isHanime) {
      title = t(title);
      desc = t(desc);

      docs.forEach((v) => {
        if (v.site !== "hanime") {
          v.title = t(v.title);
          v.desc = t(v.desc);
        }
      });
    }

    video.title = title;
    video.desc = desc;
    video.url = encUrl(video.url);

    const img = `${video.source}${video.img}`;

    const uploadDate = new Date(Number(video.date || Date.now()))
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

    const contentUrl = `${SITE}/placeholder/${video._id}.mp4`;

    res.locals.meta = {
      title: `${title} - ${process.env.SITE_NAME}`,
      keywords: Array.isArray(video.tag) ? video.tag.join(",") : "",
      desc,
      canonical: url,
      og: {
        type: "video.movie",
        title,
        desc,
        image: img,
      },
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: title,
        description: desc,
        thumbnailUrl: [img],
        uploadDate,
        embedUrl: url,
        contentUrl,
      },
    };

    const fentData = {
      video,
      docs,
    };

    if (req.query.ajax) {
      return res.send(fentData);
    }

    return res.render("nice", fentData);
  }),
];

exports.resourcePost = asyncHandler(async (req, res) => {
  const obj = req.body || {};

  if (!obj.id || !obj.site) {
    return res.status(400).json({
      ok: false,
      msg: "id 和 site 必填",
    });
  }

  const doc = await Jav.findOneAndUpdate(
    {
      id: obj.id,
      site: obj.site,
    },
    {
      $set: obj,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  ).lean();

  return res.json({
    ok: true,
    data: doc,
  });
});

exports.resourceFind = asyncHandler(async (req, res) => {
  const obj = req.body || {};

  const doc = await Jav.findOne(obj).lean();

  if (doc) {
    return res.json({
      code: 600,
      msg: "已经存在",
      data: doc,
    });
  }

  return res.json({
    code: 200,
    data: doc,
  });
});

exports.chatsHost = asyncHandler(async (req, res) => {
  const arr = req.body || {};

  if (!arr.length) {
    return res.json({
      code: 600,
      msg: "不能是空数组",
    });
  }

  const file = await saveRankJson({
    site: arr[0].site,
    data: arr,
  });

  return res.json({
    code: 200,
    file,
  });
});

exports.hot = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.params.p || "1", 10));
  const limit = 40;

  const query = {
    hot: { $gt: 0 },
  };

  const result = await fastPageQuery(Jav, query, {
    page,
    limit,
    sort: {
      hot: -1,
      date: -1,
    },
    select: LIST_SELECT,
    maxSkip: 4000,
  });

  Object.assign(result, {
    ...withPageRange(result, {
      prelink: "/?page=pageTpl",
    }),
  });

  const { t, isCN } = res.locals;

  if (isCN) {
    result.docs = result.docs.map((video) => {
      const isHanime = video.site === "hanime";

      if (isHanime) return video;

      return {
        ...video,
        title: t(video.title),
        keywords: t(video.title),
        desc: t(video.desc),
      };
    });
  }

  if (req.query.ajax) {
    return res.send(result);
  }

  return res.render("boot", result);
});

exports.findMyTag = asyncHandler(async (req, res) => {
  const agg = await Jav.aggregate([
    {
      $match: {
        disable: { $ne: 1 },
        tag: {
          $exists: true,
          $ne: null,
        },
      },
    },
    {
      $project: {
        tag: 1,
      },
    },
    {
      $project: {
        tags: {
          $cond: [{ $isArray: "$tag" }, "$tag", ["$tag"]],
        },
      },
    },
    {
      $unwind: "$tags",
    },
    {
      $match: {
        tags: {
          $type: "string",
          $ne: "",
        },
      },
    },
    {
      $group: {
        _id: "$tags",
        cnt: {
          $sum: 1,
        },
      },
    },
    {
      $match: {
        cnt: {
          $gte: 50,
        },
      },
    },
    {
      $sort: {
        cnt: -1,
      },
    },
    {
      $limit: 5000,
    },
  ]);

  const filename = `tags_${Date.now()}.json`;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  return res.send(JSON.stringify(agg, null, 2));
});

let watchingCache = {
  data: [],
  expire: 0,
};

async function getWatchingList({ siteArr = [], limit = 10 }) {
  const now = Date.now();

  if (watchingCache.expire > now && watchingCache.data.length) {
    return watchingCache.data;
  }

  const watching = await Online.aggregate([
    {
      $group: {
        _id: "$vid",
        count: {
          $sum: 1,
        },
      },
    },
    {
      $sort: {
        count: -1,
      },
    },
    {
      $limit: limit * 2,
    },
  ]);

  const ids = watching.map((v) => v._id);

  let list = [];

  if (ids.length) {
    const videos = await Jav.find({
      _id: {
        $in: ids,
      },
      site: {
        $nin: siteArr,
      },
      disable: {
        $ne: 1,
      },
    }).lean();

    const map = new Map(videos.map((v) => [String(v._id), v]));

    list = ids.map((id) => map.get(String(id))).filter(Boolean);
  }

  if (list.length < limit) {
    const existIds = list.map((v) => v._id);

    const fillList = await Jav.find({
      _id: {
        $nin: existIds,
      },
      site: {
        $nin: siteArr,
      },
      disable: {
        $ne: 1,
      },
    })
      .sort({
        createdAt: -1,
      })
      .limit(limit - list.length)
      .lean();

    list = list.concat(fillList);
  }

  list = list.slice(0, limit);

  watchingCache = {
    data: list,
    expire: now + 3 * 60 * 1000,
  };

  return list;
}

exports.home = asyncHandler(async (req, res) => {
  const { siteArr } = res.locals;

  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = 40;

  const query = {
    site: {
      $nin: siteArr,
    },
    ...queryFirt,
  };

  const result = await fastPageQuery(Jav, query, {
    page,
    limit,
    sort: {
      date: -1,
    },
    select: LIST_SELECT,
    maxSkip: listSkip,
  });

  let userDoc = [];

  // 需要恢复“現正熱播中”时再打开
  // try {
  //   userDoc = await getWatchingList({ siteArr, limit: 8 });
  // } catch (e) {
  //   console.error("getWatchingList error:", e.message);
  //   userDoc = [];
  // }

  Object.assign(result, {
    ...withPageRange(result, {
      prelink: "/?page=pageTpl",
    }),
    userVideo: {
      docs: userDoc,
      title: "現正熱播中",
    },
  });

  const { t, isCN } = res.locals;

  if (isCN) {
    result.docs = result.docs.map((video) => {
      const isHanime = video.site === "hanime";

      if (isHanime) return video;

      return {
        ...video,
        title: t(video.title),
        keywords: t(video.title),
        desc: t(video.desc),
      };
    });
  }

  res.locals.meta.canonical = crypto.getSiteUrl(req);

  if (req.query.ajax) {
    return res.send(result);
  }

  return res.render("index", result);
});

const ONLINE_EXPIRE = 30 * 60 * 1000;
const MAX_ONLINE_PER_VIDEO = 20;

exports.view = asyncHandler(async (req, res) => {
  return res.status(400).json({
    code: 1,
  });

  const { id } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      code: 1,
    });
  }

  const ip =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip;

  if (!ip) {
    return res.status(400).json({
      code: 1,
    });
  }

  const now = new Date();

  const exists = await Online.exists({
    vid: id,
    ip,
    expireAt: {
      $gt: now,
    },
  });

  if (exists) {
    return res.json({
      code: 0,
      cached: true,
    });
  }

  await Online.updateOne(
    {
      vid: id,
      ip,
    },
    {
      $set: {
        vid: id,
        ip,
        expireAt: new Date(Date.now() + ONLINE_EXPIRE),
        updatedAt: now,
      },
    },
    {
      upsert: true,
    }
  );

  const oldList = await Online.find({
    vid: id,
  })
    .sort({
      updatedAt: -1,
    })
    .skip(MAX_ONLINE_PER_VIDEO)
    .limit(100)
    .select("_id")
    .lean();

  if (oldList.length) {
    await Online.deleteMany({
      _id: {
        $in: oldList.map((item) => item._id),
      },
    });
  }

  return res.json({
    code: 0,
  });
});