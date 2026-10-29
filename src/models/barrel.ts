import * as THREE from "three";

import { mm, cm } from "../toolbox/units/length";
import { positionsFromEnds } from "../toolbox/spatial/layout/positionsFromEnds";
import { cylinderMesh } from "../toolbox/geometry/construction/cylinderMesh";
import { bulgedProfile } from "../toolbox/shapes/profiles/bulged";
import { cooperedBody } from "./components/barrelBody";
import { surfaceMesh } from "../toolbox/geometry/mesh/surfaceMesh";
import { offsetMeshUvs as offsetAuthoredUvs } from "../toolbox/geometry/edit/geometryEdits";
import { bandAroundProfileData } from "../toolbox/geometry/construction/bandAroundProfile";
import { groovedCircularPlankPanel } from "../toolbox/geometry/construction/circularPlankPanel";
import { toBufferGeometry } from "../toolbox/geometry/mesh/toBufferGeometry";
import { offsetMeshUvs } from "../toolbox/geometry/uv/offsetMeshUvs";
import { tintVertices } from "../toolbox/geometry/materials/tintVertices";
import { coherentVariation } from "../toolbox/spatial/layout/coherentVariation";
import { oakVariant, oakBoardFace, oakGrooveFace } from "../materials/wood/oak";
import { wroughtIron } from "../materials/metal/wroughtIron";

type BarrelHeadSide = "top" | "bottom";

export default {
    create,
    slug: "barrel",
    title: "Wooden Barrel",
    description: "A barrel of possibilities.",
};

function create(): THREE.Group {
    const barrel = new THREE.Group();
    barrel.name = "Barrel";

    // Upright coopered ale cask (~160 L inside), modeled in meters.
    const profile = bulgedProfile({
        height: cm(78),
        bottomDiameter: cm(52),
        topDiameter: cm(52),
        peakDiameter: cm(60),
        points: 9,
        curve: "quadratic"
    });

    const staveCount = 24;
    const staveThickness = cm(2.4);
    barrel.add(createBody(profile, staveCount, staveThickness));
    barrel.add(createHead(profile, "top", staveThickness));
    barrel.add(createHead(profile, "bottom", staveThickness));

    // End (chime) hoops and the lighter quarter hoops sit on different
    // radii of the barrel. Both are driven tightly over the staves.
    const hoopPositions = positionsFromEnds({
        start: profile[0]!.y,
        end: profile.at(-1)!.y,
        fromStart: [cm(8), cm(23)],
        fromEnd: [cm(8), cm(23)]
    });

    const iron = wroughtIron();
    const joiningIron = iron.clone();
    joiningIron.name = "Wrought Iron · Forged Lap";
    joiningIron.color.set("#706c64");

    for (let i = 0; i < hoopPositions.length; i++) {
        const isChime = i === 0 || i === hoopPositions.length - 1;
        const width = isChime ? cm(2.8) : cm(2.2);
        barrel.add(createHoop(
            profile, hoopPositions[i]!, width, staveCount, i,
            iron, joiningIron
        ));
    }

    return barrel;
}

function createBody(
    profile: readonly THREE.Vector2[],
    staveCount: number,
    staveThickness: number
): THREE.Group {
    const body = new THREE.Group();
    body.name = "Body";

    const staves = cooperedBody(profile, {
        count: staveCount,
        thickness: staveThickness,
        edgeRoundover: mm(2.2)
    });

    // Neighboring staves belong to broad tonal regions, not a random
    // checkerboard of unrelated oak finishes. Gentle vertex tints keep
    // the PBR maps and materials shared and survive GLB export.
    const variations = coherentVariation({
        count: staves.length,
        seed: 23,
        radius: 4,
        cyclic: true
    });

    for (let i = 0; i < staves.length; i++) {
        const seed = (i * 5 + 3) % 8;
        const wood = oakVariant(seed);
        // Each stave samples a different part of the shared oak family.
        // The quieter planed grain avoids barcode-like stripes.
        const section = offsetAuthoredUvs(
            staves[i]!,
            0.018 + (i * 0.027) % 0.31,
            0.12 + ((i * 17) % 24) * 0.075
        );
        const tone = 0.965 + 0.025 * variations[i]!;
        const longGrain = oakBoardFace(seed);
        body.add(surfaceMesh({
            name: `Stave${String(i + 1).padStart(2, "0")}`,
            geometry: section,
            materials: {
                outer: longGrain,
                inner: longGrain,
                "edge-left": longGrain,
                "edge-right": longGrain,
                "cap-start": wood.tinted.endGrain,
                "cap-end": wood.tinted.endGrain
            },
            tint: new THREE.Color(tone, tone, tone)
        }));
    }

    return body;
}

function createHead(
    profile: readonly THREE.Vector2[],
    side: BarrelHeadSide,
    staveThickness: number
): THREE.Group {
    const isTop = side === "top";
    const rim = isTop ? profile.at(-1) : profile[0];

    if (!rim) {
        throw new RangeError("Barrel profile is empty");
    }

    const head = new THREE.Group();
    head.name = isTop ? "TopHead" : "BottomHead";

    const thickness = cm(2);
    const inset = cm(2.1);

    // A little of the rim sits inside the staves, as a real head does
    // in its croze. The visible face is recessed below the stave ends.
    const radius = rim.x - staveThickness + mm(7);
    const direction = isTop ? -1 : 1;
    head.position.y = rim.y + direction * (inset + thickness / 2);

    const boards = groovedCircularPlankPanel(radius, {
        planks: 5,
        thickness,
        // Only the outward-facing head gets the fitted grain and relief.
        // The inward-facing solid surface remains closed but deliberately
        // sparse. Top head faces +Y; bottom head faces -Y.
        detailedFace: isTop ? "top" : "bottom",
        // The stave-built rim has 24 facets; 36 segments retain a
        // smooth enough wooden head without excessive cut-line loops.
        radialSegments: 36,
        // These boards were fitted and trimmed as one circular head,
        // but their widths don't look machine-divided into fifths.
        widthWeights: [0.94, 1.08, 1.03, 0.92, 1.03],
        // Sloped wooden shoulders, a narrow shadowed groove floor,
        // and a continuous solid contact below it on BOTH faces.
        shoulderWidth: mm(4.2),
        recessDepth: mm(2.4),
        grooveFloorWidth: mm(0.95),
        // Fitted joinery, not five identical machine-cut strips.
        // Adjacent edges wander TOGETHER; shallow wear never opens the head.
        handFitted: {
            seed: isTop ? 181 : 293,
            edgeWander: mm(1.9),
            crown: mm(1.1),
            edgeWear: mm(0.65),
            // Follow surface curvature instead of creating nine loops
            // through every perfectly good flat piece of oak.
            maxDeviation: mm(0.7)
        }
    });

    // Heads are linear rows of timber, not random swatch arrangements.
    const variations = coherentVariation({
        count: boards.length,
        seed: isTop ? 31 : 47,
        radius: 2
    });

    for (let i = 0; i < boards.length; i++) {
        const seed = (i * 3 + (isTop ? 1 : 5)) % 8;
        const wood = oakVariant(seed);
        // Subtle board-to-board color shifts, not a single flat disk.
        const tone = 0.92 + 0.085 * variations[i]!;
        const geometry = tintVertices(
            boards[i]!,
            new THREE.Color(tone, tone, tone)
        );
        const board = new THREE.Mesh(geometry, [
            // Planed broad oak: its quieter flowed grain also avoids
            // the long straight stripes of the raw stave texture.
            oakBoardFace(seed),
            wood.tinted.endGrain,
            oakGrooveFace(seed)
        ]);
        board.name = `HeadBoard${i + 1}`;
        head.add(board);
    }

    return head;
}

function createHoop(
    profile: readonly THREE.Vector2[],
    y: number,
    width: number,
    staveCount: number,
    hoopIndex: number,
    iron: THREE.Material,
    joiningIron: THREE.Material
): THREE.Group {
    const hoop = new THREE.Group();
    hoop.name = `IronHoop${hoopIndex + 1}`;

    const radialSegments = staveCount * 2;
    const thickness = mm(3.8);
    const clearance = mm(1.0);

    // Between polygon vertices, a flat chord is INSIDE the circle through
    // those vertices. bandAroundProfile compensates for that sagitta before
    // adding the clearance. The complete metal surface stays outside the
    // actual staves, even between sampled angles and in a GLB export.
    const band = surfaceMesh({
        name: "ClosedForgedBand",
        geometry: bandAroundProfileData(profile, {
            y, width, thickness, clearance,
            bevel: mm(0.75),
            radialSegments,
            angleOffset: 0
        }),
        materials: iron
    });
    band.name = "ClosedForgedBand";
    hoop.add(band);

    // A short raised strip represents the overlapped ends of the forged
    // hoop. It is truly curved, has solid end faces and sits outside the
    // supporting band: no coincident surfaces or renderer-only depth tricks.
    const lapThickness = mm(1.2);
    const lapClearance = mm(0.22);
    const sweep = 0.26;
    const lapSegments = 8;
    const centerAngle = 0.57 + hoopIndex * 0.14;
    const arc = {
        startAngle: centerAngle - sweep / 2,
        sweepAngle: sweep
    };

    // The lap follows the primary band's outer radius and its
    // height-dependent bulge.
    const lapProfile = profile.map(point => new THREE.Vector2(
        point.x / Math.cos(Math.PI / radialSegments) +
            clearance + thickness + mm(0.35),
        point.y
    ));

    const lap = surfaceMesh({
        name: "OverlappingStrapJoint",
        geometry: bandAroundProfileData(lapProfile, {
            y,
            width: width - mm(4),
            thickness: lapThickness,
            clearance: lapClearance,
            bevel: mm(0.3),
            radialSegments: lapSegments,
            arc
        }),
        materials: joiningIron
    });
    lap.name = "OverlappingStrapJoint";
    hoop.add(lap);

    // Small, slightly proud hammered rivet heads. Their cylinder axes point
    // radially outward; the back is buried in the lap, never coplanar with it.
    function radiusAt(height: number): number {
        for (let i = 1; i < lapProfile.length; i++) {
            const a = lapProfile[i - 1]!;
            const b = lapProfile[i]!;
            if (height <= b.y) {
                const t = (height - a.y) / (b.y - a.y);
                return a.x + (b.x - a.x) * t;
            }
        }
        throw new RangeError("Rivet outside hoop profile");
    }

    const lapOuterRadius = radiusAt(y) /
        Math.cos(sweep / (lapSegments * 2)) + lapClearance + lapThickness;
    const rivetHeight = mm(1.6);
    const rivetGeometry = cylinderMesh({
        radiusTop: mm(3.1),
        radiusBottom: mm(3.7),
        height: rivetHeight,
        radialSegments: 10
    });

    for (const [index, direction] of [-1, 1].entries()) {
        const theta = centerAngle + direction * sweep * 0.29;
        const normal = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
        const rivet = surfaceMesh({
            name: index === 0 ? "JointRivetA" : "JointRivetB",
            geometry: rivetGeometry,
            materials: joiningIron
        });
        rivet.position.copy(normal).multiplyScalar(
            lapOuterRadius + rivetHeight * 0.32
        );
        rivet.position.y = y;
        rivet.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            normal
        );
        hoop.add(rivet);
    }

    return hoop;
}
