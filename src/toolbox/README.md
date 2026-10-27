# Toolbox

**Build the model you imagine. Grow the tools that make it possible.**

The toolbox is a collection of reusable capabilities for creating deliberately designed 3D models in TypeScript. It is not a library of finished assets or a system that decides what an object should look like.

## The idea

**Models drive the toolbox. Not the other way around.**

A model presents a real problem: an awkward joint, a curved surface, a convincing edge, a shape we cannot yet construct well. We solve the underlying problem once, as a capability other models can use. Then we return to the model that needed it.

That is how the toolbox grows: **model → capability → model**.

The goal is not to automate away design. It is to make increasingly ambitious, individually authored models easier to create.

## What the toolbox can already do

- **Build forms.** Create basic shapes, extrude outlines, loft changing cross-sections, turn profiles around an axis, and sweep shapes along curves. Build anything from a straight beam to a hollow, curved vessel.
- **Give things real structure.** Create thickness, open interiors, closed ends, distinct surfaces, and pieces that exist as actual geometry rather than visual illusions.
- **Divide and assemble.** Split shapes into matching pieces, arrange boards and curved strips, define shared seams, and keep neighboring parts geometrically consistent.
- **Make parts fit.** Position and orient components relative to one another, cut members against angled planes, and fit their ends to the actual curved surface of another mesh.
- **Shape the details.** Add bevels, rounded edges, crowns, grooves, recessed joints, and controlled wear. Introduce repeatable irregularities without making every piece look randomly different.
- **Use detail where it matters.** Refine geometry according to its shape, connect differently detailed contours, and coordinate subdivisions across adjacent pieces.
- **Keep topology intentional.** Author real quads and genuine triangles. The same construction faces underpin the rendered model, Quad View, and export.
- **Prepare convincing surfaces.** Work in real-world dimensions, assign meaningful material regions, control physical UV scale, and build coherent procedural texture fields and PBR maps.

These are building blocks, not model-specific presets. Their value comes from what they let us construct together.

## What combining them makes possible

**A timber-framed town gate.** Use `boardPanel()` for doors made of individually shaped planks, `beamBetweenPlanes()` for braces fitted to angled supports, and `contactFrame()` to position hinges and ironwork against their mounting surfaces. The same operations work just as well on a chest or a timber-framed house.

**A waterwheel.** Combine `radialStripLayout()` with `loftBoard()` to construct a rim from matching curved sections. Use `beamBetweenPlanes()` for fitted spokes and `coherentVariation()` to give the separate wooden pieces a related, hand-built appearance.

**A hollow bronze bell.** Shape a real thin-walled body with `revolveShell()`, wrap raised details around its profile with `bandAroundProfile()`, and use `fitBoundaryToSurface()` to make separately constructed fittings meet its curved surface.

These are just three examples, not a catalog of what's possible or a set of ready-made generators. The same capabilities can be combined in countless other ways, including for models nothing like the ones that originally inspired them. **The examples are finite. The possibilities aren't.**

## Principles worth keeping

- **Design leads.** The model owns its shape, proportions, construction choices, and character. Generic tools must not dictate its appearance.
- **Look before inventing.** Before building a model or introducing a new capability, inspect the relevant parts of the toolbox and how existing models use them. Follow what's relevant; there is no need to read everything every time. Prefer combining what already exists. If something genuinely missing stands in the way, grow the toolbox instead of hiding a one-off workaround inside the model.
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
