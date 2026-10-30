import assert from "node:assert/strict";

/**
 * Check the real geometry of independently authored, chamfered panels.
 * Every board is a closed ten-corner loft, with shared longitudinal
 * stations and an intentional non-overlapping seam to its neighbor.
 */
export function assertBoardPanel(pieces, { count, gap }, topologyOf) {
    assert.equal(pieces.length, count);

    const stationCounts = pieces.map(({ geometry }) => {
        assert.equal(geometry.vertices.length % 10, 0);
        return geometry.vertices.length / 10;
    });
    assert.ok(stationCounts.every(count => count >= 2));
    assert.ok(stationCounts.every(count =>
        count === stationCounts[0]
    ));

    for (const piece of pieces) {
        const mesh = piece.geometry;
        const stations = mesh.vertices.length / 10;
        const counts = new Map();

        assert.equal(topologyOf(piece).openBoundaries().length, 0);
        assert.equal(topologyOf(piece).connectedComponents().length, 1);
        assert.equal(mesh.triangles?.length ?? 0, 0);
        assert.equal(mesh.quads.length, 10 * (stations - 1) + 8);
        assert.ok(mesh.vertices.every(point =>
            [point.x, point.y, point.z].every(Number.isFinite)
        ));

        for (const face of mesh.quads) {
            counts.set(face.surface, (counts.get(face.surface) ?? 0) + 1);
            assert.equal(face.corners.length, 4);
            assert.ok(face.uvs.every(uv =>
                Number.isFinite(uv.x) && Number.isFinite(uv.y)
            ));
        }

        for (const surface of ["outer", "inner"]) {
            assert.equal(counts.get(surface), 4 * (stations - 1));
        }
        for (const surface of ["edge-left", "edge-right"]) {
            assert.equal(counts.get(surface), stations - 1);
        }
        for (const surface of ["cap-start", "cap-end"]) {
            assert.equal(counts.get(surface), 4);
        }
    }

    // End offsets and skews differ per board, so compare normalized
    // positions rather than raw X coordinates.
    const normalizedStations = mesh => {
        const count = mesh.vertices.length / 10;
        const first = mesh.vertices[0].x;
        const last = mesh.vertices[(count - 1) * 10].x;
        assert.ok(last > first);
        return Array.from({ length: count }, (_, row) =>
            (mesh.vertices[row * 10].x - first) / (last - first)
        );
    };
    const reference = normalizedStations(pieces[0].geometry);

    for (let index = 0; index < pieces.length; index++) {
        const stations = normalizedStations(pieces[index].geometry);
        stations.forEach((t, row) => {
            assert.ok(Math.abs(t - reference[row]) <= 1e-9,
                `Board ${index} does not share longitudinal station ${row}`);
        });

        if (index === 0) continue;
        for (let row = 0; row < stations.length; row++) {
            const left = pieces[index - 1].geometry.vertices[
                row * 10 + 4
            ].z;
            const right = pieces[index].geometry.vertices[
                row * 10
            ].z;
            assert.ok(right - left >= gap - 1e-9,
                `Boards ${index - 1} and ${index} overlap at row ${row}`);
        }
    }
}
