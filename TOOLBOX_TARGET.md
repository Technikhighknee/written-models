# written-models — The Toolbox We Actually Want

**Build geometry. Not object generators.**

A chair, a dagger, a barrel, a pipe, a tree branch, a hand: they should all be
built from the same growing set of geometric powers.

Today, too much of our cleverness is trapped inside functions named after
things. We can build a beautiful board, then discover we need half its tricks
again for something that isn't a board.

That's backwards.

**Every model should make the toolbox more powerful for the next model —
especially when the next model is nothing like it.**

## The idea

The toolbox knows **geometry**. Models know **what they're making**.

A board is a shape, a path, a thickness, a few edges and surface details.
A pipe is a different shape and perhaps a hollow cross-section, traveling
along a path. A dagger grip, chair leg, barrel stave, or finger may call for
different profiles and deformations.

They shouldn't need separate implementations of how to loft, bend, cut,
partition, fit, or connect geometry.

The toolbox provides those operations. The model composes them.

No more hiding a generally useful algorithm inside `boardPanel()`,
`cutBoard()`, or the next object-specific helper. The names aren't the
real problem; **the trapped capabilities are**.

## What we want to be able to do

### Create any shape

- Define points, curves, paths, contours, profiles, cross-sections, surfaces.
- Build solids and shells with extrusion, lofting, sweeping, revolving, and
  surface construction.
- Vary a shape along its length: taper, widen, twist, curve, offset,
  transition between completely different cross-sections.
- Work with both hollow and solid geometry, planar and curved surfaces,
  regular and irregular forms.

A rectangular prism, a hollow tube, a curved plank and an organic limb
are different uses of geometric operations, not four separate toolkits.

### Work on geometry

- Cut, split, partition, trim, remove material, open holes and cavities.
- Add thickness, bevels, fillets, grooves, recesses and transitions.
- Bend, warp, twist, taper, displace and reshape existing geometry.
- Refine geometry where detail matters while keeping control of topology.
- Carry useful information — faces, boundaries, UVs and surface regions —
  through these operations.

The same operation should work on wildly different shapes wherever its
geometric inputs make sense.

### Make pieces fit

- Ask geometry where its surfaces, edges, intersections and contact points are.
- Fit one surface or boundary to another, including slanted and curved targets.
- Cut the ends of a member to meet its actual supports, not guessed planes.
- Place, orient, connect and align pieces in arbitrary coordinate frames.
- Partition shapes into separate pieces that share *exactly matching*
  boundaries, even when those boundaries are irregular.

A chair stretcher, a metal brace and a bone joint should draw from the
same contact and fitting capabilities.

### Keep full artistic control

- Every contour, proportion, imperfection and detail can be deliberately
  authored.
- Variation is a geometric input, not an excuse for random-looking results.
- We can create pristine, damaged, asymmetric, worn, precise or organic shapes
  with the same tools.
- No forced aesthetic. No one-size-fits-all mesh recipe.

### Own the topology

- Author actual quads and genuine triangles. Quad View shows the real thing.
- Keep control of edge loops, surface regions, smoothing and UV coordinates.
- Preserve construction geometry through operations instead of reconstructing
  it from render triangles later.
- Convert to Three.js meshes and GLB/Godot output at the rendering boundary.

Rendering is what we *do with* geometry. It isn't how we *define* geometry.

### Combine everything

This is the real payoff.

A profile built by one tool can be swept by another, deformed by a third,
cut by a fourth, and fitted to another part by a fifth.

The resulting geometry is still editable, still carries its surfaces and
topology, and still works with the next tool.

**Capabilities compound.** Building a new object should get easier because
previous objects expanded what the toolbox can do.

## What that means for the existing code

The toolbox already has real building blocks. We don't need to throw away
working geometry; we need to free its capabilities from the objects that
happen to contain them.

Some obvious places to dig:

| Existing code | The capability we're after |
| --- | --- |
| `straightBoard`, `profiledBoard`, `loftBoard` | Arbitrary cross-sections, changing profiles, lofting, edge shaping |
| `boardPanel`, `circularPlankPanel` | Partitioning shapes into cooperating pieces with shared boundaries |
| `cutBoard`, `seamedPlankExtrusion` | Cuts, openings, recesses, surface transitions, controllable seams |
| `radialStaves`, `radialStripLayout`, `bandAroundProfile` | Radial distribution, curved strips, offsets and surface-following geometry |
| `timber`, `beams`, `beamBetweenPlanes` | Members with arbitrary sections and fitted ends |
| `supportFacePlane`, `fitBetweenSupports`, `fitBoundaryToSurface` | Surface queries and geometric contact/fitting |
| `turnedVessel`, `profiledCavity`, `fillableVolume` | Shells, enclosed volumes, interior profiles, changing geometry |
| `attachByAnchors`, `attachByFrames` | A common way to position and connect geometry |

This table is a starting point, not an exhaustive list. Every toolbox file
deserves the same question:

**What can this code do that would still be useful if we deleted the model
it was originally written for?**

Keep that capability. Extract it if necessary. Compose it with the others.
Leave the decisions about *what object to make* in the models.

## What success looks like

Imagine starting a new model we've never attempted before.

Instead of searching for a similar object generator, we pick the geometric
operations we need. They work together. If something is missing, we add one
new capability — and the entire toolbox becomes stronger.

We should be able to go from a tavern table to a wrought-iron hinge to an
anatomically convincing character **without starting our modeling vocabulary
over each time**.

The existing models still need to look good. Real joins stay real, authored
quads stay quads, and GLB export still works.

But preserving the current models is the floor, not the ambition.

**The ambition is a toolbox that can grow toward almost anything we can
imagine modeling.**

## Build checklist

Mark `[x]` when the work is actually in the repository and working.
Add the commit beside completed items. Split tasks whenever useful.

- [ ] Inventory every toolbox capability and identify algorithms trapped
      inside object-specific functions.
- [ ] Give construction geometry a consistent, composable representation
      for faces, edges, boundaries, surfaces and topology.
- [ ] Consolidate the core operations for contours, profiles, sections,
      paths, lofts, sweeps, extrusion and rotation.
- [ ] Extract general cutting, splitting, partitioning, holes, grooves,
      surface details and shape-editing operations.
- [ ] Make deformation and controlled variation work across different
      kinds of geometry.
- [ ] Make surface queries, contacts, fitting and assembly fully reusable.
- [ ] Make repeated pieces share boundaries and subdivisions accurately,
      without a board- or stave-specific implementation.
- [ ] Keep UVs, materials, authored quads and export compatible with
      composed geometry.
- [ ] Rebuild existing models from the new capabilities; move any remaining
      object recipes out of the toolbox.
- [ ] Prove reuse with **different kinds of geometry** — not three versions
      of another plank.
- [ ] Remove superseded specialized algorithms and update the toolbox
      capability guide.

---

**A toolbox isn't great because it already contains a tool for everything.**

**It's great because each new tool expands what everything else can do.**
