# Toolbox

**Build the model you imagine. Grow the tools that make it possible.**

This document helps an agent **find and compose existing capabilities** before creating another one. It deliberately is not an exhaustive function list or a copy of TypeScript signatures. The code defines actual contracts.

Start with `src/toolbox/geometry/kernel/index.ts` for the shared geometry-operation exports. Inspect the implementation, nearby helpers and model compositions before assuming an operation is missing. Constructors, shapes, spatial tools, textures and units also live outside that index.

## Find the right starting point

| Need | Look at |
| --- | --- |
| Construct a box, cylinder or authored board | `construction/boxMesh.ts`, `cylinderMesh.ts`, `build/loftPairedSurfaceRows.ts` |
| Extrude, loft, sweep or revolve | `build/extrudeContour.ts`, `loftSectionWalls.ts`, `sweepSection.ts`, `revolveProfile.ts` |
| Make profiles agree across adjoining pieces | `sampleAdaptiveStations`, `sampleProfile`, `partitionContour`, `samplePartition`, `correspondContours` |
| Close, bridge or weld boundaries | `capBoundary`, `capSectionEnd`, `bridgeBoundaries`, `joinGeometry` |
| Create charted surfaces and local detail | `fillSurfacePatch`, `shapeSurfaceRelief`, `openPatch`, `recessPatch` |
| Make holes, solid cuts or 2D profile clips | `cutThrough`, `booleanSolids`, `splitByPlane`, `clipContour` |
| Refine edges or recover real quads | `subdivideEdges`, `bevelEdges`, `reconstructPatchQuads` |
| Find physical support or clearance | `raycastSurface`, `findFacingPatch`, `fitBetweenSurfaces`, `fitBoundary`, `surfaceClearance`, `verifyExteriorPlacement` |
| Extract a cavity and model its contents | `cavitySectionsFromSurfaces`, `ProfiledCavity`, `createFillableVolume` |
| Edit UVs and assign materials to authored faces | `projectAuthoredUvs`, `offsetMeshUvs`, `classifyAuthoredFaces`, `surfaceMesh` |
| Attach, distribute and vary parts | `spatial/frames/`, `attachAtFrames`, `weightedCuts`, `seededVariation`, `coherentVariation` |
| Build procedural material maps | `texturing/fields.ts`, `tileableNoise`, `flowedGrainField`, `bakePbrMaps` |

These are **entry points**, not all available operations. Explore `src/toolbox/` and `src/models/components/` when the immediate match is imperfect.

## Real compositions worth reading

### A finished plank: `src/models/plank.ts`

`buildPlankGeometry()` constructs section walls using `loftSectionWalls()`, closes their actual end boundaries with `capBoundary()`, and returns a `GeometryResult`. Rendering and wood-material choices are applied afterward with `surfaceMesh()`.

This is the simple pattern for **construction → owned result → materialized mesh**. It is not a reason to add a special `plankMesh()` operation to the kernel.

### Hand-worked boards: `src/models/components/boardedSurface.ts`

The board recipe generates individual cross-sections, samples each with `sampleAdaptiveStations()`, combines station positions **before** authoring neighboring strips, and then uses `loftPairedSurfaceRows()` to obtain an owned `GeometryResult`.

`loftPairedSurfaceRows()` already returns an owned `GeometryResult`. Its shared wall loft and boundary bridge preserve the authored longitudinal seam stations. Wear and variation remain model decisions; shared stations protect real seams rather than only their appearance.

### A curved vessel and fillable contents: `src/models/beerMug.ts`

`cooperedStaves()` composes `samplePolarStripSections()` with `loftPairedSurfaceRows()` and owned results. The tankard model assembles staves, fitted handle, bottom and metal bands; it does not require a dedicated *tankard* operation in the toolbox.

`buildTankardServingCavity()` then passes **the actual inner stave faces** to `cavitySectionsFromSurfaces()`. `ProfiledCavity` converts those rings into a measurable volume and `createFillableVolume()` creates the movable contents.

**Fill level is a volume fraction, not a height fraction.** The tankard sets its full serving to **90% of the chosen physical cavity's capacity**, deliberately leaving headroom. `createFillableVolume()` maintains one mesh whose full contents form the neutral base and whose eight morph targets are named `Fill_0_of_8` through `Fill_7_of_8` (Godot blend shapes). It exposes `setFillLevel(0..1)` and `getFillLevel()` in TypeScript. GLB preserves morph shapes and their current weights, not that controller. Upright filling is supported; sloshing, pouring and tilted liquid surfaces are not.

### A timber member fitted to real supports: `src/models/components/tableTimberGeometry.ts`

`tableTimberBetweenSurfaces()` uses `fitBetweenSurfaces()` to find contact-fitted sections, `loftSectionWalls()` to construct them and `capBoundary()` to close their actual ends. The model owns member dimensions and surface placement; the toolbox owns fitting and loft construction.

The fitting operation checks finite contact geometry, not just whether the member centerline hits an infinite plane.

### A real opening rather than a visual trick

Use `openPatch()` or `recessPatch()` only on supported selected charted surfaces; they do **different** things. `cutThrough()` joins suitable opposing patches with actual walls. `booleanSolids()` is the path for general **closed-solid** subtraction, union and intersection.

For real combinations, inspect `tests/geometry/integration/edit-compositions.test.mjs`. They show what the supported operations can preserve together. `reconstructPatchQuads()` is optional reconstruction of compatible topology, not a way to rename every Boolean triangle a quad.

## Other constructions to compose

**A timber-framed gate:** Partition adjoining board outlines with `partitionContour()` and `samplePartition()` so pieces agree at the same stations. Construct the members with `loftSectionWalls()`, fit diagonal braces against finite supports using `fitBetweenSurfaces()`, and apply `bevelEdges()` where its edge and topology constraints hold. The gate's layout and wear belong to the model.

**A carved stone doorway:** Start from an authored `extrudeContour()` solid. For a straight passage between suitable opposing planar patches, use `cutThrough()`; for general closed-solid subtraction, use `booleanSolids()`. The resulting faces may genuinely be triangles. `reconstructPatchQuads()` can recover only compatible pairs, not magically turn every Boolean into quads.

**A carved wooden panel:** `fillSurfacePatch()` can establish a charted crown while respecting a prescribed outer boundary. `shapeSurfaceRelief()` adds supported grooves; `recessPatch()` adds a recessed floor and walls. Design adjacent panel pieces with matching boundary stations before building them, rather than relying on render-time overlap.

These are composition directions, not presets or guarantees for arbitrary contours. Check each operation's actual input domain.

## Practical boundaries

- Constructors may return either `MeshData` or a `GeometryResult`. **Wrap raw authored geometry** with `geometryResult()` before owned edits or `surfaceMesh()`. There is no second raw-`MeshData` rendering mode.
- `SurfaceTarget`-based geometric queries deliberately consume `result.geometry` plus an explicit `localToWorld`; that is the intended authored-face query interface.
- `AuthoredMeshBuilder` requires an explicit `weld: "position" | "none"` choice. Matching coordinates alone do not establish a shared interface.
- Patches need valid owned selections and charts; an edit may return new handles or drop charts that no longer describe the surface.
- Plane splitting, 2D clipping, through-cuts, solid Booleans and surface relief have different domains. Inspect their preconditions rather than swapping them by name.
- Meter-based construction coordinates do not guarantee physically scaled UVs in every existing helper. Inspect the projection and `src/materials/` when appearance matters.
- Quad View inspects authored faces. The GPU receives triangulated buffers; runtime export may batch/atlas static meshes, so verify the actual target-engine result where appropriate.

## Before adding another capability

Search the nearest existing implementation and the model recipes that compose it. Identify the **missing general geometric operation**, if there really is one. Keep proportions, hardware, wear, decorative choices and other object-specific decisions in the model.

Test costly shared failure modes when warranted by [TESTING.md](TESTING.md), not every new object. System-level ownership, topology and export contracts are in [ARCHITECTURE.md](ARCHITECTURE.md).
