"use strict";

const fs = require("fs/promises");
const path = require("path");

const memory = new Map();
const pending = new Map();

const DEFAULT_TTL = Number(process.env.PAGE_CACHE_TTL || 3 * 60); // seconds
const MAX_MEMORY_ITEMS = Number(process.env.PAGE_CACHE_MAX_ITEMS || 2000);
const OUT_DIR = path.join(process.cwd(), ".page-cache");

function normalizeKey(key) {
  return String(key || "")
    .replace(/[^a-zA-Z0-9._~:%-]+/g, "_")
    .slice(0, 240);
}

function getMemory(key) {
  const item = memory.get(key);
  if (!item) return null;

  if (item.expireAt && item.expireAt < Date.now()) {
    memory.delete(key);
    return null;
  }

  return item.value;
}

function setMemory(key, value, ttlSeconds = DEFAULT_TTL) {
  if (memory.size >= MAX_MEMORY_ITEMS) {
    const firstKey = memory.keys().next().value;
    if (firstKey) memory.delete(firstKey);
  }

  memory.set(key, {
    value,
    expireAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0,
  });
}

function makeHomeHtmlPath({ lang, page }) {
  return path.join(OUT_DIR, "home", lang, `${Number(page) || 1}.html`);
}

function makeTagHtmlPath({ lang, type, name, page, site }) {
  const safeName = encodeURIComponent(String(name || "").toLowerCase());
  const safeSite = site ? normalizeKey(site) : "all";
  return path.join(
    OUT_DIR,
    type || "tag",
    lang,
    safeSite,
    safeName,
    `${Number(page) || 1}.html`,
  );
}

async function readHtml(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

function writeHtmlLazy(filePath, html) {
  if (!filePath || typeof html !== "string") return;
  if (pending.has(filePath)) return;

  const task = fs
    .mkdir(path.dirname(filePath), { recursive: true })
    .then(() => fs.writeFile(filePath, html, "utf8"))
    .catch((err) => {
      console.error("[page-cache] write failed:", filePath, err.message);
    })
    .finally(() => pending.delete(filePath));

  pending.set(filePath, task);
}
function makeGenreHtmlPath({ page }) {
  return path.join(OUT_DIR, "genre", `${page}.html`);
}
module.exports = {
  makeGenreHtmlPath,
  DEFAULT_TTL,
  OUT_DIR,
  getMemory,
  setMemory,
  makeHomeHtmlPath,
  makeTagHtmlPath,
  readHtml,
  writeHtmlLazy,
};
