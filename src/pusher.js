'use strict';

var debug = require('debug')('pusher');
var PromiseWrapper = require('./util/PromiseWrapper');
var sqlite = require('sqlite3');
var superagent = require('superagent');

function Pusher(options) {
    this.options = options;
    this.name = /[^\/]*$/.exec(this.options.database)[0];
    this.last = Promise.resolve();
    this.queueLength = 0;
    this.incr = 0;
    this.isReset = false;
}

Pusher.prototype.start = function () {
    var that = this;
    if (this._started) {
        that._log('Cannot start, already started');
        return;
    }
    // open database
    that._log('opening database');
    var db = new sqlite.cached.Database(this.options.database);
    this.database = new PromiseWrapper(db, ['all', 'run', 'get']);
    this._queue(function () {
        return that.database.run('PRAGMA synchronous = OFF; PRAGMA journal_mode = MEMORY;');
    });

    this._reset();

    this._interval = setInterval(function () {
        if (that.queueLength === 0 && !that.isReset) {
            that._log('interval: push');
            that._push();
        } else {
            that._log('interval: reset');
            that._reset();
        }
    }, that.options.interval);
    this._started = true;
};

Pusher.prototype._reset = function () {
    this._queue(this._getLast.bind(this));
    this._push();
};

Pusher.prototype._log = function (msg) {
    debug(this.name + ': ' + msg);
};

Pusher.prototype._queue = function (fn) {
    var that = this;
    this.queueLength++;
    this.last = this.last.then(fn).then(function (arg) {
        that.queueLength--;
        return arg;
    }, function (arg) {
        that._log('queue element failed' + arg);
        that.queueLength--;
        return arg;
    });
};

Pusher.prototype._push = function () {
    var that = this;
    this._queue(function () {
        var query = 'select * from ' + that.options.table + ' where ' + that.options.incrCol + '>' + that.incr + ' order by ' + that.options.incrCol + ' ASC limit ' + that.options.chunkSize;
        that._log(query);
        return that.database.all(query).then(function (r) {
            var incr;
            if (r.length) {
                that._log('send ' + r.length + ' elements');
                incr = r[r.length - 1][that.options.incrCol];
            } else {
                that._log('no element to send');
                return;
            }

            return new Promise(function (resolve, reject) {

                superagent.put(that.options.pushUrl)
                    .send(r)
                    .end(function (err, res) {
                        if (err) return reject(err);
                        if (res.status === 200) {
                            that.incr = incr;
                            that._log('incr ' + incr);
                            that._push();
                            that.isReset = false;
                            return resolve();
                        }
                        that.isReset = true;
                        console.log(res);
                        return reject(res);
                    });
            });
        });
    });
};

Pusher.prototype._getLast = function () {
    var that = this;
    that._log('get last from remote database');
    return new Promise(function (resolve, reject) {
        superagent.get(that.options.lastUrl)
            .end(function (err, res) {
                if (err) {
                    that._log('Error with last entry url, check your configuration');
                    return reject(err);
                }
                if (res.status === 200) {
                    var incr = res.body[that.options.incrCol];
                    if (incr === undefined) {
                        that._log('Could not get increment');
                        return reject(new Error('Could not get last increment'));
                    }
                    that.incr = incr;
                    that._log('incr ' + incr);
                    return resolve();
                } else if (res.status === 404) {
                    that._log('404 returned, remote table does not exist');
                    that.incr = 0;
                    that._log('incr 0');
                    return resolve();
                } else {
                    return reject(new Error('Unknown error'));
                }
            });
    }).then(function () {
            that.isReset = false;
            return Promise.resolve();
        }, function (err) {
            that.isReset = true;
            return Promise.reject(err);
        });
};

Pusher.prototype.stop = function () {
    clearInterval(this._interval);
    this._started = false;
};

exports = module.exports = Pusher;