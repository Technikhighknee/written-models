# Read This First

This is the working entry point for AI coding agents, especially ChatGPT using the GitHub connector. Read it before changing Written Models. It is an instruction to **inspect the repository**, not a substitute for doing so.

## What this project is

Written Models is a personal, deliberately authored 3D modeling system. Models are composed in TypeScript; reusable geometric capabilities belong in the toolbox. One world unit is one meter. Authored geometry, physical contacts, controllable topology, UVs, materials, Quad View and GLB/Godot output all matter.

The repository being publicly readable does **not** make it open source or a library intended for other people. Don't make product or architecture decisions for hypothetical external consumers.

## Where to start

- **Before geometry or structural work:** read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- **Before adding a construction capability or model:** read [docs/TOOLBOX.md](docs/TOOLBOX.md), then inspect the relevant source and existing model compositions.
- **Before adding, changing or deleting tests:** read [docs/TESTING.md](docs/TESTING.md).
- **For the actual available models:** inspect `src/models/index.ts` and the relevant files in `src/models/`.
- **For the actual geometry API:** inspect `src/toolbox/geometry/kernel/index.ts` and the relevant implementation. Do not assume this barrel exports every toolbox utility.
- **For materials, viewer and export behavior:** inspect `src/materials/`, `src/toolbox/texturing/` and `src/core/` as needed.

These are entry points, not a mandatory tour through every file. Read what the task requires.

## How to work here

1. **Look before inventing.** Search for an existing operation or a useful composition before creating another helper. Reuse and extend generic geometry, not object-specific recipes in the toolbox.
2. **Respect the authored mesh.** Quads are real authored quads, triangles are real triangles, and boundaries, face regions, UVs and selections have meaning. Don't hide defects with renderer-only tricks.
3. **Put decisions in the right place.** General operations and queries go in the toolbox; an object's construction and artistic choices stay in its model; appearance recipes stay in materials.
4. **Use the implementation as the source of truth.** These documents explain intent and navigation, not a complete or infallible API. Verify signatures, failure domains and current behavior in the code.
5. **Fix the underlying failure.** Don't broaden a geometric operation's promise beyond what it actually supports. Reject invalid topology clearly rather than quietly making plausible-looking garbage.
6. **Keep tests economical.** New features and new models do not automatically need new tests. Protect distinct costly regressions according to `docs/TESTING.md`.
7. **Write documentation about the present.** No development diary disguised as JSDoc, no obsolete migration plans, no long lists of functions that simply duplicate code.
8. **Honor the request.** Implement when asked to implement; inspect without gratuitous edits when asked to inspect. A review that finds nothing worth changing is a valid result.
