module.exports = function guid () {
  const S4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)
  return `${S4()}${S4()}-${S4()}-${S4()}-${S4()}-${S4()}${S4()}${S4()}`.toLowerCase()
}
