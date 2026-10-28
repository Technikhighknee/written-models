# written-models: Toolbox Target Architecture

> **Scope:** The toolbox, its API, and how models consume it.
> **Not a goal:** Replacing authored models with a generic object-recipe generator.

## 1. Purpose

`written-models` should be a toolbox for **geometry and geometric operations**,
not an ever-growing collection of increasingly powerful object generators.

New objects should result from **composing existing, object-independent
capabilities**. When a fundamentally new geometric capability is necessary,
implement it so that it remains useful independently of the model that
motivated it.

**Question for every toolbox API:**

> If the original model disappeared, what general geometric capability
> would remain, and which *different kinds of geometry* could use it?

"It might also be useful for another board" is not sufficient.

### Non-negotiable principles

- **No object-specific geometry algorithms in the toolbox.** A board, barrel
  stave, chair, or metal pipe is a model-design decision, not a fundamental
  geometric operation.
- **Operations before objects.** An operation describes *what happens to
  geometry*, not *which object is being made*.
- **Material independence.** Wood grain, metal, ceramics, etc. must not be
  prerequisites for extrusion, cutting, fitting, or deformation.
- **Topology is construction data.** Original quads remain genuine quads;
  necessary triangles remain genuine triangles. No recovered fake quads
  and no viewer hacks.
- **Solve geometry with geometry.** Contacts, openings, wall thickness,
  and joints exist as real faces and edges.
- **Preserve artistic authorship.** Generic tools must not dictate the
  shape, proportions, or design choices of a model.
- **No fake generality.** Avoid a universal function with endless options
  and a collection of special-case algorithms hidden inside.
- **No duplicated algorithms under new object names.** Find and compose
  existing capabilities first; extend them at the appropriate layer.

## 2. What belongs in the toolbox

| Toolbox capabilities | Model-specific decisions, outside the toolbox |
| --- | --- |
| Contours, sections, paths, frames, coordinate transforms | "This oak board is 4 cm thick and worn here" |
| Extrusion, lofting, sweeping, revolving, surface construction | "These six staves form a barrel" |
| Splitting, partitioning, cutting, hollowing, combining geometry | "This seat consists of three planks" |
| Thickness, chamfers, roundovers, profiles, deformation | "The dagger grip has this section and curvature" |
| Finding contact surfaces, fitting endpoints and boundaries | "This strut connects these two chair legs" |
| Topology, UV assignment, surface regions, validation | Specific material choices, palettes, and aging recipes |
| Generic layouts, distribution, variation, positioning | The design and assembly of a particular object |

**Explicitly:** `boardPanel()` is **not** a fundamental geometric capability.
The general operations it contains must be usable independently.

An object-specific adapter outside the toolbox does **not** justify hiding
general geometric algorithms inside that adapter. Its job is to compose
existing tools and make model-specific decisions.

Renaming an operation to something generic does not make it generic:
`cutBoard()` still has a problem if it fundamentally supports only
board-shaped geometry.

## 3. Desired capabilities (conceptual layers, NOT a directory plan)

This is a dependency model, **not yet a decision about folders, files,
or concrete APIs**.

1. **Geometry data and topology:** Vertices, edges/boundaries, genuine faces
   (quads and triangles), surface regions, UV/smoothing semantics, and
   controlled conversion to render geometry.
2. **Geometric definitions:** Points, directions, planes, frames, profiles,
   open and closed contours, paths, cross-sections, interpolated fields,
   and units.
3. **General construction operations:** Extrude, loft, sweep, revolve,
   connect contours/sections with surfaces, build shells and wall thickness.
   Input geometry defines the result, not the words "board", "pipe", or "grip".
4. **General modification operations:** Split/partition, cut/open,
   chamfer/round, deform, edit edge/surface contours, sample and refine
   geometry where necessary. Existing topology and surface information
   are preserved or transformed explicitly.
5. **Relationships and contact:** Query geometry and its faces/regions,
   fit geometry against actual surfaces, cut member ends between contacts,
   adapt boundaries to targets, position and orient parts.
6. **Output and presentation:** Assign surface regions, materials, and UVs;
   derive meshes and exported geometry without losing the construction
   topology they originate from.

**No mandate for one implementation per verb:** Fitting a planar joint
and fitting to a curved surface can require different algorithms.
Their shared pieces and interfaces should still be consistent.
Not every operation has to support every topology; prerequisites and
limits must be explicit.

## 4. Geometry and API contracts

Exact types and signatures are deliberately left open.

- **Construction data first:** Core operations should, when practical,
  work on authored geometry without requiring render meshes or materials.
- **Predictable inputs and outputs:** Document coordinate space,
  orientation, winding, open/closed contours, normals, UV units, and
  material regions.
- **No silent corruption:** Reject invalid or unsupported inputs rather
  than generating degenerate geometry or covering errors with overlaps.
- **Composable results:** A suitable operation can consume another
  operation's result without bespoke adapter code.
- **Preserve information:** Do not discard quads/triangles, boundary
  identity, surface regions, or UVs without an explicit reason.
- **Independent of Three.js rendering where appropriate:** Three.js
  vector types may be convenient, but geometry algorithms should not
  depend on material instances, the viewer, or GLB.
- **Quality is not a passing test:** Correct geometry, useful topology,
  real contacts, and a convincing visible result all matter.

## 5. Existing code to investigate

The following are **investigation candidates**, not decisions to remove,
relocate, or replace anything. Existing APIs get no special protection
merely because they already exist.

| Candidates | Question |
| --- | --- |
| `MeshData`, `AuthoredMeshBuilder`, `toBufferGeometry`, `surfaceMesh` | How does authored geometry remain the source of truth? Where is the rendering boundary? |
| `loftRings`, `loftSections`, `loftBoard`, `loftAxialProfile` | What loft mechanisms are common? Which differences are topologically necessary, and which are object-specific input formats? |
| `sweepSection`, `extrude`, `revolveShell`, `latheMeridian` | Which section/contour/path concepts are shared? Where is render geometry produced prematurely? |
| `straightBoard`, `profiledBoard`, `boardPanel`, `cutBoard` | Which general profile, partition, cut, opening, seam, and variation capabilities are hidden inside? |
| `circularPlankPanel`, `seamedPlankExtrusion` | What general partitioning, neighboring-boundary, seam, wear, and adaptive-topology capabilities are bundled together? |
| `radialStripLayout`, `radialStaves`, `bandAroundProfile` | What is general radial layout/surface construction, and what is a stave/band recipe? Why does a layout return `BoardSection`? |
| `beams`, `timber`, `sectionsBetweenPlanes`, `beamBetweenPlanes` | How can arbitrary profiles be fitted to real contacts without assuming wood or rectangular beams? |
| `supportFacePlane`, `fitBetweenSupports`, `fitBoundaryToSurface`, `MeshSurfaceQuery`, `contactFrame` | Which generic query/contact/fitting primitives are distinct? How should planar and curved targets work together? |
| `attachByAnchors`, `attachByFrames` | Which transform and cycle-protection logic is duplicated? |
| `assignMaterialsByNormal`, `classifyExtrudedSurfaces`, `surfaceMesh` | How should surface regions and material assignment work before/after render conversion? |
| `turnedVessel`, `profiledCavity`, `fillableVolume` | What is generic shape construction, volume computation, and deformation? What is container/liquid-fill application logic? |
| `models/components/oakSeating.ts`, `trestleSupport.ts`, `table.ts`, `tavernChair.ts` | Do model helpers hide reusable geometric algorithms that belong at a lower level? |

**Dependency warning:** `geometry/construction` already imports from
`shapes/operations`, while `shapes/operations/revolveShell` imports
`geometry/construction/latheMeridian`. The desired dependency direction
must be explicitly defined.

## 6. Acceptance criteria

Judge the toolbox by what can be built with it, **not** by file,
function, or class counts.

- The same fundamental operation can work on a **wooden board**,
  a **metal pipe**, and a **different profile-based object**, whenever
  the geometric prerequisites apply.
- Fitting a member between surfaces is not a chair, table, or wood
  operation; at least two different models use the same fitting mechanism
  without reimplementing it locally.
- Cutting, seams, partitioning, and cross-section changes are not
  restricted to a particular object category.
- A new type of model does not require an existing geometric operation
  to be developed a second time.
- Existing models retain their intended shape and usable results:
  table, barrel, plank, sandpaper, dagger, beer mug, bench, and chair
  must not silently break or require render hacks.
- Quad View and GLB/Godot export retain the necessary construction
  and material information.
- An unfamiliar future model can be approached through an
  **organized capability catalog**, without searching by similar
  object names first.

**Countercheck:** If a supposedly generic operation fundamentally requires
"board", "barrel", "timber", or a particular material, reconsider
the abstraction.

## 7. Open design decisions

Decide these as part of refining the target architecture.

- [ ] Decide the conceptual layers and direction of dependencies.
- [ ] Decide whether authored geometry, render geometry, and finished
      objects need shared or deliberately different result types.
- [ ] Define boundaries of general operations for arbitrary profiles,
      closed solids, hollow solids, and curved surfaces.
- [ ] Define rules for surface regions, boundaries, material assignments,
      and UV preservation.
- [ ] Decide how existing specialized constructors will be handled:
      extract reusable geometric algorithms, then relocate or dissolve
      the object recipes.
- [ ] Decide migration and quality-checking rules so existing models
      remain good without writing tests merely for the sake of tests.
 ## 8. Implementation checklist

> Check off completed work only after integration and verification.
> Include the relevant commit for each completed item. Add tasks as needed.

- [ ] **0. Baseline:** Inventory existing capabilities, consumers,
      API boundaries, and visible model results.
- [ ] **1. Target architecture:** Establish dependency rules and API
      contracts, and make them discoverable in the repository.
- [ ] **2. Geometry core:** Consolidate shared data, contours, sections,
      faces, boundaries, and operation results where the inventory
      demonstrates a genuine need.
- [ ] **3. Construction:** Reduce object-specific extrude/loft/sweep/revolve
      variants to reusable geometric operations.
- [ ] **4. Modification:** Separate general partitioning, seam/cut geometry,
      profile editing, and deformation from board/stave/vessel code.
- [ ] **5. Contact and assembly:** Provide composable, material- and
      object-independent queries, contact surfaces, boundary fitting,
      and member-end trimming.
- [ ] **6. Rendering boundary:** Connect authored topology, UVs, surface
      regions, materials, and export consistently.
- [ ] **7. Model migration:** Verify all eight models use the new toolbox
      composition; eliminate hidden duplicated algorithms in their recipes.
- [ ] **8. Cross-object checks:** Build and modify different geometries
      with the same capabilities; inspect Quad View and export. Automate
      only durable invariants worth maintaining.
- [ ] **9. Cleanup:** Remove obsolete interfaces, update the capability
      catalog, and record completed work with concrete commit hashes.

