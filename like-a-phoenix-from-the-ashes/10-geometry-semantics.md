# 10 — Geometry Operation Semantics

These are the geometric behaviors behind the public contracts. They
determine how an operation works when boundaries are shared, topology
changes, or the target is more complicated than a single quad.

## 1. A sampled boundary is a shared construction input

A seam has a curve, an ordered station sequence, and evaluated positions.
A partition first computes those shared values. The two pieces are
constructed from the same values.

```text
cut definition
     │
     ▼
sample/merge stations ──► one SampledBoundary
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              first piece            second piece
```

The two pieces may have a deliberate gap, but both offsets are
measured from the same sampled source.

When one adjacent surface needs extra geometry, its stations are
merged into the shared sequence **before either piece is built**.
If a later operation subdivides an interface, it either propagates
that split to the adjoining part or returns a new sampled interface
that both parts must consume.

For a tabletop, the shared source describes the mating board edges.
Wear at the visible top edge is a separate surface operation. The
sidewall may remain fitted throughout its thickness while the top
face develops a shallow recess. This preserves a convincing seam
without opening a gap through the entire board.

The same mechanism builds barrel-head boards, metal plate joints,
and adjoining shaped stone.

## 2. A geometric reference belongs to a result

Face and boundary references use integer vertex/face IDs that make
sense within one particular `GeometryResult`.

A geometry edit returns a new result, including new references for
any faces or boundaries it preserved or created. Previous references
stay associated with the previous result.

An operation reports the parts that matter for further composition.
For example:

```text
extrudeContour → geometry, front/back faces, outer/inner rim loops
splitByPlane  → two solids, new cut faces, paired cut loops
openPatch     → open rim where surface faces were removed
recessPatch   → named rim, inset walls and a floor
cutThrough    → matching entry/exit rims and connecting walls
fitBoundary   → moved/refined geometry, updated boundary selection
```

A region ID groups faces with the same semantic role. A boundary ID
names an ordered chain of edges. Either may contain multiple connected
components, so the API returns named arrays of boundary chains.

Indexed topology is useful for efficient operations, but its numeric
IDs are not persistent authoring identifiers across edits. Named
result selections provide continuity through composition.

## 3. Caps follow the topology of the actual section

A solid cross-section has an outer contour. A hollow cross-section
also has inner contours. Corresponding loops retain their identities
at each station along the loft.

- Side strips between corresponding stations are real quads.
- A simple planar convex four-corner cap can be one authored quad.
- Larger, concave, or holed planar caps are triangulated using the
  exact boundary vertices.
- Caps with distinct inner and outer contour rows may be bridged
  with quad strips when their correspondence permits it.
- Different boundary sampling densities use explicitly constructed
  transition triangles. `bridgeBoundaries` only merges consecutive
  transition triangles into a real quad when *both* station endpoints
  match and the resulting quad is geometrically valid. It preserves
  every source boundary edge, closed-loop seams and physical UVs.
  It does not silently weld into separate source meshes.
- A tip at a single point is represented by true fan triangles. The source end remains open until the tip operation closes it; already capped ends are rejected.
- An open end exposes its outer and inner boundary chains.
- For a periodic sweep, the final contours reconnect to the
  initial contours with matching frames and vertices.

`loftSections` and an open-path `sweepSection` default to capped
ends. Nonplanar contours cannot be capped by pretending they are
planar; they remain explicitly open for separate patch construction.
A closed-path sweep has no end-cap option. For revolution, meridian
intervals control surface and smoothing labels; full revolutions
share their angular seam vertices, and only supported planar
exposed boundaries can be capped on partial revolutions.

At the beginning and end of a hollow pipe, an `ends: "open"`
construction exposes the two wall rims. A capped pipe receives
an annular face between the two contours; it does not get a disk
across its hollow interior.

Nonplanar end contours require an explicit surface patch, section
refinement, or an open end. Planar triangulation is not applied to
an arbitrary warped contour.

## 4. Plane splitting a solid

A closed manifold source is split by an oriented plane.

1. Classify each source vertex by signed distance.
2. Cache the intersection of the plane with each crossed **undirected
   source edge**, including the source-face UV interpolation values.
3. Clip incident faces on both sides using those shared intersection
   positions, retaining their semantic surface assignments.
4. Trace the resulting cut edges into oriented loops. Multiple
   disconnected loops and loops around existing holes are supported.
5. Cap those loops as oriented planar patches when `cap` is enabled.
6. Separate each half-space into connected components. Return every
   part, its negative/positive half-space label and paired interfaces.

A face cut across one of its edges may require triangle topology.
Complete surviving quads retain their original face structure
where geometrically valid. Cut caps may contain genuine triangles.

Each paired interface identifies the two owning part indices,
their matching boundary chains and the shared sample positions.
Multiple disconnected components on one side are separate parts.
A cut loop on either half-space has the opposite orientation to
its mate in the other half-space for outward-facing solids.

Coplanar input faces are not blindly duplicated into both outputs.
When a plane contains an existing face, the owning component is
resolved from the adjacent volume and face orientation; genuinely
ambiguous contact-only or nonmanifold configurations fail rather
than producing overlapping cap faces.

A tangent split that produces no actual two-sided division returns
the unchanged side as one piece with an explicit empty interface set.
A cap request is valid only for closed intersection loops.
Open input shells may be cut without automatically becoming solids.

## 5. Editing a planar surface patch

`SurfacePatchRef` selects a connected collection of authored faces
and a coordinate chart that maps its local 2D plane to 3D positions.

The first patch-editing operations support planar connected patches with valid
outer boundary and optional existing holes.

A fully interior cut contour must be simple, closed and contained
within the selected patch's actual domain. In the first planar
implementation, a contour crossing the patch perimeter or an
existing hole is rejected rather than partially clipped into an
unspecified result. Boundary-touching and multi-component cuts
belong to the later explicitly supported domain. The patch must
be a valid charted, connected surface; region names alone do not
select a suitable patch.

The operation:

1. Projects the selected patch and the new contour into the same
   plane-aligned 2D chart.
2. Intersects the contour with the actual patch footprint.
3. Subdivides affected face edges using common intersection points.
4. Rebuilds the affected patch, retaining unchanged neighboring
   construction vertices and shared-edge subdivisions.
5. Emits the opening's ordered rim and any new wall/floor faces.

There are three distinct results:

| Operation | New geometry | Topological result |
| --- | --- | --- |
| `openPatch` | Removes a surface region | Open rim in a surface/shell |
| `recessPatch` | Creates sidewalls and a floor at positive depth | Pocket with a closed floor |
| `cutThrough` | Connects the opening on two selected surfaces | Through-hole with inner walls |

A `cutThrough` in a complex solid can be implemented by an
explicit volume difference, with the boolean's topology rules.
A local aligned-wall implementation is sufficient when the
opposing patches share a clear compatible chart.

Curved patch cutting uses a specifically authored or derived
parameterization with a valid domain. A surface with folds,
singularities, or overlapping coordinates needs local patch
splitting first.

## 6. Surface edits and chart ownership

A parameterized surface patch is selected with exact faces and a
chart mapping its local 2D coordinates to 3D. Its selection includes
the source result's generation token; source/result mismatches fail.
The patch is constructed from an explicitly sampled outer boundary
and, where needed, explicitly sampled hole loops. The chart cannot
silently change the stations of an interface shared with another
piece. Interior refinement is independent. A
subsequent topology edit returns updated patch references only
when a valid chart still describes the edited surface.

`shapeSurfaceRelief` accepts a set of path-aligned relief features
**together**. It combines the feature station requirements before
rebuilding any face. A board with two adjoining grooves therefore
uses one connected surface chart and one reconstruction, keeping
both shoulders and groove floors in the same topology.

Overlapping negative relief fields use the specified minimum rule,
so two crossing grooves do not accidentally double their depths.
A summed field is available when additive deformation is explicitly
intended. Regions and local UV projections for the new floors and
shoulders are returned with the edited geometry. The mating side
and floor thickness are checked for unintended break-through.

A relief running beside an interface must preserve the exact shared
rim and extend inward from it, or explicitly trigger reconstruction
of neighboring walls and interface consumers. A nominally shallow
groove still invalidates a join if it displaces the welded edge.

An edit assigns a new result token. A caller uses the returned
patch selection if the updated chart is valid. Otherwise that
selection is absent and a new chart must be explicitly supplied. This prevents stale
parametric mappings from being treated as valid geometry.

## 7. Selection survival through geometry edits

All geometry-producing operations allocate a new result ID. Returned
face indices and named regions refer only to that result, even when
the face order happens to be unchanged. Boundaries and selected edges
are reissued with the new result's owner. An edit that divides or
removes a selected edge/face must either reconstruct an exact
corresponding chain/region in the result or drop that selection; it
must not keep a now-unrelated integer index.

An ordered `BoundaryRef` identifies an actual edge chain, not
necessarily an *open* mesh edge. A capped cut can retain its
interface rim as the closed chain between cut cap and original faces,
while an uncapped cut returns the open rim. `capBoundary` consumes
the original open-rim selection as an open edge and may retain
the same ordered chain as an interior region-border selection.
`joinGeometry` consumes paired open rims and preserves only named
chains that remain meaningful after welding. An input boundary edge
may be matched to exactly one other boundary edge; a second match
would create a nonmanifold edge. All pairings must agree globally on
vertex identity. Duplicate coincident faces and nonmanifold vertex
fans fail even if each individual edge pair looks locally valid.

Operation-specific selection behavior:

| Operation | Face/edge and named region handling | Patch chart handling |
| --- | --- | --- |
| UV offset | Same topology; fresh result owner and remapped selections | Remains valid |
| Face classification | Same topology; update face labels and derive regions from final labels | Remains valid |
| Invertible transform | Same connectivity, transformed coordinates, reflected winding corrected | Chart composed with transform and its inverse; normal transformed correctly |
| Arbitrary vertex deformation | Same connectivity if valid; fresh owner, faces and edge chains retained | Discard by default, unless caller explicitly supplies and validates a replacement chart |
| Surface relief or opening | Rebuild affected faces, name newly created rims and wall/floor regions; discard obsolete selections | Return only a verified chart on the rebuilt patch |
| Plane split | Each component owns new indices, surviving named regions and explicit cut interface chains | Retain only charts that remain valid on an output component |
| Join or cap | Remap survivors; consume welded/open chains as appropriate | Keep only charts whose faces and mapping survive the operation |

For a surface edit, a valid chart means `at` and `parameterOf`
still give consistent positions over its selected surface, including
the boundary and newly added interior vertices. It is insufficient
for a function to return the original chart object merely because
the surface has not changed its face count. A newly created chart
must also have a single-valued, non-overlapping parameter domain.
No editor silently invents a chart for unrelated faces.

## 8. Surface queries refer back to authored faces

The rendering/query triangles are derived from authored faces.
Their creation records the source `FaceRef` for each triangle.

A ray or nearest-point query may use an acceleration structure
over that triangle representation. A hit is mapped back to its
authored face and semantic region.

The query normal follows actual triangle winding, transformed to
world coordinates, and never flips merely to face an incoming ray.
`frontFacing` reports the ray relationship separately. Barycentric
coordinates refer to the emitted triangle's source face corners,
allowing exact UV interpolation from authored data. Surface
selection can also consult authored face normals or connected
planar patches.

For a quad, querying uses the same chosen diagonal as the renderer.
A nonplanar authored quad is evaluated as the two render triangles;
where that approximation is too coarse, construction subdivides
the surface.

This establishes a clean division of responsibility:
`MeshData` owns shape/topology, the query compiler can accelerate
intersections, and the renderer owns GPU attributes.

## 9. A fitted plane has a finite footprint

The contact finder selects either a planar authored-face patch near
the intended joint or an explicitly provided finite planar footprint.
Both are bounded geometries with an actual outline and optional holes.

The member's end-section vertices are intersected along its own
axis with the chosen plane. The resulting points must lie within
the selected patch's actual planar footprint, excluding holes.

A solution using the infinite mathematical plane outside that
footprint is rejected. A suitable wider connected patch may be
selected explicitly.

For a curved target, each selected boundary vertex is projected
through the target query. The operation checks hit distance,
surface orientation where relevant, the shape of the projected
boundary, and whether any incident faces invert.

`clearance` is measured in meters along the target hit normal.
The incoming source transform is specified; the result is converted
back to the source's authored coordinate space.

A fitted boundary is geometric contact. Welding or solid union is a
separate operation chosen by the model.

## 10. Topology edits preserve surface data

When splitting a face, the operation interpolates its per-corner
UVs at the new edge positions. Newly created walls, caps and inset
floors get their own surface name, smoothing policy and UV chart.

A split of an existing shared edge is applied to every incident
face. This prevents T-junctions within a solid. The same principle
applies across separate pieces that intentionally share a boundary.

The resulting mesh is checked for valid vertex positions, face
winding, nonzero face area, correct edge incidence for its intended
open/closed state, and non-inverted geometry.

A solid boolean uses the `manifold-3d` adapter and produces the
actual resulting triangle topology. Surface/UV transfer happens
explicitly. General automatic quad retopology is not assumed.

## 11. Rendering and asset behavior remain separate

`toBufferGeometry` compiles authored faces to GPU triangles,
applying per-corner UVs, smoothing, and model-selected material
regions. The compiled object keeps the authored snapshot needed
for Quad View. A new authored result receives a new compilation.

`prepareRuntimeModel` then makes an export copy and may merge
compatible static pieces. Geometry with morph targets, instances,
skin weights, or unsupported materials follows its existing
special export path.

The beer mug's fill levels remain a volume-based geometry/runtime
composition: the cavity defines capacity and the persistent
liquid mesh supplies the morph shapes. GLB carries shapes and
weights; the engine supplies the controller logic.

The numerical policy, sampling saturation behavior, Float32 export
limits and exact query result fields are defined in
[11](11-numerics-and-query-fidelity.md).

The output of these operations is reusable geometry, with its
construction and surface information available for the next step.
