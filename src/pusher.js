'use strict';

var debug = require('debug')('pusher');
var PromiseWrapper = require('./util/PromiseWrapper');
var sqlite = require('sqlite3');
var superagent = require('superagent');

function Pusher(options) {
    this.options = options;
    this.last = Promise.resolve();
    this.queueLength = 0;
    this.incr = 0;
}

Pusher.prototype.start = function () {
    var that = this;
    if (this._started) {
        debug('Cannot start, already started');
        return;
    }
    // open database
    debug('opening database', this.options.database);
    var db = new sqlite.cached.Database(this.options.database);
    this.database = new PromiseWrapper(db, ['all', 'run', 'get']);
    this._queue(function () {
        return that.database.run('PRAGMA synchronous = OFF; PRAGMA journal_mode = MEMORY;');
    });

    this._queue(this._getLast.bind(this));

    this._interval = setInterval(function () {
        if (that.queueLength === 0) {
            that._push();
        }
    }, that.options.interval);
    this._started = true;
};

Pusher.prototype._queue = function (fn) {
    var that = this;
    this.queueLength++;
    this.last = this.last.then(fn).then(function (arg) {
        that.queueLength--;
        debug('queue element succeeded. New q length: ' + that.queueLength);
        return arg;
    }, function (arg) {
        debug('queue element failed' + arg);
        that.queueLength--;
        debug('New queue length: ' + that.queueLength);
        return arg;
    });
};

Pusher.prototype._push = function () {
    var that = this;
    this._queue(function () {
        var query = 'select * from ' + that.options.table + ' where ' + that.options.incrCol + '>' + that.incr + ' order by ' + that.options.incrCol + ' ASC limit ' + that.options.chunkSize;
        debug(query);
        return that.database.all(query).then(function (r) {
            var incr;
            if (r.length) {
                incr = r[r.length - 1][that.options.incrCol];
            } else {
                return;
            }
            r.forEach(function (el) {
                delete el[that.options.incrCol];
            });

            return new Promise(function (resolve, reject) {
                superagent.put(that.options.pushUrl)
                    .send(r)
                    .end(function (err, res) {
                        if (err) return reject(err);
                        if (res.status === 200) {
                            that.incr = incr;
                            that._push();
                            return resolve();
                        }
                        return reject(res);
                    });
            });
        });
    });
};

Pusher.prototype._getLast = function () {
    var that = this;
    debug('get ' + that.options.lastUrl);
    return new Promise(function (resolve, reject) {
        superagent.get(that.options.lastUrl)
            .end(function(err, res) {
                if(err && res.status !== 404) {
                    debug('Error with last entry url, check your configuration');
                    that.stop();
                    return reject(err);
                }
                if(res.status === 200) {
                    var incr = res.body[that.options.incrCol];
                    if(incr === undefined) {
                        debug('Could not get increment');
                        that.stop();
                        return reject(new Error('Could not get last increment'));
                    }
                    that.incr = incr;
                    return resolve();
                } else if(res.status === 404) {
                    debug('remote table does not exist');
                    that.incr = 0;
                    return resolve();
                } else {
                    return reject(new Error('Unknown error'));
                }
            });
    });
};

Pusher.prototype.stop = function() {
    clearInterval(this._interval);
    this._started = false;
};

exports = module.exports = Pusher;