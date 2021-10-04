# Folder Structure
The folder structure for a mod looks like this:
```
MyAmazingMod/
├─ manifest.json
├─ content folder/
│  ├─ chunk0/
│  │  ├─ Vamprism.contract.json
│  │  ├─ 0098B17A37DE.GFXF
│  │  ├─ GlobalDataPatch.entity.patch.json
│  ├─ chunk1/
│  │  ├─ ...
├─ blobs folder/
│  ├─ images/
│  │  ├─ unlockables/
│  │  │  ├─ theBestUnlockable.jpg
```

The manifest.json controls what the content and blobs folders must be named.

The content folder contains chunk folders, which contain files. These files can be raw files or special files. The current special file types are `entity.json`, which is a QuickEntity JSON file that will replace the entity it targets, `entity.patch.json`, which is a QuickEntity patch JSON that will patch the entity it targets, `unlockables.json`, which contains unlockables to be put in the unlockables ORES, `repository.json`, which contains repository items to be placed in the repository and `contract.json`, which contains a contract that will be added to the contracts ORES.

The names of special files do not matter. Raw files, which any non-special file is, are placed directly into the built RPKG and so must be named like usual.

The blobs folder contains blobs, which follow the same filepath as the folder structure and which will be placed into the blobs ORES. In the example, `theBestUnlockable.jpg` would be assigned the path `images/unlockables/theBestUnlockable.jpg`.