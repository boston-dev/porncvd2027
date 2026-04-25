const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  vid: String,
  ip: String,
  expireAt: Date
});

// ✅ 同一个视频 + IP 唯一
schema.index({ vid: 1, ip: 1 }, { unique: true });

// ✅ 自动过期（在线人数）
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Online', schema);