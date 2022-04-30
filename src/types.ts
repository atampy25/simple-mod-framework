type RuntimeID = string
type LocalisationID = string
type ModID = string

type Platform = "steam" | "epic" | "microsoft"

export type Manifest = {
	id: ModID

	name: string
	description: string
	authors: string[]

	version: string
	frameworkVersion: string
	updateCheck: string

	options: ((
		| {
				name: string
				type: "checkbox"

				enabledByDefault?: boolean

				tooltip?: string
				image?: string
		  }
		| {
				name: string
				type: "select"

				group: string
				enabledByDefault?: boolean

				tooltip?: string
				image?: string
		  }
		| {
				name: string
				type: "requirement"
				mods: string[]
		  }
	) &
		ManifestOptionData)[]
} & ManifestOptionData

export interface ManifestOptionData {
	/** A folder with content files that will be crawled and automatically deployed. */
	contentFolder: string

	/** A folder with blobs that will be crawled and automatically deployed. */
	blobsFolder: string

	/** Localisation for each supported language. */
	localisation: {
		english?: {
			[k: LocalisationID]: string
		}
		french?: {
			[k: LocalisationID]: string
		}
		italian?: {
			[k: LocalisationID]: string
		}
		german?: {
			[k: LocalisationID]: string
		}
		spanish?: {
			[k: LocalisationID]: string
		}
		russian?: {
			[k: LocalisationID]: string
		}
		chineseSimplified?: {
			[k: LocalisationID]: string
		}
		chineseTraditional?: {
			[k: LocalisationID]: string
		}
		japanese?: {
			[k: LocalisationID]: string
		}
	}

	/** Overridden localisation from the game files. */
	localisationOverrides: {
		[k: RuntimeID]: {
			english?: {
				[k: string]: string
			}
			french?: {
				[k: string]: string
			}
			italian?: {
				[k: string]: string
			}
			german?: {
				[k: string]: string
			}
			spanish?: {
				[k: string]: string
			}
			russian?: {
				[k: string]: string
			}
			chineseSimplified?: {
				[k: string]: string
			}
			chineseTraditional?: {
				[k: string]: string
			}
			japanese?: {
				[k: string]: string
			}
		}
	}

	/** LINE files to create from localisation IDs. */
	localisedLines: {
		[k: RuntimeID]: LocalisationID
	}

	/** Partitions and paths to add to packagedefinition.
	 * Custom chunks are supported but discouraged; their support is very minimal and will cause compatibility problems */
	packagedefinition: (
		| {
				type: string
				name?: string
				parent?: string
				partitionType?: string
		  }
		| {
				type: string
				partition?: string
				path?: string
		  }
	)[]

	/** Commands to add to thumbs.dat after [Hitman5]. */
	thumbs: string[]

	/** RPKG files to add to Runtime before the framework patch.
	 * Use of this is discouraged. */
	runtimePackages: {
		chunk: number
		path: string
	}[]

	/** RuntimeIDs that will be ported to chunk0 or to a provided chunk. */
	dependencies: (
		| string
		| {
				runtimeID: string
				toChunk: string
		  }
	)[]

	/** Platforms that this mod supports.
	 * All other platforms will be prevented from using this mod.
	 * Only use this when a mod uses features that only one platform supports, such as Ghost Mode and Steam. */
	supportedPlatforms: Platform[]

	/** Mod IDs that this mod depends on to function.
	 * Clients without these mods enabled will be prevented from using this mod. */
	requirements: ModID[]

	/** Mods this mod should load before.
	 * Used in automatic sorting by the Mod Manager GUI. */
	loadBefore: ModID[]

	/** Mods this mod should load after.
	 * Used in automatic sorting by the Mod Manager GUI. */
	loadAfter: ModID[]
}

export interface DeployInstruction {
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

		/** RPKG patch files to add to Runtime before the framework patch.
		 * Use of this is discouraged. */
		runtimePackages: ManifestOptionData["runtimePackages"]

		/** RuntimeIDs that will be ported to chunk0 or to a provided chunk. */
		dependencies: ManifestOptionData["dependencies"]

		/** Platforms that this mod supports.
		 * All other platforms will be prevented from using this mod.
		 * Only use this when a mod uses features that only one platform supports, such as Ghost Mode and Steam. */
		supportedPlatforms: ManifestOptionData["supportedPlatforms"]

		/** Mod IDs that this mod depends on to function.
		 * Clients without these mods enabled will be prevented from using this mod. */
		requirements: ManifestOptionData["requirements"]
	}

	content: (
		| {
				/** Whether the content is from the disk (from a content folder) or from another source. */
				source: "disk"

				/** The chunk this content will be deployed to. */
				chunkFolder: string

				path: string

				/** The filetype (extension) of the content.
				 * sfx.wem files are special; they are handled after all mods are deployed due to tool limitations. */
				type: string
		  }
		| {
				/** Whether the content is from disk (from a content folder) or from another source. */
				source: "virtual"

				/** The chunk this content will be deployed to. */
				chunkFolder: string

				/** The content. This will be written to disk or parsed in memory, depending on the content's type. */
				content: Blob

				/** The type of the content. Should mirror the extension this content would have if it was from disk.
				 * sfx.wem files are special; they are handled after all mods are deployed due to tool limitations. */
				type: string
		  }
	)[]

	blobs: (
		| {
				/** Whether the blob is from the disk (from a blobs folder) or from another source. */
				source: "disk"

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

				/** The blob. This will be written to disk during deploy. */
				content: Blob

				/** The filetype of this blob. */
				filetype: string

				/** The path of this blob in game. */
				blobPath: string

				/** The hash of this blob. Can be automatically computed from its path. */
				blobHash?: string
		  }
	)[]
}

export interface Config {
	runtimePath: string
	retailPath: string

	skipIntro: boolean

	outputToSeparateDirectory: boolean
	outputConfigToAppDataOnDeploy: boolean

	reportErrors?: boolean
	errorReportingID?: string | null

	loadOrder: string[]
	modOptions: {
		[k: string]: string[]
	}

	platform: Platform
}
