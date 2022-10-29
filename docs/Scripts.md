The framework includes a system for augmenting deploys using TypeScript code. You won't need to use this unless you're doing something especially unique, or you're looking to automatically generate parts of your mod. Whatever the case, the scripting system lets you do anything you can do with just JSON and more.

To create a mod script, you can add a `scripts` key to the top-level of your manifest or an option. The first element of the array is the entry point; this file should export the necessary functions. All other elements are transpiled but not directly used by the framework, and are optional; if you break up your scripts into multiple files, you'll need to add them here.

```jsonc
{
    /* Paths to TypeScript files that can alter deployment of the mod.
	 * The first item is considered to be the entry point; it must export the necessary functions.
	 * Any additional files are transpiled but not used directly; they can be imported from the entry point. */
    "scripts": [
        "mod.ts", // entry point
        "helpers.ts", // helper
        "somethingElse.ts" // helper
    ]
}
```

Entry points should export three functions which are called by the framework: `analysis` (called during mod analysis; this is where you should auto-generate your mod), `beforeDeploy` (this is where anything load-order sensitive should happen) and `afterDeploy` (this is where you should clean things up).

```ts
interface ModScript extends NodeModule {
	/** A function to run immediately after mod analysis - alter the deploy instruction to modify how the framework deploys the mod. */
	analysis(context: ModContext, modAPI: ModAPI): Promise<void>

	/** A function that runs immediately before the mod deploy begins - a staging folder is created but the mod has not had anything deployed. */
	beforeDeploy(context: ModContext, modAPI: ModAPI): Promise<void>

	/** A function that runs immediately after the mod deploy ends - the deploy instruction has been processed. */
	afterDeploy(context: ModContext, modAPI: ModAPI): Promise<void>

	/** You must provide a caching policy for this script. It's used to ensure that changes in how your mod scripts function are properly accounted for when caching other files. Scripts themselves are never cached. */
	cachingPolicy: CachePolicy
}

interface CachePolicy {
	/** A list of hashes that your script may affect, alter, create or write in any way. */
	affected: string[]
}
```

These hooks are given two arguments, `ModContext` and `ModAPI`. The context contains information about the current deployment, as well as an assigned temporary folder for working with files and the path of the mod (for anything that should persist). The API contains functions for dealing with RPKG, logging, the shell, QuickEntity and a few other things.

## Best practices
Make sure you use the assigned temporary folder for dealing with files; it's automatically cleared when your scripts complete and in the future could be used for other purposes.

Instead of using child_process directly, you should use the `execCommand` function of the `ModAPI`. It automatically logs its execution, helping with debugging. Similarly, you should use the included RPKG wrapper functions instead of calling it yourself; the wrapper functions are usually faster than executing the EXE as they re-use the same instance, which keeps things loaded in memory.

Try to use the framework's manifest features and special file types whenever possible instead of mod scripting - unlike mod scripting, they can be cached, and any changes or fixes made to them will require no intervention from you.