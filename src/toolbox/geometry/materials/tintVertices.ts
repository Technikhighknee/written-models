import * as THREE from "three";

/**
 * Adds a uniform vertex tint without modifying or duplicating the material's
 * PBR maps. Use with a material whose vertexColors flag is enabled.
 *
 * Keeping variation in the mesh makes adjacent boards independently tintable
 * while sharing a single GLTF-compatible material and its textures.
 */
export function tintVertices<T extends THREE.BufferGeometry>(
    geometry: T,
    color: THREE.Color
): T {
    const position = geometry.getAttribute("position");

    if (
        !position || position.itemSize !== 3 ||
        ![color.r, color.g, color.b].every(Number.isFinite) ||
        [color.r, color.g, color.b].some(component => component < 0)
    ) {
        throw new RangeError("Invalid geometry or vertex tint");
    }

    const values = new Float32Array(position.count * 3);

    for (let index = 0; index < position.count; index++) {
        const offset = index * 3;
        values[offset] = color.r;
        values[offset + 1] = color.g;
        values[offset + 2] = color.b;
    }

    geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(values, 3)
    );

    return geometry;
}
