import "./style.css";

import { models } from "./models";
import { resolveRoute } from "./core/router";
import { ModelViewer } from "./core/ModelViewer";
import type { CameraView } from "./core/ModelViewer";
import { mountModelPreviews } from "./core/modelPreviews";
import { exportGlb } from "./core/exportGlb";

const app = requireElement<HTMLElement>("#app");
const route = resolveRoute(window.location.pathname);

type ViewMode = "shaded" | "triangles" | "quads";
type IconName = keyof typeof iconPaths;

const iconPaths = {
    cube: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
    camera: '<path d="M14 4h-4l-2 3H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4l-2-3Z"/><circle cx="12" cy="13" r="3"/>',
    focus: '<circle cx="12" cy="12" r="3"/><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3m-5 13h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    layers: '<path d="m12 2 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 17l9 5 9-5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 4h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    rotate: '<path d="M3 11a9 9 0 1 1 2 6m-2 4v-7h7"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    terminal: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="m6 9 4 3-4 3m7 0h5"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    mouse: '<rect x="5" y="2" width="14" height="20" rx="7"/><path d="M12 2v8m-7 0h14"/>',
    external: '<path d="M14 3h7v7m0-7-9 9"/><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>',
} as const;

function icon(name: IconName, size = 18): string {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;",
        '"': "&quot;", "'": "&#39;"
    })[character]!);
}

function requireElement<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Required element not found: ${selector}`);
    return element;
}

function logo(): string {
    return `<span class="brand-mark">${icon("cube", 22)}</span>
        <span class="brand-type"><strong>written<span class="brand-dot">.</span>models</strong><small>CODE IS THE PENCIL</small></span>`;
}

function formatCount(count: number): string {
    return count.toLocaleString("en-US");
}

function formatDimension(meters: number): string {
    return meters >= 1 ? `${meters.toFixed(2)} m` : `${(meters * 100).toFixed(1)} cm`;
}

if (route.type === "home") {
    document.title = "Written Models — Code is the pencil";
    app.innerHTML = `
        <header class="site-header">
            <a class="brand" href="/" aria-label="Written Models home">${logo()}</a>
            <span class="header-caption"><span class="live-dot"></span> INDEPENDENT 3D WORKSHOP</span>
            <a class="header-link" href="#collection">THE COLLECTION ${icon("arrow", 16)}</a>
        </header>
        <main class="home-content">
            <section class="hero">
                <div class="hero-copy">
                    <div class="section-kicker"><span class="kicker-rule"></span> A STUDY IN DIGITAL CRAFT</div>
                    <h1>Not dragged.<br><em>Written.</em></h1>
                    <p>3D objects, composed by hand in TypeScript. No modeling UI between the idea and the geometry.</p>
                    <a href="#collection" class="hero-cta">Explore the models ${icon("arrow", 18)}</a>
                </div>
                <div class="hero-art" aria-hidden="true">
                    <div class="hero-orbit hero-orbit-one"></div>
                    <div class="hero-orbit hero-orbit-two"></div>
                    <div class="hero-glyph">{ <span>3D</span> }</div>
                    <span class="hero-art-label top">X — 01 / Y — 01 / Z — 01</span>
                    <span class="hero-art-label bottom">GEOMETRY IS A LANGUAGE.</span>
                </div>
            </section>
            <section id="collection" class="collection-section">
                <div class="collection-heading">
                    <div>
                        <p class="section-kicker">01 / THE COLLECTION</p>
                        <h2>Objects of intention<span class="accent-punctuation">.</span></h2>
                        <p class="section-subtitle">Every model starts as a problem worth solving.</p>
                    </div>
                    <div class="collection-tools">
                        <label class="search-field">${icon("search", 17)}<input id="model-search" type="search" placeholder="Find a model" aria-label="Search models" autocomplete="off"></label>
                        <span id="collection-count" class="collection-count">${String(models.length).padStart(2, "0")} OBJECTS</span>
                    </div>
                </div>
                <div class="asset-grid" id="asset-grid">
                    ${models.map((model, index) => `
                        <a class="asset-card" href="/${encodeURIComponent(model.slug)}" data-search="${escapeHtml(`${model.title} ${model.description} ${model.slug}`.toLowerCase())}">
                            <div class="asset-visual" data-preview="${escapeHtml(model.slug)}">
                                <div class="preview-grid"></div>
                                <span class="asset-index">${String(index + 1).padStart(2, "0")} / ${String(models.length).padStart(2, "0")}</span>
                                <div class="preview-fallback">${icon("cube", 52)}</div>
                                <span class="asset-format">THREE.JS <span class="separator-dot"></span> GLB</span>
                            </div>
                            <div class="asset-info"><div><h3>${escapeHtml(model.title)}</h3><p>${escapeHtml(model.description)}</p></div><span class="asset-open" aria-hidden="true">${icon("arrow", 21)}</span></div>
                        </a>
                    `).join("")}
                </div>
                <div class="empty-results" id="empty-results" hidden>No models found. Try a different search.</div>
            </section>
            <section class="manifesto-strip">
                <div><span class="section-kicker">THE METHOD</span><h2>Build the tool.<br>Then build the thing.</h2></div>
                <p>Models teach the toolbox. The toolbox makes the next model possible. One capability at a time.</p>
                <span class="manifesto-symbol" aria-hidden="true">{ }</span>
            </section>
        </main>
        <footer class="site-footer"><span>© WRITTEN MODELS</span><span>HANDMADE IN CODE · EXPORTED TO REALITY</span><a href="https://github.com/Technikhighknee/written-models" target="_blank" rel="noopener noreferrer">SOURCE ${icon("external", 14)}</a></footer>
    `;

    const search = requireElement<HTMLInputElement>("#model-search");
    const cards = [...document.querySelectorAll<HTMLElement>(".asset-card")];
    const count = requireElement<HTMLElement>("#collection-count");
    const empty = requireElement<HTMLElement>("#empty-results");

    search.addEventListener("input", () => {
        const query = search.value.trim().toLowerCase();
        let visible = 0;

        for (const card of cards) {
            const matches = (card.dataset.search ?? "").includes(query);
            card.hidden = !matches;
            if (matches) visible++;
        }

        count.textContent = `${String(visible).padStart(2, "0")} OBJECTS`;
        empty.hidden = visible > 0;
    });

    mountModelPreviews(models);
} else if (route.type === "model") {
    const definition = route.model;
    document.title = `${definition.title} — Written Models`;

    app.innerHTML = `
        <div class="studio-shell">
            <aside class="studio-sidebar">
                <a href="/" class="brand studio-brand" aria-label="Written Models home">${logo()}</a>
                <div class="sidebar-section-label">MODEL LIBRARY <span>${String(models.length).padStart(2, "0")}</span></div>
                <nav class="sidebar-models" aria-label="Model library">
                    ${models.map((model, index) => `
                        <a href="/${encodeURIComponent(model.slug)}" class="sidebar-model ${definition.slug === model.slug ? "active" : ""}" ${definition.slug === model.slug ? 'aria-current="page"' : ""}>
                            <span class="sidebar-number">${String(index + 1).padStart(2, "0")}</span>
                            <span>${escapeHtml(model.title)}</span>
                            ${definition.slug === model.slug ? icon("arrow", 15) : ""}
                        </a>
                    `).join("")}
                </nav>
                <div class="sidebar-bottom"><div class="sidebar-divider"></div><span>WORKSHOP / 001</span><p>Code shall be my pencil.</p><a href="/">${icon("left", 15)} All models</a></div>
            </aside>
            <main class="studio-main">
                <header class="studio-topbar">
                    <div class="breadcrumbs"><span>WORKSHOP</span><span class="breadcrumb-slash">/</span><span>MODELS</span><span class="breadcrumb-slash">/</span><strong>${escapeHtml(definition.slug.toUpperCase())}</strong></div>
                    <div class="top-actions"><span id="studio-status" class="studio-status"><span class="live-dot"></span> READY</span><button type="button" id="capture-button" class="button button-quiet">${icon("camera", 17)} <span>Capture PNG</span></button><button type="button" id="export-button" class="button button-primary">${icon("download", 17)} Export GLB</button></div>
                </header>
                <div class="studio-heading"><div><p class="section-kicker">ASSET INSPECTION / ${escapeHtml(definition.slug.toUpperCase())}</p><h1>${escapeHtml(definition.title)}<span class="accent-punctuation">.</span></h1><p>${escapeHtml(definition.description)}</p></div><span class="studio-heading-tag">HAND AUTHORED<br>CODE FIRST</span></div>
                <div class="studio-workspace">
                    <section class="workspace-panel" aria-label="3D viewport">
                        <div class="workspace-toolbar"><div class="workspace-title"><span class="toolbar-orb"></span> VIEWPORT <span class="toolbar-separator">/</span> <span id="current-mode-label">SHADED</span></div><div class="camera-bar"><button type="button" class="camera-button" data-view="isometric" title="Isometric view">ISO</button><button type="button" class="camera-button" data-view="front" title="Front view">FRONT</button><button type="button" class="camera-button" data-view="side" title="Side view">SIDE</button><button type="button" class="camera-button" data-view="top" title="Top view">TOP</button><span class="camera-divider"></span><button type="button" id="focus-button" class="camera-icon-button" title="Frame model (F)" aria-label="Frame model">${icon("focus", 17)}</button></div></div>
                        <div class="viewport-shell">
                            <div id="viewer" class="viewer"></div>
                            <div class="viewport-corner viewport-corner-tl"><span class="viewport-live"></span> PERSPECTIVE VIEW</div>
                            <div class="viewport-corner viewport-corner-tr">X / Y / Z</div>
                            <div class="viewport-corner viewport-corner-bl">LMB ORBIT <span>·</span> RMB PAN <span>·</span> SCROLL ZOOM</div>
                            <div class="viewport-corner viewport-corner-br">WM / 3D</div>
                        </div>
                        <div class="workspace-footer"><span>${icon("mouse", 15)} Interactive 3D canvas</span><button type="button" id="shortcuts-button" class="text-button">${icon("help", 15)} Keyboard shortcuts <kbd>?</kbd></button></div>
                    </section>
                    <aside class="inspector" aria-label="Model inspector">
                        <div class="inspector-head"><span>INSPECTOR</span>${icon("layers", 19)}</div>
                        <section class="inspector-section"><h2>Display mode</h2><div class="mode-controls" role="group" aria-label="Display mode"><button class="mode-button active" type="button" data-mode="shaded" aria-pressed="true"><span class="mode-symbol mode-symbol-shaded"></span><span>Shaded</span><kbd>1</kbd></button><button class="mode-button" type="button" data-mode="triangles" aria-pressed="false"><span class="mode-symbol mode-symbol-wire"></span><span>Triangles</span><kbd>2</kbd></button><button class="mode-button" type="button" data-mode="quads" aria-pressed="false"><span class="mode-symbol mode-symbol-quad"></span><span>Quad view</span><kbd>3</kbd></button></div></section>
                        <section class="inspector-section"><h2>Environment</h2><button type="button" id="grid-toggle" class="setting-row" aria-pressed="true"><span>${icon("grid", 17)} Show floor grid</span><span class="switch-track"><span class="switch-knob"></span></span></button></section>
                        <section class="inspector-section"><h2>Geometry</h2><div class="stats-grid"><div class="stat-box"><span>TRIANGLES</span><strong id="stat-triangles">—</strong></div><div class="stat-box"><span>QUADS</span><strong id="stat-quads">—</strong></div><div class="stat-box"><span>PARTS</span><strong id="stat-parts">—</strong></div><div class="stat-box"><span>FORMAT</span><strong>GLB</strong></div></div></section>
                        <section class="inspector-section dimensions-section"><h2>Bounding box</h2><div class="dimension-row"><span>X <small>WIDTH</small></span><strong id="dim-x">—</strong></div><div class="dimension-row"><span>Y <small>HEIGHT</small></span><strong id="dim-y">—</strong></div><div class="dimension-row"><span>Z <small>DEPTH</small></span><strong id="dim-z">—</strong></div></section>
                        <div class="inspector-foot">${icon("terminal", 16)} <span>SOURCE: /src/models/${escapeHtml(definition.slug)}.ts</span></div>
                    </aside>
                </div>
                <footer class="studio-footer"><span>WRITTEN MODELS / DESIGN LAB</span><span>ONE MODEL AT A TIME. ONE TOOL AT A TIME.</span></footer>
            </main>
        </div>
        <dialog id="shortcuts-dialog" class="shortcuts-dialog" aria-labelledby="shortcuts-heading">
            <div class="dialog-header"><div><p class="section-kicker">STUDIO REFERENCE</p><h2 id="shortcuts-heading">Keyboard shortcuts</h2></div><button type="button" id="close-shortcuts" class="dialog-close" aria-label="Close shortcuts">${icon("x", 20)}</button></div>
            <div class="shortcut-list"><div><span>Shaded view</span><kbd>1</kbd></div><div><span>Triangle wireframe</span><kbd>2</kbd></div><div><span>Quad view</span><kbd>3</kbd></div><div><span>Frame / reset camera</span><kbd>F</kbd></div><div><span>Toggle grid</span><kbd>G</kbd></div><div><span>Capture PNG</span><kbd>P</kbd></div><div><span>Export GLB</span><kbd>E</kbd></div><div><span>Show shortcuts</span><kbd>?</kbd></div></div>
            <p class="dialog-note">Drag to orbit · Right-drag to pan · Scroll to zoom</p>
        </dialog>
    `;

    const viewer = new ModelViewer(requireElement<HTMLElement>("#viewer"));
    const asset = definition.create();
    viewer.setModel(asset);

    const quadCount = viewer.getQuadCount();
    requireElement<HTMLElement>("#stat-triangles").textContent = formatCount(viewer.getTriangleCount());
    requireElement<HTMLElement>("#stat-quads").textContent = formatCount(quadCount);
    requireElement<HTMLElement>("#stat-parts").textContent = formatCount(viewer.getMeshCount());

    const dimensions = viewer.getDimensions();
    if (dimensions) {
        requireElement<HTMLElement>("#dim-x").textContent = formatDimension(dimensions.x);
        requireElement<HTMLElement>("#dim-y").textContent = formatDimension(dimensions.y);
        requireElement<HTMLElement>("#dim-z").textContent = formatDimension(dimensions.z);
    }

    let mode: ViewMode = "shaded";
    const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];
    const quadButton = modeButtons.find(button => button.dataset.mode === "quads");
    if (quadButton) {
        quadButton.disabled = quadCount === 0;
        if (quadCount === 0) quadButton.title = "No control mesh available";
    }

    function setMode(next: ViewMode): void {
        if (next === "quads" && quadCount === 0) return;

        viewer.setQuadView(false);
        viewer.setWireframe(false);
        if (next === "triangles") viewer.setWireframe(true);
        if (next === "quads") viewer.setQuadView(true);
        mode = next;

        modeButtons.forEach(button => {
            const selected = button.dataset.mode === mode;
            button.classList.toggle("active", selected);
            button.setAttribute("aria-pressed", String(selected));
        });
        requireElement<HTMLElement>("#current-mode-label").textContent =
            { shaded: "SHADED", triangles: "TRIANGLE WIREFRAME", quads: "QUAD VIEW" }[mode];
    }

    modeButtons.forEach(button => {
        button.addEventListener("click", () => setMode(button.dataset.mode as ViewMode));
    });

    document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button => {
        button.addEventListener("click", () => {
            viewer.setCameraView(button.dataset.view as CameraView);
        });
    });

    requireElement<HTMLButtonElement>("#focus-button").addEventListener("click", () => {
        viewer.setCameraView("isometric");
    });

    let gridVisible = true;
    const gridButton = requireElement<HTMLButtonElement>("#grid-toggle");
    function toggleGrid(): void {
        gridVisible = !gridVisible;
        viewer.setGridVisible(gridVisible);
        gridButton.setAttribute("aria-pressed", String(gridVisible));
    }
    gridButton.addEventListener("click", toggleGrid);

    const status = requireElement<HTMLElement>("#studio-status");
    function setStatus(message: string, error = false): void {
        status.innerHTML = `<span class="live-dot"></span> ${escapeHtml(message)}`;
        status.classList.toggle("status-error", error);
    }

    const exportButton = requireElement<HTMLButtonElement>("#export-button");
    async function exportCurrent(): Promise<void> {
        if (exportButton.disabled) return;
        exportButton.disabled = true;
        const savedMode = mode;
        setStatus("EXPORTING...");
        setMode("shaded");
        try {
            await exportGlb(asset, `${definition.slug}.glb`);
            setStatus("GLB EXPORTED");
        } catch (error) {
            console.error("GLB export failed:", error);
            setStatus("EXPORT FAILED", true);
        } finally {
            setMode(savedMode);
            exportButton.disabled = false;
        }
    }
    exportButton.addEventListener("click", () => void exportCurrent());

    const captureButton = requireElement<HTMLButtonElement>("#capture-button");
    async function captureCurrent(): Promise<void> {
        if (captureButton.disabled) return;
        captureButton.disabled = true;
        setStatus("CAPTURING...");
        try {
            await viewer.capturePng(`${definition.slug}-view.png`);
            setStatus("PNG SAVED");
        } catch (error) {
            console.error("Screenshot failed:", error);
            setStatus("CAPTURE FAILED", true);
        } finally {
            captureButton.disabled = false;
        }
    }
    captureButton.addEventListener("click", () => void captureCurrent());

    const dialog = requireElement<HTMLDialogElement>("#shortcuts-dialog");
    requireElement<HTMLButtonElement>("#shortcuts-button").addEventListener("click", () => dialog.showModal());
    requireElement<HTMLButtonElement>("#close-shortcuts").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
        if (event.target === dialog) dialog.close();
    });

    document.addEventListener("keydown", event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (dialog.open) return;
        const target = event.target;
        if (target instanceof HTMLElement &&
            (target.isContentEditable || target.closest("input, textarea, select, button, a"))) {
            return;
        }

        switch (event.key.toLowerCase()) {
            case "1": setMode("shaded"); break;
            case "2": setMode("triangles"); break;
            case "3": setMode("quads"); break;
            case "f": viewer.setCameraView("isometric"); break;
            case "g": toggleGrid(); break;
            case "p": void captureCurrent(); break;
            case "e": void exportCurrent(); break;
            case "?": dialog.showModal(); break;
            default: return;
        }
        event.preventDefault();
    });

    window.addEventListener("pagehide", () => viewer.dispose(), { once: true });
} else {
    document.title = "Model not found — Written Models";
    app.innerHTML = `<div class="not-found-page"><a href="/" class="brand">${logo()}</a><div><p class="section-kicker">404 / MISSING GEOMETRY</p><h1>Nothing here<span class="accent-punctuation">.</span></h1><p>This model hasn't been written yet.</p><a class="hero-cta" href="/">${icon("left", 18)} Back to the collection</a></div></div>`;
}
