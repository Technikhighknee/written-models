# Like a Phoenix from the Ashes

This is the intended shape of the next `written-models` toolbox,
its APIs, the migration of the existing models, and the order in
which the new system will be built.

The toolbox grows through geometric capabilities that work together
across very different kinds of models. A shape can be constructed,
partitioned, deformed, fitted to another shape, given meaningful
surfaces, and exported while retaining its authored topology.

A tabletop, metal hinge, dagger grip, curved pipe and organic limb
can use the same geometric vocabulary.

## Read the design

| | Document | What it defines |
| --- | --- | --- |
| 01 | [Geometry kernel](01-geometry-kernel.md) | Authored mesh, face/edge topology, boundaries, result ownership |
| 02 | [Shape construction](02-shape-construction.md) | Contours, sections, sampling, loft, extrusion, sweep, revolve |
| 03 | [Geometry editing](03-geometry-editing.md) | Splits, shared seams, surface cuts, bevels, variation, boolean results |
| 04 | [Contacts and assembly](04-contacts-and-assembly.md) | Real support patches, fitting, coordinates, attachments |
| 05 | [Surfaces and export](05-surfaces-and-export.md) | UVs, materials, Quad View, morphs, GLB/Godot |
| 06 | [Migration map](06-migration-map.md) | Where all existing toolbox functions and models end up |
| 07 | [Implementation sequence](07-implementation-sequence.md) | Ordered deliverables and checkboxes with completion criteria |
| 08 | [Composition examples](08-composition-examples.md) | Actual geometric combinations the design must enable |
| 09 | [API contracts](09-api-contracts.md) | Shared TypeScript contracts used throughout the other files |
| 10 | [Operation semantics](10-geometry-semantics.md) | Exact behavior of seams, cuts, caps, fitting and topology changes |
| 11 | [Numerics and query fidelity](11-numerics-and-query-fidelity.md) | Precision policy, sampling limits, triangle provenance and failure behavior |
| 12 | [Existing-model construction proof](12-model-by-model-proof.md) | Part-by-part reconstruction of all eight models and their components |
| 13 | [Architecture decisions](13-architecture-lock.md) | Settled contracts, dependency boundaries, integrated completion criteria |

The documents describe one architecture. **09 defines the public
contracts, 10 and 11 their geometric and numerical behavior,
12 reconstructs the existing models, 13 records the architecture
decisions, 06 maps the code, and 07 specifies implementation order.**

## The geometry pipeline

```text
contours · profiles · sections · paths · frames
                     │
                     ▼
               authored geometry
             (MeshData + topology)
                     │
       ┌─────────────┼──────────────────┐
       ▼             ▼                  ▼
     build          edit              query
       │             │                  │
       └─────────────┼─────────────── fit / attach
                     │
                     ▼
              composed model
                     │
          ┌──────────┴───────────┐
          ▼                      ▼
       Quad View            Three.js render
                                 │
                                 ▼
                         GLB / Godot runtime
```

The model chooses dimensions, construction, form, imperfections,
materials and arrangement. The toolbox provides geometric definitions,
operations and reusable query methods.

## Decisions embodied in the design

- **Authored geometry is the working representation.** The current
  `MeshData` is extended with topology queries and operation results.
- **A boundary is an actual ordered chain of edges.** A surface name
  selects faces and may have several disconnected boundaries.
- **Adjacent pieces share one boundary definition and sample stations.**
  Gaps and wear modify that shared construction deliberately.
  Detailed surface patches and simple undersides can join through
  matching boundaries without unnecessary extra subdivisions.
- **Every geometric edit returns usable selections.** Cut faces,
  part ownership, region IDs and boundary loops are available to
  subsequent operations.
- **The same construction path accepts different profiles.**
  Rectangular members, hollow sections, tapered grips and curved
  forms are compositions of general operations. Material and
  smoothing regions can vary by contour edge and section interval.
- **Contacts use real surfaces and explicit transforms.**
  Plane fitting checks entire outlines against finite support patches;
  curved fitting uses actual sampled target surfaces and consistent
  face normals.
- **Geometry topology and rendering are different representations.**
  Quads remain authored quads. GPU and GLB meshes may be triangulated,
  grouped and optimized independently.
- **Model-specific choices stay in the models.** Shared algorithms
  live in the toolbox, including algorithms currently buried in
  board, stave, timber and vessel constructors.
- **Complex geometry is represented as it actually exists.**
  Booleans can produce real triangles. Opening a surface, creating
  a recess and cutting through a solid are distinct operations.
- **Independent model parts stay independently modeled.**
  Cavity sections can be assembled from multiple inner surfaces;
  rendering keeps their separate materials and per-piece colors.

Meters, intentional topology, physical UV scale, predictable
precision and failure behavior, Quad View and current runtime
features remain part of the design. Authoring precision and exported
Float32 precision have separate validity checks.

## How it becomes real

The [implementation sequence](07-implementation-sequence.md) starts
with an authored geometry-to-render path, proves shared construction
through the existing assets, completes their migration, and then
extends general cutting and editing on that integrated foundation.

Each completed item records a commit and has a concrete geometric
result. The examples in [08](08-composition-examples.md) demonstrate
cross-object reuse. The [model-by-model proof](12-model-by-model-proof.md)
sets specific acceptance conditions for the existing collection.

The finished code and the permanent toolbox README will embody
this architecture. This directory is temporary.
