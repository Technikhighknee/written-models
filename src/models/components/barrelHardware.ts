import * as THREE from "three";

import { mm } from "../../toolbox/units/length";
import { bandAroundProfileData } from "../../toolbox/geometry/construction/bandAroundProfile";
import { cylinderMesh } from "../../toolbox/geometry/construction/cylinderMesh";
import {
    geometryResult, type GeometryResult
} from "../../toolbox/geometry/kernel/GeometryResult";

export interface BarrelRivet {
    name: "JointRivetA" | "JointRivetB";
    geometry: GeometryResult;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
}

export interface BarrelHoopGeometry {
    band: GeometryResult;
    lap: GeometryResult;
    rivets: readonly BarrelRivet[];
}

/**
 * Model-owned geometry for a cooper's forged iron hoop, overlap and
 * two radial rivets. The angular sweep and head positions are authored
 * here; sampling, sweep geometry and cylindrical fasteners stay shared.
 */
export function buildBarrelHoopGeometry(
    profile: readonly THREE.Vector2[],
    y: number,
    width: number,
    staveCount: number,
    hoopIndex: number
): BarrelHoopGeometry {
    const radialSegments = staveCount * 2;
    const thickness = mm(3.8);
    const clearance = mm(1.0);

    const band = geometryResult(bandAroundProfileData(profile, {
        y,
        width,
        thickness,
        clearance,
        bevel: mm(0.75),
        radialSegments,
        angleOffset: 0
    }));

    const lapThickness = mm(1.2);
    const lapClearance = mm(0.22);
    const sweep = 0.26;
    const lapSegments = 8;
    const centerAngle = 0.57 + hoopIndex * 0.14;
    const arc = {
        startAngle: centerAngle - sweep / 2,
        sweepAngle: sweep
    };

    const lapProfile = profile.map(point => new THREE.Vector2(
        point.x / Math.cos(Math.PI / radialSegments) +
            clearance + thickness + mm(0.35),
        point.y
    ));

    const lap = geometryResult(bandAroundProfileData(lapProfile, {
        y,
        width: width - mm(4),
        thickness: lapThickness,
        clearance: lapClearance,
        bevel: mm(0.3),
        radialSegments: lapSegments,
        arc
    }));

    function radiusAt(height: number): number {
        for (let i = 1; i < lapProfile.length; i++) {
            const a = lapProfile[i - 1]!;
            const b = lapProfile[i]!;
            if (height <= b.y) {
                const fraction = (height - a.y) / (b.y - a.y);
                return a.x + (b.x - a.x) * fraction;
            }
        }
        throw new RangeError("Rivet outside hoop profile");
    }

    const lapOuterRadius = radiusAt(y) /
        Math.cos(sweep / (lapSegments * 2)) + lapClearance + lapThickness;
    const rivetHeight = mm(1.6);
    const rivet = geometryResult(cylinderMesh({
        radiusTop: mm(3.1),
        radiusBottom: mm(3.7),
        height: rivetHeight,
        radialSegments: 10
    }));

    const rivets: BarrelRivet[] = [-1, 1].map((direction, index) => {
        const theta = centerAngle + direction * sweep * 0.29;
        const normal = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
        const position = normal.clone().multiplyScalar(
            lapOuterRadius + rivetHeight * 0.32
        );
        position.y = y;

        return {
            name: index === 0 ? "JointRivetA" : "JointRivetB",
            geometry: rivet,
            position,
            quaternion: new THREE.Quaternion().setFromUnitVectors(
                new THREE.Vector3(0, 1, 0),
                normal
            )
        };
    });

    return { band, lap, rivets };
}
