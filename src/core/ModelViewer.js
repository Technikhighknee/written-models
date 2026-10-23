import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class ModelViewer {
    constructor(container) {
        this.container = container;
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color("#30343a");
        
        
        this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
        
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        
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

        this.model = null;
        this.wireframe = false;
        this.originalMaterials = new Map();

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
            this.renderer.render(this.scene, this.camera);
        });
    }


    setModel(model) {
        if (this.model) {
            this.scene.remove(this.model);
        }

        this.model = model;
        this.scene.add(model);
        this.setWireframe(this.wireframe);


        const bounds = new THREE.Box3().setFromObject(model);

        if (bounds.isEmpty()) {
            return;
        }

        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());

        const extent = Math.max(
            size.x,
            size.y,
            size.z,
            0.5
        );

        this.camera.position.copy(center).add(
            new THREE.Vector3(
                extent * 1.8,
                extent * 1.35,
                extent * 1.8
            )
        );

        this.camera.near = Math.max(0.01, extent / 1000);
        this.camera.far = Math.max(100, extent * 100);
        this.camera.updateProjectionMatrix();

        this.controls.target.copy(center);
        this.controls.update();
    }
    

    setWireframe(enabled) {
        this.wireframe = enabled;

        if (!this.model) return;

        this.model.traverse(object => {
            if (!object.isMesh) return;

            if (enabled) {
                if (!this.originalMaterials.has(object)) {
                    this.originalMaterials.set(object, object.material);
                }

                object.material = this.wireframeMaterial;
            } else if (this.originalMaterials.has(object)) {
                object.material = this.originalMaterials.get(object);
                this.originalMaterials.delete(object);
            }
        });
    }


    getTriangleCount() {
        if (!this.model) return 0;

        let triangles = 0;

        this.model.traverse(object => {
            if (!object.isMesh) return;

            const geometry = object.geometry;

            if (geometry.index) {
                triangles += geometry.index.count / 3;
            } else {
                triangles += geometry.attributes.position.count / 3;
            }
        });

        return triangles;
    }


    resize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        if (width === 0 || height === 0) {
            return;
        }

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
    }


    dispose() {
        this.renderer.setAnimationLoop(null);
        this.resizeObserver.disconnect();
        this.wireframeMaterial.dispose();
        this.controls.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
