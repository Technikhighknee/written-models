# 07 — Implementation Sequence

The implementation follows the dependency chain from authored data
to construction, editing, fitting, and model migration. Each phase
delivers working capabilities and leaves the existing models usable.

Check `[x]` after the corresponding result exists and works.
Append the commit beside the item. Subtasks can gain further entries
as the implementation becomes more concrete.

## Phase 1 — Shared authored geometry

**Output:** One coherent set of authored geometry, topology, boundary,
and region utilities available to every toolbox operation.

- [ ] `MeshData`, authored builder, face regions, UVs and smoothing are
      the common geometry input/output for geometric operations.
- [ ] A topology index exposes face adjacency, oriented edges,
      boundary loops, region boundaries and manifold-edge checks.
- [ ] Construction operations can return explicit named boundary
      and region references through `GeometryResult`.
- [ ] Transforming and cloning authored geometry preserves the
      corresponding face-corner and boundary information.
- [ ] Deformation operates on authored vertices and produces new
      construction geometry.
- [ ] `toBufferGeometry` and Quad View continue to use the genuine
      authored topology.

**Demonstration:** A box and a loft can be queried for boundaries,
deformed, rendered and displayed in Quad View from the same representation.

## Phase 2 — Profiles, contours and construction

**Output:** Compatible geometric definitions feed a shared family of
mesh-building operations.

- [ ] Contour/section normalization, winding, sampling and frame
      construction share one set of definitions.
- [ ] `loftSections` and `loftRings` use a common arbitrary-section
      loft mechanism with genuine quad side faces.
- [ ] Cap construction supports both authored quad caps and
      triangulated non-quad caps.
- [ ] `stitchPolylines` and adaptive station selection support
      boundaries with differing resolution.
- [ ] Extrusion consumes contours with optional holes and produces
      authored walls, caps and named boundaries.
- [ ] Sweeping supports an evolving cross-section along an arbitrary
      path using transported frames.
- [ ] Revolution supports solids, shells, explicit rims and actual
      pole/side topology.
- [ ] Primitive constructors (`boxMesh`, `cylinderMesh`) produce
      the same kind of authored result.
- [ ] The shared constructors have stable UV and surface-region
      behavior across different profiles.

**Demonstration:** The same section-loft and sweep pipeline constructs
a rectangular bar, a bent pipe and a changing organic profile.
The plank, sandingpaper and dagger models use these capabilities.

## Phase 3 — Shared partitioning and surface editing

**Output:** Geometric cuts and surface edits work on constructed shapes
without referring to boards, panels or other object categories.

- [ ] Contour clipping supports the required split regions,
      including multiple components and holes.
- [ ] Partitioned contours share exact cut boundaries and stations.
- [ ] Authored meshes can be split by a plane with explicit
      generated cut regions and usable resulting topology.
- [ ] Surface-patch cuts produce openings, walls, floors and rim
      boundaries for recesses and holes.
- [ ] Selected edge loops support reusable bevel, roundover,
      inset and groove operations.
- [ ] Generic shape variation and geometric deformation work
      with stable results and deliberate regional falloff.
- [ ] Local refinement and transition stitching preserve
      neighboring boundary correspondence.
- [ ] Closed-solid boolean operations have a clearly represented
      triangulated topology output and surface-region behavior.

**Demonstration:** A rectangular plank, a circular panel and a metal
plate all receive precise partitions, grooves or openings through
the shared editing operations.

## Phase 4 — Surface fitting and spatial assembly

**Output:** Geometry can find real contacts, fit to its targets and
participate in scene assemblies through shared transformations.

- [ ] Surface query targets combine authored geometry with an
      explicit local-to-world transform.
- [ ] Ray hit, planar face/patch, closest-point and boundary
      queries use one consistent result format.
- [ ] Fitted endpoints between planes handle arbitrary compatible
      cross-sections.
- [ ] Fitted boundaries conform to curved surfaces using
      exact boundary-loop references.
- [ ] Fit results expose selected surfaces, contact frames and
      actual projected sections/boundary stations.
- [ ] Frame-based attachments and named anchors share a single
      transformation and cycle-checking implementation.

**Demonstration:** A chair rail, metal brace and swept mug handle
use the same query/fitting primitives in different combinations.

## Phase 5 — Surface semantics and runtime compilation

**Output:** Every geometric operation can feed the renderer/exporter
without losing surface identities, topology or runtime state.

- [ ] Surface-region classification occurs on authored faces;
      material mapping is centralized at render compilation.
- [ ] Physical UV mapping and UV offsets work through the
      construction/editing pipeline.
- [ ] Quad View reflects authored faces even after deformation,
      cutting and reconstruction.
- [ ] Three.js conversion preserves material groups and valid
      smooth/flat shading.
- [ ] GLB export preserves compatible static geometry, physical
      material behavior and texture atlases.
- [ ] Existing instanced, skinned and morph-target content
      keeps its runtime behavior through export.
- [ ] Cavity section/volume computations are reusable geometric
      operations; the beer mug's fill controller stays functional.

**Demonstration:** The beer mug's fill level still works in Godot.
A modified mesh retains its intended surface materials and control
topology in the viewer.

## Phase 6 — Migrate model construction

**Output:** Existing assets compose the new operations and model-owned
recipes contain only construction decisions.

- [ ] `plank.ts` uses the shared loft/profile path.
- [ ] `sandingpaper.ts` uses common primitive and render adapters.
- [ ] `dagger.ts` uses shared profile/loft and surface composition.
- [ ] `table.ts` uses shared partitioning and fitted members.
- [ ] `barrel.ts` uses radial layout, shared geometry strips,
      coherent head partitions and profile-following hoops.
- [ ] `beerMug.ts` uses shared body/handle geometry, boundary
      fitting and cavity computation.
- [ ] `tavernBench.ts` uses shared seat partitions and supports.
- [ ] `tavernChair.ts` uses shared fitted contacts, seat partitions
      and patch cutting.
- [ ] `models/components/oakSeating.ts` and
      `trestleSupport.ts` compose the geometric operations
      while retaining their model construction choices.

**Demonstration:** Every model remains visually recognizable with
its current functional features, material character and scale.

## Phase 7 — Complete the toolbox

**Output:** One discoverable set of geometric operations and one
source of truth for their behavior.

- [ ] Remove superseded board, stave, timber and vessel-specific
      geometric algorithms from the toolbox.
- [ ] Remove duplicate attachment, material-classification,
      cap/loft and topology-query implementations.
- [ ] Establish a clean module dependency direction matching
      the target source layout.
- [ ] Update the permanent `src/toolbox/README.md` to describe
      the resulting concrete capabilities and composition examples.
- [ ] Ensure Quad View and GLB export work for all eight existing
      models.
- [ ] Demonstrate the same operations on an additional geometry
      combination unlike the current wooden models.
- [ ] Remove unused compatibility layers and stale exports.

## Quality checks worth preserving

The tests protect persistent geometric rules, not model-specific
art choices or current triangle counts.

| Check | What it proves |
| --- | --- |
| Real faces | Quads are genuinely authored, triangles genuinely needed |
| Edge continuity | Shared boundaries agree; no unintentional T-junctions |
| Contacts | Fitted edges/ends meet the supplied surface within geometric tolerance |
| Topology integrity | Valid indices, face winding, appropriate closed/open edge incidence |
| Composition | A constructed shape can be edited, fitted, rendered and exported |
| Export state | Morph targets/weights, instances, skinning and material information survive |
| Determinism | Identical geometric input, sampling and seeds yield identical geometry |

Inspect the final visual character of the assets directly. The
models are allowed to evolve artistically as long as the required
functional geometry and export behavior remain intact.

## Execution order and integration

```text
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4
   │            │           │          │
   └────────────┴───────────┴──────────┴──► Phase 5
                                               │
                   early model conversions ◄───┘
                                               │
                                               ▼
                                          Phase 6
                                               │
                                               ▼
                                          Phase 7
```

Some existing models can consume each phase's new geometry before
the whole family of operations is complete. Phase 6 records the
finished migration of each model.

The repository ends with the intended operations, clean consumer
imports, a short permanent toolbox guide, and the existing collection
of functioning models.
