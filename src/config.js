'use strict';

var args = require('minimist')(process.argv.slice(2));
var path = require('path');

var configPath = path.resolve(args.config) || path.join(__dirname, '../config.json');
var config = require(configPath);
var _ = require('lodash');
var modConfig = [];
var mandatory = ['interval', 'chunkSize', 'incrCol', 'database', 'table', 'pushUrl', 'lastUrl'];
for (var i = 0; i < config.length; i++) {
    for (var j = 0; j < config[i].urls.length; j++) {
        var url = config[i].urls[j];
        modConfig.push(_.cloneDeep(config[i]));
        var last = modConfig[modConfig.length-1];
        last.pushUrl = url.pushUrl;
        last.lastUrl = url.lastUrl;
        delete  last.urls;
    }
}

for (i = 0; i < modConfig.length; i++) {
    var c = modConfig[i];
    for (j = 0; j < mandatory.length; j++) {
        var m = mandatory[j];
        if(c[m] === undefined) throw new Error('Config error: ' + m + ' is mandatory');
    }
}

exports = module.exports = modConfig;