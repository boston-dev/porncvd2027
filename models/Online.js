const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  vid: String,
  ip: String,
  expireAt: Date,
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// 唯一索引
schema.index({ vid: 1, ip: 1 }, { unique: true });

// TTL 自动删除
schema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

// 排序用
schema.index({ vid: 1, updatedAt: -1 });
module.exports = mongoose.model('Online', schema);