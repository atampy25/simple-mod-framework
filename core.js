const FrameworkVersion = "1.4.2"

const Sentry = require("@sentry/node")
const Tracing = require("@sentry/tracing")

const fs = require("fs-extra")
const path = require("path")
const md5File = require("md5-file")
const json5 = require("json5")

const RPKG = require("./rpkg")
const rpkgInstance = new RPKG.RPKGInstance()

const config = json5.parse(String(fs.readFileSync(path.join(process.cwd(), "config.json"))))
if (typeof config.outputConfigToAppDataOnDeploy == "undefined") {
	config.outputConfigToAppDataOnDeploy = true
	fs.writeFileSync(path.join(process.cwd(), "config.json"), json5.stringify(config))
} // Backwards compatibility - output config to appdata on deploy
if (typeof config.retailPath == "undefined") {
	config.retailPath = "..\\Retail"
	fs.writeFileSync(path.join(process.cwd(), "config.json"), json5.stringify(config))
} // Backwards compatibility - retail path

if (config.runtimePath == "..\\Runtime" && fs.existsSync(path.join(config.retailPath, "Runtime", "chunk0.rpkg"))) {
	config.runtimePath = "..\\Retail\\Runtime"
	fs.writeFileSync(path.join(process.cwd(), "config.json"), json5.stringify(config))
	fs.copyFileSync(path.join(process.cwd(), "cleanMicrosoftThumbs.dat"), path.join(process.cwd(), "cleanThumbs.dat"))
} // Automatically set runtime path and fix clean thumbs if using MS platform

if (typeof config.reportErrors == "undefined") {
	config.reportErrors = false
	config.errorReportingID = null
} // Do not report errors if no preference is set

config.runtimePath = path.resolve(process.cwd(), config.runtimePath)
config.retailPath = path.resolve(process.cwd(), config.retailPath)

module.exports = {
	Sentry,
	Tracing,
	FrameworkVersion,
	rpkgInstance,
	cleanExit,
	config
}

const { logger } = require("./utils")

let sentryTransaction = {
	startChild(...args) {
		return {
			startChild(...args) {
				return {
					startChild(...args) {
						return {
							startChild(...args) {
								return {
									startChild(...args) {
										return {
											startChild(...args) {
												return {
													startChild(...args) {
														return {
															finish() {}
														}
													},
													finish() {}
												}
											},
											finish() {}
										}
									},
									finish() {}
								}
							},
							finish() {}
						}
					},
					finish() {}
				}
			},
			finish() {}
		}
	},
	finish() {}
}

if (config.reportErrors) {
	logger.info("Initialising error reporting")

	Sentry.init({
		dsn: "https://464c3dd1424b4270803efdf7885c1b90@o1144555.ingest.sentry.io/6208676",
		release: FrameworkVersion,
		environment: "production",
		tracesSampleRate: 1.0,
		integrations: [
			new Sentry.Integrations.OnUncaughtException({
				onFatalError: (err) => {
					logger.error("Uncaught exception! " + err, false)
					logger.info("Reporting the error!")
					cleanExit()
				}
			}),
			new Sentry.Integrations.OnUnhandledRejection({
				mode: "strict"
			})
		]
	})

	Sentry.setUser({
		id: config.errorReportingID
	})

	sentryTransaction = Sentry.startTransaction({
		op: "deploy",
		name: "Deploy"
	})

	Sentry.configureScope((scope) => {
		// @ts-ignore
		scope.setSpan(sentryTransaction)
	})

	Sentry.setTag(
		"game_hash",
		fs.existsSync(path.join(config.retailPath, "Runtime", "chunk0.rpkg"))
			? md5File.sync(path.join(config.retailPath, "..", "MicrosoftGame.Config"))
			: md5File.sync(path.join(config.runtimePath, "..", "Retail", "HITMAN3.exe"))
	)
}

function configureSentryScope(transaction) {
	if (config.reportErrors)
		Sentry.configureScope((scope) => {
			// @ts-ignore
			scope.setSpan(transaction)
		})
}

function cleanExit() {
	if (config.reportErrors) {
		Sentry.getCurrentHub().getScope().getTransaction().finish()

		sentryTransaction.finish()
	}

	Sentry.close(2000).then(() => {
		rpkgInstance.exit()
		try {
			global.currentWorkerPool.destroy()
		} catch {}
		process.exit()
	})
}

module.exports.sentryTransaction = sentryTransaction
module.exports.configureSentryScope = configureSentryScope
