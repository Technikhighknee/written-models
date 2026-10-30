import "./style.css";

import { models } from "./models/index";
import type { ModelDefinition } from "./models/index";
import { categories } from "./models/categories";
import type { ModelCategorySlug } from "./models/categories";
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


function renderModelList(entries: readonly ModelDefinition[]): string {
  return `
    <section class="model-list" aria-label="Models">
      ${entries.map(model => `
        <a class="model-card" href="/${model.slug}">
          <span class="model-card-title">
            ${model.title}
            <span aria-hidden="true">↗</span>
          </span>
          <span class="muted">${model.description}</span>
          <span class="model-path">/${model.slug}</span>
        </a>
      `).join("")}
    </section>
  `;
}

function categoryIcon(slug: ModelCategorySlug): string {
  const paths: Record<ModelCategorySlug, string> = {
    furniture: '<path d="M5 11V6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v5"/><path d="M4 11h16a2 2 0 0 1 2 2v5H2v-5a2 2 0 0 1 2-2Z"/><path d="M5 18v3m14-3v3"/>',
    vessels: '<path d="M7 3h10l2 5v8l-2 5H7l-2-5V8l2-5Z"/><path d="M6 8h12M6 16h12M9 3v18m6-18v18"/>',
    weapons: '<path d="m14 10 6-6 1-3-3 1-6 6M4 20l8-8M2 15l7 7M10 14l4-4"/>',
    tools: '<path d="M14.5 6.5a5 5 0 0 0-6.3 6.3L3 17.5a2.1 2.1 0 0 0 3 3l5.2-5.2a5 5 0 0 0 6.3-6.3L14 12l-3-3 3.5-2.5Z"/>',
    materials: '<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${paths[slug]}</svg>`;
}

const app = requireElement<HTMLElement>("#app");
const route = resolveRoute(window.location.pathname);

if (route.type === "home") {
  const populated = categories.map(category => ({
    category,
    count: models.filter(model => model.category === category.slug).length
  })).filter(item => item.count > 0);

  document.title = "Explore Models · Written Models";
  app.innerHTML = `
    <main class="layout catalog-page">
      <header class="page-header catalog-header">
        <div>
          <p class="eyebrow">Written Models</p>
          <h1>Explore Models</h1>
          <p class="muted">Browse the collection by category.</p>
        </div>
        <a class="catalog-action" href="/models">View all ${models.length} models ↗</a>
      </header>
      <section class="category-list" aria-label="Model categories">
        ${populated.map(({ category, count }) => `
          <a class="category-card" href="/categories/${category.slug}">
            <span class="category-card-top">
              <span class="category-icon">${categoryIcon(category.slug)}</span>
              <span class="category-arrow" aria-hidden="true">↗</span>
            </span>
            <span class="category-card-title">${category.title}</span>
            <span class="category-card-description">${category.description}</span>
            <span class="category-card-count">
              ${count} ${count === 1 ? "model" : "models"}
            </span>
          </a>
        `).join("")}
      </section>
    </main>
  `;
}

else if (route.type === "category") {
  const { category } = route;
  const entries = models.filter(model => model.category === category.slug);

  document.title = `${category.title} · Written Models`;
  app.innerHTML = `
    <main class="layout catalog-page">
      <header class="page-header">
        <a class="back-link" href="/">← All categories</a>
        <div class="catalog-title-line">
          <h1>${category.title}</h1>
          <span class="catalog-count">${entries.length} ${entries.length === 1 ? "model" : "models"}</span>
        </div>
        <p class="muted">${category.description}</p>
      </header>
      ${renderModelList(entries)}
    </main>
  `;
}

else if (route.type === "all-models") {
  document.title = "All Models · Written Models";
  app.innerHTML = `
    <main class="layout catalog-page">
      <header class="page-header">
        <a class="back-link" href="/">← All categories</a>
        <div class="catalog-title-line">
          <h1>All Models</h1>
          <span class="catalog-count">${models.length} ${models.length === 1 ? "model" : "models"}</span>
        </div>
        <p class="muted">Every model in the collection.</p>
      </header>
      ${renderModelList(models)}
    </main>
  `;
}

else if (route.type === "model") {
  const { model } = route;

  document.title = `${model.title} · Written Models`;
  app.innerHTML = `
    <main class="layout viewer-page">
      <header class="viewer-header">
        <div>
          <a class="back-link" href="/categories/${model.category}">
            ← ${categories.find(category => category.slug === model.category)?.title ?? "All categories"}
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
  const hasControlOutline = viewer.hasControlOutline();

  const quadButton = modeButtons.find(
    button => button.dataset.mode === "quads"
  );

  if (quadButton) quadButton.disabled = !hasControlOutline;

  requireElement<HTMLElement>("#triangle-count").textContent =
    viewer.getTriangleCount().toLocaleString("en-US");

  requireElement<HTMLElement>("#quad-count").textContent =
    quads.toLocaleString("en-US");

  function setMode(mode: ViewMode): void {
    if (mode === "quads" && !hasControlOutline) return;

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
    exportButton.disabled = true;

    const wasWireframe = viewer.wireframe;
    const wasQuadView = viewer.quadView;

    viewer.setQuadView(false);
    viewer.setWireframe(false);

    try {
      await exportGlb(asset, `${model.slug}.glb`);
    } catch (error) {
      console.error("GLB-Export failed:", error);
      alert("GLB export failed. See console for details.");
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
      <h1>Page not found</h1>
      
      <p class="muted">
        There is no category or model registered for this URL.
      </p>

      <a class="back-link" href="/">
        ← All categories
      </a>
    </main>
  `;
}
