const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(process.cwd(), "cache_html");

// 初始化目录
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const cache = {
  // ===== 路径 =====
  getHomeCachePath(page = 1) {
    return path.join(CACHE_DIR, `home_page_${page}.html`);
  },

  // ===== 写缓存 =====
  setHomeCache(page, html) {
    try {
      fs.writeFileSync(this.getHomeCachePath(page), html, "utf-8");
    } catch (e) {
      console.error("[cache write error]", e.message);
    }
  },

  // ===== 读缓存 =====
  getHomeCache(page) {
    try {
      const file = this.getHomeCachePath(page);
      if (fs.existsSync(file)) {
        return fs.readFileSync(file, "utf-8");
      }
    } catch (e) {
      console.error("[cache read error]", e.message);
    }
    return null;
  },

  // ===== 是否存在 =====
  hasHomeCache(page) {
    return fs.existsSync(this.getHomeCachePath(page));
  }
};

module.exports = cache;