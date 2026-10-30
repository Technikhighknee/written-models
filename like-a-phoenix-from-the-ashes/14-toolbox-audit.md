# Phoenix — vollständiger Toolbox-Soll-Ist-Abgleich

Stand: 30.10.2026. Ausgangsbasis: `main` @ `d18b2241fe4533bc71ffa90e1c544aa644f86879` (105 TypeScript-Dateien unter `src/toolbox/`, 706150 Bytes). Der Git-Tree war nicht abgeschnitten. Dieses Audit bezieht sich auf genau diesen Bestand; entfernte Dateien bleiben in der Ausgangsmatrix sichtbar.

## Leseschlüssel und Nachweisgrenzen

- **BEHALTEN** = Die Implementierung hat eine konkret benennbare, im Phoenix-Plan vorgesehene eigene Verantwortung. Dies ist eine Prüfung der Quelltexte, Importbeziehungen und der Architekturzuordnung, **kein Beweis vollständiger Laufzeitkorrektheit**.
- **BEREINIGT** = Die Datei bleibt; ein nachweislich ersetzter zweiter Algorithmus wurde daraus entfernt.
- **ENTFERNT** = Aus der Ausgangsbasis tatsächlich entfernt, nachdem die aktuelle Quelltext-/Test-Verbraucherprüfung keinen benötigten Gebrauch zeigte und eine Phoenix-Operation denselben Aufgabenbereich bedient.
- **OFFEN** = Die Dateiexistenz ist erklärbar, aber ihre Einordnung als geometrische Toolbox-Fähigkeit oder modellgebundenes Rezept widerspricht teilweise den Grundsätzen in 06/13. Nicht stillschweigend als vollständig migriert oder als sicher löschbar verbuchen.

Geprüfte Quellen: alle 13 Phoenix-Dokumente plus README, `docs/ARCHITECTURE.md`, die 105 Toolbox-TypeScript-Dateien, sämtliche 29 weiteren TypeScript-Dateien in `src/` und die 49 Test-/Support-MJS-Dateien auf explizite Verbraucher der bereinigten APIs. Die Dateimatrix erfasst Funktionen und Verantwortlichkeiten; sie ersetzt keinen Godot-/GLB-Sichttest und keinen ausführbaren Typecheck. Diese wurden im Rahmen **dieses** Audits nicht ausgeführt.

## Konkrete Migrationseingriffe

1. `shapes/operations/cleanClosedContour.ts` war nur ein Aufruf von `geometry/topology/contours.ts::cleanContour2`, sogar als Erhalt der alten Shapes-API kommentiert. Der einzige Import im aktiven `src/` war `geometry/construction/sweepSection.ts`: direkt auf `cleanContour2` umgestellt, Adapter gelöscht. Die geometrische Operation bleibt erhalten.
2. `geometry/uv/boxUVsInMeters.ts` änderte `THREE.BoxGeometry`-UV-Attribute direkt und wurde im aktiven `src/` nicht importiert. Das ist nicht die authored-UV-Pipeline. `boxMesh` liefert physikalische UVs aus authored Quads, `projectAuthoredUvs` die allgemeine UV-Projektion. Das renderseitige Altmodul wurde entfernt. Die Aussage in 06 („keep general physical UV projection“) bleibt damit **funktional**, nicht dateinamentreu, erfüllt.
3. `geometry/construction/profiledCavity.ts::cavityFromMeshSurfaces` rekonstruierte Ringe noch einmal über quantisierte Punkt-/Kanten-Maps. Kein aktiver Quell- oder Testverbraucher wurde gefunden. `queries/cavitySectionsFromSurfaces` ist der neue spezifizierte Extraktionspfad; `ProfiledCavity` bleibt für Querschnitts-/Volumeninterpolation erhalten. Nur die veraltete Zweitextraktion wurde entfernt.

## Echte, noch offene Architekturrechnungen

| Pfad | Plan / Ist | Abschlussentscheidung noch nötig |
| --- | --- | --- |
| `geometry/construction/loftBoard.ts` | 06 fordert allgemeine Boundary-Bridge; 07.1 bezeichnet `loftBoard` ausdrücklich als behalten. Ist benutzt allgemeinen Quad-Loft und Polyline-Stitching, exponiert aber `BoardSection` und feste Brettoberflächen. | Eigenständige generische Operation oder Brettrezept nach `models/components` verlagern? Ohne Vergleich aller Quads/UVs/Nahtkanten nicht löschen. |
| `geometry/construction/cutBoard.ts` | Ist wandelt Brett-Zapfenausschnitte in `layeredGridSolid` um. 06 will allgemeine Patch-/Through-Cut-Operationen; 07.1 bewahrt den Wrapper trotzdem auf. | Modellrezept oder geometrischer Endnutzer-API-Vertrag? Funktionale Doppelung zu `cutThrough` ist nicht bewiesen, ihr spezifischer Zuschnitt bleibt offen. |
| `geometry/construction/seamedPlankExtrusion.ts` | 07.1 gestattet `seamedPlankExtrusionData` ausdrücklich, 06/13 fordern jedoch Extraktion gemeinsamer Seams/Reliefs. Ist eine umfangreiche Holzoberflächen-/Naht-Konstruktion, kein GPU-Adapter. | Welche Teile gehören wirklich in allgemeine Seams/Relief-Operationen und welche in `cooperedHead`? Die Datei nicht allein wegen des Namens entfernen. |
| `geometry/construction/bandAroundProfile.ts` | 07.2 behält `bandAroundProfileData`; Ist baut eigenständige komplette radial geführte Band-Quads, obwohl allgemeine Sweep- und Clearance-Operationen existieren. | Geometrisch erforderliche Unterschiede gegenüber `sweepSection` explizit beweisen oder als Komposition auf gemeinsamen Kern reduzieren. |

### Abgegrenzte ähnliche Namen (keine erwiesene Doppelimplementierung)

- `build/loftSideQuads` ist der geteilte Quad-Strip-Kern, `build/loftSectionWalls` die owned Section-/Boundary-Schicht; `construction/sweepSectionResult` spezifiziert eine Catmull-Rom-Bahn über `build/sweepSection`.
- `build/triangulateProfile` trianguliert planare Konturprofile; `kernel/triangulation` trianguliert authored Flächen für Render und Query.
- `shapes/operations/clipConvexPolygon` ist ein konvexer Teilalgorithmus; `geometry/edit/clipContour` ist die komplexere concave/Holes-Operation.
- `queries/fitBetweenSurfaces` prüft endliche Flächenkontaktabdrücke; `construction/sectionsBetweenPlanes` löst die einfachere reine Schnittrechnung an expliziten Ebenen.
- `spatial/relationships/attachAtFrames` implementiert die eine Attachment-Gleichung; `attachByAnchor` löst benannte, ggf. verschachtelte Anker und die explizite Mating-Rotation auf. **Beide haben einen Grund zu existieren**, `attachByFrames` nicht.
- `geometry/construction/profiledCavity` interpoliert Volumen; `queries/cavitySectionsFromSurfaces` extrahiert separate Mesh-Innenwandringe. Das sind nach der Bereinigung verschiedene Schritte.

## Dokumentkonflikte (nicht nachträglich als „schon erledigt“ umdeuten)

1. `09-api-contracts.md` sagt weiterhin, `attachByFrames` delegiere an `attachAtFrames`, während 07.1 die Entfernung festhält; aktuell existiert nur `attachAtFrames` plus `attachByAnchors`.
2. `06-migration-map.md` beschreibt einige ursprüngliche Dateien als „keep“/„destination“. 07.1/7.2 hält spätere Extraktionen und vollständige Entfernungen fest. 06 ist keine verlässliche **finale Dateiliste**.
3. Der `surfaceMesh`-Vertrag in 09 akzeptiert `MeshData | GeometryResult`, der aktuelle Renderingadapter und `docs/ARCHITECTURE.md` verwenden `GeometryResult` als eine Rendergrenze. Der Vertrag braucht einen bewussten Abgleich, kein stilles Kompatibilitäts-Overload.
4. 07.1 ist nicht das gleiche wie „keine alten Module mehr“: der Text erklärt mehrere behaltene Kompositionsdateien, die noch nach ihren Domänengrenzen zu prüfen sind.
5. 07/1.1 bleibt ausdrücklich **ungehakt**, weil die ursprüngliche visuelle Baseline vor der Migration nicht gesichert wurde. Das ist kein nachträglich wegzudefinierendes Problem. Die später akzeptierten Godot-Modelle ersetzen keinen historischen Snapshot.
6. 13 plant die Phoenix-Dokumente als temporär ein. Bis die vier offenen Codeentscheidungen geklärt sind, ist die Planungsbasis und dieser Auditbeleg absichtlich erhalten.

## Vollständige Ausgangsmatrix — 105 / 105

### `geometry/build/` (22)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `axialProfileSolid.ts` | **BEHALTEN** | Axiale Profilkörper durch allgemeine Sektionen, Wände und Kappen |
| `bridgeBoundaries.ts` | **BEHALTEN** | Unterschiedlich abgetastete Randketten verbinden |
| `correspondContours.ts` | **BEHALTEN** | Konturen über benannte Merkmale korrespondieren |
| `ellipticalRing.ts` | **BEHALTEN** | Elliptische Querschnittspunkte abtasten |
| `extrudeContour.ts` | **BEHALTEN** | Konturextrusion mit authored Wänden und Kappen |
| `fillSurfacePatch.ts` | **BEHALTEN** | Explizit abgetastete Flächen samt Chart füllen |
| `finishBoundaries.ts` | **BEHALTEN** | Offene Ränder mit Kappen oder Spitzentopologie schließen |
| `joinGeometry.ts` | **BEHALTEN** | Explizite Grenzpaare validiert verschweißen |
| `layeredGridSolid.ts` | **BEHALTEN** | Allgemeines geschichtetes Zellraster als Volumengeometrie |
| `loftSectionWalls.ts` | **BEHALTEN** | Owned Loft-Wände mit Regions- und Randselektionen |
| `loftSideQuads.ts` | **BEHALTEN** | Gemeinsamer niedrigstufiger Quad-Strip-Loft |
| `partitionContour.ts` | **BEHALTEN** | Kontur entlang gemeinsamer Trennlinien aufteilen |
| `polygonalRadiusOutside.ts` | **BEHALTEN** | Polygonchord-Sicherheitsabstand berechnen |
| `regularizeTriangles.ts` | **BEHALTEN** | Innere Chart-Dreiecke ohne Randänderung verbessern |
| `revolveProfile.ts` | **BEHALTEN** | Rotationsgeometrie einschließlich Polstellen und Materialregionen |
| `sampleAxialSections.ts` | **BEHALTEN** | Axiale Profilstations- und Querschnittsabnahme |
| `samplePartition.ts` | **BEHALTEN** | Geteilte Konturen mit gemeinsamen Stationen abtasten |
| `samplePolarStripSections.ts` | **BEHALTEN** | Radiale Streifenabschnitte für generisches Loft abtasten |
| `sampleProfile.ts` | **BEHALTEN** | Profil mit exakten äußeren und inneren Stationen abtasten |
| `shapeSectionCorners.ts` | **BEHALTEN** | Allgemeine Querschnittsecken gestalten |
| `sweepSection.ts` | **BEHALTEN** | Allgemeiner Pfadsweep mit transportierten Frames |
| `triangulateProfile.ts` | **BEHALTEN** | Planare Profile unter Beibehaltung der Randstationen triangulieren |

### `geometry/construction/` (11)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `bandAroundProfile.ts` | **OFFEN** | Profilfolgende Bänder mit Clearance; spezialisiertes vollständiges Sweep-Rezept |
| `boxMesh.ts` | **BEHALTEN** | Authored Box-Quads samt UVs statt BoxGeometry-Rückkonvertierung |
| `cutBoard.ts` | **OFFEN** | Brett-/Zapfenausschnitt-Rezept über layeredGridSolid |
| `cylinderMesh.ts` | **BEHALTEN** | Authored Zylinder mit Seiten-Quads und Kappentriangeln |
| `fillableVolume.ts` | **BEHALTEN** | GLB-Morphcontroller für volumenrichtige Füllstände |
| `loftBoard.ts` | **OFFEN** | Detaillierte und einfache Flächenreihen mit gemischten Kappen |
| `profiledCavity.ts` | **BEREINIGT** | Profilinterpolation und exakte Volumenberechnung; alte Mesh-Extraktion entfernt |
| `profiledSolid.ts` | **BEHALTEN** | Profilspannen über axialProfileSolid zusammensetzen |
| `seamedPlankExtrusion.ts` | **OFFEN** | Holz-/Nahtrelief-Algorithmus mit gemeinsamer Längsabnahme |
| `sectionsBetweenPlanes.ts` | **BEHALTEN** | Profilenden an zwei tatsächlichen Ebenen schneiden |
| `sweepSection.ts` | **BEHALTEN** | Catmull-Rom-Sweep als Komposition des allgemeinen Sweeps |

### `geometry/definitions/` (1)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `geometry.ts` | **BEHALTEN** | Kontur-, Profil-, Querschnitt-, Kontakt- und Pfadverträge |

### `geometry/edit/` (12)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `bevelArticulatedChain.ts` | **BEHALTEN** | Mehrsegmentige konvexe Kantenketten fasen |
| `bevelEdges.ts` | **BEHALTEN** | Übergreifender selektiver Bevel-Einstieg |
| `bevelOpenEdge.ts` | **BEHALTEN** | Einzelne offene ausgewählte Kante fasen |
| `booleanSolids.ts` | **BEHALTEN** | Manifold-basierte Boolesche authored Solids |
| `clipContour.ts` | **BEHALTEN** | Concave Profile/Holes gegen Halbebene schneiden |
| `cutThrough.ts` | **BEHALTEN** | Zwei passende Öffnungen mit realem Tunnel verbinden |
| `geometryEdits.ts` | **BEHALTEN** | Immutable Transform, Deformation und UV-Offsets |
| `patchOpening.ts` | **BEHALTEN** | Chartgestützte Öffnungen und Vertiefungen |
| `reconstructPatchQuads.ts` | **BEHALTEN** | Geeignete Dreieckspaare zu authored Quads rekonstruieren |
| `shapeSurfaceRelief.ts` | **BEHALTEN** | Mehrere Reliefmerkmale über einem Patch gemeinsam einarbeiten |
| `splitByPlane.ts` | **BEHALTEN** | Mesh/Volumen durch Ebene trennen |
| `subdivideEdges.ts` | **BEHALTEN** | Kantensegmente topologisch mit gemeinsamem Vertexteilen unterteilen |

### `geometry/kernel/` (7)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `GeometryOperationError.ts` | **BEHALTEN** | Strukturierter Geometriefehler |
| `GeometryResult.ts` | **BEHALTEN** | Owned Snapshots, Regions und Selektion-IDs |
| `index.ts` | **BEHALTEN** | Öffentliche Operationsexporte; ausdrücklich erlaubte Barrel-Ausnahme |
| `precision.ts` | **BEHALTEN** | Präzisionspolitik und affine Transformvalidierung |
| `selectionLifecycle.ts` | **BEHALTEN** | Lebensdauer und Übertragung von Boundary- und Patchselektionen |
| `topology.ts` | **BEHALTEN** | Topologieindex auf authored Vertices/Faces |
| `triangulation.ts` | **BEHALTEN** | Gemeinsame Tessellation für Query und Render |

### `geometry/materials/` (2)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `classifyAuthoredFaces.ts` | **BEHALTEN** | Material-/Regionsklassifikation vor dem Rendern |
| `tintVertices.ts` | **BEHALTEN** | Renderadapter für exportierbare Vertex-Tönung |

### `geometry/mesh/` (5)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `AuthoredMeshBuilder.ts` | **BEHALTEN** | Bewusstes Welding beim Konstruieren authored Flächen |
| `MeshData.ts` | **BEHALTEN** | Kanonische authored Vertices, Quads, Dreiecke |
| `controlOutline.ts` | **BEHALTEN** | Quad-View-Konstruktionskanten aus authored Snapshot |
| `surfaceMesh.ts` | **BEHALTEN** | Materialadapter von GeometryResult zu Three.Mesh |
| `toBufferGeometry.ts` | **BEHALTEN** | Einziger Renderer-Compiler samt Provenienz |

### `geometry/queries/` (10)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `cavitySectionsFromSurfaces.ts` | **BEHALTEN** | Hohlraumsektionen aus getrennten authored Innenflächen |
| `findFacingPatch.ts` | **BEHALTEN** | Zusammenhängende endliche Kontaktpatches ermitteln |
| `finiteFootprint.ts` | **BEHALTEN** | Vollständige endliche Polygonauflage prüfen |
| `fitBetweenSurfaces.ts` | **BEHALTEN** | Querschnitt zwischen zwei endlichen Kontakten einpassen |
| `fitBoundary.ts` | **BEHALTEN** | Owned Rand an realer gekrümmter Zielfläche einpassen |
| `pairedWallTriangles.ts` | **BEHALTEN** | Eindeutige Dreieckspaare bei Wandsektionen rekonstruieren |
| `raycastSurface.ts` | **BEHALTEN** | Raycast auf authored triangulierten Flächen |
| `surfaceClearance.ts` | **BEHALTEN** | Endliche Dreiecksabstände und Durchdringungen |
| `surfaceTriangles.ts` | **BEHALTEN** | Gemeinsame Face-Triangulation im Weltkoordinatensystem |
| `verifyExteriorPlacement.ts` | **BEHALTEN** | Ausrichtung einer Platzierung relativ zur Oberfläche prüfen |

### `geometry/topology/` (4)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `adaptiveStations.ts` | **BEHALTEN** | Deterministische Abnahme mit beobachtetem Fehler |
| `contourSampling.ts` | **BEHALTEN** | Konturmessung und Stationszuordnung |
| `contours.ts` | **BEHALTEN** | Konturbereinigung, Winding, gemeinsame Stationen |
| `stitchPolylines.ts` | **BEHALTEN** | Ungleiche Randpolylinien ohne erfundene Punkte vernähen |

### `geometry/uv/` (2)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `boxUVsInMeters.ts` | **ENTFERNT** | Alte direkte GPU-UV-Mutation einer THREE.BoxGeometry; ohne Verbraucher |
| `projectAuthoredUvs.ts` | **BEHALTEN** | Nichtmutierende Projektion authored UV-Ecken |

### `shapes/operations/` (2)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `cleanClosedContour.ts` | **ENTFERNT** | Reiner Weiterleitungsadapter zur gemeinsamen cleanContour2 |
| `clipConvexPolygon.ts` | **BEHALTEN** | Niedrigstufiges konvexes Clipping und Partition |

### `shapes/primitives/` (4)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `polygon.ts` | **BEHALTEN** | Allgemeiner Polygon-Grundriss |
| `rectangle.ts` | **BEHALTEN** | Rechteck-Kontur |
| `ring.ts` | **BEHALTEN** | Annulare Kontur |
| `roundedRectangle.ts` | **BEHALTEN** | Rechteck mit Radiuskontur |

### `shapes/profiles/` (7)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `bulged.ts` | **BEHALTEN** | Allgemeines bauchiges Konturfeld |
| `edgeRecess.ts` | **BEHALTEN** | Geometrische Stoß-/Randvertiefungsprofile |
| `facetedDiamondOutline.ts` | **BEHALTEN** | Wiederverwendbarer facettierter Profilgrundriss |
| `linearProfile.ts` | **BEHALTEN** | Stückweise lineare Profilinterpolation |
| `mirrorStations.ts` | **BEHALTEN** | Axialstationen spiegeln |
| `monotoneProfile.ts` | **BEHALTEN** | Monotone Profilinterpolation |
| `profileSpans.ts` | **BEHALTEN** | Profilabschnitte zusammensetzen |

### `spatial/anchors/` (1)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `anchors.ts` | **BEHALTEN** | Benannte Ankerobjekte und Lookup |

### `spatial/frames/` (2)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `contactFrame.ts` | **BEHALTEN** | Rechtshändigen endlichen Kontaktframe aus Fläche erzeugen |
| `frames.ts` | **BEHALTEN** | Lokale/Welt/Ancestor-Frame-Umrechnungen |

### `spatial/layout/` (4)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `coherentVariation.ts` | **BEHALTEN** | Räumlich kohärente deterministische Variation |
| `positionsFromEnds.ts` | **BEHALTEN** | Positionsverteilung von den Rändern |
| `seededVariation.ts` | **BEHALTEN** | Stateless deterministische Streuung |
| `weightedCuts.ts` | **BEHALTEN** | Gewichtete gemeinsame Teilungspositionen |

### `spatial/queries/` (1)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `bounds.ts` | **BEHALTEN** | Allgemeine Bounding-Box-Anfrage |

### `spatial/relationships/` (2)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `attachAtFrames.ts` | **BEHALTEN** | Einzige Transform-/Reparenting-Gleichung mit Zyklusprüfung |
| `attachByAnchor.ts` | **BEHALTEN** | Benannte Ankerauflösung und Half-Turn vor attachAtFrames |

### `texturing/` (5)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `bakePbrMaps.ts` | **BEHALTEN** | PBR-Texturbaking aus Oberflächenfeldern |
| `fields.ts` | **BEHALTEN** | Allgemeine skalare und Farb-Felder |
| `flowedGrainField.ts` | **BEHALTEN** | Periodisches Fließfeld als Materialkomposition |
| `periodicFlowField.ts` | **BEHALTEN** | Materialunabhängiges periodisches Koordinatenfeld |
| `tileableNoise.ts` | **BEHALTEN** | Deterministisches gekacheltes Rauschen |

### `units/` (1)

| Datei | Urteil | Tatsächliche Aufgabe / Phoenix-Zuordnung |
| --- | --- | --- |
| `length.ts` | **BEHALTEN** | Meterbasierte Maßeinheiten |

## Abschlussbedingungen und Stand

Die drei erkannten Altpfade wurden gezielt entfernt; kein Quell- oder Testverbraucher dieser API-Namen wurde im geprüften Bestand gefunden. **Die Migration ist nicht abschließend freigegeben.** Vier spezialisierte Konstruktionsdateien brauchen die oben bezeichneten kontraktbasierten Architekturentscheidungen, die veralteten 06/09-Vertragstexte einen Soll-Ist-Abgleich und die tatsächliche Ausführung von Typecheck/Tests/GLB nach den Änderungen ist hier nicht nachgewiesen.

Das Audit ist eine vollständige **Datei-Inventur mit begründeter Zuständigkeit**, kein Beweis, dass jede geometrische Randbedingung in allen 105 Implementierungen korrekt ist. Neue Entscheidungen müssen anhand konkreter Querschnitts-, Topologie-, UV- und Verbraucherbefunde getroffen werden. Ohne diesen Nachweis weder „Phoenix fertig“ behaupten noch zusätzliche Dateien blind löschen.
