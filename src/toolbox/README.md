# Toolbox

Reusable building blocks for creating hand-authored 3D assets in TypeScript.

Models live in `../models/` – Materials live in `../materials/` **outside** the toolbox. The toolbox provides the geometry, topology, spatial operations, and texturing capabilities they need.

## Principles

- **Generic over specific.** Toolbox functions describe reusable operations, not individual models.
- **Composable over monolithic.** Prefer small capabilities that work together.
- **Build capabilities through models.** Implement what a model needs, then make it reusable.
- **Preserve artistic control.** Geometry, topology, materials, and imperfections should be intentional and editable.
- **No hidden workarounds.** Solve geometric problems in the geometry, not through viewer-specific tricks.

One Three.js world unit equals **one meter**. Use `mm()`, `cm()`, `m()`, and `km()` from `units/length.ts`.

## Directory Map

| Directory | Responsibility |
|---|---|
| `shapes/primitives/` | 2D shapes such as rectangles, polygons, and rings |
| `shapes/operations/` | Shape operations such as extrusion and revolution |
| `shapes/profiles/` | Reusable profiles and curves |
| `geometry/construction/` | Boards, beams, lofts, panels, staves, bands, and solids |
| `geometry/mesh/` | Mesh representation, conversion, and control topology |
| `geometry/topology/` | Topology planning and adaptive subdivisions |
| `geometry/deformation/` | Vertex deformation |
| `geometry/uv/` | UV mapping and transformations |
| `geometry/materials/` | Material assignment and vertex colors |
| `spatial/` | Anchors, frames, relationships, layouts, and queries |
| `texturing/` | Texture fields, noise, grain, and PBR baking |
| `units/` | Physical length units |

## Geometry Architecture

**Construction topology is the source of truth.**

`geometry/mesh/MeshData.ts` defines:

- `vertices`: Shared construction vertices.
- `quads`: Authored quadrilateral faces.
- `triangles`: Genuine triangular faces.
- Each face has corner indices, UVs, a surface identifier, and optionally a smoothing group.

`toBufferGeometry()` converts `MeshData` into renderable Three.js geometry.

The same construction data also powers the Quad View through `getControlOutline()`.

**Do not reconstruct original quads from rendered triangles.** Triangulation is an output operation, not the source topology.

Some constructors return `MeshData` directly. Others return a `BufferGeometry` already converted through the common pipeline.

### Axial profiles and surface meshes

Use `loftAxialProfile()` when an asset is defined by a series of cross-sections along X, Y, or Z. Each station supplies its axial position and two radii. The section can be an ellipse or a normalized hand-authored outline. Stations can change the active surface material; `sideSurfaces` assigns bevels, and `smoothing` selects rounded or faceted normals. Optional radial waves add controlled deviations without changing the quad structure.

`mirrorStations()` reflects an authored half-profile, preserving its section offsets. `surfaceMesh()` converts `MeshData` to a named Three.js mesh, automatically deduplicating materials and retaining the control topology used by Quad View. Supply `capMaterial` only when a multi-material loft needs an end-cap fallback.

For longer turned forms, `profileSpans()` generates shared axial stations from consecutive lengths, end radii, smooth bulges, and optional radial variation. Each span may change material; `samples` sets genuine longitudinal quad loops. This avoids hand-authoring every intermediate section while keeping the designed endpoints explicit.

`profiledMesh()` composes profile spans, optional mirroring, axial lofting and material assignment in one step. `facetedDiamondOutline()` provides a reusable normalized eight-corner section with adjustable bevel shoulders, suitable for tools, ribs and mouldings. Use these when a model should define a few meaningful form sections rather than individual rings or mesh plumbing.

These are reusable construction tools, not model presets: proportions, station locations, contours, and material choices still belong in the model.

### Profiles and rotational geometry

`monotoneProfile()` interpolates ordered scalar landmarks with extrema-preserving cubic slopes; `turnedVessel()` uses it for radius-vs-height instead of keeping a private curve engine. `latheMeridian()` now supports both axis-pole solids and cyclic positive-radius meridians; `revolveShell()` delegates all authored rotational topology to it, retaining a thin-walled convenience API.

### Authored mesh assembly

`AuthoredMeshBuilder` provides a material-agnostic way to add genuine quads and triangles from 3D corners and physical UVs. Shared positions become shared *construction* vertices even across UV/material seams. The existing conversion still owns GPU vertex splits, and the builder does not silently triangulate or repair degenerate input. `seamedPlankExtrusion()` uses it with generic surface IDs (`face`, `cut`, `recess`) rather than embedding wood material names.

### Generic surface and material fields

`classifyExtrudedSurfaces()` selects material regions by a side face's normal relative to a reference axis while preserving ordinary extruded geometry; `assignExtrudedTimberSurfaces()` is its wood-specific material-slot adapter. `periodicFlowField()` provides continuous wrapped coordinate bending independently of any texture type; `flowedGrainField()` retains the established oak-recipe interface.

### Adaptive model contours

`adaptiveStations()` accepts optional mandatory `knots` for deliberate feature boundaries. `profiledBoard()` samples the real cross-section with geometric-error limits instead of maintaining a fixed 13-ring array; `boardPanel()` unions the chosen stations across EVERY adjacent plank, keeping shared seams compatible and preventing T-junctions.

### Shared topology transitions

`stitchPolylines()` connects open contours with different station densities using genuine triangles and no invented hidden vertices. The caller retains responsibility for 3D UV projection. `loftBoard()` uses it at unequal-resolution end caps and still keeps true quads when both contour densities match. `linearProfile()` samples authored straight-sided scalar profiles, complementing the smooth `monotoneProfile()`; radial bands share the linear sampler.

### Shared contours, partitioning and fitted seams

`cleanClosedContour()` removes repeated sampled points, including a near-duplicate at the cyclic seam, while preserving valid corners and winding. `clipConvexPolygon()` intersects a **convex** polygon with a half-plane; `partitionConvexPolygon()` divides it along shared parallel boundaries (concave/disconnected sections need a separate multi-polygon algorithm).

`weightedCuts()` returns shared positions for a weighted interval, and `seededVariation()` produces repeatable variation indexed by piece and channel. Panel constructors use these shared helpers rather than inventing another seam layout or random hash.

`edgeRecessStations()` and `edgeRecessDepth()` specify a recessed strip edge as geometric support loops plus a continuous height profile, without assuming wood or any material. Timber-specific plank constructors combine this operation with grain materials.

### Turned vessels and curved sections

`turnedVessel()` constructs a closed-base, open-topped vessel from a few outer silhouette landmarks, wall/floor thickness, and optional rounded rim, turning grooves and local radial foot impressions. Its interior and exterior are one continuous control mesh; no hollow-cylinder illusion. `latheMeridian()` is the underlying generic solid-of-revolution operation and keeps real quad faces and axial triangle fans.

`sweepSection()` lofts any closed 2D section along a 3D curve using a stable reference axis. It is suitable for applied handles, curved members and bent strips, with real capped ends and optional attachment flare.

### Surface contacts

`contactFrame()` builds a contact frame from a point, outward normal and in-plane tangent, fixing orientation around the normal (not just tilt). `sectionsBetweenPlanes()` intersects every corner of ANY closed cross-section against two arbitrarily oriented support planes. `beamBetweenPlanes()` uses it as a rectangular convenience constructor; `rectangleCornerMounts()` uses the general contact-frame builder.

`MeshSurfaceQuery` raycasts the actual triangles of a target mesh in world space, independent of the display material's sidedness. `fitBoundaryToSurface()` uses this query to fit any named construction-mesh boundary (often a loft cap) to a curved target. An optional topological falloff reshapes adjacent loops while preserving the original quads, UVs and surface IDs. Specify the casting direction, reach and small insertion depth; missing intersections fail explicitly.

This operation produces accurate *contact*, not a Boolean union or watertight welded joint. Source geometry may supply a world transform when target and source do not share local coordinates.



### Important rules

- Quads are preferred where appropriate; genuine triangles are valid.
- Material boundaries, UV seams, and smoothing boundaries are independent.
- Surface identifiers map to material slots during conversion.
- Geometry must retain its authored topology for Quad View.
- Deformation must keep render vertices and control vertices synchronized.
- Never add unnecessary subdivisions to surfaces that do not need them.

## Typical Usage

```ts
import { straightBoard } from "./geometry/construction/straightBoard";
import { toBufferGeometry } from "./geometry/mesh/toBufferGeometry";
import { m, cm, mm } from "./units/length";

const board = straightBoard({
    length: m(1.2),
    width: cm(20),
    thickness: cm(3),
    chamfer: mm(2)
});

const geometry = toBufferGeometry(board, {
    outer: 0,
    inner: 0,
    "edge-left": 0,
    "edge-right": 0,
    "cap-start": 1,
    "cap-end": 1
});
```

The resulting geometry is ready for a Three.js mesh, material assignment, Quad View, and GLB export.

## Adding a Capability

1. Identify the underlying geometric or spatial operation.
2. Check whether an existing toolbox function already solves it.
3. Implement a reusable operation with explicit inputs and predictable results.
4. Preserve topology, UVs, material surfaces, and physical dimensions.
5. Integrate it into the model that motivated the addition, and all other models that could benefit from this.

Do not introduce model-specific functions into the toolbox simply to make one asset work.

## Relationship to Models

Models decide **what to build**.

The toolbox determines **how geometry and other reusable operations work**.

Materials and their visual characteristics are primarily defined in `src/materials/`.

The viewer displays the result. It should not be responsible for repairing incomplete geometry or recovering construction information that was discarded.

**The goal is not to generate many models automatically. The goal is to make increasingly sophisticated, individually designed models easier to build.**
