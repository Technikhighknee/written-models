import * as THREE from "three";
import {
    atlasUv, packPbrTextures,
    type AtlasSource, type AtlasPage, type AtlasTile
} from "./textureAtlas";

type Material = THREE.MeshStandardMaterial;

interface Unit {
    mesh: THREE.Mesh;
    material: Material;
    start: number;
    count: number;
    tileId: string | null;
}

interface Batch {
    key: string;
    prototype: Material;
    units: Unit[];
    sources: Map<string, AtlasSource>;
}

interface Vertex {
    position: THREE.Vector3;
    normal: THREE.Vector3;
    color: THREE.Color;
    u: number;
    v: number;
}

interface Buffers {
    positions: number[];
    normals: number[];
    colors: number[];
    uvs: number[];
}

export interface RuntimeAsset {
    root: THREE.Group;
    sourceMeshes: number;
    outputMeshes: number;
    atlasPages: number;
    dispose(): void;
}

function textureReady(
    texture: THREE.Texture,
    reference: THREE.Texture
): texture is THREE.CanvasTexture {
    return texture instanceof THREE.CanvasTexture &&
        texture.image instanceof HTMLCanvasElement &&
        texture.channel === 0 &&
        texture.flipY && texture.rotation === 0 &&
        texture.center.x === 0 && texture.center.y === 0 &&
        texture.wrapS === THREE.RepeatWrapping &&
        texture.wrapT === THREE.RepeatWrapping &&
        texture.repeat.x > 0 && texture.repeat.y > 0 &&
        texture.repeat.equals(reference.repeat) &&
        texture.offset.equals(reference.offset) &&
        reference.rotation === 0 && reference.channel === 0 &&
        reference.center.x === 0 && reference.center.y === 0;
}

function supportedMaterial(material: THREE.Material): {
    key: string;
    source: AtlasSource | null;
} | null {
    if (!(material instanceof THREE.MeshStandardMaterial)) return null;
    if (
        material.transparent || material.opacity !== 1 ||
        material.alphaTest !== 0 || material.side !== THREE.FrontSide ||
        material.wireframe || material.emissive.getHex() !== 0 ||
        material.aoMap || material.alphaMap || material.bumpMap ||
        material.displacementMap || material.emissiveMap ||
        material.envMap || material.lightMap || material.metalnessMap ||
        material.normalMapType !== THREE.TangentSpaceNormalMap ||
        material.flatShading || material.depthWrite === false ||
        material.blending !== THREE.NormalBlending
    ) return null;

    const textured = !!material.map || !!material.normalMap || !!material.roughnessMap;
    let source: AtlasSource | null = null;
    if (textured) {
        const { map, normalMap, roughnessMap } = material;
        if (
            !map || !normalMap || !roughnessMap ||
            !textureReady(map, map) ||
            !textureReady(normalMap, map) ||
            !textureReady(roughnessMap, map)
        ) return null;
        // All three PBR channels share the same physical UV transform.
        source = {
            id: [map.uuid, roughnessMap.uuid, normalMap.uuid].join(":"),
            color: map,
            roughness: roughnessMap,
            normal: normalMap
        };
    }

    // Base tint is applied to the vertex colors, so independently tinted
    // variants can share one runtime draw call.
    const key = JSON.stringify([
        textured, material.metalness, material.roughness,
        material.normalScale.x, material.normalScale.y,
        material.side, material.normalMapType
    ]);
    return { key, source };
}

function lerpVertex(a: Vertex, b: Vertex, t: number): Vertex {
    return {
        position: a.position.clone().lerp(b.position, t),
        normal: a.normal.clone().lerp(b.normal, t).normalize(),
        color: a.color.clone().lerp(b.color, t),
        u: a.u + (b.u - a.u) * t,
        v: a.v + (b.v - a.v) * t
    };
}

function clipPolygon(
    polygon: readonly Vertex[],
    axis: "u" | "v",
    boundary: number,
    keepGreater: boolean
): Vertex[] {
    if (polygon.length === 0) return [];
    const result: Vertex[] = [];
    let previous = polygon[polygon.length - 1]!;
    let previousInside = keepGreater
        ? previous[axis] >= boundary - 1e-10
        : previous[axis] <= boundary + 1e-10;

    for (const current of polygon) {
        const inside = keepGreater
            ? current[axis] >= boundary - 1e-10
            : current[axis] <= boundary + 1e-10;

        if (inside !== previousInside) {
            const difference = current[axis] - previous[axis];
            if (Math.abs(difference) > 1e-15) {
                const t = Math.max(0, Math.min(1,
                    (boundary - previous[axis]) / difference
                ));
                result.push(lerpVertex(previous, current, t));
            }
        }
        if (inside) result.push(current);
        previous = current;
        previousInside = inside;
    }
    return result;
}

function appendTriangle(
    buffers: Buffers,
    triangle: readonly Vertex[],
    tile: AtlasTile | null,
    atlas: AtlasPage | null,
    cellU: number,
    cellV: number
): void {
    const [a, b, c] = triangle;
    if (!a || !b || !c) return;
    const cross = b.position.clone().sub(a.position)
        .cross(c.position.clone().sub(a.position));
    if (cross.lengthSq() <= 1e-22) return;

    for (const vertex of triangle) {
        buffers.positions.push(...vertex.position.toArray());
        buffers.normals.push(...vertex.normal.toArray());
        buffers.colors.push(vertex.color.r, vertex.color.g, vertex.color.b);

        if (tile && atlas) {
            const mapped = atlasUv(
                tile, atlas,
                Math.max(0, Math.min(1, vertex.u - cellU)),
                Math.max(0, Math.min(1, vertex.v - cellV))
            );
            buffers.uvs.push(mapped.x, mapped.y);
        } else {
            buffers.uvs.push(vertex.u, vertex.v);
        }
    }
}

function emitClipped(
    buffers: Buffers,
    triangle: readonly Vertex[],
    tile: AtlasTile | null,
    atlas: AtlasPage | null
): void {
    if (!tile || !atlas) {
        appendTriangle(buffers, triangle, null, null, 0, 0);
        return;
    }

    const uMin = Math.min(...triangle.map(v => v.u));
    const uMax = Math.max(...triangle.map(v => v.u));
    const vMin = Math.min(...triangle.map(v => v.v));
    const vMax = Math.max(...triangle.map(v => v.v));
    const firstU = Math.floor(uMin);
    const lastU = Math.max(firstU, Math.ceil(uMax) - 1);
    const firstV = Math.floor(vMin);
    const lastV = Math.max(firstV, Math.ceil(vMax) - 1);

    if ((lastU - firstU + 1) * (lastV - firstV + 1) > 256) {
        throw new RangeError("A polygon spans too many texture repetitions");
    }

    // A repeat seam cannot be represented by a single atlas UV triangle:
    // split there, then map each fragment into its isolated atlas cell.
    for (let u = firstU; u <= lastU; u++) {
        for (let v = firstV; v <= lastV; v++) {
            let clipped = clipPolygon(triangle, "u", u, true);
            clipped = clipPolygon(clipped, "u", u + 1, false);
            clipped = clipPolygon(clipped, "v", v, true);
            clipped = clipPolygon(clipped, "v", v + 1, false);

            for (let i = 1; i < clipped.length - 1; i++) {
                appendTriangle(
                    buffers,
                    [clipped[0]!, clipped[i]!, clipped[i + 1]!],
                    tile, atlas, u, v
                );
            }
        }
    }
}

function groupBuffers(): Buffers {
    return { positions: [], normals: [], colors: [], uvs: [] };
}

function collectTriangles(
    buffers: Buffers,
    unit: Unit,
    tile: AtlasTile | null,
    atlas: AtlasPage | null
): void {
    const mesh = unit.mesh;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const color = geometry.getAttribute("color");
    const uv = geometry.getAttribute("uv");
    const indices = geometry.getIndex();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const reversed = mesh.matrixWorld.determinant() < 0;

    const getVertex = (i: number): Vertex => {
        const index = indices?.getX(i) ?? i;
        const vertex = new THREE.Vector3()
            .fromBufferAttribute(position, index)
            .applyMatrix4(mesh.matrixWorld);
        const normal = normals
            ? new THREE.Vector3().fromBufferAttribute(normals, index)
                .applyMatrix3(normalMatrix).normalize()
            : new THREE.Vector3(0, 1, 0);
        const tint = unit.material.color.clone();
        if (unit.material.vertexColors && color) {
            tint.r *= color.getX(index);
            tint.g *= color.getY(index);
            tint.b *= color.getZ(index);
        }

        const repeat = unit.material.map?.repeat;
        const offset = unit.material.map?.offset;
        return {
            position: vertex,
            normal,
            color: tint,
            u: (uv?.getX(index) ?? 0) * (repeat?.x ?? 1) + (offset?.x ?? 0),
            v: (uv?.getY(index) ?? 0) * (repeat?.y ?? 1) + (offset?.y ?? 0)
        };
    };

    for (let i = unit.start; i < unit.start + unit.count; i += 3) {
        const vertices = [getVertex(i), getVertex(i + 1), getVertex(i + 2)];
        if (reversed) [vertices[1], vertices[2]] = [vertices[2]!, vertices[1]!];
        if (!normals) {
            const faceNormal = vertices[1]!.position.clone()
                .sub(vertices[0]!.position)
                .cross(vertices[2]!.position.clone().sub(vertices[0]!.position))
                .normalize();
            for (const v of vertices) v!.normal.copy(faceNormal);
        }
        emitClipped(buffers, vertices as Vertex[], tile, atlas);
    }
}

function makeGeometry(buffers: Buffers): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",
        new THREE.Float32BufferAttribute(buffers.positions, 3));
    geometry.setAttribute("normal",
        new THREE.Float32BufferAttribute(buffers.normals, 3));
    geometry.setAttribute("uv",
        new THREE.Float32BufferAttribute(buffers.uvs, 2));
    geometry.setAttribute("color",
        new THREE.Float32BufferAttribute(buffers.colors, 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

/**
 * Compile a static, editable-in-source model into a compact GLB export.
 * The authoring model and its MeshData/control topology remain untouched.
 *
 * Dynamic, skinned and unsupported materials are copied without merging.
 */
export function prepareRuntimeModel(model: THREE.Object3D): RuntimeAsset {
    model.updateWorldMatrix(true, true);

    const root = new THREE.Group();
    root.name = model.name || "RuntimeAsset";
    const batches = new Map<string, Batch>();
    const fallback: THREE.Mesh[] = [];
    let sourceMeshes = 0;

    model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (!object.visible) return;
        let ancestor = object.parent;
        while (ancestor && ancestor !== model.parent) {
            if (!ancestor.visible) return;
            ancestor = ancestor.parent;
        }
        sourceMeshes++;

        const geometry: THREE.BufferGeometry = object.geometry;
        const position = geometry.getAttribute("position");
        const color = geometry.getAttribute("color");
        const uv = geometry.getAttribute("uv");
        const materials = Array.isArray(object.material)
            ? object.material : [object.material];
        const indexCount = geometry.index?.count ?? position?.count ?? 0;
        const groups: { start: number; count: number; materialIndex: number }[] =
            geometry.groups.length
                ? geometry.groups.map(group => ({
                    start: group.start,
                    count: group.count,
                    materialIndex: group.materialIndex ?? 0
                }))
                : [{ start: 0, count: indexCount, materialIndex: 0 }];

        const valid = !(object instanceof THREE.SkinnedMesh) &&
            !(object instanceof THREE.InstancedMesh) &&
            !!position && position.itemSize === 3 &&
            (!color || color.itemSize === 3) &&
            (!uv || uv.itemSize === 2) &&
            !object.morphTargetInfluences &&
            geometry.drawRange.start === 0 &&
            geometry.drawRange.count === Infinity &&
            groups.every(group => {
                const material = materials[group.materialIndex];
                if (!(material instanceof THREE.MeshStandardMaterial) ||
                    supportedMaterial(material) === null) return false;
                return group.start >= 0 && group.count >= 0 &&
                    group.count % 3 === 0 &&
                    group.start + group.count <= indexCount &&
                    (!material.vertexColors || !!color) &&
                    (!material.map || !!uv);
            });

        if (!valid) {
            const copy = new THREE.Mesh(object.geometry, object.material);
            copy.name = object.name;
            copy.matrixAutoUpdate = false;
            copy.matrix.copy(object.matrixWorld);
            fallback.push(copy);
            return;
        }

        for (const group of groups) {
            if (group.count === 0) continue;
            const material = materials[group.materialIndex] as Material;
            const support = supportedMaterial(material)!;
            let batch = batches.get(support.key);
            if (!batch) {
                batch = {
                    key: support.key, prototype: material,
                    units: [], sources: new Map()
                };
                batches.set(support.key, batch);
            }
            if (support.source) {
                batch.sources.set(support.source.id, support.source);
            }
            batch.units.push({
                mesh: object,
                material,
                start: group.start,
                count: group.count,
                tileId: support.source?.id ?? null
            });
        }
    });

    const ownedGeometries: THREE.BufferGeometry[] = [];
    const ownedMaterials: THREE.Material[] = [];
    const ownedTextures: THREE.Texture[] = [];
    let atlasPages = 0;
    let outputMeshes = 0;

    for (const batch of batches.values()) {
        const { pages, tiles } = packPbrTextures([...batch.sources.values()]);
        atlasPages += pages.length;
        for (const page of pages) {
            ownedTextures.push(page.color, page.roughness, page.normal);
        }
        const bucketCount = pages.length || 1;

        for (let pageIndex = 0; pageIndex < bucketCount; pageIndex++) {
            const page = pages[pageIndex] ?? null;
            const buffers = groupBuffers();

            for (const unit of batch.units) {
                const tile = unit.tileId ? tiles.get(unit.tileId)! : null;
                if (tile && tile.page !== pageIndex) continue;
                collectTriangles(buffers, unit, tile, page);
            }
            if (buffers.positions.length === 0) continue;

            const geometry = makeGeometry(buffers);
            const material = new THREE.MeshStandardMaterial({
                name: page ? "Atlased Surface" : "Merged Surface",
                color: 0xffffff,
                vertexColors: true,
                roughness: batch.prototype.roughness,
                metalness: batch.prototype.metalness,
                normalScale: batch.prototype.normalScale.clone(),
                side: batch.prototype.side
            });
            if (page) {
                material.map = page.color;
                material.roughnessMap = page.roughness;
                material.normalMap = page.normal;
            }
            const merged = new THREE.Mesh(geometry, material);
            merged.name = page ? `AtlasMesh${pageIndex + 1}` : "MergedMesh";
            root.add(merged);
            ownedGeometries.push(geometry);
            ownedMaterials.push(material);
            outputMeshes++;
        }
    }

    for (const object of fallback) root.add(object);
    outputMeshes += fallback.length;

    return {
        root, sourceMeshes, outputMeshes, atlasPages,
        dispose() {
            for (const geometry of ownedGeometries) geometry.dispose();
            for (const material of ownedMaterials) material.dispose();
            for (const texture of ownedTextures) texture.dispose();
        }
    };
}
