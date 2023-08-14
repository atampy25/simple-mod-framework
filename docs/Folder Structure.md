The folder structure for a mod looks like this:
```
MyAmazingMod/
├─ manifest.json
├─ content folder/
│  ├─ chunk0/
│  │  ├─ Vamprism.contract.json
│  │  ├─ repo edits.repository.json
│  │  ├─ 0098B17A37DE.GFXF
│  │  ├─ GlobalDataPatch.entity.patch.json
│  ├─ chunk1/
│  │  ├─ ...
├─ blobs folder/
│  ├─ images/
│  │  ├─ unlockables/
│  │  │  ├─ theBestUnlockable.jpg
```
`MyAmazingMod` can be placed in the load order.

The manifest.json controls what the content and blobs folders must be named.

The content folder contains chunk folders, which contain files (and folders, the chunk folder is recursively checked for all files). These files can be raw files or special files. The current special file types are:

| **File type**         | **Contents**                                                                 |
|-----------------------|------------------------------------------------------------------------------|
| `entity.json`         | A QuickEntity JSON file that will replace the entity it targets              |
| `entity.patch.json`   | A QuickEntity patch JSON that will patch the entity it targets               |
| `unlockables.json`    | Unlockables to be put in the unlockables ORES                                |
| `repository.json`     | Repository items to be placed in the repository                              |
| `contract.json`       | A contract that will be added to the contracts ORES                          |
| `JSON.patch.json`     | An RFC6902 JSON patch that will be applied to the hash the file specifies    |
| `material.json`       | An RPKG tool material JSON that will replace/add the targeted material       |
| `clng.json`           | A HMLanguages CLNG JSON that will replace/add the targeted file             |
| `ditl.json`           | A HMLanguages DITL JSON that will replace/add the targeted file             |
| `dlge.json`           | A HMLanguages DLGE JSON that will replace/add the targeted file             |
| `locr.json`           | A HMLanguages LOCR JSON that will replace/add the targeted file             |
| `rtlv.json`           | A HMLanguages RTLV JSON that will replace/add the targeted file             |
| `texture.tga`         | A TGA to rebuild into a game texture (TEXT only or TEXT and TEXD)            |
| `sfx.wem`             | A Wwise sound effect to patch a WWEV file with                               |
| `delta`               | A VCDiff delta file to patch the specified file with                         |

The names of special files do not matter - it is their extensions that do, **except for texture.tga, sfx.wem and delta files**. Raw files, which any non-special file is, are placed directly into the built RPKG and so must be named like usual.

*Note: these are file types, not file names - instead of adding "repository.json" to your mod, add "edits.repository.json".*

If a chunk meta file named chunkX.meta is placed at the top level of the chunk folder, the framework will overwrite the chunk with the content in the content folder. This allows for the creation of new chunks. Make sure you don't do this if you're trying to patch an existing chunk, or you may overwrite your game files!

The blobs folder contains blobs, which follow the same filepath as the folder structure and which will be placed into the blobs ORES. In the example, `theBestUnlockable.jpg` would be assigned the path `images/unlockables/theBestUnlockable.jpg`.