import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getControlOutline } from "../toolbox/geometry/mesh/controlOutline";
import type { ControlOutline } from "../toolbox/geometry/mesh/controlOutline";

export type CameraView = "isometric" | "front" | "side" | "top";

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
        color: "#80c4ff",
        depthTest: true,
        depthWrite: false
    });
    private readonly quadEntries: {
        mesh: THREE.Mesh;
        originalMaterial: THREE.Material | THREE.Material[];
        outline: THREE.LineSegments;
    }[] = [];
    private readonly resizeObserver: ResizeObserver;

    quadView = false;
    wireframe = false;

    constructor(container: HTMLElement) {
        this.container = container;

        this.scene = new THREE.Scene();
        this.scene.background = null;

        this.camera = new THREE.PerspectiveCamera(46, 1, 0.01, 1000);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(
            this.camera,
            this.renderer.domElement
        );
        this.controls.enableDamping = true;
        this.controls.minDistance = 0.01;

        const ambient = new THREE.HemisphereLight(0xffffff, 0x465269, 2.4);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 2.8);
        sun.position.set(4, 8, 6);
        this.scene.add(sun);

        const fill = new THREE.DirectionalLight(0xa4c5ff, 0.8);
        fill.position.set(-4, 2, -5);
        this.scene.add(fill);

        this.grid = new THREE.GridHelper(10, 20, 0x7286a0, 0x303f52);
        if (!Array.isArray(this.grid.material)) {
            this.grid.material.depthWrite = false;
        }
        this.scene.add(this.grid);

        this.wireframeMaterial = new THREE.MeshBasicMaterial({
            color: "#80c4ff",
            wireframe: true,
            side: THREE.DoubleSide
        });

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);
        this.resize();
        this.renderer.setAnimationLoop(() => this.renderFrame());
    }

    private renderFrame(): void {
        this.controls.update();
        this.model?.updateWorldMatrix(true, true);

        for (const entry of this.quadEntries) {
            entry.outline.matrix.copy(entry.mesh.matrixWorld);
            entry.outline.matrixWorldNeedsUpdate = true;
        }

        this.renderer.render(this.scene, this.camera);
    }

    setModel(model: THREE.Object3D): void {
        const previousWireframe = this.wireframe;
        const previousQuadView = this.quadView;

        if (this.model) {
            this.setQuadView(false);
            this.setWireframe(false);
            this.scene.remove(this.model);
        }

        this.originalMaterials.clear();
        this.model = model;
        this.scene.add(model);

        if (previousWireframe) this.setWireframe(true);
        if (previousQuadView && this.getQuadCount() > 0) {
            this.setQuadView(true);
        }

        this.setCameraView("isometric");
    }

    setCameraView(view: CameraView): void {
        if (!this.model) return;

        const bounds = new THREE.Box3().setFromObject(this.model);
        if (bounds.isEmpty()) return;

        const center = bounds.getCenter(new THREE.Vector3());
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        const vertical = THREE.MathUtils.degToRad(this.camera.fov / 2);
        const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect);
        const distance = Math.max(
            0.5,
            sphere.radius / Math.sin(Math.min(vertical, horizontal)) * 1.25
        );

        const direction = {
            isometric: new THREE.Vector3(1.5, 1.05, 1.6),
            front: new THREE.Vector3(0, 0, 1),
            side: new THREE.Vector3(1, 0, 0),
            top: new THREE.Vector3(0, 1, 0)
        }[view].normalize();

        this.camera.up.set(0, 1, 0);
        if (view === "top") this.camera.up.set(0, 0, -1);

        this.camera.position.copy(center).addScaledVector(direction, distance);
        this.camera.near = Math.max(0.001, distance / 1000);
        this.camera.far = Math.max(100, distance * 100);
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(center);

        this.controls.target.copy(center);
        this.controls.update();
    }

    setGridVisible(visible: boolean): void {
        this.grid.visible = visible;
    }

    getDimensions(): THREE.Vector3 | null {
        if (!this.model) return null;
        const bounds = new THREE.Box3().setFromObject(this.model);
        return bounds.isEmpty() ? null : bounds.getSize(new THREE.Vector3());
    }

    getMeshCount(): number {
        let count = 0;
        this.model?.traverse(object => {
            if (object instanceof THREE.Mesh) count++;
        });
        return count;
    }

    setWireframe(enabled: boolean): void {
        if (enabled && this.quadView) this.setQuadView(false);
        this.wireframe = enabled;
        if (!this.model) return;

        this.model.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;

            if (enabled) {
                if (!this.originalMaterials.has(object)) {
                    this.originalMaterials.set(object, object.material);
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
        if (enabled && this.wireframe) this.setWireframe(false);

        for (const entry of this.quadEntries) {
            const preview = entry.mesh.material;
            entry.mesh.material = entry.originalMaterial;

            const materials = Array.isArray(preview) ? preview : [preview];
            for (const material of materials) material.dispose();

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

            const outline = createQuadOutline(data, this.quadMaterial);
            outline.matrixAutoUpdate = false;
            outline.renderOrder = 1;
            outline.frustumCulled = false;
            this.scene.add(outline);
            this.quadEntries.push({ mesh: object, originalMaterial, outline });
        });
    }

    getQuadCount(): number {
        if (!this.model) return 0;
        let quads = 0;
        this.model.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            const data = getControlOutline(object.geometry);
            if (data) quads += data.quadCount;
        });
        return quads;
    }

    getTriangleCount(): number {
        if (!this.model) return 0;
        let triangles = 0;
        this.model.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            const geometry = object.geometry;
            triangles += geometry.index
                ? geometry.index.count / 3
                : geometry.attributes.position.count / 3;
        });
        return triangles;
    }

    async capturePng(filename: string): Promise<void> {
        this.renderFrame();

        const blob = await new Promise<Blob>((resolve, reject) => {
            this.renderer.domElement.toBlob(result => {
                if (result) resolve(result);
                else reject(new Error("Could not capture the viewport"));
            }, "image/png");
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    resize(): void {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        if (width === 0 || height === 0) return;
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
