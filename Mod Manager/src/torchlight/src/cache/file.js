const md5 =  require('md5');
const path =  require('path');
const fs =  require('fs-extra');

/**
 * @param options
 * @constructor
 */
function File (options = {}) {
  if (!options.directory) {
    throw new Error('No cache directory specified.')
  }

  this.directory = path.resolve(options.directory)

  fs.ensureDirSync(this.directory)
}

/**
 * Get an item from the cache.
 *
 * @param {string} key
 * @param {*} def
 * @return {*}
 */
File.prototype.get = function (key, def) {
  if (!fs.pathExistsSync(this.filename(key))) {
    return def
  }

  const entry = fs.readJsonSync(this.filename(key))

  if (Date.now() / 1000 > entry.expires) {
    this.delete(key)

    return def
  }

  return entry.value
}

/**
 * Set an item in the cache.
 *
 * @param {string} key
 * @param {*} value
 * @param {number} ttlSeconds
 */
File.prototype.set = function (key, value, ttlSeconds = 60 * 24 * 7) {
  fs.writeJsonSync(this.filename(key), {
    expires: (Date.now() / 1000) + ttlSeconds,
    value: value
  })
}

/**
 * Remove a key from the cache.
 *
 * @param key
 */
File.prototype.delete = function (key) {
  fs.removeSync(this.filename(key))
}

/**
 * Clear the cache.
 */
File.prototype.clear = function () {
  fs.removeSync(this.directory)
}

/**
 * @param {string} key
 * @return {string}
 */
File.prototype.filename = function (key) {
  return path.join(this.directory, md5(key) + '.json')
}

module.exports = File