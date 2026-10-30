# Architecture

Written Models constructs intentionally authored 3D assets in TypeScript. Geometry exists independently of rendering; a model combines reusable operations, spatial relationships and material recipes into an asset.

This document records **current system contracts**, not a migration plan. Read the implementation when the exact input shape, supported domain or operation behavior matters.

## Responsibilities and direction

| Location | Responsibility |
| --- | --- |
| `src/toolbox/geometry/definitions/` and `kernel/` | Geometry types, owned results, topology, selections, triangulation and precision |
| `src/toolbox/geometry/build/` | Construct geometry and establish explicit boundaries |
| `src/toolbox/geometry/edit/` | Change existing geometry and its actual topology |
| `src/toolbox/geometry/queries/` | Intersections, surface contact, fitting, clearance and cavity extraction |
| `src/toolbox/geometry/uv/` | Project UVs onto authored surfaces |
| `src/toolbox/geometry/construction/` | Reusable higher-level constructions composed from geometry operations |
| `src/toolbox/geometry/mesh/` | Authored mesh representation and render-geometry conversion |
| `src/toolbox/shapes/`, `spatial/`, `units/` | Shape definitions, frames/placement/variation, physical units |
| `src/toolbox/texturing/` | Generic texture fields and map baking |
| `src/materials/` | Reusable physical appearance recipes and cached PBR materials |
| `src/models/` | Object-specific dimensions, composition, shapes, details and artistic choices |
| `src/core/` | Viewer, routes, runtime preparation and GLB export |

Dependencies in the geometry kernel and shared build/edit/query layers must point toward lower-level geometry, not model recipes or renderer adapters. `tests/geometry/kernel/dependency-direction.test.mjs` protects the principal import boundaries. A reusable helper does not belong in the toolbox merely because two particular models happen to need it.

## Authored geometry is the source

`MeshData` carries shared vertex positions and **authored quad and triangle faces**, including per-face-corner UVs and surface labels. Do not treat the render mesh as a substitute for this representation.

`geometryResult()` validates and copies authored data into a `GeometryResult`, whose identity owns its boundaries, face regions and optional charted patches. `BoundaryRef`, `EdgeRef` and `SurfacePatchRef` refer to that result, not arbitrarily to another geometry result. Edits must preserve, transfer or replace selections according to their actual contract; never silently reuse stale handles.

`topologyOf()` reads authored connectivity, not GPU triangles. Boundary traversal relies on meaningful edge winding and rejects ambiguous/nonmanifold junctions where required. A surface label selects faces; it is not itself a promise of one connected patch or one boundary.

**Quads are not a rendering convention.** A genuinely triangulated cut or Boolean result may remain triangles. `reconstructPatchQuads()` can recover real quads where the input geometry allows it; manufacturing fake quads is not a solution.

## Construction, edits and interfaces

Adjacent authored parts need compatible **physical boundaries and stations**. Sample or partition their shared construction deliberately, then connect them with operations such as `bridgeBoundaries()` or `joinGeometry()`. A visually coincident seam is not necessarily a welded topological seam.

Operations have domains rather than universal promises:

- Patch operations use their supported face selections and surface charts. `openPatch()`, `recessPatch()` and `shapeSurfaceRelief()` are distinct edits.
- `cutThrough()` makes the supported straight-through connection between appropriate surfaces; `booleanSolids()` performs general solid Boolean work through Manifold.
- `splitByPlane()`, `subdivideEdges()` and `bevelEdges()` alter actual mesh topology; each has its own preconditions and follow-on selection semantics.
- Queries and fitting use finite authored surfaces and explicit coordinate transforms, not infinite support planes unless a caller intentionally provides that form.

Reject unsupported cases with meaningful errors instead of silently approximating a different shape. `GeometryOperationError` communicates the operation, reason and relevant context.

## Physical coordinates and precision

One world unit equals **one meter**; use `mm()`, `cm()`, `m()` and `km()` from `src/toolbox/units/length.ts` where useful.

Construction precision is separate from output precision. The shared precision policy handles absolute/relative length and angular tolerances. Rendering and runtime formats use Float32 positions, so geometry valid during authoring can still fail output precision checks. An operation must not silently collapse, invert or misidentify geometry to make an export pass.

Frames and transforms must be explicit when fitting, joining or placing independently modeled parts. Never compare local-space points with world-space surfaces without applying the intended transform.

## Rendering, Quad View and export

`surfaceMesh()` requires an owned `GeometryResult`, maps its authored surface labels to Three.js materials, and delegates geometry compilation to `toBufferGeometry()`. Raw `MeshData` is a construction payload, not an alternative rendering input. That conversion triangulates as needed for the GPU, while retaining the authored control representation and triangle provenance for tooling. Quad View and triangle wireframe answer different questions.

`src/core/exportGlb.ts` and `src/core/export/prepareRuntimeModel.ts` prepare and export runtime assets, including supported textures, vertex tints, geometry and morph data. This is a separate representation from authored geometry. Runtime batching/atlas choices must not corrupt exported appearance or behavior.

Authored UV scale is physical. The shared material library builds consistent PBR maps, including distinct face/end-grain treatments where a model requires them. Don't modify shared cached texture transforms to create per-part variation; author appropriate UVs or per-piece tints.

A `createFillableVolume()` controller can change a mesh while authoring/running in TypeScript. GLB can carry supported morph targets and weights, **not the TypeScript controller itself**. Inspect the actual export and target engine before claiming feature parity.

## Extending the system

1. Inspect an existing composition and the operation implementations before designing a new capability.
2. Keep the operation generic; leave proportions, object-specific detailing and artistic decisions in the model.
3. Preserve actual topology, selections, UVs and source provenance through promised conversions and edits.
4. Keep modeling, rendering and runtime behavior conceptually separate.
5. Protect costly shared invariants only when appropriate; see [TESTING.md](TESTING.md).

For a capability-oriented index and real composition examples, see [TOOLBOX.md](TOOLBOX.md).
