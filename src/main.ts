import "./style.css";

import { models } from "./models/index";
import { resolveRoute } from "./core/router";
import { ModelViewer } from "./core/ModelViewer";
import { exportGlb } from "./core/exportGlb";
import { hasFillLevelController } from "./toolbox/geometry/construction/fillableVolume";

function requireElement<T extends HTMLElement>(
  selector: string
): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Required element not found: ${selector}`);
  }

  return element;
}

const app = requireElement<HTMLElement>("#app");
const route = resolveRoute(window.location.pathname);

if (route.type === "home") {
  app.innerHTML = `
    <main class="layout">
      <header class="page-header">
        <p class="eyebrow"> Written Models</p>
        <h1>Models</h1>
        <p class="muted">
          Handmade Assets – one model per file.
        </p>
      </header>

      <section class="model-list">
        ${models.map(model => `
          <a class="model-card" href="/${model.slug}">
            <span class="model-card-title">
              ${model.title}
              <span aria-hidden="true">↗</span>
            </span>

            <span class="muted">
              ${model.description}
            </span>

            <span class="model-path">
              /${model.slug}
            </span>
          </a>
        `).join("")}
      </section>
    </main>
  `;
}

else if (route.type === "model") {
  const { model } = route;

  app.innerHTML = `
    <main class="layout viewer-page">
      <header class="viewer-header">
        <div>
          <a class="back-link" href="/">
            ← All models
          </a>

          <h1>${model.title}</h1>
          <p class="muted">${model.description}</p>
        </div>

        <button id="export-button" type="button">
          Export GLB
        </button>
      </header>

      <div class="viewer-toolbar">
        <div class="view-modes" role="group" aria-label="Display mode">
          <button type="button" class="view-mode is-active" data-mode="solid"
                  aria-pressed="true" title="Solid shading">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
              <path d="m12 2.5 9 5v9l-9 5-9-5v-9Z"/>
              <path d="m3 7.5 9 5 9-5M12 12.5v9"/>
              <path d="m3 7.5 9 5v9l-9-5Z" fill="currentColor" stroke="none" opacity=".26"/>
            </svg>
            Solid
          </button>
          <button type="button" class="view-mode" data-mode="wireframe"
                  aria-pressed="false" title="Triangle wireframe">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
              <path d="m12 2.5 9 5v9l-9 5-9-5v-9Z"/>
              <path d="m3 7.5 9 5 9-5M12 12.5v9M3 7.5l9 14m0-9 9 4"/>
            </svg>
            Wireframe
          </button>
          <button type="button" class="view-mode" data-mode="quads"
                  aria-pressed="false" title="Control mesh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
              <path d="m12 2.5 9 5v9l-9 5-9-5v-9Z"/>
              <path d="m3 7.5 9 5 9-5M12 12.5v9"/>
            </svg>
            Quads
          </button>
        </div>
        <div id="model-parameters" class="model-parameters"></div>
      </div>

      <div id="viewer" class="viewer">
        <div class="mesh-stats" aria-label="Mesh statistics">
          <span class="mesh-stat"><span>Tris</span><strong id="triangle-count">0</strong></span>
          <span class="mesh-stat"><span>Quads</span><strong id="quad-count">0</strong></span>
        </div>
      </div>
    </main>
  `;

  const container = requireElement<HTMLElement>("#viewer");
  const viewer = new ModelViewer(container);

  const asset = model.create();
  viewer.setModel(asset);

  // A model advertises a runtime capability; the viewer does not need to
  // know what object is being filled or how its geometry is constructed.
  if (hasFillLevelController(asset)) {
    const host = requireElement<HTMLElement>("#model-parameters");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const output = document.createElement("output");

    label.className = "fill-control";
    label.htmlFor = "fill-level";
    label.textContent = "Fill";
    input.id = "fill-level";
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.step = "1";
    input.value = String(Math.round(asset.getFillLevel() * 100));
    output.textContent = input.value + "%";
    output.htmlFor = input.id;

    input.addEventListener("input", () => {
      asset.setFillLevel(Number(input.value) / 100);
      output.textContent = input.value + "%";
    });

    host.append(label, input, output);
  }

  type ViewMode = "solid" | "wireframe" | "quads";

  const modeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".view-mode")
  );
  const quads = viewer.getQuadCount();

  const quadButton = modeButtons.find(
    button => button.dataset.mode === "quads"
  );

  if (quadButton) quadButton.disabled = quads === 0;

  requireElement<HTMLElement>("#triangle-count").textContent =
    viewer.getTriangleCount().toLocaleString("en-US");

  requireElement<HTMLElement>("#quad-count").textContent =
    quads.toLocaleString("en-US");

  function setMode(mode: ViewMode): void {
    if (mode === "quads" && quads === 0) return;

    viewer.setQuadView(false);
    viewer.setWireframe(false);

    if (mode === "wireframe") {
      viewer.setWireframe(true);
    } else if (mode === "quads") {
      viewer.setQuadView(true);
    }

    for (const button of modeButtons) {
      const active = button.dataset.mode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  for (const button of modeButtons) {
    button.addEventListener("click", () => {
      setMode(button.dataset.mode as ViewMode);
    });
  }

  const exportButton = requireElement<HTMLButtonElement>(
    "#export-button"
  );

  exportButton.addEventListener("click", async () => {
    exportButton.disabled = true

    const wasWireframe = viewer.wireframe;
    const wasQuadView = viewer.quadView;

    viewer.setQuadView(false);
    viewer.setWireframe(false);

    try {
      await exportGlb(asset, `${model.slug}.glb`);
    } catch (error) {
      console.error("GLB-Export failed:", error);
      alert("GLB-Export failes. See console for details.");
    } finally {
      viewer.setWireframe(wasWireframe);
      viewer.setQuadView(wasQuadView);

      exportButton.disabled = false;
    }
  });
}

else {
  app.innerHTML = `
    <main class="layout">
      <h1>Model not found</h1>
      
      <p class="muted">
        There is no model registered for this URL.
      </p>

      <a class="back-link" href="/">
        ← Back to model-overview
      </a>
    </main>
  `;
}
