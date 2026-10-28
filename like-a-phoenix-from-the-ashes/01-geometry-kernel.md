# 01 — Geometry Kernel

The kernel is the source of geometric truth. A shape can be built,
edited, queried and rendered without reconstructing its topology
from GPU triangles.

## Representation

We keep the current `MeshData`:

```ts
interface MeshData {
  vertices: THREE.Vector3[];
  quads: QuadFace[];
  triangles?: TriangleFace[];
}
```

Each face has its corner indices, a `surface` string, per-corner
UV coordinates, and optionally `smoothingGroup`.
This is already implemented in `MeshData.ts` and
`AuthoredMeshBuilder.ts`.

A construction vertex is a topological position shared by the faces
that intentionally meet there. UV seams, normal creases and materials
are represented per face or corner, independently from vertex sharing.
Coincident points belonging to separate parts can keep distinct IDs.

### Geometry ownership

Operations produce fresh vertices and face arrays. A builder may mutate
while assembling a result; the result itself is treated as immutable
by later operations.

The current `warpGeometry()` modifies both GPU vertices and the
`MeshData` referenced through a WeakMap. That changes with the
migration: the authored geometry is deformed first, and a new render
mesh is derived from it.

Two geometrically coincident vertices are **not necessarily one
topological vertex**. `AuthoredMeshBuilder` currently welds by rounded
position with a default resolution of `1e-9`. Its target behavior
supports explicit sharing/welding policies:

- Vertices intentionally shared within one solid use the same ID.
- Independent pieces may have coincident positions and separate IDs.
- Position-based welding is an explicit construction choice.
- A later weld/merge operation can join matching boundaries.

This matters for touching parts, overlapping shells, cuts and
intentionally disconnected geometry.

## Topology index

Build one edge/face adjacency index over authored face corners.

```ts
type FaceRef =
  | { kind: "quad"; index: number }
  | { kind: "triangle"; index: number };

interface EdgeUse {
  face: FaceRef;
  from: number;
  to: number;
}

interface TopologyIndex {
  edgeUses(a: number, b: number): readonly EdgeUse[];
  faceNeighbors(face: FaceRef): readonly FaceRef[];
  openBoundaries(): readonly BoundaryRef[];
  regionBoundaries(region: string): readonly BoundaryRef[];
}
```

A directed face edge runs from its current corner to the next one.
The undirected edge key is the sorted pair of IDs.

- **One use**: open boundary.
- **Two opposed uses**: ordinary shared edge.
- **Two same-direction uses**: winding conflict.
- **Three or more uses**: non-manifold edge.

Region boundaries can exist between two adjacent faces with different
surface names even when the mesh is closed. A region may have multiple
disconnected loops and holes.

The index is a read-only view of a specific geometry result. It can
be cached with that result and discarded when geometry changes.
Results are treated as snapshots: callers do not mutate their vectors,
faces or UVs in place, and operations produce new owned geometry.
That rule is necessary for caching geometry queries safely.

### A boundary is an ordered edge chain

```ts
interface BoundaryRef {
  vertices: readonly number[];
  closed: boolean;
}
```

The ordering conveys direction and adjacency. A closed chain's last
vertex connects back to its first. A region name selects faces;
a boundary reference selects the *actual edges* of one chain.

The current `fitBoundaryToSurface()` selects every vertex belonging
to faces named `cap-start` or `cap-end`. That happens to work for
simple end caps, but selecting an entire region is insufficient
for complex patches. The new query extracts exact loops and lets
the caller select the one it intends to fit.

## Results and selections

```ts
interface GeometryResult {
  geometry: MeshData;
  boundaries: Readonly<Record<string, readonly BoundaryRef[]>>;
  regions: Readonly<Record<string, readonly FaceRef[]>>;
}
```

A loft can expose `start` and `end` loops; a hollow extrusion
may expose outer and inner rims; a split can expose several cut
loops per side.

The returned references are valid for that result. An edit that
changes vertex or face indexing emits new references. It carries
selected boundaries or regions forward when their meaning survives,
and exposes newly created ones with names chosen by the operation.

This avoids the current pattern of hiding sampling metadata in
WeakMaps, as `profiledBoard` and `seamedPlankExtrusion` do.
Sampling stations should be returned by their sampling or partition
operation, so neighboring pieces can reuse the actual parameters.

For a geometric operation needing no named boundaries, plain
`MeshData` is sufficient input. A caller can wrap it with empty
selections or use the operation's `GeometryResult`.

## Working on geometry

### Construction

An extrusion, loft, sweep, or revolve produces `MeshData` plus
regions and boundary loops useful for later operations.

### Vertex deformation

`deformVertices()` moves construction vertices and preserves face
indices, UVs, and named selections. The result is rechecked for
collapsed or inverted faces. It can require additional local
subdivision to represent high curvature accurately.

### Topology-changing edits

A split, cut, bevel, or subdivision creates new vertices and faces.
It returns updated selections, real cut regions, and interfaces
specifying the owning part index on each side. A split computes a
crossing edge intersection once and reuses its position on both
resulting pieces. Local face-corner UVs are interpolated separately.

UVs on surviving faces are interpolated at split edges. New cap/wall
faces receive their own UV projection. Region meaning is transferred
or assigned to the new faces.

## Geometry integrity

| Check | Meaning |
| --- | --- |
| Positions | Finite coordinates in meters |
| Faces | Valid indices, distinct corners, nonzero area |
| Face orientation | Consistent winding; mirrored transforms correct it |
| Edges | Open, shared, winding-conflicted, or non-manifold |
| Connectivity | Connected components and ordered boundary loops |
| Surface membership | Every face belongs to a named region |
| Shared interfaces | Same stations on both sides of a joined boundary |
| Render mapping | Every render vertex maps back to its authored source; each query triangle also identifies its original authored face |

These checks are reusable functions. Constructors and editors enforce
the invariants needed for their supported inputs. A model can inspect
topology without involving Three.js materials.

A curved quadrilateral is still a four-corner polygon, but its two
GPU triangles approximate that surface with a fixed diagonal. The
query compiler uses exactly the same diagonal and records which
authored quad generated each hit triangle.
Construction either keeps such quads within a defined planarity
tolerance or subdivides them to represent the desired curvature.
The quad count never conceals a degenerate face.

## Existing implementation retained

- `MeshData.ts` is the canonical authored representation.
- `AuthoredMeshBuilder.ts` supplies face authoring with configurable
  vertex sharing.
- `toBufferGeometry.ts` stays the rendering compiler; its source
  association supports Quad View.
- `controlOutline.ts`, face selection, fitted boundary traversal
  and geometry validity use the same topology index.
- `adaptiveStations.ts` and `stitchPolylines.ts` remain the
  foundation for compatible subdivision and boundary bridging.

Construction operates on fresh authored geometry. The query and
render compilers use one authored-face tessellation and preserve the
face mapping even when rendering reorders material groups. Details
are in [10](10-geometry-semantics.md) and the shared numerical policy
in [11](11-numerics-and-query-fidelity.md).
