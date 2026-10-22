import * as THREE from "three";

export function createTable() {
    const table = new THREE.Group();
    table.name = "TavernTable";

    const wood = new THREE.MeshStandardMaterial({
        color: "#855632",
        roughness: 0.9
    });

    function addBox(name, size, position) {
        const geometry = new THREE.BoxGeometry(...size);
        const mesh = new THREE.Mesh(geometry, wood);

        mesh.name = name;
        mesh.position.set(...position);

        table.add(mesh);
    }
    
    const TOP_SIZE = [2, 0.14, 1.1];
    const TOP_POS = [0, 1, 0];

    const LEG_SIZE = [0.12, 1, 0.12];
    const FL_POS = [-0.82, 0.5, 0.4];
    const FR_POS = [0.82, 0.5, 0.4];
    const BL_POS = [-0.82, 0.5, -0.4];
    const BR_POS = [0.82, 0.5, -0.4]
    
    addBox("TableTop", TOP_SIZE, TOP_POS);
    addBox("LegFL", LEG_SIZE, FL_POS);
    addBox("LegFR", LEG_SIZE, FR_POS);
    addBox("LegBL", LEG_SIZE, BL_POS);
    addBox("LegBR", LEG_SIZE, BR_POS);

    return table;
}