type RuntimeID = string
type LocalisationID = string
type ModID = string

export enum Platform {
	steam = "steam",
	epic = "epic",
	microsoft = "microsoft"
}

export enum Language {
	english = "english",
	french = "french",
	italian = "italian",
	german = "german",
	spanish = "spanish",
	russian = "russian",
	chineseSimplified = "chineseSimplified",
	chineseTraditional = "chineseTraditional",
	japanese = "japanese"
}

export enum OptionType {
	checkbox = "checkbox",
	select = "select",
	conditional = "conditional"
}

export type Manifest = {
	/** An ID for the mod. Should follow capitalised reverse URI style (AuthorName.ModName). Don't include special characters; numbers, underscores and full stops are OK. */
	id: ModID

	/** The name of the mod. */
	name: string

	/** A description of the mod. */
	description: string

	/** A list of the mod's authors. */
	authors: string[]

	/** The mod's version, using semantic versioning (X.Y.Z) - this means that new features increment the second number, fixes increment the third number and only huge changes that could break compatibility should increment the first number.  */
	version: string

	/** The version of the framework this mod has been tested against/designed for. */
	frameworkVersion: string

	/** A link to an update JSON (must be HTTPS). Information on this can be found in the Mod Updates documentation page. */
	updateCheck?: string

	/** Settings for the mod that can be enabled and disabled in the Mod Manager. Also, conditional options allow for certain elements of the mod to be automatically enabled/disabled based on, for example, other mods being installed. */
	options?: ((
		| {
				/** The name of the option. Should not be duplicated. Will appear in the Mod Manager. */
				name: string

				/** The type of the option. Checkbox options appear as checkboxes in the Mod Manager. */
				type: OptionType.checkbox

				/** Whether the option should be preselected upon installing the mod. Preselected options should deliver the "advertised experience". Mods with many settings should have the user select their own settings, or provide a conservative default. */
				enabledByDefault?: boolean

				/** A tooltip for the option. Will appear when the user hovers over the option in the Mod Manager. */
				tooltip?: string

				/** A thumbnail image for the option. Will appear when the user hovers over the option in the Mod Manager. */
				image?: string
		  }
		| {
				/** The name of the option. Will appear in the Mod Manager. Select option names should not include a colon. */
				name: string

				/** The type of the option. Select options appear as radio buttons in the Mod Manager under a heading (the group name). */
				type: OptionType.select

				/** The name of the group the option is part of. Will appear in the Mod Manager. Should not include a colon. */
				group: string

				/** Whether the option should be preselected upon installing the mod. Preselected options should deliver the "advertised experience". Mods with many settings should have the user select their own settings, or provide a conservative default. */
				enabledByDefault?: boolean

				/** A tooltip for the option. Will appear when the user hovers over the option in the Mod Manager. */
				tooltip?: string

				/** A thumbnail image for the option. Will appear when the user hovers over the option in the Mod Manager. */
				image?: string
		  }
		| {
				/** The name of the option. Should not be duplicated. Purely for internal reference; conditional options are not shown to the user. */
				name: string

				/** The type of the option. Conditional options are enabled whenever a condition is met and disabled otherwise. They do not appear in the Mod Manager. */
				type: OptionType.conditional

				/** A condition which will enable the option when met. Passed the framework config under the `config` global object. Refer to the Filtrex documentation at https://github.com/m93a/filtrex#expressions for syntax. */
				condition: string
		  }
	) &
		ManifestOptionData)[]
} & ManifestOptionData

export interface ManifestOptionData {
	/** Folders with content files that will be crawled and automatically deployed. */
	contentFolders?: string[]

	/** Folders with blobs that will be crawled and automatically deployed. */
	blobsFolders?: string[]

	/** Localisation for each supported language. */
	localisation?: {
		[key in Language]: {
			[k: LocalisationID]: string
		}
	}

	/** Overridden localisation from the game files. */
	localisationOverrides?: {
		[k: RuntimeID]: {
			[key in Language]: {
				[k: string]: string
			}
		}
	}

	/** LINE files to create from localisation IDs. */
	localisedLines?: {
		[k: RuntimeID]: LocalisationID
	}

	/** Partitions and paths to add to packagedefinition.
	 * Custom chunks (partitions) are supported but discouraged; their support is very minimal and will cause compatibility problems */
	packagedefinition?: (
		| {
				type: "partition"
				name: string
				parent: string
				partitionType: string
		  }
		| {
				type: "entity"
				/** The partition to add the entity/scene under. */
				partition: string
				path: string
		  }
	)[]

	/** Commands to add to thumbs.dat after [Hitman5]. */
	thumbs?: string[]

	/** RuntimeIDs that will be ported to chunk0 or to a provided chunk. */
	dependencies?: (
		| string
		| {
				runtimeID: string
				toChunk?: number
				portFromChunk1?: boolean
		  }
	)[]

	/** Platforms that this mod supports.
	 * All other platforms will be prevented from using this mod.
	 * Use this when a mod uses features that only some platforms support, such as Ghost Mode and Steam. */
	supportedPlatforms?: Platform[]

	/** Mod IDs (possibly accompanied by version ranges) that this mod depends on to function.
	 * Clients without these mods enabled will be prevented from using this mod. */
	requirements?: (ModID | [ModID, string])[]

	/** Mod IDs (possibly accompanied by version ranges) that this mod will not function with.
	 * Clients with these mods enabled will be prevented from using this mod. */
	incompatibilities?: (ModID | [ModID, string])[]

	/** Mod IDs (possibly accompanied by version ranges) this mod should load before.
	 * Used in automatic sorting by the Mod Manager GUI. */
	loadBefore?: (ModID | [ModID, string])[]

	/** Mod IDs (possibly accompanied by version ranges) this mod should load after.
	 * Used in automatic sorting by the Mod Manager GUI. */
	loadAfter?: (ModID | [ModID, string])[]

	/** Paths to TypeScript files that can alter deployment of the mod.
	 * The first item is considered to be the entry point; it must export the necessary functions.
	 * Any additional files are transpiled but not used directly; they can be imported from the entry point. */
	scripts?: string[]
}

export interface DeployInstruction {
	/** Unique identifier. Should be the mod's ID. */
	id: string

	/** Mod's friendly name. Should be the mod's name as defined in the manifest. */
	name: string

	/** Cache folder. Should be the mod's ID. */
	cacheFolder: string

	/** The root folder of the mod. You *must* use this if you want to modify files in the mod folder - process.cwd() or "." will resolve to the framework's folder, not the mod folder! */
	modRoot: string

	manifestSources: {
		/** Localisation for each supported language.
		 * Note: this is not deployed in the mod stage due to tool limitations. Instead, it is deployed after all mods are deployed. */
		localisation: ManifestOptionData["localisation"]

		/** Overridden localisation from the game files.
		 * Note: this is not deployed in the mod stage due to tool limitations. Instead, it is deployed after all mods are deployed. */
		localisationOverrides: ManifestOptionData["localisationOverrides"]

		/** LINE files to create from localisation IDs. */
		localisedLines: ManifestOptionData["localisedLines"]

		/** Partitions and paths to add to packagedefinition.
		 * Custom chunks are supported but discouraged; their support is very minimal and will cause compatibility problems */
		packagedefinition: ManifestOptionData["packagedefinition"]

		/** Commands to add to thumbs.dat after [Hitman5]. */
		thumbs: ManifestOptionData["thumbs"]

		/** RuntimeIDs that will be ported to chunk0 or to a provided chunk. */
		dependencies: ManifestOptionData["dependencies"]

		/** Platforms that this mod supports.
		 * All other platforms will be prevented from using this mod.
		 * Only use this when a mod uses features that only one platform supports, such as Ghost Mode and Steam. */
		supportedPlatforms: ManifestOptionData["supportedPlatforms"]

		/** Mod IDs that this mod depends on to function.
		 * Clients without these mods enabled will be prevented from using this mod. */
		requirements: ManifestOptionData["requirements"]

		/** Paths to TypeScript files that can alter deployment of the mod.
		 * The first item is considered to be the entry point; it must export the necessary functions.
		 * Any additional files are transpiled but not used directly; they can be imported from the entry point. */
		scripts: string[][]
	}

	content: (
		| {
				/** Whether the content is from the disk (from a content folder) or from another source. */
				source: "disk"

				/** Will be locale compared and sorted to determine the order in which content is deployed.
				 * If nonexistent, will be computed from the chunk and the file path.
				 * Note that file type also matters; entity patches are always deployed last due to multithreading and sfx.wem files are handled after all mods are deployed due to tool limitations. */
				order?: string

				/** The chunk this content will be deployed to. */
				chunk: number

				/** The path to the content. This will never be mutated; it is safe to pass the real path in Mods.
				 * If you are going to create a file and pass it to the framework, you should instead use a virtual source and pass a JS Blob. */
				path: string

				/** The filetype (extension) of the content.
				 * sfx.wem files are special; they are handled after all mods are deployed due to tool limitations. */
				type: string
		  }
		| {
				/** Whether the content is from disk (from a content folder) or from another source. */
				source: "virtual"

				/** Will be locale compared and sorted to determine the order in which content is deployed.
				 * If nonexistent, will be computed from the chunk and the identifier.
				 * Note that file type also matters; entity patches are always deployed last due to multithreading and sfx.wem files are handled after all mods are deployed due to tool limitations. */
				order?: string

				/** A unique identifier for this blob. Used in logging and caching. */
				identifier: string

				/** The chunk this content will be deployed to. */
				chunk: number

				/** The content, in JS Blob form. This will be written to disk or parsed in memory, depending on the content's type. */
				content: Blob

				/** The type of the content. Should mirror the extension this content would have if it was from disk.
				 * sfx.wem files are special; they are handled after all mods are deployed due to tool limitations. */
				type: string

				/** Special data used for filename-dependent filetypes, used in place of the filename. */
				extraInformation: {
					/** texture.tga */
					textHash?: string

					/** texture.tga */
					texdHash?: string

					/** texture.tga */
					textureMeta?: Blob

					/** sfx.wem */
					wwevHash?: string

					/** sfx.wem */
					wwevElement?: number

					/** Raw file or delta patch */
					runtimeID?: string

					/** Raw file or delta patch */
					fileType?: string
				}
		  }
	)[]

	blobs: (
		| {
				/** Whether the blob is from the disk (from a blobs folder) or from another source. */
				source: "disk"

				/** Will be locale compared and sorted to determine the order in which blobs are deployed. If nonexistent, will be computed from the blob's path. */
				order?: string

				/** The real file path of this blob. */
				filePath: string

				/** The path of this blob in game. */
				blobPath: string

				/** The hash of this blob. Can be automatically computed from its path. */
				blobHash?: string
		  }
		| {
				/** Whether the blob is from the disk (from a blobs folder) or from another source. */
				source: "virtual"

				/** Will be locale compared and sorted to determine the order in which blobs are deployed. If nonexistent, will be computed from the blob's path. */
				order?: string

				/** A unique identifier for this blob. Used in logging. */
				identifier: string

				/** The blob, in JS Blob form. This will be written to disk during deploy. */
				content: Blob

				/** The filetype of this blob (jpg, png, json). */
				filetype: string

				/** The path of this blob in game. */
				blobPath: string

				/** The hash of this blob. Can be automatically computed from its path. */
				blobHash?: string
		  }
	)[]

	rpkgTypes: {
		[k: string]:
			| {
					/** Whether the RPKG is a new chunk (a base RPKG) or a patch. Use of new chunks is discouraged; the support is minimal and incompatibility issues will arise. */
					type: "base"

					/** The chunk meta for the base RPKG. Can be a string (the path to the chunk meta) or a JS Blob (the binary content of the chunk meta file). */
					chunkMeta: string | Blob
			  }
			| {
					/** Whether the RPKG is a new chunk (a base RPKG) or a patch. Use of new chunks is discouraged; the support is minimal and incompatibility issues will arise. */
					type: "patch"
			  }
	}
}

export interface Config {
	runtimePath: string
	retailPath: string

	skipIntro: boolean

	outputToSeparateDirectory: boolean
	outputConfigToAppDataOnDeploy: boolean

	reportErrors?: boolean
	errorReportingID?: string | null

	developerMode: boolean
	knownMods: string[]

	loadOrder: string[]
	modOptions: {
		[k: string]: string[]
	}

	platform: Platform
}

export interface ModScript extends NodeModule {
	/** A function to run immediately after mod analysis - alter the deploy instruction to modify how the framework deploys the mod. */
	analysis(context: ModContext, modAPI: ModAPI): Promise<void>

	/** A function that runs immediately before the mod deploy begins - a staging folder is created but the mod has not had anything deployed. */
	beforeDeploy(context: ModContext, modAPI: ModAPI): Promise<void>

	/** A function that runs immediately after the mod deploy ends - the deploy instruction has been processed. */
	afterDeploy(context: ModContext, modAPI: ModAPI): Promise<void>

	/** You must provide a caching policy for this script. It's used to ensure that changes in how your mod scripts function are properly accounted for when caching other files. Scripts themselves are never cached. */
	cachingPolicy: CachePolicy
}

export interface CachePolicy {
	/** A list of hashes that your script may affect, alter, create or write in any way. */
	affected: string[]
}

export interface ModContext {
	/** The effective config the framework is using.
	 * Note that "effective" means this is often not identical to the contents of config.json - paths are resolved to absolute paths and backwards compatibility changes are applied. */
	config: Config

	/** The current deploy instruction of the mod, created automatically via analysis.
	 * Alter this to modify the result of the framework's deploy.
	 * If you plan to add content or blobs, it's recommended to use the virtual source and pass JS Blobs to the framework. */
	deployInstruction: DeployInstruction

	/** The assigned temporary folder for this script. Do anything requiring filesystem working here - the folder will be cleared after the script is done executing. */
	tempFolder: string
}

export interface ModAPI {
	/** Wrappers for the RPKG tool. */
	rpkg: {
		/** Call an RPKG tool function and return its output. */
		callRPKGFunction(func: string): Promise<string>

		/** Get the RPKG a given hash resides in, in "chunkXpatchY" format. */
		getRPKGOfHash(hash: string): Promise<string>

		/** Extract a file from an RPKG to the assigned temporary folder of the script. */
		extractFileFromRPKG(hash: string, rpkg: string): Promise<void>
	}

	/** Utility functions. */
	utils: {
		/** Get the QuickEntity module for a given QuickEntity version. */
		getQuickEntityFromVersion(version: string): any

		/** Get the QuickEntity module for a given QuickEntity patch version. */
		getQuickEntityFromPatchVersion(version: string): any

		/** Copy a file to temp if it has already been staged by a mod, or extract it if it has not. stagingChunk defaults to chunk0. */
		extractOrCopyToTemp(rpkgOfFile: string, file: string, type: string, stagingChunk: string | undefined): Promise<void>

		/** Flip the endianness of a hexadecimal string. */
		hexflip(input: string): string
	}

	/** Functions for logging to the console. */
	logger: {
		/** Print a message at the verbose log level. This is not shown by default to a user, but is useful for debugging. */
		verbose(message: string): Promise<void>

		/** Print a message at the debug log level. */
		debug(message: string): Promise<void>

		/** Print a message at the info log level. */
		info(message: string): Promise<void>

		/** Print a message at the warn log level. */
		warn(message: string): Promise<void>

		/** Print a message at the error log level.
		 * This will by default exit the program. It is recommended to leave exitAfter enabled (which it is by default); exitAfter is only used internally for certain errors.
		 * If there is an error that is not critical (not deserving of exiting the program), use warn instead. */
		error(message: string, exitAfter?: boolean): Promise<void>
	}
}

export interface HMLanguageToolsLOCR {
	hash: string
	languages: {
		[lang: string]: {
			[hash: string]: string
		}
	}
}
