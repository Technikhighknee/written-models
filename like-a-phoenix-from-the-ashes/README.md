# Like a Phoenix from the Ashes

This directory contains the target architecture and implementation sequence
for the next generation of `written-models`.

The toolbox grows through geometric capabilities that can be composed across
very different models. A shape can be constructed, divided, reshaped,
connected to another shape, textured, and exported while retaining useful
topology. Every new capability expands what existing capabilities can create.

A tabletop, an iron hinge, a dagger, a pipe, and an organic limb become
different compositions of familiar geometric operations.

## The architecture

| Document | Contents |
| --- | --- |
| [01 — Geometry kernel](01-geometry-kernel.md) | Authored faces, adjacency, boundaries, regions, data contracts, operation results |
| [02 — Shape construction](02-shape-construction.md) | Contours, sampling, lofts, sweeps, revolutions, shells, caps |
| [03 — Geometry editing](03-geometry-editing.md) | Partitioning, cuts, holes, seams, deformation, edge shaping |
| [04 — Contacts and assembly](04-contacts-and-assembly.md) | Surface queries, fitted joints, frames, attachments |
| [05 — Surfaces and export](05-surfaces-and-export.md) | UVs, materials, Quad View, GLB/Godot and runtime geometry |
| [06 — Migration map](06-migration-map.md) | Exact destinations for existing functions and model consumers |
| [07 — Implementation sequence](07-implementation-sequence.md) | Ordered deliverables, dependencies, completion checkboxes |
| [08 — Composition examples](08-composition-examples.md) | Concrete constructions demonstrating the shared operations |

The numbered documents describe one design. Types and names shown in
them are the proposed public contracts; the migration map connects
them to the existing code. The implementation sequence is the execution
order and the progress record.

## The shape of the toolbox

The common currency is **authored geometry**: vertices, genuine triangular
and quadrilateral faces, surface regions, UV coordinates, and identifiable
boundaries.

A construction operation consumes geometric definitions or authored geometry
and produces authored geometry. Editing operations work on those results.
Spatial queries work directly with the same source. Rendering and export
compile that information for their respective formats.

```text
points · contours · sections · paths · frames
                      │
                      ▼
          authored geometry kernel ◄──── geometry queries
                      │                      │
            ┌─────────┼────────────┐         │
            ▼         ▼            ▼         ▼
         construct    edit       deform    fit / attach
            └─────────┴────────────┴─────────┘
                      │
                      ▼
             authored assemblies
                      │
                      ▼
          Three.js viewer / Quad View
                      │
                      ▼
               GLB / Godot
```

Model code chooses the proportions, part construction, imperfections,
material appearance, and relationships between parts. Shared geometric
work remains available across the toolbox.

We retain world units in **meters**, genuine authored quads, physical-scale
UVs, the existing models' visual quality, and runtime features such as
the beer mug's controllable fill level.

## The important decisions

1. **`MeshData` remains the construction representation.** It grows
   consistent topology, boundary, and operation-result utilities.
2. **The render mesh is compiled from authored geometry.** Construction
   operations return geometry; assigning materials or creating an
   object belongs at the rendering/model boundary.
3. **Adjacency is derived when needed.** Indexed faces remain the data
   source; edge graphs, loops, and face neighborhoods are reusable queries.
4. **An operation identifies its outputs.** Cuts and splits expose their
   created boundaries and regions so the next operation can select them.
5. **A shared boundary is constructed once.** Adjacent pieces sample
   the same geometric curve and station sequence.
6. **Contact fitting uses actual target geometry and explicit
   transforms.** Planar and curved surfaces share the query system.
7. **Object construction stays close to its model.** A wooden panel is
   assembled using general contour partitioning and lofting operations.
8. **Topology quality drives the algorithms.** Matching loops produce
   quads; resolution transitions produce genuine triangles as needed.
9. **Export preserves live asset capabilities.** Morph targets, skins,
   instances, and material data retain their existing behavior.

## How the plan fits together

The sequence in [07](07-implementation-sequence.md) creates a usable
vertical slice early: authored geometry → a general constructor →
surface queries → rendering/export → a migrated model. Each subsequent
slice extends the shared operations and uses an existing model as
a real quality check.

Completion means the capability works in more than one geometrically
different context and the affected models still look and export correctly.

Once the migration is complete, this temporary directory can disappear.
Its lasting output will be the toolbox itself.
