'use strict';

var config = require('../config.json');
var _ = require('lodash');
var modConfig = [];
for (var i = 0; i < config.length; i++) {
    for (var j = 0; j < config[i].urls.length; j++) {
        var url = config[i].urls[j];
        modConfig.push(_.cloneDeep(config[i]));
        var last = modConfig[modConfig.length-1];
        last.url = url;
        delete  last.urls;
    }
}

exports = module.exports = modConfig;