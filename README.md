# Perchance Plugin Bridge Prototype

Small, observable prototype for learning how a Vite bundle loaded by a Perchance generator can call the `ai-text-plugin` and `text-to-image-plugin` imported in the generator's **Lists** panel.

This project intentionally does **not** import the Perchance plugins in its source code. The plugins are imported by Perchance in the separate Lists panel, while this bundle only resolves and calls the runtime bridge.

## Local validation

```bash
npm ci
npm run check
```

`npm run build` produces one browser module at `dist/main.bundle.js`.

## Perchance setup

In the Lists panel, keep only the plugin imports needed by the experiment:

```perchance
ai = {import:ai-text-plugin}
image = {import:text-to-image-plugin}
```

In the HTML/CSS/JS panel, load the bundle after replacing `<commit-sha>` with a full commit SHA:

```html
<script type="module">
  import "https://fahell.github.io/perchance-plugin-bridge-prototype/main.bundle.js?rev=<commit-sha>";
</script>
```

The `?rev=` value is deliberately tied to the commit. Change it after every update. This avoids relying on a stale browser/CDN cache while making the exact deployed source obvious in the Perchance editor. The UI also displays the module URL and build commit for diagnosis.

If GitHub Pages is not available yet, the same `dist/main.bundle.js` can be served by another static host. Avoid importing a module from a raw GitHub URL unless its response has a JavaScript MIME type accepted by the browser.

## What the demo observes

- Whether `window.root` can be resolved in the preview context.
- Whether `root.ai` and `root.image` are callable.
- Text generation lifecycle: start, chunks, finish, result metadata, and errors.
- Image generation lifecycle, returned data URL/canvas shape, prompt, and options.
- Module URL, document URL, build commit, and recent bridge events.

The bridge is intentionally fail-loud: unavailable runtime capabilities are shown in the UI rather than becoming an unexplained `is not a function` error.

## Important runtime notes

- The plugins run on Perchance infrastructure and may be subject to ads, queueing, moderation, and service limits.
- Text and image generation can incur external requests; use the buttons deliberately during experiments.
- A successful local build proves bundling only. A successful Perchance run is required to validate the runtime bridge.
- The exact `root` exposure and option behavior should be treated as an empirical compatibility contract and recorded in the integration notes.
