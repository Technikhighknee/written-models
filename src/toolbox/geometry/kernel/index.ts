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
export { findFacingPatch } from "../queries/findFacingPatch";
export type { SurfacePatchHit } from "../queries/findFacingPatch";
export { finiteFootprintContains } from "../queries/finiteFootprint";
export type { FootprintTriangle } from "../queries/finiteFootprint";
export { fitBetweenSurfaces } from "../queries/fitBetweenSurfaces";
export type { SurfaceAttachment, FittedContact, FittedSections, FitBetweenSurfacesOptions } from "../queries/fitBetweenSurfaces";
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
export { sweepSection } from "../build/sweepSection";
export type { PathSweepOptions } from "../build/sweepSection";
export { revolveProfile, revolveMeridianMesh } from "../build/revolveProfile";
export type {
    RevolveOptions, RevolveFaceContext, MeridianStation
} from "../build/revolveProfile";
export { triangulateProfile } from "../build/triangulateProfile";
export { extrudeContour } from "../build/extrudeContour";
export type { ExtrudeOptions, ExtrudeLayer } from "../build/extrudeContour";
export { samplePolarStripSections } from "../build/samplePolarStripSections";
export type { PolarStripOptions } from "../build/samplePolarStripSections";
export { sampleProfile } from "../build/sampleProfile";
export type { ProfileStations } from "../build/sampleProfile";
export { correspondContours } from "../build/correspondContours";
export type { ContourCorrespondence } from "../definitions/geometry";
export { partitionContour } from "../build/partitionContour";
export type { PlanarCut2, ContourPartition } from "../build/partitionContour";
export { samplePartition } from "../build/samplePartition";
export type { SampledContourPartition } from "../build/samplePartition";
export { fillSurfacePatch } from "../build/fillSurfacePatch";
export type { SurfaceFillOptions } from "../build/fillSurfacePatch";
export { joinGeometry } from "../build/joinGeometry";
export type { GeometryJoinOptions } from "../build/joinGeometry";
export { shapeSurfaceRelief } from "../edit/shapeSurfaceRelief";
export type {
    SurfaceReliefFeature,
    SurfaceReliefOptions
} from "../edit/shapeSurfaceRelief";
export { shapeSectionCorners } from "../build/shapeSectionCorners";
export type {
    CornerTransition,
    SectionEdgeOrigin,
    ShapedSectionContour
} from "../build/shapeSectionCorners";
export { classifyAuthoredFaces } from "../materials/classifyAuthoredFaces";
export type {
    AuthoredFaceInfo,
    FaceMetadata
} from "../materials/classifyAuthoredFaces";
export { projectAuthoredUvs, planarUvProjector } from "../uv/projectAuthoredUvs";
export type {
    AuthoredUvProjector,
    AuthoredUvProjectionOptions
} from "../uv/projectAuthoredUvs";
