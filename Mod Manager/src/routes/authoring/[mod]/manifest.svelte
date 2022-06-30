<script lang="ts">
	import { scale } from "svelte/transition"
	import { onMount } from "svelte"

	import { page } from "$app/stores"

	import { alterModManifest, FrameworkVersion, getManifestFromModID, getModFolder, setModManifest } from "$lib/utils"
	import ModManifestInterface from "$lib/ModManifestInterface.svelte"

	import { Language, Platform, type Manifest } from "../../../../../src/types"

	import isEqual from "lodash.isequal"

	let dummyForceUpdate = Math.random()

	let manifest = {
		version: "1.0.0",
		id: "Example.Example",
		name: "Loading...",
		description: "Extremely good description",
		authors: ["Example"],
		contentFolder: "content",
		frameworkVersion: FrameworkVersion
	} as Manifest

	$: manifest = $page.params.mod
		? getManifestFromModID($page.params.mod, dummyForceUpdate)
		: ({
				version: "1.0.0",
				id: "Example.Example",
				name: "Loading...",
				description: "Extremely good description",
				authors: ["Example"],
				contentFolder: "content",
				frameworkVersion: FrameworkVersion
		  } as Manifest)

	onMount(() => (dummyForceUpdate = Math.random()))
</script>

<div class="flex gap-4 items-center justify-center">
	<h1 class="text-center" transition:scale>
		{manifest.name}
	</h1>
</div>

<div class="flex gap-4 items-center justify-center">
	<h4 class="text-center" transition:scale>
		<a href="/authoring/{$page.params.mod}" sveltekit:reload>← Back</a>
	</h4>
</div>

<br />

<div class="{window.screen.height <= 1080 ? 'h-[88vh]' : 'h-[90vh]'} overflow-y-auto overflow-x-hidden pr-4">
	<ModManifestInterface
		source={manifest}
		modRoot={getModFolder(manifest.id)}
		on:contentFolder-define={({ detail }) => {
			alterModManifest(manifest.id, { contentFolder: detail })
			dummyForceUpdate = Math.random()
			manifest.contentFolder = detail
		}}
		on:contentFolder-undefine={() => {
			const x = getManifestFromModID(manifest.id)
			delete x["contentFolder"]
			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.contentFolder = undefined
		}}
		on:blobsFolder-define={({ detail }) => {
			alterModManifest(manifest.id, { blobsFolder: detail })
			dummyForceUpdate = Math.random()
			manifest.blobsFolder = detail
		}}
		on:blobsFolder-undefine={() => {
			const x = getManifestFromModID(manifest.id)
			delete x["blobsFolder"]
			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.blobsFolder = undefined
		}}
		on:localisationValue-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["localisation"])
				alterModManifest(manifest.id, {
					localisation: Object.fromEntries(
						Object.keys(Language)
							.filter((a) => typeof a == "string")
							.map((a) => [a, {}])
					)
				})

			alterModManifest(manifest.id, {
				localisation: {
					[detail.language]: {
						[detail.key]: detail.value
					}
				}
			})
			dummyForceUpdate = Math.random()

			manifest.localisation = manifest.localisation
		}}
		on:localisationValue-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)
			delete x["localisation"][detail.language][detail.key]

			if (
				isEqual(
					x["localisation"],
					Object.fromEntries(
						Object.keys(Language)
							.filter((a) => typeof a == "string")
							.map((a) => [a, {}])
					)
				)
			) {
				delete x["localisation"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.localisation = manifest.localisation
		}}
		on:localisationOverrideValue-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["localisationOverrides"])
				alterModManifest(manifest.id, {
					localisationOverrides: {}
				})

			if (!getManifestFromModID(manifest.id)["localisationOverrides"][detail.hash])
				alterModManifest(manifest.id, {
					localisationOverrides: {
						[detail.hash]: Object.fromEntries(
							Object.keys(Language)
								.filter((a) => typeof a == "string")
								.map((a) => [a, {}])
						)
					}
				})

			alterModManifest(manifest.id, {
				localisationOverrides: {
					[detail.hash]: {
						[detail.language]: {
							[detail.key]: detail.value
						}
					}
				}
			})
			dummyForceUpdate = Math.random()

			manifest.localisationOverrides = manifest.localisationOverrides
		}}
		on:localisationOverrideValue-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)
			delete x["localisationOverrides"][detail.hash][detail.language][detail.key]

			if (
				isEqual(
					x["localisationOverrides"][detail.hash],
					Object.fromEntries(
						Object.keys(Language)
							.filter((a) => typeof a == "string")
							.map((a) => [a, {}])
					)
				)
			) {
				delete x["localisationOverrides"][detail.hash]
			}

			if (isEqual(x["localisationOverrides"], {})) {
				delete x["localisationOverrides"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.localisationOverrides = manifest.localisationOverrides
		}}
		on:localisedLine-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["localisedLines"])
				alterModManifest(manifest.id, {
					localisedLines: {}
				})

			alterModManifest(manifest.id, {
				localisedLines: {
					[detail.key]: detail.value
				}
			})
			dummyForceUpdate = Math.random()

			manifest.localisedLines = manifest.localisedLines
		}}
		on:localisedLine-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)
			delete x["localisedLines"][detail.key]

			if (isEqual(x["localisedLines"], {})) {
				delete x["localisedLines"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.localisedLines = manifest.localisedLines
		}}
		on:pdefPartition-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["packagedefinition"])
				alterModManifest(manifest.id, {
					packagedefinition: []
				})

			const pdef = getManifestFromModID(manifest.id).packagedefinition || []

			console.log(pdef)

			console.log(detail)

			const original = pdef.some((a) => a.name == detail.partition.split("$:$")[0])
				? pdef.splice(
						pdef.findIndex((a) => a.name == detail.partition.split("$:$")[0]),
						1
				  )[0]
				: {
						type: "partition",
						name: detail.partition.split("$:$")[0],
						parent: "super",
						partitionType: "standard"
				  }

			console.log(original)

			pdef.push({
				...original,
				[detail.key]: detail.value
			})

			console.log(pdef)

			alterModManifest(manifest.id, {
				packagedefinition: pdef
			})
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
		on:pdefPartition-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)

			x.packagedefinition.findIndex((a) => a.name == detail.partition.split("$:$")[0]) &&
				x.packagedefinition?.splice(
					x.packagedefinition.findIndex((a) => a.name == detail.partition.split("$:$")[0]),
					1
				)

			if (isEqual(x["packagedefinition"], [])) {
				delete x["packagedefinition"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
		on:pdefEntity-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["packagedefinition"])
				alterModManifest(manifest.id, {
					packagedefinition: []
				})

			const pdef = getManifestFromModID(manifest.id).packagedefinition || []

			const original = pdef.some((a) => a.partition == detail.entity.split("$:$")[0].split("|")[0] && a.path == detail.entity.split("$:$")[0].split("|")[1])
				? pdef.splice(
						pdef.findIndex((a) => a.partition == detail.entity.split("$:$")[0].split("|")[0] && a.path == detail.entity.split("$:$")[0].split("|")[1]),
						1
				  )[0]
				: {
						type: "entity",
						partition: detail.entity.split("$:$")[0].split("|")[0],
						path: detail.entity.split("$:$")[0].split("|")[1]
				  }

			pdef.push({
				...original,
				[detail.key]: detail.value
			})

			alterModManifest(manifest.id, {
				packagedefinition: pdef
			})
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
		on:pdefEntity-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)

			x.packagedefinition?.splice(
				x.packagedefinition.findIndex((a) => a.partition == detail.entity.split("$:$")[0].split("|")[0] && a.path == detail.entity.split("$:$")[0].split("|")[1]),
				1
			)

			if (isEqual(x["packagedefinition"], [])) {
				delete x["packagedefinition"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.packagedefinition = manifest.packagedefinition
		}}
		on:runtimePackage-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["runtimePackages"])
				alterModManifest(manifest.id, {
					runtimePackages: []
				})

			const rpkgs = getManifestFromModID(manifest.id).runtimePackages || []

			const original = rpkgs.some((a) => a.chunk == detail.origChunk && a.path == detail.origPath)
				? rpkgs.splice(
						rpkgs.findIndex((a) => a.chunk == detail.origChunk && a.path == detail.origPath),
						1
				  )[0]
				: {
						chunk: detail.origChunk,
						path: detail.origPath
				  }

			if (detail.type == "defineChunk") {
				rpkgs.push({
					...original,
					chunk: detail.newChunk
				})
			} else if (detail.type == "definePath") {
				rpkgs.push({
					...original,
					path: detail.newPath
				})
			}

			alterModManifest(manifest.id, {
				runtimePackages: rpkgs
			})
			dummyForceUpdate = Math.random()

			manifest.runtimePackages = manifest.runtimePackages
		}}
		on:runtimePackage-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)

			x.runtimePackages?.splice(
				x.runtimePackages.findIndex((a) => a.chunk == detail.chunk && a.path == detail.path),
				1
			)

			if (isEqual(x["runtimePackages"], [])) {
				delete x["runtimePackages"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.runtimePackages = manifest.runtimePackages
		}}
		on:dependency-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["dependencies"])
				alterModManifest(manifest.id, {
					dependencies: []
				})

			const deps = (getManifestFromModID(manifest.id).dependencies || []).map((a) => {
				return typeof a == "string" ? { runtimeID: a, toChunk: 0 } : a
			})

			const original = deps.some((a) => a.toChunk == detail.origToChunk && a.runtimeID == detail.origRuntimeID)
				? deps.splice(
						deps.findIndex((a) => a.toChunk == detail.origToChunk && a.runtimeID == detail.origRuntimeID),
						1
				  )[0]
				: {
						toChunk: detail.origToChunk,
						runtimeID: detail.origRuntimeID
				  }

			if (detail.type == "defineToChunk") {
				deps.push({
					...original,
					toChunk: detail.newToChunk
				})
			} else if (detail.type == "defineRuntimeID") {
				deps.push({
					...original,
					runtimeID: detail.newRuntimeID
				})
			}

			alterModManifest(manifest.id, {
				dependencies: deps.map((a) => {
					return a.toChunk == 0 ? a.runtimeID : { runtimeID: a.runtimeID, toChunk: a.toChunk }
				})
			})
			dummyForceUpdate = Math.random()

			manifest.dependencies = manifest.dependencies
		}}
		on:dependency-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)

			x.dependencies?.splice(
				x.dependencies
					.map((a) => {
						return typeof a == "string" ? { runtimeID: a, toChunk: 0 } : a
					})
					.findIndex((a) => a.toChunk == detail.toChunk && a.runtimeID == detail.runtimeID),
				1
			)

			if (isEqual(x["dependencies"], [])) {
				delete x["dependencies"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.dependencies = manifest.dependencies
		}}
		on:thumbs-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["thumbs"])
				alterModManifest(manifest.id, {
					thumbs: []
				})

			const thumbs = getManifestFromModID(manifest.id).thumbs || []

			if (thumbs.some((a) => a == detail.original)) {
				thumbs.splice(
					thumbs.findIndex((a) => a == detail.original),
					1
				)
			}

			thumbs.push(detail.new)

			alterModManifest(manifest.id, {
				thumbs
			})
			dummyForceUpdate = Math.random()

			manifest.thumbs = manifest.thumbs
		}}
		on:thumbs-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)

			x.thumbs?.splice(
				x.thumbs.findIndex((a) => a == detail.value),
				1
			)

			if (isEqual(x["thumbs"], [])) {
				delete x["thumbs"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.thumbs = manifest.thumbs
		}}
		on:supportedPlatforms-alter={({ detail }) => {
			if (detail.value) {
				if (!getManifestFromModID(manifest.id)["supportedPlatforms"])
					alterModManifest(manifest.id, {
						supportedPlatforms: []
					})

				const supportedPlatforms = getManifestFromModID(manifest.id).supportedPlatforms || []

				if (supportedPlatforms.some((a) => a == detail.platform)) {
					supportedPlatforms.splice(
						supportedPlatforms.findIndex((a) => a == detail.platform),
						1
					)
				}

				supportedPlatforms.push(detail.platform)

				alterModManifest(manifest.id, {
					supportedPlatforms
				})
			} else {
				const x = getManifestFromModID(manifest.id)

				x.supportedPlatforms = x.supportedPlatforms || Object.keys(Platform).filter((a) => typeof a == "string")

				x.supportedPlatforms?.splice(
					x.supportedPlatforms.findIndex((a) => a == detail.platform),
					1
				)

				if (isEqual(x["supportedPlatforms"], [])) {
					delete x["supportedPlatforms"]
				}

				setModManifest(manifest.id, x)
			}

			const x = getManifestFromModID(manifest.id)

			if (
				Object.keys(Platform)
					.filter((a) => typeof a == "string")
					.every((a) => x["supportedPlatforms"]?.includes(a))
			) {
				delete x["supportedPlatforms"]
				setModManifest(manifest.id, x)
			}

			dummyForceUpdate = Math.random()

			manifest.supportedPlatforms = manifest.supportedPlatforms
		}}
		on:requirements-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["requirements"])
				alterModManifest(manifest.id, {
					requirements: []
				})

			const requirements = getManifestFromModID(manifest.id).requirements || []

			if (requirements.some((a) => a == detail.original)) {
				requirements.splice(
					requirements.findIndex((a) => a == detail.original),
					1
				)
			}

			requirements.push(detail.new)

			alterModManifest(manifest.id, {
				requirements
			})
			dummyForceUpdate = Math.random()

			manifest.requirements = manifest.requirements
		}}
		on:requirements-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)

			x.requirements?.splice(
				x.requirements.findIndex((a) => a == detail.value),
				1
			)

			if (isEqual(x["requirements"], [])) {
				delete x["requirements"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.requirements = manifest.requirements
		}}
		on:loadBefore-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["loadBefore"])
				alterModManifest(manifest.id, {
					loadBefore: []
				})

			const loadBefore = getManifestFromModID(manifest.id).loadBefore || []

			if (loadBefore.some((a) => a == detail.original)) {
				loadBefore.splice(
					loadBefore.findIndex((a) => a == detail.original),
					1
				)
			}

			loadBefore.push(detail.new)

			alterModManifest(manifest.id, {
				loadBefore
			})
			dummyForceUpdate = Math.random()

			manifest.loadBefore = manifest.loadBefore
		}}
		on:loadBefore-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)

			x.loadBefore?.splice(
				x.loadBefore.findIndex((a) => a == detail.value),
				1
			)

			if (isEqual(x["loadBefore"], [])) {
				delete x["loadBefore"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.loadBefore = manifest.loadBefore
		}}
		on:loadAfter-define={({ detail }) => {
			if (!getManifestFromModID(manifest.id)["loadAfter"])
				alterModManifest(manifest.id, {
					loadAfter: []
				})

			const loadAfter = getManifestFromModID(manifest.id).loadAfter || []

			if (loadAfter.some((a) => a == detail.original)) {
				loadAfter.splice(
					loadAfter.findIndex((a) => a == detail.original),
					1
				)
			}

			loadAfter.push(detail.new)

			alterModManifest(manifest.id, {
				loadAfter
			})
			dummyForceUpdate = Math.random()

			manifest.loadAfter = manifest.loadAfter
		}}
		on:loadAfter-undefine={({ detail }) => {
			const x = getManifestFromModID(manifest.id)

			x.loadAfter?.splice(
				x.loadAfter.findIndex((a) => a == detail.value),
				1
			)

			if (isEqual(x["loadAfter"], [])) {
				delete x["loadAfter"]
			}

			setModManifest(manifest.id, x)
			dummyForceUpdate = Math.random()

			manifest.loadAfter = manifest.loadAfter
		}}
	/>
</div>

<div class="mb-[100vh]" />
