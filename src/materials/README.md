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
  Do not mutate their shared texture transforms per model. For per-board
  variation, change that board's UV coordinates or explicitly add a new
  material definition.
- All textures are ordinary CanvasTextures attached to MeshStandardMaterials,
  compatible with the existing GLTFExporter / binary GLB workflow.
- SVG can join the recipe toolbox when we need deliberately drawn vector marks
  and masks. There is no unused SVG abstraction yet.

The material library is **not** responsible for mesh shape, topology,
UV unwrapping or installing materials on meshes. Those stay in the geometry
toolbox and the individual models.
