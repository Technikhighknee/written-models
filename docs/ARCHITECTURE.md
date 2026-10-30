# Architecture

Written Models authors 3D geometry in TypeScript. The geometry is independent of Three.js rendering; models assemble reusable operations into deliberately designed objects. This is a guide to the **contracts between layers**, not an API reference. For exact signatures, limitations and return selections, read the implementation.

## Where responsibilities live

| Location | Responsibility |
| --- | --- |
| `src/toolbox/geometry/definitions/`, `kernel/` | Geometry contracts, owned results, selections, topology, triangulation and precision |
| `src/toolbox/geometry/build/` | Contour, profile, section and surface construction; explicit boundaries |
| `src/toolbox/geometry/edit/` | Topology-changing edits, deformation, UV offsets and Boolean operations |
| `src/toolbox/geometry/queries/` | Authored-face queries, finite contacts, fitting, clearance and cavities |
| `src/toolbox/geometry/uv/`, `mesh/`, `materials/` | UV projection, authored mesh data, rendering adapters and face classification |
| `src/toolbox/geometry/construction/` | Higher-level reusable compositions and primitive constructors |
| `src/toolbox/shapes/`, `spatial/`, `texturing/`, `units/` | Definitions, transforms and placement, procedural texture fields, measurements |
| `src/materials/` | Reusable appearance and PBR materials |
| `src/models/` | Object-specific proportions, composition, detailing and artistic decisions |
| `src/core/` | Viewer, Quad View, runtime preparation and GLB export |

The geometry kernel must not depend on models, materials, the viewer or runtime-export implementations. Shared operations must not import model recipes. `tests/geometry/kernel/dependency-direction.test.mjs` protects the main import boundaries.

A helper belongs in the toolbox because it expresses a **general geometric capability**, not merely because it is shared by two wooden objects.

## One authored geometry pipeline

```text
contours / sections / procedural constructors
    ↓
MeshData (vertices, real quads/triangles, per-corner UVs, face regions)
    ↓ geometryResult()
GeometryResult (owned snapshot, regions, boundaries, optional charted patches)
    ├── build / edit / topology operations → new GeometryResults
    └── surfaceMesh() → toBufferGeometry() → Three.js / Quad View / GLB
```

`MeshData` is the canonical **authoring payload**, not obsolete code. Some primitive and model-construction helpers return it; wrap those results with `geometryResult()` before passing them into owned operations or `surfaceMesh()`.

`surfaceMesh()` and `toBufferGeometry()` accept **`GeometryResult`**, not an alternative raw-`MeshData` rendering path. Render conversion preserves the authored control geometry and triangle-to-face provenance for Quad View.

Geometric queries such as `raycastSurface()` and `cavitySectionsFromSurfaces()` deliberately consume an authored `MeshData` through a target with an explicit transform. Passing `result.geometry` is **not** a legacy render path: queries work on faces, not a renderer's `BufferGeometry`. Consult each operation's signature; not every low-level input needs to be a `GeometryResult`.

## Ownership, topology and selections

`geometryResult()` validates and deep-copies authored data. Treat a returned result as an **immutable snapshot**, including its nested THREE vectors. An edit creates a new owner identity; its selections do not automatically belong to the previous or next result.

- `FaceRef` uses a result-local face index; `BoundaryRef`, `EdgeRef` and `SurfacePatchRef` carry ownership.
- Face regions are semantic labels, **not** guarantees of one connected surface, one boundary or one UV chart.
- `topologyOf()` derives connectivity from authored faces and vertex identities, not rendered triangles.
- Edits return valid remapped selections where promised; they drop consumed boundaries or charts they cannot preserve. Use the **returned** references.
- Quads are authored quads. Actual cut/Boolean triangles remain triangles unless `reconstructPatchQuads()` can legitimately recover quads.

Coincident positions do **not** imply shared topology. `AuthoredMeshBuilder` requires an explicit welding policy (`"position"` or `"none"`). In independent constructions, shared physical interfaces need compatible stations and positions; `joinGeometry()` performs declared, validated welding. Do not conceal T-junctions, detached contacts or degenerate faces in rendering.

## Operation domains

The toolbox does not promise universal editing on arbitrary geometry:

- `fillSurfacePatch()` creates a charted patch from an explicitly sampled profile; `shapeSurfaceRelief()`, `openPatch()` and `recessPatch()` have their own chart, selection and outline constraints.
- `cutThrough()` is for its supported paired-surface through-cuts. `booleanSolids()` uses Manifold for closed authored solids and may return genuine triangulated faces.
- `clipContour()` edits a **2D profile**. `splitByPlane()` partitions authored 3D geometry. They are not interchangeable.
- `fitBetweenSurfaces()`, `fitBoundary()` and clearance queries use **finite** authored contacts and explicit transforms, not hypothetical infinite supports.
- `sampleAdaptiveStations()` reports sampled deviation and saturation. Observed error is not a mathematical bound for arbitrary curves.

Operations reject unsupported or degenerate inputs explicitly, often with `GeometryOperationError` (operation, reason, context). Do not silently change the geometric problem to force a successful result.

## Spaces, precision and repeatability

One world unit is **one meter**. Use `mm()`, `cm()`, `m()` and `km()` in `src/toolbox/units/length.ts` when appropriate.

Authored positions use JavaScript number precision. Rendering and export use Float32, so a geometrically valid tiny or far-from-origin feature may collapse or reverse after quantization. The owned rendering compiler checks that failure; `geometryResult()` validation and Float32 output checks solve **different** problems.

Construction-local geometry, world-space query results and parent-local scene attachment frames must never be mixed implicitly. Use an explicit transform when composing them. With identical deterministic inputs, seeded variation and authored sampling should give reproducible geometry; don't let render/export steps redefine the construction.

## Materials, runtime and inspection

Materials are assigned from **authored face regions**; GPU material groups do not classify source topology. Physical UV tiling comes from the appropriate authored UV projection or construction recipe. Verify any existing primitive's mapping rather than assuming every UV was authored in meters. Never mutate a shared cached texture's transform to create per-object variation. A `surfaceMesh({ tint })` call requires vertex-color-enabled materials for **every** selected face region; an invisible tint is rejected rather than exported silently.

`src/core/export/prepareRuntimeModel.ts` builds a separate runtime representation: supported static meshes can be batched/atlased, while morph and skinned data follow specialized preservation paths. `exportGlb.ts` exports copies without optimizing the live editor model in place.

`createFillableVolume()` uses a persistent mesh with morph targets and TypeScript fill controls. GLB retains the supported morph shapes and weights, **not** its TypeScript controller. Verify runtime behavior in the target engine; successful compilation does not prove correct appearance.

For discovering actual capabilities and combinations, see [TOOLBOX.md](TOOLBOX.md). For economical regression coverage, see [TESTING.md](TESTING.md).
