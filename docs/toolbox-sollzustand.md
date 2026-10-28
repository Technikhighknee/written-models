# written-models: Soll-Zustand der Toolbox

> **Status: ENTWURF – NICHT FREIGEGEBEN**
>
> Dieses Dokument ist eine gemeinsame, veränderbare Spezifikation, **kein Implementierungsauftrag**.
> Es wird über mehrere Gespräche überarbeitet. **Keine Architekturänderung und keine
> Umsetzung**, bevor die ausdrückliche Freigabe erfolgt („Ja, so ist ok“).
>
> **Ausgangsstand:** `main` @ `225734ff40ddc0492b3dc430eafd26073ab0f882` (28.10.2026).
> **Geltungsbereich:** Toolbox, ihre API und ihre Benutzung durch die Modelle.
> **Nicht das Ziel:** Die fertigen Modelle durch ein generisches Modell-Rezeptsystem ersetzen.

## 1. Der Zweck

`written-models` soll ein Werkzeugkasten für **Geometrie und geometrische Operationen**
sein – nicht eine Sammlung immer leistungsfähigerer Gegenstandsgeneratoren.

Ein neues Objekt soll durch **Komposition bestehender, gegenstandsunabhängiger
Fähigkeiten** entstehen. Wenn eine grundsätzlich neue geometrische Fähigkeit
gebraucht wird, wird sie so implementiert, dass sie unabhängig vom auslösenden
Modell verwendbar ist.

**Prüffrage für jede Toolbox-API:**

> Wenn das auslösende Modell verschwindet: Welche allgemeine geometrische
> Fähigkeit bleibt übrig, und für welche *andersartigen* Geometrien ist sie brauchbar?

„Kann man vielleicht auch beim nächsten Brett benutzen“ reicht nicht.

### Nicht verhandelbar

- **Kein gegenstandsspezifischer Geometrie-Algorithmus in der Toolbox.**
  Ein Brett, eine Fassdaube, ein Stuhl oder ein Metallrohr sind Modellentscheidungen,
  keine geometrischen Grundoperationen.
- **Operation vor Objekt.** Eine Operation beschreibt *was mit Geometrie passiert*,
  nicht *was der Gegenstand ist*.
- **Materialunabhängigkeit.** Holzmaserung, Metall, Keramik usw. dürfen keine
  Voraussetzung für Extrusion, Zuschnitt, Verbindung oder Deformation sein.
- **Topologie ist echte Konstruktionsinformation.** Originale Quads bleiben
  Original-Quads; tatsächlich notwendige Dreiecke bleiben Dreiecke. Keine
  nachträglich erratenen Quads oder Viewer-Tricks.
- **Geometrie wird geometrisch gelöst.** Passungen, Ausschnitte, Wandstärken
  und Verbindungen bestehen aus tatsächlichen Flächen und Kanten.
- **Modellautorenschaft bleibt erhalten.** Allgemeine Werkzeuge dürfen Formen,
  Proportionen und künstlerische Entscheidungen nicht vorgeben.
- **Kein Generalitäts-Theater.** Keine allmächtige Funktion mit endlosen
  Options, die intern wieder lauter Spezialfälle abhandelt.
- **Kein Algorithmusduplikat unter einem neuen Gegenstandsnamen.** Bereits
  vorhandene Fähigkeiten werden zuerst gefunden und kombiniert oder an der
  richtigen Ebene erweitert.

## 2. Was zur Toolbox gehört – und was nicht

| Gehört in die Toolbox | Gehört in Modell-/Rezept-Code außerhalb der Toolbox |
| --- | --- |
| Konturen, Querschnitte, Pfade, Frames und Koordinatentransformationen | „Ein Eichenbrett ist 4 cm stark und hier abgenutzt“ |
| Extrudieren, Lofting, Sweep, Rotation, Flächenaufbau | „Diese sechs Dauben bilden ein Fass“ |
| Geometrie aufteilen, schneiden, ausnehmen, zusammenfügen | „Die Sitzfläche besteht aus drei Bohlen“ |
| Wandstärken, Fasen, Abrundungen, Profile, Deformationen | „Ein Schwertgriff bekommt diesen Querschnitt und diese Krümmung“ |
| Kontaktflächen finden, Enden einpassen, Grenzen an Flächen anlegen | „Die Strebe verbindet genau diese beiden Stuhlbeine“ |
| Topologie, UV-Zuordnung, Oberflächenregionen, Validierung | Materialwahl, Materialfamilien, konkrete Farb- und Alterungsrezepte |
| Generische Anordnung, Verteilung, Variation, Platzierung | Konstruktion und Auswahl eines konkreten Gegenstands |

**Ausdrücklich:** `boardPanel()` ist **keine** geometrische Grundfähigkeit.
Die allgemeinen Operationen darin sollen separat verwendbar sein.
Ein späterer Gegenstands-Adapter außerhalb der Toolbox ist **keine Rechtfertigung**,
geometrische Logik in einem solchen Adapter zu verstecken: Er dürfte lediglich
bestehende Werkzeuge aufrufen und Modellentscheidungen treffen.

Auch scheinbar generische Namen wie `cutBoard()` lösen das Problem nicht,
wenn die Operation weiterhin ausschließlich für eine Brettgeometrie funktioniert.

## 3. Zielbild der Fähigkeiten (fachliche Schichten, noch KEIN Ordnerplan)

Die Reihenfolge bezeichnet Abhängigkeiten, nicht schon konkrete Dateien oder APIs.

1. **Geometrische Daten und Topologie:** vertices, edges/boundaries, echte
   Faces (Quads und Triangles), Surface-Regions, Semantik von UVs und
   Smoothing; kontrollierte Konvertierung zur Render-Geometrie.
2. **Geometrische Definitionen:** Punkte, Richtungen, Ebenen, Frames,
   Profile, geschlossene/offene Konturen, Pfade, Querschnitte,
   interpolierbare Felder und Maßeinheiten.
3. **Universelle Aufbauoperationen:** Extrude, Loft, Sweep, Revolve,
   Flächen zwischen Konturen/Querschnitten aufbauen, Hüllen und
   Wandstärken erzeugen. Eine Form wird über Eingabedaten definiert,
   nicht über „Brett“, „Rohr“ oder „Griff“.
4. **Universelle Bearbeitungsoperationen:** Teilen/Partitionieren,
   Schneiden/Ausnehmen, Fasen, Abrunden, Verformen, Kanten-/Flächenkonturen
   bearbeiten, auf gewünschte Detaildichte abtasten. Bestehende
   Topologie-/Oberflächeninformationen bleiben erhalten oder werden
   ausdrücklich und nachvollziehbar transformiert.
5. **Beziehungen und Kontakte:** Geometrie abfragen, Flächen/Bereiche
   bestimmen, entlang echter Geometrie einpassen, Enden zwischen
   Kontaktflächen zuschneiden, Grenzen an Ziele anpassen, Teile
   positionieren und ausrichten.
6. **Ausgabe und Darstellung:** Materialbereiche und UVs zuweisen,
   Meshes und Exportgeometrie ableiten, ohne den Ursprung der
   Konstruktionstopologie zu verlieren.

**Kein Zwang zu einer einzigen Implementierung pro Verb:** Eine planare
Verbindung und eine an eine gekrümmte Oberfläche angepasste Verbindung
können verschiedene Algorithmen benötigen. Ihre gemeinsamen Bausteine
und Schnittstellen sollen trotzdem konsistent sein. Nicht jede Operation
muss jede beliebige Topologie unterstützen; die tatsächlichen
Voraussetzungen und Grenzen müssen explizit sein.

## 4. Qualitäts- und API-Verträge

Die konkrete Form der Typen und Signaturen bleibt bis zur Freigabe offen.
Auf fachlicher Ebene gilt:

- **Konstruktionsdaten zuerst:** Kernoperationen sind, wo sinnvoll, auf
  authored geometry anwendbar, ohne vorher ein Render-Mesh erstellen
  oder Materialien festlegen zu müssen.
- **Vorhersehbare Eingaben und Ausgaben:** Koordinatenraum, Orientierung,
  Winding, Offene/Geschlossene Konturen, Normale, UV-Units und
  Materialregionen sind beschrieben.
- **Keine stillen Beschädigungen:** Ungültige oder nicht unterstützte
  Eingaben werden sichtbar abgewiesen, statt degenerierte Geometrie
  zu produzieren oder ein Problem mit Überlappungen zu verstecken.
- **Kompositionsfähigkeit:** Das Ergebnis einer Operation kann ohne
  spezialisierten Übersetzungscode Eingabe einer passenden anderen
  Operation sein.
- **Information erhalten:** Quads/Triangles, Boundary-Identität,
  Materialregionen und UVs gehen nicht ohne ausdrücklichen Grund verloren.
- **Unabhängig von Three.js-Rendering, soweit geometrisch sinnvoll:**
  Three.js-Vektoren können praktische Datentypen sein; geometrische
  Algorithmen sollen aber nicht von Materialinstanzen, Viewer oder GLB
  abhängig sein.
- **Ergebnisqualität ist nicht nur ein Testresultat:** Geometrische
  Korrektheit, nutzbare Topologie, tatsächliche Anschlüsse und sichtbares
  Modellresultat gehören zusammen.

## 5. Bestehender Code: was überprüft werden muss

Diese Zuordnung ist **eine Hypothese für die spätere Inventur**, kein
Beschluss zum Löschen, Verschieben oder Ersetzen. Keine API erhält
Bestandsschutz allein wegen ihres Namens.

| Kandidaten | Untersuchungsfrage |
| --- | --- |
| `MeshData`, `AuthoredMeshBuilder`, `toBufferGeometry`, `surfaceMesh` | Wie bleibt authored geometry über alle Operationen hinweg die Quelle der Wahrheit? Wo ist die Grenze zu Rendering? |
| `loftRings`, `loftSections`, `loftBoard`, `loftAxialProfile` | Welche Loft-Mechanik ist gemeinsam? Was ist echte unterschiedliche Topologie, was nur ein objektspezifisches Eingabeformat? |
| `sweepSection`, `extrude`, `revolveShell`, `latheMeridian` | Gemeinsame Querschnitt-/Kontur- und Pfadkonzepte? Wo werden unnötig Render-Geometrien produziert? |
| `straightBoard`, `profiledBoard`, `boardPanel`, `cutBoard` | Welche allgemeinen Fähigkeiten für Profile, Teilung, Zuschnitt, Ausschnitte, Fugen und Variationen stecken darin? |
| `circularPlankPanel`, `seamedPlankExtrusion` | Welche allgemeinen Fähigkeiten für Partitionierung, benachbarte Kanten, Fugen, Verschleiß und adaptive Topologie sind darin eingeschlossen? |
| `radialStripLayout`, `radialStaves`, `bandAroundProfile` | Was ist universelle radiale Anordnung/Flächenkonstruktion, was ist Dauben-/Band-Rezept? Warum gibt ein Layout bereits `BoardSection` zurück? |
| `beams`, `timber`, `sectionsBetweenPlanes`, `beamBetweenPlanes` | Wie wird der generische Zuschnitt eines beliebigen Profils auf reale Kontakte angewandt, ohne Holz/Balken-Vokabular vorauszusetzen? |
| `supportFacePlane`, `fitBetweenSupports`, `fitBoundaryToSurface`, `MeshSurfaceQuery`, `contactFrame` | Welche universellen Query-/Kontakt-/Fitting-Bausteine sind tatsächlich getrennt? Wie gehen planare und gekrümmte Ziele damit um? |
| `attachByAnchors`, `attachByFrames` | Welche Transformations- und Sicherheitslogik wird doppelt geführt? |
| `assignMaterialsByNormal`, `classifyExtrudedSurfaces`, `surfaceMesh` | Einheitlicher Umgang mit Surface-Regions und Materialzuordnung vor/nach Render-Konvertierung? |
| `turnedVessel`, `profiledCavity`, `fillableVolume` | Was sind generische Konstruktion, Volumenberechnung und Deformation? Was ist Anwendungslogik eines Gefäßes bzw. Flüssigkeitsfüllstands? |
| `models/components/oakSeating.ts`, `trestleSupport.ts`, `table.ts`, `tavernChair.ts` | Verstecken Modelle oder Rezept-Helper allgemeine Geometriealgorithmen, die in die Toolbox gehören? |

**Zusätzlicher Architektur-Befund:** Schon heute gibt es zwei
unterschiedliche Richtungen von Imports:
`geometry/construction` benutzt `shapes/operations`, während
`shapes/operations/revolveShell` seinerseits
`geometry/construction/latheMeridian` benutzt. Die angestrebte
Abhängigkeitsrichtung muss ausdrücklich definiert werden.

## 6. Abnahme: Woran wir die neue Toolbox messen

Nicht an der Zahl der Funktionen, Dateien oder abstrahierten Klassen.

- Dieselbe Grundoperation kann an einem **Holzbrett**, einem **Metallrohr**
  und einem **andersartigen Profilkörper** sinnvoll verwendet werden,
  sofern deren geometrische Voraussetzungen erfüllt sind.
- Ein Zuschnitt zwischen zwei Flächen ist keine Stuhl-, Tisch- oder
  Holzoperation; mindestens zwei verschiedene Modelle können denselben
  Fitting-Pfad nutzen, ohne ihn lokal erneut zu implementieren.
- Ausschnitte, Fugen, Partitionierung oder Veränderungen am Querschnitt
  sind nicht fest an eine Gegenstandskategorie gebunden.
- Ein neuer Modelltyp zwingt uns nicht zur Neuentwicklung vorhandener
  geometrischer Operationen.
- Die Modelle behalten ihre Gestaltung und ihre gültigen Ergebnisse:
  Tisch, Fass, Brett, Schleifpapier, Dolch, Bierkrug, Bank und Stuhl
  sollen weder still beschädigt noch nur noch mit Render-Hacks
  darstellbar sein.
- Quad View und GLB/Godot-Export erhalten die für sie relevanten
  konstruktiven und materiellen Informationen.
- Eine unbekannte zukünftige Modellidee kann durch Sichtung eines
  **fachlich gegliederten Fähigkeitskatalogs** vorbereitet werden,
  ohne dass man zuerst nach ähnlichen Gegenstandsnamen suchen muss.

**Gegenprobe:** Wenn die angeblich generische Operation einen Namen wie
`board`, `barrel`, `timber` oder eine Materialannahme als unabdingbare
Voraussetzung benötigt, ist ihre Abstraktion erneut zu prüfen.

## 7. Entscheidungspunkte – noch offen

Diese Fragen müssen vor Umsetzung beantwortet werden; nicht beiläufig
während eines Refactors:

- [ ] Fachliche Schichten und ihre Abhängigkeitsrichtung festlegen.
- [ ] Einheitliche beziehungsweise bewusst getrennte Rückgabeformate
      für authored geometry, Render-Geometrie und fertige Objekte bestimmen.
- [ ] Grenzen der generischen Operationen definieren: Was gilt für
      beliebige Profile, geschlossene Körper, Hohlkörper und gekrümmte Flächen?
- [ ] Regeln für Surface-Regions, Grenzen, Materialzuordnung und UV-Erhalt festlegen.
- [ ] Umgang mit existierenden Spezialkonstruktoren beschließen:
      geometrische Logik extrahieren, dann Rezepte verschieben/auflösen.
- [ ] Regeln für Migration und Qualitätssicherung beschließen:
      wie wir alte Modelle überprüfen, ohne Tests um der Tests willen zu bauen.
- [ ] Den Soll-Zustand ausdrücklich freigeben.

**Freigabestatus:** `NICHT FREIGEGEBEN`.
Die letzte Checkbox wird erst nach einer ausdrücklichen Bestätigung des
Nutzers abgehakt.

## 8. Umsetzungs-Checkliste – gesperrt bis zur Freigabe

> **Wichtig:** Alle Kästchen beginnen leer. `[x]` bedeutet *tatsächlich
> implementiert, integriert und geprüft*, nicht nur „geplant“.
> Eine Änderung ist erst abgeschlossen, wenn die betroffenen Modelle
> weiterhin funktionieren und die neue Fähigkeit wiederverwendbar ist.
> Bei der Umsetzung sollen erledigte Einträge mit dem zugehörigen Commit
> versehen werden. Weitere konkrete Aufgaben werden nach der Freigabe ergänzt.

- [ ] **0. Baseline:** Bestehende Fähigkeiten, Verbraucher, API-Grenzen und
      sichtbare Modelldarstellung vollständig dokumentieren.
- [ ] **1. Zielarchitektur:** Fachliche Abhängigkeiten und API-Verträge
      festlegen und im Repo nachvollziehbar machen.
- [ ] **2. Geometrischer Kern:** Gemeinsame Datenformate, Konturen,
      Querschnitte, Faces, Grenzen und Operationsergebnisse konsolidieren,
      soweit die Bestandsaufnahme einen Bedarf nachweist.
- [ ] **3. Aufbauoperationen:** Gegenstandsspezifische
      Extrude-/Loft-/Sweep-/Revolve-Varianten auf wiederverwendbare
      geometrische Operationen zurückführen.
- [ ] **4. Bearbeitungsoperationen:** Allgemeine Partitionierung,
      Fugen-/Ausschnittgeometrie, Profiländerungen und Deformationen
      von Brett-/Dauben-/Gefäßcode trennen.
- [ ] **5. Kontakte und Montage:** Queries, Kontaktflächen,
      Grenzanpassung und Zuschnitte als miteinander kombinierbare,
      material- und gegenstandsunabhängige Fähigkeiten bereitstellen.
- [ ] **6. Rendergrenze:** Authoring-Topologie, UVs, Surface-Regions,
      Materialien und Export konsistent verbinden.
- [ ] **7. Modelle migrieren:** Alle acht Modelle gegen die neue
      Toolbox-Komposition prüfen; keine versteckten Duplikatalgorithmen
      in Modell-Rezepten behalten.
- [ ] **8. Gegenproben:** Unterschiedliche Geometrien mit denselben
      Fähigkeiten bauen/bearbeiten und ihre Quad-/Export-Ergebnisse
      ansehen; nur wertvolle, dauerhafte Invarianten automatisiert absichern.
- [ ] **9. Aufräumen:** Überholte Schnittstellen entfernen,
      Fähigkeitskatalog aktualisieren und abgeschlossene Arbeit mit
      konkreten Commits dokumentieren.

## 9. Arbeitsprotokoll für dieses Dokument

- **Bis zur Freigabe:** Dieses Markdown ist die einzige beabsichtigte
  Änderung zum Umbau. Vorschläge und Einwände ändern zuerst das Dokument,
  nicht die Architektur oder Modellimplementierung.
- **Bei jeder Überarbeitung:** Hier die offenen Entscheidungen und
  Checklisten aktuell halten, Widersprüche beseitigen, unverbindliche
  Annahmen nicht stillschweigend in beschlossene Anforderungen verwandeln.
- **Nach Freigabe:** Kleine nachvollziehbare Schritte statt eines
  unkontrollierbaren Komplettumbaus. Fortschritt in Abschnitt 8 markieren,
  mit Commit-SHA belegen. Der sichtbare Erfolg an den Modellen zählt.
- **Ende:** Dieses Dokument ist bewusst temporär. Ob es nach Abschluss
  archiviert oder entfernt wird, ist eine spätere Entscheidung.

### Änderungen am Entwurf

| Datum | Änderung | Status |
| --- | --- | --- |
| 2026-10-28 | Erste Fassung des Soll-Zustands und der Umsetzungsliste | Zur Diskussion |
