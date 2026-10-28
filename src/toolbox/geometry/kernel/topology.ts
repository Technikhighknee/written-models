import type { MeshData } from "../mesh/MeshData";
import {
    GeometryOperationError,
    type BoundaryRef,
    type FaceRef,
    type GeometryResult
} from "./GeometryResult";

export interface EdgeUse {
    readonly face: FaceRef;
    readonly from: number;
    readonly to: number;
}

export interface TopologyIndex {
    readonly owner: symbol;
    edgeUses(from: number, to: number): readonly EdgeUse[];
    faceNeighbors(face: FaceRef): readonly FaceRef[];
    openBoundaries(): readonly BoundaryRef[];
    regionBoundaries(region: string): readonly BoundaryRef[];
    connectedComponents(): readonly (readonly FaceRef[])[];
}

type Use = EdgeUse & { readonly surface: string };

function faceKey(face: FaceRef): string {
    return face.kind + ":" + face.index;
}

function edgeKey(from: number, to: number): string {
    return Math.min(from, to) + ":" + Math.max(from, to);
}

function error(message: string): never {
    throw new GeometryOperationError("topologyOf", "invalid-topology", message);
}

class IndexedTopology implements TopologyIndex {
    readonly owner: symbol;
    private readonly edges = new Map<string, Use[]>();
    private readonly faces: FaceRef[] = [];
    private readonly neighbors = new Map<string, FaceRef[]>();

    constructor(source: GeometryResult) {
        this.owner = source.id;
        const addFaces = (
            faces: MeshData["quads"] | NonNullable<MeshData["triangles"]>,
            kind: FaceRef["kind"]
        ): void => {
            faces.forEach((face, index) => {
                const ref: FaceRef = { kind, index };
                this.faces.push(ref);
                this.neighbors.set(faceKey(ref), []);
                for (let i = 0; i < face.corners.length; i++) {
                    const from = face.corners[i]!;
                    const to = face.corners[(i + 1) % face.corners.length]!;
                    const key = edgeKey(from, to);
                    const uses = this.edges.get(key) ?? [];
                    uses.push({ face: ref, from, to, surface: face.surface });
                    this.edges.set(key, uses);
                }
            });
        };

        addFaces(source.geometry.quads, "quad");
        addFaces(source.geometry.triangles ?? [], "triangle");

        for (const uses of this.edges.values()) {
            if (uses.length !== 2) continue;
            const [first, second] = uses;
            if (first!.from !== second!.to || first!.to !== second!.from) {
                continue;
            }
            this.neighbors.get(faceKey(first!.face))!.push(second!.face);
            this.neighbors.get(faceKey(second!.face))!.push(first!.face);
        }
    }

    edgeUses(from: number, to: number): readonly EdgeUse[] {
        const uses = this.edges.get(edgeKey(from, to)) ?? [];
        return uses.map(({ face, from: a, to: b }) => ({
            face: { ...face }, from: a, to: b
        }));
    }

    faceNeighbors(face: FaceRef): readonly FaceRef[] {
        const neighbors = this.neighbors.get(faceKey(face));
        if (!neighbors) {
            throw new GeometryOperationError(
                "topologyOf", "invalid-input", "Unknown authored face"
            );
        }
        return neighbors.map(ref => ({ ...ref }));
    }

    private requireConsistentEdges(): void {
        for (const uses of this.edges.values()) {
            if (uses.length > 2 ||
                (uses.length === 2 &&
                    (uses[0]!.from !== uses[1]!.to ||
                        uses[0]!.to !== uses[1]!.from))) {
                error("Nonmanifold edge or inconsistent face winding");
            }
        }
    }

    private trace(uses: readonly Use[]): readonly BoundaryRef[] {
        const outgoing = new Map<number, Use>();
        const incoming = new Map<number, Use>();
        for (const use of uses) {
            if (outgoing.has(use.from) || incoming.has(use.to)) {
                error("Ambiguous boundary junction");
            }
            outgoing.set(use.from, use);
            incoming.set(use.to, use);
        }

        const visited = new Set<Use>();
        const result: BoundaryRef[] = [];
        const follow = (start: Use): void => {
            const vertices: number[] = [start.from];
            let current: Use | undefined = start;
            let closed = false;
            while (current) {
                if (visited.has(current)) error("Boundary revisits an edge");
                visited.add(current);
                vertices.push(current.to);
                if (current.to === vertices[0]) {
                    closed = true;
                    vertices.pop();
                    break;
                }
                current = outgoing.get(current.to);
            }
            if (vertices.length < (closed ? 3 : 2)) {
                error("Collapsed boundary chain");
            }
            result.push({ owner: this.owner, vertices, closed });
        };

        // Open paths must begin at a vertex with no incoming boundary edge.
        for (const use of uses) {
            if (!visited.has(use) && !incoming.has(use.from)) follow(use);
        }
        // The remaining edges form closed loops.
        for (const use of uses) {
            if (!visited.has(use)) follow(use);
        }
        return result;
    }

    openBoundaries(): readonly BoundaryRef[] {
        this.requireConsistentEdges();
        const uses: Use[] = [];
        for (const edge of this.edges.values()) {
            if (edge.length === 1) uses.push(edge[0]!);
        }
        return this.trace(uses);
    }

    regionBoundaries(region: string): readonly BoundaryRef[] {
        this.requireConsistentEdges();
        const uses: Use[] = [];
        for (const edge of this.edges.values()) {
            const selected = edge.filter(use => use.surface === region);
            if (selected.length === 1) uses.push(selected[0]!);
        }
        return this.trace(uses);
    }

    connectedComponents(): readonly (readonly FaceRef[])[] {
        const visited = new Set<string>();
        const components: FaceRef[][] = [];
        for (const start of this.faces) {
            if (visited.has(faceKey(start))) continue;
            const pending = [start];
            const component: FaceRef[] = [];
            visited.add(faceKey(start));
            while (pending.length) {
                const face = pending.pop()!;
                component.push({ ...face });
                for (const neighbor of this.neighbors.get(faceKey(face))!) {
                    const key = faceKey(neighbor);
                    if (visited.has(key)) continue;
                    visited.add(key);
                    pending.push(neighbor);
                }
            }
            components.push(component);
        }
        return components;
    }
}

const indexes = new WeakMap<GeometryResult, TopologyIndex>();

/** Reads authored connectivity; render triangles are never used as input. */
export function topologyOf(source: GeometryResult): TopologyIndex {
    let index = indexes.get(source);
    if (!index) {
        index = new IndexedTopology(source);
        indexes.set(source, index);
    }
    return index;
}
