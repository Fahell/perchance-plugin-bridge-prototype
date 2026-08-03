type PluginFunction = ((...args: unknown[]) => unknown) & Record<string, unknown>;
type RootLike = PluginFunction | Record<string, unknown>;
type UnknownRecord = Record<string, unknown>;

type BridgeLookup = {
  root: RootLike | null;
  source: "window" | "parent" | "missing";
  error?: string;
};

declare global {
  interface Window {
    root?: RootLike;
  }
}

const MODULE_URL = import.meta.url;
const BUILD_COMMIT = __BUILD_COMMIT__;
const MAX_LOG_ENTRIES = 80;

const state = {
  events: [] as string[],
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveRoot(): BridgeLookup {
  try {
    const localRoot = window.root;
    if (typeof localRoot === "function" || isRecord(localRoot)) {
      return { root: localRoot, source: "window" };
    }
  } catch (error) {
    return {
      root: null,
      source: "missing",
      error: `window.root threw while being read: ${describeError(error)}`,
    };
  }

  try {
    if (window.parent && window.parent !== window) {
      const parentRoot = window.parent.root;
      if (typeof parentRoot === "function" || isRecord(parentRoot)) {
        return { root: parentRoot, source: "parent" };
      }
    }
  } catch (error) {
    return {
      root: null,
      source: "missing",
      error: `window.parent.root is inaccessible: ${describeError(error)}`,
    };
  }

  return {
    root: null,
    source: "missing",
    error: "No root object/function was found on this window or its parent.",
  };
}

function getPlugin(name: "ai" | "image"): PluginFunction | null {
  const lookup = resolveRoot();
  if (!lookup.root) return null;

  try {
    const candidate = lookup.root[name];
    // Keep the runtime receiver in case a plugin reads sibling properties through `this`.
    return typeof candidate === "function"
      ? candidate.bind(lookup.root) as PluginFunction
      : null;
  } catch {
    return null;
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (_key, nested) => {
      if (typeof nested === "function") return `[function ${nested.name || "anonymous"}]`;
      if (nested instanceof HTMLElement) return `[HTMLElement ${nested.tagName.toLowerCase()}]`;
      return nested;
    }, 2);
  } catch {
    return String(value);
  }
}

function emit(message: string, details?: unknown): void {
  const suffix = details === undefined ? "" : ` ${formatValue(details)}`;
  const line = `${new Date().toLocaleTimeString()}  ${message}${suffix}`;
  state.events.push(line);
  if (state.events.length > MAX_LOG_ENTRIES) state.events.shift();

  const log = document.querySelector<HTMLPreElement>("#event-log");
  if (log) log.textContent = state.events.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeStyles(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = `
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0b1020;
      color: #e6edf8;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 320px; background: radial-gradient(circle at 10% 0%, #1c2b55 0, transparent 38rem), #0b1020; }
    button, input, textarea, select { font: inherit; }
    button { cursor: pointer; }
    .bridge-app { max-width: 1180px; margin: 0 auto; padding: 28px 18px 48px; }
    .hero { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 22px; }
    .eyebrow { color: #83a9ff; font-size: .75rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    h1, h2, p { margin-top: 0; }
    h1 { margin-bottom: 9px; font-size: clamp(1.6rem, 4vw, 2.5rem); letter-spacing: -.04em; }
    h2 { margin-bottom: 8px; font-size: 1.08rem; }
    .muted { color: #98a7c2; line-height: 1.55; }
    .build-pill { padding: 9px 12px; border: 1px solid #2f4674; border-radius: 999px; color: #b5c9ff; background: #111b34; font: 700 .72rem ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
    .panel { border: 1px solid #26385e; border-radius: 18px; background: rgba(16, 25, 49, .9); box-shadow: 0 18px 55px rgba(0,0,0,.2); }
    .diagnostics { padding: 18px; margin-bottom: 18px; }
    .status-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px; }
    .status { padding: 12px; border-radius: 12px; background: #0c1428; border: 1px solid #27395e; }
    .status-label { display: block; color: #8e9db8; font-size: .75rem; margin-bottom: 5px; }
    .status-value { font-weight: 800; }
    .status-value.ok { color: #65e6a0; }
    .status-value.warn { color: #ffca67; }
    .status-value.bad { color: #ff8797; }
    .meta { display: grid; gap: 7px; margin-top: 16px; color: #9eacc4; font: .73rem ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
    .meta code { color: #c6d5ff; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .card { padding: 18px; }
    .card-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; margin-bottom: 14px; }
    .tag { color: #a9bfff; font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    label { display: grid; gap: 7px; margin: 12px 0; color: #adbad2; font-size: .82rem; font-weight: 700; }
    textarea, input, select { width: 100%; border: 1px solid #31466f; border-radius: 10px; padding: 10px 11px; color: #ecf2ff; background: #0a1123; outline: none; }
    textarea { min-height: 112px; resize: vertical; line-height: 1.45; }
    textarea:focus, input:focus, select:focus { border-color: #719aff; box-shadow: 0 0 0 3px rgba(92, 136, 255, .15); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .check { display: flex; align-items: center; grid-template-columns: auto 1fr; gap: 8px; font-weight: 600; }
    .check input { width: auto; accent-color: #719aff; }
    .primary { width: 100%; border: 0; border-radius: 10px; padding: 11px 14px; color: #071126; background: linear-gradient(135deg, #82aaff, #6ee7c2); font-weight: 900; transition: transform .18s ease, filter .18s ease; }
    .primary:hover { transform: translateY(-1px); filter: brightness(1.08); }
    .primary:disabled { cursor: wait; opacity: .55; transform: none; }
    .output { min-height: 96px; margin-top: 14px; padding: 13px; border: 1px dashed #3a527f; border-radius: 10px; color: #dce7fb; background: #0a1123; white-space: pre-wrap; line-height: 1.55; }
    .output:empty::before { content: "A saída aparecerá aqui…"; color: #667793; }
    .image-output { display: grid; place-items: center; min-height: 190px; overflow: hidden; }
    .image-output img, .image-output canvas { display: block; max-width: 100%; max-height: 430px; border-radius: 8px; }
    .image-output img { object-fit: contain; }
    .image-placeholder { color: #667793; }
    .details { margin-top: 12px; color: #8fa1c0; font: .74rem ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .log-panel { margin-top: 18px; padding: 18px; }
    .log-panel pre { max-height: 230px; overflow: auto; margin: 12px 0 0; padding: 13px; border-radius: 10px; color: #b8c9e9; background: #080e1d; font: .72rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
    .notice { margin-top: 18px; padding: 13px 15px; border-left: 3px solid #e0b15c; color: #c6cfe0; background: rgba(224,177,92,.08); font-size: .82rem; line-height: 1.5; }
    @media (max-width: 800px) { .hero { display: block; } .build-pill { display: inline-block; margin-top: 10px; } .actions, .status-grid { grid-template-columns: 1fr; } }
  `;
  return style;
}

function appTemplate(): string {
  return `
    <main class="bridge-app">
      <header class="hero">
        <div>
          <div class="eyebrow">Perchance · runtime laboratory</div>
          <h1>AI plugin bridge</h1>
          <p class="muted">Protótipo observável: o bundle externo chama os plugins importados no painel Lists e registra cada etapa no preview.</p>
        </div>
        <div class="build-pill">build ${escapeHtml(BUILD_COMMIT.slice(0, 12))}</div>
      </header>

      <section class="panel diagnostics">
        <div class="card-head"><h2>Diagnóstico da ponte</h2><span class="tag">sem falhas silenciosas</span></div>
        <div class="status-grid">
          <div class="status"><span class="status-label">root</span><strong id="root-status" class="status-value warn">verificando…</strong></div>
          <div class="status"><span class="status-label">root.ai</span><strong id="ai-status" class="status-value warn">verificando…</strong></div>
          <div class="status"><span class="status-label">root.image</span><strong id="image-status" class="status-value warn">verificando…</strong></div>
        </div>
        <div class="meta">
          <div>module: <code id="module-url"></code></div>
          <div>document: <code id="document-url"></code></div>
          <div>root source: <code id="root-source">—</code></div>
          <div id="root-error"></div>
        </div>
      </section>

      <section class="actions">
        <article class="panel card">
          <div class="card-head"><h2>Geração de texto</h2><span class="tag">streaming</span></div>
          <label>instruction<textarea id="text-instruction">Write a concise, imaginative micro-story about a lighthouse that receives a message from the future.</textarea></label>
          <label>startWith<input id="text-start" value="The message began: "></label>
          <div class="row">
            <label>stopSequences<input id="text-stop" value="\n\n"></label>
            <label>style CSS<input id="text-style" value="text-align:left; display:block;"></label>
          </div>
          <label class="check"><input id="text-hide-start" type="checkbox"> hideStartWith</label>
          <button id="generate-text" class="primary" type="button">Gerar texto com root.ai()</button>
          <div id="text-output" class="output" aria-live="polite"></div>
          <div id="text-details" class="details"></div>
        </article>

        <article class="panel card">
          <div class="card-head"><h2>Geração de imagem</h2><span class="tag">promise</span></div>
          <label>prompt<textarea id="image-prompt">A tiny observatory on a floating island above a calm ocean at sunrise, detailed digital painting, cinematic light</textarea></label>
          <label>negativePrompt<input id="image-negative" value="blurry, low quality, text, watermark"></label>
          <div class="row">
            <label>resolution<select id="image-resolution"><option>512x512</option><option>512x768</option><option>768x512</option></select></label>
            <label>seed<input id="image-seed" type="number" value="-1"></label>
          </div>
          <div class="row">
            <label>guidanceScale<input id="image-guidance" type="number" min="1" max="30" step="1" value="7"></label>
            <label class="check"><input id="image-hide-gallery" type="checkbox" checked> hideGalleryButtons</label>
          </div>
          <button id="generate-image" class="primary" type="button">Gerar imagem com root.image()</button>
          <div id="image-output" class="output image-output"><span class="image-placeholder">A imagem aparecerá aqui…</span></div>
          <div id="image-details" class="details"></div>
        </article>
      </section>

      <section class="panel log-panel">
        <div class="card-head"><h2>Event log</h2><span class="tag">últimos ${MAX_LOG_ENTRIES} eventos</span></div>
        <pre id="event-log" aria-live="polite"></pre>
      </section>

      <div class="notice"><strong>Cache:</strong> o carregamento deve usar <code>?rev=&lt;commit SHA&gt;</code> na URL do módulo. Depois de cada push, atualize esse SHA no painel HTML/CSS/JS para garantir que navegador e CDN busquem exatamente o novo bundle.</div>
    </main>
  `;
}

function setStatus(id: string, label: string, kind: "ok" | "warn" | "bad"): void {
  const element = document.querySelector<HTMLElement>(`#${id}`);
  if (!element) return;
  element.textContent = label;
  element.className = `status-value ${kind}`;
}

function setBusy(button: HTMLButtonElement, busy: boolean, busyLabel: string, idleLabel: string): void {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

function getTextValue(id: string): string {
  return document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`)?.value ?? "";
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    if (typeof value.text === "string") return value.text;
    if (typeof value.generatedText === "string") return value.generatedText;
  }
  return value == null ? "" : String(value);
}

function renderTextDetails(value: unknown): void {
  const details = document.querySelector<HTMLElement>("#text-details");
  if (!details || !isRecord(value)) return;
  const inputs = isRecord(value.inputs) ? value.inputs : undefined;
  details.textContent = `result keys: ${Object.keys(value).join(", ")}\ninputs: ${formatValue(inputs ?? "not exposed")}`;
}

async function generateText(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("#generate-text");
  const output = document.querySelector<HTMLElement>("#text-output");
  const plugin = getPlugin("ai");
  if (!button || !output) return;
  if (!plugin) {
    const lookup = resolveRoot();
    output.textContent = "root.ai não está disponível neste contexto.";
    emit("text blocked: root.ai unavailable", lookup);
    setStatus("ai-status", "indisponível", "bad");
    return;
  }

  const startWith = getTextValue("text-start");
  const stopSequences = getTextValue("text-stop").split("\\n").filter(Boolean);
  const instruction = getTextValue("text-instruction");
  const style = getTextValue("text-style");
  const hideStartWith = document.querySelector<HTMLInputElement>("#text-hide-start")?.checked ?? false;
  setBusy(button, true, "Gerando texto…", "Gerar texto com root.ai()");
  output.textContent = "";
  emit("text start", { instruction, startWith, stopSequences, hideStartWith });

  try {
    const result = await Promise.resolve(plugin({
      instruction,
      startWith,
      hideStartWith,
      stopSequences,
      endButtons: "none",
      ...(style ? { style } : {}),
      onStart: (data: unknown) => emit("text onStart", data),
      onChunk: (data: unknown) => {
        if (isRecord(data) && typeof data.fullTextSoFar === "string") {
          output.textContent = data.fullTextSoFar;
        }
        emit("text onChunk", isRecord(data) ? { textChunk: data.textChunk, isFromStartWith: data.isFromStartWith } : data);
      },
      onFinish: (data: unknown) => {
        emit("text onFinish", data);
        renderTextDetails(data);
      },
    }));
    output.textContent = asText(result) || output.textContent;
    renderTextDetails(result);
    emit("text resolved", { resultType: typeof result, preview: output.textContent.slice(0, 120) });
  } catch (error) {
    output.textContent = `Falha em root.ai(): ${describeError(error)}`;
    emit("text error", describeError(error));
  } finally {
    setBusy(button, false, "Gerando texto…", "Gerar texto com root.ai()");
  }
}

function appendImageResult(container: HTMLElement, result: unknown): string {
  container.replaceChildren();
  if (isRecord(result) && result.canvas instanceof HTMLElement) {
    container.append(result.canvas);
    return "canvas";
  }
  if (isRecord(result) && typeof result.dataUrl === "string") {
    const image = document.createElement("img");
    image.alt = "Imagem gerada pelo Perchance text-to-image-plugin";
    image.src = result.dataUrl;
    container.append(image);
    return "dataUrl";
  }
  if (result instanceof HTMLImageElement || result instanceof HTMLCanvasElement) {
    container.append(result);
    return result.tagName.toLowerCase();
  }
  const source = asText(result);
  if (/^(data:|https?:\/\/)/.test(source)) {
    const image = document.createElement("img");
    image.alt = "Imagem gerada pelo Perchance text-to-image-plugin";
    image.src = source;
    container.append(image);
    return "string-url";
  }
  container.textContent = `Resultado recebido, mas sem canvas/dataUrl reconhecível:\n${source.slice(0, 500)}`;
  return "unknown";
}

async function generateImage(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("#generate-image");
  const output = document.querySelector<HTMLElement>("#image-output");
  const plugin = getPlugin("image");
  if (!button || !output) return;
  if (!plugin) {
    output.textContent = "root.image não está disponível neste contexto.";
    emit("image blocked: root.image unavailable", resolveRoot());
    setStatus("image-status", "indisponível", "bad");
    return;
  }

  const prompt = getTextValue("image-prompt");
  const negativePrompt = getTextValue("image-negative");
  const resolution = getTextValue("image-resolution");
  const seed = Number(getTextValue("image-seed"));
  const guidanceScale = Number(getTextValue("image-guidance"));
  const hideGalleryButtons = document.querySelector<HTMLInputElement>("#image-hide-gallery")?.checked ?? true;
  setBusy(button, true, "Gerando imagem…", "Gerar imagem com root.image()");
  output.innerHTML = "<span class=\"image-placeholder\">Aguardando resposta da GPU…</span>";
  emit("image start", { prompt, negativePrompt, resolution, seed, guidanceScale });

  try {
    const result = await Promise.resolve(plugin({
      prompt,
      negativePrompt,
      resolution,
      seed: Number.isFinite(seed) ? seed : -1,
      guidanceScale: Number.isFinite(guidanceScale) ? guidanceScale : 7,
      hideGalleryButtons,
    }));
    const representation = appendImageResult(output, result);
    const details = document.querySelector<HTMLElement>("#image-details");
    if (details && isRecord(result)) {
      details.textContent = `representation: ${representation}\nresult keys: ${Object.keys(result).join(", ")}\ninputs: ${formatValue(result.inputs ?? "not exposed")}`;
    }
    emit("image resolved", { representation, resultType: typeof result });
  } catch (error) {
    output.textContent = `Falha em root.image(): ${describeError(error)}`;
    emit("image error", describeError(error));
  } finally {
    setBusy(button, false, "Gerando imagem…", "Gerar imagem com root.image()");
  }
}

function refreshDiagnostics(): void {
  const lookup = resolveRoot();
  const ai = getPlugin("ai");
  const image = getPlugin("image");
  setStatus("root-status", lookup.root ? `disponível (${lookup.source})` : "indisponível", lookup.root ? "ok" : "bad");
  setStatus("ai-status", ai ? "callable" : "indisponível", ai ? "ok" : "bad");
  setStatus("image-status", image ? "callable" : "indisponível", image ? "ok" : "bad");

  const moduleElement = document.querySelector<HTMLElement>("#module-url");
  const documentElement = document.querySelector<HTMLElement>("#document-url");
  const sourceElement = document.querySelector<HTMLElement>("#root-source");
  const errorElement = document.querySelector<HTMLElement>("#root-error");
  if (moduleElement) moduleElement.textContent = MODULE_URL;
  if (documentElement) documentElement.textContent = window.location.href;
  if (sourceElement) sourceElement.textContent = lookup.source;
  if (errorElement) errorElement.textContent = lookup.error ? `diagnostic: ${lookup.error}` : "diagnostic: root resolved";
  emit("diagnostics", { root: Boolean(lookup.root), source: lookup.source, ai: Boolean(ai), image: Boolean(image), error: lookup.error });
}

function mount(): void {
  if (document.querySelector("[data-perchance-bridge-app]")) return;
  document.head.append(makeStyles());
  const host = document.createElement("div");
  host.dataset.perchanceBridgeApp = "true";
  host.innerHTML = appTemplate();
  document.body.replaceChildren(host);
  document.querySelector<HTMLButtonElement>("#generate-text")?.addEventListener("click", () => void generateText());
  document.querySelector<HTMLButtonElement>("#generate-image")?.addEventListener("click", () => void generateImage());
  emit("bundle mounted", { module: MODULE_URL, build: BUILD_COMMIT });
  refreshDiagnostics();
  window.setInterval(refreshDiagnostics, 1000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}

export {};
