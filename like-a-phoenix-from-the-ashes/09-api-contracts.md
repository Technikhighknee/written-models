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
  from: number;
  to: number;
};

interface BoundaryRef {
  /** Ordered oriented construction vertex IDs, with one edge per pair. */
  vertices: readonly number[];
  closed: boolean;
}

interface GeometryResult {
  geometry: MeshData;
  boundaries: Readonly<Record<string, readonly BoundaryRef[]>>;
  regions: Readonly<Record<string, readonly FaceRef[]>>;
}
```

A boundary name resolves to **a list** of loops or chains. A single
surface region can have several disconnected edges, including hole rims.
`BoundaryRef` refers to one particular chain.

A `FaceRef` or `BoundaryRef` is valid for its owning result. After
a topology-changing operation, use the returned references. Old
numeric indices are never assumed to survive reindexing.

A `MeshData` is accepted directly by core operations that need no
named selections. Operations involving named cuts, fits, or surfaces
use `GeometryResult` when they need to retain those selections.
Geometry edits return fresh arrays and vertices; source geometry
is unchanged.

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
  parameters: readonly number[];
  points: readonly THREE.Vector3Like[];
  closed: boolean;
}

interface PartitionInterface {
  first: BoundaryRef;
  second: BoundaryRef;
  source: SampledBoundary;
}

interface PartitionResult {
  parts: readonly GeometryResult[];
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
  faces: readonly FaceRef[];
  chart: SurfaceChart;
}
```

A shared seam is sampled once. Two adjacent pieces reference the same
sample locations, with deliberate geometric offsets for gaps or relief.
Coordinates alone are not a substitute for consistent subdivisions.

`adaptiveStations(sample, { maxDeviation, knots })` remains the
standard shared sampler. All connected surfaces use the union of
required stations before their faces are built.

## Construction

The geometric controls are explicit. All dimensions below are meters.

```ts
interface ExtrudeOptions {
  frame: THREE.Matrix4; // local 2D profile → construction space
  depth: number;
  caps?: boolean;
  layers?: readonly { position: number; contourOffset: number }[];
}

interface LoftOptions {
  ends?: "open" | "cap";
  sideRegion?: string;
  startRegion?: string;
  endRegion?: string;
}

interface RevolveOptions {
  axisOrigin: THREE.Vector3Like;
  axisDirection: THREE.Vector3Like;
  angle: number; // radians, 2π for a complete revolution
  segments: number;
  caps?: boolean;
}

interface BridgeOptions {
  region?: string;
  reverseWinding?: boolean;
}

interface CapOptions {
  region: string;
  uvFrame: THREE.Matrix4;
  tessellation: "quad-if-planar" | "triangulate";
}
```

```ts
extrudeContour(
  profile: Profile2,
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
  ends?: "open" | "cap";
}): GeometryResult;

revolveProfile(
  meridian: Contour2,
  options: RevolveOptions
): GeometryResult;

bridgeBoundaries(
  from: Contour3,
  to: Contour3,
  options?: BridgeOptions
): GeometryResult;

capBoundary(
  geometry: GeometryResult,
  boundary: BoundaryRef,
  options: CapOptions
): GeometryResult;
```

`ExtrudeOptions` contains depth/direction, oriented frame, layer
sampling, and optional bevel profile. `LoftOptions` contains caps,
correspondence, per-surface mapping, and UV settings. `RevolveOptions`
contains axis, angle, sampling, and end/pole policy.

The normal case for `loftSections` is equal sample counts across
corresponding contours, producing quad side strips. A separate
`bridgeBoundaries` can introduce genuine triangles between differing
densities. Caps follow their own topology rules: planar four-corner
caps can be quads, nonconvex or holed caps need triangulation or
explicit authored patches.

A path sweep produces 3D sections using parallel transport before
calling the same loft machinery.

## Editing

```ts
interface Plane3 {
  point: THREE.Vector3Like;
  normal: THREE.Vector3Like;
}

interface SplitOptions {
  cap: boolean;
  cutRegion: string;
}

type PatchCutOptions =
  | { kind: "recess"; depth: number; wallRegion: string; floorRegion: string }
  | { kind: "opening"; wallRegion: string };

type DeformationField = (
  position: THREE.Vector3Like,
  vertexId: number
) => THREE.Vector3Like; // displacement

interface Ray3 {
  origin: THREE.Vector3Like;
  direction: THREE.Vector3Like;
  maxDistance: number;
}
```

```ts
clipContour(
  profile: Profile2,
  halfPlane: HalfPlane2
): readonly Profile2[];

partitionContour(
  profile: Profile2,
  cuts: readonly PlanarCut2[]
): ContourPartition;

splitByPlane(
  source: MeshData,
  plane: Plane3,
  options: SplitOptions
): PartitionResult;

cutPatch(
  source: GeometryResult,
  patch: SurfacePatchRef,
  outline: Contour2,
  options: PatchCutOptions
): GeometryResult;

deformVertices(
  source: MeshData,
  field: DeformationField
): GeometryResult;

bevelEdges(
  source: GeometryResult,
  edges: readonly EdgeRef[],
  width: ScalarField
): GeometryResult;
```

`PlanarCut2` identifies a named line or sampled curve in the profile's
plane. `ContourPartition` returns planar pieces and their sampled
interfaces, including the two piece indices. Extrusion can consume
each profile directly. Cuts may produce more than one component.

`SurfacePatchRef` selects a connected patch of actual authored
faces and supplies an explicit two-way 2D chart. For a planar
patch, this is a plane-oriented projection. A curved patch needs
its own well-defined chart, with consistent mapping and normals.
An arbitrary collection of faces has no implicit 2D chart.

A 3D split produces cut loops for each result. General solid
booleans use a distinct `booleanSolids` operation and may return
triangulated results. They make no promise of automatic clean
quad retopology.

`DeformationField` takes position, vertex ID, and optional region
weights, and returns displacement. It acts on construction
vertices exactly once.

## Surface queries and fitting

```ts
interface SurfaceTarget {
  geometry: MeshData;
  localToWorld: THREE.Matrix4;
}

interface SurfaceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  face: FaceRef;
  region: string;
  distance: number;
}

interface SurfacePatchHit {
  faces: readonly FaceRef[];
  contact: SurfaceHit;
  frame: THREE.Matrix4;
}

interface SurfaceAttachment {
  target: SurfaceTarget;
  near: THREE.Vector3Like; // world coordinates
}

interface FittedSections {
  sections: readonly [Section3, Section3];
  startPatch: SurfacePatchHit;
  endPatch: SurfacePatchHit;
}

interface BoundaryFitOptions {
  projection:
    | { kind: "ray"; direction: THREE.Vector3Like; maxDistance: number }
    | { kind: "closest"; maxDistance: number };
  sourceLocalToWorld: THREE.Matrix4;
  clearance: number; // signed offset in meters along hit normal
  falloffRings: number;
}

raycastSurface(
  target: SurfaceTarget,
  ray: Ray3
): SurfaceHit | null;

findFacingPatch(
  target: SurfaceTarget,
  point: THREE.Vector3Like,
  direction: THREE.Vector3Like
): SurfacePatchHit;

fitBetweenSurfaces(options: {
  start: SurfaceAttachment;
  end: SurfaceAttachment;
  section: Profile2;
  startingFrame: THREE.Matrix4;
}): FittedSections;

fitBoundary(
  source: GeometryResult,
  boundary: BoundaryRef,
  target: SurfaceTarget,
  options: BoundaryFitOptions
): GeometryResult;
```

`SurfaceAttachment` contains a target and a near-contact point in
world coordinates. `SurfacePatchHit` identifies the actual support
faces, closest chosen contact, and local frame. `FittedSections`
returns two placed 3D sections and their selected support patches.

Plane-fitting intersects the member's individual section corners
along its axis and checks that their actual contact lies inside the
chosen support patch. If an end exceeds a face's footprint, the
fitting operation uses an appropriate larger connected patch or
returns an explicit failure.

Curved-boundary fitting accepts an ordered boundary loop, records
hits for every station, and returns newly displaced geometry.
It can request refinement before projection. It leaves independent
solids topologically independent. Clearance is a signed offset
along the target hit normal, measured in world meters.

Queries operate on authored geometry plus a transform. A triangle
acceleration structure or render-backed ray implementation may be
used internally, without making the caller own a `THREE.Mesh`.

## Rendering and scene attachment

```ts
surfaceMesh(options: {
  name: string;
  geometry: MeshData;
  materials: THREE.Material | Record<string, THREE.Material>;
}): THREE.Mesh;

attachAtFrames(options: {
  parent: THREE.Object3D;
  child: THREE.Object3D;
  parentFrame: THREE.Matrix4;
  childFrame: THREE.Matrix4;
  matingTransform?: THREE.Matrix4;
}): THREE.Object3D;
```

A named anchor resolves to a frame. The shared attachment algorithm
calculates the child transform and prevents scene-parenting cycles.
Geometry fitting happens independently of scene attachment.

`surfaceMesh` calls the one authored-to-render compiler.
`toBufferGeometry` handles triangulation, render vertex splits,
material groups, and mapping back to authored faces for Quad View.

## Conventions

- All length values and geometric tolerances use meters.
- Path parameters and normalized profile fields use `0..1`.
- A coordinate space is specified at every boundary between an
  authored model, a transformed target, and world-space queries.
- Normals transform with the inverse-transpose of the spatial
  transform; reflections also correct winding.
- Source inputs remain unchanged across geometric operations.
- Quads are genuine authored quads; necessary triangles are
  represented as triangles.
- Surface regions and UVs travel with the geometry. A topology edit
  defines UVs and region assignments for each new face.
- Numeric IDs are local to a result; named selections are returned
  by the operation that creates them.
- Renderer and runtime compiler may be highly optimized; they do
  not define construction topology.

The target examples in [08](08-composition-examples.md) use this
vocabulary. Each completed phase of [07](07-implementation-sequence.md)
turns more of these contracts into working code.
