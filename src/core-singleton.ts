import core from "./core"

export const FrameworkVersion = core.FrameworkVersion
export const rpkgInstance = core.rpkgInstance
export const config = core.config
export const logger = core.logger
export const isDevBuild = core.isDevBuild
export const args = core.args
export const cleanExit = core.cleanExit

export default {
	FrameworkVersion,
	rpkgInstance,
	config,
	logger,
	isDevBuild,
	args,
	cleanExit
}
