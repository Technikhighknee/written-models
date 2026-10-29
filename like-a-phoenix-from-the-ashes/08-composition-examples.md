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
  closedPath: false,
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
A metal plate can receive surface openings using `openPatch()` or
through-holes using `cutThrough()`. The
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
  referenceDirection: chairUp
});

const rail = loftSections(railFit.sections);

const braceFit = fitBetweenSurfaces({
  start: { target: metalSupportA, near: bracketJointA },
  end: { target: metalSupportB, near: bracketJointB },
  section: braceProfile,
  referenceDirection: bracketUp
});

const brace = loftSections(braceFit.sections);
```

The `railProfile` and `braceProfile` are `Profile2` values:
rectangular, polygonal, asymmetric or hollow. The reference
direction fixes roll around the member axis; the fitted sections
are returned in world coordinates. The model can transform
the completed member into its parent-local space.

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
  closedPath: true
});
```

`barrelStaveProfiles` is model-level data derived from common
radial boundary curves and sampled station values. The same
geometric curves determine adjacent stave edges.

The head's partitions come from the same planar tool as the
tabletop. The hoop uses the same sweep family as the metal pipe,
with a periodic path whose last frame and geometry meet the first.

**Proof:** Real stave side faces, coherent head seams and a hoop
following the barrel's chosen profile.

## 7. A recess in a board and a slot in metal

A geometrically selected planar patch receives a contour-based cut.

```ts
const recessedWood = recessPatch(
  board,
  boardTopPatch,
  mortiseOutline,
  { depth: mortiseDepth, wallRegion: "mortise-wall", floorRegion: "floor" }
);

const slottedIron = openPatch(
  ironPlate,
  ironTopPatch,
  slotOutline
);
```

The recessed wood receives wall faces, a floor and a selected
rim. Opening the metal patch leaves a boundary on the surface.
A full slot through a solid uses `cutThrough` between compatible
entry/exit patches or an explicit volume difference.

Both operations reuse planar chart, contour intersection and face
construction capabilities. Models control the appearance and
surface material assignments.

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

## 9. Build a chair seat whose housings tilt through thickness

The chair's rear-seat cutouts follow the rake of the back stiles. Each
housing corner has a different position on the top and underside.
The model supplies two ordered contours and corresponding landmarks.

```ts
const match = correspondContours(
  topContour,
  bottomContour,
  housingLandmarks
);

const walls = loftSectionWalls([
  { outer: match.first },
  { outer: match.second }
], { outerRegion: "end-grain" });

const upper = fillSurfacePatch({
  profile: {
    outer: {
      points: match.first.points.map(p => topChart.parameterOf(p)),
      parameters: match.stations
    }
  },
  chart: topChart,
  region: "upper"
});

const underside = fillSurfacePatch({
  profile: {
    outer: {
      points: match.second.points.map(p => bottomChart.parameterOf(p)),
      parameters: match.stations
    }
  },
  chart: bottomChart,
  region: "underside"
});

const seat = joinGeometry([walls, upper, underside], {
  weld: [
    {
      firstPart: 0, first: walls.boundaries["start-outer"][0]!,
      secondPart: 1, second: upper.boundaries.outer[0]!
    },
    {
      firstPart: 0, first: walls.boundaries["end-outer"][0]!,
      secondPart: 2, second: underside.boundaries.outer[0]!
    }
  ]
});
```

Every authored housing corner is a landmark. The two contours
are not replaced by one vertical outline: their actual 3D
positions become the shared stations of the loft and both
patch boundaries. The top and underside charts must reproduce
their respective boundary points exactly. An optional crown
belongs inside a compatible top chart; it must not displace the
already shared wall rim.

**Proof:** Both housings have slanted actual sidewalls, all top
and bottom faces weld into a closed solid, and Quad View follows
the authored faces. The same construction works for a tapered
sheet edge or other nonvertical enclosure.

## 10. Rebuild a barrel head with a detailed outer face

Five planks are partitioned from one circular outline. The
outward face may receive multiple batched grooves and crown
detail, but its underside stays simple and its mating rim fixed.

```ts
const layout = samplePartition(
  partitionContour(diskProfile, weightedSeamCuts)
);

const headBoards = layout.parts.map((sampled, index) => {
  const outerChart = headCrownChart(index);
  const innerChart = headUndersideChart(index);

  const outer = fillSurfacePatch({
    profile: sampled,
    chart: outerChart,
    region: "outer"
  });

  const features = layout.interfaces
    .filter(seam =>
      seam.firstPart === index || seam.secondPart === index
    )
    .map(seam => insetHeadGroove(seam, sampled, outerChart));

  const detailed = features.length
    ? shapeSurfaceRelief(
        outer,
        outer.patches!.outer[0]!,
        features,
        { overlap: "minimum" }
      )
    : outer;

  const inner = fillSurfacePatch({
    profile: sampled,
    chart: innerChart,
    region: "inner"
  });

  const sides = bridgeBoundaries(
    {
      closed: true,
      points: sampled.outer.points.map(uv => outerChart.at(uv))
    },
    {
      closed: true,
      points: sampled.outer.points.map(uv => innerChart.at(uv))
    },
    {
      fromStations: sampled.outer.parameters,
      toStations: sampled.outer.parameters,
      reverseWinding: true,
      region: "end-grain"
    }
  );

  return joinGeometry([detailed, inner, sides], {
    weld: [
      {
        firstPart: 0, first: detailed.boundaries.outer[0]!,
        secondPart: 2, second: sides.boundaries.from[0]!
      },
      {
        firstPart: 1, first: inner.boundaries.outer[0]!,
        secondPart: 2, second: sides.boundaries.to[0]!
      }
    ]
  });
});
```

`headCrownChart`, `headUndersideChart` and
`insetHeadGroove` describe model-authored appearance and
geometry. The groove recipe places its feature path inside
the selected plank, tapers its ends and returns zero
displacement at the protected perimeter. All seams on one
face are passed in a single relief operation.

`samplePartition` provides exact shared interface stations.
The same sampled outline controls the outer patch, sparse
inner patch and sidewalls. Independent new interior triangles
do not create hanging boundary vertices. UVs, semantic face
regions, Quad View topology and per-piece tint survive the
ordinary render/GLB pipeline.

**Proof:** Five closed independent pieces form the circular
head; two batched grooves on a central plank remain visible
without separating the mating surfaces. The GLB preserves
distinct outer, inner, end-grain and groove appearances.

## 11. Extract a drinking cavity from separate staves

A mug body has twelve independent wooden parts. The inner
faces collectively enclose the contents, even though no
single stave defines a closed cavity.

```ts
const rings = cavitySectionsFromSurfaces({
  pieces: staves.map(stave => ({
    geometry: stave.geometry,
    localToWorld: stave.transform,
    regions: ["inner"]
  })),
  sectionFrame: mugSectionFrame, // local XZ/Y frame placed in world
  heights: mugSectionHeights // local Y positions
});

const physicalCavity = new ProfiledCavity(rings).between(
  usableBottom,
  usableTop
);
const servingCavity = physicalCavity.between(
  physicalCavity.bottom,
  physicalCavity.heightAtFill(0.9)
);

const liquid = createFillableVolume(
  servingCavity, aleMaterial, initialFill
);
```

The extractor transforms each supplied wall region into the
mug's explicit section frame, intersects it at each requested
local height, and stitches the segments into one ordered closed
contour. Correspondence across heights retains the actual
stave-internal silhouette. The section frame is also used to
place the resulting liquid assembly.

`ProfiledCavity` retains its volume integration and inverse
height mapping. `createFillableVolume` remains a runtime
morph-target technique: its full neutral mesh, eight named
morph targets and fill controller are retained.

**Proof:** The liquid surface follows the faceted mug interior
and Godot's `fill_level = 1` still represents the calibrated
90%-physical serving.

## Cross-category demonstrations

| Shared capability | Models | Visible result |
| --- | --- | --- |
| Section loft | Plank + dagger grip | Changing profiles, correct cap topology |
| Path sweep | Bent pipe + mug handle | Stable section orientation and matching boundaries |
| Partition | Tabletop + barrel head + iron plate | Shared seams and compatible sampling |
| Planar fitting | Chair rail + iron brace | End geometry meets finite target patches |
| Curved fitting | Mug handle + pipe-to-vessel junction | Matched real surface contours |
| Planar patch editing | Wood mortise + metal slot | A real recess and a correctly open or through-cut surface |
| Deformation | Worn board + organic limb | Controlled detail and valid topology |
| Rendering | Timber + dagger blade | Material regions and real Quad View faces |
| Layer correspondence | Chair rear-seat housings + tapered plate | Different top/bottom outlines produce valid sloped walls |
| Detailed surface patches | Barrel head + crowned tabletop | Face-specific relief without breaking mating surfaces |
| Multi-piece cavity sections | Wooden mug staves + other segmented vessel | One continuous ordered cavity from independent walls |
