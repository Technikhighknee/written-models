# 09 — API Contracts

The toolbox has one construction representation and a small vocabulary
for selecting parts of that geometry. Every geometric operation can
feed another operation.

These are the target TypeScript contracts for this redesign. Their
implementations replace the existing functions in the order described
in [07](07-implementation-sequence.md).

## Authored geometry

Keep the existing `MeshData` representation: shared 3D construction
vertices, authored quads and triangles, per-face-corner UVs, surface
names, and optional smoothing groups.

```ts
type FaceRef =
  | { kind: "quad"; index: number }
  | { kind: "triangle"; index: number };

type EdgeRef = {
  /** The GeometryResult whose edge topology this reference selects. */
  owner: symbol;
  from: number;
  to: number;
};

interface BoundaryRef {
  /** Identity of the GeometryResult that owns this selection. */
  owner: symbol;
  /** Ordered oriented construction vertex IDs, with one edge per pair. */
  vertices: readonly number[];
  closed: boolean;
}

interface GeometryResult {
  /** Opaque identity, fresh for each newly authored result. */
  id: symbol;
  geometry: MeshData;
  boundaries: Readonly<Record<string, readonly BoundaryRef[]>>;
  regions: Readonly<Record<string, readonly FaceRef[]>>;
  /** Valid parameterized patch selections owned by this exact result. */
  patches?: Readonly<Record<string, readonly SurfacePatchRef[]>>;
}

interface EdgeUse {
  face: FaceRef;
  from: number;
  to: number;
}

interface TopologyIndex {
  /** The exact authored result from which this read-only index derives. */
  owner: symbol;
  edgeUses(from: number, to: number): readonly EdgeUse[];
  faceNeighbors(face: FaceRef): readonly FaceRef[];
  openBoundaries(): readonly BoundaryRef[];
  regionBoundaries(region: string): readonly BoundaryRef[];
  connectedComponents(): readonly (readonly FaceRef[])[];
}

/** Builds or retrieves a read-only topology index for this snapshot. */
topologyOf(source: GeometryResult): TopologyIndex;
```

A boundary name resolves to **a list** of loops or chains. A single
surface region can have several disconnected edges, including hole rims.
`BoundaryRef` refers to one particular chain.

A `BoundaryRef`, `EdgeRef` or `SurfacePatchRef` is tied to a
result by its opaque `owner` token. Operations reject selections
whose owner differs from the supplied result's `id`. A `FaceRef` is
a compact face index interpreted only alongside its source
geometry/result.
After any geometry-producing operation, consumers use the returned
selections and IDs. The tokens do not enter GLB.

A `MeshData` is accepted directly by core operations that need no
named selections. Operations involving named cuts, fits, or surfaces
use `GeometryResult` when they need to retain those selections.
Geometry edits deep-copy authored vertex, face, UV and selection
data. A builder may mutate while building, but a returned result is
an immutable-by-contract snapshot: callers must not mutate even
nested THREE vector objects. Topology indexes and query caches are
valid only while this contract holds. To integrate an existing
`MeshData`, the `geometryResult` adapter deep-copies the source
and constructs an owned result with empty named selections.
`regions` is derived from the faces' `surface` values, not an
independent classification that can contradict them.

## Geometry definitions

```ts
interface Contour2 {
  points: readonly THREE.Vector2Like[];
  closed: boolean;
}

interface Contour3 {
  points: readonly THREE.Vector3Like[];
  closed: boolean;
}

interface Profile2 {
  outer: Contour2;
  holes?: readonly Contour2[];
}

interface SampledContour2 {
  /** Closed loop; first point is not repeated at the end. */
  points: readonly THREE.Vector2Like[];
  /** Ordered normalized perimeter stations matching the points. */
  parameters: readonly number[];
}

interface SampledProfile2 {
  outer: SampledContour2;
  holes?: readonly SampledContour2[];
}

interface Section3 {
  outer: Contour3;
  inner?: readonly Contour3[];
}

interface Path3 {
  at(t: number): THREE.Vector3Like;
  tangent(t: number): THREE.Vector3Like;
}

type SectionField = (t: number) => Profile2;
type ScalarField = (t: number) => number;

interface GeometricFrame {
  localToWorld: THREE.Matrix4;
}

interface GeometryPrecision {
  absoluteLength: number; // meters
  relativeLength: number; // multiplied by operation extent
  angle: number;          // radians
}

interface PrecisionOptions {
  precision?: GeometryPrecision; // default policy in document 11
}
```

Planar profiles have 2D coordinates in their own oriented frame.
3D sections contain actual points in their construction space.
`SectionField` is evaluated in frames along a path; `loftSections`
accepts already-positioned 3D sections.

Profiles with holes generate inner walls. Contour correspondence
must be explicit: adjacent sections agree on the count, order,
winding and identity of every matched loop.

Topology transitions (holes appearing, merging, or disappearing)
use separate transitions or explicit patch operations. Continuous
lofting does not invent a mapping between unrelated contours.

## Sampling and boundary sharing

```ts
interface SampledBoundary {
  parameters: readonly number[]; // ordered stations from 0 to 1
  points: readonly THREE.Vector3Like[]; // same order and length
  closed: boolean;
}

interface StationSamplingResult {
  stations: readonly number[];
  observedMaxDeviation: number; // sampled measurements in meters
  saturated: readonly [from: number, to: number][];
}

interface AdaptiveStationsOptions extends PrecisionOptions {
  maxDeviation: number; // meters
  maxDepth?: number;
  knots?: readonly number[];
}

interface PartitionInterface {
  firstPart: number;
  first: BoundaryRef;
  secondPart: number;
  second: BoundaryRef;
  source: SampledBoundary;
}

interface PartitionResult {
  parts: readonly GeometryResult[];
  /** One label per part, matching the parts array. */
  sideOfPart: readonly ("negative" | "positive")[];
  interfaces: readonly PartitionInterface[];
}

interface HalfPlane2 {
  normal: THREE.Vector2Like;
  offset: number;
}

interface PlanarCut2 {
  id: string;
  /** The line or sampled curve used to cut the source profile. */
  points: readonly THREE.Vector2Like[];
}

interface ContourPartition {
  parts: readonly Profile2[];
  interfaces: readonly {
    firstPart: number;
    secondPart: number;
    cutId: string;
    points: readonly THREE.Vector2Like[];
    stations: readonly number[];
  }[];
}

interface SurfaceChart {
  at(uv: THREE.Vector2Like): THREE.Vector3;
  parameterOf(point: THREE.Vector3Like): THREE.Vector2;
  normalAt(uv: THREE.Vector2Like): THREE.Vector3;
}

interface SurfacePatchRef {
  owner: symbol;
  faces: readonly FaceRef[];
  chart: SurfaceChart; // coordinates valid within this patch
}

interface PolarStripOptions extends PrecisionOptions {
  /** Radius/height pairs along an axisymmetric source shape. */
  meridian: readonly THREE.Vector2Like[];
  count: number;
  angleOffset?: number;
  gap?: number; // meters at each reference meridian radius
  // Both sequences include 0 and 1, and may have different densities.
  outerStations: readonly number[];
  innerStations: readonly number[];
  outerRadiusAt(radius: number, height: number, station: number): number;
  innerRadiusAt(radius: number, height: number, station: number): number;
}

interface MeshRegionTarget {
  geometry: MeshData;
  localToWorld: THREE.Matrix4;
  regions: readonly string[];
}

interface CavityRing {
  /** Height in the section frame's local Y, in meters. */
  y: number;
  /** Local XZ polygon: x represents X, y represents Z. */
  outline: readonly THREE.Vector2Like[];
}

interface CavitySectionsOptions extends PrecisionOptions {
  /** Open wall pieces whose combined sections enclose a single contour. */
  pieces: readonly MeshRegionTarget[];
  /** Section-local XZ/Y to world; rigid and invertible. */
  sectionFrame: THREE.Matrix4;
  heights: readonly number[]; // strictly increasing section-local Y heights
}

interface ClearanceOptions extends PrecisionOptions {
  minimum: number;
}

interface ClearanceResult {
  closestDistance: number; // non-negative meters between finite triangle surfaces
  intersects: boolean; // actual surface contact/crossing, not solid containment
  meetsMinimum: boolean; // distance >= requested minimum, within precision
}
```

```ts
adaptiveStations(
  sample: (t: number) => readonly THREE.Vector3Like[],
  options: AdaptiveStationsOptions
): StationSamplingResult;

/** Resamples at exactly these stations; rejects stations omitting an authored corner. */
sampleProfile(
  profile: Profile2,
  stations: {
    outer: readonly number[];
    holes?: readonly (readonly number[])[];
  },
  precision?: GeometryPrecision
): SampledProfile2;

/** Gives an existing authored mesh its own result identity. */
geometryResult(source: MeshData): GeometryResult;
```

The phase-3 supported domain of `partitionContour` is one simple
convex input footprint with noncrossing, boundary-to-boundary
sampled cuts. The cuts may bend, and resulting parts may be concave;
each must be a simple valid profile. Crossing cuts, input holes,
multiple disconnected components and general concave-input
partitioning belong to the later editing extension. A partition
returns opposite interface traversals on its two pieces, but both
derive from identical sampled coordinates and stations. The
part indices in each interface refer to `parts`, not to authored
face IDs.

The `SampledProfile2` used for a filled patch contains exact
ordered boundary stations, including each hole loop independently.
The supplied station sequences must include every original contour
corner and keep its cyclic order. `sampleProfile` rejects a sequence
that omits a corner; it never inserts a new station silently. A
caller merges required stations and corner landmarks first, then
passes the same resolved sampling to adjoining constructions.
Shared boundaries are sampled before patch construction. The fill
operation can refine the interior but does not silently add vertices
to an interface already consumed by a neighboring part. The common
planar triangulator temporarily skips collinear stations only while
choosing triangles, then restores every authored boundary edge.
Interior diagonals are not subdivided by unrelated contour points.

`correspondContours` uses the first supplied landmark as a cyclic seam
for closed contours and preserves the original traversal direction.
Landmark-to-landmark intervals independently use each contour's
arc-length fractions, then merge required corner stations. Returned
landmark indices point into both equally sampled contours. The
operation does not claim that distinct 3D contours coincide in space:
it establishes exactly corresponding stations and retains their
independently authored coordinates.

A shared seam is sampled once. Each interface identifies the owner
of both boundary references with part indices. The pieces reuse
the source stations; gaps or relief are deliberate offsets from that
common seam. A 3D split may yield multiple disconnected parts on
either side; `sideOfPart` identifies their half-space. Paired cut
interfaces refer to exact indices in `parts`.

`adaptiveStations` returns `StationSamplingResult`. A non-empty
`saturated` set signals that recursion stopped while a requested
deviation threshold was still exceeded at sampled probes.
The measured error is not a mathematical guarantee about all
points on an arbitrary curve.

`adaptiveStations(sample, { maxDeviation, knots })` remains the
standard shared sampler. All connected surfaces use the union of
required stations before their faces are built.

## Construction

The geometric controls are explicit. All dimensions below are meters.

Construction-time section shaping uses the following implemented
contract, independent of any board or other model:

```ts
interface CornerTransition {
  corner: number; // original closed-contour vertex index
  before: number; // metres along the incoming edge
  after: number;  // metres along the outgoing edge
  kind: "chamfer" | "round";
  segments?: number; // round: 2..64, chamfer: omitted or 1
}

type SectionEdgeOrigin =
  | { kind: "source"; edge: number }
  | { kind: "transition"; corner: number; segment: number };

interface ShapedSectionContour {
  contour: Contour2;
  edges: readonly SectionEdgeOrigin[]; // ordered, one per emitted edge
}

shapeSectionCorners(
  contour: Contour2,
  transitions: readonly CornerTransition[],
  precision?: GeometryPrecision
): ShapedSectionContour;
```

A selected corner must turn strictly convexly. Adjacent corner
transitions cannot consume the shared edge. Round corners use equal
incoming/outgoing cuts and an actual tangent circular arc. The
operation preserves untouched corners and the source contour winding,
and does not directly edit previously authored mesh topology.

```ts
interface ExtrudeOptions extends PrecisionOptions {
  frame: THREE.Matrix4; // rigid local XY→construction; depth along local +Z
  depth: number; // meters, positive
  caps?: boolean;
  layers?: readonly {
    position: number; // fraction of depth in [0, 1], endpoints included
    contourOffset: number; // signed meters in the local profile plane
  }[];
}

interface LoftFaceContext {
  /** Outer contour = -1; internal contours = 0, 1, ... */
  loop: number;
  edge: number;     // edge connecting successive contour points
  interval: number; // span between adjacent sections
}

interface LoftOptions extends PrecisionOptions {
  ends?: "open" | "cap";
  outerRegion?: string;
  innerRegions?: readonly string[];
  startRegion?: string;
  endRegion?: string;
  surfaceAt?: (face: LoftFaceContext) => string;
  smoothingGroupAt?: (face: LoftFaceContext) => string | undefined;
}

interface RevolveFaceContext {
  meridianInterval: number; // segment between meridian control points
  angularInterval: number; // rotational segment
}

interface RevolveOptions extends PrecisionOptions {
  axisOrigin: THREE.Vector3Like;
  axisDirection: THREE.Vector3Like;
  radialDirection: THREE.Vector3Like; // perpendicular; angular zero and seam
  angle: number; // radians, 2π for a complete revolution
  segments: number;
  /** Close every exposed planar boundary, or reject if impossible. */
  caps?: boolean;
  surfaceAt?: (face: RevolveFaceContext) => string;
  smoothingGroupAt?: (face: RevolveFaceContext) => string | undefined;
  capRegionAt?: (end: "angular-start" | "angular-end" |
    "meridian-start" | "meridian-end") => string;
}

interface BridgeOptions extends PrecisionOptions {
  region?: string; // default "bridge"
  reverseWinding?: boolean;
  // Open contours: exact 0 and 1 endpoints, increasing between.
  // Closed contours: 0 seam and strictly increasing values below 1.
  fromStations: readonly number[];
  toStations: readonly number[];
}

interface CapOptions extends PrecisionOptions {
  region: string;
  uvFrame: THREE.Matrix4;
  tessellation: "quad-if-planar" | "triangulate";
}

interface TipOptions extends PrecisionOptions {
  region: string;
  uvFrame: THREE.Matrix4;
}

interface ContourCorrespondence {
  stations: readonly number[];
  /** Resampled oriented outlines with matching vertex correspondence. */
  first: Contour3;
  second: Contour3;
  landmarks: readonly {
    id: string;
    first: number;
    second: number;
  }[];
}

interface SurfaceFillOptions extends PrecisionOptions {
  /** Fully sampled outer and inner boundaries, in chart coordinates. */
  profile: SampledProfile2;
  chart: SurfaceChart; // may produce a curved/crowned 3D surface
  region: string;
  /** Refines only the interior; boundary stations remain unchanged. */
  maxDeviation?: number;
}

interface GeometryJoinOptions extends PrecisionOptions {
  /** Identical sampled positions, opposite authored edge directions.
   *  Supports closed periodic loops or open boundary chains.
   *  All other vertices remain separate.
   */
  weld: readonly {
    firstPart: number;
    first: BoundaryRef;
    secondPart: number;
    second: BoundaryRef;
  }[];
}
```

```ts
extrudeContour(
  profile: Profile2 | SampledProfile2,
  options: ExtrudeOptions
): GeometryResult;

loftSections(
  sections: readonly Section3[],
  options?: LoftOptions
): GeometryResult;

sweepSection(options: {
  path: Path3;
  sectionAt: SectionField;
  startingFrame: THREE.Matrix4;
  stations: readonly number[];
  closedPath?: boolean;
  ends?: "open" | "cap";
  precision?: GeometryPrecision;
}): GeometryResult;

revolveProfile(
  meridian: Contour2,
  options: RevolveOptions
): GeometryResult;

bridgeBoundaries(
  from: Contour3,
  to: Contour3,
  options: BridgeOptions
): GeometryResult; // named "from" and "to" boundaries

correspondContours(
  first: Contour3,
  second: Contour3,
  landmarks: ContourCorrespondence["landmarks"],
  precision?: GeometryPrecision
): ContourCorrespondence;

fillSurfacePatch(options: SurfaceFillOptions): GeometryResult;

/** Read an ordered construction contour from an operation boundary. */
boundaryContour(
  source: GeometryResult,
  boundary: BoundaryRef
): Contour3;

tipBoundary(
  source: GeometryResult,
  boundary: BoundaryRef,
  point: THREE.Vector3Like,
  options: TipOptions
): GeometryResult;

/** Combines authored faces, welding only designated boundary pairs. */
joinGeometry(
  parts: readonly GeometryResult[],
  options: GeometryJoinOptions
): GeometryResult;

samplePolarStripSections(
  options: PolarStripOptions
): readonly (readonly Section3[])[];

capBoundary(
  geometry: GeometryResult,
  boundary: BoundaryRef,
  options: CapOptions
): GeometryResult;

/** Close one planar outer rim together with its planar inner rims. */
capSectionEnd(
  source: GeometryResult,
  outer: BoundaryRef,
  holes: readonly BoundaryRef[],
  options: CapOptions
): GeometryResult;
```

`extrudeContour` accepts a raw profile or an already sampled one;
when the latter is supplied, it must use the supplied boundary
vertices and station order exactly. This allows a partition's
resolved interface samples to be shared with `fillSurfacePatch`
and neighboring extrusions without a loss of correspondence.

`ExtrudeOptions` extrudes along the frame's local positive Z axis.
Layer positions are normalized depths; their signed contour offsets
are measured in local meters. Offsets must preserve the profile's
valid topology. `LoftOptions` controls caps and per-face material and
smoothing metadata; section correspondence is already resolved in
its input. A revolution interprets each meridian point as
`(radius, axialDistance)` in meters, relative to `axisOrigin`.
`radialDirection`, perpendicular to `axisDirection`, fixes angular
zero, the seam, and the orientation of partial revolutions. Positive
angles follow the right-hand rule around `axisDirection`. Poles use
true triangles; `caps` controls exposed angular/end boundaries.

For an open-path `sweepSection` and for `loftSections`,
omitting `ends` means `"cap"`. Constructors automatically close
only valid planar section boundaries; if a section cannot be capped,
the caller must choose an open end or supply a separate surface
patch. Callers that intend to use `tipBoundary` first construct
an explicitly open end, then connect that boundary to the apex.
For a closed-path sweep, `ends` is inapplicable and must be
omitted. Caps already produced by a constructor are never capped
a second time.

The extrusion frame is rigid and invertible so that `depth`,
layer offsets and profile coordinates remain physical meters;
nonrigid scaling is an explicit later geometry transform.
For revolution, the axis and radial direction must be finite
and nonzero; the radial direction must be perpendicular to
the axis within angular precision.

New revolution cap faces use `capRegionAt` when supplied,
otherwise the default `"cap"` surface label. Cap material regions
do not depend on the meridian side callback's unrelated face indices.

For `revolveProfile`, an open meridian may start or end on the
rotation axis, producing real pole triangles. A cyclic positive-
radius meridian wraps through its closing segment. These two
cases follow the input contour's `closed` flag and never insert
duplicate coincident pole or seam vertices. For partial angular
revolutions, `caps: true` closes all genuinely planar exposed
boundary loops; unsupported/nonplanar boundaries fail instead of
being bridged arbitrarily. `caps` defaults to false. The revolved
surface and smoothing assignments are controlled independently per
meridian and angular interval, retaining the existing lathe's
outer, inner, rim and floor segments.

The normal case for `loftSections` is equal sample counts across
corresponding contours, producing quad side strips. Its outer and
inner contours can have distinct surface regions, and every
contour carries an explicit winding and seam correspondence. A separate
`bridgeBoundaries` can introduce genuine triangles between differing
densities. It uses actual ordered sample station parameters instead
of inferring correspondence solely from vertex counts. Caps follow their own topology rules: planar four-corner
caps can be quads, nonconvex or holed caps need triangulation or
explicit authored patches.

Loft side regions and smoothing can vary independently by contour
edge and longitudinal interval. The dagger's sharp edge strips,
ricasso and iron/wood grip spans therefore share one loft engine.
An interval boundary must coincide with an authored station.

`tipBoundary` creates genuine triangles connecting an existing ring
to an explicit apex. `correspondContours` matches landmark features
of differing top/bottom contours, creates shared *semantic* stations
between matched landmarks (not independent normalized arc lengths),
and returns both resampled 3D outlines. Their vertices correspond by
index so the general loft can connect them.
`fillSurfacePatch` creates an authored surface from a 2D footprint,
including crowned interiors and a boundary that matches the side
geometry. It uses quads on compatible regular grids and genuine
triangles at irregular trims and holes.

`joinGeometry` combines separate authored pieces and intentionally
shares vertices only along specified matching boundary pairs.
For each pair it requires identical ordered sample counts, consistent
positions within tolerance and opposite boundary winding. Each
input boundary edge can be paired at most once. Repeated or overlapping
welds, globally inconsistent vertex matches, duplicate coincident
faces and nonmanifold vertex fans are rejected. The result remaps all
face regions and still-meaningful boundaries into its new indices.

`boundaryContour` extracts the ordered 3D points of a selected
authored boundary. The produced construction results have
predictable named outputs:

| Operation | Named output |
| --- | --- |
| `loftSections(..., { ends: "open" })` | `boundaries.start` and `boundaries.end` |
| `fillSurfacePatch` | `boundaries.rim`, `patches.surface[0]`, `regions[region]` |
| `bridgeBoundaries` | `boundaries.start` and `boundaries.end` |
| `tipBoundary` | New triangular tip faces in the selected region |
| `joinGeometry` | Remapped regions, surviving boundaries and valid patch selections |

A `SurfacePatchRef` returned for a filled patch maps its authored
chart to those exact faces. `shapeSurfaceRelief` takes that selection
and returns updated face/region/boundary references. A patch chart is
retained only when its two-way mapping still describes the selected
faces, including their new shape; unchanged face indices alone are
not sufficient.

Joining the crowned top, lower patch and profile-layer walls creates
a connected solid with explicitly shared vertices.

`samplePolarStripSections` returns radial strip cross-sections
described by the same `Section3` type used by all lofts. Its
outer/inner open rows are combined into one closed profile contour;
the precise per-edge surface classification distinguishes the
outer face, inner face and both connecting sides.

For a sweep, the `startingFrame` is rigid: its origin equals
`path.at(0)` within precision, its local +Z agrees with the
nonzero forward `path.tangent(0)`, and local +X/+Y define
the section's physical profile axes and roll. Inconsistent
starting frames and zero tangents are invalid rather than
silently adjusted. Subsequent section frames use parallel
transport along the same forward path; section profiles must
have consistent loop correspondence and remain nondegenerate.
A sweep constructs faces using those transported sections before
calling the same loft engine. For `closedPath: true`, position
and tangent are periodic, the stations occupy `[0, 1)`, frame
transport closes without residual seam twist, and the final
wrapping strip shares the original first-ring vertices.
`ends` applies only to open paths.

## Editing

```ts
interface Plane3 {
  point: THREE.Vector3Like;
  normal: THREE.Vector3Like;
}

interface SplitOptions extends PrecisionOptions {
  cap: boolean;
  cutRegion: string;
}

interface RecessOptions extends PrecisionOptions {
  depth: number; // positive depth into the selected surface
  wallRegion: string;
  floorRegion: string;
}

interface ThroughCutOptions extends PrecisionOptions {
  wallRegion: string;
  entry: { patch: SurfacePatchRef; contour: Contour2 };
  exit: { patch: SurfacePatchRef; contour: Contour2 };
}

type DeformationField = (
  position: THREE.Vector3Like,
  vertexId: number
) => THREE.Vector3Like; // displacement

interface SurfaceReliefFeature {
  path: SampledBoundary;
  /** Physical half-width at a normalized location along the path. */
  halfWidthAt(t: number): number;
  /** Signed normal displacement, with u in [-1,1] across the path. */
  displacementAt(u: number, t: number): number;
  /** Name generated shoulder/floor faces where relevant. */
  regionAt?(u: number, t: number): string;
}

interface SurfaceReliefOptions extends PrecisionOptions {
  /** How overlapping signed feature fields are combined. */
  overlap: "minimum" | "sum";
  /** Sampled interior chord/centroid deviation, default 0.005 metres.
   *  Boundary edges are never subdivided by this operation.
   */
  maxDeviation?: number;
}

interface Ray3 {
  origin: THREE.Vector3Like;
  direction: THREE.Vector3Like;
  maxDistance: number;
}

type BooleanOperation = "union" | "intersection" | "difference";

interface BooleanOptions extends PrecisionOptions {
  /** Explicit source-independent classification of output triangles. */
  regionAt(point: THREE.Vector3Like, normal: THREE.Vector3Like): string;
  /** UV coordinates for each generated face corner. */
  uvAt(
    point: THREE.Vector3Like,
    normal: THREE.Vector3Like,
    region: string
  ): THREE.Vector2Like;
}
```

```ts
clipContour(
  profile: Profile2,
  halfPlane: HalfPlane2,
  precision?: GeometryPrecision
): readonly Profile2[];

partitionContour(
  profile: Profile2,
  cuts: readonly PlanarCut2[],
  precision?: GeometryPrecision
): ContourPartition;

splitByPlane(
  source: MeshData | GeometryResult,
  plane: Plane3,
  options: SplitOptions
): PartitionResult;

openPatch(
  source: GeometryResult,
  patch: SurfacePatchRef,
  outline: Contour2,
  precision?: GeometryPrecision
): GeometryResult;

recessPatch(
  source: GeometryResult,
  patch: SurfacePatchRef,
  outline: Contour2,
  options: RecessOptions
): GeometryResult;

cutThrough(
  source: GeometryResult,
  options: ThroughCutOptions
): GeometryResult;

deformVertices(
  source: MeshData | GeometryResult,
  field: DeformationField,
  precision?: GeometryPrecision
): GeometryResult;

transformGeometry(
  source: MeshData | GeometryResult,
  localToDestination: THREE.Matrix4,
  precision?: GeometryPrecision
): GeometryResult;

subdivideEdges(
  source: GeometryResult,
  splits: readonly { edge: EdgeRef; t: number }[],
  precision?: GeometryPrecision
): GeometryResult;

bevelEdges(
  source: GeometryResult,
  edges: readonly EdgeRef[],
  width: ScalarField,
  precision?: GeometryPrecision
): GeometryResult;

booleanSolids(
  first: MeshData,
  second: MeshData,
  operation: BooleanOperation,
  options: BooleanOptions
): GeometryResult;

/** Surface-local groove while retaining the underlying part contact. */
shapeSurfaceRelief(
  source: GeometryResult,
  patch: SurfacePatchRef,
  features: readonly SurfaceReliefFeature[],
  options: SurfaceReliefOptions
): GeometryResult;
```

`PlanarCut2` identifies a named line or sampled curve in the profile's
plane. `ContourPartition` returns planar pieces and their sampled
interfaces, including the two piece indices. Extrusion can consume
each profile directly. The initial noncrossing-cut domain produces
one simple piece per partition region (which may be concave);
disconnected/multi-component results belong to the Phase 6 extension.

`SurfacePatchRef` selects a connected patch of actual authored
faces and supplies an explicit two-way 2D chart. For a planar
patch, this is a plane-oriented projection. A curved patch needs
its own well-defined chart, with consistent mapping and normals.
An arbitrary collection of faces has no implicit 2D chart.

`shapeSurfaceRelief` takes all seam/wear/detail features for one
connected patch **in a single call**. It merges their required
sample stations and constructs the final patch once. With
`overlap: "minimum"`, overlapping negative relief fields select
the deepest displacement; `"sum"` permits intentionally
combined deformations. Both are deterministic. New shoulder,
groove and floor regions become authored faces. The underlying
mating surfaces remain intact when the feature depth fits
the available thickness. Relief on a shared outer rim must have
zero displacement at that rim and may be clipped to the interior
side of the boundary. A groove along a seam is thus an inward,
one-sided feature unless the caller rebuilds the wall and adjoining
parts using a new shared boundary. No patch edit may silently
move or resample a welded interface. A patch whose chart is no
longer valid must be respecified from the returned geometry before
another parameterized edit.

An `openPatch` removes faces and leaves an open rim. A
`recessPatch` inserts walls and a floor. Both work on regular
curved charts as well as planes, retaining prescribed boundary
stations. A curved recess creates a local-normal offset floor
with its own invertible chart; chart folds and underresolved
rims fail explicitly. `cutThrough` connects
two compatible openings across an existing solid with actual
interior walls; its two patches must admit a consistent correspondence.
Other through-cuts use an explicit solid boolean.

A 3D split assigns every connected output component to its
negative or positive half-space and pairs the relevant cut loops.
`booleanSolids` accepts two oriented manifold solids and returns
the actual generated triangle faces. Its output surface names
and UVs come from explicit caller-provided functions: the boolean
kernel does not magically recover authored faces or their
original UV seams. General automatic quad retopology is outside
this operation.

`subdivideEdges` accepts oriented owned edge selections and strict
interior parameters, merged by undirected source edge. Every
incident face receives the same new position and its own
interpolated UVs, with no hanging vertices.

The implemented `bevelEdges` supports one complete ordered
3/4-edge convex cap boundary on a prismatic manifold section,
several independent complete rings, one isolated open manifold
edge shared by two convex planar faces, or two/three consecutive
open edges around one planar convex cap whose intermediate
corners are trihedral. Open chains use a shared miter edge at
each supported corner; terminal triangles occur only at the
true endpoints. A `ScalarField` samples normalized arc length
across an entire open chain or separately for each closed ring.
Unsupported higher-valence or branched junctions, nonconforming
side offsets and excessive widths are rejected.

`DeformationField` takes position and vertex ID, and returns a
displacement. Region-aware weights may be composed into that field
by its caller. It acts on construction vertices exactly once.

## Surface queries and fitting

```ts
interface SurfaceTarget {
  geometry: MeshData;
  localToWorld: THREE.Matrix4;
}

interface SurfaceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3; // geometric world-space normal, not ray-facing
  face: FaceRef;
  faceCorners: readonly [number, number, number];
  barycentric: readonly [number, number, number];
  region: string;
  distance: number;
  frontFacing: boolean;
}

interface SurfacePatchHit {
  faces: readonly FaceRef[];
  contact: SurfaceHit;
  frame: THREE.Matrix4;
}

interface AuthoredPlanarSupport {
  /** Maps a local XY footprint into world space; local +Z is its normal. */
  frame: THREE.Matrix4;
  footprint: Profile2; // finite, with optional holes, in frame-local meters
}

type SurfaceAttachment =
  | { target: SurfaceTarget; near: THREE.Vector3Like; authoredPlane?: never }
  | { authoredPlane: AuthoredPlanarSupport; near: THREE.Vector3Like; target?: never };

type FittedContact =
  | { kind: "surface"; patch: SurfacePatchHit }
  | { kind: "authored-plane"; support: AuthoredPlanarSupport;
      point: THREE.Vector3; normal: THREE.Vector3 };

interface FittedSections {
  sections: readonly [Section3, Section3]; // world coordinates
  startContact: FittedContact;
  endContact: FittedContact;
}

interface BoundaryFitOptions extends PrecisionOptions {
  projection:
    | { kind: "ray"; direction: THREE.Vector3Like; maxDistance: number }
    | { kind: "closest"; maxDistance: number };
  sourceLocalToWorld: THREE.Matrix4;
  clearance: number; // signed offset in meters along hit normal
  falloffRings: number;
}

raycastSurface(
  target: SurfaceTarget,
  ray: Ray3,
  precision?: GeometryPrecision
): SurfaceHit | null;

findFacingPatch(
  target: SurfaceTarget,
  point: THREE.Vector3Like,
  direction: THREE.Vector3Like,
  precision?: GeometryPrecision
): SurfacePatchHit;

fitBetweenSurfaces(options: {
  start: SurfaceAttachment;
  end: SurfaceAttachment;
  section: Profile2;
  referenceDirection: THREE.Vector3Like; // fixes rotation around member axis
  precision?: GeometryPrecision;
}): FittedSections;

fitBoundary(
  source: GeometryResult,
  boundary: BoundaryRef,
  target: SurfaceTarget,
  options: BoundaryFitOptions
): GeometryResult;
```

For `findFacingPatch`, `direction` is the desired outward
world-space face orientation, not a raycast direction. The
function selects the nearest actual point on a matching planar
triangle and expands across connected, coplanar authored faces.
It does not follow nonplanar edges or join disconnected islands.
The returned frame has an orthonormal basis and local +Z along
the winding-based face normal. The contact distance is the
Euclidean distance from `point` to the nearest finite triangle,
including when the nearest point lies on the footprint boundary.
This is selection, not yet proof that a full member section fits.
That proof must also check its projected edges and interior
against concavities and holes.

A `SurfaceAttachment` selects either actual authored target faces
or an explicitly authored **finite** planar support, and supplies
a near-contact point in world coordinates. `SurfacePatchHit`
identifies actual support faces, contact and frame. A planar
support's frame and footprint define a real bounded region with
holes, not an infinite plane. `FittedSections` returns two placed
3D sections and a `FittedContact` for each end. Both contact kinds
go through the same finite-footprint and section-fitting algorithm.

The finite-fitting implementation now shares one support resolution
path for both contact variants. An authored plane is first triangulated
from its actual `Profile2` footprint, including holes. Its frame must
be rigid and right-handed, with local +Z pointing from the support
toward the member. A geometry-selected patch instead supplies its
connected authored triangles and geometric normal. Both are projected
into their respective contact frames, then compared against the
**entire filled member section** by triangle intersection area.
This detects a concave crossing even when all member corners touch
the support, and detects a support hole fully enclosed by the member
outline. Returned `FittedContact.kind` records which kind was used.

The member axis runs between the intended joint locations.
`referenceDirection` is projected perpendicular to that axis to
orient the cross-section; a parallel hint is invalid. The fitted
sections are returned in world coordinates, ready to be converted
to the model's assembly space with a geometry transform.

Plane-fitting intersects the section's outer and inner loops
along the member axis. The entire projected outline, including
all edge segments, must remain inside the finite support footprint
and outside its holes. This is stricter than testing only vertices:
an edge joining two interior points can leave a concave patch.
The caller can explicitly select a different support patch.

Curved-boundary fitting (`fitBoundary`) accepts an owned,
ordered open or closed edge chain, records target contacts for each
existing vertex and returns a new `GeometryResult`. The source
and target have independent local-to-world transforms; the output
remains in source-local coordinates. Ray projection travels only
forward along the requested direction, with the nearest front-facing
intersection and finite maximum travel. Closest projection uses the
nearest finite authored triangle and rejects contacts approached
from its back side. Signed clearance is applied along the target's
winding-based world normal, never along global Z or automatically
along the ray.

Falloff blends the fitted displacement over an authored-edge graph,
limited to the requested number of rings. Vertices belonging to
independent named or actual open rims are protected; a shared
vertex explicitly selected by the fitted chain necessarily moves
with that chain. All selected stations remain present, with no new
subdivisions, face IDs or UV seams. After fitting, face orientation,
contact tolerance and independent boundary preservation are
validated in world space. Surface charts invalidated by arbitrary
curved deformation are discarded and named selections receive
new owners.

This is contact, not a Boolean union or weld. Refinement and
shared-interface propagation must be performed before fitting;
the function does not invent intermediate contact stations or
guarantee that the continuous *unsampled* source rim conforms to
the continuous target between authored vertices.

Queries operate on authored geometry plus a transform. A triangle
acceleration structure or render-backed ray implementation may be
used internally without requiring callers to own a `THREE.Mesh`.

```ts
/** Full finite triangle-surface clearance; detects intersections. */
surfaceClearance(
  first: SurfaceTarget,
  second: SurfaceTarget,
  options: ClearanceOptions
): ClearanceResult;

/** Ordered cavity sections from an assembled set of inner wall regions. */
cavitySectionsFromSurfaces(
  options: CavitySectionsOptions
): readonly CavityRing[];
```

The cavity source may contain **separate** meshes. Each piece's
local-to-world transform and the inverse of the explicit section
frame place selected wall faces into a common section-local
coordinate system. The supported wall topology consists of
longitudinal strips with two authored horizontal row edges and two
longitudinal edges. Authored planar quads and *unambiguously paired*
coplanar triangles are valid. Nonplanar quads and ambiguous triangle
pairings fail instead of replacing their actual geometry with a
false planar loft.

At any requested Y height, each strip contributes the section
segment from its real longitudinal edges. Coincident row segments
from the two height intervals of the *same* piece are deduplicated,
while doubled geometry without matching row provenance is rejected.
Separate pieces meet only when their authored seam columns agree
spatially within the operation's length tolerance. Each section
must form exactly one ordered, simple closed XZ polygon. The first
ring defines the seam and winding; subsequent sections retain the
same longitudinal column IDs and edge adjacency. Missing, branching,
doubled, disconnected and crossing contours fail explicitly.

All authored height rows within the requested interval must be
included, otherwise piecewise-linear volume interpolation would
silently remove real bulges. In addition to checking the individual
rings, interpolation is validated across the full interval by
isolating quadratic orientation events of moving edges, not only
sampling a few intermediate heights. The resulting rings can be
passed to `ProfiledCavity` directly, including their real polygonal
perimeters, without a model-specific circular approximation.

The section frame must be rigid and invertible; reflected frames
are supported and output winding is normalized in section-local
XZ coordinates. Source geometry may be placed by affine
local-to-world transforms. The caller positions the liquid assembly
using the same section frame.

General unstructured triangular meshes without longitudinal
correspondence are explicitly unsupported: recovering their
sections requires different station/topology-transition semantics,
not an invented correspondence or hidden resampling.

`surfaceClearance` checks actual finite triangles, including their
interiors and edges. It is usable after a circular-band sweep to
verify that a band which clears a profile at its sampled vertices
also clears the real faceted supporting surface between samples.

The implemented surface queries expose these complementary contracts:

```ts
interface ExteriorPlacementResult {
  exterior: boolean;
  intersects: boolean;
  ambiguous: boolean;
  minimumSignedDistance: number;
}

verifyExteriorPlacement(
  candidate: SurfaceTarget,
  support: SurfaceTarget,
  options: ClearanceOptions
): ExteriorPlacementResult;
```

`surfaceClearance` checks the triangle interiors and edges as well
as their vertices. This catches a circular band whose sampled outer
stations clear a faceted barrel but whose straight segments cross
the barrel between stations. Coplanar overlaps, skew edge distances,
and actual intersection between two triangle interiors are included.
The overlap test uses the same authored triangulation as rendering.

`verifyExteriorPlacement` makes the separate orientation check:
it rejects surface intersections, measures the side of the nearest
oriented support triangles for all candidate vertices, edge
midpoints and face centroids, and rejects ambiguous nearest
normals. This is an outward-side placement diagnostic for the
authored surface; for an open or nonmanifold support it cannot
prove solid containment. The query does not silently interpret
a positive unsigned distance as evidence of an exterior band.

`surfaceClearance` measures the closest points of the two finite
triangle surfaces, not their volumes. `minimum` must be non-negative.
Actual touching or crossing triangles report `intersects: true`
and zero distance; nested but non-touching closed solids are not a
surface intersection. Minimum unsigned surface distance does not
classify which side of an oriented solid a second object occupies.
An exterior-fitting construction must separately establish its
intended outward placement, not infer it from `meetsMinimum`. `meetsMinimum` checks the requested threshold
using operation precision. Callers wanting *solid* overlap
classification must use a solid-specific query.

The query and renderer share the triangulation of each authored face.
A query triangle records its originating `FaceRef` and the three
face-corner offsets. Barycentric coordinates provide interpolation
of the original face-corner UVs. `normal` follows geometric winding
and never flips merely to face the ray; `frontFacing` reports which
side was hit.

## Authored face classification

```ts
interface AuthoredFaceInfo {
  face: FaceRef;
  surface: string;
  smoothingGroup?: string;
  centroid: THREE.Vector3; // construction-local meters
  normal: THREE.Vector3;   // normalized area-weighted authored-triangle normal
}

interface FaceMetadata {
  surface: string;
  smoothingGroup?: string;
}

classifyAuthoredFaces(
  source: MeshData | GeometryResult,
  classify: (face: AuthoredFaceInfo) => FaceMetadata
): GeometryResult;
```

The classifier sees authored faces (not sorted render triangles)
and produces their complete semantic surface/smoothing metadata.
It leaves geometry connectivity, vertex positions and corner UVs
unchanged, emits a fresh owned result, rebuilds named regions
from its final face labels, and remaps surviving boundaries and
patches. A chart remains valid because its geometry and face
membership did not change. Face normals/centroids are evaluated in construction coordinates.
A nonplanar authored quad gets its representative face normal from
the area-weighted, winding-consistent sum of its two shared render
triangles; queries still return the particular hit triangle's normal.
Degenerate or folded faces with an undefined normal are rejected.
This is the common replacement for GPU-index-group classification
and enables end-grain, long-grain, cut-face and material-boundary
selection without a renderer dependency.

## Rendering and scene attachment

```ts
surfaceMesh(options: {
  name: string;
  geometry: MeshData | GeometryResult;
  materials: THREE.Material | Readonly<Record<string, THREE.Material>>;
  capMaterial?: THREE.Material;
  tint?: THREE.ColorRepresentation; // materials must enable vertexColors
}): THREE.Mesh;

offsetMeshUvs(
  source: MeshData | GeometryResult,
  u: number,
  v: number
): GeometryResult;

type AuthoredUvProjector = (
  position: THREE.Vector3Like,
  face: FaceRef,
  corner: number
) => THREE.Vector2Like;

interface AuthoredUvProjectionOptions extends PrecisionOptions {
  faces?: readonly FaceRef[];
  surfaces?: readonly string[];
}

projectAuthoredUvs(
  source: MeshData | GeometryResult,
  project: AuthoredUvProjector,
  options?: AuthoredUvProjectionOptions
): GeometryResult;

planarUvProjector(
  frame: THREE.Matrix4,
  offset?: THREE.Vector2Like,
  precision?: GeometryPrecision
): AuthoredUvProjector;

attachAtFrames(options: {
  parent: THREE.Object3D;
  child: THREE.Object3D;
  parentFrame: THREE.Matrix4;
  childFrame: THREE.Matrix4;
  matingTransform?: THREE.Matrix4;
}): THREE.Object3D;
```

UV projection acts on authored face corners. Select exactly one of
`faces` or `surfaces`, or omit both to project all faces.
A rigid `planarUvProjector` frame produces physical meter coordinates
and snapshots its inverse; the offset is expressed in the same
physical units. Source meshes and unrelated face UVs remain unchanged.
New results keep valid owned boundary and patch selections.

`parentFrame` is expressed in the parent's local coordinates;
`childFrame` is expressed in the child's local coordinates.
The child-in-parent transform is
`parentFrame * matingTransform * inverse(childFrame)`.
Mating rotation is explicit. The attachment operation applies the
result to the scene object and checks for hierarchy cycles.

`attachAtFrames` is the only scene attachment equation. Existing
`attachByFrames` delegates with identity mating; `attachByAnchors`
converts its nested source anchor to the child's local frame and
delegates with an explicit half-turn mating rotation. New
`frameFromAncestor`, `frameToWorld` and `frameToLocal` convert
frames without changing parentage. Frame input, invertibility,
cycle and scene-TRS representability are checked before mutating
the hierarchy; a general sheared matrix cannot be silently
decomposed into Object3D's position/quaternion/scale fields.

Geometry fitting remains independent of scene parenting.

Rendering can apply a model-wide tint after converting authored
geometry. That tint is stored in GPU vertex colors and exported
with the material, as current oak recipes require. UV offsets are
applied through an authored **non-mutating** `offsetMeshUvs` edit;
callers use its returned geometry. These operations have separate
responsibilities from the underlying mesh topology.

`surfaceMesh` calls the one authored-to-render compiler.
`toBufferGeometry` handles triangulation, render vertex splits,
material groups, and mapping back to authored faces for Quad View.

## Error contract

```ts
type GeometryFailure =
  | "invalid-input" | "invalid-topology" | "degenerate-geometry"
  | "sampling-limit" | "no-intersection" | "outside-contact-patch"
  | "self-intersection" | "unsupported-topology" | "precision-loss";

interface GeometryOperationError extends Error {
  operation: string;
  reason: GeometryFailure;
  context?: {
    face?: FaceRef;
    vertex?: number;
    station?: number;
    boundary?: string;
  };
}
```

The supported-domain contract of an operation is either a complete,
valid result or a typed `GeometryOperationError`. Callers can recover
by choosing alternative geometry or changing inputs. Tolerances do not
trigger silent vertex welding or arbitrary retopology.

## Coordinate space conventions

| Operation | Input coordinates | Output coordinates |
| --- | --- | --- |
| `sampleProfile`, `partitionContour` | Planar 2D profile | Planar 2D profile |
| `loftSections`, `bridgeBoundaries`, `joinGeometry` | One shared construction-local 3D frame | Same construction-local frame |
| `fillSurfacePatch`, patch editing | Chart-local 2D outline + chart evaluating into construction-local 3D | Construction-local 3D |
| `sweepSection` | Profile-local 2D + path and frame in construction-local 3D | Construction-local 3D |
| `revolveProfile` | 2D (radius, height) meridian and construction-local axis/origin/radial direction | Construction-local 3D |
| `splitByPlane`, `booleanSolids` | Plane/operands in the same construction-local 3D frame | Same construction-local 3D frame |
| `transformGeometry` | Construction-local 3D + explicit mapping | Destination-local 3D |
| Surface queries, clearance and fitting | `SurfaceTarget` carries local→world; authored planar supports and ray/near/directions are world-space | World-space hits and fitting sections |
| `attachAtFrames` | Parent and child frames in their respective object-local spaces | Child transform in parent space |
| `cavitySectionsFromSurfaces` | Piece-local geometry and local→world transforms, plus section-local frame | `CavityRing` in section-frame Y/XZ coordinates |

For `booleanSolids`, `regionAt` and `uvAt` receive point and normal
in the common local frame of both operands. The inputs are required
to share this frame; transform them explicitly before calling.

A `SurfaceChart` returns construction-local 3D points from its
chart-local 2D coordinates. Its inverse receives construction-local
positions. A planar chart's 2D coordinates also provide the
physical-scale UV mapping for new patches; model UV offsets apply
after construction.

## Conventions

- All length values and geometric tolerances use meters.
- Path parameters and normalized profile fields use `0..1`.
- Coordinate spaces are defined by the table above, including
  the physical units of chart coordinates and Boolean callbacks.
- Normals transform with the inverse-transpose of the spatial
  transform; reflections also correct winding.
- Source inputs remain unchanged across geometric operations.
- Quads are genuine authored quads; necessary triangles are
  represented as triangles.
- Surface regions and UVs travel with the geometry. A topology edit
  defines UVs and region assignments for each new face.
- Numeric IDs are local to a result; named selections are returned
  by the operation that creates them.
- Position-based welding is explicit. Independent coincident pieces
  have distinct topology unless deliberately joined.
- Linear tolerances are in meters, angular tolerances in radians and
  area thresholds in square meters. Operations use the shared default
  `GeometryPrecision` or an explicit per-operation override. The
  relevant extent belongs to the geometry participating in the call.
- Render/export precision is assessed separately from authoring
  precision after Float32 conversion.
- Renderer and runtime compiler may be highly optimized; they do
  not define construction topology.

The target examples in [08](08-composition-examples.md) use this
vocabulary. [10](10-geometry-semantics.md) defines operation behavior;
[11](11-numerics-and-query-fidelity.md) fixes precision, source-face
mapping and failure semantics. The milestones in
[07](07-implementation-sequence.md) implement these contracts.
