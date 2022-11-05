Creating a mod with the framework is very simple - just add a manifest file and put your mod files in a folder. More advanced framework features that can make modding much easier can be found in the various other documentation files.

## Setting up

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
  "frameworkVersion": "2.2.1"
}
```

Most of those fields are self-explanatory. There are other optional fields documented in, as well as more explanation of these ones in, [Manifest](Manifest.md).

Notice how `contentFolders` has been set to `["content"]`. This is the name of the folder where most of your mod's files will be. Create a folder called `content` (or change the value of `contentFolders` to whatever you want and name a new folder that).

## Adding some content

The content folder contains other folders named after the game's chunks (chunk0, chunk1... chunk28). Create folders for whichever chunks your mod edits content in.

Now, just place your mod's files in those chunk folders. Files in chunk0 for example will go in the `chunk0` folder. There are other types of files that the framework can automatically convert between as well, like textures and entities. Those are documented in [Special File Types](<Special File Types.md>).

## That's it lmao

All a framework mod needs is a manifest and some content. In fact, if you only use manifest features, you don't even need any content folders!
