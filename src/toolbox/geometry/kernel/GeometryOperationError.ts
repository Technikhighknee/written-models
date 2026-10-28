import type { FaceRef } from "./GeometryResult";

export type GeometryFailure =
    | "invalid-input"
    | "invalid-topology"
    | "degenerate-geometry"
    | "sampling-limit"
    | "no-intersection"
    | "outside-contact-patch"
    | "self-intersection"
    | "unsupported-topology"
    | "precision-loss";

export class GeometryOperationError extends Error {
    readonly operation: string;
    readonly reason: GeometryFailure;
    readonly context?: {
        face?: FaceRef;
        vertex?: number;
        station?: number;
        boundary?: string;
    };

    constructor(
        operation: string,
        reason: GeometryFailure,
        message: string,
        context?: GeometryOperationError["context"]
    ) {
        super(message);
        this.name = "GeometryOperationError";
        this.operation = operation;
        this.reason = reason;
        if (context !== undefined) this.context = context;
    }
}
