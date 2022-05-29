The config.json file looks like this:
```jsonc
{
    "runtimePath": "..\\Runtime",
    "retailPath": "..\\Retail",
    "skipIntro": true,
    "outputToSeparateDirectory": false,
    "loadOrder": [],
    "modOptions": {
        "Atampy26.RealisticAI": ["Normal"]
    },
    "outputConfigToAppDataOnDeploy": true
}
```

Load order is top-first - a mod lower in the load order will load later and thus overwrite mods further up.

The `skipIntro` key will automatically patch the game to skip the intro and load directly into the "Press ENTER" screen.

The `runtimePath` key must be configured to the location of your Runtime folder (it defaults to `..\Runtime`, so the framework is placed in `HITMAN3\any folder`). This is automatically set to `..\Retail\Runtime` on the Microsoft platform. Use double backslashes (`\\`).

The `retailPath` key must be configured to the location of your Retail folder (it defaults to `..\Retail`, so the framework is placed in `HITMAN3\any folder`). Use double backslashes (`\\`).

The `modOptions` key configures enabled mod options.

The `outputToSeparateDirectory` key will change the output directory from the runtime path to a folder called `Output`. This is useful if you need to copy RPKGs, like if you want to play with mods on Linux.

The `outputConfigToAppDataOnDeploy` key will automatically output the effective config to `%localappdata%\Simple Mod Framework` at the end of a deploy. This is used for interfacing with other programs.