# Shared material library

Models import **materials**, never draw their own texture maps.

- `oak()` is the first shared material family. It caches its Three.js materials
  and Canvas-based PBR textures, so a barrel, table and plank use the same
  rendering assets and visual vocabulary.
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
- Different wood finishes reuse the same textures and differ by material tint.
  Do not mutate their shared texture transforms per model.
- For **subtle per-piece tones**, use `coherentVariation()` to produce a
  neighborhood-correlated distribution (circular for barrels, linear for
  plank arrangements). Put a constant RGB tint into the mesh's vertex-color
  attribute with `tintVertices()`, then use `oak().tinted.face` and
  `oak().tinted.endGrain`. These share all PBR maps and use vertexColors;
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

`wood/oak.ts` handles only material construction, dimensions and caching; it
continues to expose `oak().face`, `oak().light`, `oak().dark`,
`oak().aged`, and `oak().endGrain`. Existing models do not need to know how
an oak surface is composed. For a different wood species, write a distinct
surface recipe and reuse the same toolbox functions.

The authored recipe is a visual design, not a claim to photogrammetric accuracy.
Inspect the generated color map together with its normal and roughness maps,
and always check seams and UV scale on a real model before shipping assets.
