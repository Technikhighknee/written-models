import * as THREE from "three";

/**
 * BoxGeometry defaults to UVs in 0..1 regardless of its dimensions.
 * Remap every face into meters, preserving the box's existing face
 * orientation: on vertical sides, V follows the beam's local Y axis.
 *
 * A 12 cm wide beam therefore shows the same grain scale as a
 * 12 cm strip of a lofted plank, however long that beam becomes.
 */
export function boxUVsInMeters(
    geometry: THREE.BoxGeometry
): THREE.BoxGeometry {
    const {
        width, height, depth,
        widthSegments, heightSegments, depthSegments
    } = geometry.parameters;

    const faces: readonly [number, number, number, number][] = [
        [depthSegments, heightSegments, depth, height],
        [depthSegments, heightSegments, depth, height],
        [widthSegments, depthSegments, width, depth],
        [widthSegments, depthSegments, width, depth],
        [widthSegments, heightSegments, width, height],
        [widthSegments, heightSegments, width, height]
    ];

    const uv = geometry.getAttribute("uv");
    let offset = 0;

    for (const [columns, rows, physicalU, physicalV] of faces) {
        const count = (columns + 1) * (rows + 1);

        for (let i = offset; i < offset + count; i++) {
            uv.setXY(
                i,
                uv.getX(i) * physicalU,
                uv.getY(i) * physicalV
            );
        }

        offset += count;
    }

    uv.needsUpdate = true;
    return geometry;
}
