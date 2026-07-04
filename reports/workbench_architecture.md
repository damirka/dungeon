# Workbench Architecture

The React workbench is now the main editor surface. The old standalone HTML
tools are kept under `public/legacy/` as temporary adapters, not as the desired
long-term architecture.

## Current Shape

- `src/App.tsx` only selects the active workspace and owns the top-level shell.
- `src/features/workbench/` owns workspace registration, chrome, tabs, and
  persisted selection state.
- `src/features/playtest/` owns playtest-specific tools and native balance
  summary surfaces.
- `src/features/mappers/` owns separate character, FX, and item mapper surfaces.
- `src/features/level-building/` owns future level-building surfaces.
- `src/features/legacy/` is the quarantine zone for iframe-backed tools.
- `src/services/api.ts` owns `/api`, `/data`, and JSON resource access.
- `src/lib/format.ts` owns shared display formatting.

## Migration Direction

1. Keep legacy pages working through `LegacyToolFrame` while each feature gets a
   native React replacement.
2. Extract data transforms before extracting UI controls. Mapper and playtest
   behavior should become testable TypeScript modules before they become fancy
   views.
3. Preserve source data contracts in `data/` and the live save endpoints in
   the native `mapperApi()` Vite plugin (`tools/mapperApi.mjs`).
4. Move one workflow at a time: first summary/read surfaces, then filters and
   selection, then edit forms, then save/export.
5. Avoid cross-feature imports except through `services`, `lib`, or
   `features/workbench`.

## Parallel Work Lanes

- Playtest can evolve combat controls, Auto analysis, and metric comparison
  without touching mapper files.
- Mappers can evolve character, FX, and item editing independently while sharing
  the same API client and legacy adapter.
- Level building can introduce route and encounter planning against existing
  catalog data without blocking playtest work.
