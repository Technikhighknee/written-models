import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getControlOutline } from "../toolbox/geometry/mesh/controlOutline";
import type { ControlOutline } from "../toolbox/geometry/mesh/controlOutline";

export class ModelViewer {
    readonly container: HTMLElement;
    readonly scene: THREE.Scene;
    readonly camera: THREE.PerspectiveCamera;
    readonly renderer: THREE.WebGLRenderer;
    readonly controls: OrbitControls;
    readonly grid: THREE.GridHelper;

    private model: THREE.Object3D | null = null;
    private readonly originalMaterials =
        new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

    private readonly wireframeMaterial: THREE.MeshBasicMaterial;

    private readonly quadMaterial = new THREE.LineBasicMaterial({
        color: "#79baff",
        depthTest: true,
        depthWrite: false
    });

    private readonly quadEntries: {
        mesh: THREE.Mesh;
        originalMaterial: THREE.Material | THREE.Material[];
        outline: THREE.LineSegments;
    }[] = [];

    quadView = false;

    private readonly resizeObserver: ResizeObserver;

    wireframe = false;

    constructor(container: HTMLElement) {
        this.container = container;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color("#30343a");

        this.camera = new THREE.PerspectiveCamera(
            50, 1, 0.01, 1000
        );

        this.renderer = new THREE.WebGLRenderer({
            antialias: true
        });

        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, 2)
        );

        this.container.appendChild(this.renderer.domElement);


        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement
        );

        this.controls.enableDamping = true;


        const ambient = new THREE.HemisphereLight(
            0xffffff,
            0x625343,
            2
        );

        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(
            0xffffff,
            2.2
        );

        sun.position.set(3, 6, 4);
        this.scene.add(sun);


        this.grid = new THREE.GridHelper(
            10, 20,
            0x627082,
            0x39424d
        );

        this.scene.add(this.grid);

        this.wireframeMaterial = new THREE.MeshBasicMaterial({
            color: "#79baff",
            wireframe: true,
            side: THREE.DoubleSide
        });

        this.resizeObserver = new ResizeObserver(() => {
            this.resize();
        });

        this.resizeObserver.observe(this.container);
        this.resize();


        this.renderer.setAnimationLoop(() => {
            this.controls.update();

            this.model?.updateWorldMatrix(true, true);

            for (const entry of this.quadEntries) {
                entry.outline.matrix.copy(
                    entry.mesh.matrixWorld
                );

                entry.outline.matrixWorldNeedsUpdate = true;
            }

            this.renderer.render(this.scene, this.camera);
        });
    }


    setModel(model: THREE.Object3D): void {
        const wasWireframe = this.wireframe;
        const wasQuadView = this.quadView;

        if (this.model) {
            this.setWireframe(false);
            this.setQuadView(false);
            this.scene.remove(this.model);
        }

        this.originalMaterials.clear();

        this.model = model;
        this.scene.add(model);

        this.setWireframe(wasWireframe);

        this.setQuadView(
            wasQuadView && this.getQuadCount() > 0
        );

        const bounds = new THREE.Box3().setFromObject(model);

        if (bounds.isEmpty()) {
            return;
        }

        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const extent = Math.max(size.x, size.y, size.z, 0.01);

        // Fit the projected bounds instead of keeping a fixed wide distance.
        const direction = new THREE.Vector3(1.8, 1.35, 1.8).normalize();

        this.camera.position.copy(center).add(direction);
        this.camera.lookAt(center);

        const inverseRotation = this.camera.quaternion.clone().invert();
        const verticalSlope = Math.tan(
            THREE.MathUtils.degToRad(this.camera.fov) / 2
        ) / this.camera.zoom;
        const horizontalSlope = verticalSlope * this.camera.aspect;
        const fill = 0.82;

        let distance = 0;

        for (const x of [bounds.min.x, bounds.max.x]) {
            for (const y of [bounds.min.y, bounds.max.y]) {
                for (const z of [bounds.min.z, bounds.max.z]) {
                    const corner = new THREE.Vector3(x, y, z)
                        .sub(center)
                        .applyQuaternion(inverseRotation);

                    distance = Math.max(
                        distance,
                        corner.z + Math.abs(corner.x) /
                            (horizontalSlope * fill),
                        corner.z + Math.abs(corner.y) /
                            (verticalSlope * fill)
                    );
                }
            }
        }

        distance = Math.max(distance, extent * 0.5);
        this.camera.position.copy(center).addScaledVector(direction, distance);

        this.camera.near = Math.max(0.001, extent / 1000);
        this.camera.far = Math.max(100, distance + extent * 100);
        this.camera.updateProjectionMatrix();

        this.controls.target.copy(center);
        this.controls.update();
    }


    setWireframe(enabled: boolean): void {
        this.wireframe = enabled;

        if (!this.model) return;

        if (enabled && this.quadView) {
            this.setQuadView(false);
        }

        this.model.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;

            if (enabled) {
                if (!this.originalMaterials.has(object)) {
                    this.originalMaterials.set(
                        object,
                        object.material
                    );
                }

                object.material = this.wireframeMaterial;

            } else {
                const original = this.originalMaterials.get(object);

                if (original) {
                    object.material = original;
                    this.originalMaterials.delete(object);
                }
            }
        });
    }

    setQuadView(enabled: boolean): void {
        if (this.quadView === enabled) return;

        if (enabled && this.wireframe) {
            this.setWireframe(false);
        }

        for (const entry of this.quadEntries) {
            const preview = entry.mesh.material;

            entry.mesh.material = entry.originalMaterial;

            const materials = Array.isArray(preview)
                ? preview
                : [preview];

            for (const material of materials) {
                material.dispose();
            }

            this.scene.remove(entry.outline);
            entry.outline.geometry.dispose();
        }

        this.quadEntries.length = 0;
        this.quadView = enabled;

        if (!enabled || !this.model) return;

        this.model.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;

            const data = getControlOutline(object.geometry);

            if (!data) return;

            const originalMaterial = object.material;

            const materials = Array.isArray(originalMaterial)
                ? originalMaterial
                : [originalMaterial];

            const previewMaterials = materials.map(material => {
                const preview = material.clone();

                preview.polygonOffset = true;
                preview.polygonOffsetFactor = 1;
                preview.polygonOffsetUnits = 1;

                return preview;
            });

            object.material = Array.isArray(originalMaterial)
                ? previewMaterials
                : previewMaterials[0]!;

            const outline = createQuadOutline(
                data,
                this.quadMaterial
            );

            outline.matrixAutoUpdate = false;
            outline.renderOrder = 1;
            outline.frustumCulled = false;

            this.scene.add(outline);


            this.quadEntries.push({
                mesh: object,
                originalMaterial,
                outline
            });
        });
    }

    getQuadCount(): number {
        if (!this.model) return 0;

        let quads = 0;

        this.model.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;

            const data = getControlOutline(object.geometry);

            if (data) {
                quads += data.quadCount;
            }
        });

        return quads;
    }

    getTriangleCount(): number {
        if (!this.model) return 0;

        let triangles = 0;

        this.model.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;

            const geometry = object.geometry;

            if (geometry.index) {
                triangles += geometry.index.count / 3;
            } else {
                triangles += geometry.attributes.position.count / 3;
            }
        });

        return triangles;
    }


    resize(): void {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        if (width === 0 || height === 0) {
            return;
        }

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }


    dispose(): void {
        this.setQuadView(false);
        this.setWireframe(false);
        this.quadMaterial.dispose();
        this.renderer.setAnimationLoop(null);
        this.resizeObserver.disconnect();
        this.wireframeMaterial.dispose();
        this.controls.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}

function createQuadOutline(
    outline: ControlOutline,
    material: THREE.LineBasicMaterial
): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(outline.positions, 3)
    );

    return new THREE.LineSegments(geometry, material);
}
