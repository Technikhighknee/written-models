export { geometryResult, assertSelectionOwner, GeometryOperationError } from "./GeometryResult";
export type { GeometryResult, FaceRef, EdgeRef, BoundaryRef, SurfaceChart, SurfacePatchRef, GeometryFailure } from "./GeometryResult";
export { topologyOf } from "./topology";
export type { TopologyIndex, EdgeUse } from "./topology";
export { triangulateAuthoredFaces } from "./triangulation";
export type { AuthoredTriangle } from "./triangulation";
export { transformGeometry, deformVertices, offsetMeshUvs } from "../edit/geometryEdits";
export type { DeformationField } from "../edit/geometryEdits";
export { raycastSurface } from "../queries/raycastSurface";
export type { SurfaceTarget, SurfaceHit, Ray3 } from "../queries/raycastSurface";
export {
    DEFAULT_GEOMETRY_PRECISION,
    resolvePrecision,
    lengthTolerance
} from "./precision";
export type { GeometryPrecision } from "./precision";
export { capBoundary, capSectionEnd, tipBoundary } from "../build/finishBoundaries";
export type { CapOptions, TipOptions } from "../build/finishBoundaries";
export { bridgeBoundaries } from "../build/bridgeBoundaries";
export type { BridgeOptions } from "../build/bridgeBoundaries";
