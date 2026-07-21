# Verification

## Static Checks

1. Parse every generated Prefab as JSON.
2. Validate all `__id__` references.
3. Validate node parent/child symmetry.
4. Validate component ownership symmetry.
5. Validate referenced asset UUIDs after Creator import.
6. Preserve Prefab, script, texture, and SpriteFrame `.meta` UUIDs during regeneration.
7. Run the target project's TypeScript check.

## Creator Checks

1. Wait for Creator to reimport scripts and assets.
2. Confirm no `Missing Script`, `Can not find class`, deserialization, or missing UUID errors.
3. Open the generated Prefab and inspect its hierarchy.
4. Verify all required Inspector properties.
5. Preview at the exact project design resolution.

## Visual And Interaction Checks

- Compare positions, dimensions, text wrapping, opacity, clipping, layer order, and touch areas with Lanhu.
- Confirm button labels are children and button feedback works.
- Confirm lists use item Prefabs and scroll correctly.
- Confirm repeated open/close does not duplicate events or flash default content.
- Check the first console error before investigating later symptoms.

Do not claim Creator verification when only disk files or JSON validation were checked. State every verification step that could not be run.
