const LRU = new Map();

const MAX_SIZE = 5000;

function set(key, value, ttl = 60000) {
  const expire = Date.now() + ttl;

  if (LRU.has(key)) {
    LRU.delete(key);
  }

  LRU.set(key, { value, expire });

  // 超出容量才清理
  if (LRU.size > MAX_SIZE) {
    const firstKey = LRU.keys().next().value;
    LRU.delete(firstKey);
  }
}

function get(key) {
  const data = LRU.get(key);

  if (!data) return null;

  if (Date.now() > data.expire) {
    LRU.delete(key);
    return null;
  }

  // ⭐ 关键优化：刷新顺序（真正LRU）
  LRU.delete(key);
  LRU.set(key, data);

  return data.value;
}

function del(key) {
  LRU.delete(key);
}

module.exports = {
  get,
  set,
  del,
};
