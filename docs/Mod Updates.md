Mods can automatically update themselves if an update link is provided; this will display an indicator in the Mod Manager whenever a mod has a new update and will allow the user to click a button to automatically download and install the new version.

The easiest way of providing automatic updates is to use the mod template at `https://github.com/atampy25/smf-mod`, which will automatically configure and manage updates. In addition, using the template allows SMF to combine all new update changelogs together, while mods which don't use it will only show the latest changelog. For example, if a mod is updated to 1.1.0 with the message "- Add new feature" and updated to 1.2.0 with the message "- Improve existing feature", a user updating from 1.0.0 to 1.2.0 will only see "- Improve existing feature" and will be unaware of anything other than the latest message. If the mod uses the GitHub template, the user will instead see:
-   Add new feature
-   Improve existing feature
which provides a better experience.

Update manifests (static JSONs linked to in the manifest) have the following format:
```jsonc
{
	"version": "1.0.1", // Your mod's current version (make sure it's even with the manifest's version) - make sure to use semantic versioning (Major.Minor.Patch)
	"changelog": "I made it better", // Changes since last version (if your version is 1.0.0 just write Initial release or something)
	"url": "https://hitman-resources.netlify.app/framework/updates/exampleMod.framework.zip" // The file that will be downloaded and extracted when updating the mod (the archive file for your mod)
}
```