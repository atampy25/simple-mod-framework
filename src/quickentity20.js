/** @typedef {Object} TEMP
* @property {Number} blueprintIndexInResourceHeader
* @property {Array} externalSceneTypeIndicesInResourceHeader
* @property {Array} propertyOverrides
* @property {Number} rootEntityIndex
* @property {Array} [subEntities]
* @property {Array} [entityTemplates]
* @property {Number} subType
*/

/** @typedef {Object} TBLU
* @property {Array} externalSceneTypeIndicesInResourceHeader
* @property {Array} inputPinForwardings
* @property {Array} outputPinForwardings
* @property {Array} overrideDeletes
* @property {Array} [pinConnectionOverrideDeletes]
* @property {Array} [pinConnectionOverrides]
* @property {Array} pinConnections
* @property {Number} rootEntityIndex
* @property {Array} [subEntities]
* @property {Array} [entityTemplates]
* @property {Number} subType
*/

/** @typedef {Object} HashMeta
* @property {Number} hash_offset
* @property {Array} hash_reference_data
* @property {Number} hash_reference_table_dummy
* @property {Number} hash_reference_table_size
* @property {String} hash_resource_type
* @property {Number} hash_size
* @property {Number} hash_size_final
* @property {Number} hash_size_in_memory
* @property {Number} hash_size_in_video_memory
* @property {String} hash_value
*/

/** @typedef {object} Entity
 * @property {string} tempHash
 * @property {string} tbluHash
 * @property {string} rootEntity
 * @property {Object.<string, SubEntity>} entities
 * @property {string[]} externalScenes
 * @property {object[]} propertyOverrides
 * @property {object[]} overrideDeletes
 * @property {object[]} pinConnectionOverrides
 * @property {object[]} pinConnectionOverrideDeletes
 * @property {number} subType
 * @property {number} quickEntityVersion
 */

/** @typedef {object} SubEntity
 * @property {object} parent
 * @property {string} parent.ref
 * @property {string} parent.exposedEntity
 * @property {string} parent.externalScene
 * @property {string} parent.entityID

 * @property {string} name
 * @property {string} template
 * @property {string} [templateFlag]
 * @property {string} blueprint
 * @property {boolean} editorOnly
 * @property {object[]} platformSpecificPropertyValues
 * @property {array[]|string[]|object[]} entitySubsets

 * @property {Object.<string, { type: string; value: any; }>} properties
 * @property {object[]} [propertyValues]

 * @property {Object.<string, { type: string; value: any; }>} postInitProperties
 * @property {object[]} [postInitPropertyValues]

 * @property {object[]} propertyAliases

 * @property {object[]} events
 * @property {string} events.onEvent
 * @property {string} events.shouldTrigger
 * @property {string} events.onEntity
 * @property {object} [events.value]

 * @property {object[]} inputCopying
 * @property {string} inputCopying.whenTriggered
 * @property {string} inputCopying.alsoTrigger
 * @property {string} inputCopying.onEntity
 * @property {object} [inputCopying.value]

 * @property {object[]} outputCopying
 * @property {string} outputCopying.onEvent
 * @property {string} outputCopying.propagateEvent
 * @property {string} outputCopying.onEntity
 * @property {object} [outputCopying.value]

 * @property {object} exposedEntities
 * @property {object} exposedInterfaces
*/

let electron, Swal, storage;

// @ts-ignore
if (!module.parent) {
	electron = require("electron")
}
const fs = require('fs')
const path = require("path")
const LosslessJSON = require('lossless-json')
// @ts-ignore
if (!module.parent) {
	Swal = require("sweetalert2")
}
const { execSync } = require("child_process")
const Decimal = require('decimal.js').Decimal
// @ts-ignore
if (!module.parent) {
	storage = require('electron-json-storage')
}
const { promisify } = require("util")
const rfc6902 = require('rfc6902')

var THREE = require("./three-onlymath.min.js")

const QuickEntityVersion = 2.0

// oi sieni shut up yeah?
// you've got ur select box
// - Atampy26

/**
 * @param {{ nPropertyID?: string|number; value: any; }} property
 * @param {TEMP} TEMP
 * @param {TBLU} TBLU
 * @param {HashMeta} TEMPmeta
 * @param {HashMeta} TBLUmeta
 * @param {Entity} entity
 * @param {{ name: string; }} entry
 */
async function parseProperty(property, TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry) {
	if (property.value["$type"].startsWith("TArray<")) {
		for (var prop in property.value["$val"]) {
			var usedProp = {}
			usedProp.nPropertyID = ""
			usedProp.value = {
				"$type": property.value["$type"].slice(7, -1),
				"$val": property.value["$val"][prop]
			}

			parseProperty(usedProp, TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry)

			property.value["$val"][prop] = usedProp.value["$val"]
		}

		return
	}

	if (property.value) {
		switch (property.value["$type"]) {
			case "SEntityTemplateReference":
				try {
					if (property.value["$val"].exposedEntity.length || property.value["$val"].externalSceneIndex != -1) {
						property.value["$val"] = {
							"ref": property.value["$val"].entityIndex == -2 ? "SPECIAL: Use EntityID" : new Decimal(TBLU.subEntities[property.value["$val"].entityIndex].entityId.value).toHex().substring(2),
							"entityID": new Decimal(property.value["$val"].entityID.value).toHex().substring(2),
							"externalScene": property.value["$val"].externalSceneIndex != -1 ? TEMPmeta.hash_reference_data[TEMP.externalSceneTypeIndicesInResourceHeader[property.value["$val"].externalSceneIndex]].hash : "SPECIAL: None",
							"exposedEntity": property.value["$val"].exposedEntity
						}
					} else {
						property.value["$val"] = property.value["$val"].entityIndex == -2 ? "SPECIAL: Use EntityID" : property.value["$val"].entityIndex == -1 ? "SPECIAL: None" : new Decimal(TBLU.subEntities[property.value["$val"].entityIndex].entityId.value).toHex().substring(2)
					}
				} catch (e) {
					console.log("Error in custom property parse (SEntityTemplateReference type) for " + entry.name + ": " + e)
				}
				break;

			case "ZRuntimeResourceID":
				try {
					if (property.value["$val"]["m_IDLow"] == 4294967295 && property.value["$val"]["m_IDHigh"] == 4294967295) {
						property.value["$val"] = "SPECIAL: None"
					} else {
						if (TEMPmeta["hash_reference_data"][property.value["$val"]["m_IDLow"]].flag != "1F") {
							property.value["$val"] = {
								resource: TEMPmeta["hash_reference_data"][property.value["$val"]["m_IDLow"]].hash,
								flag: TEMPmeta["hash_reference_data"][property.value["$val"]["m_IDLow"]].flag
							}
						} else {
							property.value["$val"] = TEMPmeta["hash_reference_data"][property.value["$val"]["m_IDLow"]].hash
						}
					}
				} catch (e) {
					console.log("Error in custom property parse (ZRuntimeResourceID type) for " + entry.name + ": " + e)
				}
				break;

			case "SMatrix43":
				try {
					var matrix = new THREE.Matrix4()
					matrix.elements[0] = new Decimal(property.value["$val"].XAxis.x.value)
					matrix.elements[4] = new Decimal(property.value["$val"].XAxis.y.value)
					matrix.elements[8] = new Decimal(property.value["$val"].XAxis.z.value)

					matrix.elements[1] = new Decimal(property.value["$val"].YAxis.x.value)
					matrix.elements[5] = new Decimal(property.value["$val"].YAxis.y.value)
					matrix.elements[9] = new Decimal(property.value["$val"].YAxis.z.value)

					matrix.elements[2] = new Decimal(property.value["$val"].ZAxis.x.value)
					matrix.elements[6] = new Decimal(property.value["$val"].ZAxis.y.value)
					matrix.elements[10] = new Decimal(property.value["$val"].ZAxis.z.value)

					var euler = new THREE.Euler(0, 0, 0, "XYZ").setFromRotationMatrix(matrix)

					property.value["$val"] = {
						rotation: {
							x: euler["_x"] * THREE.Math.RAD2DEG,
							y: euler["_y"] * THREE.Math.RAD2DEG,
							z: euler["_z"] * THREE.Math.RAD2DEG
						},
						position: {
							x: property.value["$val"].Trans.x,
							y: property.value["$val"].Trans.y,
							z: property.value["$val"].Trans.z
						}
					}
				} catch (e) {
					console.log("Error in custom property parse (SMatrix43 type) for " + entry.name + ": " + e)
				}
				break;

			case "ZGuid":
				try {
					property.value["$val"] = `${Number(property.value["$val"]["_a"].value).toString(16).padStart(2,"0")}-${Number(property.value["$val"]["_b"].value).toString(16).padStart(2,"0")}-${Number(property.value["$val"]["_c"].value).toString(16).padStart(2,"0")}-${Number(property.value["$val"]["_d"].value).toString(16).padStart(2,"0")}${Number(property.value["$val"]["_e"].value).toString(16).padStart(2,"0")}-${Number(property.value["$val"]["_f"].value).toString(16).padStart(2,"0")}${Number(property.value["$val"]["_g"].value).toString(16).padStart(2,"0")}${Number(property.value["$val"]["_h"].value).toString(16).padStart(2,"0")}${Number(property.value["$val"]["_i"].value).toString(16).padStart(2,"0")}${Number(property.value["$val"]["_j"].value).toString(16).padStart(2,"0")}${Number(property.value["$val"]["_k"].value).toString(16).padStart(2,"0")}`
				} catch (e) {
					console.log("Error in custom property parse (ZGuid type) for " + entry.name + ": " + e)
				}
				break;

			case "SColorRGB":
				try {
					property.value["$val"] = "#" + (Math.round(Number(property.value["$val"].r.value) * 255)).toString(16).padStart(2,"0") + (Math.round(Number(property.value["$val"].g.value) * 255)).toString(16).padStart(2,"0") + (Math.round(Number(property.value["$val"].b.value) * 255)).toString(16).padStart(2,"0")
				} catch (e) {
					console.log("Error in custom property parse (SColorRGB type) for " + entry.name + ": " + e)
				}
				break;

			case "SColorRGBA":
				try {
					property.value["$val"] = "#" + (Math.round(Number(property.value["$val"].r.value) * 255)).toString(16).padStart(2,"0") + (Math.round(Number(property.value["$val"].g.value) * 255)).toString(16).padStart(2,"0") + (Math.round(Number(property.value["$val"].b.value) * 255)).toString(16).padStart(2,"0") + (Math.round(Number(property.value["$val"].a.value) * 255)).toString(16).padStart(2,"0")
				} catch (e) {
					console.log("Error in custom property parse (SColorRGBA type) for " + entry.name + ": " + e)
				}
				break;

			// case "ZGameTime":
			//     try {
			//         property.value["$val"] = new LosslessJSON.LosslessNumber(property.value["$val"].value / 1024 / 1024)
			//         property.value["$type"] = "ZGameTimeSeconds"
			//     } catch (e) {
			//         console.log("Error in custom property parse (ZGameTime type) for " + entry.name + ": " + e)
			//     }
			//     break;
		}
	}
}

/**
 * @param {[name: string|number, value: { type: any; value: any; }]} property
 * @param {string} propertyValues
 * @param {TEMP} TEMP
 * @param {TBLU} TBLU
 * @param {HashMeta} TEMPmeta
 * @param {HashMeta} TBLUmeta
 * @param {Entity} entity
 * @param {any} entry
 * @param {{}} findEntityCache
 * @returns {Promise<{nPropertyID: string|number; value: { $type: string; $val: any }}>}
 */
async function rebuildSpecificProp(property, propertyValues, TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry, findEntityCache) {
	switch (property[1].type) {
		// case "ZGameTimeSeconds":
		//     return {
		//         "nPropertyID": property.name,
		//         "value": {
		//             "$type": "ZGameTime",
		//             "$val": new LosslessJSON.LosslessNumber(Number(property.value.value) * 1024 * 1024)
		//         }
		//     }
		//     break

		case "SColorRGB":
			return {
				"nPropertyID": property[0],
				"value": {
					"$type": "SColorRGB",
					"$val": {
						"r": new LosslessJSON.LosslessNumber((parseInt(property[1].value.substring(1).slice(0,2), 16) / 255).toString()),
						"g": new LosslessJSON.LosslessNumber((parseInt(property[1].value.substring(1).slice(2,4), 16) / 255).toString()),
						"b": new LosslessJSON.LosslessNumber((parseInt(property[1].value.substring(1).slice(4,6), 16) / 255).toString())
					}
				}
			}
			break
		case "SColorRGBA":
			return {
				"nPropertyID": property[0],
				"value": {
					"$type": "SColorRGBA",
					"$val": {
						"r": new LosslessJSON.LosslessNumber((parseInt(property[1].value.substring(1).slice(0,2), 16) / 255).toString()),
						"g": new LosslessJSON.LosslessNumber((parseInt(property[1].value.substring(1).slice(2,4), 16) / 255).toString()),
						"b": new LosslessJSON.LosslessNumber((parseInt(property[1].value.substring(1).slice(4,6), 16) / 255).toString()),
						"a": new LosslessJSON.LosslessNumber((parseInt(property[1].value.substring(1).slice(6,8), 16) / 255).toString())
					}
				}
			}
			break
		case "ZGuid":
			return {
				"nPropertyID": property[0],
				"value": {
					"$type": "ZGuid",
					"$val": {
						"_a": parseInt(property[1].value.split("-")[0], 16),
						"_b": parseInt(property[1].value.split("-")[1], 16),
						"_c": parseInt(property[1].value.split("-")[2], 16),
						"_d": parseInt(property[1].value.split("-")[3].slice(0,2), 16),
						"_e": parseInt(property[1].value.split("-")[3].slice(2,4), 16),
						"_f": parseInt(property[1].value.split("-")[4].slice(0,2), 16),
						"_g": parseInt(property[1].value.split("-")[4].slice(2,4), 16),
						"_h": parseInt(property[1].value.split("-")[4].slice(4,6), 16),
						"_i": parseInt(property[1].value.split("-")[4].slice(6,8), 16),
						"_j": parseInt(property[1].value.split("-")[4].slice(8,10), 16),
						"_k": parseInt(property[1].value.split("-")[4].slice(10,12), 16)
					}
				}
			}
			break
		case "SMatrix43":
			var matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(new Decimal(property[1].value.rotation.x.value).times(THREE.Math.DEG2RAD), new Decimal(property[1].value.rotation.y.value).times(THREE.Math.DEG2RAD), new Decimal(property[1].value.rotation.z.value).times(THREE.Math.DEG2RAD), "XYZ"))

			return {
				"nPropertyID": property[0],
				"value": {
					"$type": "SMatrix43",
					"$val": {
						"XAxis": {
							"x": Number(matrix.elements[0]),
							"y": Number(matrix.elements[4]),
							"z": Number(matrix.elements[8])
						},
						"YAxis": {
							"x": Number(matrix.elements[1]),
							"y": Number(matrix.elements[5]),
							"z": Number(matrix.elements[9])
						},
						"ZAxis": {
							"x": Number(matrix.elements[2]),
							"y": Number(matrix.elements[6]),
							"z": Number(matrix.elements[10])
						},
						"Trans": {
							"x": property[1].value.position.x,
							"y": property[1].value.position.y,
							"z": property[1].value.position.z
						}
					}
				}
			}
			break
		case "SEntityTemplateReference":
			return {
				"nPropertyID": property[0],
				"value": {
					"$type": property[1].type,
					"$val": typeof property[1].value == "object" && property[1].value.ref ? {
						"entityID": new LosslessJSON.LosslessNumber(new Decimal("0x" + property[1].value.entityID).toFixed()),
						"externalSceneIndex": property[1].value.externalScene,
						"entityIndex": findEntity(findEntityCache, property[1].value.ref),
						"exposedEntity": property[1].value.exposedEntity
					} : {
						"entityID": new LosslessJSON.LosslessNumber("18446744073709551615"),
						"externalSceneIndex": -1,
						"entityIndex": findEntity(findEntityCache, property[1].value),
						"exposedEntity": ""
					}
				}
			}
			break
		case "ZRuntimeResourceID":
			if (property[1].value == "SPECIAL: None") {
				return {
					"nPropertyID": property[0],
					"value": {
						"$type": property[1].type,
						"$val": {
							"m_IDHigh": 4294967295,
							"m_IDLow": 4294967295
						}
					}
				}

				break
			}

			if (!TEMPmeta.hash_reference_data.some(a => a.hash == (property[1].value.flag ? property[1].value.resource : property[1].value))) {
				TEMPmeta.hash_reference_data.push({
					"hash": property[1].value.flag ? property[1].value.resource : property[1].value,
					"flag": property[1].value.flag ? property[1].value.flag : "1F"
				})
			}

			return {
				"nPropertyID": property[0],
				"value": {
					"$type": property[1].type,
					"$val": {
						"m_IDHigh": 0,
						"m_IDLow": TEMPmeta["hash_reference_data"].findIndex(a => a.hash == (property[1].value.flag ? property[1].value.resource : property[1].value))
					}
				}
			}
			break
		default:
			return {
				"nPropertyID": property[0],
				"value": property[1].type ? {
					"$type": property[1].type,
					"$val": property[1].value
				} : undefined
			}
			break
	}
}

/**
 * @param {[name: string|number, value: { type: string; value: any; }]} property
 * @param {string} propertyValues
 * @param {TEMP} TEMP
 * @param {TBLU} TBLU
 * @param {HashMeta} TEMPmeta
 * @param {HashMeta} TBLUmeta
 * @param {Entity} entity
 * @param {any} entry
 * @param {number} index
 * @param {{}} findEntityCache
 */
async function rebuildProperty(property, propertyValues, TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry, index, findEntityCache, isOverrides = false) {
	if (isOverrides) {
		// @ts-ignore
		property = [property.name, {type: property.type, value: property.value}]
	}

	if (property[1].type.startsWith("TArray<")) {
		var propertyToAdd = {
			"nPropertyID": property[0],
			"value": property[1].type ? {
				"$type": property[1].type,
				"$val": property[1].value
			} : undefined
		}

		for (var prop in propertyToAdd.value["$val"]) {
			var usedProp = []
			usedProp.push("")
			usedProp.push({
				type: property[1].type.slice(7, -1),
				value: propertyToAdd.value["$val"][prop]
			})

			// @ts-ignore
			propertyToAdd.value["$val"][prop] = (await rebuildSpecificProp(usedProp, propertyValues, TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry, findEntityCache)).value["$val"]
		}

		if (isOverrides) {
			TEMP["propertyOverrides"][index][propertyValues] = propertyToAdd
		} else {
			TEMP.subEntities[index][propertyValues].push(propertyToAdd)
		}

		return
	}

	var propertyToAdd = await rebuildSpecificProp(property, propertyValues, TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry, findEntityCache)

	// @ts-ignore
	if (!isNaN(parseInt(propertyToAdd.nPropertyID))) {
		// @ts-ignore
		propertyToAdd.nPropertyID = parseInt(propertyToAdd.nPropertyID)
	}

	if (isOverrides) {
		TEMP["propertyOverrides"][index][propertyValues] = propertyToAdd
	} else {
		TEMP.subEntities[index][propertyValues].push(propertyToAdd)
	}
}

async function convert(automateGame = false, automateTempPath = false, automateTempMetaPath = false, automateTbluPath = false, automateTbluMetaPath = false, automateQNPath = false) {

const tempPath = automateTempPath ? automateTempPath : electron.remote.dialog.showOpenDialogSync({
	title: "Select the TEMP's JSON",
	buttonLabel: "Select",
	filters: [{ name: 'JSON files', extensions: ['TEMP.json'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0]

/** @type {TEMP} */
const TEMP = LosslessJSON.parse(String(fs.readFileSync(tempPath)))

/** @type {HashMeta} */
const TEMPmeta = LosslessJSON.parse(String(fs.readFileSync(automateTempMetaPath ? automateTempMetaPath : electron.remote.dialog.showOpenDialogSync({
	title: "Select the TEMP's meta's JSON",
	buttonLabel: "Select",
	filters: [{ name: 'JSON files', extensions: ['TEMP.meta.json'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0])))

const tbluPath = automateTbluPath ? automateTbluPath : electron.remote.dialog.showOpenDialogSync({
	title: "Select the TBLU's JSON",
	buttonLabel: "Select",
	filters: [{ name: 'JSON files', extensions: ['TBLU.json'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0]

/** @type {TBLU} */
const TBLU = LosslessJSON.parse(String(fs.readFileSync(tbluPath)))

/** @type {HashMeta} */
const TBLUmeta = LosslessJSON.parse(String(fs.readFileSync(automateTbluMetaPath ? automateTbluMetaPath : electron.remote.dialog.showOpenDialogSync({
	title: "Select the TBLU's meta's JSON",
	buttonLabel: "Select",
	filters: [{ name: 'JSON files', extensions: ['TBLU.meta.json'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0])))

if ((automateGame ? automateGame : storage.getSync("game")) === "HM2016") {
	TEMP.subEntities = TEMP.entityTemplates
	delete TEMP.entityTemplates

	TBLU.subEntities = TBLU.entityTemplates
	delete TBLU.entityTemplates
}

if (new Set(TBLU.subEntities.map(a=>a.entityId.value)).size != TBLU.subEntities.map(a=>a.entityId.value).length) {
	await Swal.fire({
		title: 'Duplicate Entity IDs',
		text: `The entity you're converting contains duplicate entity IDs - QuickEntity can't convert it.`,
		showCancelButton: false,
		confirmButtonText: 'bruh',
		allowOutsideClick: false
	})
	return
}

// {
//     "rootEntityIndex": 0,
//     "subEntities": [
//         {
//             "entityTemplate": "",
//             "entityBlueprint": "",
//             "propertyValues": [],
//             "postInitPropertyValues": [],
//             "platformSpecificPropertyValues": [],
//             "entityName": "Scene",
//             "propertyAliases": [],
//             "exposedEntities": [],
//             "exposedInterfaces": [],
//             "entitySubsets": []
//         },
//     ],
//     "propertyOverrides": [],
//     "externalSceneTypeIndicesInResourceHeader": [
//     ]
// }

/** @type {Entity} */
var entity =  {
	"tempHash": path.basename(tempPath).slice(0, -10),
	"tbluHash": path.basename(tbluPath).slice(0, -10),
	"rootEntity": TBLU.subEntities[TEMP.rootEntityIndex].entityName,
	"entities": {},
	"propertyOverrides": TEMP.propertyOverrides,
	"overrideDeletes": TBLU.overrideDeletes,
	"pinConnectionOverrides": TBLU.pinConnectionOverrides,
	"pinConnectionOverrideDeletes": TBLU.pinConnectionOverrideDeletes,
	"externalScenes": [],
	"subType": TEMP.subType,
	"quickEntityVersion": QuickEntityVersion
}

let index = 0
for (var entry of TEMP.subEntities) {
	try {
		for (let subset of TBLU.subEntities[index].entitySubsets) {
			for (let subSubset in subset[1].entities) {
				subset[1].entities[subSubset] = new Decimal(TBLU.subEntities[subset[1].entities[subSubset]].entityId.value).toHex().substring(2)
			}
		}
	} catch (e) {
		console.log("Error deindexing entitySubsets for entity " + index + ": " + e)
	}

	entity.entities[new Decimal(TBLU.subEntities[index].entityId.value).toHex().substring(2)] = {
		"parent": {
			"ref": entry.logicalParent.entityIndex >= 0 ? new Decimal(TBLU.subEntities[entry.logicalParent.entityIndex].entityId.value).toHex().substring(2) : (entry.logicalParent.entityIndex == -2 ? "SPECIAL: Use EntityID" : "SPECIAL: None"),
			"exposedEntity": entry.logicalParent.exposedEntity,
			"externalScene": entry.logicalParent.externalSceneIndex >= 0 ? TEMPmeta["hash_reference_data"][TEMP.externalSceneTypeIndicesInResourceHeader[entry.logicalParent.externalSceneIndex]].hash : "SPECIAL: None",
			"entityID": new Decimal(entry.logicalParent.entityID.value).toHex().substring(2)
		},
		"name": TBLU.subEntities[index].entityName,
		"template": TEMPmeta["hash_reference_data"][entry.entityTypeResourceIndex].hash,
		"templateFlag": TEMPmeta["hash_reference_data"][entry.entityTypeResourceIndex].flag != "1F" ? TEMPmeta["hash_reference_data"][entry.entityTypeResourceIndex].flag : undefined,
		"blueprint": TBLUmeta["hash_reference_data"][TBLU.subEntities[index].entityTypeResourceIndex].hash,
		"properties": {},
		"postInitProperties": {},
		"editorOnly": TBLU.subEntities[index].editorOnly,
		"propertyValues": entry.propertyValues,
		"postInitPropertyValues": entry.postInitPropertyValues,
		"platformSpecificPropertyValues": entry.platformSpecificPropertyValues ? entry.platformSpecificPropertyValues : [],
		"propertyAliases": TBLU.subEntities[index].propertyAliases.map(a=>{return {
            "sAliasName": a.sAliasName,
            "entityID": new Decimal(TBLU.subEntities[a.entityID].entityId.value).toHex().substring(2),
            "sPropertyName": a.sPropertyName
        }}),
		"exposedEntities": TBLU.subEntities[index].exposedEntities,
		"exposedInterfaces": TBLU.subEntities[index].exposedInterfaces.map(a=>[a[0], new Decimal(TBLU.subEntities[a[1]].entityId.value).toHex().substring(2)]),
		"entitySubsets": TBLU.subEntities[index].entitySubsets,
		"events": [],
		"inputCopying": [],
		"outputCopying": []
	}

	index ++
}

for (let entry of Object.values(entity.entities)) {
	var propertyValues = LosslessJSON.parse(LosslessJSON.stringify(entry.propertyValues))
	for (var property of propertyValues) {
		await parseProperty(property, TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry)
	}

	entry.properties = {}
	for (var property of propertyValues) {
		entry.properties[property.nPropertyID] = {
			type: property.value ? property.value["$type"] : undefined,
			value: property.value ? property.value["$val"] : undefined
		}
	}

	delete entry.propertyValues
}

for (let entry of Object.values(entity.entities)) {
	var postInitPropertyValues = LosslessJSON.parse(LosslessJSON.stringify(entry.postInitPropertyValues))
	for (var property of postInitPropertyValues) {
		await parseProperty(property, TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry)
	}

	entry.postInitProperties = {}
	for (var property of postInitPropertyValues) {
		entry.postInitProperties[property.nPropertyID] = {
			type: property.value ? property.value["$type"] : undefined,
			value: property.value ? property.value["$val"] : undefined
		}
	}

	delete entry.postInitPropertyValues
}

for (let entry of Object.values(entity.entities)) {
	if (!entry.propertyAliases.length) {
		delete entry.propertyAliases
	}
	
	if (!entry.exposedEntities.length) {
		delete entry.exposedEntities
	}
	
	if (!entry.exposedInterfaces.length) {
		delete entry.exposedInterfaces
	}
	
	if (!entry.entitySubsets.length) {
		delete entry.entitySubsets
	}
}

for (var sceneTypeIndex of TEMP.externalSceneTypeIndicesInResourceHeader) {
	entity.externalScenes.push(TEMPmeta["hash_reference_data"][sceneTypeIndex].hash)
}

for (var pin of TBLU.pinConnections) {
	if (!entity.entities[new Decimal(TBLU.subEntities[pin.fromID].entityId.value).toHex().substring(2)].events) {
		entity.entities[new Decimal(TBLU.subEntities[pin.fromID].entityId.value).toHex().substring(2)].events = []
	}

	entity.entities[new Decimal(TBLU.subEntities[pin.fromID].entityId.value).toHex().substring(2)].events.push({
		onEvent: pin.fromPinName,
		shouldTrigger: pin.toPinName,
		onEntity: new Decimal(TBLU.subEntities[pin.toID].entityId.value).toHex().substring(2),
		value: pin.constantPinValue ? (pin.constantPinValue["$type"] == "void" ? undefined : {
			type: pin.constantPinValue["$type"],
			value: pin.constantPinValue["$val"],
		}) : undefined
	})
}

for (var pin of TBLU.inputPinForwardings) {
	if (!entity.entities[new Decimal(TBLU.subEntities[pin.fromID].entityId.value).toHex().substring(2)].inputCopying) {
		entity.entities[new Decimal(TBLU.subEntities[pin.fromID].entityId.value).toHex().substring(2)].inputCopying = []
	}

	entity.entities[new Decimal(TBLU.subEntities[pin.fromID].entityId.value).toHex().substring(2)].inputCopying.push({
		whenTriggered: pin.fromPinName,
		alsoTrigger: pin.toPinName,
		onEntity: new Decimal(TBLU.subEntities[pin.toID].entityId.value).toHex().substring(2),
		value: pin.constantPinValue ? (pin.constantPinValue["$type"] == "void" ? undefined : {
			type: pin.constantPinValue["$type"],
			value: pin.constantPinValue["$val"],
		}) : undefined
	})
}

for (var pin of TBLU.outputPinForwardings) {
	if (!entity.entities[new Decimal(TBLU.subEntities[pin.fromID].entityId.value).toHex().substring(2)].outputCopying) {
		entity.entities[new Decimal(TBLU.subEntities[pin.fromID].entityId.value).toHex().substring(2)].outputCopying = []
	}

	entity.entities[new Decimal(TBLU.subEntities[pin.fromID].entityId.value).toHex().substring(2)].outputCopying.push({
		onEvent: pin.fromPinName,
		propagateEvent: pin.toPinName,
		onEntity: new Decimal(TBLU.subEntities[pin.toID].entityId.value).toHex().substring(2),
		value: pin.constantPinValue ? (pin.constantPinValue["$type"] == "void" ? undefined : {
			type: pin.constantPinValue["$type"],
			value: pin.constantPinValue["$val"],
		}) : undefined
	})
}

for (var entry of entity.propertyOverrides) {
	entry.propertyOwner.entityID = new Decimal(entry.propertyOwner.entityID.value).toHex().substring(2)

	entry.propertyOwner.ref = entry.propertyOwner.entityIndex == -2 ? "SPECIAL: Use EntityID" : entry.propertyOwner.entityIndex == -1 ? "SPECIAL: None" : entry.propertyOwner.entityIndex
	delete entry.propertyOwner.entityIndex

	entry.propertyOwner.externalScene = entry.propertyOwner.externalSceneIndex >= 0 ? TBLUmeta["hash_reference_data"][TBLU.externalSceneTypeIndicesInResourceHeader[entry.propertyOwner.externalSceneIndex]].hash : "SPECIAL: None"
	delete entry.propertyOwner.externalSceneIndex

	await parseProperty(entry.propertyValue, TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry)

	entry.propertyValue = {
		name: entry.propertyValue.nPropertyID,
		type: entry.propertyValue.value ? entry.propertyValue.value["$type"] : undefined,
		value: entry.propertyValue.value ? entry.propertyValue.value["$val"] : undefined
	}
}

for (var entry of entity.overrideDeletes) {
	entry.entityID = new Decimal(entry.entityID.value).toHex().substring(2)

	entry.ref = entry.entityIndex == -2 ? "SPECIAL: Use EntityID" : entry.entityIndex == -1 ? "SPECIAL: None" : entry.entityIndex
	delete entry.entityIndex

	entry.externalScene = entry.externalSceneIndex >= 0 ? TBLUmeta["hash_reference_data"][TBLU.externalSceneTypeIndicesInResourceHeader[entry.externalSceneIndex]].hash : "SPECIAL: None"
	delete entry.externalSceneIndex
}

if ((automateGame ? automateGame : storage.getSync("game")) !== "HM2016") {
	for (var entry of entity.pinConnectionOverrides) {
		entry.fromEntity.externalScene = entry.fromEntity.externalSceneIndex >= 0 ? TBLUmeta["hash_reference_data"][TBLU.externalSceneTypeIndicesInResourceHeader[entry.fromEntity.externalSceneIndex]].hash : "SPECIAL: None"
		delete entry.fromEntity.externalSceneIndex

		entry.toEntity.externalScene = entry.toEntity.externalSceneIndex >= 0 ? TBLUmeta["hash_reference_data"][TBLU.externalSceneTypeIndicesInResourceHeader[entry.toEntity.externalSceneIndex]].hash : "SPECIAL: None"
		delete entry.toEntity.externalSceneIndex
	}

	for (var entry of entity.pinConnectionOverrideDeletes) {
		entry.fromEntity.externalScene = entry.fromEntity.externalSceneIndex >= 0 ? TBLUmeta["hash_reference_data"][TBLU.externalSceneTypeIndicesInResourceHeader[entry.fromEntity.externalSceneIndex]].hash : "SPECIAL: None"
		delete entry.fromEntity.externalSceneIndex

		entry.toEntity.externalScene = entry.toEntity.externalSceneIndex >= 0 ? TBLUmeta["hash_reference_data"][TBLU.externalSceneTypeIndicesInResourceHeader[entry.toEntity.externalSceneIndex]].hash : "SPECIAL: None"
		delete entry.toEntity.externalSceneIndex
	}
} else {
	entity.pinConnectionOverrides = []
	entity.pinConnectionOverrideDeletes = []
}

fs.writeFileSync(automateQNPath ? automateQNPath : electron.remote.dialog.showSaveDialogSync({
	title: "Save the QuickEntity JSON file",
	buttonLabel: "Save",
	filters: [{ name: 'JSON file', extensions: ['json'] }],
	properties: ["dontAddToRecent"]
}), LosslessJSON.stringify(entity))
}

function findEntity(cache, ref) {
	return ref == "SPECIAL: None" ? -1 : ref == "SPECIAL: Use EntityID" ? -2 : cache.hasOwnProperty(ref) ? cache[ref] : -1
}

async function generate(automateGame = false, automateQNPath = false, automateTempPath = false, automateTempMetaPath = false, automateTbluPath = false, automateTbluMetaPath = false) {

/** @type {Entity} */
const entity = LosslessJSON.parse(String(fs.readFileSync(automateQNPath ? automateQNPath : electron.remote.dialog.showOpenDialogSync({
	title: "Select the QuickEntity JSON",
	buttonLabel: "Select",
	filters: [{ name: 'JSON files', extensions: ['json'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0])))

if (entity.quickEntityVersion < QuickEntityVersion && !automateGame) {
	if (!(await Swal.fire({
		title: 'Outdated QuickEntity JSON',
		text: `The QuickEntity JSON was created with version ${entity.quickEntityVersion}. The version of QuickEntity you are currently using is ${QuickEntityVersion}. Are you sure you want to continue?`,
		showCancelButton: true,
		confirmButtonText: 'Continue',
		allowOutsideClick: false
	})).isConfirmed) {
		return
	}
}


const findEntityCache = {}
let index = 0
for (let entry of Object.keys(entity.entities)) {
	findEntityCache[entry] = index
	index ++
}


/** @type {TEMP} */
var TEMP = {
	"subType": entity.subType,
	"blueprintIndexInResourceHeader": 0,
	"rootEntityIndex": Object.values(entity.entities).findIndex(a => a.name == entity.rootEntity),
	"subEntities": [],
	"propertyOverrides": entity.propertyOverrides,
	"externalSceneTypeIndicesInResourceHeader": []
}

/** @type {HashMeta} */
var TEMPmeta = {
	"hash_value": entity.tempHash,
	"hash_offset": 1367,
	"hash_size": 2147484657,
	"hash_resource_type": "TEMP",
	"hash_reference_table_size": 193,
	"hash_reference_table_dummy": 0,
	"hash_size_final": 2377,
	"hash_size_in_memory": 1525,
	"hash_size_in_video_memory": 4294967295,
	"hash_reference_data": []
}

/** @type {TBLU} */
var TBLU = {
	"subType": entity.subType,
	"rootEntityIndex": Object.values(entity.entities).findIndex(a => a.name == entity.rootEntity),
	"subEntities": [],
	"externalSceneTypeIndicesInResourceHeader": [],
	"overrideDeletes": entity.overrideDeletes,
	"pinConnectionOverrides": (automateGame ? automateGame : storage.getSync("game")) !== "HM2016" ? entity.pinConnectionOverrides : undefined,
	"pinConnectionOverrideDeletes": (automateGame ? automateGame : storage.getSync("game")) !== "HM2016" ? entity.pinConnectionOverrideDeletes : undefined,
	"pinConnections": [],
	"inputPinForwardings": [],
	"outputPinForwardings": []
}

/** @type {HashMeta} */
var TBLUmeta = {
	"hash_value": entity.tbluHash,
	"hash_offset": 359,
	"hash_size": 2147484656,
	"hash_resource_type": "TBLU",
	"hash_reference_table_size": 184,
	"hash_reference_table_dummy": 0,
	"hash_size_final": 2380,
	"hash_size_in_memory": 1715,
	"hash_size_in_video_memory": 4294967295,
	"hash_reference_data": []
}

TEMPmeta.hash_reference_data.push({
	"hash": entity.tbluHash,
	"flag": "1F"
})


for (var externalScene of entity.externalScenes) {
	TEMPmeta.hash_reference_data.push({
		"hash": externalScene,
		"flag": "1F"
	})

	TEMP.externalSceneTypeIndicesInResourceHeader.push(TEMPmeta.hash_reference_data.length - 1)

	TBLUmeta.hash_reference_data.push({
		"hash": externalScene,
		"flag": "1F"
	})

	TBLU.externalSceneTypeIndicesInResourceHeader.push(TBLUmeta.hash_reference_data.length - 1)
}


/*
	GENERATE: SKELETON DATA
*/

var tempInitialIndex = TEMPmeta.hash_reference_data.length
var tbluInitialIndex = TBLUmeta.hash_reference_data.length
var soFarUsedTEMP = new Set()
var soFarUsedTBLU = new Set()

for (let entry of Object.values(entity.entities)) {
	if (!soFarUsedTEMP.has(entry.template)) {
		TEMPmeta.hash_reference_data.push({
			"hash": entry.template,
			"flag": entry.templateFlag || "1F"
		})
		soFarUsedTEMP.add(entry.template)
	}

	if (!soFarUsedTBLU.has(entry.blueprint)) {
		TBLUmeta.hash_reference_data.push({
			"hash": entry.blueprint,
			"flag": "1F"
		})
		soFarUsedTBLU.add(entry.blueprint)
	}
}

let soFarUsedTEMPArray = [...soFarUsedTEMP]
let soFarUsedTBLUArray = [...soFarUsedTBLU]

for (let entry of Object.entries(entity.entities)) {
	TEMP.subEntities.push({
		"logicalParent": {
			"entityID": new LosslessJSON.LosslessNumber("18446744073709551615"),
			"externalSceneIndex": -1,
			"entityIndex": 0,
			"exposedEntity": ""
		},
		"entityTypeResourceIndex": soFarUsedTEMPArray.indexOf(entry[1].template) + tempInitialIndex,
		"propertyValues": [],
		"postInitPropertyValues": [],
		"platformSpecificPropertyValues": entry[1].platformSpecificPropertyValues ? entry[1].platformSpecificPropertyValues : []
	})

	TBLU.subEntities.push({
		"logicalParent": {
			"entityID": new LosslessJSON.LosslessNumber("18446744073709551615"),
			"externalSceneIndex": -1,
			"entityIndex": 0,
			"exposedEntity": ""
		},
		"entityTypeResourceIndex": soFarUsedTBLUArray.indexOf(entry[1].blueprint) + tbluInitialIndex,
		"entityId": new LosslessJSON.LosslessNumber(new Decimal("0x" + entry[0]).toFixed()),
		"editorOnly": entry[1].editorOnly ? true : false,
		"entityName": entry[1].name,
		"propertyAliases": entry[1].propertyAliases ? entry[1].propertyAliases.map(a=>{return {
            "sAliasName": a.sAliasName,
            "entityID": findEntity(findEntityCache, a.entityID),
            "sPropertyName": a.sPropertyName
        }}) : [],
		"exposedEntities": entry[1].exposedEntities ? entry[1].exposedEntities : [],
		"exposedInterfaces": entry[1].exposedInterfaces ? entry[1].exposedInterfaces.map(a=>[a[0], findEntity(findEntityCache, a[1])]) : [],
		"entitySubsets": entry[1].entitySubsets ? entry[1].entitySubsets : []
	})
}


/*
	REINDEX: entitySubsets, logicalParent
*/

index = 0
for (let entry of Object.values(entity.entities)) {
	if (entry.entitySubsets) {
		for (var subset of entry.entitySubsets) {
			for (var item in subset[1]["entities"]) {
				subset[1]["entities"][item] = findEntity(findEntityCache, subset[1]["entities"][item])
			}
		}
	}

	TEMP.subEntities[index].logicalParent.entityIndex = findEntity(findEntityCache, entry.parent.ref)
	TBLU.subEntities[index].logicalParent.entityIndex = findEntity(findEntityCache, entry.parent.ref)

	TEMP.subEntities[index].logicalParent.entityID = new LosslessJSON.LosslessNumber(new Decimal("0x" + entry.parent.entityID).toFixed())
	TBLU.subEntities[index].logicalParent.entityID = new LosslessJSON.LosslessNumber(new Decimal("0x" + entry.parent.entityID).toFixed())

	TEMP.subEntities[index].logicalParent.exposedEntity = entry.parent.exposedEntity
	TBLU.subEntities[index].logicalParent.exposedEntity = entry.parent.exposedEntity

	TEMP.subEntities[index].logicalParent.externalSceneIndex = entry.parent.externalScene
	TBLU.subEntities[index].logicalParent.externalSceneIndex = entry.parent.externalScene

	index ++
}


/*
	GENERATE: propertyValues, postInitPropertyValues
*/

index = 0
for (let entry of Object.values(entity.entities)) {
	for (let property of Object.entries(entry.properties)) {
		await rebuildProperty(property, "propertyValues", TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry, index, findEntityCache)
	}

	for (let property of Object.entries(entry.postInitProperties)) {
		await rebuildProperty(property, "postInitPropertyValues", TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry, index, findEntityCache)
	}
	index ++
}


/*
	REBUILD: propertyOverrides
*/

index = 0
for (var entry of TEMP.propertyOverrides) {
	entry.propertyOwner.entityID = new LosslessJSON.LosslessNumber(new Decimal("0x" + entry.propertyOwner.entityID).toFixed())
	
	entry.propertyOwner.entityIndex = entry.propertyOwner.ref == "SPECIAL: Use EntityID" ? -2 : entry.propertyOwner.ref == "SPECIAL: None" ? -1 : entry.propertyOwner.ref
	delete entry.propertyOwner.ref

	await rebuildProperty(entry.propertyValue, "propertyValue", TEMP, TBLU, TEMPmeta, TBLUmeta, entity, entry, index, findEntityCache, true)
	index++
}


/*
	REINDEX: externalSceneIndexes IN overrides
*/

for (var entry of TEMP.propertyOverrides) {
	entry.propertyOwner.externalSceneIndex = TEMP.externalSceneTypeIndicesInResourceHeader.findIndex(a => TEMPmeta.hash_reference_data[a].hash == entry.propertyOwner.externalScene)
	delete entry.propertyOwner.externalScene

	if (entry.propertyValue.value["$type"] == "TArray<SEntityTemplateReference>") {
		for (var property2 of entry.propertyValue.value["$val"]) {
			if (typeof property2.externalSceneIndex == "string") {
				property2.externalSceneIndex = TEMP.externalSceneTypeIndicesInResourceHeader.findIndex(a => TEMPmeta.hash_reference_data[a].hash == property2.externalSceneIndex)
			}
		}
	} else if (entry.propertyValue.value["$type"] == "SEntityTemplateReference") {
		if (typeof entry.propertyValue.value["$val"].externalSceneIndex == "string") {
			entry.propertyValue.value["$val"].externalSceneIndex = TEMP.externalSceneTypeIndicesInResourceHeader.findIndex(a => TEMPmeta.hash_reference_data[a].hash == entry.propertyValue.value["$val"].externalSceneIndex)
		}
	}
}

for (var entry of TBLU.overrideDeletes) {
	entry.entityID = new LosslessJSON.LosslessNumber(new Decimal("0x" + entry.entityID).toFixed())
	
	entry.entityIndex = entry.ref == "SPECIAL: Use EntityID" ? -2 : entry.ref == "SPECIAL: None" ? -1 : entry.ref
	delete entry.ref

	entry.externalSceneIndex = TBLU.externalSceneTypeIndicesInResourceHeader.findIndex(a => TBLUmeta.hash_reference_data[a].hash == entry.externalScene)
	delete entry.externalScene
}


if ((automateGame ? automateGame : storage.getSync("game")) !== "HM2016") {
	for (var entry of TBLU.pinConnectionOverrides) {
		entry.fromEntity.externalSceneIndex = TBLU.externalSceneTypeIndicesInResourceHeader.findIndex(a => TBLUmeta.hash_reference_data[a].hash == entry.fromEntity.externalScene)
		delete entry.fromEntity.externalScene

		entry.toEntity.externalSceneIndex = TBLU.externalSceneTypeIndicesInResourceHeader.findIndex(a => TBLUmeta.hash_reference_data[a].hash == entry.toEntity.externalScene)
		delete entry.toEntity.externalScene
	}

	for (var entry of TBLU.pinConnectionOverrideDeletes) {
		entry.fromEntity.externalSceneIndex = TBLU.externalSceneTypeIndicesInResourceHeader.findIndex(a => TBLUmeta.hash_reference_data[a].hash == entry.fromEntity.externalScene)
		delete entry.fromEntity.externalScene

		entry.toEntity.externalSceneIndex = TBLU.externalSceneTypeIndicesInResourceHeader.findIndex(a => TBLUmeta.hash_reference_data[a].hash == entry.toEntity.externalScene)
		delete entry.toEntity.externalScene
	}
}


/*
	REINDEX: externalSceneIndexes IN TEMP logicalParent, propertyValues
*/

for (var entry of TEMP.subEntities) {
	entry.logicalParent.externalSceneIndex = TEMP.externalSceneTypeIndicesInResourceHeader.findIndex(a => TEMPmeta.hash_reference_data[a].hash == entry.logicalParent.externalSceneIndex)

	for (let property of entry.propertyValues) {
		if (property.value["$type"] == "TArray<SEntityTemplateReference>") {
			for (var property2 of property.value["$val"]) {
				if (typeof property2.externalSceneIndex == "string") {
					property2.externalSceneIndex = TEMP.externalSceneTypeIndicesInResourceHeader.findIndex(a => TEMPmeta.hash_reference_data[a].hash == property2.externalSceneIndex)
				}
			}
		} else if (property.value["$type"] == "SEntityTemplateReference") {
			if (typeof property.value["$val"].externalSceneIndex == "string") {
				property.value["$val"].externalSceneIndex = TEMP.externalSceneTypeIndicesInResourceHeader.findIndex(a => TEMPmeta.hash_reference_data[a].hash == property.value["$val"].externalSceneIndex)
			}
		}
	}

	for (let property of entry.postInitPropertyValues) {
		if (property.value["$type"] == "TArray<SEntityTemplateReference>") {
			for (var property2 of property.value["$val"]) {
				if (typeof property2.externalSceneIndex == "string") {
					property2.externalSceneIndex = TEMP.externalSceneTypeIndicesInResourceHeader.findIndex(a => TEMPmeta.hash_reference_data[a].hash == property2.externalSceneIndex)
				}
			}
		} else if (property.value["$type"] == "SEntityTemplateReference") {
			if (typeof property.value["$val"].externalSceneIndex == "string") {
				property.value["$val"].externalSceneIndex = TEMP.externalSceneTypeIndicesInResourceHeader.findIndex(a => TEMPmeta.hash_reference_data[a].hash == property.value["$val"].externalSceneIndex)
			}
		}
	}
}


/*
	REINDEX: externalSceneIndex IN TBLU logicalParent
*/

for (var entry of TBLU.subEntities) {
	entry.logicalParent.externalSceneIndex = TBLU.externalSceneTypeIndicesInResourceHeader.findIndex(a => TBLUmeta.hash_reference_data[a].hash == entry.logicalParent.externalSceneIndex)
}


/*
	ADD: pins
*/

const game = (automateGame ? automateGame : storage.getSync("game"))

index = 0
for (let entry of Object.values(entity.entities)) {
	if (entry.events) {
		for (let pin of entry.events) {
			TBLU.pinConnections.push({
				"fromID": index,
				"toID": findEntity(findEntityCache, pin.onEntity),
				"fromPinName": pin.onEvent,
				"toPinName": pin.shouldTrigger,
				"constantPinValue": game !== "HM2016" ? {
					"$type": pin.value ? pin.value.type : "void",
					"$val": pin.value ? pin.value.value : null
				} : undefined
			})
		}
	}

	if (entry.inputCopying) {
		for (let pin of entry.inputCopying) {
			TBLU.inputPinForwardings.push({
				"fromID": index,
				"toID": findEntity(findEntityCache, pin.onEntity),
				"fromPinName": pin.whenTriggered,
				"toPinName": pin.alsoTrigger,
				"constantPinValue": game !== "HM2016" ? {
					"$type": pin.value ? pin.value.type : "void",
					"$val": pin.value ? pin.value.value : null
				} : undefined
			})
		}
	}

	if (entry.outputCopying) {
		for (let pin of entry.outputCopying) {
			TBLU.outputPinForwardings.push({
				"fromID": index,
				"toID": findEntity(findEntityCache, pin.onEntity),
				"fromPinName": pin.onEvent,
				"toPinName": pin.propagateEvent,
				"constantPinValue": game !== "HM2016" ? {
					"$type": pin.value ? pin.value.type : "void",
					"$val": pin.value ? pin.value.value : null
				} : undefined
			})
		}
	}

	index ++
}


if ((automateGame ? automateGame : storage.getSync("game")) == "HM2016") {
	TEMP.entityTemplates = TEMP.subEntities
	delete TEMP.subEntities

	TBLU.entityTemplates = TBLU.subEntities
	delete TBLU.subEntities
}

var tempRebuildPath = automateTempPath ? automateTempPath : electron.remote.dialog.showSaveDialogSync({
	title: "Save the TEMP's JSON",
	buttonLabel: "Save",
	defaultPath: `${entity.tempHash}.TEMP.json`,
	filters: [{ name: 'JSON file', extensions: ['TEMP.json'] }],
	properties: ["dontAddToRecent"]
})
fs.writeFileSync(tempRebuildPath, LosslessJSON.stringify(TEMP))

var tempMetaRebuildPath = automateTempMetaPath ? automateTempMetaPath : electron.remote.dialog.showSaveDialogSync({
	title: "Save the TEMP's meta's JSON",
	buttonLabel: "Save",
	defaultPath:`output/${entity.tempHash}.TEMP.meta.json`,
	filters: [{ name: 'JSON file', extensions: ['TEMP.meta.json'] }],
	properties: ["dontAddToRecent"]
})
fs.writeFileSync(tempMetaRebuildPath, LosslessJSON.stringify(TEMPmeta))

var tbluRebuildPath = automateTbluPath ? automateTbluPath : electron.remote.dialog.showSaveDialogSync({
	title: "Save the TBLU's JSON",
	buttonLabel: "Save",
	defaultPath: `output/${entity.tbluHash}.TBLU.json`,
	filters: [{ name: 'JSON file', extensions: ['TBLU.json'] }],
	properties: ["dontAddToRecent"]
})
fs.writeFileSync(tbluRebuildPath, LosslessJSON.stringify(TBLU))

var tbluMetaRebuildPath = automateTbluMetaPath ? automateTbluMetaPath : electron.remote.dialog.showSaveDialogSync({
	title: "Save the TBLU's meta's JSON",
	buttonLabel: "Save",
	defaultPath: `output/${entity.tbluHash}.TBLU.meta.json`,
	filters: [{ name: 'JSON file', extensions: ['TBLU.meta.json'] }],
	properties: ["dontAddToRecent"]
})
fs.writeFileSync(tbluMetaRebuildPath, LosslessJSON.stringify(TBLUmeta))

return {
	tempRebuildPath,
	tempMetaRebuildPath,
	tbluRebuildPath,
	tbluMetaRebuildPath
}

}

async function convertToSource() {

const tempPath = electron.remote.dialog.showOpenDialogSync({
	title: "Select the TEMP",
	buttonLabel: "Select",
	filters: [{ name: 'TEMP files', extensions: ['TEMP'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0]

const tempMetaPath = electron.remote.dialog.showOpenDialogSync({
	title: "Select the TEMP meta",
	buttonLabel: "Select",
	filters: [{ name: 'TEMP meta files', extensions: ['TEMP.meta'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0]

const tbluPath = electron.remote.dialog.showOpenDialogSync({
	title: "Select the TBLU",
	buttonLabel: "Select",
	filters: [{ name: 'TBLU files', extensions: ['TBLU'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0]

const tbluMetaPath = electron.remote.dialog.showOpenDialogSync({
	title: "Select the TBLU meta",
	buttonLabel: "Select",
	filters: [{ name: 'TBLU meta files', extensions: ['TBLU.meta'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0]

execSync("ResourceTool.exe " + storage.getSync("game") + " convert TEMP \"" + tempPath + "\" \"" + tempPath + ".json\" --simple")
execSync("ResourceTool.exe " + storage.getSync("game") + " convert TBLU \"" + tbluPath + "\" \"" + tbluPath + ".json\" --simple")
execSync("rpkg-cli.exe -hash_meta_to_json \"" + tempMetaPath + "\"")
execSync("rpkg-cli.exe -hash_meta_to_json \"" + tbluMetaPath + "\"")

}

async function convertToPackaged() {

const tempPath = electron.remote.dialog.showOpenDialogSync({
	title: "Select the TEMP json",
	buttonLabel: "Select",
	filters: [{ name: 'TEMP JSON files', extensions: ['TEMP.json'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0]

const tempMetaPath = electron.remote.dialog.showOpenDialogSync({
	title: "Select the TEMP meta json",
	buttonLabel: "Select",
	filters: [{ name: 'TEMP meta JSON files', extensions: ['TEMP.meta.json'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0]

const tbluPath = electron.remote.dialog.showOpenDialogSync({
	title: "Select the TBLU json",
	buttonLabel: "Select",
	filters: [{ name: 'TBLU JSON files', extensions: ['TBLU.json'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0]

const tbluMetaPath = electron.remote.dialog.showOpenDialogSync({
	title: "Select the TBLU meta json",
	buttonLabel: "Select",
	filters: [{ name: 'TBLU meta JSON files', extensions: ['TBLU.meta.json'] }],
	properties: ["openFile", "dontAddToRecent"]
})[0]

execSync("ResourceTool.exe " + storage.getSync("game") + " generate TEMP \"" + tempPath + "\" \"" + tempPath.slice(0,-5) + "\" --simple")
execSync("ResourceTool.exe " + storage.getSync("game") + " generate TBLU \"" + tbluPath + "\" \"" + tbluPath.slice(0,-5) + "\" --simple")
execSync("rpkg-cli.exe -json_to_hash_meta \"" + tempMetaPath + "\"")
execSync("rpkg-cli.exe -json_to_hash_meta \"" + tbluMetaPath + "\"")

}

async function packagedToConverted() {
	const tempPath = electron.remote.dialog.showOpenDialogSync({
		title: "Select the TEMP",
		buttonLabel: "Select",
		filters: [{ name: 'TEMP files', extensions: ['TEMP'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0]

	const tempMetaPath = electron.remote.dialog.showOpenDialogSync({
		title: "Select the TEMP meta",
		buttonLabel: "Select",
		filters: [{ name: 'TEMP meta files', extensions: ['TEMP.meta'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0]

	const tbluPath = electron.remote.dialog.showOpenDialogSync({
		title: "Select the TBLU",
		buttonLabel: "Select",
		filters: [{ name: 'TBLU files', extensions: ['TBLU'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0]

	const tbluMetaPath = electron.remote.dialog.showOpenDialogSync({
		title: "Select the TBLU meta",
		buttonLabel: "Select",
		filters: [{ name: 'TBLU meta files', extensions: ['TBLU.meta'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0]

	execSync("ResourceTool.exe " + storage.getSync("game") + " convert TEMP \"" + tempPath + "\" \"" + tempPath + ".json\" --simple")
	execSync("ResourceTool.exe " + storage.getSync("game") + " convert TBLU \"" + tbluPath + "\" \"" + tbluPath + ".json\" --simple")
	execSync("rpkg-cli.exe -hash_meta_to_json \"" + tempMetaPath + "\"")
	execSync("rpkg-cli.exe -hash_meta_to_json \"" + tbluMetaPath + "\"")

	// @ts-ignore
	convert(storage.getSync("game"), tempPath + ".json", tempMetaPath + ".json", tbluPath + ".json", tbluMetaPath + ".json")
}

async function convertedToPackaged() {
	var x = await generate(storage.getSync("game"))

	execSync("ResourceTool.exe " + storage.getSync("game") + " generate TEMP \"" + x.tempRebuildPath + "\" \"" + x.tempRebuildPath.slice(0,-5) + "\" --simple")
	execSync("ResourceTool.exe " + storage.getSync("game") + " generate TBLU \"" + x.tbluRebuildPath + "\" \"" + x.tbluRebuildPath.slice(0,-5) + "\" --simple")
	execSync("rpkg-cli.exe -json_to_hash_meta \"" + x.tempMetaRebuildPath + "\"")
	execSync("rpkg-cli.exe -json_to_hash_meta \"" + x.tbluMetaRebuildPath + "\"")
}

async function setGame(game) {
	await (promisify(storage.set))("game", game)
}

function patchCheckLosslessNumber(input, output, pointer) {
	if ((input instanceof LosslessJSON.LosslessNumber && output instanceof LosslessJSON.LosslessNumber)) {
		if (input.value !== output.value) {
			return [{op: 'replace', path: pointer.toString(), value: "LN|" + output.value}]
		} else {
			return []
		}
	}
}

async function createPatchJSON(automateQN1Path = false, automateQN2Path = false, automateOutputPath = false) {
	let entity1 = LosslessJSON.parse(String(fs.readFileSync(automateQN1Path ? automateQN1Path : electron.remote.dialog.showOpenDialogSync({
		title: "Select the first QuickEntity JSON",
		buttonLabel: "Select",
		filters: [{ name: 'JSON files', extensions: ['json'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0])))

	let entity2 = LosslessJSON.parse(String(fs.readFileSync(automateQN2Path ? automateQN2Path : electron.remote.dialog.showOpenDialogSync({
		title: "Select the second QuickEntity JSON",
		buttonLabel: "Select",
		filters: [{ name: 'JSON files', extensions: ['json'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0])))

	delete entity1.quickEntityVersion
	delete entity2.quickEntityVersion

		// @ts-ignore
	let patch = rfc6902.createPatch(entity1, entity2, patchCheckLosslessNumber)
	
	let outputPatchJSON = {
		tempHash: entity2.tempHash,
    	tbluHash: entity2.tbluHash,
		patch: patch,
		patchVersion: 3
	}

	let outputPath = automateOutputPath ? automateOutputPath : electron.remote.dialog.showSaveDialogSync({
		title: "Save the patch JSON",
		buttonLabel: "Save",
		defaultPath: `patch.json`,
		filters: [{ name: 'JSON file', extensions: ['json'] }],
		properties: ["dontAddToRecent"]
	})
	fs.writeFileSync(outputPath, LosslessJSON.stringify(outputPatchJSON))
}

async function applyPatchJSON(automateQNPath = false, automatePatchPath = false, automateOutputPath = false) {
	let entity = LosslessJSON.parse(String(fs.readFileSync(automateQNPath ? automateQNPath : electron.remote.dialog.showOpenDialogSync({
		title: "Select the QuickEntity JSON",
		buttonLabel: "Select",
		filters: [{ name: 'JSON files', extensions: ['json'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0])))

	let patch = LosslessJSON.parse(String(fs.readFileSync(automatePatchPath ? automatePatchPath : electron.remote.dialog.showOpenDialogSync({
		title: "Select the patch JSON",
		buttonLabel: "Select",
		filters: [{ name: 'JSON files', extensions: ['json'] }],
		properties: ["openFile", "dontAddToRecent"]
	})[0])))

		rfc6902.applyPatch(entity, patch.patch)
	
	let outputPath = automateOutputPath ? automateOutputPath : electron.remote.dialog.showSaveDialogSync({
		title: "Save the resulting JSON",
		buttonLabel: "Save",
		defaultPath: `result.json`,
		filters: [{ name: 'JSON file', extensions: ['json'] }],
		properties: ["dontAddToRecent"]
	})
	fs.writeFileSync(outputPath, LosslessJSON.stringify(entity).replace(/"LN\|((?:[0-9]|\.|-|e)*)"/g, (a,b) => new LosslessJSON.LosslessNumber(b).value))
}

module.exports = {
	convert,
	generate,
	createPatchJSON,
	applyPatchJSON
}