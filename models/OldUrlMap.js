'use strict';

const mongoose = require('mongoose');

const OldUrlMapSchema = new mongoose.Schema(
  {
    oldId: { type: String, required: true, unique: true, index: true },
    newId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OldUrlMap', OldUrlMapSchema);
