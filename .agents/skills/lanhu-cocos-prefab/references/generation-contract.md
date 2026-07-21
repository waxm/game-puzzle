# Generation Contract

## Hierarchy And Components

- Map an image to `Node + UITransform + Sprite`.
- Map text to `Node + UITransform + Label`.
- Map a button to `Node + UITransform + Sprite + Button` when it has a visible background.
- Place button text under the button node, never beside its background.
- Use `Button.transition = SCALE` and a pressed scale of `0.90` unless the project specifies another interaction style.
- Expose code-controlled `Node`, `Label`, `Sprite`, `Button`, `ScrollView`, and `Prefab` references through Inspector properties.
- Fail clearly when a required binding is missing. Do not create replacement business nodes or search recursively at runtime.

## Lists

Treat consecutive containers as a list when they repeat the same children, spacing, avatar/icon, name, value, and action structure.

- Keep only `ScrollView + View + Content` in the panel Prefab.
- Create a separate item Prefab.
- Expose the scroll view, content node, and item Prefab on the panel script.
- Expose dynamic item fields and provide a `setData()`-style entry on the item script.
- Do not statically paste all rows unless the user explicitly requests a visual-only mock.

## Binding Classification

Let product specifications override these defaults.

Fixed text by default:

- Panel titles, tab labels, ordinary button labels, instructions, and fixed feature names.

Dynamic text by default:

- Names, IDs, room numbers, input/placeholder text, quantities, assets, levels, experience, progress, prices, currency, countdowns, and list-item values.

Fixed images by default:

- Panel/dialog backgrounds, title bars, input backgrounds, button backgrounds, selected-tab marks, close icons, and fixed decoration.

Dynamic images by default:

- Avatars, roles/pets, items, currency, rewards, states, quality icons, and list-item images.

Store `binding` and `bindingReason` in generated intermediate specs so later product rules can be reviewed without rediscovering intent.

## Nine-Slice Candidates

Treat button backgrounds, input backgrounds, dialog bases, panel bases, and list-item backgrounds as nine-slice candidates.

- Use `Sprite.type = SLICED` only after setting valid image borders.
- Derive initial borders from corner radius or a defensible non-stretchable edge width.
- Require visual review for textured or irregular backgrounds.

## Module Placement

Use the target project's established module paths. If none exist, default to:

```text
assets/app/ui/lanhu
assets/resources/prefabs/lanhu
assets/resources/textures/lanhu
tools/lanhu-to-cocos/generated
```

Keep panel scripts, Prefabs, textures, and item Prefabs in corresponding semantic modules when promoting generated UI out of the temporary `lanhu` module.

## Source And Layout

- Use the project's design resolution; never assume `640 x 1136` in a new project without inspection.
- Prefer absolute-positioned Lanhu Code output over complex flex approximations.
- Preserve source aspect ratios unless the design clearly stretches an asset.
- Treat masks, shadows, gradients, complex flex, and rounded clipping as review-required features.
- Use Chinese TypeScript comments when the target project uses Chinese comments; otherwise follow its existing language.
