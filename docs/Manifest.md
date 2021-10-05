# Manifests
Each mod contains a manifest. Manifests have the following format:
```json
{
	"name": "Example Mod",
	"description": "It is a mod",
	"authors": ["Atampy26", "No one else"],
	"contentFolder": "content", // Folder next to the manifest to use for the mod content
	"blobsFolder": "blobs", // Folder next to the manifest to use for blobs (new/edited existing JSON and GFXI files)
	"localisation": {
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
	"packagedefinition": [
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
	"frameworkVersion": 0.3
}
```