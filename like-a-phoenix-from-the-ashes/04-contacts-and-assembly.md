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

World-space queries return world-space hit points and normals.
Their face references identify the **authored** face on the target.
The target's transform is explicit, so a model can query authored
geometry before creating a Three.js scene object.

| Query | Returns |
| --- | --- |
| `raycastSurface(target, ray)` | Hit position, normal, face, region, distance |
| `intersectPlane(target, plane)` | Intersection loops |
| `facePlane(target, face)` | A planar face's plane |
| `findFacingPatch(target, direction, near)` | A facing, spatially relevant contact patch |
| `closestSurfacePoint(target, point)` | Closest point, normal, region, distance |
| `boundaryOfRegion(target, region)` | Ordered region-border loops |

`MeshSurfaceQuery` currently builds a temporary double-sided
Three.js mesh from BufferGeometry and raycasts its triangles in
world space. The shared query can retain that acceleration technique.
The renderer and geometric query share one triangulation of authored
faces. Each triangle records its original `FaceRef` and corner offsets;
hits return barycentrics and the geometric world-space normal derived
from authored winding. The normal does not flip toward the ray.
`frontFacing` reports the ray's side of the triangle separately.
`supportFacePlane` already queries authored quads and recovers
a face plane. Both become implementations of this common query API.
Planar-face queries also support genuine triangles and connected
coplanar patches.

Contact selection scores nearby faces by orientation and proximity
to the desired joint. The current `supportFacePlane()` only checks
quads and chooses a matching normal above 0.9. The shared query
also supports triangles and connected coplanar patches.

The resulting *plane* is not necessarily a valid contact. The entire
fitted outline, including its segments, must be contained within
the chosen support footprint and outside its holes. Checking only
corners fails on concave patches. The model selects a different
patch explicitly when the original one cannot contain the section.

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
  end: { target: secondSupport, near: secondJoint },
  section: memberProfile,
  referenceDirection: worldUp
});

const member = loftSections(fitted.sections, { ends: "cap" });
```

The axis passes through the intended contact points. The reference
direction controls section roll around that axis. The operation
rejects a parallel/zero reference direction and returns positioned
3D sections in **world coordinates**.

Each section corner intersects the support plane *along the member
axis*, producing a properly slanted end across the whole profile.
The resulting **entire polygonal outline** must lie inside the finite
support patch and outside its holes, including the segments between
corners. The model can transform the fitted result into
its assembly-local coordinates before rendering.

The return value identifies selected surfaces, contact normals,
endpoint frames and actual section loops. A hollow member fits the outer and inner contours while retaining
their correspondence. This removes the wood-specific
`TimberContactNormals` dependency currently imported by
`fitBetweenSupports()`.

## Fit a boundary to a curved surface

`fitBoundaryToSurface()` already projects boundary vertices onto
actual triangles and uses falloff into adjacent topology rings.

Its interface accepts an **ordered boundary reference**, a geometric
target, a ray or closest-point policy, maximum travel, clearance
or embedding depth, falloff, and the source transform.

```ts
fitBoundary(
  handle,
  handle.boundaries.start[0]!,
  mugBody,
  {
    projection: { kind: "ray", direction, maxDistance },
    sourceLocalToWorld: handleTransform,
    clearance: 0,
    falloffRings: 2
  }
);
```

Each hit includes its authored target face and world position.
Every boundary station needs a valid hit inside the requested travel
range. Clearance is a signed world-meter offset along the geometric
target normal. Source vertices are displaced back in authored-local
coordinates through `sourceLocalToWorld`.

Projected movement must preserve valid incident face orientation.
Refinement introduces additional stations before projection when
needed. A vertex-only fit retains face indices; a refined fit returns
updated boundary references.

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

The attachment frames are specified in their respective local
spaces: `parentFrame` in parent-local coordinates and `childFrame`
in child-local coordinates. The transformation is:

```text
childInParent = parentFrame × matingTransform × inverse(childFrame)
```

`matingTransform` determines whether frames align directly or mate
with opposite normals.

```ts
attachAtFrames({
  parent, child, parentFrame, childFrame,
  matingTransform: opposingContactRotation
});
```

Frames have explicit local/parent coordinate conventions. Normals
under non-uniform scale use an inverse-transpose transform, and a
reflection changes winding.

Named anchors are frames owned by an object. Their resolution
converges on the same operation. Cycle and invertibility checks
exist in one place.

Fitting a shape is independent from choosing the parent object.
The geometry can be prepared before the scene hierarchy exists.
The geometric operation semantics are in [10](10-geometry-semantics.md).
Numerical tolerances and exact query-normal behavior are defined
in [11](11-numerics-and-query-fidelity.md).

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
