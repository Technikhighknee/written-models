# 07 — Implementation Sequence

This is the execution order for the Phoenix architecture. A checkbox
represents a concrete integrated outcome. Record its implementation
commit when complete.

The existing models remain usable throughout the work. Each phase has
an integrated proof, and model conversions start as soon as the
geometric operations they require become available.

## Phase 1 — Authored geometry and trustworthy rendering

**Result:** A constructed face can pass through edits, topology
queries, the viewer and export with the correct authored identity.

- [ ] **1.1** Preserve a baseline of the eight models' visual forms,
      Quad View topology, material appearance and supported GLB
      behavior, including the mug's active morph fill.
- [ ] **1.2** Retain `MeshData` and its existing authored faces.
      Give each new `GeometryResult` an opaque identity and enforce
      selection ownership on `BoundaryRef` and `SurfacePatchRef`.
- [ ] **1.3** Establish deep-copy snapshot semantics (including
      mutable THREE vectors), document immutable-by-contract output,
      and define explicit builder welding policies. Coincident
      independent parts remain topologically distinct.
- [ ] **1.4** Provide one topology index for directed edges, face
      adjacency, region boundaries and connected components. Owner-
      check selected edges as well as patches and boundary loops.
- [ ] **1.5** Make one authored-face triangulation supply both
      render and geometric-query triangles, with face/corner mapping.
- [ ] **1.6** Keep Quad View tied to the exact authored snapshot,
      preserving real triangles/quads independently of material order.
- [ ] **1.7** Implement non-mutating authored transform, UV offset
      and vertex deformation with updated selection references.
- [ ] **1.8** Apply the documented precision and typed failure rules
      to core operations; return sampling saturation information.
- [ ] **1.9** Use a real box and five-section plank through
      construction → edit → topology query → render → Quad View → GLB.

**Gate:** Authored vertices, face references, UVs and source-face
triangulation agree throughout that complete path.

## Phase 2 — Shared shape construction

**Result:** Current model shapes are built from common contour,
section, path and face-construction operations.

- [ ] **2.1** Define `Contour2`, `Profile2`, `Contour3`,
      `Section3`, `Path3`, sampled contours and explicit
      correspondence at matching landmarks.
- [ ] **2.2** Consolidate winding, contour cleanup, `adaptiveStations`
      and `stitchPolylines`. Respect sample limitations and return
      stations for all interfaces.
- [ ] **2.3** Unify `loftSections` and `loftRings` side construction,
      with real quads, inner loops, precise surface regions and
      smoothing callbacks by contour edge and interval.
- [ ] **2.4** Implement caps and explicit triangle-fan tips; retain
      complex cap triangulation with precise source boundaries.
- [ ] **2.5** Implement `bridgeBoundaries` with unequal densities,
      authored triangle transitions and corresponding sample stations.
- [ ] **2.6** Implement a section-varying path sweep with transport
      frames and a truly periodic, connected closed-path option.
- [ ] **2.7** Consolidate authored extrusion, revolution and
      profile-defined shells, preserving per-meridian face regions,
      smoothing groups, axis poles and partial-revolution seams;
      keep primitives composed from these.
- [ ] **2.8** Extract the general polar strip sampler with detailed
      outer and sparse inner section rows.
- [ ] **2.9** Implement `correspondContours` and `sampleProfile`
      with exact ordered outline/landmark stations. Verify that
      mapped top/bottom coordinates, not just normalized station
      numbers, coincide with their independently filled patch rims.
- [ ] **2.10** Reproduce the plank's bend, the dagger's steel/wood
       transitions, the barrel stave cross-section and the mug's
       curved handle through the shared constructors.

**Gate:** Different cross-sections and object categories reuse
actual geometry code, with no false quads, collapsed caps or
unexplained changes to materials/UVs.

## Phase 3 — Shared surfaces, seams and assemblies

**Result:** The table, barrel heads and chair seat can be made from
independent pieces with precise adjoining geometry.

- [ ] **3.1** Partition a simple convex source outline with
      noncrossing boundary-to-boundary polyline cuts and shared stations.
      Resulting pieces may be concave. Reserve arbitrary concave-input
      division, holes, crossing cuts and disconnected results for 6.1.
- [ ] **3.2** Return `SampledProfile2` with exact outer/hole
      boundary stations; all consumers of an interface use the same
      samples.
- [ ] **3.3** Implement `fillSurfacePatch` from exact sampled
      boundaries and a chart, refining the interior without changing
      shared boundary stations.
- [ ] **3.4** Implement `joinGeometry` with declared matching
      boundary pairs, validated winding and explicit vertex welding.
      Reject multiple welds of one edge, inconsistent matching cycles,
      duplicate faces and nonmanifold vertex fans.
- [ ] **3.5** Implement batched `shapeSurfaceRelief`, combining
      all grooves, shoulders, crown/wear features and overlaps for
      a surface in one coherent reconstruction. Preserve boundary
      coordinates required by neighboring walls; edge relief must
      taper to the seam or explicitly rebuild the interface.
- [ ] **3.6** Compose construction-time chamfers using section
      profiles and patch-boundary shaping, without requiring the
      general post-hoc edge-beveling algorithm from Phase 6.
- [ ] **3.7** Implement the result/selection lifecycle: preserve
      face and edge chains with new owners where still valid; consume
      closed rims; retain patch charts only with valid round-trip
      mapping. Arbitrary deformation invalidates patch charts by
      default, while invertible transforms update them.
- [ ] **3.8** Implement `classifyAuthoredFaces` with owned region
      updates, centralize physical UV projection and per-piece render
      tint/variation. Classification uses authored faces rather
      than GPU render index groups.
- [ ] **3.9** Reproduce the tabletop's worn but coherent plank seams,
      the barrel head's detailed outer/simple inner faces, and
      the chair's slanted rear-seat corner housings.

**Gate:** These assemblies have valid actual face topology and
consistent matching interfaces. Their distinct material regions,
UVs and local geometry survive to GLB.

## Phase 4 — Fitting, spatial queries and vessel geometry

**Result:** Geometry finds real contacts and retains the mug's
dynamic cavity behavior.

- [ ] **4.1** Query authored faces through explicit geometric
      transforms with source-face provenance, barycentrics,
      winding-based normals and a separate front-facing flag.
- [ ] **4.2** Select finite support patches by position/orientation
      and fit member sections against their complete footprints,
      including concavities and holes.
- [ ] **4.3** Support explicitly authored finite planar contacts
      alongside geometry-selected support patches for trestles and
      braces through one fitting result with discriminated contacts.
- [ ] **4.4** Fit ordered geometry boundaries onto curved targets,
      preserving other boundaries, and validate travel, face
      orientation and contact tolerance.
- [ ] **4.5** Unify frame/anchor attachment math, coordinate-space
      conversions and cycle detection.
- [ ] **4.6** Query finite surface clearance, including polygon
      chord intersections between path sample points. Separately
      verify the intended exterior-side placement of hoops and bands;
      unsigned separation does not establish inside versus outside.
- [ ] **4.7** Extract aligned cavity sections from separate inner
      stave surfaces, deduplicating horizontal row edges and resolving
      crossings at intermediate heights. Reject ambiguous seams or
      rings without matching longitudinal provenance and validate
      volume interpolation.
- [ ] **4.8** Preserve the existing fixed-topology morph targets,
      controller and serving-volume calibration through GLB/Godot.
- [ ] **4.9** Demonstrate fitted chair rails, trestle braces, mug
      handle contact, barrel bands and the complete filled mug.

**Gate:** Real finite contacts work on both planar and curved
surfaces; the mug's editor/runtime fill still works.

## Phase 5 — Complete the existing-model migration

**Result:** Every current model uses the shared geometry operations
while keeping its visual and runtime behavior.

- [ ] **5.1** Migrate `plank.ts` and `sandingpaper.ts`, including
      deformation, distinct surface materials and actual bounds.
- [ ] **5.2** Migrate `dagger.ts`, including continuous profile
      transitions, faceted edges, guard tips and grip materials.
- [ ] **5.3** Migrate `table.ts`, preserving the four worn planks,
      two trestles and fitted stretcher.
- [ ] **5.4** Migrate `barrel.ts`, preserving the 24 staves, five
      head planks per end, four hoops, laps and rivets.
- [ ] **5.5** Migrate `beerMug.ts`, preserving twelve staves,
      bands, fitted handle and fill morphs.
- [ ] **5.6** Migrate `tavernBench.ts` with its trestles, seat
      planks, stretcher and pegs.
- [ ] **5.7** Migrate `tavernChair.ts`, preserving raked back,
      fitted rails, angled housings, crest and pegs.
- [ ] **5.8** Keep `models/components/oakSeating.ts` and
      `trestleSupport.ts` as model-owned recipes built from
      the common geometric operations.
- [ ] **5.9** Preserve morph/skin/instance specialized export paths,
      texture atlases, compatible static batching and PBR appearance.
- [ ] **5.10** Detect details that collapse after Float32 export;
       verify relevant material groups, UVs, tints and Quad View
       on each migrated model.
- [ ] **5.11** Complete every model-specific acceptance condition
       in [12](12-model-by-model-proof.md), including GLB/Godot.

**Gate:** Every existing asset renders, exports and retains its
specific construction and runtime features. The general tool
abstractions have been used by geometrically different models.

## Phase 6 — General geometry editing

**Result:** The same geometry kernel handles cuts and surface edits
beyond the shapes required by the current models. Exact semantics
are in [03](03-geometry-editing.md) and [10](10-geometry-semantics.md).

- [ ] **6.1** Extend convex clipping to concave planar profiles
      with holes and multiple connected outputs.
- [ ] **6.2** Implement plane-splitting of authored surfaces/solids,
      pairing cut interfaces and labeling every resulting component
      by half-space. Handle coincident source faces without duplicating
      geometry into both halves.
- [ ] **6.3** Implement planar `openPatch` and `recessPatch` with
      explicit connected patches, new walls/floors and usable rims.
- [ ] **6.4** Implement `cutThrough` for matching entry/exit
      contours, with actual inner walls and validity checks.
- [ ] **6.5** Extend surface edits to curved patches with valid
      parameterization and explicit cut-boundary correspondence.
- [ ] **6.6** Implement edge subdivision and local topology
      refinement across adjacent faces without T-junctions.
      Implement general selected-edge `bevelEdges` on that foundation
      for explicitly supported manifold edge chains; reject junctions
      it cannot reconstruct correctly.
- [ ] **6.7** Implement solid boolean operations using the
      available `manifold-3d` kernel; return actual triangles
      with explicitly assigned surface regions and UVs.
- [ ] **6.8** Provide an explicitly scoped patch-reconstruction
      operation for selected surfaces with useful quad layout.
- [ ] **6.9** Demonstrate planar and curved openings, split solids,
      boolean faces, seams and topology transitions on geometrically
      different constructions.

**Gate:** Complex edits preserve valid source/target selections,
face regions, UVs and the real resulting topology. Valid domains
and failure conditions are enforced.

## Phase 7 — Consolidation

**Result:** The toolbox has one discoverable family of geometry
operations, with no live consumers of superseded specialized logic.

- [ ] **7.1** Remove replaced board, stave, timber, vessel,
      cap/loft, topology-query and attachment algorithms.
- [ ] **7.2** Remove duplicate render material classification
      paths, stale exports and compatibility adapters once their
      consumers have migrated.
- [ ] **7.3** Keep imports following the module dependency
      direction in [06](06-migration-map.md).
- [ ] **7.4** Rewrite the permanent `src/toolbox/README.md`
      around the actual capabilities and specific composition
      examples, with function names from the final code.
- [ ] **7.5** Verify all eight models in Quad View and GLB export,
      with the mug's active morph and other supported runtime paths.
- [ ] **7.6** Construct another cross-category geometric assembly
      through existing toolbox functions to demonstrate reuse.

**Gate:** The permanent toolbox code and documentation embody
the architecture, and all model-specific capabilities remain.

## Geometry checks with a purpose

| Construction | Required outcome |
| --- | --- |
| Adjacent parts with different requested station densities | Shared stations; no hanging vertices |
| A tapered grip and a bent rectangular plank | One loft with correct surfaces and caps |
| A hollow sweep around a periodic curve | Valid inside/outside strips and one connected seam |
| A crowned head patch with two grooves | Both relief paths resolved in one valid surface topology |
| A chair seat with different top/bottom notch positions | Sloped actual sidewalls and joined patch boundaries |
| A ray on the back of a transformed quad | Correct source-face IDs, barycentric UVs and winding normal |
| A fitting inside a concave support whose edge crosses outside | Contact rejected against the finite footprint |
| A high-curvature sample hitting max subdivision depth | Saturation/error explicitly reported |
| A plane splitting a nonconvex solid into several components | Every output labeled; corresponding interfaces paired |
| A narrow feature disappearing after Float32 export | Precision loss reported |
| Twelve mug stave inner surfaces and their volume sections | One valid ordered cavity and correct morph fill |

Run the relevant geometry checks when their operations are
implemented. Model artistic quality is reviewed directly.

This directory is removed after the intended operations, model
migrations and permanent documentation are present in the code.
