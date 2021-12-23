# Manifests
Each mod contains a manifest. Manifests have the following format:
```jsonc
{
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
	"localisationOverrides": { // Allows you to override specific localisation in specific files - Can be omitted -------------------- NOT IMPLEMENTED YET
		"00123456789ABCDE": {
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
		}
	},
	"localisedLines": { // Allows you to link specific lines to a file for use in certain filetypes (like entities) - Can be omitted
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
	"version": "1.0.0", // The mod's version, used to compare against the linked JSON - make sure to use semantic versioning (Major.Minor.Patch) - Cannot be omitted
	"updateCheck": "https://hitman-resources.netlify.app/framework/updates/exampleMod.json", // A JSON that will be checked for updates (MUST BE HTTPS) - contact Atampy26 for hosting on hitman-resources.netlify.app - Can be omitted
	"frameworkVersion": "1.0.0" // The framework version the mod is designed for - Cannot be omitted
}
```

Manifests are parsed with JSON5. That means you can use comments in them.