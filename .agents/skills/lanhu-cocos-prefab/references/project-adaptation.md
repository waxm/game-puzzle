# Project Adaptation

Use this precedence order:

1. The user's current request and supplied source design.
2. Target-project rules and existing code/resource conventions.
3. This Skill's generation contract.
4. Default `lanhu` module paths.

Project rules determine paths, naming, base classes, resource loading, design resolution, and validation commands. This Skill owns the reusable Lanhu conversion workflow, mapping rules, binding heuristics, and bundled generators. Do not duplicate those reusable rules into every project.

Before generation, inspect:

- `package.json` and Creator version.
- `settings/v2/packages/project.json` design resolution.
- Existing Prefab, texture, and UI script module directories.
- UI base class, resource manager, and required binding assertion pattern.
- Existing `.meta` files for assets being regenerated.
- Project-specific validation scripts.

When the project differs from bundled-script defaults, adapt the generated result in a repeatable generator or add a reusable option to this Skill. Do not hardcode a second project's absolute path into the Skill.

Treat project-local `tools/lanhu-to-cocos` directories as legacy or project-specific extensions. Prefer the bundled scripts. If a project-local fix is generally useful, migrate it back into this Skill so future projects receive it.
