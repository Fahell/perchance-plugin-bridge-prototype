# Perchance integration notebook

This document is the runbook for the minimum bridge experiment. It is intentionally explicit because the purpose is to learn the runtime contract, not to hide compatibility problems behind abstractions.

## 1. Separate responsibilities

### Lists panel

The Lists panel contains only the plugin imports:

```perchance
ai = {import:ai-text-plugin}
image = {import:text-to-image-plugin}
```

The bundle does **not** repeat these imports. It only calls the runtime functions exposed after Perchance evaluates that panel.

### HTML/CSS/JS panel

The panel loads the externally built bundle. Use the full commit SHA from the GitHub push:

```html
<script type="module">
  import "https://fahell.github.io/perchance-plugin-bridge-prototype/main.bundle.js?rev=FULL_COMMIT_SHA";
</script>
```

The URL query is part of the experiment. Updating it after every push is the reliable way to force a new resource identity. Do not use a moving URL without a revision query when comparing behavior.

### Preview panel

The app renders here and exposes all diagnostics, lifecycle events, result metadata, and errors. The AI Helper panel is not part of the app.

## 2. What to record

For every test, record:

- Perchance generator URL and date/time;
- exact bundle URL, including `?rev=`;
- displayed build SHA;
- root source (`window` or `parent`);
- whether `root`, `root.ai`, and `root.image` are callable;
- text options and lifecycle events;
- image options, return representation (`canvas`, `dataUrl`, URL, or unknown), and result keys;
- any Perchance error panel, browser console error, or event-log error.

A local build passing is not evidence that the bridge works. The decisive test is the generated Perchance preview.

## 3. Expected experiments

### A. Bridge discovery

1. Load the generator.
2. Confirm the diagnostic cards move from `verificando…` to either `callable` or `indisponível`.
3. If unavailable, inspect `root source`, `diagnostic`, and the event log before changing code.
4. Do not replace an unavailable plugin with a local mock during the Perchance test: that would hide the integration failure.

### B. Text plugin

Use the default values first. Click **Gerar texto com root.ai()** and verify:

- `text start`;
- `text onStart` if supported;
- multiple `text onChunk` events for streaming;
- `text onFinish`;
- `text resolved`;
- visible output and result metadata.

Then vary one option at a time: `startWith`, `hideStartWith`, `stopSequences`, and `style`. Record which options are honored by the deployed plugin version.

### C. Image plugin

Use the default values first. Click **Gerar imagem com root.image()** and verify:

- request enters a busy state;
- a result resolves;
- the UI identifies whether it received a canvas, data URL, image element, or another shape;
- the displayed `inputs` match the requested prompt/options where exposed.

Then vary `negativePrompt`, `seed`, `resolution`, and `guidanceScale` one at a time. Keep requests sparse because the plugin is server-backed and has queue/concurrency limits.

## 4. Cache procedure

After a source change:

1. Commit and push to `main`.
2. Wait for the GitHub Actions build/deploy job to complete.
3. Copy the **full commit SHA** of that push.
4. Replace the `?rev=` value in the Perchance HTML/CSS/JS panel.
5. Save/reload the generator.
6. Confirm the new short SHA appears in the app header and the module URL includes the new revision.

This is preferable to hoping that a CDN cache-control header or a manual reload invalidates every intermediate cache. The query-string revision is a cache-busting mechanism, not a promise that deployment has completed.

## 5. Troubleshooting matrix

| Symptom | First evidence to inspect | Likely next action |
| --- | --- | --- |
| App does not appear | Perchance error panel and module URL | Check Pages deployment, URL spelling, module MIME type, and module load error |
| `root` unavailable | root source, diagnostic, event log | Confirm the bundle is in the generator preview context and that plugin imports are saved in Lists |
| `root` exists but plugin is unavailable | status cards and event log | Inspect the exact names exported by the runtime; do not assume aliases |
| Text button fails | `text error`, inputs, Perchance console | Reduce to a plain instruction, then add one option at a time |
| Image result is not displayed | `representation`, result keys, inputs | Inspect returned object shape; use the plugin's exposed `dataUrl`, `canvas`, or string form |
| Old UI after a push | displayed build SHA and module URL | Update `?rev=` to the full new commit SHA and wait for Pages deployment |

Never put account passwords or tokens in this repository, this document, a skill, a prompt, or a commit.
