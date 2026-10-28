# 08 — Composition Examples

These examples define how the proposed capabilities fit together.
The API names are the target vocabulary used throughout this plan.
The examples describe intended operations rather than code that
already exists.

They deliberately cross object categories. A useful geometric
operation should keep its meaning when we change the model
that calls it.

## 1. Plank, metal tube, and shaped grip

All three begin with cross-sections and a path or station sequence.

### Wooden plank

```ts
const sections = stations.map(t => rectangularSection({
  width: widthAt(t),
  height: thicknessAt(t),
  offset: bendAt(t),
  frame: frameAt(t)
}));

const blank = loftSections(sections, {
  cap: "both",
  sideRegions: ["top", "bottom", "left", "right"]
});

const finished = bevelEdges(blank.geometry, selectOuterEdges(blank), bevel);
```

The plank model defines where the edges wander, which surfaces wear,
how its end cuts vary, and what oak materials it receives.
The loft and bevel operations know only geometric profiles.

### Bent metal tube

```ts
const ring = annularSection({
  outsideRadius: 0.025,
  insideRadius: 0.021,
  segments: 16
});

const tube = sweepSection({
  path: pipeCenterline,
  sectionAt: () => ring,
  frames: "parallel-transport"
});
```

An annular section yields inner and outer walls with open ends.
The path can curve freely. The same sweep engine used for a
plank's changing profile produces the tube.

### Dagger grip

```ts
const grip = loftSections(gripProfileStations, {
  cap: "both"
});

const wornGrip = deformVertices(grip.geometry, localGripVariation);
```

The dagger model supplies the cross-sections and wear field.
Its loft, face regions, and deformation come from the same shared
operations as the plank and tube.

**Shared capabilities:** Section sampling, corresponding contours,
lofting/sweeping, controlled shape changes, authored surface regions,
physical UVs.

## 2. Tabletop with separately shaped pieces

The tabletop model chooses plank count, dimensions, gaps, and
the construction style.

First, create the *common seam curves*. Every neighboring pair
references the same sampled geometry.

```ts
const seams = makeSharedBoundaries({
  cuts: weightedCuts(-width / 2, width / 2, plankCount),
  deviation: tableEdgeVariation,
  stations: adaptiveStations(sampleSeams, tolerance)
});

const partitions = partitionContour(tabletopOutline, seams);

const boards = partitions.parts.map((part, index) => {
  const blank = extrudeContour(part.contour, thicknessAt(index));
  const edges = selectVisibleEdges(blank, part);
  return bevelEdges(blank.geometry, edges, bevelAt(index));
});
```

The same partition mechanism can create:

- A door assembled from fitted wooden planks.
- A circular barrel head assembled from irregular chord-like strips.
- A series of adjoining forged metal plates.
- A segmented stone surface with controlled joint widths.

A gap is derived from the common seam: offset the two neighboring
piece boundaries in opposite directions. The location and shape
of the seam itself remain coherent.

**Expected geometry:** Neighboring pieces have matching station
parameters and intentional clearances. Faces use their own
true quads/triangles. No duplicate independent sampling occurs.

## 3. A fitted chair rail and an iron brace

The chair has slanted posts. The metalwork has differently shaped
supports. Both need fitted member ends.

```ts
const fit = fitBetweenSurfaces({
  start: { target: postA, near: jointA },
  end: { target: postB, near: jointB },
  section: railCrossSection,
  frame: assemblyFrame
});

const rail = loftSections(fit.sections);
```

The result is a pair of end sections, each cut to its support plane
across its complete profile. The model chooses the profile, position,
and materials.

Change `railCrossSection` to a metal U-section or a polygonal
bracket profile. The query and fitting code stay the same.

For a curved support, `fitBoundary` replaces plane-based fitting
at the relevant end:

```ts
const shaped = fitBoundary(
  rail,
  rail.boundaries.end,
  curvedTarget,
  { projection: "ray", direction: inward, falloff: 2 }
);
```

**Expected geometry:** Actual contact points agree with the target
surface. The member retains valid winding, coherent UVs, and
the original authored sections wherever fitting leaves them unchanged.

## 4. A barrel body, barrel head, and iron hoop

The model decides the barrel's silhouette, stave count, stave
spacing, hoop positions, and wear patterns.

The body combines radial layout with section lofting:

```ts
const boundaries = sampleRadialBoundaries({
  radiusAtHeight,
  angularCuts,
  stations: bodyStations
});

const staves = boundaries.adjacentPairs().map(pair =>
  loftSections(pair.outerAndInnerSections)
);
```

Each adjoining stave uses a shared angular boundary definition.
Its visible seam and wear are deliberate variations around the
same underlying geometric interface.

The head uses contour partitioning within a circular outline:

```ts
const headParts = partitionContour(headOutline, plankSeams)
  .parts
  .map(part => extrudeContour(part.contour, headThickness));
```

The iron hoop follows a profile around the barrel:

```ts
const hoop = sweepSection({
  path: closedHoopPathAt(height),
  sectionAt: () => hoopCrossSection
});
```

The same surface-following/ribbon technique can make a curved metal
band around a chest, a circular rim, or a decorative molding.

**Expected geometry:** The curved stave faces are real surfaces,
neighboring seam boundaries agree, and head/hoop details are
constructed with geometry rather than hidden by rendering.

## 5. A mug handle meeting a curved body

The handle is swept along a model-chosen curve. Its two end
boundaries are available immediately:

```ts
const handle = sweepSection({
  path: handleCenterline,
  sectionAt: t => handleCrossSection(t),
  frames: "parallel-transport"
});

const fittedStart = fitBoundary(
  handle,
  handle.boundaries.start,
  mugSurface,
  { projection: "ray", direction: firstContactDirection }
);

const fittedHandle = fitBoundary(
  fittedStart,
  fittedStart.boundaries.end,
  mugSurface,
  { projection: "ray", direction: secondContactDirection }
);
```

The contact system only sees the handle's boundary loops and the
mug's actual target surface. The same logic can connect a tube
to a vessel or a curved branch to a tree trunk.

The mug's capacity is computed separately from its interior
sections. Its contents mesh remains a runtime feature driven
by volume-calibrated morph targets.

**Expected geometry:** No unexplained handle gap, coherent
construction topology at the fitted ends, and preserved runtime
fill behavior after GLB/Godot export.

## 6. Toward a fully modeled character

This example sets the geometric direction beyond the current assets.

A forearm can be described by an evolving cross-section around
a curved centerline. The wrist and hand use further section
transitions. Fingers can share the same sweep/loft primitives,
with individually authored profiles and different deformation fields.

Skin surface patches can connect open boundaries with matching
stations. Sharp topology transitions, openings, and local
refinement work through the same edge and patch operations
already used on furniture and metalwork.

A future rigged mesh adds skeleton/skin-weight authoring and
deformation at the animation layer. The current GLB exporter
already has special treatment for skinned meshes, so the
geometry kernel provides the authored shape that the rigging
work will later consume.

This is a demanding model category. It gives us a useful
long-range measure of how composable the geometric system
has become.

## Practical cross-model checks

| Shared operation | Two different consumers | Visible result |
| --- | --- | --- |
| Changing-profile loft | Plank and dagger grip | Distinct forms, authentic quads |
| Path sweep | Mug handle and bent metal tube | Smooth transported section orientation |
| Shared partition | Tabletop and barrel head | Matching irregular seams |
| Boundary fitting | Chair rail and mug handle | Real contact to planar/curved targets |
| Patch cut | Wood mortise and metal slot | Actual wall/rim topology |
| Deformation | Worn board and organic limb | Stable authored topology and controlled detail |
| Surface regions | Timber end grain and metal cut face | Correct material grouping without geometry duplication |
| Render compilation | Any two constructed parts | Quad View plus valid GLB export |

The examples are the concrete reason for the architecture:
a growing set of geometric operations that stays useful as the
models become more varied and more ambitious.
