# 13 — Architecture Decisions and Execution Boundaries

The design has been checked against the current geometry code, all eight
models, the proposed API and the implementation dependencies. This is
the decision record for the resulting architecture.

## The architecture we will build

```text
authored vertices / authored faces / per-corner UV / surface regions
                 │
        topology + selections + sampling
                 │
       shape building and editing
                 │
     contact queries / fitting / assembly
                 │
      model-owned part compositions
                 │
   shared authored-face triangulation
                 │
       viewer + runtime GLB export
```

`MeshData` is the existing canonical shape representation. The model
owns dimensions, part count, assembly, decoration and materials.
Geometric operations exchange authored geometry with explicit
surface and boundary selections. The renderer and query adapter
consume the same face tessellation.

## Decisions that close architectural gaps

| Area | Decision | Consequence |
| --- | --- | --- |
| Geometry ownership | An operation returns new owned vertex/face/UV arrays. Selection references carry a result-generation identity. | Edits cannot silently alter source meshes or use a boundary from another result. |
| Direct mesh usage | A raw `MeshData` can be wrapped into a result with empty named selections. | Existing primitives and custom modeled patches remain usable. |
| Topology | The face list owns structure; adjacency and boundary loops are derived queries. Explicit welding only. | Separate touching parts need no fake shared edges or global mutable mesh. |
| Patch charts | A chart is associated with the exact result whose selected faces it parameterizes. An edit returns updated charts only when still valid. | Sequential patch edits cannot depend on stale face IDs or coordinates. |
| Shared boundaries | A sampled contour is an ordered list of stations and positions. All pieces on that interface consume it. | No accidental edge T-junctions or independently sampled neighboring seams. |
| Surface patch outline | `fillSurfacePatch` takes a sampled profile containing the explicit outer and inner boundary loops. Interior refinement keeps its boundary fixed. | Crowned tops, sparse undersides and lofted sidewalls can actually join. |
| Loft surfaces | Material and smoothing assignments are independent callbacks on contour edge and section interval. | The dagger's ricasso and the iron–wood–iron grip need no specialized loft. |
| Triangulation | One authored-face tessellator supplies renderer and surface queries, retaining face/corner provenance. | Quad View, ray hits, normals and UV interpolation refer to the same faces. |
| Geometry validity | Unsupported inputs produce structured geometry failures. Numerics and observed sampling error are explicit. | Algorithms do not silently invent topology or report an approximation as exact. |
| Assembly | Shape generation happens in explicit construction space; scene parenting and export are downstream. | Contact fitting can be checked before a model is attached to a scene. |
| Runtime assets | Preserve existing static batching and the specialized instance, skin and morph paths; morphs remain their own runtime data. | The beer mug's fill controller and GLB shapes continue working. |

### Result ownership

`GeometryResult` has an opaque generation token; an operation returning
new geometry allocates a new token. Named `BoundaryRef` and
`SurfacePatchRef` selections carry the token of their owner.
Operations accepting a selection verify its owner against the
source geometry. `FaceRef` remains a compact, result-local face
index returned by queries; it is accessed together with the
geometry result from which it came. The token is transient API
metadata, absent from GLB.

Deep-copy semantics apply to stored THREE.Vector2/3 values as well
as the arrays that contain them. Builders can mutate before
producing a result; callers treat returned results as snapshots.

### Geometric sampling and patch boundaries

`SampledContour2` carries ordered profile points and their exact
normalized stations. `SampledProfile2` carries the outer contour
and every hole with its own stations. There is no repeated terminal
vertex in a closed loop.

`fillSurfacePatch` uses that exact sampled profile to create its
boundary vertices. A chart maps those points and interior samples
into 3D; interior refinement can add vertices **inside** the patch.
If the requested boundary precision requires extra stations, the
caller computes a refined sampled profile *before* constructing
the neighboring walls and cap. The fill function never subdivides
a shared boundary behind the other consumer's back.

A `joinGeometry` weld pair identifies two boundaries from two
different input results. It validates equal oriented edge counts,
matching positions within the precision policy and opposite
surface-boundary winding. It removes the paired open boundaries
from the output selection and remaps remaining references.

This supplies the chair seat, barrel heads, and table planks without
requiring a general remeshing algorithm. Corresponding top and bottom
chair-seat wall loops are projected into their own patch charts;
reusing equal *parameter values* on unrelated 2D contour shapes
is not sufficient to produce weldable physical vertices. Likewise,
surface relief keeps its welded rim fixed, or explicitly requests
reconstruction of all consumers of a changed interface.

## Geometric coordinate spaces

Geometry constructors consume and produce positions in one explicit
construction-local frame. Surface charts map chart-local 2D coordinates
into that same frame. Geometry queries consume `SurfaceTarget` with
an explicit local-to-world transform and return world-space hits.
`fitBetweenSurfaces` likewise returns world-space sections;
`transformGeometry` converts them into an assembly-local frame when
needed. The scene-parenting operation resolves its own parent-local
and child-local attachment frames.

Both operands of `booleanSolids` occupy one common construction
frame. Its region/UV callbacks receive positions in that frame.
This prevents implicit dependence on a render mesh's world transform.
The exact API table is in [09](09-api-contracts.md).

Support contacts may be selected from actual authored faces or
specified as a finite planar footprint in an authored world-space
frame. Both use the same full-outline containment check and return
discriminated contact information; neither is treated as an infinite
plane.

## Result and chart survival

Every topology-changing edit reissues face, edge, and boundary
selections for its output or explicitly drops those it cannot retain.
An ordered boundary can refer to a cap's interior interface chain,
not just an open mesh edge. Transforms preserve patch charts through
composed coordinate mappings; arbitrary vertex deformations drop
parameterizations by default. The collection of named regions is
derived from the authored faces' surface classifications.

The early partitioner handles noncrossing boundary-to-boundary
cuts on a simple convex input, including concave output pieces.
General concave input, holes, intersecting cuts and multi-component
results remain Phase 6 work. Construction-time chamfers are available
in Phase 3; general post-hoc selected-edge beveling waits for the
Phase 6 local topology-refinement mechanism.

## Cavity frames and clearance

Cavity extraction converts separate stave surfaces to one explicit
rigid section-local frame. Its resulting rings remain independent
of world placement. Surface-clearance queries distinguish the minimum
requested gap from actual triangle contact/crossing; they do not
claim to classify solid containment.

## Execution has two dependency paths

**The existing-model migration is the first integrated proof.**

The initial construction path consists of the kernel, source-face
tessellation, sections/lofts/sweeps, contour partitions, sampled
surface patches, relief, joins, contact fitting, cavity extraction,
and render/export adapters. Each capability is exercised by real
model parts as soon as it becomes available.

**General geometry editing extends this proven representation.**

Full concave clipping with components, arbitrary plane-splitting,
planar and curved patch openings, through-cuts, solid booleans and
advanced edge edits have separate geometric dependencies and
algorithms. They build on the same kernel and selections, and have
their own precise result semantics in [03](03-geometry-editing.md),
[09](09-api-contracts.md) and [10](10-geometry-semantics.md).

The work on a generic boolean or arbitrary curved cut is therefore
independent of the ability to finish migrating the mug or chair.
The implementation plan in [07](07-implementation-sequence.md)
reflects that dependency order.

## Integrated acceptance

The existing collection passes when the outcomes in
[12](12-model-by-model-proof.md) are reproduced, including:

- The dagger's per-edge/per-interval steel, wood and iron surfaces.
- Table, bench and barrel-head seams with shared stations, real
  face detail and valid mating walls.
- Barrel and mug staves with detailed outside and simpler inside.
- Full hoop clearance against finite stave triangles.
- The chair's different upper/lower rear-seat housing profiles.
- The mug's closed liquid cavity derived from twelve separate
  inner-wall meshes, with its current eight morph targets.
- Each model's material/UV/tint, Quad View, scale and GLB behavior.

For general-editing operations, completion means satisfying the
input/output/selection contracts and the edge cases defined in
[10](10-geometry-semantics.md) and [11](11-numerics-and-query-fidelity.md).

One valid example is insufficient to demonstrate a reusable
construction operation. The selected model checks use different
geometries (for example, a grip and a plank for lofting) and test
their actual composed output.

## Implementation integration rules

A new construction operation is incorporated through its authored
geometry output and a model consumer. If it needs surface selection,
UV interpolation, or render compilation, those parts are integrated
in the same implementation slice. The permanent toolbox documentation
describes the operations that actually exist.

No compatibility layer is retained after all its consumers have
migrated and the equivalent shared geometry is working.

Architectural changes during implementation require a concrete
counterexample, such as a valid authored mesh that cannot be expressed
by the agreed input types or a demonstrable topology/precision failure.
The resolution updates the single API contract and every dependent
document in one change.

The architecture above is the baseline for implementation. The
temporary Phoenix documents are removed after their operations and
model migrations are embodied in the code.
