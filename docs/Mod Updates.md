You can optionally supply a link in your mod manifest to a static JSON that will be checked for updates every time the GUI is launched. Update manifests have the following format:
```jsonc
{
    "version": "1.0.1", // Your mod's current version (make sure it's even with the manifest's version) - make sure to use semantic versioning (Major.Minor.Patch)
    "changelog": "I made it better", // Changes since last version (if your version is 1.0.0 just write Initial release or something)
    "url": "https://hitman-resources.netlify.app/framework/updates/exampleMod.framework.zip", // The file that will be downloaded and extracted when updating the mod (it's the framework.zip file for your mod)
}
```

Update manifests are parsed with JSON5. That means you can use comments in them.