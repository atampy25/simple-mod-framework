# Manifests

Each mod contains a manifest. Manifests have the following format:

```jsonc
{
  /* -------------------------------------- Required data -------------------------------------- */
  "id": "Atampy26.ExampleMod", // Unique ID; recommended to use reverse URI style (Author.Mod)
  "name": "Example Mod",
  "description": "It is a mod",
  "authors": ["Atampy26", "No one else"],
  "version": "1.0.0", // The mod's version, used to compare against the linked JSON - make sure to use semantic versioning (Major.Minor.Patch)
  "frameworkVersion": "1.4.0", // The framework version the mod is designed for

  /* -------------------------------------- Optional data -------------------------------------- */
  "updateCheck": "https://hitman-resources.netlify.app/framework/updates/exampleMod.json", // A JSON (see Mod Updates) that will be checked for updates (MUST BE HTTPS) - contact Atampy26 for hosting on hitman-resources.netlify.app

  /* ------- This data can be used in mod options as well as on the top level (optional) ------- */
  "contentFolder": "content", // Folder next to the manifest to use for the mod content
  "blobsFolder": "blobs", // Folder next to the manifest to use for blobs (new/edited existing JSON and GFXI files)
  "localisation": {
    "english": {
      "UI_THEBESTMOD": "The Best Mod" // You can use UI_THEBESTMOD elsewhere
    },
    "french": {
      "UI_THEBESTMOD": "Le Meilleur Mod idk french lmao" // UI_THEBESTMOD will automatically translate depending on language
    },
    "italian": {},
    "german": {},
    "spanish": {},
    "russian": {},
    "chineseSimplified": {},
    "chineseTraditional": {},
    "japanese": {}
  },
  "localisationOverrides": {
    // Allows you to override specific localisation in specific files
    "00123456789ABCDE": {
      "english": {
        "123456789": "The framework is overriding this text"
      },
      "french": {
        "123456789": "Le framework est en train de overriding this text"
      },
      "italian": {},
      "german": {},
      "spanish": {},
      "russian": {},
      "chineseSimplified": {},
      "chineseTraditional": {},
      "japanese": {}
    }
  },
  "localisedLines": {
    // Allows you to link specific lines to a runtime ID for use in certain filetypes (like entities)
    "00123456789ABCDE": "UI_THEBESTMOD"
  },
  "packagedefinition": [
    {
      // For new chunks
      "type": "partition",
      "name": "myNewChunk28",
      "parent": "season3",
      "partitionType": "standard"
    },
    {
      // For new bricks/entities
      "type": "entity",
      "partition": "myNewChunk28",
      "path": "[assembly:/_pro/myBricks/myNewChunk28Map.entity].entitytemplate"
    }
  ],
  "thumbs": ["ConsoleCmd AAAAAAAAAA"], // Thumbs.dat commands to place after [Hitman5]
  "runtimePackages": [
    // RPKG files to place (and automatically name) in Runtime
    {
      "chunk": 0, // This for example would become chunk0patch205 if no other mods added RPKGs (numbers are incremented automatically)
      "path": "portedhashes.rpkg"
    }
  ],
  "dependencies": [
    // Runtime IDs of files to extract the dependencies of and place in chunk0 (automatic porting of dependencies) OR objects containing a runtime ID and the chunk to place the dependencies in
    "00123456789ABCDE",
    {
      "runtimeID": "00AAAAAAAAAAAAAA",
      "toChunk": "chunk1"
    }
  ],
  "supportedPlatforms": [
    // Supported platforms for the mod - steam and epic are the only currently supported platforms - if this is omitted it is assumed that all are supported
    "steam"
  ],
  "requirements": [
    // Required mods (if a requirement is missing the framework will not deploy and will warn the user)
    "Atampy26.RequiredMod"
  ],
  "loadBefore": [
    // Mods that this mod should load *before* if they are enabled, i.e. mods that should override this one (the GUI will automatically sort based on this before deploying)
    "Atampy26.OtherModThatUsesThisMod"
  ],
  "loadAfter": [
    // Mods that this mod should load *after* if they are enabled, i.e. mods that this one should override (the GUI will automatically sort based on this before deploying)
    "Atampy26.RequiredMod", // You'll generally want to load after a required mod
    "Atampy26.OtherModThatThisModUses"
  ],

  "options": [
    // Settings for the mod that can be enabled/disabled in the GUI - Can be omitted if the mod doesn't need to provide settings
    {
      "name": "Use additional content", // Must be unique for checkbox type options
      "tooltip": "Some additional content to use", // Not required, will display a tooltip to the right of the input when the user hovers over it in the GUI
      "image": "additionalcontent.png", // Not required, will display an image to the right of the settings window with the image, option name and tooltip when hovered in the GUI
      "type": "checkbox", // Checkbox type means a checkbox to use the variation or not
      "enabledByDefault": false, // Default value of the mod option when the user first enables the mod - if it is enabled by default but requires a non-present mod it will be forcibly disabled
      "contentFolder": "additional content", // Options can include all fields in the above section, and do not override them (so both content folders are used)
      "requirements": ["Atampy26.AnotherRequiredModButOnlyIfVariationEnabled"]
    },
    {
      "name": "Lowercase text",
      "tooltip": "quiet text",
      "type": "select", // Select type means a select box (labelled with whatever group is set as); only one option of the group can be selected and used
      "group": "Use lowercase or uppercase text",
      // enabledByDefault can be omitted - its default value is false
      "localisation": {
        "english": {
          "UI_SOMELOCALISATIONTHATUSESOPTIONS": "Some localisation that uses options"
        },
        "french": {
          "UI_SOMELOCALISATIONTHATUSESOPTIONS": "my french knowledge is lacking"
        },
        "italian": {},
        "german": {},
        "spanish": {},
        "russian": {},
        "chineseSimplified": {},
        "chineseTraditional": {},
        "japanese": {}
      },
      "requirements": [
        "Atampy26.ReadableUI" // As an example, lowercase text will only work with Readable UI installed because by default the game UI is capitalised
      ]
    },
    {
      "name": "Uppercase text",
      "tooltip": "L O U D text",
      "type": "select",
      "group": "Use lowercase or uppercase text",
      "enabledByDefault": true,
      "localisation": {
        "english": {
          "UI_SOMELOCALISATIONTHATUSESOPTIONS": "SOME LOCALISATION THAT USES OPTIONS"
        },
        "french": {
          "UI_SOMELOCALISATIONTHATUSESOPTIONS": "MY FRENCH KNOWLEDGE IS LACKING"
        },
        "italian": {},
        "german": {},
        "spanish": {},
        "russian": {},
        "chineseSimplified": {},
        "chineseTraditional": {},
        "japanese": {}
      }
    },
    {
      "name": "Use epic content",
      "type": "requirement", // This variation will be active if every mod in mods is enabled and inactive otherwise - it will not be shown in the GUI
      "mods": ["Atampy26.SomeOtherMod"],
      "contentFolder": "epicContent"
    }
  ]
}
```

Manifests are parsed with JSON5. That means you can use comments in them.

Make sure that if you're using the sorting features you don't accidentally cause a dependency cycle! If Mod A loads before Mod B and Mod B loads before Mod C, a dependency cycle happens if Mod C tries to load before Mod A for example (A --> B --> C --> A isn't possible). Users will get a warning message if this happens and will be asked to contact you.
