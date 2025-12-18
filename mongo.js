/**
 * 用法：
 *   node delete_by_urls.js
 *
 * 说明：
 * - 把 urls 里填上你要下线的页面 URL（或只填 id 字段值）
 * - 默认按你的截图：mongodb://localhost:27017/downM3u8
 */

const mongoose = require("mongoose");
const { Types } = require("mongoose");
// 你的模型路径按实际改
const Jav = require("./models/Jav");

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/downM3u8";

// ✅ 把要处理的 URL / 页面路径 放这里
const urls = [
  "https://porncvd.com/javs/6943aeca0a2465cf16541775.html",
  "https://porncvd.com/javs/6943aebc0a2465cf1654165f.html",
  "https://porncvd.com/javs/6943b2e30a2465cf16545abf.html",
  "https://porncvd.com/javs/6943b2c30a2465cf1654585b.html"
];

// 从 URL 里提取 /javs/<id>.html 的 <id>
function extractIdFromUrl(u) {
  try {
    const m = u.match(/\/javs\/([^\/]+)\.html/i);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

async function main() {
  await mongoose.connect(MONGO_URI);

  const ids = urls
    .map(extractIdFromUrl)
    .filter(Boolean);

  if (!ids.length) {
    console.log("No valid ids parsed from urls.");
    process.exit(0);
  }

  // 你库里如果是 id 字段存业务 id，就删 id
  // 如果是 _id（ObjectId）当路由 id，用 _id 删
  // 这里先按你 schema 里有 id:{type:String} 的习惯删
  const objectIds = ids.map(x => new Types.ObjectId(x));
  console.log(objectIds)
  const res = await Jav.deleteMany({ _id: { $in: objectIds } });

  console.log("Delete result:", res);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
