# 06 — Migration Map

The target is a set of shared geometric operations with consistent
authored geometry results. This document assigns destinations to
existing toolbox functions and maps each model to the shared paths.
The dependency order for implementing them is fixed in
[07](07-implementation-sequence.md).

## Target source layout

```text
src/toolbox/
  geometry/
    kernel/         MeshData, authored builder, topology index, validation, results
    definitions/    contours, profiles, sections, paths, frames
    build/          extrude, loft, sweep, revolve, bridge, shell, primitives
    edit/           clipping, partition, cuts, edge details, deformation
    queries/        faces, intersections, contact surfaces, closest points
    fitting/        plane ends, curved boundaries, contact resolution
    uv/             physical mapping and authored UV transformations
    render/         authored geometry → BufferGeometry / THREE.Mesh
  spatial/
    layout/         placement, variation, patterns
    transforms/     frames, anchors, scene attachments
  texturing/        fields, procedural patterns, PBR baking
  units/            meter-based length helpers

src/models/
  components/       oak seating, trestle construction, other model recipes
  *.ts              completed assets and their design decisions

src/materials/      material families and appearance
src/core/           viewer and runtime/export pipeline
```

Module names below refer to those *responsibilities*, not a demand
to create an empty file for every operation. Closely related
functions may share modules.

Dependency direction:

```text
definitions / kernel / units
            ↓
build / edit / queries / uv
            ↓
fitting / geometry composition
            ↓
model recipes + model construction
            ↓
render / viewer / runtime export
```

Texturing can feed the material layer independently.
Build and edit operations may use kernel-level topology queries;
the query layer may not import object-specific model construction.

## Specific changes that make the migration work

Some of the current special cases are hiding genuinely reusable machinery.
These are the extraction boundaries that the new modules implement.

| Current behavior | Target operation / data |
| --- | --- |
| `AuthoredMeshBuilder` welds any coincident points at 1e-9 resolution | Explicit vertex sharing and optional spatial welding; independent coincident parts retain distinct topology |
| `profiledBoard` stores stations in a WeakMap keyed by `MeshData` | Section sampler returns `StationSamplingResult` with stations, measured deviation and saturation data; a shared panel computes the common station union before constructing parts |
| `seamedPlankExtrusion` returns `BufferGeometry` and keeps longitudinal stations in another WeakMap | Return authored geometry with named regions/boundaries; produce the stations from a general sampler instead of render metadata |
| `boardPanel` and `circularPlankPanel` independently assemble board-specific pieces | One contour partition returns shared cut boundaries; model recipes choose plank count, gaps, crown and wear |
| `loftSections` and `loftRings` duplicate side stitching but differ on caps | Shared loft strips; separate cap generation preserves valid four-corner quads and triangulates arbitrary planar outlines |
| `loftBoard` stitches visible/hidden edges of unequal resolution | General boundary bridge with real transition triangles, reusable by shells, surface patches and organic geometry |
| `fitBoundaryToSurface` infers a boundary from all vertices in a surface region | Ordered `BoundaryRef` extracted from authored edges; ray projection and falloff retain the correct selection |
| `supportFacePlane` picks only planar quads by direction | Surface query selects a nearby face/patch and checks the finite support footprint before member fitting |
| `fitBetweenSupports` imports `TimberContactNormals` | Return independent contact normals, patches and fitted sections; wood materials remain in model composition |
| `assignMaterialsByNormal` and `classifyExtrudedSurfaces` edit GPU index groups | Classify authored faces first; compile material groups once in `toBufferGeometry` |
| `warpGeometry` mutates GPU data and its stored control mesh | Deform authored vertices and derive a new render snapshot |
| `revolveShell` generates `BufferGeometry` through `latheMeridian` | Generate authored revolved geometry; render once at the caller boundary |

These are concrete algorithm and data-flow changes. A file can be removed
when its call sites use the corresponding shared operation.

## Geometry kernel and output

| Current file | Destination / behavior |
| --- | --- |
| `geometry/mesh/MeshData.ts` | Keep as canonical face/vertex format; add shared result and boundary types |
| `geometry/mesh/AuthoredMeshBuilder.ts` | Keep as face authoring helper; integrate topology validity checks |
| `geometry/mesh/toBufferGeometry.ts` | Retain rendering compilation; share authored-face tessellation with geometric queries, including face/corner provenance |
| `geometry/mesh/controlOutline.ts` | Viewer utility backed by shared topology index |
| `geometry/mesh/surfaceMesh.ts` | Rendering adapter that maps face regions to material palettes |
| `geometry/topology/adaptiveStations.ts` | Keep; become standard shared geometry sampling |
| `geometry/topology/stitchPolylines.ts` | Keep; use for unequal-resolution boundary bridges |

Add shared topology indexing, ordered boundary loops, face/edge
selection, region queries, opaque result ownership and explicit
operation results. Return
`BoundaryRef[]` per named boundary, since a region can have multiple
loops and internal holes.
Functions currently duplicating adjacency and region selection
will call the shared system.

## Constructing shapes

| Current file | Destination / behavior |
| --- | --- |
| `construction/boxMesh.ts` | Generic primitive using the same authored construction result |
| `construction/cylinderMesh.ts` | Generic primitive or revolve composition |
| `construction/ellipticalRing.ts` | General section sampling utility |
| `construction/loftRings.ts` | Common closed-section loft operation |
| `construction/loftSections.ts` | Fold four-corner loft behavior into the same section loft engine |
| `construction/loftBoard.ts` | Extract independently sampled boundaries and mixed-resolution transitions into general loft/bridge |
| `construction/loftAxialProfile.ts` | Generic section field, radial waves and axial sampler; its per-edge/per-interval face materials/smoothing move into the loft engine |
| `construction/sweepSection.ts` | General path sweep with changing section, transported frames, and periodic-frame closure for closed paths |
| `construction/latheMeridian.ts` | Core revolve implementation, including correct pole topology |
| `shapes/operations/extrude.ts` | Authored contour extrusion with cap/side region outputs |
| `shapes/operations/revolveShell.ts` | Composition of thickness profile and generic revolution; return authored geometry |
| `construction/profiledMesh.ts` | Model/render composition; geometry construction delegates to section sampler and loft |
| `construction/turnedVessel.ts` | Vessel-specific assembly moves into model components; reusable rotational geometry remains in toolbox |

Cap generation, contour correspondence, and sample station selection
are shared across extrusion, loft, sweep, and revolve. These
operations consistently return `GeometryResult` containing authored
`MeshData` and useful boundaries.

## Partition, cut and surface detail

| Current file | Destination / behavior |
| --- | --- |
| `construction/straightBoard.ts` | Replace with rectangular section + generic loft/extrusion, composed in model code |
| `construction/profiledBoard.ts` | Extract edge fields, section sampling, bevel/crown shaping; move board recipe to model code |
| `construction/boardPanel.ts` | Move panel assembly to model components; shared cuts, boundaries and variation in toolbox |
| `construction/circularPlankPanel.ts` | Move circular wooden-panel assembly to models; generic contour partition and grooves remain in toolbox |
| `construction/seamedPlankExtrusion.ts` | Extract local surface construction, seams, cut/corner wear, and adaptive sampling |
| `construction/cutBoard.ts` | Replace with planar `recessPatch`, `openPatch` and supported `cutThrough`; metal and wood use the same surface-patch algorithms |
| `construction/radialStripLayout.ts` | Pure polar section layout with outer/inner sampling, returning Section3 for general lofting, no BoardSection coupling |
| `construction/radialStaves.ts` | Barrel/mug stave assembly moves into model code |
| `construction/bandAroundProfile.ts` | Compose periodic and open partial sweeps, shared bevel profile, radius/chord clearance and finite-surface validation; return authored geometry |
| `geometry/features/rectangleCornerMounts.ts` | Geometry-independent placement pattern; object-specific mount construction resides in models |
| `shapes/operations/cleanClosedContour.ts` | General contour normalization |
| `shapes/operations/clipConvexPolygon.ts` | General contour clipping and shared-boundary partitioning; retain fast convex implementation |
| `geometry/deformation/warpGeometry.ts` | Authored-geometry deformation; renderer derived afterward |

The generic operations extracted from wooden boards remain usable
for metal, stone, ceramic, and organic models. Board-specific
assembly choices stay with table, barrel and seating recipes.

## Geometric definitions

| Current file | Destination / behavior |
| --- | --- |
| `shapes/primitives/polygon.ts` | General contour primitive |
| `shapes/primitives/rectangle.ts` | General contour primitive |
| `shapes/primitives/ring.ts` | General annular contour primitive |
| `shapes/primitives/roundedRectangle.ts` | General contour primitive |
| `shapes/profiles/bulged.ts` | General curve/profile field |
| `shapes/profiles/edgeRecess.ts` | General edge-depth profile |
| `shapes/profiles/facetedDiamondOutline.ts` | Profile convenience function; reusable via generic sections |
| `shapes/profiles/linearProfile.ts` | Piecewise interpolation field |
| `shapes/profiles/mirrorStations.ts` | Generic station transform |
| `shapes/profiles/monotoneProfile.ts` | Generic monotone interpolation |
| `shapes/profiles/profileSpans.ts` | Composable profile sections |
| `units/length.ts` | Keep meter-based helpers |

The primitive/profile constructors return reusable geometric
definitions. They should work as inputs to multiple build/edit
operations.

## Contacts, spatial operations and assembly

| Current file | Destination / behavior |
| --- | --- |
| `construction/supportFacePlane.ts` | Query layer: real face/patch plane selection |
| `construction/fitBetweenSupports.ts` | General fitted-support operation; eliminate wood type import |
| `construction/sectionsBetweenPlanes.ts` | General cross-section plane fitting, retained as core algorithm |
| `construction/beamBetweenPlanes.ts` | Rectangular-profile convenience composition outside geometric fitting core |
| `construction/beams.ts` | Generic member geometry or model composition using section and frame tools |
| `construction/timber.ts` | Wood face/material and grain policy goes with models/materials; geometric fitting remains shared |
| `construction/fitBoundaryToSurface.ts` | Fitting layer consuming exact boundary references and retaining opposite-end loops across consecutive fittings |
| `spatial/queries/MeshSurfaceQuery.ts` | Query adapter over authored geometry + transform; ray hits report actual winding normals, original face/corner mapping and barycentrics |
| `spatial/queries/bounds.ts` | Keep general bounding queries |
| `spatial/frames/contactFrame.ts` | Shared frame based on point/normal/tangent |
| `spatial/frames/frames.ts` | Shared transform frame helpers |
| `spatial/anchors/anchors.ts` | Named scene anchors; shared frame representation |
| `spatial/relationships/attachByAnchor.ts` | Resolve anchor frames into common attach operation |
| `spatial/relationships/attachByFrames.ts` | Common frame-based attachment and cycle checks |
| `spatial/layout/coherentVariation.ts` | Keep deterministic spatial variation |
| `spatial/layout/positionsFromEnds.ts` | Keep general layout |
| `spatial/layout/seededVariation.ts` | Keep deterministic variation |
| `spatial/layout/weightedCuts.ts` | Keep weighted partition positions |

Three.js scene parenting belongs in spatial assembly, downstream
of geometry creation and fitting. All geometric queries use
`SurfaceTarget { geometry, localToWorld }`; render-backed queries
may accelerate their implementation internally.

## Surface data, texturing and runtime

| Current file | Destination / behavior |
| --- | --- |
| `geometry/materials/assignMaterialsByNormal.ts` | Classify authored face regions by normal, then render compiler maps materials |
| `geometry/materials/classifyExtrudedSurfaces.ts` | Fold into general face classification, remove extrusion draw-group assumption |
| `geometry/materials/assignExtrudedTimberSurfaces.ts` | Model-specific wood grain/end-grain policy; shared geometric face classifier |
| `geometry/materials/tintVertices.ts` | Expose per-piece tint in the rendering adapter; generate exportable vertex colors without coupling color to authored topology |
| `geometry/uv/boxUVsInMeters.ts` | General physical UV projection |
| `geometry/uv/offsetMeshUvs.ts` | Pure authored-geometry UV edit returning new geometry; update model/component call sites formerly relying on mutation |
| `construction/profiledCavity.ts` | Multi-mesh inner-region section stitching and stable contour correspondence; keep ProfiledCavity interpolation and exact section volume |
| `construction/fillableVolume.ts` | Separate geometry/volume operations from runtime morph-target controller |
| `texturing/fields.ts` | Keep general scalar/vector field operations |
| `texturing/flowedGrainField.ts` | Keep reusable texture field with material-independent core sampling |
| `texturing/periodicFlowField.ts` | Keep reusable periodic field |
| `texturing/tileableNoise.ts` | Keep reusable texture noise |
| `texturing/bakePbrMaps.ts` | Keep PBR map baking |

`src/core/export/prepareRuntimeModel.ts`,
`textureAtlas.ts`, and `exportGlb.ts` retain the runtime
compilation/export boundary. Their behavior is covered by
[05](05-surfaces-and-export.md).

## Cross-model construction dependencies

These model constructions depend on the following shared geometric
operations and data flows:

| Source / consumer | Shared target operation | Detail retained |
| --- | --- | --- |
| `loftAxialProfile.ts`, `dagger.ts` | `loftSections` with per-edge/interval region and smoothing callbacks | Blade edge strips, ricasso, iron–oak–iron grip, faceted/smooth transitions |
| `profiledMesh.ts`, `dagger.ts` | `profileSpans` → sections → loft → `tipBoundary` | Pointed blade/quillon ends, mirrored guard arms, radial waves |
| `cutBoard.ts`, `tavernChair.ts` | `correspondContours` + `loftSections` + `fillSurfacePatch` + `joinGeometry` | Rear-seat cheek cuts with distinct top/bottom outlines following raked stiles |
| `circularPlankPanel.ts`, `seamedPlankExtrusion.ts` | Shared seam partition + batched `shapeSurfaceRelief` + separate detailed/hidden patches | Head-board crown, combined groove floors, shoulders, solid contact below visible recess |
| `radialStripLayout.ts`, `loftBoard.ts` | `samplePolarStripSections` + section loft + mixed-density cap bridge | Stave outside bevel row, sparse inside row and authentic end faces |
| `bandAroundProfile.ts` | Periodic/partial `sweepSection` with `polygonalRadiusOutside` and `surfaceClearance` | Hoops, overlap arcs, angled end faces, whole-face clearance against staves |
| `profiledCavity.ts`, `beerMug.ts` | `cavitySectionsFromSurfaces` → `ProfiledCavity` | Complete ordered cavity extracted from twelve **separate** stave meshes |
| `fillableVolume.ts`, `beerMug.ts` | Cavity geometry → fixed-topology morph snapshots → existing runtime controller | Eight blend shapes, nondegenerate neutral base, calibrated 1.0 |
| `oakSeating.ts`, `table.ts`, `barrel.ts` | Pure `offsetMeshUvs` and render tint/material adapter | Seeded UV offsets, end grain, per-piece physical vertex color variation |
| `trestleSupport.ts`, `tavernChair.ts` | Shared section fitting with either real support patches or explicitly authored planes | Diagonal brace miters, rails and drawpeg positions |

Model recipes still choose the part counts, sizes, relative transforms,
wear, materials and construction style. The shared operations retain
the full geometry responsibilities described above.

**Required call-site behavior:** the existing `offsetMeshUvs()`
mutates `MeshData` in place. Migrating it to a pure authored edit
means every caller must use its return value. In particular,
`oakPlank()` and the chair's crest currently call it for its
side effect. The adapted model and component code must take ownership
of the returned result before compilation.

The construction walk-through for all eight models and two shared
components is in [12](12-model-by-model-proof.md).

## Model migrations

| Model | Concrete source changes |
| --- | --- |
| `plank.ts` | Consume shared section loft and authored mesh rendering |
| `sandingpaper.ts` | Use common primitive geometry and material/UV adapter |
| `dagger.ts` | Build blade and grip through section/profile composition with general loft/revolve/sweep |
| `table.ts` | Replace `boardPanel` dependency with shared partition, profiles, loft, timber model composition |
| `barrel.ts` | Radial layout, general section loft, shared head partitions, profile-following hoops |
| `beerMug.ts` | Radial body composition, swept/fitted handle, cavity volume, runtime fill controller |
| `tavernBench.ts` | Shared fitted members and seat partitioning through model components |
| `tavernChair.ts` | General fitted-rail contacts, patch cuts, seat panel and independently authored details |
| `models/components/oakSeating.ts` | Model-owned wood palette/UV choices, assembled from geometric operations |
| `models/components/trestleSupport.ts` | Model-owned support arrangement, shared contact/fitting geometry |

The visible forms and proportions remain model decisions. Each
model migration replaces its geometric dependencies, keeps the
existing assembly recognizable and exportable, and proves the
same operation can serve a geometrically different consumer.

## Removal criterion

A specialized geometry function disappears once its algorithm is
available in generic operations, every consumer uses those operations,
and its old name contains no remaining independent model behavior.

The final toolbox should be navigable by **geometric capability**:
section construction, cutting, deformation, contact fitting, and
surface operations. The geometric output behavior is specified in
[10](10-geometry-semantics.md). Precision, sampled approximation
limits and ray-normal rules are in
[11](11-numerics-and-query-fidelity.md). Its useful primitives have names that describe
geometry itself.
