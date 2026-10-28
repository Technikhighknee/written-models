# 05 — Surfaces, Rendering and Export

Materials and rendering consume authored geometry after its
construction and editing operations are complete.

## Semantic surfaces

Each authored face has a surface region ID. Regions can represent
`outer`, `inner`, `end`, `cut`, `rim`, or any other surface
meaning defined by the model.

The material palette is assigned by the model. A surface name can
identify many disconnected patches, so editing uses precise face
or boundary selections.

```ts
surfaceMesh({
  name: "Part",
  geometry: part.geometry,
  materials: {
    outer: materialA,
    inner: materialB,
    cut: materialC
  }
});
```

This builds on the existing `surfaceMesh()` and
`toBufferGeometry()`.

Surface classification by face normal, adjacency, or spatial
selection works on authored faces. Today,
`assignMaterialsByNormal()` and `classifyExtrudedSurfaces()`
rearrange BufferGeometry triangles and render groups.
The classification logic moves upstream to the authored geometry,
then one compiler handles material groups.

## UV coordinates

World units remain meters. Face-corner UVs can represent physical
texture distances while construction vertices stay welded across
material and UV seams.

- Lofts derive lengths along sections and paths.
- Planar cut surfaces use a local construction frame.
- New subdivisions interpolate original UVs at created corners.
- `offsetMeshUvs()` remains a general transformation over authored UVs.
- UV operations can target selected surfaces or faces.

Materials in `src/materials/` determine the visual properties.
The geometric tools provide coordinates and meaningful surface
regions for applying those materials.

## Quad View

`getControlOutline()` currently accesses authored geometry
through `getControlMesh()` on BufferGeometry. The mapping is a
WeakMap owned by `toBufferGeometry()`. It remains useful for Quad
View, while geometric operations carry `MeshData` explicitly.
`ModelViewer` renders the resulting control edges.

Keep this display path. A compiled render mesh is associated with
the corresponding authored snapshot. Geometry edits create a
new authored/render pair, avoiding stale control positions.

Genuine quads and triangles remain distinct. Texture and normal
seams do not add false construction edges. Triangle counts
reflect the final GPU triangles, while the control view retains
the original construction topology.

## Render compilation

`toBufferGeometry()` stays the single compiler responsible for:

1. Validating authored vertices/faces.
2. Triangulating quads for the GPU.
3. Splitting GPU vertices at UV, material and smoothing boundaries.
4. Calculating smooth and flat normals from authored faces.
5. Producing indices and material groups.
6. Keeping a source association for Quad View.

Geometry builders and editing operations return `MeshData`
and explicit operation results. Models call the compiler once
they have finished the geometric construction of each piece.

## Runtime and GLB/Godot

`prepareRuntimeModel()` compiles export-ready clones,
consolidates **eligible static** geometry and packs compatible PBR
textures into atlas pages. The current optimizer excludes morph
meshes, instances, skinned meshes and unsupported materials from
static batching. When any skinned mesh is present, the exporter
clones the rigged hierarchy instead of running normal batching. `exportGlb()` uses GLTFExporter.

Retain the runtime features already present:

- Export operates on a copy of the viewer model.
- Vertex colors and physical material properties survive.
- Compatible static geometry can be consolidated.
- Instanced meshes preserve transforms and instance colors.
- Skinned meshes preserve skinning.
- Morph targets preserve their shapes and current weights.
- GLB carries triangles; Quad View keeps authored construction faces.
- Atlased and merged export meshes may have different object counts,
  UVs and triangle indices from the authored scene.
- TypeScript model methods are absent from GLB. The beer mug exports
  morph targets and their weights; the Godot controller drives them.

### Dynamic geometry

The beer mug's fill level is an existing runtime capability,
implemented with a persistent contents mesh and eight named
volume-calibrated morph targets. Godot controls the resulting
blend-shape weights with a value from 0 to 1.

Separate the geometric and runtime capabilities:

| Geometry | Runtime/model |
| --- | --- |
| Section extraction from the inner surface | Choice of a liquid volume |
| Profiled cavity and volume calculation | Definition of the fill behavior |
| Generation of compatible geometry snapshots | Blend-shape weights and named controller |
| Construction of a liquid surface shape | Choice of material, mesh, and appearance |

`ProfiledCavity` and `cavityFromMeshSurfaces` are sources of
geometric/volume operations. `createFillableVolume()` mixes that
geometry with runtime mesh and morph setup; these parts gain
clear responsibilities.

Other future runtime shape changes can reuse the same
compatible-topology snapshot/morph technique.

### Texturing

The reusable PBR baking, noise and field functions under
`src/toolbox/texturing/` remain their own capability family.
Material definitions in `src/materials/` remain independent of
the core geometric construction operations.

## Worked relationship

A fitted chair brace and a dagger blade can both produce authored
geometry with distinct `side` and `end` regions.
Each model selects its appropriate wood or metal materials.
Both use the same rendering/compiler pipeline.
