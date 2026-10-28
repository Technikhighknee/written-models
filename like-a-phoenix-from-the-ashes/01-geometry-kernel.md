# 01 — Geometry Kernel

The kernel is the common representation of shapes as they are constructed,
edited, queried, and combined.

## Canonical representation

Keep the current `MeshData` concept:

```ts
interface MeshData {
  vertices: THREE.Vector3[];
  quads: QuadFace[];
  triangles?: TriangleFace[];
}

interface QuadFace {
  corners: [number, number, number, number];
  uvs: [Vector2, Vector2, Vector2, Vector2];
  surface: string;
  smoothingGroup?: string;
}
```

The actual `TriangleFace` has the same metadata with three corners.
A vertex ID refers to a construction position. Different UVs, materials,
and smoothing groups may share that position. The vertex is duplicated
only when preparing the renderer's attributes.

This representation is already real in
`geometry/mesh/MeshData.ts`, `AuthoredMeshBuilder.ts`, and
`toBufferGeometry.ts`. Extend it without requiring a new modeling
kernel or a class hierarchy for every shape.

### Geometry rules

- Coordinates are finite and expressed in meters.
- A face references three or four distinct vertices, with valid winding
  and nonzero geometric area.
- UV coordinates live **per face corner**. A UV seam does not split a
  construction vertex.
- Each face identifies its surface region. These regions describe
  the role of the surface (for example `outer`, `inner`, `cut`,
  or `end`); the model maps regions to materials.
- A smoothing group controls normal continuity in the rendering
  conversion, independently of topology.
- Open surfaces and complete solids use the same `MeshData` type.
  Closedness is determined by topology.

### Read-only topology queries

Build an edge index from the face-corner arrays:

```ts
type EdgeKey = readonly [lowVertexId: number, highVertexId: number];

interface EdgeUse {
  face: FaceRef;
  from: number;
  to: number;
}

interface TopologyIndex {
  uses(edge: EdgeKey): readonly EdgeUse[];
  neighbors(face: FaceRef): readonly FaceRef[];
  boundaryLoops(): readonly BoundaryLoop[];
  regionFaces(name: string): readonly FaceRef[];
  regionBoundary(name: string): readonly BoundaryLoop[];
}
```

`FaceRef` identifies a quad or triangle by collection and index.
`BoundaryLoop` is an ordered sequence of directed edges or vertex IDs,
with explicit closed/open state.

An edge appearing once is an open-mesh boundary. Two opposing uses form
a regular interior edge. More than two uses are non-manifold. The index
detects winding conflicts and T-junction candidates before a later
operation compounds the problem.

Adjacency is computed when requested and cached only for a particular,
unchanged `MeshData` instance. Operations return fresh geometry; there
is no mutable global mesh registry.

### Boundaries as usable outputs

Surface names alone cannot identify every boundary precisely: the existing
`fitBoundaryToSurface()` gathers *every vertex of each face* in a named
surface. A rectangular cap works because that region contains only its end;
a complex region needs an exact edge-loop selection.

Introduce explicit boundary references in operation results:

```ts
interface GeometryResult {
  geometry: MeshData;
  boundaries: Readonly<Record<string, BoundaryLoop>>;
  regions: Readonly<Record<string, readonly FaceRef[]>>;
}
```

A constructor can return `boundaries.start`, `boundaries.end`,
`boundaries.innerRim`, or another semantic key chosen by its caller.
A split returns boundaries for the new cut faces, with both sides
linked to the same geometric source.

These references are local to the returned geometry. An operation that
changes indexing produces a new result with updated references.
Topology is never selected by hoping old vertex indices still match.

The API can retain the existing `MeshData` returns internally while
migrating consumers to `GeometryResult` where named outputs are useful.
Plain `MeshData` remains a valid input to every geometric operation.

## Composition

The central contract is simple:

```ts
// Illustrative target signatures.
loft(sections: readonly Section3[], options?: LoftOptions): GeometryResult;
deform(geometry: MeshData, field: DeformationField): GeometryResult;
split(geometry: MeshData, plane: Plane): SplitResult;
fitBoundary(
  geometry: MeshData,
  boundary: BoundaryLoop,
  target: SurfaceTarget,
  options: FitOptions
): GeometryResult;
```

Operations do not need material instances, scene objects, or the viewer.
A model can create a Three.js mesh after finishing its geometric work.

For transforms, add `transformGeometry(geometry, matrix)` that applies
a matrix to construction vertices, updates winding for reflections,
and returns valid local references. This makes coordinate spaces
explicit and allows queries to reuse the same algorithm for a mesh
and for geometry carried in an assembly transform.

## Editing and topology identity

A geometric edit has two separate concerns: shape and provenance.

- **Vertex-only deformation:** preserve face structure and face-corner
  UVs; revalidate non-degenerate faces.
- **Subdivision:** return created vertices and descendants of the
  affected faces/edges; transfer surface regions and interpolate UVs.
- **Cut/split:** emit new faces and boundaries for each resulting piece.
  A cut face gets an explicit `cut` region or caller-provided region.
- **Combine pieces:** retain separate parts where that reflects
  construction; explicit mesh welding/union is its own geometric operation.

The reusable output of an edit contains references to its newly created
regions and edges. Algorithms that truly change topology provide a
mapping when subsequent operations require it. We do not promise stable
numeric IDs across rebuilds.

## Geometry validity

The shared kernel provides concrete checks:

| Check | Meaning |
| --- | --- |
| Finite values | Vertex positions and UVs are finite |
| Face validity | All corner IDs exist; no repeated corner or zero-area face |
| Edge incidence | Boundary, interior, non-manifold, and inconsistent-winding edges |
| Connectivity | Open loops, connected components, isolated vertices |
| Orientation | Consistent local face winding; outward winding for closed solids |
| Intersections | Local edge/face clashes where an operation requires clean geometry |
| Resolution | Neighboring surfaces share actual edge stations or receive explicit transition faces |

The checks are callable operations. Construction algorithms enforce the
invariants they depend on. Focused automated checks protect those
invariants as the toolbox changes.

## Immediate consolidation

- Keep `MeshData`, `AuthoredMeshBuilder`, `toBufferGeometry` as the
  initial kernel.
- Move the topology reconstruction currently performed separately
  by `controlOutline`, `fitBoundaryToSurface`, and related functions
  behind one edge/region query API.
- Replace the `WeakMap<BufferGeometry, MeshData>` as a *modeling*
  dependency. The renderer may keep a source reference for Quad View;
  geometric algorithms carry `MeshData` explicitly.
- Move vertex deformation into the construction layer. The current
  `warpGeometry` mutates both a BufferGeometry and its WeakMap-backed
  control mesh; future edits happen once, then render geometry is compiled.
- Keep the renderer's per-corner vertex expansion, normal calculation,
  triangulation, and material grouping in one conversion path.
