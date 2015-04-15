var Elastic = require('elasticsearch');
var util = require('util');
var event = require('events');
var Readable = require('stream').Readable;
var _ = require('lodash');
var Log = require('debug');
var err = require('../error');
var sets = require('../sets-plus');

// Enable debugging
Log.enable('elastic-pipe:log');

var log = Log('elastic-pipe:log');
var debug = Log('elastic-pipe:debug');

function ElasticPipe(elasticConfig, indices, type, query)
{
  Readable.call(this, { objectMode: true });

  var self = this;
  this.client = new Elastic.Client(elasticConfig);
  this.query = query;
  this.searchParam = sets.filter({
    index: indices,
    type: type,
    scroll: '1m',
    searchType: 'scan'
  }, function(v) {
    return (v) ? true : false;
  });

  debug('Search param: ' + JSON.stringify(this.searchParam));

  // Puase the stream a while to wait for first search returning scoll id
  this.pause();
  this.client.search(this.searchParam)
    .then(function(res) {
      debug('Scan search responded scroll id ' + res._scroll_id.substr(0, 8));
      self.scrollId = res._scroll_id;

      // Ok now, let's start
      self.resume();
    })
    .catch(err.throwErrMessage)
    .done();
}

util.inherits(ElasticPipe, Readable);


ElasticPipe.prototype._read = function readElastic() {
  var self = this;

  this.client.scroll({
    scrollId: this.scrollId,
    scroll: '1m'
  })
    .then(function(res) {
      // update the scroll id
      self.scrollId = res._scroll_id;

      if (res.hits.hits.length > 0) {
        debug("Sending res " + res.hits.hits.length + " objects to pipe");
        return _.forEach(res.hits.hits, function(hit) {
          self.push(hit);
        });
      } else {
        return self.push(null);
      }
    })
    .catch(err.throwErrMessage)
    .done();
};

module.exports = ElasticPipe;