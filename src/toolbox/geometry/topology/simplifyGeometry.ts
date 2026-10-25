import * as THREE from "three";

export interface SimplifyGeometryOptions {
    targetTriangles: number;
    maxLocalDeviation: number;
    minNormalDot?: number;
}

type Face = {
    vertices: [number, number, number];
    material: number;
    active: boolean;
};

type Edge = {
    a: number;
    b: number;
    faces: number[];
};

function faceNormal(
    face: Face,
    points: readonly THREE.Vector3[]
): THREE.Vector3 {
    const [a, b , c] = face.vertices;

    return new THREE.Vector3()
        .subVectors(points[b]!, points[a]!)
        .cross(
            new THREE.Vector3()
                .subVectors(points[c]!, points[a]!)
        );
}

function edgeKey(a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function simplifyGeometry(
    geometry: THREE.BufferGeometry,
    {
        targetTriangles,
        maxLocalDeviation,
        minNormalDot = 0.75
    }: SimplifyGeometryOptions
): THREE.BufferGeometry {
    if (
        !Number.isInteger(targetTriangles) ||
        targetTriangles < 1 ||
        !Number.isFinite(maxLocalDeviation) ||
        maxLocalDeviation < 0 ||
        !Number.isFinite(minNormalDot) ||
        minNormalDot < 0 ||
        minNormalDot > 1
    ) {
        throw new RangeError("Invalid simplification settings");
    }

    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();

    if (
        !(position instanceof THREE.BufferAttribute) ||
        position.itemSize !== 3 ||
        !index ||
        index.count % 3 !== 0
    ) {
        throw new Error(
            "Simplification requires indexed triangle geometry"
        );
    }

    if (
        geometry.getAttribute("tangent") ||
        geometry.getAttribute("skinIndex") ||
        geometry.getAttribute("skinWeight") ||
        Object.values(geometry.morphAttributes)
            .some(attributes => (attributes?.length ?? 0) > 0)
    ) {
        throw new Error(
            "Tangents, skinning and morph targets are not supported"
        );
    }

    for (const attribute of Object.values(geometry.attributes)) {
        if (
            !(attribute instanceof THREE.BufferAttribute) ||
            !(attribute.array instanceof Float32Array) ||
            attribute.normalized
        ) {
            throw new Error(
                "Only ordinary Float32 vertex attributes are supported"
            );
        }
    }

    const triangleCount = index.count / 3;

    if (triangleCount <= targetTriangles) {
        return geometry.clone();
    }

    const materials = Array<number>(triangleCount).fill(0);

    if (geometry.groups.length) {
        const covered = new Set<number>();

        for (const group of geometry.groups) {
            if (
                group.start % 3 !== 0 ||
                group.count % 3 !== 0 ||
                group.start < 0 ||
                group.start + group.count > index.count
            ) {
                throw new Error("Invalid material groups");
            }

            const end = (group.start + group.count) / 3;

            for (let i = group.start / 3; i < end; i++) {
                if (covered.has(i)) {
                    throw new Error("Overlapping material groups");
                }

                covered.add(i);
                materials[i] = group.materialIndex ?? 0;
            }
        }

        if (covered.size !== triangleCount) {
            throw new Error(
                "Material groups must cover all triangles"
            );
        }
    }

    const points = Array.from(
        { length: position.count },
        (_, i) => new THREE.Vector3()
            .fromBufferAttribute(position, i)
    );

    const faces: Face[] = Array.from(
        { length: triangleCount },
        (_, i) => ({
            vertices: [
                index.getX(3 * i),
                index.getX(3 * i + 1),
                index.getX(3 * i + 2)
            ],
            material: materials[i]!,
            active: true
        })
    );

    let remaining = triangleCount;

    while (remaining > targetTriangles) {
        const edges = new Map<string, Edge>();

        const neighbors = points.map(
            () => new Set<number>()
        );

        const incident = points.map(
            () => new Set<number>()
        );

        const vertexMaterials = points.map(
            () => new Set<number>()
        );

        faces.forEach((face, faceIndex) => {
            if (!face.active) return;

            const v = face.vertices;

            for (const vertex of v) {
                incident[vertex]!.add(faceIndex);
                vertexMaterials[vertex]!.add(face.material);
            }

            for (let j = 0; j < 3; j++) {
                const a = v[j]!;
                const b = v[(j + 1) % 3]!;

                neighbors[a]!.add(b);
                neighbors[b]!.add(a);

                const key = edgeKey(a, b);
                let edge = edges.get(key);

                if (!edge) {
                    edge = { a, b, faces: [] };
                    edges.set(key, edge);
                }

                edge.faces.push(faceIndex);
            }
        });

        const protectedVertices = new Set<number>();

        for (let i = 0; i < vertexMaterials.length; i++) {
            if (vertexMaterials[i]!.size > 1) {
                protectedVertices.add(i);
            }
        }

        for (const edge of edges.values()) {
            if (edge.faces.length > 2) {
                throw new Error("Non-manifold edge detected");
            }

            if (
                edge.faces.length === 1 ||
                (
                    edge.faces.length === 2 &&
                    faces[edge.faces[0]!]!.material !==
                    faces[edge.faces[1]!]!.material
                )
            ) {
                protectedVertices.add(edge.a);
                protectedVertices.add(edge.b);
            }
        }

        const candidates = [...edges.values()]
            .filter(edge =>
                edge.faces.length === 2 &&
                !(
                    protectedVertices.has(edge.a) &&
                    protectedVertices.has(edge.b)
                )
            )
            .sort((a, b) =>
                points[a.a]!.distanceToSquared(points[a.b]!) -
                points[b.a]!.distanceToSquared(points[b.b]!)
            );
        
        let collapsed = false;

        for (const edge of candidates) {
            const common = [...neighbors[edge.a]!]
                .filter(vertex => 
                    neighbors[edge.b]!.has(vertex)
                );
            
            const opposite = edge.faces.map(faceIndex =>
                faces[faceIndex]!.vertices.find(
                    v => v !== edge.a && v !== edge.b
                )
            );

            if (
                common.length !== 2 ||
                opposite.some(v =>
                    v === undefined || !common.includes(v)
                )
            ) {
                continue;
            }

            const choices: [number, number][] = protectedVertices.has(edge.a)
                ? [[edge.a, edge.b]]
                : protectedVertices.has(edge.b)
                    ? [[edge.b, edge.a]]
                    : [
                        [edge.a, edge.b],
                        [edge.b, edge.a]
                    ];
            
            for (const [keep, remove] of choices) {
                if (keep === undefined || remove === undefined) {
                    continue;
                }

                let error = 0;
                let valid = true;

                const touched = new Set([
                    ...incident[keep]!,
                    ...incident[remove]!
                ]);

                for (const faceIndex of touched) {
                    const face = faces[faceIndex]!;
                    const normal = faceNormal(face, points);
                    const normalLength = normal.length();

                    if (normalLength === 0) {
                        valid = false;
                        break;
                    }

                    normal.divideScalar(normalLength);

                    const pointToTest = face.vertices.includes(remove)
                        ? points[keep]!
                        : points[remove]!
                    
                    error = Math.max(
                        error,
                        Math.abs(
                            normal.dot(
                                new THREE.Vector3().subVectors(
                                    pointToTest,
                                    points[face.vertices[0]!]!
                                )
                            )
                        )
                    );

                    if (error > maxLocalDeviation) {
                        valid = false;
                        break;
                    }

                    if (
                        !face.vertices.includes(remove) ||
                        face.vertices.includes(keep)
                    ) {
                        continue;
                    }

                    const nextFace: Face = {
                        ...face,
                        vertices: face.vertices.map(
                            v => v === remove ? keep: v
                        ) as [number, number, number]
                    };

                    const nextNormal = faceNormal(nextFace, points);
                    const nextLength = nextNormal.length();

                    if (
                        nextLength < normalLength * 0.001 ||
                        normal.dot(nextNormal) / nextLength <
                            minNormalDot
                    ) {
                        valid = false;
                        break;
                    }
                }

                if (!valid) continue;

                for (const faceIndex of incident[remove]!) {
                    const face = faces[faceIndex]!;

                    if (face.vertices.includes(keep)) {
                        face.active = false;
                        remaining--;
                    } else {
                        face.vertices = face.vertices.map(
                            v => v === remove ? keep : v
                        ) as [number, number, number];
                    }
                }

                collapsed = true;
                break;
            }

            if (collapsed) break;
            
        }
        if (!collapsed) break;
        
    }
    const activeFaces = faces
        .filter(face => face.active)
        .sort((a, b) => a.material - b.material);
    
    const used = [
        ...new Set(activeFaces.flatMap(face => face.vertices))
    ].sort((a, b) => a - b);
    
    const remap = new Map(
        used.map((oldIndex, newIndex) => [oldIndex, newIndex])
    );

    const result = new THREE.BufferGeometry();
    result.name = geometry.name;

    for (const [name, attribute] of Object.entries(
        geometry.attributes
    )) {
        if (name === "normal") continue;

        if (!(attribute instanceof THREE.BufferAttribute)) {
            throw new Error("Unsupported attribute");
        }

        const values: number[] = [];

        for (const vertex of used) {
            for (
                let component = 0;
                component < attribute.itemSize;
                component++
            ) {
                values.push(
                    attribute.getComponent(vertex, component)
                );
            }
        }

        result.setAttribute(
            name,
            new THREE.Float32BufferAttribute(
                values,
                attribute.itemSize
            )
        );
    }

    const indices: number[] = [];
    let lastMaterial: number | null = null;
    let groupStart = 0;

    for (const face of activeFaces) {
        if (lastMaterial !== face.material) {
            if (lastMaterial !== null) {
                result.addGroup(
                    groupStart,
                    indices.length - groupStart,
                    lastMaterial
                );
            }

            groupStart = indices.length;
            lastMaterial = face.material;
        }

        indices.push(
            ...face.vertices.map(id => remap.get(id)!)
        );
    }

    if (lastMaterial !== null) {
        result.addGroup(
            groupStart,
            indices.length - groupStart,
            lastMaterial
        );
    }

    result.setIndex(indices);

    result.computeVertexNormals();
    result.computeBoundingBox();
    result.computeBoundingSphere();

    return result;
}
