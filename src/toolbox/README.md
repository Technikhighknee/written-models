# Toolbox

**Build the model you imagine. Grow the tools that make it possible.**

The toolbox contains reusable, deliberately authored 3D construction capabilities. Models decide *what* to make; the toolbox supplies the geometric means. One world unit is **one meter**.

## What already exists

- **Forms and structures:** `extrudeContour`, `loftSectionWalls`, `sweepSection` and `revolveProfile` build solid, curved or hollow geometry with actual surfaces. `capSectionEnd` and `capBoundary` finish open ends.
- **Shared construction boundaries:** `sampleProfile`, `partitionContour`, `samplePartition`, `correspondContours`, `bridgeBoundaries` and `joinGeometry` construct and connect individually authored pieces without silently inventing vertices at their interfaces.
- **Local surface editing:** `openPatch`, `recessPatch`, `cutThrough` and `shapeSurfaceRelief` create real holes, pockets, straight through-bores and relief on supported charted patches.
- **Solid and edge editing:** `clipContour`, `splitByPlane`, `booleanSolids`, `subdivideEdges` and `bevelEdges` make actual topology changes. `reconstructPatchQuads` can recover *real* quads from compatible triangulated patches.
- **Contact and clearance:** `raycastSurface`, `findFacingPatch`, `fitBetweenSurfaces`, `fitBoundary`, `surfaceClearance` and `verifyExteriorPlacement` help author physical parts against other surfaces.
- **Materials and rendering:** `classifyAuthoredFaces` labels construction faces before `surfaceMesh` compiles them for the viewer, Quad View and GLB export. `projectAuthoredUvs` controls real-world UV mapping. The texturing toolbox produces procedural fields and PBR maps.
- **Placement and variation:** spatial frames, `attachAtFrames`, `coherentVariation` and unit helpers let independently modeled pieces form one assembly.

These are **examples, not a complete API index**. Look in `src/toolbox/` and at the existing model compositions before inventing another operation.

## What combinations make possible

**A timber-framed gate:** use `partitionContour` and `samplePartition` for matching board interfaces, `loftSectionWalls` for each authored piece, `fitBetweenSurfaces` to determine brace contacts, then `bevelEdges` for supported corners. The model decides the board count, imperfections and iron fittings.

**A carved stone doorway:** start with `extrudeContour`, use `cutThrough` for a straight tunnel between compatible opposing planar patches, or `booleanSolids` for a more general solid subtraction. Use `reconstructPatchQuads` only where the resulting triangles genuinely form compatible quads. These are different editing domains, not interchangeable shortcuts.

**A constructed curved vessel:** `samplePolarStripSections` supplies separately sampled radial strips; `loftSectionWalls`, `capSectionEnd` and `joinGeometry` provide the authored geometry. The tankard in `src/models/beerMug.ts` demonstrates another composition: `cavitySectionsFromSurfaces` extracts its actual inner profiles; `ProfiledCavity` evaluates volume, and `createFillableVolume` produces the contents.

**A carved wooden panel:** `fillSurfacePatch` can build a charted crown while retaining the prescribed outer boundary. `shapeSurfaceRelief` adds supported grooves; `recessPatch` adds a floor and walls. The adjacent pieces still need matching physical boundary stations.

These examples describe compositions, not finished presets or promises that every arbitrary input is supported.

## Filling a modeled cavity

`cavitySectionsFromSurfaces` reads ordered inner-wall sections from authored parts. `new ProfiledCavity(rings).between(bottom, top)` defines the serving volume. `createFillableVolume(cavity, material, initialFill)` supplies one persistent mesh with `setFillLevel(0..1)` and `getFillLevel()`. The amount is a **volume fraction**, not a height fraction.

The mug exports eight glTF morph targets / Godot blend shapes, named `Fill_0_of_8` through `Fill_7_of_8`, with the full vessel contents as the base mesh. The export preserves the morphs and current weights, but not the TypeScript controller. Upright filling is supported; sloshing, pouring and tilted fluid surfaces are not implied.

## Rules for building

1. **Look before inventing.** Inspect the relevant toolbox operations and model examples; combine existing capabilities when they fit.
2. **Solve geometry in geometry.** Keep real authored vertices, quads, triangles, UV seams and topology. No viewer tricks to hide broken joins.
3. **Generalize a capability, not a specific object.** An adjustable joint belongs in the toolbox. The character of a medieval table belongs in the table model.
4. **Respect each operation's domain.** Patch charts, face selections, seam correspondence, manifold requirements and precision limits are contracts. Reject unsupported shapes rather than quietly approximating them.
5. **Test invariants worth protecting.** Shared physical boundaries, valid topology, accurate contacts, deterministic outputs and export integrity deserve tests. A model's artistic proportions do not belong in CI.
6. **Document today's behavior.** Comments and JSDoc explain intent and constraints, not the history of how code got there.

Models belong in `src/models/`, appearance in `src/materials/`, reusable operations here. The model drives the capability, and the capability makes the next model possible.
