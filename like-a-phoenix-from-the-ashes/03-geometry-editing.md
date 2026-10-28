# 03 — Geometry Editing

Editing consumes authored geometry and produces authored geometry with
explicit new surfaces, edges, and boundaries. The resulting shapes can
be constructed further, fitted, textured, and exported.

## Partitioning and shared boundaries

A partition is defined by a common geometric boundary which is sampled
once and used by every adjoining piece.

```ts
interface PartitionResult {
  parts: GeometryResult[];
  interfaces: readonly {
    left: BoundaryRef;
    right: BoundaryRef;
    shared: SharedBoundary;
  }[];
}
```

A `SharedBoundary` contains a curve, its sample parameters and its
actual points. Neighboring pieces use those very same stations.
Clearance or gap width is applied to each side as a deliberate offset.

This is how irregular tabletop planks, barrel heads, segmented metal
plates, and stone blocks can share one partitioning system.

### Contour operations

`clipConvexPolygon()` and `partitionConvexPolygon()` already
implement planar half-plane clipping. Expand that vocabulary:

| Operation | Output |
| --- | --- |
| `clipContour(contour, halfPlane)` | Kept regions and cut segments |
| `partitionContour(contour, cuts)` | Contour pieces with common cut boundaries |
| `offsetContour(contour, distanceField)` | Insets, gap offsets, expanded contours |
| `splitBoundary(boundary, stations)` | One sampled boundary for every adjacent piece |
| `resampleBoundary(boundary, landmarks, tolerance)` | Adaptive samples preserving key points |

A concave clipping result may have multiple components and holes.
The contour representation accommodates these explicitly.

### Plane cuts through meshes

```ts
splitByPlane(geometry, plane, {
  cap: true,
  cutRegion: "fresh-cut"
});
```

The plane is intersected with edges only once. Both output pieces
share the computed intersection positions, gain genuine cut faces,
and expose the new boundary loops. UVs on surviving source faces
are interpolated; cap UVs use a plane-aligned frame.

A quad intersected by the cut may become new quads and triangles.
The output records what was actually constructed. Deliberate
retopology can follow when the cut region warrants clean quad loops.

## Openings and recesses

`cutBoard()` presently builds mortises and recesses using a custom
orthogonal grid. Extract the surface editing itself.

An opening starts with a surface region and a closed contour in
that region's parameter space. The operation introduces matching
edges into the region, cuts or removes the selected patch, and
constructs rim/wall/floor faces where needed.

```ts
cutPatch(geometry, region, outline, {
  depth,
  wallRegion: "cut-wall",
  floorRegion: "cut-floor"
});
```

A planar patch can use direct contour clipping. A curved patch
evaluates its local contour back onto the original surface.

A through-hole joins openings on opposite surfaces or removes an
intersecting volume. The resulting rim is a named boundary, usable
for beveling, fittings, or later construction.

The same operations make a wooden housing, metal slot, rivet seat,
and a damaged recess.

## Solid booleans

`manifold-3d` is already a repository dependency. It is an available
kernel for union, intersection, and difference of closed solids.

Boolean results are represented by their **actual generated faces**.
A triangulated result contains authored triangles. A separate
retopology/patch-reconstruction operation produces cleaner quad
layouts where that has a defined construction solution.

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

No hidden T-junctions: a split of a shared edge is reflected on
both incident faces or is handled by a real transition patch.

## Result

A tabletop with irregular plank seams, an iron strip with mounting
holes, a broken stone edge, and a shaped dagger guard all reuse
the same cutting, partitioning, surface-detail, and deformation tools.
