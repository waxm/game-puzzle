---
name: lanhu-cocos-prefab
description: Convert Lanhu (蓝湖/lanhuapp.com) design URLs, design slices, or exported HTML/CSS into reusable Cocos Creator 3.8.x textures, Prefabs, panel scripts, item Prefabs, and explicit Inspector bindings. Use when generating, rebuilding, comparing, fixing, or optimizing Lanhu-derived Cocos UI in any project, including list recognition, nine-slice candidates, binding classification, Creator import validation, and cross-project migration of the conversion workflow.
---

# Lanhu Cocos Prefab

Treat this Skill directory as the shared implementation. Resolve the directory containing this `SKILL.md` as `<skill-dir>` and run its bundled scripts directly. Do not copy conversion rules into a project's `AGENTS.md` or create a divergent project-local generator unless compatibility requires it.

## Runtime Requirements

- Node.js 18 or newer. The bundled scripts use only Node built-in modules and do not require `npm install` for the Skill itself.
- Network access to the configured Lanhu MCP service and returned image URLs for URL or slice generation.
- A local Cocos Creator installation for import, Inspector binding, preview, and final verification.

## Select The Input Mode

Choose the richest available input:

1. Use Lanhu slices for production visual assembly when a URL and design name are available.
2. Use exported HTML/CSS when Lanhu Code output is available and mostly absolute-positioned.
3. Use the whole-image URL fallback only for visual reference or interaction-area prototypes. Do not present it as a production node hierarchy.

Read [references/generation-contract.md](references/generation-contract.md) before creating or changing Prefab structure. Read [references/project-adaptation.md](references/project-adaptation.md) when entering a new project. Read [references/verification.md](references/verification.md) before reporting completion.

## Inspect The Target Project

Resolve the project root from the request or current workspace, then run:

```bash
node "<skill-dir>/scripts/inspect-project.mjs" --project "/absolute/project/path"
```

Use its result to confirm Creator version, design resolution, existing UI base/resource manager, and module directories. Follow explicit user requirements and established project conventions; use Skill defaults only when the project has no convention.

## Generate

### Lanhu slices

```bash
node "<skill-dir>/scripts/generate-from-lanhu-slices.mjs" \
  --url "<lanhu-url>" \
  --design "<design-name>" \
  --panel UIExamplePanel \
  --project "/absolute/project/path"
```

Available specialized flags are `--dialog-only`, `--fill-text`, `--rename-dialog`, `--visit-friends-dialog`, and `--recycle-rewards-dialog`. Use them only when the requested design matches their semantics.

### HTML/CSS

```bash
node "<skill-dir>/scripts/generate-from-html-css.mjs" \
  --html "/absolute/page.html" \
  --css "/absolute/index.css" \
  --panel UIExamplePanel \
  --project "/absolute/project/path"
```

### Whole-image fallback

```bash
node "<skill-dir>/scripts/generate-from-lanhu-url.mjs" \
  --url "<lanhu-url>" \
  --panel UIExamplePanel \
  --project "/absolute/project/path"
```

Label fallback output clearly. Replace it with slices or HTML/CSS before integrating production business logic.

## Complete The Prefab

The generators produce the repeatable visual starting point. They do not replace target-project business integration or Creator Inspector work. After visual generation:

1. Compare hierarchy, positions, text, opacity, clipping, and repeated structures with the source design.
2. Split repeated structures into item Prefabs and bind `ScrollView`, content, and item Prefab explicitly.
3. Generate or update panel scripts according to the target project's base UI class and resource manager.
4. Bind every code-controlled node through Inspector properties. Do not create missing business UI nodes at runtime or hide missing bindings with recursive lookup.
5. Preserve existing `.meta` files and resource UUIDs when regenerating an existing asset.
6. If the first structure is fundamentally wrong, rebuild the affected Prefab and script from the source specification instead of stacking patches.

## Import And Verify

Open the target project in Creator and wait for import before binding custom scripts. Never guess compressed script class IDs. Resolve them from the script `.meta` UUID and Creator's actual compiled output.

Run the portable validator after import:

```bash
node "<skill-dir>/scripts/validate-prefabs.mjs" \
  --project "/absolute/project/path" \
  --prefab "assets/resources/prefabs/lanhu/UIExamplePanel.prefab"
```

Then run the project's TypeScript and asset checks, open the Prefab in Creator, and preview at the project's design resolution. Inspect the first console error and repeat open/close behavior before claiming completion.

## Lanhu MCP

The URL and slice tools use this optional environment variable:

```bash
export LANHU_MCP_URL="https://example.com/mcp"
```

They use a bundled minimal Streamable HTTP client, so no external MCP SDK path is required. If `LANHU_MCP_URL` is omitted, the scripts use their bundled service URL.

If the service returns authentication, timeout, or server errors, report the failure and stop. Never fabricate design data. A local reference image may be used only as an explicitly labeled fallback.
