# 07 — Implementation Sequence

The order follows the dependency chain between actual geometric
capabilities. Every checkbox describes a change that can be built,
integrated and demonstrated. Record the implementing commit beside
each completed item.

The existing models provide real constructions against which we can
see whether a new operation is useful.

## 1. Geometry that can travel through the whole toolbox

**Result:** Construction data passes from one operation to the next,
and the viewer shows the faces that were actually authored.

- [ ] **1.1** Keep `MeshData` as the shared geometry representation;
      formalize face references, surface regions and per-corner UVs.
- [ ] **1.2** Give `AuthoredMeshBuilder` explicit vertex-sharing and
      welding options, including independent coincident vertices.
- [ ] **1.3** Build one topology index for directed edges, face
      adjacency, region boundaries, open loops and non-manifold edges.
- [ ] **1.4** Add `GeometryResult` with precise named boundary loops
      and face selections; indices remain local to each result.
- [ ] **1.5** Implement authored geometry clone/transform operations,
      with reflection winding and normal/frame handling.
- [ ] **1.6** Implement non-mutating authored vertex deformation.
- [ ] **1.7** Keep Quad View and render compilation correctly mapped
      to each new authored snapshot.
- [ ] **1.8** Exercise a box and loft through construction → topology
      query → deformation → render → Quad View.
- [ ] **1.9** Apply one documented `GeometryPrecision` policy to
      kernel operations and expose typed geometric failures.

**Working proof:** The query index recognizes real shared edges and
ordered boundaries, including disconnected pieces; repeated render
conversion does not mutate original geometry.

## 2. One vocabulary for constructing shapes

**Result:** Contours, profiles, sections and paths can feed multiple
constructors, each yielding the same kind of geometry result.

- [ ] **2.1** Introduce the common `Contour2`, `Profile2`,
      `Contour3`, `Section3` and `Path3` contracts.
- [ ] **2.2** Consolidate contour cleanup, winding, correspondence,
      landmarks and physically measured sampling.
- [ ] **2.3** Make adaptive sampling return its achieved station
      sequence, observed deviation and saturated intervals; use
      those stations for the mixed-density bridge.
- [ ] **2.4** Merge the repeated side-loft logic of `loftSections`
      and `loftRings` into a section-loft engine.
- [ ] **2.5** Make cap creation independent: planar quads when
      legitimate, polygon triangulation for concave/holed caps,
      proper tips and open ends.
- [ ] **2.6** Extract `loftBoard`'s differing-resolution boundary
      bridge into a general surface connection.
- [ ] **2.7** Generalize path sweeping to a changing section field,
      transported frames, and coherent periodic-frame closure for
      closed paths.
- [ ] **2.8** Consolidate `latheMeridian` and `revolveShell`
      into authored revolution and profile-defined shells.
- [ ] **2.9** Convert extrusion into an authored operation with
      holes, bevel layers, cap/wall surfaces and named boundaries.
- [ ] **2.10** Express `boxMesh`, `cylinderMesh`,
      `loftAxialProfile` and related primitives as compositions
      of shared shape-building code.
- [ ] **2.11** Build different profile-driven forms (solid bar,
      curved hollow tube, tapered grip) with the same machinery.
- [ ] **2.12** Let lofts assign surface regions and smoothing groups
      by contour edge and longitudinal interval, preserving the
      dagger's blade/ricasso and iron/oak transitions.
- [ ] **2.13** Add `tipBoundary` with actual triangle fans for pointed
      blade and guard ends.
- [ ] **2.14** Add contour-landmark correspondence for differently
      shaped top/bottom profiles, including the chair's sloped
      rear-seat housings.
- [ ] **2.15** Add `fillSurfacePatch` and explicit boundary-based
      `joinGeometry` so crowned top faces, sparse undersides and
      corresponding sidewalls form valid solids.
- [ ] **2.16** Extract the polar strip sampler and mixed-density
      outer/inner cross-sections used by the barrel and mug.

**Working proof:** All three forms retain real control faces,
correct end/rim construction and useful UVs.

## 3. Split, partition and reshape geometry

**Result:** A panel is one use of the same geometric partitioning
that can make an iron plate, a stone surface or separate solid parts.

- [ ] **3.1** Represent a common seam as one sampled boundary with
      its station parameters and geometric points.
- [ ] **3.2** Partition convex planar contours while preserving
      shared edge stations, holes and deliberate clearance offsets.
- [ ] **3.3** Extend contour clipping to concave regions and multiple
      components, returning actual planar loops.
- [ ] **3.4** Implement plane-splitting of authored solids, including
      multiple disconnected output pieces per half-space, with
      shared intersections, cut faces and paired part interfaces.
- [ ] **3.5** Implement `openPatch` and `recessPatch` on connected
      planar patches, with explicit rims, walls and optional floors.
- [ ] **3.6** Implement `cutThrough` for compatible entry/exit
      patches, creating the connecting inner walls.
- [ ] **3.7** Add parameterized curved-patch cutting based on explicit
      surface charts and mapped cut boundaries.
- [ ] **3.8** Turn edge recess, chamfer, bevel, roundover and groove
      geometry into reusable selected-edge/patch operations.
- [ ] **3.9** Combine seeded/coherent variation with authored
      geometry fields and region-weighted deformation.
- [ ] **3.10** Implement local edge/face subdivision with consistent
      neighboring stations and genuine transition triangles.
- [ ] **3.11** Wrap `manifold-3d` for closed-solid booleans;
      preserve actual triangulated output, assign surface/UV data,
      and report disconnected components.
- [ ] **3.12** Apply these tools to a wooden panel, circular barrel
      head and metal plate, using shared cuts and source boundaries.
- [ ] **3.13** Add `grooveAlongSurface` for shoulders, real recessed
      groove floors and edge wear on a selected face, preserving
      the underlying contact surface of barrel-head boards.

**Working proof:** Adjacent parts use precisely matching boundaries.
A hole produces actual wall/rim faces; the quad view reports real
triangles where a cut needs them.

## 4. Fit shapes to actual geometry

**Result:** Member ends and attached boundaries meet selected
support surfaces without object-specific fitting code.

- [ ] **4.1** Unify authored surface targets and explicit
      local-to-world transforms for geometric queries.
- [ ] **4.2** Query rays, nearest points, face regions, planar
      patches, intersections and boundary loops.
- [ ] **4.3** Share triangle tessellation between render and query;
      return authored face/corner references, barycentrics and
      ray-independent geometric normals on surface hits.
- [ ] **4.4** Fit arbitrary compatible cross-sections between
      finite planar support patches, including holes; fix section
      roll with a world-space reference direction.
- [ ] **4.5** Fit ordered boundaries against curved surfaces,
      with max travel, clearance, falloff and preserved topology.
- [ ] **4.6** Refine sampled fitting boundaries where curvature
      demands more geometry and keep the neighboring patch valid.
- [ ] **4.7** Unify attachment math for frames and named anchors,
      including parenting-cycle protection.
- [ ] **4.8** Demonstrate reuse in a wooden chair rail, metal brace,
      and curved mug-handle connection.
- [ ] **4.9** Implement finite triangle-surface clearance queries;
      validate closed barrel hoops and raised laps against the
      complete polygonal stave surfaces, including between samples.
- [ ] **4.10** Support explicit contact planes for model-authored
      trestle braces alongside geometrically queried support patches.

**Working proof:** Fitted ends are geometrically located on the
selected real support patches. Rays missing a target or inverted
contact faces yield a clear geometric failure.

## 5. Preserve appearance and runtime behavior

**Result:** Finished authored geometry feeds the same viewer/export
pipeline across construction and editing operations.

- [ ] **5.1** Classify authored faces/regions by orientation,
      adjacency and geometric selection.
- [ ] **5.2** Map those regions to model-defined materials through
      `surfaceMesh` and one `toBufferGeometry` compiler.
- [ ] **5.3** Preserve physical UVs across construction, splits,
      local subdivisions and deformation.
- [ ] **5.4** Keep authored quad/triangle counts and control edges
      correct after every topology-changing operation.
- [ ] **5.5** Preserve the existing compatible static batching,
      texture atlas and PBR material export behavior.
- [ ] **5.6** Preserve skinning, instances, morph targets and
      weights in the exporter paths that already support them.
- [ ] **5.7** Extract geometric section/volume queries from cavity
      and fill behavior; keep the beer mug's 0..1 fill usable.
- [ ] **5.8** Verify exported edited geometry and the mug's
      active fill level in GLB/Godot.
- [ ] **5.9** Detect authoring details that become degenerate
      after Float32 conversion at export scale.
- [ ] **5.10** Make authored UV offsets non-mutating and convert
      model callers that currently rely on in-place changes.
- [ ] **5.11** Preserve model-selected material palettes and
      per-object vertex tint in the rendering/export adapter.
- [ ] **5.12** Extract ordered cavity sections from separate inner
      stave surfaces, validating their stitched loop and matching
      station correspondence across height.
- [ ] **5.13** Keep the liquid's complete base mesh and eight fixed-
      topology morph targets; confirm that 1.0 represents the
      current 90%-physical-capacity serving.

**Working proof:** A mesh with a new cut surface renders with its
correct material and UVs. Dynamic fill retains its morph shapes
and weights through export.

## 6. Migrate the complete asset collection

**Result:** The current models use shared geometric operations.
Their authored design stays under `src/models/`.

- [ ] **6.1** Migrate `plank.ts` to shared section lofting.
- [ ] **6.2** Migrate `sandingpaper.ts` to shared primitive/render
      geometry.
- [ ] **6.3** Migrate `dagger.ts` to shared profile construction
      and material/surface mapping.
- [ ] **6.4** Migrate `table.ts` to shared partitioning,
      edge shaping and contact-based members.
- [ ] **6.5** Migrate `barrel.ts` to radial profiles, shared
      boundaries, body lofts, heads and periodic closed-path hoops.
- [ ] **6.6** Migrate `beerMug.ts` to shared body/handle/fitting
      and cavity/volume operations.
- [ ] **6.7** Migrate `tavernBench.ts` to shared partitioning
      and support geometry.
- [ ] **6.8** Migrate `tavernChair.ts` to shared surface fitting,
      surface cuts and board composition.
- [ ] **6.9** Keep `models/components/oakSeating.ts` and
      `trestleSupport.ts` as model-level assembly/material
      recipes built from general operations.
- [ ] **6.10** Reproduce each specific construction and appearance
      requirement in [12](12-model-by-model-proof.md), including
      stave caps, face-specific head grooves, the dagger's
      material regions, the chair's slanted cuts and mug filling.

**Working proof:** All eight models retain their intended scale,
shape, visual character, material behavior and relevant controls.
The specific part-by-part acceptance is documented in
[12](12-model-by-model-proof.md).

## 7. Finish the toolbox

**Result:** The codebase exposes geometric capabilities directly,
with no duplicate special-case algorithm families.

- [ ] **7.1** Remove superseded board, stave, timber and vessel
      geometry algorithms after all consumers have migrated.
- [ ] **7.2** Remove duplicated topology, caps, frame-attachment,
      geometry-edit and material-classification implementations.
- [ ] **7.3** Make module imports follow the dependency direction
      in [06](06-migration-map.md).
- [ ] **7.4** Replace the permanent `src/toolbox/README.md`
      capability examples with the actual resulting API.
- [ ] **7.5** Verify the eight models in Quad View and export.
- [ ] **7.6** Build a new cross-category model or geometry assembly
      using the shared operations without bespoke geometry hacks.
- [ ] **7.7** Remove stale compatibility files, exports and tests
      whose original invariants no longer exist.

## The checks we keep

| Invariant | Demonstration |
| --- | --- |
| Genuine authored topology | Quads remain quads; necessary triangles are never disguised |
| Boundary correspondence | Shared stations prevent accidental T-junctions |
| Sound solid construction | Faces and edges have valid winding/incidence for their intended closed/open geometry |
| Correct contacts | Contact points lie on selected finite patches within geometric tolerance |
| Valid composition | Build → edit → fit → render uses the same authored data |
| Reliable export | Materials, UVs, morphs, instances and skins survive their supported export paths |
| Numerical fidelity | Saturated sampling, contact precision and Float32 precision loss are reported instead of silently accepted |
| Deterministic geometry | Same input and seed yield the same shape and sample stations |

The visual quality of the model is checked directly. A few focused
checks capture the geometric failures most likely to force a
second architectural rewrite:

| Example geometry | Required outcome |
| --- | --- |
| A seam whose two neighboring parts request different refinement stations | One merged station set; no hanging vertices or holes |
| An annular pipe swept around a closed loop | Correct inner/outer walls, no duplicated closure ring or twisting seam |
| A concave quad cap and a cap with a hole | Genuine face triangulation that respects the exact contour |
| A plane through a multi-lobed connected solid | All resulting components labeled by half-space; paired cut boundaries |
| A recess cut next to an existing face edge | Valid wall and floor geometry; neighboring topology updated without T-junctions |
| A ray hitting the back face of a transformed quad | Original `FaceRef`, usable barycentrics and geometric normal independent of ray direction |
| A cross-section with all corners inside a concave support but an edge crossing outside | Rejected as an invalid finite-patch fit |
| A high-curvature curve hitting max subdivision depth | Measured residual and saturation reported; hard tolerance fails |
| A small authored detail losing separation after Float32 export conversion | Precision-loss report rather than a silently collapsed asset |
| Exported beer mug with nonzero fill, plus an instanced and a skinned example | Runtime properties survive the applicable export path |

The checks protect reusable geometry rules. Asset proportions and
appearance remain visually authored and reviewed.

## Dependency order

```text
authored kernel (1)
       │
       ▼
construction (2)
       │
       ├────────► editing (3)
       │               │
       └───────────────┼──────► contacts (4)
                       │             │
                       └─────────────┼──────► rendering/export (5)
                                     │                 │
                                     └─────────────────┤
                                                       ▼
                                                model migration (6)
                                                       │
                                                       ▼
                                                   cleanup (7)
```

Some individual model conversions can happen as soon as their
required shared operations work. Phase 6 records completion of
the entire collection.

The output contracts, operation semantics, numerical behavior and
existing-model construction proofs are defined in
[09](09-api-contracts.md), [10](10-geometry-semantics.md),
[11](11-numerics-and-query-fidelity.md) and
[12](12-model-by-model-proof.md).
Once those decisions are embodied in the code and documented by
the permanent toolbox README, this temporary directory can go.
