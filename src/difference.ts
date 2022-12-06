import { logger } from "./core-singleton"

export default async function difference(
	oldMap: { [x: string]: { hash: string; dependencies: Array<string>; affected: Array<string> } },
	newMap: { [x: string]: { hash: string; dependencies: Array<string>; affected: Array<string> } }
) {
	await logger.info("Invalidating cache")

	const invalidFiles = []

	const invalidData = []
	const validData = []

	await logger.verbose("Calculating changed files")

	const changedFiles = []
	for (const [filePath, newData] of Object.entries(newMap)) {
		const oldData = oldMap[filePath]

		if (!oldData || oldData.hash != newData.hash) {
			changedFiles.push(filePath)
		}
	}

	for (const [filePath, oldData] of Object.entries(oldMap)) {
		const newData = newMap[filePath]

		if (!newData) {
			changedFiles.push(filePath)
		}
	}

	await logger.verbose("Calculating hashes to invalidate")

	const invalidatedHashes: string[] = []
	for (const changedFile of changedFiles) {
		invalidFiles.push(changedFile)

		oldMap[changedFile] && invalidatedHashes.push(...oldMap[changedFile].affected)
		newMap[changedFile] && invalidatedHashes.push(...newMap[changedFile].affected)
	}

	await logger.verbose("Invalidating dependencies")

	// do ten cycles of propagation
	for (let i = 0; i < 10; i++) {
		for (const [filePath, newData] of Object.entries(newMap)) {
			const oldData = oldMap[filePath]

			if (invalidatedHashes.some((a) => (oldData || { dependencies: [] }).dependencies.includes(a) || newData.dependencies.includes(a))) {
				invalidatedHashes.push(...[...(oldData || { affected: [] }).affected, ...newData.affected])
			}
		}
	}

	for (const [filePath, newData] of Object.entries(newMap)) {
		const oldData = oldMap[filePath]

		if (invalidatedHashes.some((a) => (oldData || { dependencies: [] }).dependencies.includes(a) || newData.dependencies.includes(a))) {
			invalidFiles.push(filePath)
		}
	}

	await logger.verbose("Summarising")

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
