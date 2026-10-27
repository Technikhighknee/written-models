# Toolbox

**Build the model you imagine. Grow the tools that make it possible.**

The toolbox is a collection of reusable capabilities for creating deliberately designed 3D models in TypeScript. It is not a library of finished assets or a system that decides what an object should look like.

## The idea

**Models drive the toolbox. Not the other way around.**

A model presents a real problem: an awkward joint, a curved surface, a convincing edge, a shape we cannot yet construct well. We solve the underlying problem once, as a capability other models can use. Then we return to the model that needed it.

That is how the toolbox grows: **model → capability → model**.

The goal is not to automate away design. It is to make increasingly ambitious, individually authored models easier to create.

## For ChatGPT — the builder

**You build the models.** Before implementing one, look at the toolbox capabilities relevant to the job and how existing models use them. Inspect selectively rather than loading the entire codebase into context. Reuse and combine what is already there when it fits.

If the model needs a capability that does not exist yet, **implement that capability in the toolbox and use it in the model**. Do not bypass a missing operation with a model-specific shortcut. The model sets the challenge; you make the tools meet it.

**Test what should remain true, not what happens to be true today.** Keep focused tests for reusable geometry contracts and bugs likely to recur: valid topology, shared boundaries, correct contacts, determinism. Do not pin a model's current proportions, part count, triangle count, or artistic choices to CI. Inspect those while making the asset instead. Add tests when the protection justifies the maintenance, and remove obsolete tests when a design changes.

## What the toolbox can already do

- **Build forms.** Create basic shapes, extrude outlines, loft changing cross-sections, turn profiles around an axis, and sweep shapes along curves. Build anything from a straight beam to a hollow, curved vessel.
- **Give things real structure.** Create thickness, open interiors, closed ends, distinct surfaces, and pieces that exist as actual geometry rather than visual illusions.
- **Divide and assemble.** Split shapes into matching pieces, arrange boards and curved strips, define shared seams, and keep neighboring parts geometrically consistent.
- **Make parts fit.** Position and orient components relative to one another, cut members against angled planes, and fit their ends to the actual curved surface of another mesh.
- **Shape the details.** Add bevels, rounded edges, crowns, grooves, recessed joints, and controlled wear. Introduce repeatable irregularities without making every piece look randomly different.
- **Use detail where it matters.** Refine geometry according to its shape, connect differently detailed contours, and coordinate subdivisions across adjacent pieces.
- **Fill modeled cavities.** Extract horizontal inner profiles from authored faces, calculate volume-correct fill heights, and update one persistent contents mesh without replacing the vessel. Supported cavities are upright, polygonal lofts.
- **Keep topology intentional.** Author real quads and genuine triangles. The same construction faces underpin the rendered model, Quad View, and export.
- **Prepare convincing surfaces.** Work in real-world dimensions, assign meaningful material regions, control physical UV scale, and build coherent procedural texture fields and PBR maps.

These are building blocks, not model-specific presets. Their value comes from what they let us construct together.

## Controllable contents

`cavityFromMeshSurfaces(staves).between(floorY, rimY)` derives the usable capacity from existing inner faces. `createFillableVolume(cavity, material, 0.5)` creates a persistent mesh with `setFillLevel(0..1)` and `getFillLevel()`. The amount is a **volume fraction**, not a height fraction. `beerMug.create()` exposes the same methods, and the viewer detects this capability.

This models an upright liquid with a horizontal surface. Tilting, sloshing and pouring are not simulated. **GLB export is a static snapshot of the currently selected fill level:** changing contents at runtime in another engine requires implementing the behavior there; the TypeScript methods are not embedded in GLB.

## What combining them makes possible

**A timber-framed town gate.** Use `boardPanel()` for doors made of individually shaped planks, `beamBetweenPlanes()` for braces fitted to angled supports, and `contactFrame()` to position hinges and ironwork against their mounting surfaces. The same operations work just as well on a chest or a timber-framed house.

**A waterwheel.** Combine `radialStripLayout()` with `loftBoard()` to construct a rim from matching curved sections. Use `beamBetweenPlanes()` for fitted spokes and `coherentVariation()` to give the separate wooden pieces a related, hand-built appearance.

**A hollow bronze bell.** Shape a real thin-walled body with `revolveShell()`, wrap raised details around its profile with `bandAroundProfile()`, and use `fitBoundaryToSurface()` to make separately constructed fittings meet its curved surface.

These are just three examples, not a catalog of what's possible or a set of ready-made generators. The same capabilities can be combined in countless other ways, including for models nothing like the ones that originally inspired them. **The examples are finite. The possibilities aren't.**

## Principles worth keeping

- **Design leads.** The model owns its shape, proportions, construction choices, and character. Generic tools must not dictate its appearance.
- **Generalize the problem, not the object.** A fitted surface is a toolbox capability. A particular handle, table, or trestle is a model or a composition of capabilities.
- **Compose instead of accumulating special cases.** Prefer small, dependable operations that work together over a different bespoke solution for every asset.
- **Construction topology is the source of truth.** Preserve authored faces and control edges. Never guess original quads from rendered triangles.
- **Solve geometry in geometry.** No viewer tricks to hide gaps, disconnected parts, or inaccurate joints.
- **Spend geometry deliberately.** Real detail is welcome. Subdivisions that add nothing are not.

One world unit equals **one meter**. Models live in `src/models/`, material definitions in `src/materials/`, and the reusable operations here in `src/toolbox/`. Higher-level construction recipes belong with models, not among fundamental geometry operations.

## Know the limits

Fitting one part to another is not the same as welding their topology together. The toolbox can make accurate surface contacts; it does **not** automatically merge arbitrary meshes into a single watertight, cleanly quad-based object.

That distinction matters. We should describe what the tools can really do, not what a convincing render might make them seem to do.

---

**The toolbox is not the project. The models are. The toolbox is how each model makes the next one more possible.**
