# 02 — Shape Construction

A construction operation builds topology from geometric definitions:
points, contours, profiles, paths, and sections.

## Shared geometric vocabulary

```ts
type Contour2 = {
  points: readonly Vector2Like[];
  closed: boolean;
};

type Profile2 = {
  outer: Contour2;
  holes?: readonly Contour2[];
};

type Contour3 = {
  points: readonly Vector3Like[];
  closed: boolean;
};

type Section3 = {
  outer: Contour3;
  inner?: readonly Contour3[];
};

type Path3 = {
  at(t: number): Vector3Like;
  tangent(t: number): Vector3Like;
};

type SectionField = (t: number) => Profile2;
type ScalarField = (t: number) => number;
```

These definitions follow [the shared API](09-api-contracts.md): `Section3`
contains positioned 3D contours, while `SectionField` produces 2D
profiles that a sweep places in transported path frames.

Contour cleanup, winding, resampling, uniform and adaptive station
selection, and local frames belong to shared utilities. They are
usable by every construction algorithm.

### Sampling and correspondence

A contour has a specific vertex order and winding. Corresponding
sections must establish which point or boundary feature maps to which
one on the next section.

A 3D loft section has an outer contour and optionally one or more
inner contours. Sweeps take a 2D profile and place it in transported
3D frames along the path.
An annular section produces separate outer and inner wall strips and
an end cap spanning the two contours.

Correspondence is established per loop (outer contour and each hole),
including its winding, seam station, and landmarks. The number and
identity of loops remain constant across a loft interval. A hole
appearing or disappearing requires a separately authored transition
patch.

`sampleProfile(profile, stations)` resolves a planar outer loop and
each hole independently at explicit normalized perimeter stations.
The input must retain every authored corner, including collinear
features; a missing corner is an invalid request. Original corner
coordinates are copied exactly, not approximated through interpolation.

`correspondContours(first, second, landmarks)` aligns two 3D contours
by explicitly named feature anchors. Each landmark-to-landmark
interval merges the arc-length fractions required by both outlines.
Both returned contours use identical ordered station arrays and keep
every original input corner's 3D coordinates. A closed correspondence
uses one authored landmark as the periodic seam, without duplicating
its final vertex. Open correspondences preserve both endpoints.
Conflicting landmark traversal orders are rejected.

For matching contours, each interval creates genuine quad side faces.
When boundaries have different subdivisions, `stitchPolylines`
provides genuine transition triangles. Shared landmarks are kept at
the same stations on both sides.

`adaptiveStations()` already chooses subdivisions using actual
geometric deviation and fixed knots. The target API also returns
measured deviation and saturated intervals when the recursion limit
was reached. Hard tolerance requests fail explicitly if an interval
remains over tolerance. Every neighboring surface uses the same
returned station array.

`bridgeBoundaries` consumes already sampled 3D contours and
explicitly corresponding station parameters, without splitting or
resampling their source edges. Matching station intervals become
authored quads when their geometry is valid; unequal transitions
remain authored triangles. Closed contours use stations in
`[0, 1)`, with a shared, physically unwrapped UV seam. Open
contours include stations `0` and `1`. Both retain named,
owned source-boundary chains for later explicit joining.

`stitchPolylines()` supplies the same monotone advance order for
open or periodic contours. Both rings are separate construction
inputs: the operation builds only the bridge strip, not a hidden
weld into existing source geometry. Collapsed contour edges and
coincident sampled vertices between both contours are rejected.
This does not substitute for a general surface/self-intersection
query on arbitrary crossing 3D strips.

## Core construction operations

| Operation | Input | Result |
| --- | --- | --- |
| `extrudeContour` | Planar contour(s), depth/axis, cap and bevel profile | Mesh and named front/back boundaries |
| `loftSections` | Ordered compatible 3D sections | Side surfaces, caps, start/end loops |
| `sweepSection` | Path, profile/section field, orientation field | Lofted geometry and end boundaries |
| `revolveProfile` | Meridian in a plane, rotation axis, angular sampling | Rotational mesh with explicit poles and seam |
| `bridgeBoundaries` | Two oriented boundary loops, correspondence | Surface strip using quads and necessary triangles |
| `revolveProfile` / `sweepSection` | Paired wall contours or annular profile | Hollow shell with actual wall and rim topology |
| `capBoundary` | Closed planar loop, triangulation policy | End surface and referenced cap region |
| `tipBoundary` | Open end loop and explicit apex | Genuine triangle-fan tip |
| `correspondContours` | Two outlined sections, matched landmarks | Consistent station correspondence across different shapes |
| `fillSurfacePatch` | Footprint and a 2D→3D surface chart | Crowned or irregular face with matching boundary |
| `joinGeometry` | Authored pieces with explicit shared loops | One connected mesh without indiscriminate welding |
| `samplePolarStripSections` | Axisymmetric profile, angular cuts, outer/inner samples | Sections for radial cladding, staves or metal shells |

Names above describe intended responsibilities. Existing names can
be retained when their semantics already match.

### Extrusion

`extrudeContour(profile, { frame, depth, caps, layers })` constructs
authored geometry from either a raw `Profile2` or a previously
sampled `SampledProfile2`. The frame is rigid and measures local
XY coordinates and positive Z depth in meters. A layer gives its
normalized depth and signed, planar contour offset. Corresponding
layers preserve the input contour stations, including inner loops,
and share `loftSectionWalls` topology.

`capSectionEnd` joins the open walls into planar, annular or
convex-quad ends using the exact construction vertices. With
`caps: false`, the selected end loops remain available.
The planar `triangulateProfile` helper preserves collinear authored
boundary stations instead of creating hidden T-junctions.
`shapes/operations/extrude` uses that same triangulator.

Mitered offsets are local contour operations. A general polygon
offset with guaranteed global intersection resolution is a
separate editing problem, not an implicit promise of extrusion.

`shapeSectionCorners` is the shared construction-time treatment for
specific convex section corners. It produces exact straight chamfer
edges or sampled tangent circular arcs, and an ordered edge-provenance
array. The resulting planar contour can be placed in any section
frame, used for a longitudinal loft or extruded directly, and can be
sampled once for a separate charted end patch. The same contour on
both sides of a join guarantees matching authored rim vertices;
material regions follow provenance rather than hard-coded point
indices. It changes a *source profile*, not an already built mesh.
General post-hoc beveling belongs to Phase 6.

### Lofting

`loftRings()` already builds arbitrary 3D closed contours with
quads on the sides and triangulated caps. `loftSections()` handles
four-corner sections and quad end caps. `loftBoard()` contains
useful techniques for independently sampled sides and resolution
transitions.

Use one section-loft engine to connect corresponding contours.
The current `loftRings()` already triangulates concave flat ends using
`THREE.ShapeUtils.triangulateShape()`, while four-corner `loftSections()`
keeps authored quad caps. The unified engine retains both choices.
A four-corner cap stays a quad when it is coplanar and convex;
concave or holed caps use explicit triangulation or patch faces.
`capBoundary` closes a single open rim; `capSectionEnd` closes an
outer rim together with its inner rims. Both reuse the exact source
vertices and consume their open-boundary selections. `tipBoundary`
adds a genuine apex fan for an outward-pointing convex end.
Unsupported or nonplanar cap contours are rejected rather than
silently flattened.

Sections can translate, rotate, change scale, and change shape along
the loft. Callers control the stations and section correspondence.

### Sweeping

The existing `construction/sweepSection` retains its Catmull–Rom
convenience API for current models. The Phoenix
`build/sweepSection` accepts a general `Path3`, shared authored
sampling stations and a `SectionField`, so a section may vary its
width, depth, eccentricity, angle and contour shape without an
object-specific constructor:

```ts
sweepSection({
  path,
  sectionAt: t => sectionProfile(t),
  startingFrame,
  stations: adaptiveStations(sampleSections, { maxDeviation }).stations,
  ends: "cap"
});
```

The rigid starting frame fixes the roll orientation: local +Z
matches the path's forward tangent, local +X/+Y define the profile
axes, and its origin lies at the path start. Inconsistent frames or
zero tangents fail explicitly. Frame transport avoids sudden flips.
Sampling is shared with adaptive section geometry.

A rectangular timber, bent pipe, dagger handle, and branch can
all use this mechanism. Open sweeps reuse the shared loft walls and
planar cap operations; hollow sections retain their inner walls and
annular end caps. For a periodic path (`closedPath: true`),
frame transport distributes residual twist over the loop. The
construction stations occupy `[0, 1)` and the wrapping faces reuse
the first ring's vertex IDs, producing a coherent closed seam.
The section at `t = 1` must match the section at `t = 0`
after transport; it supplies the end frame and physical UV distance
but no new construction vertices. Periodic sweeps have no end caps.

### Revolution

`revolveProfile(meridian, options)` revolves an authored
radius/height contour around an explicit axis and radial-zero
direction. `revolveMeridianMesh` is the common topology engine used
by that operation and the Y-axis `latheMeridian` convenience
constructor. Existing vessel and shell generators keep their
per-interval material/smoothing regions and radial wave controls.

Full revolutions share their angular-seam vertex IDs. Partial
revolutions retain distinct angular boundaries or triangulate planar
angular closures when `caps` is selected. Positive-radius open
meridians can leave their circular rims exposed or acquire radial
end caps. Cyclic meridians create actual shell wall thickness without
inventing geometry along the rotation axis.

Axis poles use genuine triangle fans; regular strips use authored
quads. Material and smoothing callbacks receive original meridian
and angular interval indices, not indices of synthetic cap rows.
Surface/UV compilation remains separate from authored topology.

### Polar strip sampling

`samplePolarStripSections` divides a radius/height meridian into
separately authored circumferential strips. The visible outer row
and hidden inner row each have their own ordered normalized stations;
they are not artificially resampled to match. Each height returns
one positioned `Section3` with its outer arc followed by the
reversed inner arc, joined at both thickness edges.

The sampled sections are construction inputs for the shared loft
and cap operations, rather than meshes or material-specific staves.
The old `radialStripLayout` is an adapter that exposes the same
sections as independent `BoardSection.outer` and `.inner` rows
for existing models.

`gap` is measured along the reference meridian's circumference
at each height; its angular opening changes as the profile radius
changes. With zero gap, adjacent pieces share seam coordinates
but retain independent vertices and part ownership. The sampler
rejects collapsed radii, thicknesses and self-crossing section
contours rather than producing invalid wall strips.

The `loftBoard` construction uses the shared `loftSideQuads`
engine for all longitudinal surfaces, retaining the existing
perimeter U and first-corner longitudinal V coordinates. Its
mixed-density end faces retain the authored boundary vertices without
inserting subdivisions.
The Catmull–Rom sweep convenience API also delegates to the
transported `build/sweepSection` implementation, retaining its
section flare, named caps and smoothing groups. These routes are
exercised against the plank, dagger, barrel and wooden mug geometry
in the Phase 2 model-level proof.

### Shells and thickness

A wall follows two related surface contours. In the initial
construction system, a hollow section contains an outer loop
and inner loops. Sweeping or lofting those matched loops
constructs the actual inner and outer walls; the end treatment
connects their rim boundaries when a cap is requested.

For a revolved cup, an inner and outer meridian defines the wall.
For a bent tube, an annular cross-section is swept. For a general surface, offsetting needs authored normals and
fold/self-intersection checks. Profile-based shells come first;
a fully general arbitrary-surface offset is a separate algorithm
with its own geometry-validity requirements.

### Direct surface construction

`AuthoredMeshBuilder` stays the simple way to author individual
triangular and quadrilateral patches. Generic `bridgeBoundaries`
handles surface strips, including mismatched detail densities.

This preserves the freedom to create unusual forms directly without
inventing an object generator.

## Construction output

Each operation returns authored geometry with meaningful region
and boundary names. For example, a loft exposes `start`, `end`,
`side`; a shell exposes `outer`, `inner`, and `rim`.
The caller can rename regions to suit the model. Named boundary
arrays include every outer rim and each opening around an inner
wall. `fillSurfacePatch` takes an explicitly sampled planar profile,
including the separate hole loops. Its chart maps exact boundary
points into 3D; only the interior may be refined. Neighboring
walls consume that same boundary. Sampling and precision follow
[11](11-numerics-and-query-fidelity.md).

### Longitudinal materials and hard edges

A loft can assign surface regions and smoothing groups for **each
contour edge and section interval**. Surface changes begin at
existing station boundaries. The same construction handles a
faceted dagger with steel edge strips and ricasso, a smooth forged
guard, and a hilt that changes iron → wood → iron while keeping
its uninterrupted shape.

`tipBoundary` connects an open end loop to an explicit point with
real triangles, preserving per-corner UVs and correct winding.

### Curved faces and independent section layers

`correspondContours` aligns landmarks between two differently
shaped outlines and produces corresponding semantic stations between
landmarks. These are not independent arc-length fractions: each
3D contour is projected into its own patch chart to obtain exactly
matching top/bottom fill-boundary positions. Lofting
those resulting sections constructs actual sidewalls, including
a wall that slopes between a notch's top and bottom position.

`fillSurfacePatch` builds the top or bottom face from a local
2D footprint and a 3D chart. Its interior can have crown,
cupping, carved seams or asymmetric form. Boundary stations
match the corresponding loft wall. `joinGeometry` shares
topology along the designated loops, preserving the connected solid.
This reconstructs the chair's raked rear-seat housings as well
as the barrel head's separately detailed faces.

### Radial strip construction

`samplePolarStripSections` samples a radius/height profile into
separate circumferential strips. Each section can have a densely
sampled outside and a sparse inside joined by two lateral edges.
The same section loft provides the outer face, inner face,
side contacts and mixed-density end caps. A closed path sweep
constructs hoops; a partial sweep constructs overlaps.

For a polygonal hoop, `polygonalRadiusOutside` provides an
analytic chord clearance around an axisymmetric profile. The
`surfaceClearance` query validates actual finite surfaces,
including the segment interiors between angular vertices.

These construction paths are exercised for every existing model
in [12](12-model-by-model-proof.md).

Caps, rims, and transitions are real surfaces. Models select their
materials and choose how individual constructed parts fit together.

## Existing implementation map

- `loftSections`, `loftRings`, `loftBoard`, `loftAxialProfile` →
  common section construction and correspondence, with axis-based
  profile sampling as a convenience input.
- `sweepSection`, `ellipticalRing`, `profiledMesh` →
  a general swept/lofted profile pipeline and model-level composition.
- `extrude`, `cleanClosedContour`, `clipConvexPolygon` →
  contour preprocessing, cap generation, and section extrusion.
- `latheMeridian`, `revolveShell`, `turnedVessel` →
  rotational geometry, shells, and model-selected profile forms.
- `boxMesh`, `cylinderMesh` remain simple primitive constructors
  backed by the same authored-geometry operations and output type.
