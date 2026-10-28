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

These documents describe one architecture. **09 defines the proposed
API vocabulary. 06 defines what happens to existing code. 07 is the
implementation checklist.** The remaining files explain the geometry
and show how the operations compose.

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
- **Every geometric edit returns its usable result.** New cut faces,
  region IDs and boundaries are available to subsequent operations.
- **The same construction path accepts different profiles.**
  Rectangular members, hollow sections, tapered grips and curved
  forms are compositions of general operations.
- **Contacts use real surface geometry and explicit transforms.**
  Plane intersection includes the support footprint; curved fitting
  uses actual sampled target surfaces.
- **Geometry topology and rendering are different representations.**
  Quads remain authored quads. GPU and GLB meshes may be triangulated,
  grouped and optimized independently.
- **Model-specific choices stay in the models.** Shared algorithms
  live in the toolbox, including algorithms currently buried in
  board, stave, timber and vessel constructors.
- **Complex geometry is represented as it actually exists.**
  Boolean cuts may be triangulated; obtaining clean quads is a
  distinct, deliberate geometric operation.

Meters, intentional topological structure, physical UV scale,
the existing asset quality, Quad View and runtime features remain
part of the design.

## How it becomes real

The [implementation sequence](07-implementation-sequence.md) starts
with a usable authored geometry kernel, builds shared construction
and editing operations, unifies contact fitting, and migrates models
through working vertical slices.

Each completed item records a commit and has a concrete geometric
result. The examples in [08](08-composition-examples.md) serve as
cross-object demonstrations: a capability proves useful when it
survives a genuinely different model.

The finished code and the permanent toolbox README will embody
this architecture. This directory is temporary.
