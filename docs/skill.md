---
name: perchance-editor
description: "Perchance.org 4-panel editor, login, AI helper, code panels."
version: 1.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [perchance, editor, creative, no-code]
    category: software-development
---

# Perchance.org Editor

## Login
URL: https://perchance.org/{generator-id}
- Click "login" (top-right, 🔑 icon)
- Use credentials supplied interactively by the owner only; never store passwords or tokens in this skill, repository, prompts, or commits.
- After login, button changes to "account" (👤)

> Security note: this skill previously contained a plaintext password. It was removed and must not be used. If it was a real credential, revoke or rotate it.

### Project-specific panel convention
- Panel 1 (Lists) is reserved for importing the Perchance plugins used by the experiment.
- Do not put application lists or generator logic there for this project.
- Panel 4 (HTML/CSS/JS) loads the externally hosted bundle; the application logic lives in the Git repository.
- Panel 3 (AI Helper) is an editor assistant, not part of the generated application.
- Panel 2 (Preview) is the runtime surface where the bundle and plugin calls are observed.

## Editor Layout (4 panels)

```
┌──────────────────┬──────────────────┐
│  PAINEL 1        │  PAINEL 2        │
│  Listas/Sintaxe  │  Preview         │
│  (dark editor)   │  (white iframe)  │
├──────────────────┼──────────────────┤
│  PAINEL 3        │  PAINEL 4        │
│  AI Helper       │  HTML/CSS/JS     │
│  (chat + Send)   │  (dark editor)   │
└──────────────────┴──────────────────┘
```

### Panel 1 — Listas/Sintaxe (top-left)
- Dark code editor with line numbers
- For this project, used only for plugin imports:
  - `ai = {import:ai-text-plugin}`
  - `image = {import:text-to-image-plugin}`
- Application logic and UI do not go here.

### Panel 2 — Preview (top-right)
- White area, renders generator in an iframe
- Controls: fullscreen, auto-reload checkbox, reload button
- Shows errors: red "This page has errors" button

### Panel 3 — AI Helper (bottom-left)
- Chat interface for AI-assisted code generation
- Text input: "Ask the AI helper to build or change something..."
- Buttons: files, undo, redo, attach, new chat, Send

### Panel 4 — HTML/CSS/JS (bottom-right)
- Dark code editor for raw HTML, CSS, JavaScript

## Navigation
- Top bar: forum, hub, learn, generators, new, account
- Panel dividers: drag to resize
- "edit" button toggles 4-panel view from preview-only

## CDP Access (Monitor Preview Iframe)

### Connect
- Open Brave: `hermes-brave` (alias in ~/.bash_aliases)
- Then `/browser connect` in Hermes terminal

### Preview Iframe Access
The preview panel is an iframe with cross-origin isolation. JS from parent
page CANNOT access it. Must use CDP WebSocket directly.

**Find iframe target ID:**
```bash
curl -s http://127.0.0.1:9222/json/list | python3 -c "
import json,sys
for p in json.load(sys.stdin):
  if 'perchance.org' in p.get('url','') and p['url'] != 'https://perchance.org/qmftp3fm1e#edit':
    print(p['id'], p['url'][:80])"
```

**Evaluate in iframe context (Python):**
```python
import json, asyncio, websockets

async def eval_iframe(target_id, expression):
    ws_url = f'ws://127.0.0.1:9222/devtools/page/{target_id}'
    async with websockets.connect(ws_url) as ws:
        msg = json.dumps({'id': 1, 'method': 'Runtime.evaluate',
            'params': {'expression': expression, 'returnByValue': True}})
        await ws.send(msg)
        resp = json.loads(await ws.recv())
        return resp.get('result', {}).get('result', {}).get('value', '')
```

**Useful expressions for iframe:**
- `document.body.innerHTML` — full HTML content
- `document.body.innerText` — visible text only
- `JSON.stringify(window.PERCH)` — generator runtime state
- `document.querySelectorAll('script').length` — script count

### Panel IDs
- Parent page: `perchance.org/qmftp3fm1e#edit`
- Preview iframe: `*.perchance.org/qmftp3fm1e` (different subdomain)
- Console output iframe: `id="console-output"` (parent page)

## Bundle Integration Pattern

### How Plugins Connect to Code

**Panel 1 (Lists) — imports only; no application lists:**
```
ai = {import:ai-text-plugin}
image = {import:text-to-image-plugin}
```
Isso faz `window.root.ai` e `window.root.image` ficarem disponíveis em runtime.

O bundle acessa `root.ai()` e `root.image()` via bridge.


### Bridge: Acesso ao window.root

`window.root` é uma FUNÇÃO com propriedades (ai, image, etc), não objeto comum.
Quando bundle carrega via `import()` no iframe do Panel 4, root pode não existir
ainda. Usa-se Proxy LAZY:

```typescript
function resolveRoot() {
  if (typeof window === "undefined") return null;
  const win = window;
  if (win.root && (typeof win.root === "object" || typeof win.root === "function"))
    return win.root;
  try {
    if (window.parent && window.parent !== window)
      return window.parent.root;  // iframe fallback
  } catch {} // cross-origin
  return null;
}

export const root = new Proxy({} as PerchanceRoot, {
  get(_, prop) {
    const r = resolveRoot();
    return r ? r[prop as keyof PerchanceRoot] : undefined;
  }
});
```

### root.ai() — AI Text Plugin

**Uso básico:** `root.ai("instruction text")` ou `root.ai(options)`

**Opções:**
- `instruction` (string|function) — prompt para o modelo
- `startWith` (string) — força resposta começar com este texto
- `hideStartWith` (boolean) — esconde startWith do output
- `stopSequences` (string[]) — para geração ao encontrar texto
- `endButtons` ("none" ou string) — botões pós-geração
- `guidanceScale` (number 1-100) — criatividade (maior = mais criativo)
- `style` (string) — estilo de escrita
- `outputTo` (HTMLElement|string) — elemento DOM para renderizar
- `render` (function) — render customizado de cada chunk

**Callbacks (streaming):**
- `onChunk({textChunk, fullTextSoFar, isFromStartWith})` — cada chunk recebido
- `onStart({inputs})` — quando geração inicia
- `onFinish({text, generatedText, liveResponseText, inputs})` — quando termina

**Exemplo em JS puro:**
```javascript
root.ai({
  instruction: "Write a story about a dragon",
  startWith: "Once upon a time",
  guidanceScale: 75,
  outputTo: document.getElementById("output"),
  onFinish: (data) => console.log("Done:", data.generatedText)
});
```

### root.image() — Text to Image Plugin

**Uso:** `root.image(options)` — retorna Promise<ImageElement>

**Opções:**
- `resolution` ("auto"|"1:1"|"16:9"|"9:16") — proporção da imagem
- `removeBackground` (boolean) — remove fundo
- `seed` (number) — semente para resultado determinístico
- `guidanceScale` (number 1-20) — aderência ao prompt (maior = mais fiel)
- `negativePrompt` (string) — o que evitar na imagem
- `hideGalleryButtons` (boolean) — esconde botões de galeria
- `style` ("none"|"real"|"anime"|"3D"|"cartoon"|"comic"|"pixel-art"|"sketch")

**Variável útil:** `[lastTextToImagePrompt]` — último prompt usado

**Exemplo em JS puro:**
```javascript
const img = await root.image({
  resolution: "1:1",
  removeBackground: true,
  seed: 42,
  style: "real"
});
document.getElementById("gallery").appendChild(img);
```

### Build Pipeline
- Source: TypeScript + Vite
- Output: `dist/main.bundle.js` (single file, all bundled)
- Publish: npm package + jsDelivr CDN
- Panel 4 imports via `<script type="module">` + dynamic `import()`

## Cloudflare
- Site uses Cloudflare Turnstile
- Use CDP browser (`/browser connect`) to bypass — user can manually solve challenges
- Never use cloud browser for perchance.org (bot detection blocks it)
