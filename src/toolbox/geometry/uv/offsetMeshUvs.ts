import type { MeshData } from "../mesh/MeshData";

/**
 * Move a mesh's physical, meter-based UV coordinates without altering its
 * geometry or changing the shared material's texture transform.
 *
 * Useful for adjacent boards cut from different portions of one reusable
 * wood surface. Both top grain and end grain receive the offset.
 */
export function offsetMeshUvs(
    mesh: MeshData,
    u: number,
    v: number
): MeshData {
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
        throw new RangeError("Invalid UV offset");
    }

    for (const quad of mesh.quads) {
        for (const uv of quad.uvs) {
            uv.x += u;
            uv.y += v;
        }
    }

    return mesh;
}
