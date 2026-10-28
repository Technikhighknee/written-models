# 03 — Geometry Editing

Editing consumes authored geometry and produces new authored
geometry with explicit faces, boundaries and surface metadata.
The resulting shapes can be constructed further, fitted and exported.
The exact behavior of the operations is specified in
[10 — Geometry operation semantics](10-geometry-semantics.md).

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

The plane intersects each source edge once. The resulting pieces
reuse the intersection points and agree on the entire cut contour.
Each interface records **both owning part indices** and the matching
boundary loops. Every connected output component is labeled with its
positive/negative plane side; one plane can produce several separate
pieces on either side. Source-face UVs are interpolated; cap UVs use a
plane-aligned chart.

Multiple connected components and holes remain distinct loops.
A tangential cut that does not divide the input produces one part
with no paired cut interface. Capping requires closed cut loops.

A quad intersected by the cut may become new quads and triangles.
The output records what was actually constructed. Deliberate
retopology can follow when the cut region warrants clean quad loops.

## Openings and recesses

`cutBoard()` presently builds mortises and recesses using a custom
orthogonal grid. Extract the surface editing itself.

The surface is selected as a **connected patch with a valid 2D
chart**. The patch, the new opening outline and the affected faces
are mapped into the same coordinates. A face region name alone
cannot identify a particular connected patch.

Three operations have distinct geometric results:

| Operation | Geometry result |
| --- | --- |
| `openPatch(source, patch, outline)` | Removes surface faces and leaves a named open rim |
| `recessPatch(source, patch, outline, options)` | Builds a pocket with sidewalls and a floor |
| `cutThrough(source, { entry, exit, wallRegion })` | Joins two compatible openings through a solid with actual interior walls |

```ts
const mortise = recessPatch(board, boardTopPatch, outline, {
  depth: recessDepth,
  wallRegion: "cut-wall",
  floorRegion: "cut-floor"
});
```

Each operation returns selected rims and new surface regions. A
through-cut requires matching entry/exit contours or an explicit
solid-volume difference.

A planar patch uses direct contour clipping in a plane-aligned chart.
A curved patch needs an explicit mapping between chart coordinates
and the surface, plus a way to construct its rim/sidewalls.
The initial patch operations work on planar connected faces.
Curved patches use an explicit chart with a valid domain and
predictable inverse mapping. A folded or self-overlapping surface
is split into appropriate patches first.

An opening rim remains available for beveling, lining, or fitting
another part. The same patch operations make a wooden housing,
a metal slot, a rivet seat and surface damage.

## Solid booleans

`manifold-3d` is already a repository dependency. It is an available
kernel for union, intersection, and difference of closed solids.

The wrapper explicitly assigns surface classifications, UVs and
connected components to the result. The boolean kernel cannot
recover authored quads or original semantic regions automatically.

Boolean results are represented by their **actual generated faces**.
A triangulated result contains authored triangles. A separate
patch-reconstruction operation can produce quads on a selected
surface with a suitable parameterization. Other boolean surfaces
remain genuine triangles.

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
iron, ceramics, stone, and organic surfaces. `shapeSurfaceRelief`
accepts all detail paths on one connected patch together. Each
feature has a half-width and signed displacement profile; sampled
stations are merged before rebuilding the surface. New shoulder,
wall and floor faces receive explicit surface regions. The
opposite mating face remains available for contact.

The edge/corner work in `profiledBoard`,
`seamedPlankExtrusion`, and `circularPlankPanel` first becomes
construction-time section shaping plus patch relief. General
post-hoc `bevelEdges` is implemented only after local edge splitting
and adjacent-face reconstruction are available. Initially it accepts
well-formed manifold chains with unambiguous corner joins; branching,
nonmanifold, intersecting or otherwise unsupported bevel junctions
fail explicitly instead of silently corrupting the mesh.

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

Surface relief uses one connected parameterized patch and all
specified seam/feature curves in a single reconstruction. Overlaps
combine by the declared rule (minimum signed relief or sum). The
sampling plan includes all shoulder, groove-floor and end-fade
landmarks before constructing actual faces. Every result returns
updated regions, boundaries and any still-valid patch charts.

Barrel-head boards use this for their outward faces. The inward
surface and full-thickness seam contact remain intact. One surface
chart is never silently reused after a deformation invalidates it.

These become the common tools for local refinement:

- Subdivide an edge or surface region at chosen parameters.
- Sample a curve/surface within a physical tolerance.
- Share stations across adjoining faces or separate parts.
- Bridge boundaries whose edge counts differ.
- Reconstruct a local patch explicitly after complex cutting.

Splitting a shared edge updates every incident face, or a real
transition patch bridges the differing resolutions.
Edge shaping operates on explicitly selected loops, not just the
name of their surrounding material region.

## Result

A tabletop with irregular plank seams, an iron strip with mounting
holes, a broken stone edge, and a shaped dagger guard all reuse
the same cutting, partitioning, surface-detail, and deformation tools.
