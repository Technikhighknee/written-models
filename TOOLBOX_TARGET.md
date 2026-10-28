# written-models — Toolbox Direction

The toolbox should make increasingly ambitious 3D models possible through
reusable geometric capabilities.

A new model brings new problems. Solving them expands what every subsequent
model can do. The goal is a growing collection of tools that work together
across furniture, weapons, architecture, mechanical parts, organic shapes,
and whatever else we decide to make.

A function developed while building a barrel might later help shape a
dagger, a metal pipe, or a character. That kind of reuse is what makes
the toolbox worth building.

## The foundation

Geometry is the common language.

A model defines its dimensions, profiles, construction, details, materials,
and artistic choices. The toolbox provides the operations that make those
choices possible.

Consider a plank, a metal tube, a chair leg, and a finger. Each can be
described using cross-sections, paths, surfaces, and local variations.
Their geometry differs, but they can share the same techniques for
building, shaping, cutting, and connecting parts.

**A new geometric capability should have a useful life far beyond the
model that first needed it.**

## Capabilities we want

### Shape construction

- Define points, curves, paths, profiles, cross-sections, contours,
  surfaces, and coordinate frames.
- Extrude, loft, sweep, revolve, and build surfaces between arbitrary
  compatible boundaries.
- Change a cross-section along a path: taper, flare, bend, twist,
  offset, or transition between profiles.
- Build solid and hollow bodies, shells, open surfaces, and complex
  assemblies.
- Control the shape and density of the resulting topology.

These operations should be flexible enough to describe straight beams,
curved tubes, forged metal shapes, barrel staves, and organic forms.

### Geometry editing

- Cut, split, partition, trim, and remove material.
- Create holes, cavities, slots, grooves, recesses, bevels, fillets,
  and smooth transitions.
- Bend, twist, warp, reshape, and displace existing geometry.
- Refine individual regions where the shape needs more detail.
- Preserve usable boundaries, surface identities, topology, and UVs
  as geometry changes.

Editing should work on the geometry we already have, including geometry
produced by other toolbox operations.

### Contacts and assembly

- Find faces, edges, intersections, contact points, and local frames
  on existing geometry.
- Fit endpoints and boundaries to flat, slanted, and curved surfaces.
- Construct members whose ends meet their actual supporting surfaces.
- Align, attach, orient, and position components in arbitrary
  coordinate systems.
- Partition a shape into separate pieces with matching boundaries,
  including irregular seams and shared subdivisions.

A wooden stretcher and a metal brace can use the same fitting operations.
The profiles and surrounding construction come from the models.

### Controlled detail

- Shape edges, corners, and surfaces with deliberately chosen wear,
  irregularity, and deformation.
- Apply coherent variation across neighboring pieces while maintaining
  their required contact geometry.
- Choose where detail appears, how strong it is, and how it changes
  across a surface.
- Create precise, rough, asymmetric, damaged, weathered, or organic
  results using the same underlying operations.

The artist stays in control of the shape.

### Topology, surfaces, and export

- Keep genuine authored quads and triangles throughout construction.
- Preserve edge loops, meaningful boundaries, surface regions,
  smoothing, and physical UV coordinates.
- Make the output of one operation usable by the next.
- Derive Three.js meshes from authored geometry and retain the
  information needed for Quad View.
- Export the finished models to GLB/Godot with their geometry,
  materials, and runtime features intact.

Our geometry representation should make composition natural.
We should be able to sweep a profile, deform the result, cut into it,
and fit it against another surface while keeping its topology useful.

## Existing capabilities to develop further

There is already substantial geometric work in the repository.
The next step is to identify the general operations within it and
make them available across the entire toolbox.

| Current functions | Geometric capabilities to develop |
| --- | --- |
| `straightBoard`, `profiledBoard`, `loftBoard` | Arbitrary sections, lofting, edge shaping, changing profiles |
| `boardPanel`, `circularPlankPanel` | Shape partitioning, shared boundaries, cooperating pieces |
| `cutBoard`, `seamedPlankExtrusion` | Cuts, openings, grooves, recesses, surface transitions |
| `radialStaves`, `radialStripLayout`, `bandAroundProfile` | Radial layouts, curved strips, offsets, surface-following forms |
| `timber`, `beams`, `beamBetweenPlanes` | Profile-based members and precisely fitted ends |
| `supportFacePlane`, `fitBetweenSupports`, `fitBoundaryToSurface` | Surface queries, contacts, boundary fitting |
| `turnedVessel`, `profiledCavity`, `fillableVolume` | Shells, enclosed volumes, interior contours, geometric changes |
| `attachByAnchors`, `attachByFrames` | Transformations, positioning, attachments |

This is an initial set of candidates. The same examination should extend
to the rest of the toolbox.

For each function, identify the geometric work it performs, the inputs
it truly needs, and the other kinds of geometry that could benefit.
Extract shared operations and compose them wherever they are used.

Object-specific construction remains in the models, built from the
toolbox's capabilities.

## What success looks like

We can start an unfamiliar model by selecting and combining geometric
operations we already understand. New challenges lead to tools with
uses across many different models.

A metal tube can inherit techniques developed for a wooden beam.
An organic limb can use profile transitions, surface editing, and
controlled deformation. A complex joint can reuse the same surface
queries and contact-fitting operations as a chair.

The table, barrel, beer mug, dagger, plank, sandpaper, bench, and chair
retain their visual quality. Their geometry remains authored, Quad View
stays accurate, and GLB export works.

As the toolbox grows, entirely new categories of models become
approachable with an increasingly powerful set of familiar operations.

## Progress

Check off an item when its changes are working in the repository.
Record the relevant commit alongside completed items.

- [ ] Examine every toolbox function and identify its reusable
      geometric capabilities.
- [ ] Establish a consistent, composable representation for geometry,
      faces, boundaries, surface regions, and topology.
- [ ] Consolidate contour, profile, cross-section, path, loft, sweep,
      extrusion, and revolution operations.
- [ ] Extract general-purpose cutting, splitting, partitioning,
      openings, grooves, and surface editing.
- [ ] Make deformation and controlled variation reusable across
      different forms of geometry.
- [ ] Consolidate surface queries, contact fitting, and assembly.
- [ ] Support separate pieces with precisely matching boundaries
      and subdivisions.
- [ ] Keep authored quads, UVs, surface regions, materials, Quad View,
      and export working through composed operations.
- [ ] Rebuild existing models using the shared capabilities and relocate
      object-specific construction to model code.
- [ ] Demonstrate reuse across genuinely different geometries.
- [ ] Remove superseded algorithms and update the toolbox capability guide.
