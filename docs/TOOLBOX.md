# Toolbox

**Build the model you imagine. Grow the tools that make it possible.**

This is a **map of capabilities and compositions**, not a complete API reference. The current source and its types define actual signatures and supported inputs. Before inventing a new operation, search the toolbox **and** existing model components.

Start with `src/toolbox/geometry/kernel/index.ts` for much of the shared geometry API, then follow the actual implementation. Other capabilities live under `construction/`, `shapes/`, `spatial/`, `texturing/` and `units/`; they are not all exported from the same barrel.

## Find the capability by problem

| Problem | Existing capabilities to inspect |
| --- | --- |
| Build solid, curved or hollow surfaces | `extrudeContour`, `loftSectionWalls`, `sweepSection`, `revolveProfile` |
| Construct matching sampled pieces | `sampleProfile`, `partitionContour`, `samplePartition`, `correspondContours` |
| Finish or join authored boundaries | `capSectionEnd`, `capBoundary`, `bridgeBoundaries`, `joinGeometry` |
| Create shaped patches, openings or pockets | `fillSurfacePatch`, `openPatch`, `recessPatch`, `shapeSurfaceRelief` |
| Cut or modify larger geometry | `cutThrough`, `booleanSolids`, `splitByPlane`, `clipContour` |
| Refine edges and restore valid quads | `subdivideEdges`, `bevelEdges`, `reconstructPatchQuads` |
| Find physical contacts and clearances | `raycastSurface`, `findFacingPatch`, `fitBetweenSurfaces`, `fitBoundary`, `surfaceClearance`, `verifyExteriorPlacement` |
| Build vessels and variable contents | `cavitySectionsFromSurfaces`, `ProfiledCavity`, `createFillableVolume` |
| Preserve authored materials and UVs | `classifyAuthoredFaces`, `projectAuthoredUvs`, `surfaceMesh`, `offsetMeshUvs` |
| Attach pieces and add controlled variation | Spatial frames, `attachAtFrames`, `coherentVariation`, seeded layout utilities |
| Create reusable textures | `tileableNoise`, `flowedGrainField`, `bakePbrMaps` and material recipes |

These names are examples, not the whole toolbox. Look at the relevant directories, including related helpers and tests, before assuming a missing capability.

## Concrete combinations

### A shaped wooden panel with a pocket

Use `fillSurfacePatch()` for a surface with an authored outline, then apply `shapeSurfaceRelief()` or `recessPatch()` where their patch/chart domains permit it. Finish or attach surrounding geometry using **matching boundary stations**, not independently sampled almost-identical outlines.

A relief, a recessed pocket and a solid cut are different operations. Select one because it matches the desired topology, not because its name sounds close.

### A constructed curved vessel

`samplePolarStripSections()` can define radial strips; `loftSectionWalls()` creates their walls; `capSectionEnd()` or `joinGeometry()` closes/joins appropriate authored boundaries. Keep stave gaps, head shape and hardware as decisions of the model.

For an actual example, inspect `src/models/beerMug.ts` and the related coopered-vessel components in `src/models/components/`. `cavitySectionsFromSurfaces()` derives cross sections from the **actual authored inner walls**. `new ProfiledCavity(rings).between(bottom, top)` defines a physical volume; `createFillableVolume()` provides the geometry and runtime morph controls for contents.

Fill level is a **fraction of serving volume**, not a fraction of height. The mug deliberately maps a full serving to less than the vessel's physical brim capacity. Its GLB carries morph targets and weights; it does not carry the TypeScript fill controller.

### A timber frame fitted to neighboring parts

Use spatial frames to define the desired axes and placement, then `fitBetweenSurfaces()`, `fitBoundary()` or other surface queries to obtain real contact geometry. Build the members with an appropriate section-based operation and retain the intended interfaces for later work.

Inspect `src/models/table.ts` and `src/models/components/tableTimberGeometry.ts` for a real model composition. Not every object-specific helper used there should become a toolbox primitive.

### A doorway with a genuine opening

Start with a suitable solid construction. Use `cutThrough()` for a supported through-bore between appropriate surfaces, or `booleanSolids()` when the intended result is a general solid subtraction. Booleans may generate genuine triangles. Only call `reconstructPatchQuads()` on compatible regions that actually permit quad recovery.

## Keeping geometry and appearance honest

- Preserve real quads, triangles, face labels, UVs, seams and boundaries. **Don't repair geometric defects with shader tricks.**
- `GeometryResult` selections belong to a particular owned result. Read the edit's returned selections rather than carrying stale ones forward.
- UV dimensions are physical, in meters. Timber grain direction, cut ends, repetition and cached material behavior matter; consult `src/materials/README.md` and the source when changing material construction.
- The `src/core/` viewer and export pipeline consume geometry; they should not secretly redefine it.
- A working render does not prove a solid is manifold or an export retains every intended runtime feature.

## How to extend

Look for the closest operation, inspect its **actual supported domain**, and see how existing models combine it. Extend shared functionality when the capability is useful beyond the particular object. Keep choices such as board counts, silhouette, imperfections, hinges, rivets and proportions in model code.

If a new operation has a distinct costly failure mode, consider a focused test under [TESTING.md](TESTING.md). Do not create model-by-model tests or documentation inventories by default.

For the non-negotiable system boundaries, see [ARCHITECTURE.md](ARCHITECTURE.md).
