import * as THREE from "three";

// Confession: I don't know how to JSDoc object properties [yet].
export function revolveShell(profile, {
    thickness,
    radialSegments = 32,
    roundedRims = false,
    rimSegments = 8
}) {
    if (
        !Number.isFinite(thickness) ||
        thickness <= 0 ||
        profile.length < 2 ||
        profile.some((p, i) => 
            p.x <= thickness ||
            (i > 0 && p.y <= profile[i - 1].y)
        )
    ) {
        throw new RangeError("Invalid shell profile");
    }

    if (!Number.isInteger(rimSegments) || rimSegments < 2) {
        throw new RangeError("Invalid rim segments");
    }

    const innerProfile = [...profile]
        .reverse()
        .map(p => new THREE.Vector2(
            p.x - thickness,
            p.y
        ));
    
    let section;

    if (roundedRims) {
        const topRim = createRoundedRim(
            profile.at(-1), thickness, true, rimSegments
        );

        const bottomRim = createRoundedRim(
            profile[0], thickness, false, rimSegments
        );

        section = [
            ...profile,
            ...topRim,
            ...innerProfile.slice(1),
            ...bottomRim
        ];
    } else {
        section = [
            ...profile,
            ...innerProfile,
            profile[0].clone()
        ];
    }
    
    return new THREE.LatheGeometry(section, radialSegments);
}

function createRoundedRim(point, thickness, top, segments) {
    const radius = thickness / 2;
    const centerX = point.x - radius;
    const startAngle = top ? 0 : Math.PI;

    const points = [];

    for (let i = 1; i <= segments; i++) {
        const angle = startAngle + (i / segments) * Math.PI;

        points.push(new THREE.Vector2(
            centerX + Math.cos(angle) * radius,
            point.y + Math.sin(angle) * radius
        ));
    }

    return points;
}