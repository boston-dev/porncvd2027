'use strict';

const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const { link } = require('../routes');
const javsSchema = new mongoose.Schema({
  title:{type:String,default:''},
  title_en:{type:String,default:''},
  keywords:{type:String,default:''},
  content:{type:String,default:''},
  keywords_en:{type:String,default:''},
  desc:{type:String,default:''},
  desc_en:{type:String,default:''},
  site:{type:String,default:''},
  img:{type:String,default:''},
  id:{type:String,default:''},
  tran:Number,
  uri:{type:String,default:''},
  url:{type:String,default:''},
  link:{type:Array,default:[]},
  relate:{type:Array,default:[]},
  cat:{type:Array,default:[]},
  date:{type:Number,default:new Date().getTime()},
  vipView:{type:Number,default:0},
  tag:{type:Array,default:[]},
  type:{type:String,default:''},
  path:{type:String,default:''},
  disable:{type:Number,default:0},
  source:{type:String,default:''},
  actor:{type:Array,default:[]},
  imgs:{type:Array,default:[]},
});
javsSchema.index({ path: -1 });
javsSchema.index({ title: -1 });
javsSchema.index({ type: -1 });
javsSchema.index({ id: -1 ,site: -1});
javsSchema.index({ site: -1 });
javsSchema.index({ date: -1 });
javsSchema.index({ cat: -1 });
javsSchema.index({ vipView: -1 });
javsSchema.index({ tag: -1 });
javsSchema.index({ disable: -1 });

javsSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('javs', javsSchema);
