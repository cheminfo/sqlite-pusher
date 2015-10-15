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
}

Pusher.prototype.start = function () {
    var that = this;
    if (this._started) {
        that._log('Cannot start, already started');
        return;
    }
    // open database
    that._log('opening database');
    var db = new sqlite.Database(this.options.database, sqlite.OPEN_READONLY, function(err) {
        if(err) {
            that._log('Error opening database. Retrying in 30 seconds');
            setTimeout(function() {
                that.start();
            }, 30000);
            return;
        }
        that.database = new PromiseWrapper(db, ['all', 'run', 'get']);
        that._queue(function () {
            return that.database.run('PRAGMA synchronous = OFF; PRAGMA journal_mode = MEMORY;');
        });

        that._reset();

        setInterval(function () {
            that._log('interval: reset');
            that._reset();
        }, that.options.interval);
        that._started = true;
    });

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
    });
};

exports = module.exports = Pusher;