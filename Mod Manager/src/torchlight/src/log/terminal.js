const chalk =  require('chalk');

let silent = false

function log (fn, args) {
  args = Array.from(args)

  if (!silent) {
    console.log(fn(args.shift()), ...args)
  }
}

function error () {
  log(chalk.bold.bgRed, arguments)
}

function info () {
  log(chalk.green, arguments)
}

function silence (silence = true) {
  silent = silence
}

module.exports = {
  error,
  info,
  silence
}
