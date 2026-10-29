import * as THREE from "three";

import { boardedSurface } from "./boardedSurface";
import {
    tableTimberGeometry,
    tableTimberBetweenSurfaces,
    type TableTimberGeometry
} from "./tableTimberGeometry";
import type { SurfaceAttachment } from "../../toolbox/geometry/queries/fitBetweenSurfaces";
import type { TimberContactNormals } from "../../toolbox/geometry/construction/timber";
import { cylinderMesh } from "../../toolbox/geometry/construction/cylinderMesh";
import { geometryResult, type GeometryResult } from "../../toolbox/geometry/kernel/GeometryResult";
import { surfaceMesh } from "../../toolbox/geometry/mesh/surfaceMesh";
import { offsetMeshUvs } from "../../toolbox/geometry/edit/geometryEdits";
import { oakBoardFace, oakVariant } from "../../materials/wood/oak";
import { cm, mm } from "../../toolbox/units/length";
import type { MeshData } from "../../toolbox/geometry/mesh/MeshData";

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

/** Independent authored oak boards with one shared set of seam stations. */
export function oakPanelGeometry(spec: OakPanel): GeometryResult[] {
    const {
        length, depth, thickness, planks, seed,
        widthWeights, gap = mm(2), wear = 1, crown = mm(0.45)
    } = spec;

    return boardedSurface({
        length,
        width: depth,
        thickness,
        weights: widthWeights ?? Array.from({length: planks}, () => 1),
        gap,
        chamfer: mm(2.4),
        crown,
        seed,
        edgeWander: mm(2.2) * wear,
        endStagger: mm(4.8) * wear,
        cornerWear: mm(3.5) * wear,
        thicknessVariation: mm(0.9) * wear,
        chamferVariation: 0.27
    });
}

/** Give any authored board real oak surfaces and separate end grain. */
export function oakPlank(
    name: string,
    data: MeshData | GeometryResult,
    seed: number,
    tone = 0.97,
    uvOffset: {u: number; v: number} = {u: cm(2), v: cm(8)}
): THREE.Mesh {
    const oak = oakVariant(seed);
    const grain = oakBoardFace(seed);
    return surfaceMesh({
        name,
        geometry: offsetMeshUvs(data, uvOffset.u, uvOffset.v),
        materials: {
            outer: grain,
            inner: grain,
            "edge-left": grain,
            "edge-right": grain,
            "cap-start": oak.tinted.endGrain,
            "cap-end": oak.tinted.endGrain
        },
        tint: new THREE.Color(tone, tone, tone)
    });
}

/** Each board remains an independent solid with its own oak cut. */
export function oakPlankPanel(spec: OakPanel): THREE.Group {
    const panel = new THREE.Group();
    panel.name = spec.name;

    oakPanelGeometry(spec).forEach((data, i) => {
        const cut = (spec.seed + i * 3 + 2) % 8;
        const tone = 0.96 + 0.012 * ((spec.seed + i * 5) % 5);

        panel.add(oakPlank(
            `${spec.name}Plank${i + 1}`,
            data, cut, tone,
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
    fittedTimber(
        name: string,
        start: SurfaceAttachment,
        end: SurfaceAttachment,
        width: number,
        depth: number,
        referenceDirection: THREE.Vector3Like
    ): THREE.Mesh;
    peg(
        name: string,
        center: THREE.Vector3,
        outward: THREE.Vector3,
        radius?: number
    ): THREE.Mesh;
}

/**
 * A shared oak material and construction recipe for benches and chairs.
 * Timber contact geometry is authored independently of any render mesh.
 */
export function oakTimberShop(seed: number): OakTimberShop {
    let index = 0;
    const pegOak = oakVariant(6);

    const timberMesh = (
        name: string, member: TableTimberGeometry
    ): THREE.Mesh => {
        const id = index++;
        const cut = (seed + id * 3) % 8;
        const oak = oakVariant(cut);
        const grain = oakBoardFace(cut);
        const uvOffset = {
            u: cm(1 + (id * 4) % 13),
            v: cm(3 + (id * 19) % 40)
        };
        const tone = 0.958 + 0.012 * (id % 4);
        const mesh = surfaceMesh({
            name,
            geometry: offsetMeshUvs(
                member.geometry, uvOffset.u, uvOffset.v
            ),
            materials: member.fitted
                ? {
                    "side-0": grain,
                    "side-1": grain,
                    "side-2": grain,
                    "side-3": grain,
                    "cap-start": oak.tinted.endGrain,
                    "cap-end": oak.tinted.endGrain
                }
                : {
                    px: grain,
                    nx: grain,
                    py: oak.tinted.endGrain,
                    ny: oak.tinted.endGrain,
                    pz: grain,
                    nz: grain
                },
            tint: new THREE.Color(tone, tone, tone)
        });
        mesh.applyMatrix4(member.localToParent);
        return mesh;
    };

    return {
        timber(name, start, end, width, depth, contacts) {
            return timberMesh(name, tableTimberGeometry(
                start, end, width, depth, contacts
            ));
        },
        fittedTimber(name, start, end, width, depth, referenceDirection) {
            return timberMesh(name, tableTimberBetweenSurfaces({
                first: start,
                last: end,
                width,
                depth,
                referenceDirection
            }));
        },
        peg(name, center, outward, radius = mm(6)) {
            const peg = surfaceMesh({
                name,
                geometry: geometryResult(cylinderMesh({
                    radiusTop: radius * 0.91,
                    radiusBottom: radius,
                    height: mm(4),
                    radialSegments: 10
                })),
                materials: {
                    side: pegOak.face,
                    top: pegOak.endGrain,
                    bottom: pegOak.endGrain
                }
            });
            const axis = outward.clone().normalize();
            peg.position.copy(center).addScaledVector(axis, mm(1.4));
            peg.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0), axis
            );
            return peg;
        }
    };
}
