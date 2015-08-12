var superagent = require('superagent');
var config = require('../config.json');
var Pusher = require('./pusher');

for(var i = 0; i<config.length; i++) {
    var pusher = new Pusher(config[i]);
    pusher.start();
}