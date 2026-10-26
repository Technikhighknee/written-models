# Shared material library

Models import **materials**, never draw their own texture maps.

- `oak()` is the canonical oak finish. `oakVariant(seed)` gives several
  deterministic *cuts of that same species*: shared palette, roughness and
  physical scale, different ring flow, pores and sparse knot positions.
  Material sets and their Canvas PBR maps are cached by seed and reused across
  models. We deliberately reuse a small pool rather than creating a texture
  for every timber.
- A material **recipe** describes color, roughness and physical surface height
  together. `bakePbrMaps()` creates aligned Base Color, Roughness and
  tangent-space Normal maps from the same samples. Base Color is sRGB;
  the data maps have no color space. Metalness remains a material property
  unless we later need a metalness map.
- Mesh UVs are measured in **meters**, not arbitrary 0–1 coordinates.
  The map repeat factor is derived from the physical tile size.
  Longitudinal wood uses **V along the board's length**, U across its width.
  Generated loft meshes already follow this convention. BoxGeometry beams
  use `boxUVsInMeters()`. ExtrudeGeometry retains its shape-space UVs.
- End grain is a different surface, not a rotated copy of longitudinal grain.
  `createTimberBetween()` assigns it only to a beam's two actual cut ends,
  regardless of spatial orientation. `assignExtrudedTimberSurfaces()` also
  distinguishes a cut edge from a long edge on clipped plank extrusions.
  The end-grain recipe uses subdued ring arcs instead of a centered target.
- Different wood finishes reuse the same textures and differ by material tint.
  Do not mutate their shared texture transforms per model.
- For **subtle per-piece tones**, use `coherentVariation()` to produce a
  neighborhood-correlated distribution (circular for barrels, linear for
  plank arrangements). Put a constant RGB tint into the mesh's vertex-color
  attribute with `tintVertices()`, then use `oakVariant(seed).tinted.face` and
  `oakVariant(seed).tinted.endGrain`. Each seed reuses its cached PBR maps
  and the materials support vertexColors;
  GLB export keeps the tint without creating one material per board.
- All textures are ordinary CanvasTextures attached to MeshStandardMaterials,
  compatible with the existing GLTFExporter / binary GLB workflow.
- SVG can join the recipe toolbox when we need deliberately drawn vector marks
  and masks. There is no unused SVG abstraction yet.

The material library is **not** responsible for mesh shape, topology,
UV unwrapping or installing materials on meshes. Those stay in the geometry
toolbox and the individual models.

## Authored surface vocabulary

The texture toolbox supplies general-purpose **tileable seeded noise**, `fractalNoise`,
`ellipseMask`, `smoothstep`, `wrappedDelta`, and hand-authored color `palette`
stops. These building blocks do not know what oak, iron, or leather means.

The oak recipe lives in `wood/oakSurface.ts`. It describes coarse grain flow,
ring-porous vessels, shaped annual-ring bands, knots, wood rays, and a separate
end-grain cut. One sample determines the color, roughness, and physical relief
at the same UV position. It is deterministic and periodic in both axes.

`wood/oak.ts` handles only material construction, dimensions and caching;
`oak()` preserves the default cut, while `oakVariant(seed)` selects additional
cached cuts. Models do not need to know how an oak surface is composed. For a different wood species, write a distinct
surface recipe and reuse the same toolbox functions.

The authored recipe is a visual design, not a claim to photogrammetric accuracy.
Inspect the generated color map together with its normal and roughness maps,
and always check seams and UV scale on a real model before shipping assets.

## Controlling repetition

Use a small, deterministic set of `oakVariant(seed)` materials for individual
wood pieces. Vary physical-UV windows **on the geometry**, never by mutating
shared texture transforms: `offsetMeshUvs()` handles control meshes and
`createTimberBetween(..., uvOffset)` handles beams. The grain scale and
fiber direction must remain plausible. More random colors are not the solution.

When evaluating surface variation, inspect repeated rows of planks and the
24-stave barrel, not just a single attractive texture swatch. In the browser
GLB export carries the baked texture maps and material assignments.
