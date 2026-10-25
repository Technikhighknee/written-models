import * as THREE from "three";
import type { MeshData, QuadFace } from "../mesh/MeshData";

export function loftSections(
    sections: readonly (readonly THREE.Vector3Like[])[]
): MeshData {
    if (
        sections.length < 2 ||
        sections.some(section => section.length !== 4)
    ) {
        throw new Error(
            "Loft requires at least two sections with four points each"
        );
    }

    const vertices = sections.flatMap(section => 
        section.map(point => {
            if (
                !Number.isFinite(point.x) ||
                !Number.isFinite(point.y) ||
                !Number.isFinite(point.z)
            ) {
                throw new RangeError("Invalid section point");
            }

            return new THREE.Vector3(
                point.x,
                point.y,
                point.z
            );
        })
    );

    const quads: QuadFace[] = [];

    const centers = sections.map(section => {
        const center = new THREE.Vector3();

        for (const point of section) {
            center.add(point);
        }

        return center.multiplyScalar(1 / 4); 
    });

    const distances = [0];

    for (let i = 1; i < centers.length; i++) {
        const step = centers[i]!.distanceTo(
            centers[i - 1]!
        );

        if (step <= 0) {
            throw new RangeError(
                "Consecutive section centers must differ"
            );
        }

        distances.push(distances[i - 1]! + step);
    }

    for (let i = 0; i < sections.length - 1; i++) {
        for (let side = 0; side < 4; side++) {
            const next = (side + 1) % 4;

            const a = i * 4 + side;
            const b = i * 4 + next;
            const c = (i + 1) * 4 + next;
            const d = (i + 1) * 4 + side;

            const widthStart = vertices[a]!.distanceTo(
                vertices[b]!
            );

            const widthEnd = vertices[d]!.distanceTo(
                vertices[c]!
            );

            quads.push({
                corners: [a, b, c, d],
                surface: `side-${side}`,
                smoothingGroup: `side-${side}`,
                uvs: [
                    new THREE.Vector2(0, distances[i]!),
                    new THREE.Vector2(widthStart, distances[i]!),
                    new THREE.Vector2(widthEnd, distances[i + 1]!),
                    new THREE.Vector2(0, distances[i + 1]!)
                ]
            });
        }
    }

    function addCap(
        sectionIndex: number,
        surface: string,
        reverse: boolean
    ): void {
        const offset = sectionIndex * 4;

        const corners: [number, number, number, number] =
            reverse
                ? [offset + 3, offset + 2, offset + 1, offset]
                : [offset, offset + 1, offset + 2, offset + 3];
            
        const origin = vertices[offset]!;

        const uAxis = new THREE.Vector3()
            .subVectors(vertices[offset + 1]!, origin)
            .normalize();
        
        const edge = new THREE.Vector3()
            .subVectors(vertices[offset + 3]!, origin);
        
        const normal = new THREE.Vector3()
            .crossVectors(uAxis, edge);
        
        if (normal.lengthSq() < 1e-12) {
            throw new Error("Degenerate loft cap");
        }

        normal.normalize();

        const vAxis = new THREE.Vector3()
            .crossVectors(normal, uAxis)
            .normalize();
        
        const uvs = corners.map(index => {
            const relative = vertices[index]!.clone()
                .sub(origin);
            
            return new THREE.Vector2(
                relative.dot(uAxis),
                relative.dot(vAxis)
            )
        }) as QuadFace["uvs"];

        quads.push({
            corners,
            surface,
            uvs
        });
    }  
    
    addCap(0, "cap-start", true);
    addCap(sections.length - 1, "cap-end", false);

    return { vertices, quads };
}
