import * as THREE from "three";
import {
    assertSelectionOwner,
    GeometryOperationError,
    type BoundaryRef,
    type GeometryResult,
    type SurfacePatchRef
} from "./GeometryResult";
import {
    lengthTolerance,
    resolvePrecision,
    type GeometryPrecision
} from "./precision";
import { topologyOf } from "./topology";

export function selectionEdgeKey(a: number, b: number): string {
    return Math.min(a, b) + ":" + Math.max(a, b);
}

/**
 * Carry an ordered authored edge chain into another result. Consumed edges
 * split a chain into its surviving runs; edges missing in the target are
 * omitted as well. An untouched closed loop stays closed.
 */
export function transferBoundary(
    source: GeometryResult,
    target: GeometryResult,
    chain: BoundaryRef,
    vertexId: (sourceId: number) => number,
    consumed: ReadonlySet<string> = new Set()
): BoundaryRef[] {
    assertSelectionOwner(source, chain);
    const ids = chain.vertices;
    if (
        typeof chain.closed !== "boolean" ||
        ids.length < (chain.closed ? 3 : 2) ||
        new Set(ids).size !== ids.length ||
        ids.some(id => !Number.isInteger(id) ||
            id < 0 || id >= source.geometry.vertices.length)
    ) {
        throw new GeometryOperationError(
            "transferBoundary", "invalid-input", "Invalid named edge chain"
        );
    }

    const count = chain.closed ? ids.length : ids.length - 1;
    const sourceTopology = topologyOf(source);
    const targetTopology = topologyOf(target);
    const used = Array.from({ length: count }, (_, i) => {
        const from = ids[i]!;
        const to = ids[(i + 1) % ids.length]!;
        const uses = sourceTopology.edgeUses(from, to);
        if (uses.length < 1 || uses.length > 2) {
            throw new GeometryOperationError(
                "transferBoundary", "invalid-topology",
                "Named chain contains a missing or nonmanifold edge"
            );
        }
        const a = vertexId(from);
        const b = vertexId(to);

        if (!Number.isInteger(a) || !Number.isInteger(b) ||
            a < 0 || b < 0 || a >= target.geometry.vertices.length ||
            b >= target.geometry.vertices.length || a === b) {
            throw new GeometryOperationError(
                "transferBoundary", "invalid-topology",
                "Edge remapping produces invalid target vertices"
            );
        }

        return consumed.has(selectionEdgeKey(from, to)) ||
            targetTopology.edgeUses(a, b).length === 0;
    });

    const output: BoundaryRef[] = [];
    const append = (run: number[], closed: boolean): void => {
        if (run.length < 2) return;
        const vertices = run.map(vertexId);
        if (new Set(vertices).size !== vertices.length) {
            throw new GeometryOperationError(
                "transferBoundary", "invalid-topology",
                "Transferred chain collapses or repeats a vertex"
            );
        }
        const edgeCount = closed ? vertices.length : vertices.length - 1;
        for (let i = 0; i < edgeCount; i++) {
            if (!targetTopology.edgeUses(
                vertices[i]!, vertices[(i + 1) % vertices.length]!
            ).length) {
                throw new GeometryOperationError(
                    "transferBoundary", "invalid-topology",
                    "Transferred chain no longer follows authored edges"
                );
            }
        }
        output.push({ owner: target.id, vertices, closed });
    };

    if (used.every(Boolean)) return [];
    if (used.every(value => !value)) {
        append([...ids], chain.closed);
        return output;
    }

    const start = chain.closed ? (used.indexOf(true) + 1) % count : 0;
    let run: number[] = [];

    for (let step = 0; step < count; step++) {
        const i = (start + step) % count;
        if (used[i]) {
            append(run, false);
            run = [];
        } else {
            if (!run.length) run.push(ids[i]!);
            run.push(ids[(i + 1) % ids.length]!);
        }
    }
    append(run, false);
    return output;
}

/**
 * A chart survives only if it still maps every selected authored vertex
 * to its actual position and its inverse round-trips those parameters.
 * This does not invent a chart for unparameterized geometry.
 */
export function patchChartMatches(
    result: GeometryResult,
    patch: SurfacePatchRef,
    precision?: GeometryPrecision
): boolean {
    assertSelectionOwner(result, patch);
    if (!patch.faces.length) return false;

    const policy = resolvePrecision(precision);
    const vertices = result.geometry.vertices;
    const selected = new Set<string>();
    const patchVertices = new Set<number>();

    for (const ref of patch.faces) {
        if (!Number.isInteger(ref.index) || ref.index < 0) return false;
        const key = `${ref.kind}:${ref.index}`;
        if (selected.has(key)) return false;

        const face = ref.kind === "quad"
            ? result.geometry.quads[ref.index]
            : ref.kind === "triangle"
                ? result.geometry.triangles?.[ref.index]
                : undefined;
        if (!face) return false;

        selected.add(key);
        face.corners.forEach(id => patchVertices.add(id));
    }

    const extent = new THREE.Box3().setFromPoints(
        [...patchVertices].map(id => vertices[id]!)
    ).getSize(new THREE.Vector3()).length();
    const tolerance = lengthTolerance(policy, extent);
    const tested = new Map<number, THREE.Vector2>();

    const chartAt = (uv: THREE.Vector2): THREE.Vector3 | undefined => {
        const mapped = patch.chart.at(uv);
        const inverted = mapped && patch.chart.parameterOf(mapped);
        const normal = patch.chart.normalAt(uv);

        if (
            !mapped || ![mapped.x, mapped.y, mapped.z].every(Number.isFinite) ||
            !inverted || ![inverted.x, inverted.y].every(Number.isFinite) ||
            !normal || ![normal.x, normal.y, normal.z].every(Number.isFinite) ||
            new THREE.Vector3(normal.x, normal.y, normal.z).length() <= policy.absoluteLength ||
            new THREE.Vector2(inverted.x, inverted.y).distanceTo(uv) > tolerance
        ) return undefined;

        return new THREE.Vector3(mapped.x, mapped.y, mapped.z);
    };

    try {
        // A SurfacePatchRef describes one connected authored surface.
        const topology = topologyOf(result);
        const visited = new Set<string>();
        const queue = [patch.faces[0]!];

        while (queue.length) {
            const face = queue.pop()!;
            const key = `${face.kind}:${face.index}`;
            if (visited.has(key)) continue;
            visited.add(key);

            for (const neighbor of topology.faceNeighbors(face)) {
                if (selected.has(`${neighbor.kind}:${neighbor.index}`)) {
                    queue.push(neighbor);
                }
            }
        }

        if (visited.size !== selected.size) return false;

        for (const ref of patch.faces) {
            const face = ref.kind === "quad"
                ? result.geometry.quads[ref.index]
                : result.geometry.triangles?.[ref.index];
            if (!face) return false;

            const parameters: THREE.Vector2[] = [];
            for (const id of face.corners) {
                let uv = tested.get(id);

                if (!uv) {
                    const point = vertices[id]!;
                    const inverse = patch.chart.parameterOf(point);
                    if (!inverse || ![inverse.x, inverse.y].every(Number.isFinite)) {
                        return false;
                    }

                    uv = new THREE.Vector2(inverse.x, inverse.y);
                    const mapped = chartAt(uv);
                    if (!mapped || mapped.distanceTo(point) > tolerance) {
                        return false;
                    }
                    tested.set(id, uv);
                }
                parameters.push(uv);
            }

            // Check a chart-domain interior sample, not just its vertices.
            const center = parameters.reduce(
                (sum, uv) => sum.add(uv), new THREE.Vector2()
            ).multiplyScalar(1 / parameters.length);
            if (!chartAt(center)) return false;

            // Face orientation and chart normals must agree. Comparing only
            // inverse round-trips would accept a reversed surface chart.
            const corners = face.corners.map(id => vertices[id]!);
            const normal = new THREE.Vector3()
                .subVectors(corners[1]!, corners[0]!)
                .cross(new THREE.Vector3().subVectors(corners[2]!, corners[0]!));
            const chartNormal = patch.chart.normalAt(center);
            if (normal.dot(new THREE.Vector3(
                chartNormal.x, chartNormal.y, chartNormal.z
            )) <= 0) return false;
        }
    } catch {
        return false;
    }

    return true;
}
