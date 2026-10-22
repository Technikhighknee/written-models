import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

export async function exportGlb(model, filename) {
    const exportScene = new THREE.Scene();
    exportScene.add(model.clone(true));

    const exporter = new GLTFExporter();

    const buffer = await exporter.parseAsync(
        exportScene,
        { binary: true }
    );

    const blob = new Blob(
        [buffer],
        { type: "model/gltf-binary" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}