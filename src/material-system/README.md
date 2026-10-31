# Material System

The material system is a painting toolkit, not a collection of mesh generators.
Geometry still defines silhouettes and real openings. Materials paint what the
viewer perceives on those surfaces.

- `paint.ts`: authored paths and marks, masked layers, direct pixel-level
  composition, aligned color/roughness/normal-map atlases.
- `pigmentFields.ts`: repeatable, seamless, multi-scale pigment variation.
  These fields are supporting brushes, not finished textures.
- `weatheredWell.ts`: the first material built primarily by layered
  raster painting. Each stone has its own irregular proportions, large stains,
  mineral variation, worn edges, crevices and localized dampness. Stone courses
  match across the outer wall and coping. The water is also painted.
- `recipes.ts`: separate painted material recipes for wooden containers
  and wicker. Those are still earlier drafts awaiting visual refinement.

`../models/components/paintedForms.ts` connects these panels to deliberately
simple authored meshes with explicit UVs and a GLB-compatible PBR material.
The new well is one mesh and one material, including its water.

Do not confuse a passing build with a successful material. Judge results in
the actual viewer at gameplay scale, compare them with the reference,
and revise the art direction instead of automatically adding more noise.
