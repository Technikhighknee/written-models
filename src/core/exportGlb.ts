import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { prepareRuntimeModel } from "./export/prepareRuntimeModel";

export async function exportGlb(
    model: THREE.Object3D,
    filename: string
): Promise<void> {
    // Never optimize the editor's model in place. GLB exports are compiled
    // copies with static geometry and compatible materials consolidated.
    const runtime = prepareRuntimeModel(model);
    const exportScene = new THREE.Scene();
    exportScene.add(runtime.root);

    try {
        const exporter = new GLTFExporter();
        const buffer = await exporter.parseAsync(
            exportScene,
            { binary: true }
        );

        if (!(buffer instanceof ArrayBuffer)) {
            throw new Error("Expected binary GLB export");
        }

        console.info(
            `GLB: ${runtime.sourceMeshes} source meshes -> ` +
            `${runtime.outputMeshes} runtime meshes, ` +
            `${runtime.atlasPages} PBR texture atlas pages`
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
    } finally {
        runtime.dispose();
    }
}
