import type { Transaction } from "@sentry/tracing"
import core from "./core"

export const FrameworkVersion = core.FrameworkVersion
export const rpkgInstance = core.rpkgInstance
export const config = core.config
export const logger = core.logger
export const isDevBuild = core.isDevBuild
export const args = core.args
export const interoperability = {} as {
	sentryTransaction: Transaction
	cleanExit: () => void
}

export default {
	FrameworkVersion,
	rpkgInstance,
	config,
	logger,
	isDevBuild,
	args,
	interoperability
}
