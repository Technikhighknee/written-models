# 11 — Numerical Precision and Query Fidelity

Geometric correctness depends on which values are considered equal,
how curves are sampled, and what the query engine reports. These
rules apply to every model and every geometric operation.

## Coordinates and precision

Authored geometry is constructed using JavaScript's double-precision
numbers. The renderer eventually converts positions to Float32,
which introduces a separate GPU/output precision limit.

The geometry kernel uses a **single explicit precision policy per
operation**:

```ts
interface GeometryPrecision {
  /** Absolute coordinate/contact tolerance in meters. */
  absoluteLength: number;
  /** Relative length tolerance multiplied by relevant geometry extent. */
  relativeLength: number;
  /** Normal/plane orientation tolerance in radians. */
  angle: number;
}

function lengthTolerance(
  precision: GeometryPrecision,
  extentMeters: number
): number {
  return Math.max(
    precision.absoluteLength,
    precision.relativeLength * extentMeters
  );
}
```

Default authoring precision is `absoluteLength = 1e-9` meters,
`relativeLength = 1e-9` and `angle = 1e-7` radians. A caller
can override it for its geometric context. The `extentMeters` is
the extent of the geometry *participating in the operation*,
not the world or scene size.

This tolerance decides proximity, coplanarity, shared-vertex
matching (when explicitly requested), and whether new geometric
features have meaningful dimensions. It does **not** silently
merge independent vertices.

For a generated face, degenerate area detection considers the
face's own edge lengths as well as the effective length tolerance.
A very thin valid feature is handled deliberately, not erased
by a fixed area threshold unrelated to its dimensions.

GPU-export checks use the actual Float32-quantized positions.
A valid double-precision authoring mesh can still be too small
or too distant from its origin to retain its intended detail
after export. The compiler reports this loss of distinction
rather than claiming the exported mesh preserves arbitrary
precision.

## Deterministic construction

With pure geometric input functions, identical dimensions, seed,
contour winding, station parameters and precision policy produce
the same construction positions, face order, surfaces and UVs.
The opaque result-generation tokens are deliberately different.
Arbitrary user callbacks that read nondeterministic external state
cannot satisfy this construction guarantee.

- Sort unordered maps/sets at public geometry boundaries where
  iteration order would otherwise affect the authored result.
- Resolve ties in sampling, face selection, and triangulation
  deterministically.
- Shared edge intersections are evaluated once per undirected
  edge, then reused in all adjacent faces and output pieces.
- A face coplanar with a splitting plane is assigned according to
  incident volume and oriented winding, not duplicated on both
  sides; ambiguous contact-only geometry fails.
- Independent pieces with matching interfaces receive identical
  sample parameter sequences.
- Transformations and deformation never modify the source
  geometry's owned vertices.

The finished render/index layout may be reordered by material
groups or exported atlas optimizations. Determinism of authored
geometry is the relevant promise.

## Adaptive sampling reports what it achieved

The current `adaptiveStations()` samples quarter, half and
three-quarter points and stops after `maxDepth`. Reaching that
limit currently returns stations even if the requested deviation
is still exceeded.

The target sampler returns an explicit result:

```ts
interface StationSamplingResult {
  stations: readonly number[];
  /** Greatest measured departure at the probes actually evaluated. */
  observedMaxDeviation: number; // meters
  /** Intervals where maxDepth stopped further subdivision. */
  saturated: readonly [from: number, to: number][];
}
```

An operation that requests a hard deviation limit rejects a
non-empty `saturated` list when it cannot meet that limit.
An operation allowing approximation can accept the result and
display or retain the measured residual.

Three finite probes do not mathematically bound the deviation
of an arbitrary continuous function. `observedMaxDeviation`
is therefore a **measured** approximation error. Analytic
curve-specific bounds can be added for curve types that support
them, but the generic sampler never reports sampled error as a
proof over all real-valued parameters.

A station list supplied to `sampleProfile` must include every authored
corner in correct cyclic order. It is rejected rather than silently
expanded when a corner is missing, because hidden station insertion
would break adjoining topology. Matching *station values* across two
different contours identify correspondence, not matching 3D positions;
shared geometry is validated after chart evaluation.

When multiple connected surfaces are built, their station results
are merged first. Every consumer uses the merged sorted list
to avoid an edge with a vertex on only one side.

For a periodic path, the parameter `1` is geometrically identical
to `0`. The returned construction rings use station values in
`[0, 1)`; closure shares the first ring's vertex IDs and
explicitly creates its final wrapping strip. This avoids a
duplicate coincident seam loop.

## Query triangles and source-face mapping

The query adapter and the renderer use **the same tessellation
of authored faces**. The triangle generation stage records
provenance before any sorting by material:

```ts
interface AuthoredTriangle {
  vertices: readonly [number, number, number];
  face: FaceRef;
  faceCorners: readonly [number, number, number];
}
```

For a triangle, `faceCorners` is `[0, 1, 2]`. For a quad,
the two triangle records are `[0, 1, 2]` and `[0, 2, 3]`
under the current diagonal convention. If the diagonal policy
changes, both consumers take the change together.

A ray hit carries the source `FaceRef`, its three original
face-corner offsets, and barycentric coordinates. That gives
the caller an unambiguous position for interpolating the
authored face's UVs and other corner data.

Render batching is free to duplicate or reorder GPU vertices.
The query cannot derive authored face IDs by assuming GPU
triangle index order matches `MeshData.quads`.

## Normal orientation has one meaning

The current `MeshSurfaceQuery.cast()` deliberately flips the
triangle normal to face the incoming ray. That is convenient
for some hit tests, but ambiguous for fitting, signed
clearance, and classification.

A new `SurfaceHit.normal` means the **geometric normal of the
authored face according to winding**, transformed to world
space using an inverse-transpose normal matrix. It is independent
of the ray direction.

The hit also includes:

```ts
interface SurfaceHit {
  point: THREE.Vector3;            // world space
  normal: THREE.Vector3;           // geometric world-space normal
  face: FaceRef;
  faceCorners: readonly [number, number, number];
  barycentric: readonly [number, number, number];
  region: string;
  distance: number;                // world meters
  frontFacing: boolean;            // dot(ray, normal) < 0
}
```

A caller needing a normal that faces the ray can explicitly
choose `frontFacing ? normal : -normal`. Fitting uses
the canonical normal for signed clearances. If a model's
surface is intentionally two-sided, the caller chooses
which side should be contacted.

Negative-determinant transforms reverse geometric orientation.
The query adapter and render compiler account for that
when deriving final world-space triangle winding. A zero or
nearly singular transform is invalid as a geometric query target.

Nonplanar quads are triangulated consistently. A query hits
a specific generated triangle and returns that triangle's
geometric normal. Operations requiring a single support
plane verify that every included face lies within the
chosen planarity tolerance.

## Finite contact patches

For a member fitted between supports, every projected section
**boundary segment** must remain within its selected finite
support patch, excluding holes.

Checking corner points alone is insufficient: on a concave
support patch, an edge can pass outside even when both
its endpoints are inside.

Contact supports may be real selected mesh patches or explicitly
authored finite planar footprints. Both must pass the same containment
check; a face-less authored plane cannot return invented face IDs.

The contact solver projects the member's full end outline,
clips or classifies it against the selected support footprint,
and accepts the fit only when the complete outline is inside
within the configured positional tolerance.

For curved fitting, every boundary sample must find a real
hit in range. The resulting projected boundary must be
non-self-intersecting and the incident authored faces must
remain valid. Geometry that would fold or invert returns a
specific failure instead of a distorted mesh.

## Clearance does not classify containment

Finite triangle-surface distance is unsigned. It reports surface
contact/crossing and whether a minimum separation is satisfied,
not whether one closed volume is inside another. Hoops and fitted
bands must also establish their intended exterior-side placement
through their construction policy or a separate oriented solid query.

## Cavity section topology and coordinate frames

Multi-piece cavity extraction intersects source wall faces with section
planes in one rigid section-local frame. At coincident horizontal
source rows, shared edges are collected once. At other heights, a
deterministic half-open plane-intersection rule avoids duplicate hits
at existing vertices and edges. Each section produces exactly one
simple closed loop; successive loops need common winding, equal
vertex counts and correspondence derived from source longitudinal
edges. Missing, branching, self-intersecting, ambiguous or changing
contours fail explicitly.

`CavityRing` positions and heights are local to that frame. Moving or
rotating the finished vessel cannot change its volume calculation.
The frame must be rigid and invertible; non-uniform scaling belongs
to explicit geometry transformation before section extraction.

## Failure behavior

Geometric operations are deterministic functions of their
inputs and either return a valid result within their documented
domain or raise a typed geometric error.

```ts
type GeometryFailure =
  | "invalid-input"
  | "invalid-topology"
  | "degenerate-geometry"
  | "sampling-limit"
  | "no-intersection"
  | "outside-contact-patch"
  | "self-intersection"
  | "unsupported-topology"
  | "precision-loss";
```

The error includes the operation name and relevant selection,
station or face IDs when available. Operations do not silently
substitute a guessed geometry or retessellate an unrelated patch.

This keeps model code free to decide how to respond: change a
design parameter, choose a different geometric operation,
or deliberately omit an optional detail.
