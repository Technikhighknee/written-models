import type * as THREE from "three";

export interface Contour2 {
    points: readonly THREE.Vector2Like[];
    closed: boolean;
}

export interface Contour3 {
    points: readonly THREE.Vector3Like[];
    closed: boolean;
}

export interface Profile2 {
    outer: Contour2;
    holes?: readonly Contour2[];
}

export interface SampledContour2 {
    /** Closed outline; the first point is not duplicated at the end. */
    points: readonly THREE.Vector2Like[];
    parameters: readonly number[];
}

export interface SampledProfile2 {
    outer: SampledContour2;
    holes?: readonly SampledContour2[];
}

export interface Section3 {
    outer: Contour3;
    inner?: readonly Contour3[];
}

export interface Path3 {
    at(t: number): THREE.Vector3Like;
    tangent(t: number): THREE.Vector3Like;
}

export type SectionField = (t: number) => Profile2;
export type ScalarField = (t: number) => number;

export interface GeometricFrame {
    localToWorld: THREE.Matrix4;
}

export interface SampledBoundary {
    parameters: readonly number[];
    points: readonly THREE.Vector3Like[];
    closed: boolean;
}

export interface ContourCorrespondence {
    stations: readonly number[];
    first: Contour3;
    second: Contour3;
    /** Stable feature IDs establish correspondence independently of distance. */
    landmarks: readonly {
        id: string;
        first: number;
        second: number;
    }[];
}
