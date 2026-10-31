# Material System

A painting workspace, separate from the geometry toolbox and the older
procedural material recipes.

`paint.ts` owns **painting operations**: polygons, brush strokes, marks,
aligned PBR channels and atlas assembly. The same authored stroke changes
color, roughness and height; the latter is converted to tangent-space normals
at the panel's physical scale.

`recipes.ts` owns **art direction**. It composes irregular stonework, timber
boards, forged hoops and interwoven reeds from explicit visual structures and
deterministic variation. Detail belongs on the images rather than in the model
mesh. These recipes are works in progress, not universal stone/wood presets.

`../models/components/paintedForms.ts` contains minimal authored 3D shapes
with per-face atlas UVs, still compatible with Quad View and GLB compilation.

The first family is Village Well, Wooden Crate, Painted Barrel, Wooden Bucket
and Wicker Basket. The old geometrically detailed barrel remains available
as a separate model for comparison. Each new model uses one authored mesh;
the well additionally uses a separate water material within that mesh.

Painted atlases are created lazily and cached. Padded panels prevent sampling
into neighbors. The resulting material is an ordinary Three.js
MeshStandardMaterial with aligned canvas-backed color, roughness and normal
textures; no custom runtime shader is required.

A finished texture requires inspection at game-camera scale and in the target
engine. This system enables authored materials; compilation alone cannot
certify visual quality.
