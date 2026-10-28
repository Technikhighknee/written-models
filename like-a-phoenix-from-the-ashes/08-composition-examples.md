# 08 — Geometry in Use

These are concrete constructions the target API must support.
The function vocabulary matches [09](09-api-contracts.md).
The code shows the intended composition, with model-supplied
parameters, contours and material choices.

Each example demonstrates the same operations applied to
geometrically different problems.

## 1. Loft a plank and a dagger grip

Both are built from 3D sections placed along a chosen axis.

```ts
// Model-authored Section3[] with matching contour stations.
const plank = loftSections(plankStations, { ends: "cap" });
const grip = loftSections(daggerGripStations, { ends: "cap" });

const wornGrip = deformVertices(grip.geometry, gripWearField);
```

The sections come from different models. The plank defines thickness,
edge drift, and its crosscuts; the dagger defines oval/faceted contours,
tapering, and grip shape.

The loft engine deals with contour correspondence, side faces,
caps, UVs, and the actual topology. The deformer changes the
grip's construction vertices while preserving its face identities.

**Proof:** One loft pipeline produces both forms with genuine
control faces. A grip may have many perimeter vertices while
a plank uses just four or a beveled section.

## 2. Sweep a hollow metal pipe and a curved wooden handle

The pipe section is annular: one outer contour and one inner hole.
The handle uses a solid, model-authored `Profile2`.

```ts
const pipe = sweepSection({
  path: pipeCenterline,
  sectionAt: () => annularPipeProfile,
  startingFrame: pipeStartFrame,
  stations: pipeStations,
  ends: "open"
});

const handle = sweepSection({
  path: handleCenterline,
  sectionAt: t => woodenHandleProfileAt(t),
  startingFrame: handleStartFrame,
  stations: handleStations,
  ends: "cap"
});
```

The same path frames and section-loft machinery build both.
The pipe produces inner/outer wall faces and annular rim boundaries.
The handle can vary its profile continuously along the curve.

For a closed path, frames must meet coherently at the seam; the
sampling and orientation machinery establishes that correspondence.

**Proof:** No flipping cross-section frames, no collapsed ring edges,
no invented solid cap across the pipe's hollow center.

## 3. Partition wood and iron

A tabletop and a sheet of metal can be partitioned by the same
geometric cuts. Both call a contour partition operation.

```ts
const woodLayout = partitionContour(tableOutline, tableSeamCuts);
const ironLayout = partitionContour(plateOutline, plateSeamCuts);

const woodenParts = woodLayout.parts.map(profile =>
  extrudeContour(profile, tableExtrusion)
);

const ironParts = ironLayout.parts.map(profile =>
  extrudeContour(profile, plateExtrusion)
);
```

The `tableSeamCuts` and `plateSeamCuts` values are explicit
`PlanarCut2[]` defined by the models, including their desired
shape and spacing.

The partition results carry sampled interfaces. All pieces
adjoining the same interface use the same boundary stations,
including after adaptive refinement.

An opening along a table edge may receive an inset or groove.
A metal plate may receive holes using `cutPatch()`. The
partition operation has no concept of wood or iron.

**Proof:** Every internal interface agrees geometrically, with
intentional assembly clearance where requested.

## 4. Fit a chair rail and a metal brace

A chair and a metal support use different sections and materials.
Their members can still be fitted between real surfaces.

```ts
const railFit = fitBetweenSurfaces({
  start: { target: chairPostA, near: chairJointA },
  end: { target: chairPostB, near: chairJointB },
  section: railProfile,
  startingFrame: chairFrame
});

const rail = loftSections(railFit.sections);

const braceFit = fitBetweenSurfaces({
  start: { target: metalSupportA, near: bracketJointA },
  end: { target: metalSupportB, near: bracketJointB },
  section: braceProfile,
  startingFrame: braceFrame
});

const brace = loftSections(braceFit.sections);
```

The `railProfile` and `braceProfile` are `Profile2` values.
They could be rectangular, polygonal, asymmetrical, or hollow.

For a planar contact the fitting algorithm intersects every
section vertex with the chosen support plane and checks that
the point is within the actual support patch.

**Proof:** Ends are genuinely cut across their full sections,
including under slanted supports. Selecting an unsuitable support
face cannot silently fit against its infinite plane extension.

## 5. Fit a swept handle to a curved mug

The handle is constructed as in example 2. Its two end loops
are selected from the operation result.

```ts
const startLoop = handle.boundaries.start[0]!;
const fittedStart = fitBoundary(
  handle,
  startLoop,
  mugSurface,
  startFitOptions
);

const endLoop = fittedStart.boundaries.end[0]!;
const fittedHandle = fitBoundary(
  fittedStart,
  endLoop,
  mugSurface,
  endFitOptions
);
```

`mugSurface` is a `SurfaceTarget` containing authored geometry
and its transform. The fitting options specify ray/closest-point
policy, travel distance, desired embed/clearance and falloff.

The two fits move construction vertices on selected boundary
loops, return updated selections, and leave the caller free to
keep the handle as a separate physical part.

**Proof:** The handle ends contact the actual curved body,
with no invented plane and no scene-parenting dependence.

## 6. Build a barrel from shared geometric work

The barrel body needs a radial layout and longitudinal sections.
The wooden staves are neighboring profile-defined pieces.
The model chooses count, bulge, thickness, wear and hoop locations.

```ts
const staveSections = barrelStaveProfiles.map(profile =>
  loftSections(profile.sections, { ends: "cap" })
);

const headLayout = partitionContour(headOutline, headSeamCuts);
const headPieces = headLayout.parts.map(profile =>
  extrudeContour(profile, headExtrusion)
);

const hoop = sweepSection({
  path: hoopCenterline,
  sectionAt: () => hoopProfile,
  startingFrame: hoopStartFrame,
  stations: hoopStations,
  ends: "open"
});
```

`barrelStaveProfiles` is model-level data derived from common
radial boundary curves and sampled station values. The same
geometric curves determine adjacent stave edges.

The head's partitions come from the same planar tool as the
tabletop. The hoop uses the same sweep family as the metal pipe.

**Proof:** Real stave side faces, coherent head seams and a hoop
following the barrel's chosen profile.

## 7. A recess in a board and a slot in metal

A geometrically selected planar patch receives a contour-based cut.

```ts
const recessedWood = cutPatch(
  board,
  boardTopPatch,
  mortiseOutline,
  mortiseOptions
);

const slottedIron = cutPatch(
  ironPlate,
  ironTopPatch,
  slotOutline,
  slotOptions
);
```

Both create boundary loops, wall faces and optional floors.
The cuts reuse the same local plane chart and face construction.
Models choose depth, orientation and material assignments.

A later curved-patch operation uses explicit surface parameterization.
A general closed-solid boolean is a separate operation, with
triangulated topology when that is what the kernel creates.

**Proof:** The openings have real rim/wall topology, and their
authored UVs and surface-region mapping remain usable.

## 8. Toward organic and riggable geometry

An arm, wrist and hand need intentional section profiles,
surface patches, different local detail levels, and geometry
that accepts future skinning weights.

A series of connected 3D sections builds the limb shape.
Changing section fields and deformation shape the transitions.
Boundary bridging handles deliberately mismatched resolution.
Surface editing and locally authored patches create detailed
regions of the hand.

Rigging adds skeletons, skin weights and animation on top of
the authored geometry. The current exporter already has a
skinned-mesh path; the geometry system supplies the shape that
future rigging can consume.

**Proof:** The same geometry vocabulary extends beyond wood
and metal. It supports continuous organic surfaces while keeping
actual face structure explicit.

## Cross-category demonstrations

| Shared capability | Models | Visible result |
| --- | --- | --- |
| Section loft | Plank + dagger grip | Changing profiles, correct cap topology |
| Path sweep | Bent pipe + mug handle | Stable section orientation and matching boundaries |
| Partition | Tabletop + barrel head + iron plate | Shared seams and compatible sampling |
| Planar fitting | Chair rail + iron brace | End geometry meets finite target patches |
| Curved fitting | Mug handle + pipe-to-vessel junction | Matched real surface contours |
| Local patch cut | Wood mortise + metal slot | Openings and wall regions |
| Deformation | Worn board + organic limb | Controlled detail and valid topology |
| Rendering | Timber + dagger blade | Material regions and real Quad View faces |
