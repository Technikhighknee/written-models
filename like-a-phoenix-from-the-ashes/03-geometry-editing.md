# 03 — Geometry Editing

Editing consumes authored geometry and produces authored geometry with
explicit new surfaces, edges, and boundaries. The resulting shapes can
be constructed further, fitted, textured, and exported.

## Partitioning and shared boundaries

A partition is defined by a common geometric boundary which is sampled
once and used by every adjoining piece.

```ts
interface PartitionResult {
  parts: readonly GeometryResult[];
  interfaces: readonly PartitionInterface[];
}
```

`PartitionInterface` links both output pieces to the same
`SampledBoundary`: the sampled geometry and its parameters.
Neighboring pieces reuse those stations. A gap or clearance is
an intentional offset from this common source.

This is how irregular tabletop planks, barrel heads, segmented metal
plates, and stone blocks can share one partitioning system.

### Contour operations

`clipConvexPolygon()` and `partitionConvexPolygon()` already
implement **convex** planar half-plane clipping. Today,
`circularPlankPanel()` also collects every piece's adaptive
stations and rebuilds them on a union of sample positions.
The generic partition operation coordinates stations before
constructing the output faces. Expand that vocabulary:

| Operation | Output |
| --- | --- |
| `clipContour(contour, halfPlane)` | Kept regions and cut segments |
| `partitionContour(profile, cuts)` | Profile pieces with common cut boundaries |
| `offsetContour(contour, distanceField)` | Insets, gap offsets, expanded contours |
| `splitBoundary(boundary, stations)` | One sampled boundary for every adjacent piece |
| `resampleBoundary(boundary, landmarks, tolerance)` | Adaptive samples preserving key points |

A concave clipping result may have multiple components and holes.
The `Profile2` result contains the boundary and any hole contours;
`clipContour()` returns an array of profiles. The convex fast path
remains available.

### Plane cuts through meshes

```ts
splitByPlane(geometry, plane, {
  cap: true,
  cutRegion: "fresh-cut"
});
```

The plane intersects each source edge once. Both output pieces
reuse the same calculated intersection coordinates and sample
ordering, gain genuine cut faces, and expose their cut loops.
All connected components and hole loops are represented. UVs on surviving source faces
are interpolated; cap UVs use a plane-aligned frame.

A quad intersected by the cut may become new quads and triangles.
The output records what was actually constructed. Deliberate
retopology can follow when the cut region warrants clean quad loops.

## Openings and recesses

`cutBoard()` presently builds mortises and recesses using a custom
orthogonal grid. Extract the surface editing itself.

An opening starts with a **connected surface patch and its local
2D chart**, plus a closed contour. A semantic region name may
refer to disconnected faces and cannot identify one patch. The operation introduces matching
edges into the region, cuts or removes the selected patch, and
constructs rim/wall/floor faces where needed.

```ts
cutPatch(geometry, patch, outline, {
  kind: "recess",
  depth,
  wallRegion: "cut-wall",
  floorRegion: "cut-floor"
});
```

A planar patch uses direct contour clipping in a plane-aligned chart.
A curved patch needs an explicit mapping between chart coordinates
and the surface, plus a way to construct its rim/sidewalls.
The first `cutPatch()` handles planar patches; curved patch
editing extends it once parameterization is available.

A through-hole joins openings on opposite surfaces or removes an
intersecting volume. The resulting rim is a named boundary, usable
for beveling, fittings, or later construction.

The same operations make a wooden housing, metal slot, rivet seat,
and a damaged recess.

## Solid booleans

`manifold-3d` is already a repository dependency. It is an available
kernel for union, intersection, and difference of closed solids.

The installed `manifold-3d` package can supply solid booleans, but
it does not automatically preserve authored quads, UVs, or surface
regions. The wrapper defines face classification, UV projection,
and whether the result has separate components.

Boolean results are represented by their **actual generated faces**.
A triangulated result contains authored triangles. A separate patch-reconstruction operation can produce useful quads
on a suitable surface chart. Otherwise the boolean result remains
a genuine triangulated solid.

The simpler contour/patch/plane operations preserve a greater amount
of existing topology and therefore remain the preferred geometric
foundation when applicable.

## Edge and surface shaping

A profile is a field over distance, curve parameter, or surface position.

```ts
type ScalarField = (position: number) => number;

bevelEdges(geometry, edges, widthField);
roundEdges(geometry, edges, radiusField, segments);
grooveAlong(geometry, path, crossSection);
insetBoundary(geometry, boundary, widthField, depthField);
```

The relevant faces and edges are selected geometrically. Models
supply profiles and detail parameters. The same tools shape wood,
iron, ceramics, stone, and organic surfaces.

The edge/corner work in `profiledBoard`,
`seamedPlankExtrusion`, and `circularPlankPanel` becomes composed
edge and surface editing.

## Deformation and variation

Deformation acts once per **construction vertex**.

```ts
deformVertices(
  geometry,
  (position, vertexId, context) => displacement
);
```

Reusable fields include path-relative bend/twist/taper,
spatially varying displacement, and region-weighted falloff.

`warpGeometry()` currently mutates BufferGeometry, and follows the
WeakMap mapping back into the authored source. The new operation
acts on `MeshData` directly; rendering happens afterward.

`seededVariation()` and `coherentVariation()` provide deterministic
variation fields. A model controls their influence on geometry.
Related parts may sample one common field to preserve continuity.

## Resolution and topology transitions

`adaptiveStations()` already detects curve deviations at quarter,
half, and three-quarter samples and retains authored knots.
`stitchPolylines()` connects mismatched edge densities with genuine
triangles.

These become the common tools for local refinement:

- Subdivide an edge or surface region at chosen parameters.
- Sample a curve/surface within a physical tolerance.
- Share stations across adjoining faces or separate parts.
- Bridge boundaries whose edge counts differ.
- Reconstruct a local patch explicitly after complex cutting.

No hidden T-junctions: a split of a shared edge affects both incident
faces, or a real transition patch bridges the differing resolutions.
Edge shaping operates on explicitly selected loops, not just the
name of their surrounding material region.

## Result

A tabletop with irregular plank seams, an iron strip with mounting
holes, a broken stone edge, and a shaped dagger guard all reuse
the same cutting, partitioning, surface-detail, and deformation tools.
