# Mod Manager
The framework comes with a mod manager GUI. It is capable of managing load orders and importing RPKG and framework.zip mods.

## framework.zip
A framework.zip file is extracted directly to the `Mods` folder. For example, if you are packaging `MyAmazingMod`:
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

In essence, **zip the folder, not its contents**. This means that for more complex mods with more than one module, you can distribute multiple mod folders like so:
```
MyModularMod.framework.zip
├─ MyModularMod AI Realism/
│  ├─ manifest.json
│  ├─ ...
├─ MyModularMod Mission Improvements/
│  ├─ manifest.json
│  ├─ ...
```

If you have lots of settings or want a better experience you should use mod options (see Manifest).