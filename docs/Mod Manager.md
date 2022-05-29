The framework comes with a GUI mod manager - you're looking at it. It is capable of managing load orders, importing RPKG and framework.zip mods and helping in the creation of your own mods.

## Framework ZIP files
A framework zip file is extracted directly to the `Mods` folder. For example, if you are packaging `MyAmazingMod`:
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
then your folder structure for the framework.zip file should look like this:
```
MyAmazingMod.framework.zip
├─ MyAmazingMod/
│  ├─ manifest.json
│  ├─ ...
```

In essence, **zip the folder, not its contents**. Bundling multiple modules through multiple folders isn't recommended - you should use mod options (see [Manifest](Manifest.md)).