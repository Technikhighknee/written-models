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

The rear-seat cutouts follow the rake of the two back stiles.
Their upper and lower outlines therefore have **different
positions** at the same corner.

```ts
const match = correspondContours(
  bottomContour,
  topContour,
  housingLandmarks
);

// The two resampled contours have corresponding vertex indices.
const walls = loftSections([
  { outer: match.first },
  { outer: match.second }
], { ends: "open" });

const bottom = fillSurfacePatch({
  // The bottom wall contour supplies the actual sampled footprint.
  profile: sampledFootprintFromContour(match.first, bottomSurfaceChart),
  chart: bottomSurfaceChart,
  region: "underside"
});

const top = fillSurfacePatch({
  // The top wall contour supplies its own physical footprint.
  profile: sampledFootprintFromContour(match.second, crownedTopSurfaceChart),
  chart: crownedTopSurfaceChart,
  region: "upper"
});

const seat = joinGeometry([walls, bottom, top], {
  weld: matchingRimPairs
});
```

Here `sampledFootprintFromContour` denotes model-side preparation:
project each already-resampled 3D wall contour into the corresponding
chart, retain its ordered stations, and verify the round trip to 3D.
It is not an additional toolbox API. Reusing `match.stations` with
independently reparameterized `topFootprint` and `bottomFootprint`
would not establish coincident vertices. The two profiles may have
different 2D positions at corresponding stations.

The walls inherit the slanted cheek profiles. The top patch can
carry a crown while the underside remains simpler. Both surface
patches consume exactly the same authored contour stations as their
adjoining walls. Patch refinement adds vertices in the interior.
Joining creates a solid with shared interface vertices.

The same operations can construct a tapered opening in a
metal plate or a sloped building component.

**Proof:** Top and bottom cutout corners retain their distinct
positions, the walls slope accordingly, and the final edge
incidence is valid.

## 10. Rebuild a barrel head with a detailed outer face

The head is partitioned into boards using common cut curves.
Each part has one detailed outward face and a simpler inward face.
The same sampled planar outline controls both faces and the
connecting walls.

```ts
const pieces = partitionContour(diskProfile, weightedSeamCuts);

const headBoards = pieces.parts.map((footprint, index) => {
  const chart = headCrownChart(index); // model-authored shape
  const sampled = sampleProfile(footprint, headSeamStations(index));
  const outer = fillSurfacePatch({
    profile: sampled,
    chart,
    region: "outer"
  });

  // Each seam is a 2D partition interface projected through the
  // authored surface chart, with the exact partition stations.
  const pieceSeams = pieces.interfaces.filter(
    seam => seam.firstPart === index || seam.secondPart === index
  );
  const relief = pieceSeams.map(seam => ({
    path: {
      points: seam.points.map(point => chart.at(point)),
      parameters: seam.stations,
      closed: false
    },
    ...headGrooveProfile(index) // model-authored inward-only boundary relief
  }));
  const detailed = shapeSurfaceRelief(
    outer,
    outer.patches!.surface[0]!,
    relief,
    { overlap: "minimum" }
  );

  const inner = fillSurfacePatch({
    profile: sampled,
    chart: headUndersideChart(index),
    region: "inner"
  });

  const outerRim = detailed.boundaries.rim[0]!;
  const innerRim = inner.boundaries.rim[0]!;
  const sides = bridgeBoundaries(
    boundaryContour(detailed, outerRim),
    boundaryContour(inner, innerRim),
    { fromStations: outlineStations(index), toStations: outlineStations(index) }
  );

  return joinGeometry([detailed, inner, sides], {
    weld: [
      { firstPart: 0, first: outerRim,
        secondPart: 2, second: sides.boundaries.start[0]! },
      { firstPart: 1, first: innerRim,
        secondPart: 2, second: sides.boundaries.end[0]! }
    ]
  });
});
```

`headCrownChart`, `headUndersideChart`, the groove profile
and cut/outline stations are authored by the model. The actual
geometry operations are shared toolbox functions.

Relief on the cut edge has zero displacement at the preserved
joining rim, with its shoulder/groove extending inward into the
outer patch. Otherwise the newly sculpted outer boundary could no
longer weld to the original sidewall. Groove paths that run on an
interface are not permission to displace that interface.

All seams are sampled and resolved together on the original
surface chart. The resulting grooves have real shoulders and
floors, with deterministic overlap. The underside and the
mating surfaces beneath the shallow relief remain intact.

**Proof:** Five independent boards with matching circular
silhouette, no seam opened through the entire head and correct
Quad View topology on both faces.

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
  axis: "y",
  heights: mugSectionHeights
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

The extractor intersects each supplied wall region at each
requested height and stitches the segments into one ordered
closed contour. Correspondence across heights retains the
actual stave-internal silhouette.

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
