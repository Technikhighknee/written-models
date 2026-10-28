import * as THREE from "three";
import {boardPanel} from "../../toolbox/geometry/construction/boardPanel";
import {createTimberBetween, createTimberBetweenContacts} from "../../toolbox/geometry/construction/timber";
import type {TimberContactNormals} from "../../toolbox/geometry/construction/timber";
import {cylinderMesh} from "../../toolbox/geometry/construction/cylinderMesh";
import {toBufferGeometry} from "../../toolbox/geometry/mesh/toBufferGeometry";
import {tintVertices} from "../../toolbox/geometry/materials/tintVertices";
import {offsetMeshUvs} from "../../toolbox/geometry/uv/offsetMeshUvs";
import {oakBoardFace, oakVariant} from "../../materials/wood/oak";
import {cm, mm} from "../../toolbox/units/length";
import type {MeshData} from "../../toolbox/geometry/mesh/MeshData";

export interface OakPanel {
    name: string;
    length: number;
    depth: number;
    thickness: number;
    planks: number;
    seed: number;
    widthWeights?: readonly number[];
    gap?: number;
    wear?: number;
    crown?: number;
}

const boardSurfaces = {
    outer: 0, inner: 0, "edge-left": 0, "edge-right": 0,
    "cap-start": 1, "cap-end": 1
};

/** An authored board with the same wood cuts, UV scale and end grain as a panel. */
export function oakPlank(
    name: string,
    data: MeshData,
    seed: number,
    tone = 0.97,
    uvOffset: {u: number; v: number} = {u: cm(2), v: cm(8)}
): THREE.Mesh {
    const oak = oakVariant(seed);
    offsetMeshUvs(data, uvOffset.u, uvOffset.v);
    const geometry = tintVertices(
        toBufferGeometry(data, boardSurfaces),
        new THREE.Color(tone, tone, tone)
    );
    const mesh = new THREE.Mesh(geometry, [
        oakBoardFace(seed), oak.tinted.endGrain
    ]);
    mesh.name = name;
    return mesh;
}

/** Planks are independent pieces of oak with stable shared seam profiles. */
export function oakPlankPanel(spec: OakPanel): THREE.Group {
    const {
        name, length, depth, thickness, planks, seed,
        widthWeights, gap = mm(2), wear = 1, crown = mm(0.45)
    } = spec;

    const panel = new THREE.Group();
    panel.name = name;
    const boards = boardPanel({
        length, width: depth, thickness, count: planks,
        ...(widthWeights ? {widthWeights} : {}),
        gap,
        chamfer: mm(2.4),
        crown,
        handWorked: {
            seed,
            edgeWander: mm(2.2) * wear,
            endStagger: mm(4.8) * wear,
            cornerWear: mm(3.5) * wear,
            thicknessVariation: mm(0.9) * wear,
            chamferVariation: 0.27
        }
    });

    boards.forEach((data: MeshData, i) => {
        const cut = (seed + i * 3 + 2) % 8;
        const tone = 0.96 + 0.012 * ((seed + i * 5) % 5);
        panel.add(oakPlank(
            `${name}Plank${i + 1}`,
            data,
            cut,
            tone,
            {u: cm(i * 2 + 1), v: cm(i * 7 + 2)}
        ));
    });

    return panel;
}

export interface OakTimberShop {
    timber(
        name: string,
        start: THREE.Vector3,
        end: THREE.Vector3,
        width: number,
        depth: number,
        contacts?: TimberContactNormals
    ): THREE.Mesh;
    peg(
        name: string,
        center: THREE.Vector3,
        outward: THREE.Vector3,
        radius?: number
    ): THREE.Mesh;
}

/**
 * A related set of planed oak timbers and small wooden pins. Both seats can
 * use the same joins, grain conventions and seeded material cuts as the table.
 */
export function oakTimberShop(seed: number): OakTimberShop {
    let index = 0;
    const pegOak = oakVariant(6);

    return {
        timber(name, start, end, width, depth, contacts) {
            const id = index++;
            const cut = (seed + id * 3) % 8;
            const oak = oakVariant(cut);
            const uvOffset = {
                u: cm(1 + (id * 4) % 13),
                v: cm(3 + (id * 19) % 40)
            };
            const faces = {
                face: oakBoardFace(cut),
                endGrain: oak.tinted.endGrain
            };
            const mesh = contacts
                ? createTimberBetweenContacts(
                    start, end, width, depth, faces, contacts, uvOffset
                )
                : createTimberBetween(
                    start, end, width, depth, faces, uvOffset
                );
            const tone = 0.958 + 0.012 * (id % 4);
            tintVertices(mesh.geometry, new THREE.Color(tone, tone, tone));
            mesh.name = name;
            return mesh;
        },
        peg(name, center, outward, radius = mm(6)) {
            const geometry = toBufferGeometry(
                cylinderMesh({
                    radiusTop: radius * 0.91,
                    radiusBottom: radius,
                    height: mm(4),
                    radialSegments: 10
                }),
                {side: 0, top: 1, bottom: 1}
            );
            const peg = new THREE.Mesh(geometry, [
                pegOak.face, pegOak.endGrain
            ]);
            const axis = new THREE.Vector3().copy(outward).normalize();
            peg.position.copy(center).addScaledVector(axis, mm(1.4));
            peg.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0), axis
            );
            peg.name = name;
            return peg;
        }
    };
}
