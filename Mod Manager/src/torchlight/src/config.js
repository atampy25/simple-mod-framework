const fs =  require('fs-extra');
const path =  require('path');
const FileCache =  require('./cache/file');
const MemoryCache =  require('./cache/memory');

/**
 * @param {string|object} config
 * @return {*}w
 */
module.exports.makeConfig = function makeConfig (config) {
  // By convention, look in the root directory for
  // a torchlight.config.js file.
  if (config === undefined || config === '') {
    config = 'torchlight.config.js'
  }

  if (typeof config === 'string') {
    config = await loadConfigFromFile(config)
  }

  return config || {}
}

/**
 * @param file
 * @return {Promise<{}|*>}
 */
async function loadConfigFromFile (file) {
  file = path.resolve(file)

  if (!fs.pathExistsSync(file)) {
    return {}
  }

  let config

  try {
    config = await import(file)
  } catch (e) {
    config = {}
  }

  if (Object.prototype.hasOwnProperty.call(config, 'default')) {
    return config.default
  }

  return config
}

/**
 * Make a cache to hold highlighted blocks.
 *
 * @return {Cache}
 */
module.exports.makeCache = function makeCache (config) {
  const cache = config?.cache

  // Make a file cache if we're given a directory.
  if (cache && typeof cache === 'string') {
    return new FileCache({
      directory: cache
    })
  }

  // Use the cache they have provided, or default to an in-memory cache.
  return cache || new MemoryCache()
}
