const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "hot-videos.json");

const HOT_MAX = 500; // 最多保留 500 个
const HOT_SHOW = 100; // 列表展示 100 个
const HOT_TTL = 24 * 60 * 60 * 1000; // 24小时
const SAVE_INTERVAL = 30 * 1000; // 30秒落盘一次

const hotMap = new Map();
let dirty = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadHotVideos() {
  try {
    ensureDataDir();

    if (!fs.existsSync(DATA_FILE)) return;

    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw) return;

    const list = JSON.parse(raw);
    const now = Date.now();

    for (const item of list) {
      if (!item || !item._id) continue;
      if (now - item.lastAt > HOT_TTL) continue;

      hotMap.set(String(item._id), item);
    }

    console.log("[hot-memory] loaded:", hotMap.size);
  } catch (err) {
    console.error("[hot-memory] load error:", err.message);
  }
}

function saveHotVideos() {
  if (!dirty) return;

  try {
    ensureDataDir();

    const list = [...hotMap.values()]
      .sort((a, b) => b.views - a.views || b.lastAt - a.lastAt)
      .slice(0, HOT_MAX);

    fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), "utf8");

    dirty = false;
    console.log("[hot-memory] saved:", list.length);
  } catch (err) {
    console.error("[hot-memory] save error:", err.message);
  }
}

function cleanHotVideos() {
  const now = Date.now();

  for (const [id, item] of hotMap) {
    if (!item.lastAt || now - item.lastAt > HOT_TTL) {
      hotMap.delete(id);
      dirty = true;
    }
  }

  if (hotMap.size > HOT_MAX) {
    const list = [...hotMap.entries()].sort((a, b) => {
      const av = a[1];
      const bv = b[1];

      return av.views - bv.views || av.lastAt - bv.lastAt;
    });

    const removeCount = hotMap.size - HOT_MAX;

    for (let i = 0; i < removeCount; i++) {
      hotMap.delete(list[i][0]);
      dirty = true;
    }
  }
}

function addHotVideo(video) {
  if (!video || !video._id) return;

  const id = String(video._id);
  const now = Date.now();

  const old = hotMap.get(id);

  hotMap.set(id, {
    _id: id,
    site: video.site || "",
    img: video.img || "",
    source: video.source || "",
    url: video.url || "",
    vipView: video.vipView || 0,

    views: old ? old.views + 1 : 1,
    firstAt: old ? old.firstAt : now,
    lastAt: now,
  });

  dirty = true;

  if (hotMap.size > HOT_MAX) {
    cleanHotVideos();
  }
}

function getHotVideos(limit = HOT_SHOW) {
  cleanHotVideos();

  return [...hotMap.values()]
    .sort((a, b) => b.views - a.views || b.lastAt - a.lastAt)
    .slice(0, limit);
}

function startHotMemory() {
  loadHotVideos();

  setInterval(() => {
    cleanHotVideos();
    saveHotVideos();
  }, SAVE_INTERVAL);

  process.on("SIGINT", () => {
    saveHotVideos();
    process.exit();
  });

  process.on("SIGTERM", () => {
    saveHotVideos();
    process.exit();
  });
}

module.exports = {
  startHotMemory,
  addHotVideo,
  getHotVideos,
  saveHotVideos,
};