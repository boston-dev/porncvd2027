const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const cache = require("../cache");
const Jav = require("../models/jav");

// 你项目里原本这些从哪里来的，就按你的真实路径引入
const { detailLimiter, withPageRange } = require("../middleware/rateLimit");
const crypto = require("../middleware/crypto");

// 如果 queryFirt 是全局配置，按你真实路径改
const queryFirt = {};

const MAX_PAGE = Number(process.env.HOME_CACHE_PAGES || 100);
const LIMIT = process.env.LIMIT;

const app = express();

// 按你项目真实 views 路径
app.set("views", path.join(process.cwd(), "views"));

// 你的项目如果是 ejs/html 模板，一般这样
app.engine("html", require("ejs").renderFile);
app.set("view engine", "html");

// 如果你的 index 是 views/index.ejs，就改成：
// app.set("view engine", "ejs");

function t(text) {
  return text;
}
const siteArr =  process.env.siteArr;
async function renderHomePage(page) {
  const query = { site: { $nin: siteArr }, ...queryFirt };
  const result = await Jav.paginate(query, {
    page,
    limit: LIMIT,
    sort: { date: -1 },
    select:
      "title title_en img url site tag cat date id path vipView source site desc",
    lean: true,
    leanWithId: false,
  });

  const userDoc = [];

  Object.assign(result, {
    ...withPageRange(result, { prelink: "/?page=pageTpl" }),
    userVideo: {
      docs: userDoc,
      title: "現正熱播中",
    },
  });

  // 本地预生成默认不走简体转换
  const isCN = false;

  if (isCN) {
    result.docs = result.docs.map((video) => {
      const isHanime = video.site == "hanime";
      if (isHanime) return video;

      return {
        ...video,
        title: t(video.title),
        keywords: t(video.title),
        desc: t(video.desc),
      };
    });
  }

  const locals = {
    ...result,

    // 模板里如果用到了 res.locals.xxx，这里要补
    siteArr,
    t,
    isCN,
    meta: {
      canonical:
        page === 1
          ? process.env.SITE_URL
          : `${process.env.SITE_URL}/?page=${page}`,
    },
  };

  return new Promise((resolve, reject) => {
    app.render("index", locals, (err, html) => {
      if (err) return reject(err);
      resolve(html);
    });
  });
}

async function build(page=1) {
  await mongoose.connect(process.env.MONGO_URI);
  const query = { site: { $nin: siteArr }, ...queryFirt };
  const result = await Jav.paginate(query, {
    page,
    limit: LIMIT,
    sort: { date: -1 },
    select:
      "title title_en img url site tag cat date id path vipView source site desc",
    lean: true,
    leanWithId: false,
  });
  console.log(result.totalDocs,result.limit)
//   for (let page = 1; page <= 3; page++) {
//     try {
//       console.log("[cache build] home page:", page);

//       const html = await renderHomePage(page);

//       cache.setHomeCache(page, html);

//       console.log("[cache ok] home page:", page);
//     } catch (err) {
//       console.error("[cache fail] page:", page, err.message);
//     }
//   }

  console.log("✅ home cache build done");
  await mongoose.disconnect();
  process.exit(0);
}

build();