# 12 — Every Existing Model, Rebuilt on Paper

The architecture has to reconstruct the models that already exist,
including details which currently live in specialized geometry helpers.
This document follows their actual construction code and identifies
the operations required for each part.

The models provide exact proportions, station profiles, material choices,
wear fields and assembly transforms. The toolbox provides the geometry
operations described here. The relevant TypeScript contracts live in
[09](09-api-contracts.md).

## Shared construction vocabulary

A few capabilities appear repeatedly across the model collection.

| Capability | Geometric result |
| --- | --- |
| Section loft with per-edge/per-interval surface assignments | Mesh with accurate side regions, smoothing groups and caps |
| Corresponding contour layers | Solids with differently shaped top/bottom outlines and slanted edge walls |
| Surface patch filling | An actual authored surface, including curved/crowned interiors and sampled boundaries |
| Shared seam sampling | Neighboring parts with common interface coordinates and deliberate gaps/relief |
| Groove/edge-shape profile on a patch | Shoulders, recessed strips and worn edges with actual surface faces |
| Frame-oriented members and fittings | Correct cross-section roll, mitered ends and valid contact footprints |
| Polar section layout and sweep | Circumferential strips, closed bands and partial bands |
| Volume section extraction | Ordered cavity contours made from disconnected neighboring pieces |
| Authored UV mapping and render tint | Material regions, grain direction, shared palettes and persistent vertex colors |
| Static/runtime compilation | Render triangles, Quad View control geometry, instances and morph shapes |

The target APIs for these are specified in [02](02-shape-construction.md),
[03](03-geometry-editing.md), [05](05-surfaces-and-export.md), and
[09](09-api-contracts.md).

## 1. Wooden plank — `plank.ts`

**Actual construction:** Five four-corner cross-sections, 1.2 m long,
22 cm wide, 3 cm thick. Sections bend upward through the middle.
Long-grain sides and end-grain caps have different materials.

**Construction path**

1. Keep the model's five rectangular `Section3` contours in their
   chosen coordinate frame, including the center lift.
2. `loftSections(sections, { ends: "cap" })` creates true quad side
   strips and directly caps each planar four-corner end with a quad.
3. No second `capBoundary` call is made on the already closed ends.
4. `surfaceAt` identifies side regions; the two ends have explicit
   end-grain regions.
5. Render using the model's oak palette and physical UVs.

**Proof obligation:** Exact end-corner correspondence, bend preserved,
genuine side quads and no change in the orientation of end grain.

The existing loft capability supplies this entire construction.

## 2. Sanding paper — `sandingpaper.ts`

**Actual construction:** A 23 × 28 cm, 0.8 mm thick segmented box:
12 width and 16 depth segments. A mathematical displacement field
adds bow, crease, curled corner and wave. One face carries abrasive
material; the remainder has paper backing.

**Construction path**

1. Build a subdivided thin solid from a rectangular profile; keep
   the top/bottom faces and sidewall regions separate.
2. Apply the original pointwise displacement as an authored
   `deformVertices` field. Shared top/underside edge vertices move
   consistently; the sheet retains thickness.
3. Recompute geometric normals from the resulting authored faces;
   preserve face-corner UVs and region assignments.
4. Render top abrasion and backing material. Position the render
   object from the actual post-deformation bounding box.

**Proof obligation:** No cracks between adjacent subdivided patches,
no duplicate creased vertices from UV seams, correct surface colors,
and the same silhouette/curl.

**Important:** The current source directly mutates `mesh.vertices`.
The migrated model must use the returned deformation result, keeping
the new kernel's snapshot semantics.

## 3. Common quillon dagger — `dagger.ts`

**Actual construction:** Three principal parts: a faceted double-edged
blade with a short ricasso and pointed tip; a symmetrical forged
quillon with tapered, downward-curved ends; and a continuously lofted
hilt whose surface regions change from iron to oak and back to iron.
The hilt contains controlled radial lobes and different smoothing
policies for wood and metal.

**Construction path**

1. Keep `facetedDiamondOutline` as a general reusable profile.
   `profileSpans` and `mirrorStations` provide station positions,
   interpolated radii, bulges, lateral offsets and symmetrical arms.
2. Convert each modeled station to a placed `Section3` contour,
   including radial variation fields and station-specific offsets.
3. `loftSections` constructs the blade, guard and grip surfaces.
   Any end subsequently passed to `tipBoundary` uses
   `{ ends: "open" }` until its explicit apex closes it.
4. **Assign surface names per contour edge and loft interval.**
   The blade uses `edge` on selected profile segments and `blade`
   elsewhere; the ricasso is its own longitudinal region.
5. **Assign smoothing per contour edge and interval.** The forged
   guard remains smooth; faceted edges and oak surfaces have
   intentional creases. Region transitions occur exactly at authored
   station boundaries.
6. `tipBoundary` closes the blade and both quillon ends at
   explicit points using genuine triangle fans. Opposite flat ends
   use the normal cap operation.
7. Render with steel, iron and oak region palettes, preserving the
   visually continuous joint silhouettes between separate parts.

**Proof obligation:** No made-up zero-width quad at a blade tip,
no lost side-specific steel edge material, and an iron–wood–iron
grip whose material transitions are at the same geometry stations.

**Required shared capability:** The original `LoftOptions` only described global
outer/inner regions. It cannot reproduce `loftAxialProfile()`'s
`surface(side, interval)` and
`smoothingGroup(side, interval)` behavior. These become general
loft options, alongside `tipBoundary`.

## 4. Tavern table — `table.ts`

**Actual construction:** Four hand-worked 1.8 m tabletop boards with
shared wandering seams, varied widths, end stagger, crown, edge
wear, chamfer and a narrow deliberate gap. Two five-timber trestles
support the top; a longitudinal stretcher joins their uprights.
UV offsets, oak/end-grain material and controlled color variation
are all visible features.

**Construction path**

1. The table model chooses four width weights and four oak designs.
2. A general planar partition creates the common seam boundaries.
   Every board uses the same stations on its neighboring edge.
3. The model offsets the pieces by the intentional gap and supplies
   controlled fields for edge wander, crown, corner wear, end
   stagger and thickness differences.
4. A section loft or a constructed upper/lower surface patch creates
   each board. Shared seams determine contact-side shape; crown
   and wear alter the visible face without unnecessarily opening
   the entire join.
5. Explicit edge shaping adds chamfers; caps receive end-grain
   regions and side faces retain physical wood UVs.
6. The model assembles each trestle from members positioned in its
   own local frame. The diagonal braces use
   `fitBetweenSurfaces` or the underlying plane-section solver
   to create genuinely mitered ends.
7. The top group contains both trestles and the stretcher,
   maintaining the existing parent-relative positioning.
8. A model-owned appearance layer applies per-piece oak variants,
   UV offsets and render vertex tint before export.

**Proof obligation:** Different planks remain independently
selectable objects; seams follow one geometry source and remain
visibly worn but not accidentally open; trestles maintain their
support contact and move correctly with the TableTop parent.

**Required shared capability:** A general surface/edge detail operation must support
face-specific crown and wear fields while preserving a separate
mating edge. Rendering must retain per-piece tint and UV variation.

## 5. Barrel — `barrel.ts`

**Actual construction:** Twenty-four individually shaped radial
staves along a nine-station bulged profile. Their outside edges
have narrow V-shaped relief, while the inner profiles use sparse
two-point rows. The top and bottom heads are circular assemblies
of five separately trimmed planks. Only their outward faces have
detailed shoulders, groove floors and wear. Four forged iron
bands follow the barrel bulge; each has a raised overlapping lap
and two real rivet heads.

**Construction path**

1. Create the shared radius/height profile and circumferential
   layout through a **general polar strip sampler**.
2. Each stave section has an outer open row with several bevel
   stations and a simpler inner open row. Join the two end points
   of those rows into one closed cross-section. The loft constructs
   quad strips across height; the cap uses correspondence-aware
   bridging and real triangles where densities differ.
3. Neighboring staves share angular seam geometry. The outer
   shoulder is recessed to catch shadow, while the physical
   underlying side contacts remain closed.
4. The model assigns wood variants, correlated color differences,
   end-grain caps and physical UV offsets per stave.
5. Partition a circular head into five profiles using shared
   clipped boundaries and weighted cuts. Preserve the common
   circular exterior outline.
6. Create a single `SampledProfile2` for each head plank and use
   it for the outward patch, inward patch and sidewall boundaries.
   Combine every adjoining seam and its groove/shoulder/edge-wear
   profile into **one** `shapeSurfaceRelief` call. The common welded
   outer rim must stay fixed: seam relief extends inward from that
   rim unless adjoining sidewalls are intentionally reconstructed. This preserves
   coherent sampling even for planks with two seams. Build the
   sparse inward surface separately and bridge the two boundary
   contours with actual sidewalls.
7. The head pieces keep complete contact below the shallow grooves.
   Top/bottom surface orientation and end-grain assignments are
   mirrored as intended.
8. Each iron band uses a periodic closed-path sweep over the
   bulged profile. The band profile provides wall thickness,
   width and bevels.
9. **Account for polygon chord sagitta**, using the reusable
   `polygonalRadiusOutside` helper or a geometric minimum-clearance
   fit, so the straight segments between sample points do not
   intersect the stave surface.
10. The raised lap is an open arc sweep with genuine end caps,
    offset beyond the main band. Two oriented cylinder heads
    use explicit surface normals and controlled penetration.

**Proof obligation:** Stave side contacts remain valid; inner
surfaces avoid unnecessary subdivisions; all head seams are
visible but watertight through the thickness; Quad View shows
actual head topology; bands and laps never z-fight or cut into
the wood between angular sample points.

**Gaps found:** General construction must support **mixed-density
open surface rows within a closed section**, sampled surface
patches with distinct top/bottom detail, and periodic bands with
a **surface-clearance check over their faces**, beyond mere
vertex contact.

## 6. Wooden beer mug — `beerMug.ts`

**Actual construction:** Twelve radial wooden staves (again with
detailed outer and simple inner rows), one inset wooden bottom,
two iron bands, and an eight-corner swept wooden handle.
Both handle ends are ray-fitted against the real faceted stave.
The liquid uses a cavity reconstructed from all stave inner
surfaces and eight volume-calibrated glTF morph targets. The
visible `fill_level = 1` represents 90% of the physical cavity.

**Construction path**

1. Reuse the polar strip sampler and mixed-density section loft
   from the barrel; choose twelve staves and the mug's narrower
   height/radius profile.
2. Build an inset cylindrical bottom using the general primitive
   or revolve constructor. Place it at its real model-specific
   height and define the usable cavity floor above it.
3. Sweep two closed-profile iron bands, with the required
   profile offsets and physical clearance.
4. Sweep the eight-corner handle profile along its explicit
   curved path. Save `start` and `end` boundary references.
5. `fitBoundary` uses the authored geometry of the target stave,
   its transform and a real ray policy. Fit the first endpoint,
   then fit the second using the updated result and saved
   boundary references. The projection keeps the topological
   structure and checks face inversion.
6. **Extract cavity section loops from the collection of
   independent stave inner faces.** Supply a rigid mug-local section
   frame independent of scene placement. Reuse horizontal row edges
   in that frame to form the XZ contour at authored local heights,
   preserving seam correspondence and a stable starting station.
   Reject missing, doubled and open sections. Interpolation at
   intermediate heights belongs to `ProfiledCavity`.
7. Build a `ProfiledCavity` from those ordered rings. Its
   piecewise-linear interpolation provides a volume function
   and inverse `heightAtFill`.
8. Limit the *usable* cavity top to `heightAtFill(0.9)` of the
   physical cavity, keeping the existing 1.0 behavior.
9. Generate a fixed topology liquid mesh with eight morph
   targets and a full, nondegenerate neutral base. Keep the
   current fill controller at the model/runtime boundary.
10. Render/export the shapes, their names, influences and
    materials using the special morph-target export path.

**Proof obligation:** Both handle mounts fit actual timber;
the cavity is reconstructed from twelve independent parts without
inventing a circular approximation; changing fill works in the
viewer and in Godot; full neutral morph geometry is valid.

**Required shared capability:** A general mesh-plane section and loop-stitching
operation is needed before `ProfiledCavity` can become reusable.
One arbitrary solid-mesh cavity extractor cannot be assumed to
reconstruct a cavity from *disconnected* surface patches.

## 7. Tavern bench — `tavernBench.ts`

**Actual construction:** A three-plank 1.52 m seat with the shared
seam/wear system, two trestles, a longitudinal stretcher, and
exposed oak draw-pins on posts and feet.

**Construction path**

1. Reuse table partitioning and plank section geometry for the
   three independent seat boards.
2. Build two trestles from the common model-owned trestle recipe,
   with the bench's own measurements.
3. Build and position the longitudinal member between the post
   contact faces, preserving the current lower height.
4. Construct a tapered cylinder for each peg and position it on
   the intended post or foot face using a contact frame. The peg
   remains an independently rendered piece, with a small
   intentional embed.
5. Apply the oak workshop's deterministic per-timber finish
   and UV layout.

**Proof obligation:** The seat and table share the same real
panel algorithm; pegs remain visible with correct orientation;
the trestle can be reused at different dimensions.

The common plank, member, surface-placement and panel operations
supply this construction.

## 8. Tavern chair — `tavernChair.ts`

**Actual construction:** Four legs, two rear stiles continuing
into the backrest, multiple fitted rails, a two-plank front seat,
a rear seat board with post housings, a three-plank back infill
aligned with the back rake, an asymmetrically crowned crest
rail and several oriented draw-pegs.

**Construction path**

1. Construct four members at the model's actual front/rear
   contact points, with rear stiles raked from foot to backrest.
   The profile's roll relative to the chair remains explicitly
   controlled.
2. Fit the lateral seat rails, front/rear lower stretchers,
   aprons, and back rail between actual selected support patches,
   respecting their finite footprint.
3. Partition and build the two front seat boards using the same
   panel system as the table and bench.
4. Construct the rear seat board's **different top and bottom
   outlines**. Both side-corner housings change their Z
   position through the 3.8 cm thickness to follow the raked
   rear stiles.
5. Align matching contour landmarks between the two layers.
   Project each resampled 3D wall contour into its own top/bottom
   patch chart to derive *actual* matching patch-boundary positions.
   Equal normalized parameter values alone are not sufficient.
   Give the upper/lower patches their shared sampled boundaries.
   Loft corresponding upper/lower boundary edges to produce
   slanted cheek walls. Construct a crowned upper patch and
   simpler lower patch, then connect the perimeter. This is a
   general layered-profile solid, applicable to sloped sheet
   trimming and nonvertical openings in other materials.
6. Build the back infill as three independently constructed
   boards, then position the assembly in the orthonormal
   frame determined by the back rake.
7. Model the crest rail using a station-varying board profile
   with different left/right boundaries, crown and end wear.
   Rotate it into the backrest frame.
8. Query the actual external face of each front/rear post,
   place each cylindrical draw-peg at the specified height,
   align to its contact normal and preserve intended embed.

**Proof obligation:** The upper/lower cut positions cannot be
silently flattened into a vertical recess; the back rake and
crest silhouette survive; fitted rails meet real faces; pegs
are oriented from geometric contacts.

**Required shared capability:** The original `openPatch` / `recessPatch` alone
cannot express this rear-seat geometry. The toolbox needs
**corresponding planar contour layers with independently shaped
surface patches**. This is a general geometric operation rather
than a special `cutBoard` replacement.

## Shared components and assembly

### `models/components/oakSeating.ts`

`oakPlankPanel`, `oakPlank`, and `oakTimberShop` continue to
hold board counts, wear choices, cut/seed selection, end-grain
materials, UV-window choices, and peg appearance.

The geometry below them comes from general construction,
partition, contact, and surface queries. Rendering applies
per-piece color tint *after* converting authored geometry,
without turning PBR materials or vertex tint into mesh-topology
operations.

The current `offsetMeshUvs()` **mutates the input MeshData
in place and returns it**. The new authored geometry API
returns a fresh result. All model call sites must retain that
returned value when migrating; some currently discard it
because mutation was assumed.

### `models/components/trestleSupport.ts`

The five-member trestle remains one model-owned assembly
recipe: foot, post, top bearer and two diagonal braces.
Only its shared miter/contact geometry moves to the toolbox.

The braces use the specified contact normals and actual
support positions. The algorithm supports either geometry
queried from constructed support parts or explicitly authored
contact planes; both feed the same section-fitting computation.
The factory's dimensions, timber appearance and parent-relative
scene assembly remain owned by the model.

## Shared capabilities required by the models

The model walk-through requires these capabilities to be
present in the target design:

1. **Per-edge and per-interval loft metadata**, including
   surface regions and smoothing groups (dagger, stave faces).
2. **An explicit point-tip cap** made from triangles (dagger).
3. **Correspondence between independently varying planar
   contours**, plus surface patches that can fill crowned or
   asymmetric faces (chair seat, panel faces).
4. **Batched surface relief along shared seams** with shallow
   shoulders, grooves and edge wear. All features on one face are
   combined before geometry is reconstructed, preserving the
   underlying contact surface (table, barrel heads).
5. **Polar layout and surface-following closed or partial sweeps**,
   including minimum clearance between actual polygonal faces
   (barrel hoops, mug bands).
6. **Section extraction and loop reconstruction across multiple
   independent surface pieces**, with ordering and volume
   calculation (beer mug).
7. **Explicit appearance conversion** for material regions, UV
   offsets and vertex tint, with the original morph-target runtime
   specialization retained (all models; beer mug).
8. **Model-local frame control and face-oriented placements**
   for supports, rails and small fittings (table, bench, chair).
9. **Pure geometry/UV edits with returned results**, replacing
   existing in-place mutation at model call sites.

These capabilities are part of the API contracts and implementation
sequence, with the exact part-by-part requirements above.

## Final model migration acceptance

| Model | Main geometric acceptance | Appearance/runtime acceptance |
| --- | --- | --- |
| Plank | Five-section bend; real quad sides and end caps | Correct oak/end grain |
| Sanding paper | Segmented thin sheet with continuous bow/fold/curl | Abrasive top, paper backing |
| Dagger | Faceted blade, tips, quillon and continuous material-transition hilt | Steel edges, ricasso, smooth iron and faceted oak |
| Table | Four coherent worn seam boards and fitted trestles | UV variation, grain, tints, group transforms |
| Barrel | Twenty-four shaped staves, grooved watertight heads and clear hoops | Actual quad/triangle layout, lap/rivets, wood/iron |
| Beer mug | Twelve staves, inset bottom, two fitted handle ends, reconstructed cavity | Full-range fill, eight morphs, GLB/Godot |
| Bench | Three-plank seat, two trestles, fitted stretcher, oriented pegs | Oak variants and physical scale |
| Chair | Slanted rear-seat corner housings, raked back, fitted rails and crest | Correct materials, back positioning, visible pegs |

**The shared algorithms must reconstruct these specific features
before the specialized constructors can be removed.**
