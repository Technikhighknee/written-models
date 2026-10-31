# Material System

Materials are authored in TypeScript. The village well uses painted stone
pigment and subtle roughness/normal detail; its individual blocks, worn edges,
masonry joints and projecting coping are real geometry.

- `paint.ts`: authored paths, raster painting, masks and aligned PBR atlases.
- `pigmentFields.ts`: repeatable, tileable pigment variation.
- `brushwork.ts`: reusable painting operations.
- `weatheredWell.ts`: understated limestone and mortar appearance without
  painted brick outlines or fake stone-course geometry.

The masonry geometry is authored in `../models/well.ts`. A recessed mortar
ring fills the gaps between its blocks. Water is a separate, solid-blue
`WellWater` material for replacement with a Godot water shader.

Judge appearance in the viewer and in Godot, not by whether a build passes.
