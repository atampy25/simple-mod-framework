let store = {}

function Memory () {
  //
}

/**
 * Get an item from the cache.
 *
 * @param {string} key
 * @param {*} def
 * @return {*}
 */
Memory.prototype.get = function (key, def) {
  if (!Object.prototype.hasOwnProperty.call(store, key)) {
    return def
  }

  const entry = store[key]

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
Memory.prototype.set = function (key, value, ttlSeconds = 60 * 24 * 7) {
  store[key] = {
    expires: (Date.now() / 1000) + ttlSeconds,
    value: value
  }
}

/**
 * Remove a key from the cache.
 *
 * @param key
 */
Memory.prototype.delete = function (key) {
  delete store[key]
}

/**
 * Clear the cache.
 */
Memory.prototype.clear = function () {
  store = {}
}

module.exports = Memory