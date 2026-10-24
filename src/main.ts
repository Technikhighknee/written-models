import "./style.css";

import { models } from "./models/index";
import { resolveRoute } from "./core/router";
import { ModelViewer } from "./core/ModelViewer";
import { exportGlb } from "./core/exportGlb";

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
    <main class="layout">
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
        <label>
          <input id="wireframe-toggle" type="checkbox">
          Wireframe
        </label>

        <span id="triangle-count">Tris: 0</span>
      </div>

      <div id="viewer" class="viewer"></div>
    </main>
  `;

  const container = requireElement<HTMLElement>("#viewer");
  const viewer = new ModelViewer(container);

  const asset = model.create();
  viewer.setModel(asset);
  
  const wireframeToggle = requireElement<HTMLInputElement>(
    "#wireframe-toggle"
  );
  const triangleCount = requireElement<HTMLElement>(
    "#triangle-count"
  );

  wireframeToggle.addEventListener("change", () => {
    viewer.setWireframe(wireframeToggle.checked);
  });

  triangleCount.textContent = 
    `Tris: ${viewer.getTriangleCount().toLocaleString("en-US")}`;

  const exportButton = requireElement<HTMLButtonElement>(
    "#export-button"
  );
  
  exportButton.addEventListener("click", async () => {
    exportButton.disabled = true

    const wasWireframe = viewer.wireframe;

    viewer.setWireframe(false);

    try {
      await exportGlb(asset, `${model.slug}.glb`);
    } catch (error) {
      console.error("GLB-Export failed:", error);
      alert("GLB-Export failes. See console for details.");
    } finally {
      viewer.setWireframe(wasWireframe)
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
