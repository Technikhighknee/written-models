import * as THREE from "three";

// Confession: I don't know how to JSDoc object properties [yet].
export function revolveShell(profile, {
    thickness,
    radialSegments = 32
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

    const innerProfile = [...profile]
        .reverse()
        .map(p => new THREE.Vector2(
            p.x - thickness,
            p.y
        ));
    
    const section = [
        ...profile,
        ...innerProfile,
        profile[0].clone()
    ];

    return new THREE.LatheGeometry(section, radialSegments);
}
