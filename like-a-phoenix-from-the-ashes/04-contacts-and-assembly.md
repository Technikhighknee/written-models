# 04 — Contacts and Assembly

Contacts are determined from authored surfaces and explicit transforms.
Fitting an end to a target surface and assembling separate components
are reusable geometric operations.

## Surface targets

```ts
interface SurfaceTarget {
  geometry: MeshData;
  localToWorld: THREE.Matrix4;
}
```

World-space queries return world-space data. Construction can request
results in any chosen local frame. A model can query its own authored
geometry before creating Three.js objects.

| Query | Returns |
| --- | --- |
| `raycastSurface(target, ray)` | Hit position, normal, face, region, distance |
| `intersectPlane(target, plane)` | Intersection loops |
| `facePlane(target, face)` | A planar face's plane |
| `findFacingPatch(target, direction, near)` | A facing, spatially relevant contact patch |
| `closestSurfacePoint(target, point)` | Closest point, normal, region, distance |
| `boundaryOfRegion(target, region)` | Ordered region-border loops |

`MeshSurfaceQuery` already raycasts triangles in world space.
`supportFacePlane` already queries authored quads and recovers
a face plane. Both become implementations of this common query API.
Planar-face queries also support genuine triangles and connected
coplanar patches.

Contact selection uses the intended joint's location and direction.
It returns the actual chosen face/patch so later operations can use
that geometric reference.

## Fit a member between surfaces

The current working calculation is:

```text
fitBetweenSupports → supportFacePlane / pointOnContactPlane
                   → sectionsBetweenPlanes
                   → loftSections or loftRings
```

`sectionsBetweenPlanes()` already accepts arbitrary polygonal
cross-sections. The public result can include its fitted sections
and precise contact information:

```ts
const fitted = fitBetweenSurfaces({
  start: { target: firstSupport, near: firstJoint },
  end:   { target: secondSupport, near: secondJoint },
  section,
  frame
});

const member = loftSections(fitted.sections);
```

Each section corner intersects the support plane *along the member
axis*, producing a properly slanted end across the whole profile.

The return value identifies the selected surfaces, contact normals,
endpoint frames and actual section loops. This replaces the
wood-specific `TimberContactNormals` dependency currently imported
by `fitBetweenSupports()`.

## Fit a boundary to a curved surface

`fitBoundaryToSurface()` already projects boundary vertices onto
actual triangles and uses falloff into adjacent topology rings.

Its target interface accepts an **ordered boundary reference**,
a geometric target, a projection direction or closest-point policy,
and a falloff definition.

```ts
fitBoundary(
  handle,
  handle.boundaries.start,
  mugBody,
  { projection: "ray", direction, falloff }
);
```

Each hit is returned with its target face and position. The
operation preserves the source's face topology when it only moves
vertices. Boundary refinement can add stations before fitting to
capture curved contacts accurately.

A fitted handle, pipe connection, curved support, or organic branch
can share this process.

## Three useful connection modes

1. **Assembly:** Components are aligned and parented while retaining
   their own geometry.
2. **Contact:** Their edges or surfaces are geometrically fitted to
   one another, with specified clearance or penetration.
3. **Topological join:** Their meshes are intentionally rebuilt as a
   connected solid, with coincident vertices and continuous surfaces.

The fitting operations supply assembly/contact data. Explicit weld
or solid-union operations provide continuous topology when the
model requires it.

## Frames and attachments

`contactFrame()` already derives a right-handed frame from a point,
normal and in-plane tangent. Both `attachByAnchors()` and
`attachByFrames()` compute related attachment transforms and
protect against object hierarchy cycles.

Unify the transform:

```text
childInParent = parentFrame × matingTransform × inverse(childFrame)
```

`matingTransform` determines whether frames align directly or mate
with opposite normals.

```ts
attachAtFrames(parent, child, parentFrame, childFrame, { mate: true });
```

Named anchors are frames owned by an object. Their resolution
converges on the same operation. Cycle and invertibility checks
exist in one place.

Fitting a shape is independent from choosing the parent object.
The geometry can be prepared before the scene hierarchy exists.

## Existing consumers

- **Tavern chair:** The model supplies its post locations, rail
  cross-section and joint positions. Shared queries find both
  supporting surfaces and fit the rail ends.
- **Trestles and bench:** The same fitting works on cross-braces and
  other members regardless of material.
- **Beer mug:** A swept handle exposes boundaries that are projected
  onto the mug's body.
- **Future metalwork:** A diagonal metal brace uses the same
  contact and member-section algorithms as timber construction.

## Precision

All positions, clearances, falloffs, and tolerances are in meters.
Transforms are explicit. Fitted sections retain correct winding and
positive member length. Failed ray contacts report the missed
boundary stations. Geometry returned by fitting is ready for
subsequent operations.
