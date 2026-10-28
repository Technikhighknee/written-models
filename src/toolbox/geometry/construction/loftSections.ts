import * as THREE from "three";
import { loftSideQuads } from "../build/loftSideQuads";
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

    const { vertices, quads } = loftSideQuads({
        rings: sections,
        uvMode: "edge",
        surface: side => `side-${side}`,
        smoothingGroup: side => `side-${side}`
    });

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
