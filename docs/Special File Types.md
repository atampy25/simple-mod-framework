## entity.json
A QuickEntity JSON. Will be automatically built and converted to TEMP/TBLU/TEMP.meta/TBLU.meta, then placed in the staging folder (which is eventually built into a patch).

## entity.patch.json
A QuickEntity patch JSON. If no mods have altered the same TEMP/TBLU, the latest version of it will be pulled from the game's files. Otherwise, the TEMP/TBLU are pulled from the previous mod's version.

The TEMP/TBLU are then converted to QN JSON, where the patch JSON is applied, and then converted back to TEMP/TBLU and placed in the staging folder.

## unlockables.json
A JSON with the following format:
```json
{
    "FIREARMS_HERO_PISTOL_KRUGERMEIER": {
        "Properties": {
            "RepositoryId": "c8a09c31-a53e-436f-8421-a4dc4115f633"
        }
    },
    "CUSTOM_ITEM_THAT_I_ADDED_WHICH_IS_ACTUALLY_THE_JAEGER_SNIPER": {
        "Id": "CUSTOM_ITEM_THAT_I_ADDED_WHICH_IS_ACTUALLY_THE_JAEGER_SNIPER",
        "Guid": "910asd56-0aea-4dac-93b7-a229faaoe24f",
        "Type": "weapon",
        "Subtype": "sniperrifle",
        "ImageId": "",
        "RMTPrice": 99,
        "GamePrice": 99,
        "IsPurchasable": false,
        "IsPublished": true,
        "IsDroppable": false,
        "Capabilities": [],
        "Qualities": {},
        "Properties": {
            "Gameplay": {
                "range": 1.0,
                "damage": 1.0,
                "clipsize": 0.2,
                "rateoffire": 0.3
            },
            "Name": "UI_FIREARMS_HERO_SNIPER_HEAVY_BASE_NAME",
            "Description": "UI_FIREARMS_HERO_SNIPER_HEAVY_BASE_DESC",
            "Quality": 4,
            "Rarity": "common",
            "LoadoutSlot": "carriedweapon",
            "RepositoryId": "370580fc-7fcf-47f8-b994-cebd279f69f9",
            "UnlockOrder": 5
        },
        "Rarity": "common"
    }
}
```

The unlockables mentioned in the file are automatically added/edited in the unlockables ORES. Partial edits of existing items are supported (properties will be traversed and assigned).

## repository.json
A JSON with the following format:
```json
{
    "7a714602-2103-4271-9766-233b9e2154db": {
        "Image": "images/customImages/formerPrimeMinisterOfAustralia.jpg",
        "Name": "Kevin Rudd"
    },
    "7a62219e-008a-4a0a-b233-768d39287842": {
        "ID_": "7a62219e-008a-4a0a-b233-768d39287842",
        "Image": "images/actors/actor_a166a37e-a3f8-42d2-99d6-e0dd2cf5c090_1_0_0.jpg",
        "Name": "Thisguy's Adeadman",
        "Outfit": "a166a37e-a3f8-42d2-99d6-e0dd2cf5c090",
        "OutfitVariationIndex": 1.0,
        "CharacterSetIndex": 0.0,
        "Description": "Unknown",
        "Description_LOC": "actor_description",
        "Tile": "images/actors/default_target.png"
    }
}
```

The repository items mentioned in the file are automatically added/edited in the repository file. Partial edits of existing items are supported (properties will be traversed and assigned).

## contract.json
A contract JSON. The contract inside is automatically given a custom hash (determined by `smfContract` + the contract's UUID), added to the contracts ORES and placed in the staging folder. It supports editing existing game contracts.

## JSON.patch.json
Mutates the given JSON file with a patch. The content of the `JSON.patch.json` file follows the following format:
```json
{
    "file": "004F4B738474CEAD", // The file to patch
    "type": "JSON", // The filetype of the file to patch (can be omitted, will assume JSON; if ORES, OREStool will be run and the result will be patched and rebuilt)
    "patch": [{ // An RFC6902 format patch
        "op": "add",
        "path": "/Root/Children/-",
        "value": {
            "Id": "Epic Gamer ID",
            "_comment": "Epic Gamer Mission",
            "NarrativeContext": "Mission",
            "Meta": {
                "Ui": {
                    "Row": 3,
                    "Col": 5
                }
            }
        }
    }]
}
```

If the file is the unlockables ORES, it will be transformed to the format used by the `unlockables.json` filetype (Id -> ORES entry).
If the file is the REPO, it will be transformed to the format sued by the `repository.json` filetype (ID_ -> REPO entry).

## texture.tga
**Note:** The filename matters for this special type.

Must also have a .texture.tga.meta file next to it (obtained from Anthony Fuller's HMTextureTools). If the file should only be converted to a TEXT file, the files should be named `TEXThash.texture.tga` and `TEXThash.texture.tga.meta`. If the file should be converted to both a TEXT file and a TEXD file, the files should be named `TEXThash~TEXDhash.texture.tga` and `TEXThash~TEXDhash.texture.tga.meta`. For example, the TEXT-only Instinct LUT texture would be `008C1F5C7305A978.texture.tga` and `008C1F5C7305A978.texture.tga.meta`.

The framework will automatically convert the TGA to the specified texture files and place them in the staging folder based on the specified hash in the file name.

## sfx.wem
**Note:** The filename matters for this special type.

Patches a WWEV file with the given Wwise file. Named in the format `WWEVhash~wemIndex.sfx.wem`. For example, to patch `1.wem` in `play_sfx_bbq_hamburger_flip_01` (`00539F7F65CB89E8.WWEV`), the file should be named `00539F7F65CB89E8~1.sfx.wem`.

The framework will automatically extract the WWEV and copy the wem to it, then rebuild the WWEV and place it in the staging folder.

## delta
**Note:** The filename matters for this special type.

Patches a given file with a VCDiff delta using xdelta3. Named in the format `hash~filetype.delta`. For example, to patch `004A314BA75429D7.GFXF`, the file should be named `004A314BA75429D7~GFXF.delta`.

The framework will automatically extract the file and patch it, then place it in the staging folder. You may want to include a meta file for the hash as well, or the RPKG tool will assume the default metadata.