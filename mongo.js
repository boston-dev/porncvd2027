const mongoose = require('mongoose');
const javsModel = require('./mongod/model/javs');
const ordersModel = require('./mongod/model/orders');
const catsModel = require('./mongod/model/cats');
const controller = require('./mongod/controller');
mongoose.connect('mongodb://localhost:27017/downM3u8', {
    useNewUrlParser: true,
    useUnifiedTopology: true  }).then(res => console.log('downM3u8'))

   

controller.init('javsModel','remove',{
  _id:{$in:['6942d3366e7785a4fdaebfd2','693a393bca76eef547d9bca1']
}
},{disable:1}).then(result =>{
    console.log(result)
})