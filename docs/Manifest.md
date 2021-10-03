# Manifests
Each mod contains a manifest. Manifests have the following format:
```json
{
	"name": "Example Mod",
	"description": "It is a mod",
	"authors": ["Atampy26", "No one else"],
	"contentFolder": "theContentFolder", // Folder next to the manifest to use for the mod content
	"localisation": {
		"en": {
            "UI_THEBESTMOD": "The Best Mod" // You can use UI_THEBESTMOD elsewhere -- NOT YET IMPLEMENTED
        },
		"fr": {},
		"it": {},
		"de": {},
		"es": {},
		"ru": {},
		"cn": {},
		"tc": {},
		"jp": {}
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
	"undelete": [], // Hashes to remove from deletion lists -- NOT YET IMPLEMENTED
	"frameworkVersion": 0.2
}
```