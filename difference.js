const { logger } = require("./core-singleton")

/**
 * @param {{ [x: string]: { hash: string, dependencies: Array<string>, affected: Array<string> }; }} oldMap
 * @param {{ [x: string]: { hash: string, dependencies: Array<string>, affected: Array<string> }; }} newMap
 */
module.exports = async function difference(oldMap, newMap) {
	logger.info("Invalidating cache")

	const invalidFiles = []

	const invalidData = []
	const validData = []

	logger.verbose(`changedFiles`)

	const changedFiles = []
	for (const [filePath, newData] of Object.entries(newMap)) {
		const oldData = oldMap[filePath]

		if (oldData && oldData.hash != newData.hash) {
			changedFiles.push(filePath)
		}
	}

	logger.verbose(`invalidatedHashes`)

	const invalidatedHashes = []
	for (const changedFile of changedFiles) {
		invalidFiles.push(changedFile) // Must redeploy the changed file

		oldMap[changedFile] && invalidatedHashes.push(...oldMap[changedFile].affected)

		invalidatedHashes.push(...newMap[changedFile].affected)
	}

	logger.verbose(`filePath, newData`)

	for (const [filePath, newData] of Object.entries(newMap)) {
		const oldData = oldMap[filePath]

		if (invalidatedHashes.some((a) => oldData.dependencies.includes(a) || newData.dependencies.includes(a))) {
			invalidFiles.push(filePath) // Must redeploy any files that depend on a changed file
		}
	}

	logger.verbose(`filePath, data`)

	for (const [filePath, data] of Object.entries(newMap)) {
		if (!invalidFiles.includes(filePath)) {
			validData.push({ filePath, data })
		} else {
			invalidData.push({ filePath, data })
		}
	}

	return {
		invalidData,
		cachedData: validData
	}
}
