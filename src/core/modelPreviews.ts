import * as THREE from "three";
import type { ModelDefinition } from "../models";

/** One renderer, four stills: the gallery must not spawn four animation loops. */
export function mountModelPreviews(models: readonly ModelDefinition[]): void {
    let renderer: THREE.WebGLRenderer;

    try {
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true
        });
    } catch (error) {
        console.warn("Model previews are unavailable:", error);
        return;
    }

    renderer.setPixelRatio(1);
    renderer.setSize(640, 420, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 640 / 420, 0.01, 1000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x465269, 2.5));

    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(4, 8, 6);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x9cbbe8, 1.1);
    fill.position.set(-5, 2, -4);
    scene.add(fill);

    for (const definition of models) {
        const target = document.querySelector<HTMLElement>(
            `[data-preview="${definition.slug}"]`
        );

        if (!target) continue;

        let object: THREE.Object3D | undefined;

        try {
            object = definition.create();
            scene.add(object);
            object.updateWorldMatrix(true, true);

            const bounds = new THREE.Box3().setFromObject(object);
            if (bounds.isEmpty()) continue;

            const center = bounds.getCenter(new THREE.Vector3());
            const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
            const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
            const distance = Math.max(0.5, radius / Math.sin(halfFov) * 1.28);

            camera.position.copy(center).add(
                new THREE.Vector3(1.4, 0.94, 1.7)
                    .normalize()
                    .multiplyScalar(distance)
            );
            camera.lookAt(center);
            camera.near = Math.max(0.001, distance / 1000);
            camera.far = Math.max(100, distance * 100);
            camera.updateProjectionMatrix();

            renderer.render(scene, camera);

            const image = document.createElement("img");
            image.className = "asset-preview-image";
            image.alt = "";
            image.decoding = "async";
            image.src = renderer.domElement.toDataURL("image/png");
            target.appendChild(image);
            target.classList.add("has-preview");
        } catch (error) {
            console.warn(`Could not preview ${definition.slug}:`, error);
        } finally {
            if (object) {
                scene.remove(object);
                object.traverse(child => {
                    if (!(child instanceof THREE.Mesh)) return;
                    child.geometry.dispose();
                    const materials = Array.isArray(child.material)
                        ? child.material
                        : [child.material];
                    for (const material of materials) material.dispose();
                });
            }
        }
    }

    renderer.dispose();
    renderer.forceContextLoss();
}
