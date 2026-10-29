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
- [x] **1.2** Retain `MeshData` and its existing authored faces.
      Give each new `GeometryResult` an opaque identity and enforce
      selection ownership on `BoundaryRef` and `SurfacePatchRef`.
      Commit: `f80c8ae`.
- [x] **1.3** Establish deep-copy snapshot semantics (including
      mutable THREE vectors), document immutable-by-contract output,
      and define explicit builder welding policies. Coincident
      independent parts remain topologically distinct.
      Commit: `f80c8ae`.
- [x] **1.4** Provide one topology index for directed edges, face
      adjacency, region boundaries and connected components. Owner-
      check selected edges as well as patches and boundary loops.
      Commit: `f80c8ae`.
- [x] **1.5** Make one authored-face triangulation supply both
      render and geometric-query triangles, with face/corner mapping.
      Commit: `fe996b5`.
- [x] **1.6** Keep Quad View tied to the exact authored snapshot,
      preserving real triangles/quads independently of material order.
      Commit: `2f4a9cf`.
- [x] **1.7** Implement non-mutating authored transform, UV offset
      and vertex deformation with updated selection references.
      Commit: `c57a71a`.
- [x] **1.8** Apply the documented precision and typed failure rules
      to core operations; return sampling saturation information.
      Commits: `75af415`, `6afdaa6`, `dd24254`.
- [x] **1.9** Use a real box and five-section plank through
      construction → edit → topology query → render → Quad View → GLB.
      Commits: `2f4a9cf`, `fff7593`.

**Gate:** Authored vertices, face references, UVs and source-face
triangulation agree throughout that complete path.

## Phase 2 — Shared shape construction

**Result:** Current model shapes are built from common contour,
section, path and face-construction operations.

- [x] **2.1** Define `Contour2`, `Profile2`, `Contour3`,
      `Section3`, `Path3`, sampled contours and explicit
      correspondence at matching landmarks.
      Commit: `0847f81`.
- [x] **2.2** Consolidate winding, contour cleanup, `adaptiveStations`
      and `stitchPolylines`. Respect sample limitations and return
      stations for all interfaces.
      Commits: `75af415`, `0847f81`, `5c70ba2`.
- [x] **2.3** Unify `loftSections` and `loftRings` side construction,
      with real quads, inner loops, precise surface regions and
      smoothing callbacks by contour edge and interval.
      Shared strips: `f6abf25`. Multi-loop `Section3` walls:
      `c4a6207`. End caps and tips follow in 2.4.
- [x] **2.4** Implement caps and explicit triangle-fan tips; retain
      complex cap triangulation with precise source boundaries.
      Planar solid/annular caps, concave end contours and convex
      outward-only apex fans: `f263ebe` and follow-up refinement.
- [x] **2.5** Implement `bridgeBoundaries` with unequal densities,
      authored triangle transitions and corresponding sample stations.
      Real aligned quads, unequal-density triangles, open/periodic seams,
      owned boundary selections: `c26a1db`, `583b8aa`, `93b4c32`.
- [x] **2.6** Implement a section-varying path sweep with transport
      frames and a truly periodic, connected closed-path option.
      Authored transported sections, open-end caps and hollow profiles,
      twist-corrected periodic faces with shared seam vertices:
      `48039d9` and CI refinement.
- [x] **2.7** Consolidate authored extrusion, revolution and
      profile-defined shells, preserving per-meridian face regions,
      smoothing groups, axis poles and partial-revolution seams;
      keep primitives composed from these.
      Shared cap triangulation and old constructor adapters:
      `6d0870c`. Authored profile extrusion: `70f8bfa`.
      Meridians with open rims or radial/partial caps: `c926a05`.
      Full general surface offsets are outside this phase.
- [x] **2.8** Extract the general polar strip sampler with detailed
      outer and sparse inner section rows.
      `samplePolarStripSections` produces closed Section3 loops with
      independent outer/inner stations. The existing stave layout is
      a thin adapter. Tested through loft, end caps and Quad View:
      `2cc72f5` and follow-up verification.
- [x] **2.9** Implement `correspondContours` and `sampleProfile`
      with exact ordered outline/landmark stations. Verify that
      mapped top/bottom coordinates, not just normalized station
      numbers, coincide with their independently filled patch rims.
      Shared arc-length sampler, corner-preserving profile stations and
      named landmark anchors: `9a51881`. Planar patch-rim proof and
      shared cap triangulation preserving authored boundary edges:
      `34dd166`, `0cad2f3`. General curved `fillSurfacePatch` is 3.3.
- [x] **2.10** Reproduce the plank's bend, the dagger's steel/wood
       transitions, the barrel stave cross-section and the mug's
       curved handle through the shared constructors.
       Four model-level geometry proofs, including the tankard's real
       two-point handle fitting: `507f4be`. `loftBoard` now reuses
       `loftSideQuads`; the Catmull–Rom handle adapter reuses the
       transported `build/sweepSection`. Full model migration and
       visual/runtime acceptance remain separate work.

**Gate:** Different cross-sections and object categories reuse
actual geometry code, with no false quads, collapsed caps or
unexplained changes to materials/UVs.

## Phase 3 — Shared surfaces, seams and assemblies

**Result:** The table, barrel heads and chair seat can be made from
independent pieces with precise adjoining geometry.

- [x] **3.1** Partition a simple convex source outline with
      noncrossing boundary-to-boundary polyline cuts and shared stations.
      Resulting pieces may be concave. Reserve arbitrary concave-input
      division, holes, crossing cuts and disconnected results for 6.1.
      `partitionContour` returns independently usable Profile2 parts,
      canonical cut coordinates and stations, and transfers interface
      ownership after subsequent cuts. Commit: `c37c824`.
      Verified against a circular-head outline and extruded pieces.
- [x] **3.2** Return `SampledProfile2` with exact outer/hole
      boundary stations; all consumers of an interface use the same
      samples.
      `sampleProfile` preserves authored outer/hole corners (`9a51881`).
      `samplePartition` merges additional interface stations once,
      inserts their exact coordinates into both owners, and produces
      clockwise sampled profiles directly usable by extrusion
      (`077cc39`, `3c8a43a`).
- [x] **3.3** Implement `fillSurfacePatch` from exact sampled
      boundaries and a chart, refining the interior without changing
      shared boundary stations.
      Chart round-trip validation, owned patch/loop selections,
      adaptive conforming interior triangulation and explicit
      boundary sampling limits: `8a1cc12`, `3650b03`.
      Tested with hole loops, curved shared interfaces, independent
      extrusion rims and the render-control-mesh pipeline.
- [x] **3.4** Implement `joinGeometry` with declared matching
      boundary pairs, validated winding and explicit vertex welding.
      Reject multiple welds of one edge, inconsistent matching cycles,
      duplicate faces and nonmanifold vertex fans.
      Union-find vertex identities, matching oriented face-edge uses,
      open-chain/periodic-seam correspondence, typed failures, selection
      remapping, and surviving patch charts: `5827ff4` through `19b3bf2`.
      Verified on tubes, charted caps, partial edge joins, competing
      welds, duplicate faces and pinched closed shells.
- [x] **3.5** Implement batched `shapeSurfaceRelief`, combining
      all grooves, shoulders, crown/wear features and overlaps for
      a surface in one coherent reconstruction. Preserve boundary
      coordinates required by neighboring walls; edge relief must
      taper to the seam or explicitly rebuild the interface.
      One selected charted patch, named path fields, union of feature
      stations, signed `minimum`/`sum` overlap, conforming interior
      edge refinement and UV/region reconstruction. Shared rims remain
      untouched; stray paths, rim intrusion, and sampled penetration
      of nonselected mating faces fail explicitly. Verified with
      intersecting grooves, positive crowns, wear, joined walls and
      holes: `69628b5` through `2463128`.
      General continuous-surface self-intersection guarantees belong
      to the later editing/Boolean phases.
- [x] **3.6** Compose construction-time chamfers using section
      profiles and patch-boundary shaping, without requiring the
      general post-hoc edge-beveling algorithm from Phase 6.
      `shapeSectionCorners` makes selected convex corner cuts into
      straight chamfers or tangent circular arcs, retaining the source
      edge/transition provenance for loft regions. One authored shaped
      profile composes with multi-station `loftSectionWalls`, caps,
      `extrudeContour`, and a separately charted `fillSurfacePatch`
      welded by `joinGeometry` (`34f0a49`, `da85cc9`). Existing
      per-model edge detail remains until full model migration;
      general mesh-edge beveling stays in Phase 6.
- [x] **3.7** Implement the result/selection lifecycle: preserve
      face and edge chains with new owners where still valid; consume
      closed rims; retain patch charts only with valid round-trip
      mapping. Arbitrary deformation invalidates patch charts by
      default, while invertible transforms update them.
      The shared `transferBoundary` carries only surviving ordered edge
      runs, splitting partial selections and dropping consumed or
      superseded edges. `patchChartMatches` checks owner, connected
      authored faces, vertex/chart round trips, finite interior samples
      and normal orientation. Join, cap/tip, relief, transforms and
      UV edits use these policies; deformation drops parameterized
      patches. Transform charts snapshot caller matrices. Tests cover
      partial welds, cap aliases, invalid charts, stale selections and
      transform ownership (`8af6297` through `6a477e4`).
- [x] **3.8** Implement `classifyAuthoredFaces` with owned region
      updates, centralize physical UV projection and per-piece render
      tint/variation. Classification uses authored faces rather
      than GPU render index groups.
      `classifyAuthoredFaces` evaluates authored quad/triangle normals
      and area-weighted centroids, reissues regions and surviving
      selections. `projectAuthoredUvs` assigns independent face-corner
      coordinates using any projector; `planarUvProjector` derives
      physical metres from a rigid frame. `surfaceMesh` can apply
      per-piece vertex tint to render buffers without modifying source
      geometry or materials. Verified in material, UV and integration
      tests (`ccab36a` through `9059bad`).
- [x] **3.9** Reproduce the tabletop's worn but coherent plank seams,
      the barrel head's detailed outer/simple inner faces, and
      the chair's slanted rear-seat corner housings.
      Integration proofs compose existing generic contour partition,
      shared sampling, charted patch construction, batched relief,
      boundary bridging, lofts and explicit welding. Four independent
      tabletop boards share wandering seam stations, then receive
      intentional assembly clearance; one interior board has two
      reconstructed wear/groove profiles. Five circular head boards
      have separately detailed outward and sparse inward surfaces,
      and a middle board joins two grooves without opening its seams.
      The chair seat keeps different top/bottom rear-notch positions
      and genuinely sloped wall faces. All outputs have closed,
      connected authored topology. The five-piece head additionally
      survives the actual GLB pipeline with its material colors, UVs
      and vertex tint. Tests: `phase-three-assemblies.test.mjs`
      (`f04dcf3` through `5605adb`). These are construction proofs;
      migrating the live model recipes remains Phase 5.

**Gate:** These assemblies have valid actual face topology and
consistent matching interfaces. Their distinct material regions,
UVs and local geometry survive to GLB.

## Phase 4 — Fitting, spatial queries and vessel geometry

**Result:** Geometry finds real contacts and retains the mug's
dynamic cavity behavior.

- [x] **4.1** Query authored faces through explicit geometric
      transforms with source-face provenance, barycentrics,
      winding-based normals and a separate front-facing flag.
      `raycastSurface` and the shared `surfaceTriangles` world-space
      adapter use the same authored quad split and face-corner provenance
      as the renderer. Rays return nearest hits in world metres without
      flipping geometric normals; negative determinants, nonuniform
      scale, shears, nonplanar quads, UV seams and miss/distance limits
      are exercised. Malformed raw faces and noninvertible transforms
      fail with typed errors. Verified in
      `tests/geometry/queries/surface-query.test.mjs`
      (`e139c86` through `7ab09b6`).
- [x] **4.2** Select finite support patches by position/orientation
      and fit member sections against their complete footprints,
      including concavities and holes.
      `findFacingPatch` selects the nearest connected coplanar authored
      faces and returns their rigid world contact frame. The shared
      `finiteFootprintContains` clips every triangulated member-section
      face against the finite support triangles and checks complete area
      coverage, not merely corners or outline edges; enclosed support
      holes and concave notches fail. `fitBetweenSurfaces` intersects
      every outer/inner section corner along the member axis with both
      contact planes, validates entire support coverage and positive
      section travel, and returns world-space sections plus typed
      surface contacts. Verified in `finite-fitting.test.mjs` and
      `facing-patch.test.mjs` (`a19280a` through `b12dbb9`).
      The support tests also exposed inward extrusion winding;
      `extrudeContour` now produces outward caps and sidewalls
      (`e7c6b5c`, `04a8f56`).
- [x] **4.3** Support explicitly authored finite planar contacts
      alongside geometry-selected support patches for trestles and
      braces through one fitting result with discriminated contacts.
      `fitBetweenSurfaces` resolves either a real authored-face patch
      or an `AuthoredPlanarSupport` to one finite triangulated contact
      footprint. Both variants use identical member-axis intersection
      and complete section-coverage checks, including concavities and
      holes. Explicit frames must be rigid, right-handed and oriented
      toward the member; the result discriminates `surface` from
      `authored-plane` contacts. Tests cover mesh/plane mixes, two
      authored planes, false exterior fit, support holes and invalid
      transforms (`a9da536` through `83fafff`).
- [x] **4.4** Fit ordered geometry boundaries onto curved targets,
      preserving other boundaries, and validate travel, face
      orientation and contact tolerance.
      `fitBoundary` projects owned, ordered open or closed edge chains
      onto finite authored target triangles using a world-space ray or
      closest-point query. The chosen geometric normal determines signed
      clearance, not the source's ray direction or global Z. The
      operation validates selection topology, transform invertibility,
      maximum travel, target-facing orientation, face winding and
      post-transform world-space contact tolerance. The fitted stations
      and authored faces retain their indices, independent named and
      unnamed rims remain fixed, and constrained graph-distance
      falloff does not cross those rims. Results re-own surviving
      selections and drop invalidated surface charts. Verified in
      `tests/geometry/queries/fit-boundary.test.mjs`
      (`0e79c00` through `487df45`).
- [x] **4.5** Unify frame/anchor attachment math, coordinate-space
      conversions and cycle detection.
      `attachAtFrames` now implements the single parent-local
      transformation `parentFrame * matingTransform * inverse(childFrame)`.
      Both `attachByFrames` and `attachByAnchors` delegate to it;
      nested anchors use `frameFromAncestor` to calculate their actual
      child-local frame. `frameToWorld` and `frameToLocal` handle
      ordinary hierarchy coordinate conversions. Validation is
      non-mutating until hierarchy cycles, singular/invalid transforms
      and Object3D-inexpressible shear are ruled out. Integration tests
      cover nested anchors, explicit mating rotations, world/local
      round trips, and rejected attachments (`6671c01` through
      `9f62358`).
- [x] **4.6** Query finite surface clearance, including polygon
      chord intersections between path sample points. Separately
      verify the intended exterior-side placement of hoops and bands;
      unsigned separation does not establish inside versus outside.
      `surfaceClearance` evaluates actual transformed authored
      triangles: vertex-to-triangle proximity, finite edge-to-edge
      closest approaches, edge piercings through triangle interiors,
      and coplanar crossing edges. AABB pair rejection avoids most
      distant comparisons without replacing the exact surface test.
      `verifyExteriorPlacement` separately checks the candidate's
      outward normal-side placement against the oriented support,
      refusing intersections and ambiguous contacts; open support
      normals remain a local side diagnostic, not a solid containment
      proof. Regression tests include a twelve-sided barrel and
      rotated band, including a chord that cuts through the barrel
      between valid radial endpoints, inward nested bands, and
      real world-space clearances
      (`06a82d1` through `0b6625f`).
- [x] **4.7** Extract aligned cavity sections from separate inner
      stave surfaces, deduplicating horizontal row edges and resolving
      crossings at intermediate heights. Reject ambiguous seams or
      rings without matching longitudinal provenance and validate
      volume interpolation.
      `cavitySectionsFromSurfaces` reconstructs a single ordered
      section-local XZ loop from independently transformed, planar
      longitudinal wall strips. It preserves row-edge identity,
      merges coincident cross-piece seam columns, and follows the
      same longitudinal stations at every requested height.
      Authored quads and uniquely paired planar triangles are supported;
      ambiguous pairings, nonplanar strips, doubled seams, missing
      loops, disconnected or crossing contours and changed station
      provenance fail explicitly. Requested heights must include all
      intervening authored rows, and analytic interpolation checks
      catch even brief edge crossings and winding inversions between
      rings. Output is directly usable by `ProfiledCavity`.
      The original twelve-stave wooden mug's reconstructed capacity
      and 90% serving height agree with the existing fill behavior.
      Verified in `tests/geometry/queries/cavity-sections.test.mjs`
      (`c6efaf8` through `c5b84f2`).
- [x] **4.8** Preserve the existing fixed-topology morph targets,
      controller and serving-volume calibration through GLB/Godot.
      The wooden mug now builds its serving cavity from the authored
      twelve-stave sections provided by `cavitySectionsFromSurfaces`.
      All eight named morph targets, neutral full mesh, 0–1 controller,
      90% serving calibration, runtime clone and binary glTF target
      names/weights are covered by the integrated tankard test.
      Godot consumes the exported blend shapes; native editor/runtime
      inspection remains a manual model-acceptance check in 5.11.
      Commits: `5876f20`, `4aa0346`.
- [x] **4.9** Demonstrate fitted chair rails, trestle braces, mug
      handle contact, barrel bands and the complete filled mug.
      `phase-four-fitted-assemblies.test.mjs` now fits the chair's two
      front rails against the finite faces of its leaning legs, including
      a rejected oversized rail. The two actual table-trestle brace
      locations resolve against authored foot and post contact patches.
      Both build closed quad meshes with retained UVs and end grains.
      The chair apron was lowered 2 mm to keep its full profile within
      the finite post face.
      A barrel hoop exposes its actual authored quads through
      `bandAroundProfileData`, and the 48-segment band is checked
      for clearance and outward placement against 24 real radial
      staves, not an idealized cylinder. The wooden tankard's two
      fitted handle rims meet the actual first stave. A complete
      geometric tankard, with twelve staves, bottom, handle, two
      iron bands and eight named fill morphs, exports together to
      binary GLB while static geometry batches independently.
      The integrated proofs use production construction functions,
      but are not a claim that every live model recipe has already
      migrated; that is Phase 5. Native Godot blend-shape behavior
      still requires the manual 5.11 inspection.
      Commits: `fa3d43b`, `c15c5fd`, `151e84c`, `1f4a1e8`.

**Gate:** Real finite contacts work on both planar and curved
surfaces; the mug's editor/runtime fill still works.

## Phase 5 — Complete the existing-model migration

**Result:** Every current model uses the shared geometry operations
while keeping its visual and runtime behavior.

- [x] **5.1** Migrate `plank.ts` and `sandingpaper.ts`, including
      deformation, distinct surface materials and actual bounds.
      The plank now composes `loftSectionWalls` with two authored
      `capBoundary` calls. The shared loft accepts the already-supported
      per-edge UV mode so its previous five-section form and physical
      UVs remain unchanged. The sanding sheet uses nonmutating
      `deformVertices` on an authored, subdivided box and is placed
      using its actual deformed bounds. Both compile through
      `surfaceMesh` with original surface-material distinctions.
      `phase-five-simple-models.test.mjs` checks the migrated forms,
      quads, UVs, material regions and bounds. Commits: `0a2aa66`,
      `aec6358`.
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
