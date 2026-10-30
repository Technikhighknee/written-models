# Phoenix — vollständiger Toolbox-Soll-Ist-Abgleich

Stand: 30.10.2026. Ausgangsbasis: `main` @ `d18b2241fe4533bc71ffa90e1c544aa644f86879` (105 TypeScript-Dateien unter `src/toolbox/`, 706150 Bytes). Der Git-Tree war nicht abgeschnitten. Dieses Audit bezieht sich auf genau diesen Bestand; entfernte Dateien bleiben in der Ausgangsmatrix sichtbar.

## Leseschlüssel und Nachweisgrenzen

- **BEHALTEN** = Die Implementierung hat eine konkret benennbare, im Phoenix-Plan vorgesehene eigene Verantwortung. Dies ist eine Prüfung der Quelltexte, Importbeziehungen und der Architekturzuordnung, **kein Beweis vollständiger Laufzeitkorrektheit**.
- **BEREINIGT** = Die Datei bleibt; ein nachweislich ersetzter zweiter Algorithmus wurde daraus entfernt.
- **ENTFERNT** = Aus der Ausgangsbasis tatsächlich entfernt, nachdem die aktuelle Quelltext-/Test-Verbraucherprüfung keinen benötigten Gebrauch zeigte und eine Phoenix-Operation denselben Aufgabenbereich bedient.
- **OFFEN** = Die Einordnung einer Ausgangsdatei war zum Inventurzeitpunkt ungeklärt; diese vier Entscheidungen sind inzwischen getroffen und in der Ausgangsmatrix als **ENTFERNT** ausgewiesen.

Geprüfte Quellen: alle 13 Phoenix-Dokumente plus README, `docs/ARCHITECTURE.md`, die 105 Toolbox-TypeScript-Dateien, sämtliche 29 weiteren TypeScript-Dateien in `src/` und die 49 Test-/Support-MJS-Dateien auf explizite Verbraucher der bereinigten APIs. Die Dateimatrix erfasst Funktionen und Verantwortlichkeiten; sie ersetzt keinen Godot-/GLB-Sichttest und keinen ausführbaren Typecheck. Diese wurden im Rahmen **dieses** Audits nicht ausgeführt.

## Konkrete Migrationseingriffe

1. `shapes/operations/cleanClosedContour.ts` war nur ein Aufruf von `geometry/topology/contours.ts::cleanContour2`, sogar als Erhalt der alten Shapes-API kommentiert. Der einzige Import im aktiven `src/` war `geometry/construction/sweepSection.ts`: direkt auf `cleanContour2` umgestellt, Adapter gelöscht. Die geometrische Operation bleibt erhalten.
2. `geometry/uv/boxUVsInMeters.ts` änderte `THREE.BoxGeometry`-UV-Attribute direkt und wurde im aktiven `src/` nicht importiert. Das ist nicht die authored-UV-Pipeline. `boxMesh` liefert physikalische UVs aus authored Quads, `projectAuthoredUvs` die allgemeine UV-Projektion. Das renderseitige Altmodul wurde entfernt. Die Aussage in 06 („keep general physical UV projection“) bleibt damit **funktional**, nicht dateinamentreu, erfüllt.
3. `geometry/construction/profiledCavity.ts::cavityFromMeshSurfaces` rekonstruierte Ringe noch einmal über quantisierte Punkt-/Kanten-Maps. Kein aktiver Quell- oder Testverbraucher wurde gefunden. `queries/cavitySectionsFromSurfaces` ist der neue spezifizierte Extraktionspfad; `ProfiledCavity` bleibt für Querschnitts-/Volumeninterpolation erhalten. Nur die veraltete Zweitextraktion wurde entfernt.

## Abgearbeitete Architekturgrenzen

| Pfad | Ersatz / getroffene Architekturentscheidung | Konsequenz |
| --- | --- | --- |
| `geometry/construction/loftBoard.ts` | `build/loftPairedSurfaceRows.ts` verbindet unabhängige Zeilen über `loftSideQuads` und generisches `bridgeBoundaries`. | Alte API und privater Cap-Stitcher entfernt; dieselbe Operation dient Brett, Stuhl und Fassdaube. |
| `geometry/construction/cutBoard.ts` | Stuhl erstellt seine eigenen Zell-/Zapfenanordnungen aus `layeredGridSolid`. | Kein Brett-Zapfenalgorithmus mehr in der allgemeinen Toolbox. |
| `geometry/construction/seamedPlankExtrusion.ts` | `cooperedHead` kombiniert jetzt Konturpartition und `extrudeContour`. | Alter unabhängiger Meshgenerator entfernt; bisherige Reliefdetails nicht mit einem zweiten Algorithmus gerettet. |
| `geometry/construction/bandAroundProfile.ts` | `models/components/forgedBand.ts` wählt Eisenprofil und Clearance und nutzt `build/sweepSection`. | Kein eigenes Bandmeshing in der Toolbox mehr. |

### Abgegrenzte ähnliche Namen (keine erwiesene Doppelimplementierung)

- `build/loftSideQuads` ist der geteilte Quad-Strip-Kern, `build/loftSectionWalls` die owned Section-/Boundary-Schicht; die Henkelkurve gehört zu `models/components/tankardHandle.ts`, das direkt `build/sweepSection` verwendet.
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

Neuer generischer Bestandteil: `geometry/build/loftPairedSurfaceRows.ts` (für die aktuelle Datei-Inventur zusätzlich zu den 105 Ursprungsdateien).

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
| `bandAroundProfile.ts` | **ENTFERNT** | Profilfolgende Bänder mit Clearance; spezialisiertes vollständiges Sweep-Rezept |
| `boxMesh.ts` | **BEHALTEN** | Authored Box-Quads samt UVs statt BoxGeometry-Rückkonvertierung |
| `cutBoard.ts` | **ENTFERNT** | Brett-/Zapfenausschnitt-Rezept über layeredGridSolid |
| `cylinderMesh.ts` | **BEHALTEN** | Authored Zylinder mit Seiten-Quads und Kappentriangeln |
| `fillableVolume.ts` | **BEHALTEN** | GLB-Morphcontroller für volumenrichtige Füllstände |
| `loftBoard.ts` | **ENTFERNT** | Detaillierte und einfache Flächenreihen mit gemischten Kappen |
| `profiledCavity.ts` | **BEREINIGT** | Profilinterpolation und exakte Volumenberechnung; alte Mesh-Extraktion entfernt |
| `profiledSolid.ts` | **BEHALTEN** | Profilspannen über axialProfileSolid zusammensetzen |
| `seamedPlankExtrusion.ts` | **ENTFERNT** | Holz-/Nahtrelief-Algorithmus mit gemeinsamer Längsabnahme |
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

## Nachprüfung aller 19 Modell-TypeScript-Dateien

Die Modell- und Komponenten-Dateien wurden am 30.10.2026 erneut auf alte
Geometrie- und Renderingpfade geprüft. Bereinigt wurden:

- `models/table.ts`: Kontaktgeometrie wird nicht länger aus gerenderten
  `THREE.Mesh`-Objekten mittels `getControlResult()` zurückgelesen. Fuß,
  Pfosten, Streben und Längsverbindung werden als authored Bauteile berechnet,
  bevor ein einziges Mesh gerendert wird.
- `models/components/trestleSupport.ts`: Die alte Renderfactory
  `createTrestleSupport()` samt `TrestleTimberFactory` ist entfernt.
  `trestleTimbers()` liefert weiterhin die modellabhängige Schnittliste.
- `models/components/oakSeating.ts`: Unbenutzte `OakTimberShop.timber()`-
  API entfernt; die Materialzusammensetzung verarbeitet fertige authored
  `TableTimberGeometry`.
- `models/components/tankardHandle.ts`: Die Catmull-Rom-Kurve und die
  Henkelkontur sind Modellentscheidungen; der allgemeine Sweep erzeugt
  die Geometrie direkt. Die ehemalige Toolbox-Komposition
  `geometry/construction/sweepSection.ts` ist entfernt.
- `models/sandingpaper.ts`: Die Bodenplatzierung wird unmittelbar aus
  den authored Vertex-Positionen berechnet, nicht mehr aus dem
  `THREE.BufferGeometry.boundingBox` des Renderers.

Andere Bauteile verwenden bereits die gemeinsamen Geometrieoperationen
oder definieren ausschließlich modellabhängige Formen und Materialien.
Die Existenz spezifischer Modellrezepte allein ist kein Altcode-Befund.
Eine erneute Godot-Sichtabnahme ist unabhängig vom erfolgreichen
Typecheck/Tests/Build erforderlich, um die Bildqualität zu beurteilen.

## Einmalige integrierte Ausführungsprüfung

Am 30.10.2026 wurden die tatsächlichen Konstruktionsfunktionen der acht
registrierten Modelle aufgerufen. Alle geprüften Teile ließen sich als
`GeometryResult` mit authored Flächen erzeugen und zeigten keine
unbeabsichtigten offenen Topologiegrenzen.

In einer zweiten einmaligen Prüfung wurden alle acht vollständigen
Modelle einschließlich ihrer Materialien mit einem ersatzweisen
Canvas-2D-Kontext konstruiert und mit `prepareRuntimeModel()` auf
einen Runtime-Bestand abgebildet:

| Modell | Quell-Meshes | Runtime-Meshes | Atlas-Seiten |
| --- | ---: | ---: | ---: |
| Tisch | 15 | 1 | 1 |
| Fass | 50 | 3 | 1 |
| Schleifpapier | 1 | 2 | 0 |
| Holzplanke | 1 | 1 | 1 |
| Dolch | 3 | 3 | 2 |
| Bierkrug | 17 | 3 | 1 |
| Stuhl | 32 | 1 | 1 |
| Bank | 22 | 1 | 1 |

Der Bierkrug bestand zudem einen Set/Get-Durchlauf seines
Füllstandscontrollers. Dass Schleifpapier mehr Runtime-Meshes besitzt
als Quell-Meshes, ist eine erlaubte Material-Batch-Aufteilung, kein
Verlust von Geometrie.

Die zugehörigen einmaligen Prüfungen liefen in GitHub Actions
erfolgreich und wurden anschließend gemäß `docs/TESTING.md`
aus `tests/temporary/` entfernt. Die Prüfungen ersetzen weder
einen echten browserseitigen GLB-Download noch die Godot-Sichtabnahme;
der Canvas-Kontext erzeugte keine realen Bilddaten.

## Abschlussbedingungen und Stand

Die sieben aus dem Ausgangsbestand entfernten Spezial-/Altpfade besitzen keine Quell- oder Testverbraucher mehr. Hinzugekommen ist die generische Operation `geometry/build/loftPairedSurfaceRows.ts`: aus 105 Ausgangsdateien wurden 99 aktuelle Toolbox-TypeScript-Dateien. Die vier zunächst ungeklärten Spezialkonstruktionen sind architektonisch entschieden. Typecheck, Tests und Build werden über den Verify-Workflow geprüft. Eine erneute Sichtabnahme im Zielrenderer ist durch diese Quellmigration nicht behauptet.

Das Audit ist eine vollständige **Datei-Inventur mit begründeter Zuständigkeit**, kein Beweis, dass jede geometrische Randbedingung in allen 105 Implementierungen korrekt ist. Neue Entscheidungen müssen anhand konkreter Querschnitts-, Topologie-, UV- und Verbraucherbefunde getroffen werden. Ein sichtbares Qualitätsurteil über die geänderten Modelle erfordert eine neue Abnahme; das Vorhandensein alter APIs ist dagegen kein akzeptierter Grund, ihre Implementation zu behalten.
