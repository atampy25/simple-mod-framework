# Patches

Patches in this folder are applied via resolutions by Yarn.

Here is the reasoning behind each patch:

- `piscina`: Work around a bug with pkg (implicitly name `patchWorker.js` as the worker), and regenerate source maps/output for that change.
