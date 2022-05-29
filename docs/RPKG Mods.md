RPKG mods can be used with the framework easily, even if they lack some of the compatibility and user experience features the framework offers, like patching and manifest metadata.

The folder structure for importing an RPKG mod looks like this:
```
MyAmazingMod/
├─ chunk0/
│  ├─ any filename.rpkg
│  ├─ multiple files supported.rpkg
├─ chunk1/
│  ├─ another file.rpkg
```

`MyAmazingMod` can be placed in the load order.

The GUI supports importing single RPKGs, and will automatically create this structure.