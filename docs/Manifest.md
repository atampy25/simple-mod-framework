# Manifests
Each mod contains a manifest. Manifests have the following format:
```jsonc
{
	"id": "Atampy26.ExampleMod", // Unique ID; recommended to use reverse URI style (author.mod) - Cannot be omitted
	"name": "Example Mod", // Cannot be omitted
	"description": "It is a mod", // Cannot be omitted
	"authors": ["Atampy26", "No one else"], // Cannot be omitted
	"contentFolder": "content", // Folder next to the manifest to use for the mod content - Can be omitted
	"blobsFolder": "blobs", // Folder next to the manifest to use for blobs (new/edited existing JSON and GFXI files) - Can be omitted
	"localisation": { // Can be omitted
		"english": {
			"UI_THEBESTMOD": "The Best Mod" // You can use UI_THEBESTMOD elsewhere
		},
		"french": {
			"UI_THEBESTMOD": "Le Meilleur Mod idk french lmao" // UI_THEBESTMOD will automatically translate depending on language
		},
		"italian": {},
		"german": {},
		"spanish": {},
		"russian": {},
		"chineseSimplified": {},
		"chineseTraditional": {},
		"japanese": {}
	},
	"localisationOverrides": { // Allows you to override specific localisation in specific files - Can be omitted
		"00123456789ABCDE": {
			"english": {
				"UI_ANOVERRIDENLINE": "The framework is overriding this text"
			},
			"french": {
				"UI_ANOVERRIDENLINE": "Le framework est en train de overriding this text"
			},
			"italian": {},
			"german": {},
			"spanish": {},
			"russian": {},
			"chineseSimplified": {},
			"chineseTraditional": {},
			"japanese": {}
		}
	},
	"localisedLines": { // Allows you to link specific lines to a runtime ID for use in certain filetypes (like entities) - Can be omitted
		"00123456789ABCDE": "UI_THEBESTMOD"
	},
	"packagedefinition": [ // Can be omitted
        { // For new chunks
            "type": "partition",
            "name": "myNewChunk28",
            "parent": "season3",
            "partitionType": "standard"
        },
        { // For new bricks/entities
            "type": "entity",
            "partition": "myNewChunk28",
            "path": "[assembly:/_pro/myBricks/myNewChunk28Map.entity].entitytemplate"
        }
    ],
	"runtimePackages": [ // RPKG files to place (and automatically name) in Runtime - Can be omitted
		{
			"chunk": 0, // This for example would become chunk0patch205 if no other mods added RPKGs (numbers are incremented automatically)
			"path": "portedhashes.rpkg"
		}
	],
	"dependencies": [ // Runtime IDs of files to extract the dependencies of and place in chunk0 (automatic porting of dependencies) - Can be omitted
		"00123456789ABCDE"
	],
	"requirements": [ // Required mods (if a requirement is missing the framework will not deploy and will warn the user)
		"Atampy26.OtherNecessaryMod"
	],
	"loadBefore": [ // Mods that this mod should load *before*, i.e. mods that should override this one (the GUI will automatically sort based on this before deploying)
		"Atampy26.OtherNecessaryMod", // You'll generally want to load after a required mod
		"Atampy26.OtherModThatUsesThisMod"
	],
	"loadAfter": [ // Mods that this mod should load *after*, i.e. mods that this one should override (the GUI will automatically sort based on this before deploying)
		"Atampy26.OtherModThatThisModUses"
	],
	"version": "1.0.0", // The mod's version, used to compare against the linked JSON - make sure to use semantic versioning (Major.Minor.Patch) - Cannot be omitted
	"updateCheck": "https://hitman-resources.netlify.app/framework/updates/exampleMod.json", // A JSON that will be checked for updates (MUST BE HTTPS) - contact Atampy26 for hosting on hitman-resources.netlify.app - Can be omitted
	"frameworkVersion": "1.0.0" // The framework version the mod is designed for - Cannot be omitted
}
```

Manifests are parsed with JSON5. That means you can use comments in them.

Make sure that if you're using the sorting features you don't accidentally cause a dependency cycle! If Mod A loads before Mod B and Mod B loads before Mod C, a dependency cycle happens if Mod C tries to load before Mod A for example. Users will get a warning message if this happens and will be asked to contact you.