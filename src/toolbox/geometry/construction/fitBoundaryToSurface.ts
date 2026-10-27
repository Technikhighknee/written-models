import * as THREE from "three";
import type { MeshData } from "../mesh/MeshData";
import { MeshSurfaceQuery } from "../../spatial/queries/MeshSurfaceQuery";

export interface FitBoundaryToSurfaceOptions {
    /** The construction geometry being fitted, without modifying the input. */
    geometry: MeshData;
    /** Any named region defining the boundary vertices, often cap-start/end. */
    boundarySurface: string;
    /** Render geometry used as the contact target, in world coordinates. */
    target: THREE.Mesh;
    /** Casting direction toward the target. */
    direction: THREE.Vector3Like;
    /** Begin each ray this far opposite its casting direction. */
    rayOffset: number;
    /** Maximum distance of each ray. */
    maxDistance: number;
    /** Move the fitted boundary this far INTO the target along the ray. */
    embed?: number;
    /** Number of adjacent topology steps influenced by the boundary fit. */
    falloffRings?: number;
    /** Optional transform from source construction coordinates into world. */
    sourceMatrix?: THREE.Matrix4;
}

/**
 * Fit a named boundary of ANY authored MeshData to an existing mesh.
 *
 * Each boundary vertex is ray-projected individually, giving a true curved
 * contact contour rather than a guessed end plane. Neighboring vertices can
 * share a smaller displacement, blended by original topology distance.
 *
 * Surface regions, UVs, face indices and control quads are preserved.
 * This is geometric CONTACT, not a Boolean union or a welded topology:
 * use it for fitted beams, bands, swept members, trim and attachments.
 *
 * The caller supplies a direction that starts outside and enters the
 * target. All boundary rays must hit or the operation fails explicitly.
 */
export function fitBoundaryToSurface({
    geometry, boundarySurface, target, direction,
    rayOffset, maxDistance, embed = 0.0005,
    falloffRings = 1, sourceMatrix = new THREE.Matrix4()
}: FitBoundaryToSurfaceOptions): MeshData {
    if (!boundarySurface.trim() ||
        ![rayOffset, maxDistance, embed].every(Number.isFinite) ||
        rayOffset <= 0 || maxDistance <= rayOffset || embed < 0 ||
        !Number.isInteger(falloffRings) || falloffRings < 0 ||
        falloffRings > 8 ||
        Math.abs(sourceMatrix.determinant()) < 1e-12) {
        throw new RangeError("Invalid surface-fit parameters");
    }

    const axis = new THREE.Vector3(
        direction.x, direction.y, direction.z
    );
    if (![axis.x, axis.y, axis.z].every(Number.isFinite) ||
        axis.lengthSq() < 1e-16) {
        throw new RangeError("Invalid fitting direction");
    }
    axis.normalize();

    const faces = [...geometry.quads, ...(geometry.triangles ?? [])];
    const boundary = new Set<number>();
    for (const face of faces) {
        if (face.surface !== boundarySurface) continue;
        for (const index of face.corners) boundary.add(index);
    }
    if (!boundary.size) {
        throw new RangeError(`Mesh has no surface "${boundarySurface}"`);
    }

    const worldToSource = sourceMatrix.clone().invert();
    const projected = new Map<number, THREE.Vector3>();
    const query = new MeshSurfaceQuery(target);

    try {
        for (const index of boundary) {
            const local = geometry.vertices[index];
            if (!local) throw new RangeError("Invalid boundary vertex index");
            const world = local.clone().applyMatrix4(sourceMatrix);
            const origin = world.clone().addScaledVector(axis, -rayOffset);
            const contact = query.cast(origin, axis, maxDistance);
            if (!contact) {
                throw new RangeError(
                    `Surface fitting missed "${boundarySurface}" at vertex ${index}`
                );
            }
            const fittedWorld = contact.point.clone()
                .addScaledVector(axis, embed);
            projected.set(index, fittedWorld.sub(world));
        }
    } finally {
        query.dispose();
    }

    const clonedVertices = geometry.vertices.map(point => point.clone());
    const graph: Set<number>[] = Array.from(
        {length: clonedVertices.length}, () => new Set<number>()
    );
    for (const face of faces) {
        for (let corner = 0; corner < face.corners.length; corner++) {
            const a = face.corners[corner]!;
            const b = face.corners[(corner + 1) % face.corners.length]!;
            graph[a]!.add(b);
            graph[b]!.add(a);
        }
    }

    const depths = new Array<number>(clonedVertices.length).fill(-1);
    const queue = [...boundary];
    for (const index of queue) depths[index] = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor]!;
        const depth = depths[index]!;
        if (depth >= falloffRings) continue;
        for (const neighbor of graph[index]!) {
            if (depths[neighbor] !== -1) continue;
            depths[neighbor] = depth + 1;
            queue.push(neighbor);
        }
    }

    const sources = [...projected.entries()];
    const sourceWorld = sources.map(([index, delta]) => ({
        position: geometry.vertices[index]!.clone().applyMatrix4(sourceMatrix),
        delta
    }));
    for (let index = 0; index < clonedVertices.length; index++) {
        const depth = depths[index]!;
        if (depth < 0) continue;
        let displacement = projected.get(index);

        if (!displacement) {
            // Blend neighbouring boundary displacements by geometric
            // proximity, without imposing a ring order or vertex indexing.
            const location = geometry.vertices[index]!.clone()
                .applyMatrix4(sourceMatrix);
            let total = 0;
            const average = new THREE.Vector3();
            for (const seed of sourceWorld) {
                const weight = 1 / (location.distanceToSquared(seed.position) + 1e-8);
                average.addScaledVector(seed.delta, weight);
                total += weight;
            }
            displacement = average.multiplyScalar(1 / total);
        }

        const weight = depth === 0 ? 1 :
            (1 - depth / (falloffRings + 1)) ** 2;
        const world = geometry.vertices[index]!.clone()
            .applyMatrix4(sourceMatrix)
            .addScaledVector(displacement, weight);
        clonedVertices[index]!.copy(world.applyMatrix4(worldToSource));
    }

    return {
        vertices: clonedVertices,
        quads: geometry.quads,
        ...(geometry.triangles === undefined ? {} : {
            triangles: geometry.triangles
        })
    };
}
