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
      The original visual baseline was not captured before migration,
      so it cannot honestly be reconstructed afterward. The eight
      models were subsequently reviewed in Godot under 5.11, and
      the owner confirmed the final visual acceptance. The missing
      historical baseline is not represented as a completed capture.
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
- [x] **5.2** Migrate `dagger.ts`, including continuous profile
      transitions, faceted edges, guard tips and grip materials.
      The model owns three authored shape recipes and separates pure
      `buildDaggerGeometry` from materials. `profiledSolid` composes
      `profileSpans`, optional `mirrorStations`, `sampleAxialSections`,
      `loftSectionWalls` and the shared `tipBoundary`/`capBoundary`
      operations; `profiledMesh` remains an optional rendering adapter.
      The older `loftAxialProfile` also uses the shared section sampler
      so contour construction has one source of truth.
      `phase-five-dagger.test.mjs` checks the blade, mirrored quillon
      and continuous iron/oak/iron grip against the prior form: exact
      vertices, quad topology, side UVs, smoothing and region counts;
      tips, closed topology, Quad View and binary GLB material breaks.
      Native Godot appearance is part of model acceptance in 5.11.
      Commits: `ac8972f`, `e744fce`, `8edab2f`, `dd9fdc1`,
      `cd19c92`.
- [x] **5.3** Migrate `table.ts`, preserving the four worn planks,
      two trestles and fitted stretcher.
      The tabletop no longer calls `boardPanel`. Its model-owned
      `boardedSurface` recipe uses shared weighted cuts, seeded seam
      profiles, adaptive station union and the common loft engine.
      All four independent oak boards retain the earlier exact vertex
      positions, control quads, UVs, irregular gaps, wear, end grain,
      tint and surface-material layout.
      `tableTimberGeometry` authors square-cut trestle members as
      owned boxes and normal-fitted members as owned section solids;
      the original transform hierarchy and seeded oak variation
      remain. Both diagonals and the full longitudinal stretcher
      now use `fitBetweenSurfaces` against their actual finite foot
      and post meshes. Invalid full-section contacts fail instead
      of silently extending beyond a bearing face.
      `phase-five-table.test.mjs` checks the original boards against
      the new geometry, closed trestle topology, material groups,
      Quad View, transform hierarchy and finite-contact rejection.
      Native visual and GLB/Godot acceptance remain under 5.9–5.11.
      Commits: `03766f1`, `29a2a91`, `e5d1430`, `ba2c4f2`,
      `64e7dec`, `7897fd1`, `38c4a32`, `18d2d13`,
      `3eef5d7`.
- [x] **5.4** Migrate `barrel.ts`, preserving the 24 staves, five
      head planks per end, four hoops, laps and rivets.
      The model-owned `cooperedBody` uses `samplePolarStripSections`
      and the shared mixed-density `loftBoard`, preserving all 24
      original stave vertex positions, faces and UVs. Both five-board
      heads now use the model-owned `cooperedHead` recipe: weighted
      convex cuts, shared seam wander and coordinated adaptive stations.
      The generic `seamedPlankExtrusionData` exposes the existing
      authored geometry before GPU compilation; the original
      `seamedPlankExtrusion` renderer remains compatible with older
      callers. All ten finished head meshes are exact geometric matches
      for the previous control meshes, including their actual quads,
      transition triangles, cut/recess regions, UVs and fitted wear.
      `buildBarrelHoopGeometry` owns the four hoop placements, raised
      lap straps and eight rivets. Their shapes and transforms are
      consumed by the live model and the integration proof alike.
      `surfaceMesh` compiles every barrel part, preserving wood/iron
      materials, UV offsets, vertex tints and the authored Quad View.
      The `phase-five-barrel.test.mjs` regression verifies the full
      50-mesh assembly, closed topology and binary GLB export
      (196 repository tests passing). Legacy construction adapters
      remain for other callers; this step does not claim that every
      historical toolbox helper has already been retired. Native Godot
      visual inspection stays in 5.11.
      Commits: `80cd049`, `b7793ca`, `ed5c6d2`, `d60916e`,
      `963e1f1`, `2e28e62`, `812313c`, `618d3bf`, `50a8d31`.
- [x] **5.5** Migrate `beerMug.ts`, preserving twelve staves,
      bands, fitted handle and fill morphs.
      `cooperedStaves` now builds both the 24-stave barrel and the
      twelve-stave tankard through `samplePolarStripSections` and
      `loftBoard`; the old barrel-only model component was replaced.
      The tankard's body, inset floor, two wrought-iron bands and
      grip now stay as owned `GeometryResult` constructions until
      `surfaceMesh` compiles their rendering geometry. The grip
      is a transported authored sweep whose two genuine cap rims
      are fitted against the stave's finite surface with the shared
      `fitBoundary` operation; its ray projection now supports a
      general outward origin offset so rays can start outside wood
      even when a draft mount begins inside its contact envelope.
      The serving cavity is still extracted from the authored inner
      stave faces, with its volume-calibrated 90% serving limit.
      `createFillableVolume` retains the eight named morph targets,
      noncollapsed full base, initial 0.65 fill, 0–1 controller,
      Godot-compatible blend-shape weights and binary GLB export.
      `phase-five-tankard.test.mjs` checks the migrated staves against
      their previous geometry and both bands against their authored
      render controls. Existing integration proofs cover both fitted
      handle rims, finite wall cavity, serving calibration, the
      full seventeen-part tankard and morph-preserving GLB export.
      All 197 repository tests, typecheck and build pass. Native
      Godot/editor appearance and fill controls remain for 5.11.
      Commits: `038b8be`, `a64cec4`, `0d76e1a`,
      `f494b7f`, `78159f8`, `5927657`.
- [x] **5.6** Migrate `tavernBench.ts` with its trestles, seat
      planks, stretcher and pegs.
      The bench's `BENCH_SEAT` recipe uses `oakPanelGeometry`,
      which composes the shared `boardedSurface` operation with its
      original three weighted, worn oak planks. Their positions,
      control quads, UVs, shared seams, crown and wood cuts match
      the previous `boardPanel` result in the regression proof.
      `trestleTimbers` exposes the five-member support cut list
      independently of any renderer; `createTrestleSupport` still
      assembles that same list for existing callers. The bench
      constructs two complete authored trestles through
      `tableTimberGeometry` and `tableTimberBetweenSurfaces`.
      Both diagonal braces are fitted against finite foot and
      post faces. The full 75 mm longitudinal stretcher is
      separately fitted against the two inward-facing authored
      post surfaces, including each member's local transform.
      `oakTimberShop` finishes these owned results using
      `surfaceMesh`; its eight distinct oak peg solids preserve
      their original locations and orientations. No contact
      geometry is recovered from a render buffer.
      `phase-five-bench.test.mjs` compares the full three-board
      seat against its previous mesh, verifies closed support
      and stretcher topology and Quad View, and exports the
      complete 22-mesh bench assembly to binary GLB.
      All 199 repository tests, typecheck and build passed.
      Native Godot/visual appearance remains for 5.11.
      Commits: `fec590a`, `3ecab0b`, `eaaa5a3`,
      `6cf5082`, `c470e9c`, `82ead75`,
      `959b503`, `0837102`.
- [x] **5.7** Migrate `tavernChair.ts`, preserving raked back,
      fitted rails, angled housings, crest and pegs.
      `chairGeometry` now owns the dimensions and material-free recipes:
      four raked/mitered posts, nine full-section rails fitted against
      their real finite contact patches, twelve oriented draw-pegs
      selected from actual post faces, two front seat boards, three
      back-infill boards, the raked corner-housed rear seat and its
      asymmetrically crowned crest. `tavernChair.ts` only assembles
      those results through the shared oak material workshop, retaining
      board transforms, wood variation, end-grain and Quad View.
      The 54 cm lower back rail's roll follows the post rake, and its
      support contact is recessed 2 mm for a valid full footprint.
      The general `findFacingPatch` query now scores nearest suitable
      faces by distance along the approach direction, avoiding grazing
      sidewall selection when a joint hint lies inside a support.
      The rear seat's different upper/lower housing contours are
      built by the new general `layeredGridSolid` operation: sampled
      corresponding layers, filled cells, separate face profiles,
      honest sloping cut walls and uniform edge bevels. The old
      `cutBoard` entry point delegates to that reusable geometry
      operation rather than maintaining its own mesh construction.
      `phase-five-chair.test.mjs` checks the full authored frame,
      real peg normals, seat-board shape preservation, closed topology,
      UVs, Quad View and the complete 32-mesh binary GLB export.
      An independent layered-grid test proves that upper and lower
      cut outlines can differ without opening the resulting solid.
      All 204 repository tests, typecheck and build pass.
      Native Godot/editor visual acceptance remains part of 5.11.
      Commits: `f99c761`, `2589c4f`, `97b6dc8`,
      `296df32`, `ff95153`, `6666c43`, `7ce19ee`,
      `5205720`, `21f4244`, `64d9fd5`, `3880ccd`.
- [x] **5.8** Keep `models/components/oakSeating.ts` and
      `trestleSupport.ts` as model-owned recipes built from
      the common geometric operations.
      The oak workshop owns material, end-grain, UV, peg and wood
      variation decisions, while delegating board and timber solids
      to the shared construction pipeline. The trestle component
      owns its five-member cut list and rendered assembly; fitted
      contacts use authored surfaces rather than render-buffer
      reconstruction. Table, bench and chair migration proofs
      exercise these compositions without moving carpentry recipes
      into the geometric kernel. Already in place by 5.7.
- [x] **5.9** Preserve morph/skin/instance specialized export paths,
      texture atlases, compatible static batching and PBR appearance.
      Runtime compilation keeps morph targets and their independent
      weights, clones complete skinned hierarchies, and preserves
      instance matrices and instance colors. Static meshes with a
      single material now batch even when their source BufferGeometry
      contains multi-material group indices: Three.js ignores those
      groups for single-material meshes, and the exporter does too.
      Compatible PBR maps share an atlas with retained material tint,
      UV channels, normal/roughness maps and color space. Binary GLB
      proofs verify morph weights, skin/joint references and
      EXT_mesh_gpu_instancing attributes, not merely runtime clones.
      Commits: `dd86ddc`, `2351f54`, `e24ff78`.
- [x] **5.10** Detect details that collapse after Float32 export;
       verify relevant material groups, UVs, tints and Quad View
       on each migrated model.
       Authored `toBufferGeometry` already rejects triangles that
       collapse or reverse during Float32 conversion. Static runtime
       batching additionally checks the transformed world-space
       triangles before atlas UV subdivision: a part may remain valid
       locally but become unrepresentable after distant placement.
       Precision failure names the offending mesh instead of silently
       producing broken GLB triangles. The integrated model proofs
       retain material regions, Quad View topology, surface UVs,
       tints and binary GLB output; the runtime proof exercises both
       the precision failure and a representable placement.
       All 208 tests, typecheck and build pass in CI.
       Commit: `e015734`.
- [x] **5.11** Complete every model-specific acceptance condition
       in [12](12-model-by-model-proof.md), including GLB/Godot.
       All existing models were manually exported and inspected in Godot;
       geometry, material appearance and runtime behavior were accepted.
       The tankard alone exposed missing UVs on its eight liquid morph
       targets during tangent generation. Shared `createFillableVolume`
       now supplies cylindrical side and planar cap UVs without changing
       the geometry, weights or fill calibration. Its GLB regression also
       checks TEXCOORD_0; the subsequent Godot import was clean.
       Commit: `7d29ccc`.

**Gate:** Every existing asset renders, exports and retains its
specific construction and runtime features. The general tool
abstractions have been used by geometrically different models.

## Phase 6 — General geometry editing

**Result:** The same geometry kernel handles cuts and surface edits
beyond the shapes required by the current models. Exact semantics
are in [03](03-geometry-editing.md) and [10](10-geometry-semantics.md).

- [x] **6.1** Extend convex clipping to concave planar profiles
      with holes and multiple connected outputs.
      The general `clipContour` triangulates a validated Profile2
      domain, clips each triangle through cached shared edge
      intersections, cancels internal edges and reconstructs ordered
      outer/hole loops. Each independent kept island is returned as a
      separate Profile2; a cut-open hole becomes an outer notch.
      Input loops remain untouched, while touching/self-intersecting
      profiles and ambiguous point contacts fail explicitly. The
      original convex clipping fast path remains available.
      Independent results have been extruded as closed solids,
      including an enclosed hole and two distinct concave islands.
      Commits: `d028b24` and follow-up validation.
- [x] **6.2** Implement plane-splitting of authored surfaces/solids,
      pairing cut interfaces and labeling every resulting component
      by half-space. Handle coincident source faces without duplicating
      geometry into both halves.
      `splitByPlane` accepts authored `MeshData` or `GeometryResult`
      and an oriented plane. Shared undirected-edge intersections are
      evaluated once; surviving faces retain their region, smoothing
      policy and interpolated corner UVs. Fully retained quads stay quads;
      a crossed warped quad follows its actual render diagonal instead
      of claiming to be planar. Each connected half-space component
      receives its own result and side label. Closed manifold solids
      can be capped with the existing `capSectionEnd` construction,
      including annular cuts; open shells keep paired open cut chains.
      `PartitionInterface` connects opposite ordered cut boundaries
      through one sampled boundary. Unchanged named edge runs and
      verified charted patches are reissued with new owners; interrupted
      references do not survive on unrelated faces. Coplanar source
      faces are assigned to their volume side once, and tangent
      planes create no artificial cap or interface.
      Integration checks cover orthogonal and skew cuts, existing
      corners, warped quads, holes, multiple independent solids,
      touching coplanar solid faces, open shells, material regions,
      UVs, Quad View, oriented caps and selection ownership.
      Commits: `bdbe63f` through `00077a5`.
- [x] **6.3** Implement planar `openPatch` and `recessPatch` with
      explicit connected patches, new walls/floors and usable rims.
      A source-owned `SurfacePatchRef` identifies one connected
      planar footprint. Boundary loops come from its authored face
      edge uses; existing boundary vertex IDs and neighboring faces
      remain unchanged. An entirely interior opening joins the
      footprint as another hole through `triangulateProfile`.
      The operation recreates the selected patch with physical UVs
      mapped through its verified global affine texture chart.
      `openPatch` exposes an actual open rim; `recessPatch` adds
      four-sided walls, a planar floor, named opening/floor rims and
      a usable floor chart. Both retain compatible named boundaries,
      neighboring patches and fresh result ownership. Repeated
      separate openings and existing holes are supported; intersecting,
      nested and perimeter-touching openings fail. A patch with
      multiple surface assignments, discontinuous/nonlinear UVs or
      nonplanar geometry is explicitly unsupported here. Pocket depth
      is checked against existing surfaces at the opening's corners,
      edge midpoints and triangulated interior samples.
      The shared planar triangulator validates every authored rim
      and can choose a deterministic alternate 2D orientation when
      Earcut's horizontal hole bridging loses an edge; source
      positions and stations never move. CI checks closed box pockets,
      open sheet holes, repeated openings, neighboring mesh edges,
      preserved selections, UV continuity, orientation and rejection
      of unsupported domains. Commits: `4d3efaf`, `13658fb`,
      `ca028e3`, `037e057`, `bfa5f0e`.
      All 232 tests, typecheck and build pass.
- [x] **6.4** Implement `cutThrough` for matching entry/exit
      contours, with actual inner walls and validity checks.
      The operation composes two planar `openPatch` edits, a
      `bridgeBoundaries` wall and two explicit `joinGeometry` welds.
      Input selections are source-owned, planar, disjoint and opposite
      facing on one closed manifold shell. The opening contours must
      admit one exact cyclic correspondence after the opposite rim is
      reversed, with a positive normal-aligned displacement and
      consistent stations; tapered/twisted/offset openings are
      deliberately rejected. The corridor is tested against untouched
      faces at rim vertices, edge midpoints and interior triangle
      centroids before welding. The output is one closed connected
      solid with genuine inner wall quads, semantic wall regions,
      physical wall UVs, retained external surface selections and
      named `through-entry`/`through-exit` interior seam chains.
      Checked on top/bottom and side-to-side cuts, rectangular and
      six-station sections, blocked corridors, selection ownership,
      Quad View/export and invalid inputs. The result does not
      assert a general solid boolean or a complete analytic
      collision proof; those are separate capabilities.
      Commits: `d696179`, `c3c6f2b`, `44a4c83`,
      `e7d3496`, `f84e571`.
- [x] **6.5** Extend surface edits to curved patches with valid
      parameterization and explicit cut-boundary correspondence.
      Both `openPatch` and `recessPatch` reconstruct a charted,
      connected surface using the common `fillSurfacePatch` kernel.
      Its adaptive interior triangulation leaves every shared outer
      and existing inner contour station untouched. The new opening
      is represented by an exact ordered rim with the caller's
      requested stations; insufficient rim sampling reports a
      sampling limit, not invented boundary vertices.
      Recess walls follow each corresponding entry/floor rim edge,
      while the floor is displaced along the local chart normal.
      The offset surface has a numerically invertible 2D chart;
      singular or folded offsets are rejected. Both rebuilt surface
      and pocket floor are adaptively triangulated with finite
      chart-deviation checks, retained material UV mapping, named
      boundary selections and verified new patch ownership.
      Internal edge regularization is shared between curved
      filling and surface relief; it never flips the protected
      authored rim. Tests exercise a crowned surface, a genuinely
      normal-offset floor, UV and chart roundtrips, exact seam
      station preservation and insufficient contour sampling.
      Straight `cutThrough` remains explicitly planar.
- [x] **6.6** Implement shared edge subdivision and explicitly
      supported selected-edge beveling with reconstructed manifold
      faces. `subdivideEdges` propagates every station to all incident
      authored faces with face-local UVs and no hanging vertices;
      unsupported warped/concave quads and degenerate splits fail.
      `bevelEdges` supports individual convex manifold edges,
      complete convex triangular/quad prismatic cap rings (also
      multiple disjoint rings), and ordered nonbranching open
      chains of two or more edges through trihedral convex corners.
      Each adjacent selected edge has two convex planar incident
      faces; consecutive pairs share exactly one incident face.
      At each inner corner, the shared-face offset lines produce
      one physical miter vertex and the two remaining faces meet
      at one valid station on their unselected third edge.
      The solver handles changing common faces along the chain;
      it reconstructs each affected source face only once,
      preserves face-local material regions and affine corner UVs,
      and produces physical chamfer quads with two terminating
      triangles at the chain ends. Both `bevel-upper` and
      `bevel-lower` are continuous selectable edge chains even
      across face changes. Original named selections are reissued
      only when valid; previous named bevels are not overwritten.
      CI covers triangular prisms, multiple rings, single edges,
      two/three/four-edge open chains crossing different faces,
      reversed orientation, variable width, manifold topology,
      signed solid volume, export and downstream subdivision/split.
      Nontrihedral or branched junctions, unsupported multi-face
      closed loops, concave/warped face domains and invalid widths
      explicitly fail; the operation does not promise unrestricted
      filleting or automatic retopology.
- [x] **6.7** Implement `booleanSolids()` with the
      `manifold-3d` WASM kernel for union, intersection and difference.
      Inputs are closed, consistently oriented authored solids;
      `MeshData` or owned `GeometryResult` are accepted.
      Source quads/triangles become actual triangulated input faces,
      with separate per-corner UV attributes and exact merge indices
      for shared physical construction vertices. Each source
      material/smoothing group has a unique Manifold original ID.
      Result runs recover those names, plus `first:`, `second:`
      and difference-`cut:` provenance; optional `regionAt` and
      `uvAt` callbacks can override all output triangle regions and
      UVs. No invented control quads or stale face selections.
      An empty intersection is an owned empty result. Float32
      input precision loss and invalid manifold operands fail
      explicitly. Source operands remain unchanged; WASM geometry
      objects are disposed after evaluation. The module initializes
      asynchronously, so the public operation returns a Promise.
      CI checks overlap union/intersection/difference volumes,
      fully enclosed cavities, disjoint components, mixed rotated
      solids, chained Booleans, UV/material/smoothing provenance,
      custom classification/projection, Quad View representation,
      and actual multi-material GLB serialization.
- [x] **6.8** Implement `reconstructPatchQuads()` as an
      explicitly scoped post-triangulation patch reconstruction.
      Select an existing material region by name or an owned
      regular `SurfacePatchRef`. Compatible neighboring pairs
      of actual triangles become real authored quads **only**
      when they share an oppositely directed physical diagonal,
      matching material/smoothing assignments, compatible UV
      values at both diagonal endpoints, and a planar, strictly
      convex four-corner footprint. Quad corner order preserves
      the exact two original render triangles and UVs. Candidate
      pairs are chosen deterministically by shape quality; no
      vertices are invented, neighboring edges are subdivided,
      or unrelated faces changed. Unmatched triangles remain
      triangles, or `requireComplete` rejects the edit.
      Valid old edge chains and charted patches are transferred
      with the new owner's IDs; consumed diagonals disappear.
      An ad-hoc charted input patch also returns its new selection
      as `quad-reconstructed`. The operation supports mixed
      meshes, grid patches and selected Boolean regions, but
      does not claim automatic global quad retopology.
      CI covers an exact triangulated box, a four-cell grid,
      an explicitly selected Boolean surface, seams, warped
      surfaces, partial reconstruction, genuine authored Quad
      View topology and selection invalidation.
- [x] **6.9** Demonstrate planar and curved openings, split solids,
      boolean faces, seams and topology transitions on geometrically
      different constructions.
      The cross-operation integration suite
      `tests/geometry/integration/phase-six-complex-edits.test.mjs`
      exercises four deliberately different geometry pipelines:
      a planar pocket on a segmented box followed by a capped plane
      split and exact floor-quad reconstruction; a straight through-bore
      followed by an annular two-interface plane cut and a material-aware
      Boolean difference; an analytic crowned surface with both an
      actual opening and a normal-offset recessed floor; and a
      hexagonal extrusion followed by a plane split, Boolean cut,
      Quad View inspection and real runtime GLB serialization alongside
      a separately constructed bored solid.
      Checks include input immutability, connected components and open
      boundaries, physically matching named seam edges, reissued
      selection owners, retained material/smoothing/UV regions, UV
      seam survival, preserved contour stations, local offset-chart
      inverse round-trips, signed volume conservation across planar
      splits, actual cut volume reduction, genuine control quad counts,
      and UV/material attributes in the exported GLB.
      This verifies the explicit Phase 6 domains, not unrestricted
      remeshing or arbitrary curved through-tunnels.

**Gate:** Complex edits preserve valid source/target selections,
face regions, UVs and the real resulting topology. Valid domains
and failure conditions are enforced.

## Phase 7 — Consolidation

**Result:** The toolbox has one discoverable family of geometry
operations, with no live consumers of superseded specialized logic.

- [x] **7.1** Remove replaced board, stave, timber, vessel,
      cap/loft, topology-query and attachment algorithms.
      First cleanup removed unused fitting adapters
      (`fitBetweenSupports`, `fitBoundaryToSurface`,
      `supportFacePlane`), the stale `profiledMesh` wrapper and
      the unused rectangle-specific corner-mount generator.
      Fitted timbers in the table/trestle assembly now construct both
      plane-cut and surface-fitted ends through the same authored
      `loftSectionWalls` and `capBoundary` path, without the model's
      earlier `beamBetweenPlanes`/`loftSections` dependency.
      The superseded render-first `beams.ts`, `beamBetweenPlanes.ts`
      and `timber.ts` have no remaining model consumers and were
      removed. Fitted member normals now have a neutral geometry
      definition rather than depending on a rendering constructor.
      The `radialStaves` and `radialStripLayout` compatibility
      constructors are removed. Barrel/tankard and clearance tests now
      inspect the actual `cooperedStaves` results and their authored
      surfaces instead of comparing against superseded stave geometry.
      Chord clearance and polar points remain general build operations.
      The rectangle-only `loftSections` adapter is removed; its tests
      now use `loftSectionWalls` and `capBoundary` directly. Plank
      integrations validate authored stations, topology, UVs and export
      without a second copy of the obsolete constructor.
      The unused `loftRings` and `loftAxialProfile` wrappers are
      removed as well. Dagger regression checks now validate sampled
      section positions, physical quads, material/smoothing transitions,
      endpoint topology and runtime GLB instead of building a duplicate
      dagger with the compatibility path.
      Unused vessel recipes `turnedVessel`, `latheMeridian`
      and the render-first `revolveShell` wrapper are removed.
      Revolution tests directly exercise `revolveMeridianMesh` on
      closed hollow shells, pole-capped vessels, material regions
      and radial variation.
      The superseded `boardPanel` and `straightBoard`
      constructors are removed. Table, bench and chair tests now
      assert closed real quads, aligned section stations, surface UVs
      and nonoverlapping seams on the actual model results.
      The chair crest now samples its model-owned silhouette through
      `sampleAdaptiveStations` and constructs its closed quads through
      `loftBoard`, preserving its end wear, cross-section crown and
      materials. The no-longer-used `profiledBoard` constructor is removed.
      The render-first `circularPlankPanel` and the
      `seamedPlankExtrusion` GPU adapter (including its render-object
      station cache) are removed. Barrel head regression tests now
      inspect the real `cooperedHead` geometry: watertight
      independent planks, circular outline, UVs and worn seam regions.
      The general authored `seamedPlankExtrusionData` remains.
      The pure forwarding `attachByFrames` helper is removed; tests
      now use `attachAtFrames` directly. Named-anchor attachment
      remains supported through `attachByAnchors` because it applies
      its own contact-frame relationship.
      The render-dependent `MeshSurfaceQuery` is retired; geometric
      fitting and surface hits use the authored-face
      `raycastSurface` / `surfaceTriangles` path instead.
      Retained constructors supply distinct authored capabilities:
      `loftBoard` handles independently sampled face rows,
      `cutBoard` preserves sloped through-housings,
      `seamedPlankExtrusionData` handles worked joinery,
      `sweepSectionResult` defines smooth fitted grips, and
      `fillableVolume` preserves the tankard's active fill morph.
      These are compositions, not competing geometric kernels.
- [x] **7.2** Remove duplicate render material classification
      paths, stale exports and compatibility adapters once their
      consumers have migrated. Removed `assignMaterialsByNormal`,
      `classifyExtrudedSurfaces`, `assignExtrudedTimberSurfaces`
      and the GPU-mutating `warpGeometry`. The authored
      `classifyAuthoredFaces`, `deformVertices`, `surfaceMesh`
      and `toBufferGeometry` paths remain. Remaining construction
      helpers have distinct model or geometric responsibilities.
      The `bandAroundProfile` GPU wrapper was removed; its authored
      `bandAroundProfileData` geometry remains in use by the barrel
      and tankard. Tests compile those authored faces using
      `toBufferGeometry` and verify the tankard bands' actual section,
      clearance, regions and UVs.
      The mutating `geometry/uv/offsetMeshUvs` adapter is removed:
      authored UV offsets go through the non-mutating
      `geometry/edit/geometryEdits` operation. The old MeshData-only
      `sweepSection` compatibility export is also removed in favor
      of `sweepSectionResult`, which retains owned selections.
      The obsolete render-first `shapes/operations/extrude` path
      is retired. Its shared extrusion capability remains in
      `extrudeContour`, including polygon loops, holes, offset
      layers and authored caps; callers export with the normal
      `surfaceMesh` / `toBufferGeometry` pipeline.
      The remaining model paths produce authored MeshData or
      GeometryResult before material and runtime conversion; no
      render-first duplicate is required by those models.
- [x] **7.3** Keep imports following the module dependency
      direction in [06](06-migration-map.md).
      The shared `ellipticalRing` sampler and axial profile types
      live in `geometry/build` rather than in construction
      compatibility modules, eliminating reverse dependencies.
      `tests/geometry/kernel/dependency-direction.test.mjs`
      guards the geometry definitions, kernel, build, edit, query
      and UV layers against importing model/core/material recipes,
      construction-only implementations or render adapters.
      The public `kernel/index.ts` barrel is the intentional
      API-export exception. CI passes this check with all models.
- [x] **7.4** Rewrite the permanent `src/toolbox/README.md`
      around the actual capabilities and specific composition
      examples, with function names from the final code.
      The guide now lists the implemented build, patch, edit,
      fitting, topology, texture and cavity capabilities and
      demonstrates concrete compositions without retaining
      deleted API names.
- [x] **7.5** Verify all eight models in Quad View and GLB export,
      with the mug's active morph and other supported runtime paths.
      All eight models were manually reviewed and exported to Godot
      as documented under 5.11. The owner confirmed that this
      inspection already covers the final acceptance. Existing
      focused regressions retain coverage of authored topology,
      export paths and the tankard's active morphs; the additional
      all-model end-to-end test was removed as redundant.
- [x] **7.6** Construct another cross-category geometric assembly
      through existing toolbox functions to demonstrate reuse.
      The temporary candle-sconce construction combined
      `extrudeContour`, `sweepSection`, `revolveProfile` and
      `joinGeometry`, including a genuine welded arm/cup boundary.
      Its geometry was exercised in Quad View and exported as GLB.
      The owner accepted this practical proof. The unwanted asset
      and its dedicated test were removed; a second construction
      test is unnecessary.

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
