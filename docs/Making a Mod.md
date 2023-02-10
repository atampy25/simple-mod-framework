Creating a mod with the framework is very simple - just add a manifest file and put your mod files in a folder. More advanced framework features that can make modding much easier can be found in the various other documentation files.

## Setting up

### Recommended: the GitHub template

If you plan on updating your mod after its release, or you'd like the ability to quickly set up a new mod, or you'd like to collaborate with others, or you'd like to track your changes for easy debugging, there's a GitHub template for mods that handles everything for you - it'll automatically increment the version and generate changelogs, among other things.

The only prerequisite is knowledge of Git/GitHub, which is generally something you should have when you're working with mods anyway.

You can find the template at `https://github.com/atampy25/smf-mod`. Follow the instructions in the README, then clone the mod to your Mods folder.

### Manually setting up a mod folder

If you want to make an incredibly simple mod that you will never update again, or you don't have knowledge of Git and don't want to spend the half an hour required to learn it, you can manually set up a mod folder.

Create a new folder in the `Mods` folder where you have put the framework. Call it whatever you like.

Then, put a file called `manifest.json` in it. Paste the following into it:

```jsonc
{
  "version": "1.0.0",
  "id": "YourNameOrUserName.FirstMod",
  "name": "Your First Mod",
  "description": "Extremely good description",
  "authors": ["YourNameOrUserName"],
  "contentFolders": ["content"],
  "frameworkVersion": "2.15.1"
}
```

Most of those fields are self-explanatory. There are other optional fields documented in, as well as more explanation of these ones in, [Manifest](Manifest.md).

Notice how `contentFolders` has been set to `["content"]`. This is the name of the folder where most of your mod's files will be. Create a folder called `content` (or change the value of `contentFolders` to whatever you want and name a new folder that).

## Adding some content

The content folder contains other folders named after the game's chunks (chunk0, chunk1... chunk28). Create folders for whichever chunks your mod edits content in.

Now, just place your mod's files in those chunk folders. Files in chunk0 for example will go in the `chunk0` folder. There are other types of files that the framework can automatically convert between as well, like textures and entities. Those are documented in [Special File Types](<Special File Types.md>).

## That's it lmao

All a framework mod needs is a manifest and some content. In fact, if you only use manifest features, you don't even need any content folders!
