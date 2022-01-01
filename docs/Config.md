# Config
The config.json file looks like this:
```json
{
    "runtimePath": "..\\Runtime",
    "skipIntro": true,
    "loadOrder": [],
    "modOptions": {}
}
```

Load order is top-first - a mod lower in the load order will load later and thus overwrite mods further up.

The `skipIntro` key will automatically patch the game to skip the intro and load directly into the "Press ENTER" screen.

The `runtimePath` key must be configured to the location of your Runtime folder (it defaults to `..\Runtime`, so the framework is placed in `HITMAN3\any folder`). Use double backslashes (`\\`).