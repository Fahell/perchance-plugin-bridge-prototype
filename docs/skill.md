---
name: perchance-plugin-bridge
version: 2.0.0
description: "Comprehensive guide for building, debugging, and documenting Perchance generators that load an external Vite bundle and call imported AI plugins."
platforms: [linux]
metadata:
  tags: [perchance, generator, plugins, ai-text-plugin, text-to-image-plugin, vite, github-pages, cloudflare, debugging]
  category: software-development
---

# Perchance External-Bundle Plugin Bridge Guide

This document is the durable operating context for agents working on a Perchance generator that uses the following methodology:

1. Perchance hosts the generator and renders its preview.
2. The **Lists** panel imports Perchance plugins only.
3. The **HTML/CSS/JS** panel loads an externally built JavaScript bundle.
4. The external bundle calls the plugin functions exposed by Perchance at runtime.
5. The **Preview** panel is the real integration environment and the primary place to observe behavior.
6. Cloudflare verification, embedded plugin frames, network requests, and browser diagnostics are part of the normal runtime and must be interpreted separately from application failures.

This is not a generic Perchance language tutorial. It describes the external-bundle bridge pattern, its validated behavior, its debugging model, and the discipline required to make the method reusable in other projects.

---

## 1. The mental model

A Perchance generator in this workflow has two different layers:

```text
Perchance generator host
├── Lists panel
│   └── imports plugin names and creates runtime capabilities
├── HTML/CSS/JS panel
│   └── loads the externally hosted application bundle
├── Preview panel
│   └── renders the generated application and plugin output
└── AI Helper panel
    └── assists the author; it is not part of the shipped application

External repository
├── TypeScript source
├── Vite build
├── one browser bundle
└── CI/CD publication, typically GitHub Pages
```

The important boundary is this:

> The Perchance editor is the host and plugin provider. The external repository contains the application implementation.

Do not move application logic into the Lists panel merely because the panel is named “Lists”. In this methodology, Lists is a dependency declaration surface. Do not duplicate plugin imports inside the bundle. The bundle assumes that the host has already imported and initialized the plugins.

---

## 2. The four panels and their responsibilities

### Panel 1 — Lists, top-left

For this methodology, use this panel only for plugin imports:

```perchance
ai = {import:ai-text-plugin}
image = {import:text-to-image-plugin}
```

These declarations are evaluated by Perchance before or while the preview is assembled. They are what make the plugin capabilities available to the runtime bridge.

Do not put the following here unless a project explicitly requires it:

- the application UI;
- the external bundle source;
- application state management;
- lists used as a replacement for application code;
- a second copy of the plugin implementation.

The exact naming matters. If the import is assigned to `ai` and `image`, the external application should look for `root.ai` and `root.image`. Do not assume that a plugin’s page name, URL, or package name is automatically its runtime property name.

### Panel 2 — Preview, top-right

This is the runtime surface. It renders the generated page, usually through an iframe or an embedded context. A successful build or a successful HTTP request is not enough: the bridge is only validated when the application appears here and the plugin calls complete here.

Use the Preview panel to verify:

- the bundle loaded;
- the application mounted;
- the runtime bridge was found;
- text generation streamed and finished;
- image generation resolved and rendered;
- errors are surfaced in the UI rather than silently swallowed.

### Panel 3 — AI Helper, bottom-left

This is Perchance’s authoring assistant. It can generate or edit code in the editor, but it is not a dependency of the generated app and should not be confused with `ai-text-plugin`.

Terminology distinction:

- **AI Helper**: editor-side assistant.
- **AI text plugin**: runtime capability imported in Lists and called by the application.

### Panel 4 — HTML/CSS/JS, bottom-right

This panel contains the host-side loader for the external bundle. A typical loader is:

```html
<script type="module">
  import "https://OWNER.github.io/REPOSITORY/main.bundle.js?rev=FULL_COMMIT_SHA";
</script>
```

The exact URL must point to a deployed JavaScript module with an appropriate JavaScript MIME type. GitHub Pages is a practical option. A raw GitHub URL may be unsuitable if its response headers or module handling are not accepted by the browser.

The panel should stay small. The implementation belongs in the repository, where it can be typechecked, built, reviewed, versioned, and tested in CI.

---

## 3. The runtime bridge

In the validated prototype, the bridge was based on a runtime object/function exposed by Perchance. Treat this as an observed, runtime-dependent integration point rather than a universal API guarantee:

```text
window.root
├── ai     -> AI text plugin function
└── image  -> text-to-image plugin function
```

In this prototype, `root` was callable itself and also had plugin properties. Treat that shape as runtime-dependent: it may be function-like rather than only a plain object, but every new project should verify the shape in its own Preview.

The bundle must not assume that `root` is available at module evaluation time. This lazy-resolution rule is a defensive pattern derived from the prototype; the exact initialization timing is not guaranteed across all Perchance contexts. Module loading, generator initialization, plugin initialization, and embedded contexts may complete in different orders. Resolve the host lazily when a capability is inspected or invoked.

A robust resolver should:

1. check `window.root`;
2. check `window.parent.root` only when permitted by the browser’s same-origin rules;
3. catch access failures explicitly;
4. return a diagnostic that identifies the failed location;
5. expose the result in the application UI or event log.

A lazy proxy can be useful, but it must not turn an unavailable capability into a cryptic later error. Prefer a visible state such as:

```text
root: unavailable
root.ai: unavailable
root.image: unavailable
reason: no root object/function found in this context
```

When reading a plugin property from a root object, preserving the receiver is a defensive compatibility pattern. The prototype used it; it is not a claim that every current plugin requires `this`:

```typescript
const plugin = root.ai;
const callable = typeof plugin === "function" ? plugin.bind(root) : null;
```

This is a compatibility precaution. It costs little and avoids changing the invocation context.

### Do not silently mock the bridge

A local mock can be useful in isolated unit tests, but never substitute a mock during a Perchance integration test. A mock would make a broken host bridge look healthy and destroy the purpose of the experiment.

---

## 4. AI text plugin integration

The Lists import is:

```perchance
ai = {import:ai-text-plugin}
```

The application calls the runtime function, for example:

```typescript
const result = await root.ai({
  instruction: "Write a short story about a lighthouse receiving a message from the future.",
  startWith: "The message began:",
  hideStartWith: false,
  stopSequences: ["END_OF_STORY"],
  endButtons: "none",
  style: "text-align:left; display:block;",
  onStart(data) {
    // generation started
  },
  onChunk(data) {
    // update the visible partial response
    // data.textChunk and data.fullTextSoFar are useful
  },
  onFinish(data) {
    // inspect final text and metadata
  },
});
```

A plain instruction is also supported by the plugin documentation. The pasted console log confirms the request/verification/streaming lifecycle, but it does not independently validate every option or result property listed below; verify those against the current plugin documentation and the project’s own Preview:

```typescript
const result = await root.ai("Explain quantum field theory to a toddler.");
```

The result behaves like text and may also expose metadata. Depending on the plugin version and invocation path, useful properties include:

- `text` — final text including `startWith`, when applicable;
- `generatedText` — generated text excluding `startWith`, when applicable;
- `liveResponseText` — current editable response text;
- `inputs` — effective inputs used by the plugin.

### Validated text lifecycle

The observed console flow establishes the following lifecycle:

```text
application calls ai
  -> ai-text-plugin starts an embed stream
  -> plugin logs effective inputs
  -> keepalive messages are sent while waiting
  -> tokenless verification may be attempted and fail
  -> Cloudflare Turnstile verification is started
  -> a Turnstile token is obtained
  -> verification succeeds
  -> generation request continues
  -> text is streamed back
  -> final text is logged
  -> stream completion is reported to the parent
  -> keepalives stop
```

The first `verifyUser` request returning HTTP 400 and a `failed_verification` status does not necessarily mean generation failed. In the validated run, it was followed by Turnstile verification, successful re-verification, streaming, and a completed result.

### Streaming observability

A text integration should expose at least:

- request started;
- effective instruction/options;
- first callback or stream event;
- partial chunks or a visible partial response;
- final callback;
- final result;
- error and cleanup state.

Do not rely only on the final text. Streaming proves that the callback bridge and asynchronous lifecycle are working.

### `stopSequences` input discipline

If an application provides a UI field for multiple stop sequences, define an unambiguous encoding. For example, use one sequence per line or a visible delimiter:

```text
END_OF_STORY|THE_END
```

Parse it into a non-empty array before calling the plugin:

```typescript
const stopSequences = raw
  .split("|")
  .map((value) => value.trim())
  .filter(Boolean);
```

Do not accidentally split on a literal representation of `\\n` and then conclude that the plugin ignored the option.

---

## 5. Text-to-image plugin integration

The Lists import is:

```perchance
image = {import:text-to-image-plugin}
```

The application can call the plugin with an options object:

```typescript
const result = await root.image({
  prompt: "A tiny observatory on a floating island above a calm ocean at sunrise.",
  negativePrompt: "blurry, low quality, text, watermark",
  resolution: "512x512",
  seed: -1,
  guidanceScale: 7,
  hideGalleryButtons: true,
});
```

The plugin documentation also supports a plain prompt form in JavaScript. The pasted console log confirms successful verification and `/api/generate` completion, but it does not independently validate every option or return shape listed below; verify those against the current plugin documentation and the project’s own Preview:

```typescript
const result = await root.image("a cute mouse");
```

In the prototype, the returned value was string-like and could expose additional properties. Depending on the plugin version and output path, inspect for:

- a canvas;
- a `dataUrl`;
- an image element;
- a string or URL;
- `inputs` containing effective prompt/settings;
- an iframe output object.

Do not hard-code one return shape without observing the deployed runtime. An integration adapter should report the shape it received and then render the recognized representation.

### Validated image lifecycle

The observed console flow establishes this sequence:

```text
application calls image
  -> image-generation embed waits for a token
  -> Turnstile token is obtained
  -> Turnstile verification succeeds
  -> /api/generate is sent
  -> response reports status: success
  -> response includes imageId, fileExtension, seed, prompt, and other metadata
  -> plugin resolves and the application renders the result
```

The image result observed in the run included a server-generated seed even though the UI requested the default/random seed behavior. Treat effective server values as authoritative and display them when available.

### Prompt identity

If the prompt is generated or randomized by the host, evaluate it once and reuse the resulting value. Re-evaluating a random prompt for display can produce a different string from the prompt actually sent to the image service.

Use an explicit variable or captured string:

```typescript
const prompt = buildPromptOnce();
const result = await root.image({ prompt });
showPrompt(prompt);
```

The plugin’s own effective inputs or last-prompt metadata are preferable when available.

---

## 6. Cloudflare and embedded verification

Perchance AI plugins are server-backed. The browser may communicate with plugin-specific embed origins and Cloudflare verification services. Turnstile and related checks are part of the plugin request lifecycle, not part of the application’s bridge implementation.

### What the validated log proves

The successful run showed all of the following:

- `ai-text-plugin init` completed;
- `text-to-image-plugin init` completed;
- the generator initialized;
- the text embed received a stream request;
- the text plugin reported effective inputs and the generator name;
- tokenless verification was not sufficient;
- Turnstile was invoked;
- a Turnstile token was obtained;
- verification succeeded;
- text streamed and finished;
- image Turnstile verification succeeded;
- image `/api/generate` returned success metadata.

### Expected noise and how to classify it

The browser console can contain many messages that are not application failures:

| Message pattern | Interpretation during a successful run |
| --- | --- |
| `static.cloudflareinsights.com ... ERR_BLOCKED_BY_CLIENT` | Analytics beacon blocked by an ad blocker/privacy tool; unrelated to plugin generation. |
| `Allow attribute will take precedence over 'allowfullscreen'` | Browser deprecation/markup warning from the host; not a bridge failure. |
| Cross-origin request to `cdn-cgi/challenge-platform` blocked by CORS | A challenge attempt from an embedded origin was rejected by browser origin policy; inspect whether Turnstile later succeeds. |
| `net::ERR_FAILED 200 (OK)` for a challenge request | The browser reported a CORS-level failure despite an HTTP response; not decisive by itself. |
| `not verified`, `failed_verification`, tokenless verification | Intermediate verification state; do not call the whole generation failed until the final state is known. |
| `Failed to create WebGPU Context Provider` | Cloudflare challenge capability/performance issue; can be transient or fall back to another path. |
| `[Violation] ... handler took ...ms` | Browser performance warning, often caused by challenge work; not proof of application failure. |
| `OTS parsing error` for a WOFF font | Challenge/host font parsing issue; not proof that the plugin call failed. |
| `Avoid using document.write()` | Warning from third-party challenge code; not controlled by the bundle. |
| `Waiting for token...` | Challenge is still pending; wait for a final success or error. |

### Decision rule

Classify the run by terminal application events, not by the presence of any console warning:

- **Success**: plugin result resolves, output is rendered, and the final plugin event reports success/completion.
- **Bridge failure**: bundle cannot find `root`, the plugin property is missing/non-callable, or the bundle fails before the plugin request starts.
- **Service/verification failure**: the plugin request starts but never obtains verification or returns an application-level error.
- **Environment noise**: third-party analytics, challenge warnings, CORS attempts, browser violations, or blocked resources that do not prevent the final result.

Never “fix” Cloudflare noise by changing the application bridge unless the final plugin result actually fails.

### Security rule for logs

Never commit or document:

- Turnstile token values;
- verification/user identifier values returned by the service;
- cookies;
- authorization headers;
- account passwords;
- API keys;
- full challenge URLs containing transient secrets;
- private generator data that is not needed to explain the method.

Redact these values before sharing logs. A console log is diagnostic material, not a safe credential store.

---

## 7. Cross-origin and CDP debugging

The editor page and the rendered preview may use different origins or embedded targets. Parent-page JavaScript may not be able to inspect the preview iframe because of browser same-origin restrictions.

When browser automation is available, use a real local browser session and inspect the preview target through Chrome DevTools Protocol (CDP). Do not assume that a cloud browser can pass Perchance/Cloudflare checks.

A useful workflow is:

1. open the generator in a real browser;
2. connect to the browser’s CDP endpoint;
3. list page targets and identify the Perchance preview target;
4. evaluate diagnostics inside the preview target;
5. inspect DOM text, application status, and console/network events;
6. preserve only redacted, relevant observations.

Useful preview-side expressions include:

```javascript
document.body.innerText
document.querySelectorAll("script").length
JSON.stringify(window.PERCH)
```

If the target is cross-origin, use CDP against the target rather than attempting to cross the iframe boundary from the editor page.

Do not rely on browser automation as the only test. The application’s own diagnostic UI and event log should provide enough evidence to classify most bridge states.

---

## 8. Build and publication contract

The external repository should make the bundle reproducible:

```text
source TypeScript
  -> npm ci
  -> typecheck
  -> Vite build
  -> dist/main.bundle.js
  -> static publication
  -> Perchance module import
```

A single bundle is useful because it minimizes the number of cross-origin resources and makes the imported artifact easy to identify. Configure Vite so the production output has one stable filename and no unexpected dynamic chunks.

The CI workflow should at minimum:

- check out the exact commit;
- install from the lockfile with `npm ci`;
- run typechecking;
- run the Vite build;
- publish the resulting `dist` directory for the deployment branch/job.

A local build proves only that the bundle can be produced. It does not prove that:

- GitHub Pages deployed it;
- the URL has the right MIME type;
- the Perchance editor accepts the module;
- the bridge can resolve `root`;
- the AI services can complete verification.

Validate these layers separately.

---

## 9. Cache and release discipline

Static hosts and CDNs can cache a moving bundle URL. Use a full commit SHA in the module query string:

```text
main.bundle.js?rev=FULL_COMMIT_SHA
```

After every source change:

1. commit and push;
2. wait for CI build and deployment to complete;
3. copy the full SHA of the deployed commit;
4. update `?rev=` in the Perchance HTML/CSS/JS panel;
5. save/reload the generator;
6. confirm the UI displays the new short build SHA;
7. confirm the module URL in the diagnostics contains the new revision.

The revision query does not make deployment instantaneous. It makes the resource identity unambiguous after deployment and prevents the browser/CDN from reusing the previous URL’s cached response.

For a deployed module host, verify the actual response headers. The prototype’s host returned:

```text
HTTP 200
Content-Type: application/javascript
Access-Control-Allow-Origin: *
```

These are verification targets, not guarantees required in exactly this form by every possible host. Do not assume that a raw repository URL satisfies module MIME/CORS requirements.

---

## 10. Observability requirements for reusable projects

Every project using this pattern should expose a small diagnostic surface before adding elaborate features.

At minimum display:

- bundle mounted/not mounted;
- build commit;
- module URL;
- current document URL when safe;
- whether `root` exists;
- whether `root.ai` is callable;
- whether `root.image` is callable;
- root lookup source (`window`, `parent`, or missing);
- a human-readable root lookup error;
- text request state and final/error state;
- image request state and final/error state;
- effective result keys/inputs where safe;
- a bounded event log.

The event log should be bounded and should not be flooded by a polling loop. Update diagnostic cards continuously if needed, but add log entries only when the diagnostic state changes or a meaningful lifecycle event occurs.

For asynchronous calls:

```text
start -> verification/waiting -> streaming or generation -> finish/error -> cleanup
```

Make every terminal path visible. A disabled button, endless spinner, or empty output without an event is an observability failure even if the underlying exception exists in a hidden console.

---

## 11. A repeatable test protocol

### Before testing

- confirm both plugin imports are saved in Lists;
- confirm the bundle URL points to a deployed full SHA;
- confirm the module response is JavaScript;
- open the Preview panel and clear or preserve the console intentionally;
- ensure the browser session is a real local session if Cloudflare verification is involved.

### Bridge test

1. Load the generator.
2. Confirm the bundle mounts.
3. Confirm `root`, `root.ai`, and `root.image` status.
4. If unavailable, stop and diagnose context/origin/import order before making plugin requests.

### Text test

1. Start with a plain instruction.
2. Add `startWith`.
3. Observe partial output and `onChunk` events.
4. Observe final output and `onFinish`.
5. Test `hideStartWith`, `stopSequences`, and `style` one at a time.
6. Record effective inputs and terminal console events without copying tokens.

### Image test

1. Start with a simple prompt.
2. Observe the verification wait.
3. Confirm `/api/generate` reaches an application-level success.
4. Inspect the result representation and effective seed/prompt.
5. Test negative prompt, resolution, seed, and guidance settings one at a time.
6. Keep requests sparse because generation is server-backed and may be queued or limited.

### After testing

Record:

- generator URL;
- deployed bundle SHA and URL;
- plugin availability;
- terminal result for each plugin;
- relevant errors only;
- browser/environment notes;
- any behavior that differs from this guide.

Update this guide with stable, repeatable findings—not transient challenge tokens or one-off URLs.

---

## 12. Troubleshooting matrix

| Symptom | Interpret first | Next action |
| --- | --- | --- |
| Bundle does not appear | module request, MIME, Pages deployment, Perchance error panel | Fix publication/loader before debugging plugins. |
| Bundle appears but `root` is missing | root source/error and preview context | Verify the code runs in the Perchance preview context and inspect same-origin restrictions. |
| `root` exists but `ai`/`image` is missing | Lists imports and exact runtime property names | Save plugin imports, reload, and inspect the runtime rather than guessing aliases. |
| Text starts but never finishes | verification, keepalive, token, terminal stream events | Determine whether it is waiting for Cloudflare or failed at the service layer. |
| Text has no chunks but eventually resolves | callback support/version behavior | Trust terminal output first, then document the observed callback behavior. |
| Image starts but no image appears | final `/api/generate` status and returned shape | Inspect result keys/data URL/canvas/iframe and adapt rendering. |
| Console has CORS/Cloudflare errors but output succeeds | terminal application result | Treat intermediate challenge warnings as noise for that run. |
| Old bundle remains after deployment | displayed build SHA and module URL | Wait for deployment, then change `?rev=` to the exact full SHA. |
| UI becomes hard to debug | event log and polling volume | Keep logs bounded and deduplicate periodic diagnostics. |

---

## 13. Security and operational boundaries

- Never store credentials in skills, source files, README files, commits, or prompts.
- Never publish challenge tokens, user keys, cookies, or authorization material.
- Do not ask agents to bypass Cloudflare programmatically. Use a normal user-controlled browser session when a challenge must be completed.
- Do not treat a third-party browser warning as an application bug without checking the terminal plugin result.
- Do not send unnecessary generation requests while debugging; text and image plugins consume server resources and may queue requests.
- Keep the application bundle independent of Perchance plugin implementation details wherever possible, but document every empirically validated runtime assumption.
- Treat plugin options and returned object shapes as versioned compatibility observations, not immutable universal laws.

---

## 14. Known limitations

This guide is an operational record of one successful prototype and should complement—not replace—the current official Perchance and plugin documentation. Plugin option names, initialization timing, runtime exposure, verification behavior, and return shapes can change. Repeat the real Preview test for every new project and record deviations rather than treating this guide as a frozen API specification.

The supplied console log proves the plugin initialization and terminal generation flows, but it does not independently prove every internal detail of the bridge resolver. The bridge was also validated by the prototype’s visible UI and successful results; keep those forms of evidence separate when diagnosing a new integration.

## 15. Current validated baseline

The minimum prototype that motivated this guide successfully demonstrated:

- Lists-only plugin imports;
- an externally hosted Vite TypeScript bundle;
- runtime access to both text and image plugin capabilities;
- streamed text completion;
- image generation success with server metadata;
- Cloudflare/Turnstile verification as part of normal service flow;
- visible application diagnostics and bounded event logging;
- GitHub Actions build and GitHub Pages publication;
- commit-query cache busting;
- safe handling of credentials and diagnostic logs.

Future projects may choose a different framework, host, or UI, but they should preserve the same separation of responsibilities, lazy bridge resolution, terminal-state observability, cache discipline, and redaction rules.
