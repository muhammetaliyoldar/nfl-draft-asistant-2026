# Graph Report - nfl-fantasy-draft-asistan-2026  (2026-09-01)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 155 nodes · 269 edges · 9 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `62410e82`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- import-rankings.ts
- compilerOptions
- scripts
- devDependencies
- App.tsx
- index.ts
- types.ts
- recommend.ts

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `consensus()` - 11 edges
3. `importRankings()` - 9 edges
4. `recommendationsForPick()` - 8 edges
5. `scripts` - 8 edges
6. `getPlayers()` - 7 edges
7. `normalizeName()` - 6 edges
8. `refreshPlayerCatalog()` - 6 edges
9. `parseMarkdownFile()` - 6 edges
10. `Position` - 5 edges

## Surprising Connections (you probably didn't know these)
- `recommendationsForPick()` --calls--> `consensus()`  [EXTRACTED]
  server/recommend.ts → server/consensus.ts
- `liveState()` --calls--> `getPlayers()`  [EXTRACTED]
  server/index.ts → server/database.ts
- `parseMarkdownFile()` --calls--> `normalizeName()`  [EXTRACTED]
  server/markdown.ts → server/database.ts
- `importRankings()` --calls--> `parseAllMarkdown()`  [EXTRACTED]
  server/import-rankings.ts → server/markdown.ts
- `consensus()` --calls--> `getEntries()`  [EXTRACTED]
  server/consensus.ts → server/database.ts

## Import Cycles
- None detected.

## Communities (9 total, 0 thin omitted)

### Community 0 - "import-rankings.ts"
Cohesion: 0.15
Nodes (24): avg(), consensus(), ensureKickerDefense(), formatWeight(), nflTeams, aliases(), clearManualPicks(), dataDir (+16 more)

### Community 1 - "compilerOptions"
Cohesion: 0.08
Nodes (23): DOM, DOM.Iterable, ES2022, server, src, vite.config.ts, compilerOptions, allowJs (+15 more)

### Community 2 - "scripts"
Cohesion: 0.09
Nodes (21): express, graphify, dependencies, express, graphify, react, react-dom, name (+13 more)

### Community 3 - "devDependencies"
Cohesion: 0.10
Nodes (21): concurrently, devDependencies, concurrently, tsx, @types/express, @types/node, @types/react, @types/react-dom (+13 more)

### Community 4 - "App.tsx"
Cohesion: 0.18
Nodes (15): api(), App(), BoardSuggestion, Dashboard(), DemoControls(), errorMessage(), ManualPick(), mySlot() (+7 more)

### Community 5 - "index.ts"
Cohesion: 0.26
Nodes (13): getManualPicks(), app, cachedPicks, dist, liveState(), connect(), getPicks(), getUserLeagues() (+5 more)

### Community 6 - "types.ts"
Cohesion: 0.21
Nodes (13): asPosition(), cleanPlayer(), meta(), parseAllMarkdown(), parseMarkdownFile(), BoardSuggestion, ConsensusPlayer, DraftState (+5 more)

### Community 7 - "recommend.ts"
Cohesion: 0.35
Nodes (9): draftSlotForPick(), nextPickForRoster(), positionNeeded(), recommendations(), recommendationsForPick(), scarcity(), survivalChance(), base (+1 more)

## Knowledge Gaps
- **61 isolated node(s):** `SleeperPlayer`, `BoardSuggestion`, `Pick`, `Position`, `Rec` (+56 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 64 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `devDependencies` to `scripts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **What connects `SleeperPlayer`, `BoardSuggestion`, `Pick` to the rest of the system?**
  _61 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `import-rankings.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.14814814814814814 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._