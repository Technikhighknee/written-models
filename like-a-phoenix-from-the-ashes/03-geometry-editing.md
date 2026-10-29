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

`partitionContour(profile, cuts)` is the supported convex-input
partition operation. Each `PlanarCut2` gives a named boundary-to-boundary
polyline; its intermediate points become shared construction stations.
Each resulting `Profile2` has an independent outer contour, while every
`ContourPartition.interfaces` entry retains the canonical polyline,
normalized physical-length stations, and both current owning part indices.
If a later cut divides a piece, earlier interface ownership follows the
piece that actually retains that interface, rather than a stale array index.

The first partitioner rejects intersecting or perimeter-touching cuts,
holes in the input, nonconvex source outlines and ambiguous topology.
A concave **output** is valid and can be independently extruded through
`extrudeContour`. Exact source interface coordinates are shared,
without hidden resampling or vertex welding between independent parts.
`samplePartition(partition, extraStations)` refines every named
interface from one canonical, arc-length-sampled source. Its requested
stations are merged with *all* authored cut corners; the additional
points are inserted into the two current owners' ordered boundaries
using those same coordinates. The resulting parts are `SampledProfile2`
with explicit perimeter parameters, ready for `extrudeContour` and
subsequent patch operations. The outer contour is oriented clockwise
for the existing sampled-extrusion contract. The independent
`sampleProfile` operation also supports sampled outer contours and holes.
Arbitrary hole-bearing **partition inputs** still belong to 6.1.
`fillSurfacePatch({ profile, chart, region, maxDeviation })`
constructs a charted authored surface from these exactly sampled
outer/hole loops. Its patch selection owns the generated face references
and chart; the boundary selections retain each loop's original
construction vertices. Curved surfaces may be refined by inserting
vertices **only in the interior**. Shared interior edges are subdivided
consistently in all incident triangles, never on one side alone.

Boundary chord deviation is checked independently. A requested
`maxDeviation` that cannot be met without changing a boundary
produces a typed `sampling-limit` error: the interface must be
resampled jointly before either neighboring surface is reconstructed.
The deviation is assessed at edge midpoints and face centroids,
not a proven continuous maximum for arbitrary chart functions.
The chart must be finite, locally oriented and invertible at sampled
points. Folded or self-overlapping chart domains are unsupported.

The resulting triangles retain physical chart-space UVs and their
authored face provenance through the regular mesh/render compiler.
Subsequent topology-changing edits must return refreshed patch owners
or invalidate the chart; this lifecycle is addressed explicitly in 3.7.

`joinGeometry(parts, { weld })` merges only explicitly matched open
boundary chains (full loops or contiguous open subchains). A pair must
have the same sampled vertices and coordinates within the geometric
precision, but its source selection may start at another periodic seam
or traverse in either direction. The join checks the **authored face
edge uses** after mapping; they must oppose each other. Vertex groups
are welded through a shared union-find identity, with no automatic
vertex welding outside the declared boundaries.

A source edge cannot be welded twice. Matching cycles cannot identify
two distinct vertices of the same part or accumulate incompatible
positions. Duplicate coincident authored triangles, inconsistent
edge orientation, three-face edges, and disconnected vertex face fans
are rejected. The output owns new vertex/face IDs, preserving original
authored quads, triangles, regions and per-face UVs. Consumed named
open rims disappear; remaining named chains get fresh owners, with
part-index prefixes where source names collide. Patch charts survive
only if their referenced faces retain unchanged positions; others
must be reconstructed. `joinGeometry` does not replace a general
arbitrary surface-intersection or Boolean operation.

A concave clipping result may have multiple components and holes.
`clipContour(profile, halfPlane)` returns an array of `Profile2`
parts, with each component's own outer loop and enclosed holes. A
hole intersected by the cutting line becomes part of the open
perimeter. The operation caches edge-plane intersections across
triangulated faces, cancels internal faces and traces closed boundary
loops; it does not infer components from bounding boxes. Point-touching
boundaries, intersecting loops and nested holes are outside the
supported domain. `partitionContour` continues to handle independent
boundary-to-boundary seams on convex source profiles, while the
convex half-plane fast path remains available.

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

The supported operations are `bevelEdges` for eligible
nonbranching edge chains, `shapeSurfaceRelief` for profile-driven
surface grooves and shoulders, and `recessPatch` for inset
regions with actual walls and floors. Rounded edge profiles,
groove shapes and selected insets are compositions of those
operations or explicit constructed sections—not three more
uncontracted toolbox functions.

The precise inputs, output selections and supported domains
are in [09](09-api-contracts.md) and [10](10-geometry-semantics.md).

The relevant faces and edges are selected geometrically. Models
supply profiles and detail parameters. The same tools shape wood,
iron, ceramics, stone, and organic surfaces. `shapeSurfaceRelief`
accepts all detail paths on one connected patch together. Each
feature has a half-width and signed displacement profile; sampled
stations are merged before rebuilding the surface. New shoulder,
wall and floor faces receive explicit surface regions. The
opposite mating face remains available for contact.

`shapeSurfaceRelief(source, patch, features, options)` rebuilds
a selected charted surface once from all authored feature paths.
Each `SampledBoundary` supplies physical positions and increasing
stations, a signed profile over the feature's physical half-width,
and an optional region classifier for shoulders and floors.
The reconstruction inserts path/width stations in the *interior*,
regularizes internal diagonals, and refines both sides of any
subdivided internal edge. Boundary vertices and edges are unchanged;
any nonzero displacement detected along the rim is rejected.

The output retains untouched faces, UVs and named edge chains,
reissues face and patch selections with new owners, and labels
newly constructed floor and shoulder faces. A modified patch chart
is returned only if its inverse still round-trips every sampled
construction vertex. Otherwise its stale patch selection is dropped.
The sampled displacement is checked against nonselected mating faces,
with penetration rejected. This is not a full continuous-surface
Boolean intersection proof.

`maxDeviation` is a measured interior sample tolerance (default
0.005 m), rather than an analytical guarantee over arbitrary
black-box shape fields. Requests exceeding the sampling budget or
needing extra boundary subdivisions return `sampling-limit` instead
of silently changing interfaces. Relief requires one connected,
single-region source patch; unrelated source faces are preserved.

Construction-time corner shaping is handled by
`shapeSectionCorners(contour, transitions)`. It replaces explicitly
selected convex corners of any closed planar section with either a
straight cut or a tangent circular arc, in physical metres. Round
transitions specify equal cuts on their incoming/outgoing edges and
an authored number of arc segments. Different sections may vary their
cut dimensions while retaining corresponding corner indices and
segment counts.

The returned contour can feed extrusions, loft sections and
independently filled patch boundaries. Each emitted edge carries
provenance: the source contour edge index, or the selected corner
and transition segment. Loft consumers use this provenance for
material and smoothing assignments, without a board-specific
construction primitive. Untouched corners retain their coordinates.
Inverting contours, intersecting cut intervals, nonconvex selected
corners and collapsed geometry are rejected. Separately generated
mating surfaces must use the same shaped contour and compatible
face orientation before they can be welded.

The edge/corner work in `profiledBoard`,
`seamedPlankExtrusion`, and `circularPlankPanel` first becomes
construction-time section shaping plus patch relief. General
post-hoc `bevelEdges` is implemented only after local edge splitting
and adjacent-face reconstruction are available. Initially it accepts
well-formed manifold chains with unambiguous corner joins; the
input edges must describe ordered nonbranching chains in their
source result, and the width field's `t` is normalized arc length
along each chain. Unordered/branched selections, excessive widths,
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
