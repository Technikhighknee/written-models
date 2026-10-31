# Material System

Materials here are authored in TypeScript. The village well uses a painted
color, roughness and normal atlas for its stonework; geometry defines the
shape and edges.

- `paint.ts`: authored paths and marks, masked painting, raster composition
  and aligned PBR texture atlases.
- `pigmentFields.ts`: repeatable multi-scale pigment variation.
- `brushwork.ts`: reusable painted marks and washes.
- `weatheredWell.ts`: the well's limestone, with per-stone wear, stains,
  mineral variation and joints aligned between its wall and coping.

The geometry lives in `../models/well.ts`. Its water is a separate,
solid-blue `WellWater` material so Godot can replace it with a water shader.
It is **not** part of the painted stone atlas.

Judge material quality in the viewer and in Godot, not by whether a build
passes.
