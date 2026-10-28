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

For matching contours, each interval creates genuine quad side faces.
When boundaries have different subdivisions, `stitchPolylines`
provides genuine transition triangles. Shared landmarks are kept at
the same stations on both sides.

`adaptiveStations()` already chooses subdivisions from actual geometric
deviation using multiple intermediate samples and explicit knots.
Use that same station sequence across surfaces which must join.

## Core construction operations

| Operation | Input | Result |
| --- | --- | --- |
| `extrudeContour` | Planar contour(s), depth/axis, cap and bevel profile | Mesh and named front/back boundaries |
| `loftSections` | Ordered compatible 3D sections | Side surfaces, caps, start/end loops |
| `sweepSection` | Path, profile/section field, orientation field | Lofted geometry and end boundaries |
| `revolveProfile` | Meridian in a plane, rotation axis, angular sampling | Rotational mesh with explicit poles and seam |
| `bridgeBoundaries` | Two oriented boundary loops, correspondence | Surface strip using quads and necessary triangles |
| `makeShell` | Profile or surface and thickness definition | Inner/outer surfaces and rim boundaries |
| `capBoundary` | Closed planar loop, triangulation policy | End surface and referenced cap region |

Names above describe intended responsibilities. Existing names can
be retained when their semantics already match.

### Extrusion

`shapes/operations/extrude.ts` already handles polygonal contours
with holes, true side quads, cap triangles, and repaired collinear
cap boundaries.

Split its geometric concerns into composable pieces:

1. Sanitize and orient contour loops.
2. Triangulate planar caps using the boundary's exact vertices.
3. Generate side strips between section layers.
4. Apply an optional offset/bevel profile between layers.
5. Emit named faces and boundaries in authored geometry.

A hole is an inner contour and produces an interior wall. Bevel
sections share the same boundary stations as their connected caps.

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
A four-corner cap stays a quad when it is coplanar and simple;
concave or holed caps use explicit triangulation or patch faces.

Sections can translate, rotate, change scale, and change shape along
the loft. Callers control the stations and section correspondence.

### Sweeping

`sweepSection()` already uses parallel-transport-like minimal rotation
along a Catmull–Rom curve.

Make the section an input function across the path so changing its
width, depth, eccentricity, angle, or contour shape requires no new
object-specific constructor:

```ts
sweepSection({
  path,
  sectionAt: t => sectionProfile(t),
  startingFrame,
  stations: adaptiveStations(sampleSections, { maxDeviation }),
  ends: "cap"
});
```

An explicit starting frame fixes the roll orientation. Frame
transport avoids sudden flips. Sampling is shared with adaptive
section geometry.

A rectangular timber, bent pipe, dagger handle, and branch can
all use this mechanism. Closed paths require the transported final
frame to meet the initial frame without an unwanted seam twist.

### Revolution

`latheMeridian()` already represents radial meridian stations and
generates authored faces. `revolveShell()` currently builds a closed
thickness profile and immediately converts it to `BufferGeometry`.

Separate the meridian construction, thickness profile, and render
conversion. Model-defined meridians generate solids, shells, partial
revolutions, and rims with one rotational operation.

Poles use genuine triangles. Regular rotational strips use quads.
The angular seam remains explicit and UV-continuous where intended.

### Shells and thickness

A wall follows two related surfaces. The toolbox provides ways to
construct their offset contours, connect their rims, and control
thickness along the shape.

For a revolved cup, an inner and outer meridian is enough. For a bent
tube, an annular cross-section can be swept. For a general surface, offsetting needs authored normals and
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
The caller can rename regions to suit the model.

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
