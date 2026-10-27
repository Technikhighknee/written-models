import * as THREE from "three";

export interface SurfaceHit {
    /** Contact point in world space. */
    point: THREE.Vector3;
    /** Target-surface normal in world space, facing the casting origin. */
    normal: THREE.Vector3;
    distance: number;
}

/**
 * Reusable geometric ray query, independent of display material sidedness.
 *
 * Casts against the actual triangles of the target mesh (including its
 * current world transform), not an assumed plane, sphere or bounding box.
 * One query instance can be reused for many points on the same surface.
 *
 * Designed for static BufferGeometry. Deformation/morph-target state must
 * be baked before querying.
 */
export class MeshSurfaceQuery {
    private readonly probe: THREE.Mesh;
    private readonly material: THREE.MeshBasicMaterial;
    private readonly raycaster = new THREE.Raycaster();
    private readonly normalMatrix = new THREE.Matrix3();

    constructor(private readonly target: THREE.Mesh) {
        this.material = new THREE.MeshBasicMaterial({side: THREE.DoubleSide});
        this.probe = new THREE.Mesh(target.geometry, this.material);
        this.probe.matrixAutoUpdate = false;
    }

    cast(
        origin: THREE.Vector3Like,
        direction: THREE.Vector3Like,
        maxDistance: number
    ): SurfaceHit | null {
        if (!Number.isFinite(maxDistance) || maxDistance <= 0 ||
            ![origin.x, origin.y, origin.z,
                direction.x, direction.y, direction.z].every(Number.isFinite)) {
            throw new RangeError("Invalid surface ray");
        }
        const heading = new THREE.Vector3(
            direction.x, direction.y, direction.z
        );
        if (heading.lengthSq() < 1e-16) {
            throw new RangeError("Surface ray direction is zero");
        }
        heading.normalize();
        this.target.updateWorldMatrix(true, false);
        this.probe.matrixWorld.copy(this.target.matrixWorld);
        this.normalMatrix.getNormalMatrix(this.target.matrixWorld);
        this.raycaster.set(
            new THREE.Vector3(origin.x, origin.y, origin.z), heading
        );
        this.raycaster.near = 0;
        this.raycaster.far = maxDistance;
        const hit = this.raycaster.intersectObject(this.probe, false)[0];
        if (!hit?.face) return null;

        const normal = hit.face.normal.clone()
            .applyMatrix3(this.normalMatrix).normalize();
        if (normal.dot(heading) > 0) normal.negate();
        return {
            point: hit.point.clone(),
            normal,
            distance: hit.distance
        };
    }

    dispose(): void {
        this.material.dispose();
    }
}
