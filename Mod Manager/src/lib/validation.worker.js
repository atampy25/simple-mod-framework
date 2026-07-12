import Ajv from "ajv"
import json5 from "json5"
import manifestSchema from "./manifest-schema.json"
import entitySchema from "./entity-schema.json"
import entityPatchSchema from "./entity-patch-schema.json"
import repositorySchema from "./repository-schema.json"
import unlockablesSchema from "./unlockables-schema.json"
import contractSchema from "./contract-schema.json"
import jsonPatchSchema from "./json-patch-schema.json"

const ajvInstance = new Ajv({ strict: false })
const validateManifest = ajvInstance.compile(manifestSchema)
const validateEntity = ajvInstance.compile(entitySchema)
const validateEntityPatch = ajvInstance.compile(entityPatchSchema)
const validateRepository = ajvInstance.compile(repositorySchema)
const validateUnlockables = ajvInstance.compile(unlockablesSchema)
const validateContract = ajvInstance.compile(contractSchema)
const validateJSONPatch = ajvInstance.compile(jsonPatchSchema)

function performValidation(modFolder, manifest, contentFoldersStatus = {}, jsonFilesData = {}) {
	if (!manifest) {
		return [false, "No manifest"]
	}

	if (!validateManifest(manifest)) {
		return [false, `Invalid manifest due to non-matching schema: ${ajvInstance.errorsText(validateManifest.errors)}`]
	}

	const contentDirs = [
		...(manifest.contentFolders || []),
		...(manifest.options || []).flatMap((a) => a?.contentFolders || [])
	]
	for (const contentFolder of contentDirs) {
		if (!contentFoldersStatus[contentFolder]) {
			return [false, `Invalid content folder "${contentFolder}" due to nonexistent path`]
		}
	}

	for (const [file, content] of Object.entries(jsonFilesData)) {
		let parsed = null
		try {
			parsed = json5.parse(content)
		} catch {
			return [false, `Invalid JSON file "${file}" due to invalid syntax`]
		}

		if (file.endsWith("entity.json")) {
			if (parsed?.quickEntityVersion === 3.1 && !validateEntity(parsed)) {
				return [false, `Invalid entity "${file}" due to non-matching schema: ${ajvInstance.errorsText(validateEntity.errors)}`]
			}
		} else if (file.endsWith("entity.patch.json")) {
			if (parsed?.patchVersion === 6 && !validateEntityPatch(parsed)) {
				return [false, `Invalid entity patch "${file}" due to non-matching schema: ${ajvInstance.errorsText(validateEntityPatch.errors)}`]
			}
		} else if (file.endsWith("repository.json")) {
			if (!validateRepository(parsed)) {
				return [false, `Invalid repository "${file}" due to non-matching schema: ${ajvInstance.errorsText(validateRepository.errors)}`]
			}
		} else if (file.endsWith("unlockables.json")) {
			if (!validateUnlockables(parsed)) {
				return [false, `Invalid unlockables "${file}" due to non-matching schema: ${ajvInstance.errorsText(validateUnlockables.errors)}`]
			}
		} else if (file.endsWith("JSON.patch.json")) {
			if (!validateJSONPatch(parsed)) {
				return [false, `Invalid JSON patch "${file}" due to non-matching schema: ${ajvInstance.errorsText(validateJSONPatch.errors)}`]
			}
		} else if (file.endsWith("contract.json")) {
			if (!validateContract(parsed)) {
				return [false, `Invalid contract "${file}" due to non-matching schema: ${ajvInstance.errorsText(validateContract.errors)}`]
			}
		}
	}

	return [true, ""]
}

self.onmessage = (event) => {
	const { id, modFolder, manifest, contentFoldersStatus, jsonFilesData } = event.data || {}
	const result = performValidation(modFolder, manifest, contentFoldersStatus, jsonFilesData)
	self.postMessage({ id, result })
}
