# Support Knowledge Hybrid Search V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a locally testable public Support Knowledge MVP that imports the reviewed public corpus, combines ordinary Algolia keyword retrieval with exact-scan semantic retrieval, exposes source passages in the KB UI, and teaches public and internal support skills to use the same evidence.

**Architecture:** A manual importer converts an explicit local `support-knowledge` checkout into the docs application's existing public KB snapshot. A build-time script embeds normalized KB section records with `text-embedding-3-small` at 256 dimensions and checks in a compact artifact; the server embeds only the query, scans that artifact, and deterministically fuses semantic and keyword ranks. The browser and skills consume the same read-only search endpoint and canonical pages; no component generates an answer.

**Tech Stack:** Bun, TypeScript, Next.js 16 route handlers and React 19, existing Algolia v5 client, OpenAI Embeddings HTTP API, Effect-based Composio CLI installer, Markdown agent skills.

**Spec:** `docs/superpowers/specs/2026-08-17-support-knowledge-hybrid-search-design.md`

## Global Constraints

- Work only on local branches; do not push and do not create a pull request in `ComposioHQ/composio`.
- Preserve all pre-existing uncommitted KB UI and verification changes in the docs worktree; stage only files owned by each task.
- Treat `ComposioHQ/support-knowledge` as authoritative, but import only leaves whose filename and frontmatter classification are both `public`.
- Never write to the `support-knowledge` checkout and never include `customer-safe` content or metadata in a public artifact.
- Keep global Docs search unchanged; `/kb/search` is the only V1 hybrid UI.
- Do not use Algolia NeuralSearch, generated answers, query rewriting, LLM reranking, a vector database, or an agent retrieval loop.
- Use OpenAI `text-embedding-3-small` with exactly 256 dimensions.
- Retrieve at most 50 candidates per retriever, fuse with Reciprocal Rank Fusion constant `60`, deduplicate to the strongest section per canonical page, and display at most 20 pages.
- If either retriever fails, serve the other and report a provider-neutral degradation reason; never widen the corpus beyond public KB records.
- Keep the existing public `composio` skill as the only user-facing skill and add a
  simple Knowledge Base fallback to its canonical-information sources.
- The first internal integration searches public KB content only. Authenticated `customer-safe` retrieval remains deferred.

---

## File Structure

### Docs application

- `docs/lib/kb/support-knowledge.ts`: parse schema-v4 source metadata, discover public leaves, normalize headings, build a schema-v2 docs snapshot in memory, and reject privacy or integrity violations.
- `docs/scripts/import-support-knowledge.ts`: validate a source checkout, stage a snapshot, validate it through `buildKbCatalog`, and atomically replace `docs/kb` only after success.
- `docs/lib/knowledge/semantic-artifact.ts`: define the checked-in artifact schema, encode/decode normalized float32 vectors, validate source/model/hash invariants, and exact-scan vectors.
- `docs/lib/knowledge/embeddings.ts`: deterministic embedding text, SHA-256 content hashes, and the server-side OpenAI embedding HTTP client.
- `docs/scripts/build-kb-semantic-index.ts`: build or incrementally refresh `docs/kb/semantic-index.json` from public KB search records.
- `docs/lib/knowledge/hybrid-search.ts`: exact-match pinning, RRF fusion, stable tie breaking, and canonical-page deduplication.
- `docs/app/api/knowledge-search/route.ts`: obtain keyword and semantic candidates independently, degrade safely, and return the V1 response contract.
- `docs/app/(home)/kb/search/page.tsx`, `docs/components/kb/knowledge-search-form.tsx`, `docs/components/kb/knowledge-search-results.tsx`: make this surface KB-only while preserving the owner's existing local edits.
- `docs/evals/kb-search-v1.json`, `docs/scripts/eval-kb-search.ts`: checked-in sanitized queries and baseline/hybrid retrieval metrics.
- `docs/tests/static/kb-import.test.ts`, `docs/tests/static/kb-semantic-artifact.test.ts`, `docs/tests/static/kb-hybrid-search.test.ts`, `docs/tests/static/knowledge-search.test.ts`, `docs/tests/static/knowledge-hub.test.tsx`: focused regression coverage.
- `docs/decisions/public-knowledge-base.md`: replace obsolete source/retrieval assumptions with the V1 decision and deferred boundaries.

### Unified public skill

- `skills/composio/SKILL.md`: keep the main skill open-ended and add the public KB
  URL and read-only search endpoint as fallback sources.
- `docs/lib/source.ts`: advertise the repository's single installable `composio`
  skill without a companion support skill.

### Internal support skills

- `/Users/sohambasu/Documents/composio/support/support-workflows/skills/support-knowledge/SKILL.md`: shared public KB lookup contract.
- `/Users/sohambasu/Documents/composio/support/support-workflows/skills/draft-support-response/SKILL.md`: search before drafting or invoking legacy material.
- `/Users/sohambasu/Documents/composio/support/support-workflows/skills/support-debug-issue/SKILL.md`: search after thread hydration and before operational debugging.
- `/Users/sohambasu/Documents/composio/support/claude-config/skills/support/support-knowledge/SKILL.md`: legacy configuration's shared lookup contract.
- `/Users/sohambasu/Documents/composio/support/claude-config/skills/support/{faq,platform-faq,toolkit-faqs,reply,triage}/SKILL.md`: make public KB retrieval authoritative for product facts.
- `/Users/sohambasu/Documents/composio/support/claude-config/skills/support/decimal-chat/SKILL.md`: replace the credential-bearing legacy integration with a short deprecation redirect to shared KB retrieval.

---

### Task 1: Import `support-knowledge` Safely

**Files:**
- Create: `docs/lib/kb/support-knowledge.ts`
- Create: `docs/scripts/import-support-knowledge.ts`
- Create: `docs/tests/static/kb-import.test.ts`
- Modify: `docs/package.json`
- Modify: `docs/decisions/public-knowledge-base.md`

**Interfaces:**
- Produces: `parseSupportKnowledgeDocument(raw, relativePath): SupportKnowledgeDocument`.
- Produces: `buildSupportKnowledgeSnapshot({ sourceRoot, sourceCommit, previousManifest, now }): { manifest: KbManifest; sourceFiles: Map<string, string>; articleFiles: Map<string, string> }`.
- Produces CLI: `bun run import:kb -- --source-root <absolute-path> --source-commit <sha>`.
- Preserves legacy URLs by assigning every prior guide slug and alias for a source leaf to that leaf's generated guide aliases.

- [ ] **Step 1: Write importer tests that describe the privacy and stability contract**

  Create fixtures inside the test's temporary directory with one valid `public.md`, one valid `customer-safe.md`, one mismatched filename/classification pair, and a previous manifest with two old slugs for the public leaf. Assert:

  ```ts
  const snapshot = buildSupportKnowledgeSnapshot({
    sourceRoot,
    sourceCommit: 'abc1234',
    previousManifest,
    now: new Date('2026-08-17T00:00:00Z'),
  });
  expect([...snapshot.sourceFiles.keys()]).toEqual(['toolkits/github/public.md']);
  expect(JSON.stringify(snapshot)).not.toContain('customer-safe');
  expect(snapshot.manifest.source.repository).toBe('ComposioHQ/support-knowledge');
  expect(snapshot.manifest.guides[0]?.aliases).toEqual(
    expect.arrayContaining(['github-troubleshooting', 'old-github-answer']),
  );
  expect(() => buildSupportKnowledgeSnapshot({
    sourceRoot: mismatchedRoot,
    sourceCommit: 'abc1234',
    previousManifest,
    now: new Date('2026-08-17T00:00:00Z'),
  })).toThrow('classification does not match filename');
  ```

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `cd docs && bun test tests/static/kb-import.test.ts`

  Expected: FAIL because `@/lib/kb/support-knowledge` does not exist.

- [ ] **Step 3: Implement the source parser and deterministic snapshot builder**

  Parse only the source schema fields `type`, `title`, `description`, `classification`, `product`, `category`, `owner`, `timestamp`, `last_reviewed`, `review_by`, and `tags`. Require a level-one title and at least one non-empty level-two answer section. Normalize each copied source to the existing docs parser's exact frontmatter:

  ```ts
  export interface SupportKnowledgeDocument {
    relativePath: string;
    title: string;
    description: string;
    classification: 'public' | 'customer-safe';
    products: string[];
    categories: string[];
    tags: string[];
    timestamp: string;
    lastReviewed: string;
    reviewBy: string;
    body: string;
    headings: string[];
  }

  export function buildSupportKnowledgeSnapshot(input: {
    sourceRoot: string;
    sourceCommit: string;
    previousManifest?: KbManifest;
    now: Date;
  }): SupportKnowledgeSnapshot;
  ```

  Generate one canonical guide per public leaf, include all of its H2 headings as `sources`, derive a stable path-based slug, and map supported categories to the existing topic catalog. Set `articlePath` to `<slug>.md`, strip the source H1, and copy the remaining source prose into `articleFiles` without frontmatter so the generated page always reflects the imported snapshot. Sort every file, guide, topic, source, and alias deterministically.

- [ ] **Step 4: Add the atomic CLI wrapper**

  The command must require an absolute `--source-root`, call the source repository's own `python3 scripts/validate-kb.py` first, stage `manifest.json`, `source/`, and `articles/` in a sibling temporary directory, call `buildKbCatalog` against the staged files, then rename into place. On any error, remove only the validated staging path and keep the previous `docs/kb` intact. Add:

  ```json
  "import:kb": "bun scripts/import-support-knowledge.ts"
  ```

- [ ] **Step 5: Run importer tests and current KB regression tests**

  Run: `cd docs && bun test tests/static/kb-import.test.ts tests/static/kb-catalog.test.ts tests/static/kb-generation.test.ts`

  Expected: PASS, including proof that serialized snapshots contain no `customer-safe` string.

- [ ] **Step 6: Update the decision record**

  Record `ComposioHQ/support-knowledge` as authoritative, manual pull-only import as V1, public-only enforcement at import time, ordinary Algolia keyword retrieval plus the checked-in semantic artifact, no NeuralSearch/vector DB/generation, and public skills as consumers. Remove the old `support-workflows` source-of-truth and keyword-only statements.

- [ ] **Step 7: Commit only importer-owned files locally**

  ```bash
  git add docs/lib/kb/support-knowledge.ts docs/scripts/import-support-knowledge.ts docs/tests/static/kb-import.test.ts docs/package.json docs/decisions/public-knowledge-base.md
  git commit -m "feat(kb): import public support knowledge snapshots"
  ```

### Task 2: Build and Validate the Semantic Artifact

**Files:**
- Create: `docs/lib/knowledge/embeddings.ts`
- Create: `docs/lib/knowledge/semantic-artifact.ts`
- Create: `docs/scripts/build-kb-semantic-index.ts`
- Create: `docs/tests/static/kb-semantic-artifact.test.ts`
- Modify: `docs/package.json`
- Generate: `docs/kb/semantic-index.json`

**Interfaces:**
- Produces: `embeddingText(record: AlgoliaDocsRecord): string` and `embeddingContentHash(record): string`.
- Produces: `embedTexts(texts, { apiKey, fetch, model, dimensions }): Promise<number[][]>`.
- Produces: `encodeVectors`, `decodeVectors`, `validateSemanticArtifact`, and `rankSemanticCandidates`.
- Artifact schema: `{ formatVersion: 1; provider: 'openai'; model: 'text-embedding-3-small'; dimensions: 256; source; builtAt; records; vectorsBase64 }`.

- [ ] **Step 1: Write codec, invariant, and cosine-ranking tests**

  Use three two-dimensional unit vectors in the tests while allowing production validation to require 256. Assert float32 round-trip tolerance, normalized-vector rejection, wrong model/dimension/source/hash rejection, and ranking:

  ```ts
  const ranked = rankSemanticCandidates(validArtifact, [1, 0], 2);
  expect(ranked.map((candidate) => candidate.objectID)).toEqual(['exact-x', 'diagonal']);
  expect(() => validateSemanticArtifact(tampered, expected)).toThrow('content hash mismatch');
  ```

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `cd docs && bun test tests/static/kb-semantic-artifact.test.ts`

  Expected: FAIL because the artifact modules do not exist.

- [ ] **Step 3: Implement deterministic embedding text and the HTTP client**

  Concatenate title, section, description, keywords, slug/tool aliases, toolkit slugs, and content using labeled lines. Hash that exact UTF-8 string with SHA-256. POST batches to `/v1/embeddings` with:

  ```json
  { "model": "text-embedding-3-small", "dimensions": 256, "encoding_format": "float", "input": ["..."] }
  ```

  Require response indices to be contiguous and normalize each returned vector before storage. Accept injected `fetch` in tests and never log request text or API keys.

- [ ] **Step 4: Implement the compact artifact and exact scan**

  Store one ordered metadata record per vector, including every field needed to map a semantic hit to `KnowledgeSearchResult`, plus `contentHash`. Encode the row-major `Float32Array` as base64. At load time require exact format/model/dimensions/source commit, record count, byte length, finite numbers, unit vectors, unique public KB object IDs, and current content hashes.

- [ ] **Step 5: Implement the incremental builder**

  Filter `getAlgoliaSearchDocuments()` to `source_type === 'kb'`, sort by object ID, reuse prior vectors only when provider/model/dimensions/object ID/content hash all match, batch the rest through `embedTexts`, validate the complete artifact in memory, write a sibling temporary file, then rename. Add scripts:

  ```json
  "build:kb-semantic": "bun scripts/build-kb-semantic-index.ts",
  "check:kb-semantic": "bun scripts/build-kb-semantic-index.ts --check"
  ```

- [ ] **Step 6: Run unit tests with an injected fake embedding response**

  Run: `cd docs && bun test tests/static/kb-semantic-artifact.test.ts`

  Expected: PASS without network or credentials.

- [ ] **Step 7: Build the real artifact if `OPENAI_API_KEY` is present**

  Check only presence: `test -n "$OPENAI_API_KEY" && echo available || echo unavailable`.

  If available, run `cd docs && bun run build:kb-semantic`, then `bun run check:kb-semantic`. If unavailable, retain the last valid checked-in artifact and continue with keyword degradation plus deterministic unit fixtures; do not fabricate production embeddings.

- [ ] **Step 8: Commit only semantic artifact files locally**

  ```bash
  git add docs/lib/knowledge/embeddings.ts docs/lib/knowledge/semantic-artifact.ts docs/scripts/build-kb-semantic-index.ts docs/tests/static/kb-semantic-artifact.test.ts docs/package.json docs/kb/semantic-index.json
  git commit -m "feat(kb): add compact semantic search artifact"
  ```

### Task 3: Implement Deterministic Hybrid Ranking

**Files:**
- Create: `docs/lib/knowledge/hybrid-search.ts`
- Create: `docs/tests/static/kb-hybrid-search.test.ts`
- Modify: `docs/lib/knowledge/search.ts`

**Interfaces:**
- Consumes ranked keyword `AlgoliaDocsRecord[]` and semantic `{ record; rank; similarity }[]`.
- Produces: `fusePublicKbCandidates({ query, keyword, semantic, limit, rrfConstant }): HybridCandidate[]`.
- Produces response metadata types `KnowledgeRetrievalMode = 'hybrid' | 'semantic' | 'keyword'` and `KnowledgeDegradationReason = 'embedding-unavailable' | 'semantic-artifact-invalid' | 'semantic-request-failed' | 'keyword-request-failed'`.

- [ ] **Step 1: Write exact pinning, RRF, deduplication, and determinism tests**

  Cover an exact action slug that is keyword rank 2/semantic rank 8, a paraphrase that is keyword rank 20/semantic rank 1, duplicate sections of one page, equal RRF ties, one missing retriever, and a repeated-run loop:

  ```ts
  for (let run = 0; run < 20; run += 1) {
    expect(fusePublicKbCandidates(input).map((item) => item.objectID)).toEqual(expected);
  }
  expect(results.filter((item) => item.canonicalUrl.split('#')[0] === '/kb/guide/github')).toHaveLength(1);
  ```

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `cd docs && bun test tests/static/kb-hybrid-search.test.ts`

  Expected: FAIL because `hybrid-search.ts` does not exist.

- [ ] **Step 3: Implement normalized exact-term detection**

  Reuse one exported normalization function from `search.ts`. Pin, in order: exact normalized title, exact keyword/slug/tool/trigger identifier, then full normalized phrase in title/identity/body. Do not pin partial semantic similarity.

- [ ] **Step 4: Implement RRF and canonical-page selection**

  For every non-pinned candidate add `1 / (60 + rank)` for each list containing it. Sort by pin tier, fused score, existing `page_rank`, `section_rank`, then title and object ID. Group by `canonical_url` without its hash, retain the strongest section, and slice to `Math.min(limit, 20)`.

- [ ] **Step 5: Run ranking and existing lexical tests**

  Run: `cd docs && bun test tests/static/kb-hybrid-search.test.ts tests/static/knowledge-search.test.ts`

  Expected: PASS and no change to existing all/docs/reference lexical expectations.

- [ ] **Step 6: Commit ranking files locally**

  ```bash
  git add docs/lib/knowledge/hybrid-search.ts docs/lib/knowledge/search.ts docs/tests/static/kb-hybrid-search.test.ts
  git commit -m "feat(kb): fuse keyword and semantic retrieval"
  ```

### Task 4: Wire the Public API and Failure Degradation

**Files:**
- Modify: `docs/app/api/knowledge-search/route.ts`
- Modify: `docs/tests/static/knowledge-search.test.ts`

**Interfaces:**
- Consumes: loaded semantic artifact, `embedTexts([query])`, existing Algolia/local lexical candidates, and `fusePublicKbCandidates`.
- Produces: `KnowledgeSearchResponse` with `mode` and optional `degradedReason` for KB requests.
- Feature flag: `KB_HYBRID_SEARCH_ENABLED=true`; all other values run keyword-only.

- [ ] **Step 1: Add route tests with injected dependencies**

  Extract `createKnowledgeSearchHandler(dependencies)` and test:

  ```ts
  expect((await body(handlerWithBoth, '?q=oauth&filter=kb')).mode).toBe('hybrid');
  expect((await body(handlerWithEmbeddingFailure, '?q=oauth&filter=kb'))).toMatchObject({
    mode: 'keyword', degradedReason: 'semantic-request-failed',
  });
  expect((await body(handlerWithAlgoliaFailure, '?q=oauth&filter=kb')).mode).toBe('hybrid');
  expect(allResults.every((result) => result.sourceType === 'kb')).toBe(true);
  ```

  Also assert an invalid filter remains `400`, empty queries do not call providers, and both failures return `503`.

- [ ] **Step 2: Run the route test and verify RED**

  Run: `cd docs && bun test tests/static/knowledge-search.test.ts`

  Expected: FAIL on the new mode/degradation assertions.

- [ ] **Step 3: Refactor keyword lookup behind an injectable function**

  Keep ordinary Algolia options and `source_type:kb` facets. Catch Algolia errors, then use `searchKnowledgeRecords` over only local KB records. Return up to 50 ordered records for fusion. Do not alter the global Algolia index settings or global search route.

- [ ] **Step 4: Load and validate the artifact once per process**

  Memoize successful artifact parsing. Convert missing file/model/source/hash errors to `semantic-artifact-invalid` and log only error category plus artifact metadata, never query text. A missing API key becomes `embedding-unavailable`.

- [ ] **Step 5: Implement the handler's independent retrieval branches**

  Run keyword and semantic promises concurrently for `filter=kb`. Preserve successful candidates when the sibling fails, calculate `mode` from successful non-empty retrievers, and return `503` only when neither branch can execute. Keep `Cache-Control: public, max-age=30, stale-while-revalidate=300`.

- [ ] **Step 6: Run route, ranking, and integration search tests**

  Run: `cd docs && bun test tests/static/knowledge-search.test.ts tests/static/kb-hybrid-search.test.ts`

  If a local server is already running, also run: `cd docs && bun test tests/integration/search.test.ts --timeout 30000`.

- [ ] **Step 7: Commit the API integration locally**

  ```bash
  git add docs/app/api/knowledge-search/route.ts docs/tests/static/knowledge-search.test.ts
  git commit -m "feat(kb): expose degradable hybrid search"
  ```

### Task 5: Make `/kb/search` Public-KB-Only

**Files:**
- Modify: `docs/app/(home)/kb/search/page.tsx`
- Modify: `docs/components/kb/knowledge-search-form.tsx`
- Modify: `docs/components/kb/knowledge-search-results.tsx`
- Modify: `docs/tests/static/knowledge-hub.test.tsx`

**Interfaces:**
- Sends only `filter=kb` from the KB surface.
- Displays canonical source title, section-aware excerpt, and link; does not show model scores or generated-answer language.
- Emits provider-neutral PostHog events without raw query text: `kb_search_completed`, `kb_search_zero_results`, and `kb_search_result_clicked`.

- [ ] **Step 1: Extend static UI tests before editing components**

  Assert the page/form/results source contains `filter=kb`, has no filter-tab rendering, keeps loading/error/zero-result recovery paths, uses “Search support knowledge” copy, and does not contain “AI answer”, similarity, or confidence labels.

- [ ] **Step 2: Run the UI test and verify RED**

  Run: `cd docs && bun test tests/static/knowledge-hub.test.tsx`

  Expected: FAIL because the current page still presents unified knowledge filters.

- [ ] **Step 3: Patch around the owner's uncommitted UI changes**

  Remove filter selection from `/kb/search`, hardcode the hidden `filter` input and API request to `kb`, and update heading/description/loading copy to say public support knowledge. Preserve the owner's current removal of badges/provenance text and do not recreate `source-badge.tsx`.

- [ ] **Step 4: Add provider-neutral analytics without recording the query**

  Use the existing `usePostHog` hook. After a successful response capture retrieval mode, result count, and degradation category; capture a distinct zero-result event; on click capture stable object ID and displayed position. Never include `query`, excerpt, title, URL query parameters, or embedding/Algolia scores.

- [ ] **Step 5: Run UI and route tests**

  Run: `cd docs && bun test tests/static/knowledge-hub.test.tsx tests/static/knowledge-search.test.ts tests/static/kb-routes.test.ts`

  Expected: PASS.

- [ ] **Step 6: Commit only the intended hunks locally**

  Review `git diff` carefully because these files were dirty before this plan. Stage with `git add -p` only after separating or preserving owner hunks, then commit:

  ```bash
  git commit -m "feat(kb): focus search on support answers"
  ```

### Task 6: Connect the Existing `composio` Skill

**Files:**
- Modify: `skills/composio/SKILL.md`
- Modify: `docs/lib/source.ts`

**Interface:**
- Install with `npx skills add ComposioHQ/composio --skill composio -y`.
- Use `https://docs.composio.dev/kb` and
  `https://docs.composio.dev/api/knowledge-search?q=<question>&filter=kb` as
  fallback public sources after the skill's existing documentation and CLI sources.

- [ ] Add the two public KB URLs to the existing skill's canonical-information
  section without prescribing a second skill or a rigid response workflow.
- [ ] Keep the boundary that KB evidence does not establish live account, project,
  connection, or incident state.
- [ ] Verify the skill remains installable as `composio` and that no
  `composio-support` directory or installer wiring exists.

### Task 7: Route Internal Support Skills Through the Public KB

**Files:**
- Create: `/Users/sohambasu/Documents/composio/support/support-workflows/skills/support-knowledge/SKILL.md`
- Modify: `/Users/sohambasu/Documents/composio/support/support-workflows/skills/draft-support-response/SKILL.md`
- Modify: `/Users/sohambasu/Documents/composio/support/support-workflows/skills/support-debug-issue/SKILL.md`
- Create: `/Users/sohambasu/Documents/composio/support/claude-config/skills/support/support-knowledge/SKILL.md`
- Modify: `/Users/sohambasu/Documents/composio/support/claude-config/skills/support/{faq,platform-faq,toolkit-faqs,reply,triage}/SKILL.md`
- Replace: `/Users/sohambasu/Documents/composio/support/claude-config/skills/support/decimal-chat/SKILL.md`

**Interfaces:**
- Shared lookup uses the same public `/api/knowledge-search?filter=kb` contract as
  the main `composio` skill.
- Internal workflows hydrate live customer context first, retrieve public product facts second, and query operational systems when the answer depends on current state.

- [ ] **Step 1: Create local feature branches without touching the dirty `support-knowledge` repo**

  Run:

  ```bash
  git -C /Users/sohambasu/Documents/composio/support/support-workflows switch -c codex/support-knowledge-search-v1
  git -C /Users/sohambasu/Documents/composio/support/claude-config switch -c codex/support-knowledge-search-v1
  ```

  Expected: both clean repositories move to local branches; `support-knowledge` remains on the reconciliation agent's dirty branch and is read-only.

- [ ] **Step 2: Add static assertions before skill edits**

  In each repo, add the smallest existing validation/test hook or a shell check that asserts the entrypoint skills name `support-knowledge`, the lookup skill includes `filter=kb`, and the legacy Decimal skill contains neither a bearer token nor an active network-integration workflow.

- [ ] **Step 3: Write the shared internal lookup skills**

  Mirror the public search/read/cite procedure, then add internal rules: retrieve only after full Plain hydration when a thread exists; public KB is authoritative for durable public facts; never treat it as proof of account configuration, rollout, incident, or current provider state; continue to Metabase/Datadog/Sentry/PostHog/code when live evidence is required.

- [ ] **Step 4: Patch the main support entrypoints**

  In `draft-support-response`, replace “use the relevant KB” with an explicit call to the shared lookup and require the selected canonical URLs in `Context checked`. In `support-debug-issue`, keep Plain hydration first, then search the shared KB before local legacy files and operational systems.

- [ ] **Step 5: Demote legacy canned-answer skills**

  Add an upfront instruction to FAQ/platform/toolkit/reply/triage skills: search shared KB first for public facts; treat embedded claims as historical hints; verify names, URLs, and current behavior; use live sources for customer state. Replace `decimal-chat/SKILL.md` wholesale with a credential-free deprecation stub that points to `support-knowledge` and permits Decimal only after explicit user request.

- [ ] **Step 6: Run skill validation and secret scans**

  Run the repositories' documented skill checks if present, then:

  ```bash
  rg -n "support-knowledge|filter=kb|COMPOSIO_KB_BASE_URL" /Users/sohambasu/Documents/composio/support/support-workflows/skills /Users/sohambasu/Documents/composio/support/claude-config/skills/support
  rg -n "Bearer [A-Za-z0-9._-]{20,}|api[_-]?key\s*[:=]\s*['\"][^'\"]+" /Users/sohambasu/Documents/composio/support/claude-config/skills/support
  ```

  Expected: the first command proves routing; the second returns no credential-bearing match.

- [ ] **Step 7: Commit locally in each internal repository**

  Stage only the named skill files. Commit `feat(support): retrieve public knowledge before drafting` in `support-workflows` and `chore(skills): replace stale support knowledge routing` in `claude-config`. Do not push either branch.

### Task 8: Add Retrieval Evaluation and Exercise the Whole Loop

**Files:**
- Create: `docs/evals/kb-search-v1.json`
- Create: `docs/scripts/eval-kb-search.ts`
- Modify: `docs/package.json`

**Interfaces:**
- Fixture row: `{ id; class: 'exact' | 'paraphrase' | 'no-answer'; query; acceptableUrls: string[] }`.
- CLI: `bun run eval:kb-search -- --mode keyword|semantic|hybrid --json <optional-report-path>`.
- Metrics: Recall@1, Recall@3, Recall@5, and MRR grouped by class and overall.

- [ ] **Step 1: Check in representative sanitized queries**

  Include at least 8 exact/error/slug queries, 12 natural-language paraphrases, and 5 no-answer questions. Derive acceptable URLs from the imported snapshot, never from customer identifiers or private thread text. Include examples around expired connections, auth links, pagination, Tool Router files, toolkit scopes, and copied provider errors.

- [ ] **Step 2: Write metric tests inline or in `kb-hybrid-search.test.ts`**

  Assert known ranks produce exact Recall@K and MRR values, no-answer rows are reported separately, and results are stable across repeated runs.

- [ ] **Step 3: Implement the evaluator**

  Keyword mode uses local lexical ranking, semantic mode uses query embeddings plus the artifact, and hybrid mode uses the same fusion function as the route. Print a compact comparison table and optionally write JSON. Add:

  ```json
  "eval:kb-search": "bun scripts/eval-kb-search.ts"
  ```

- [ ] **Step 4: Run the offline and live evaluations**

  Run keyword unconditionally. Run semantic and hybrid when a valid artifact and embedding key are available:

  ```bash
  cd docs
  bun run eval:kb-search -- --mode keyword
  bun run eval:kb-search -- --mode semantic
  bun run eval:kb-search -- --mode hybrid
  ```

  Record exact-class Recall@3 and paraphrase Recall@5 for the final comparison. Exact hybrid Recall@3 must not regress; paraphrase hybrid Recall@5 must exceed keyword baseline before recommending default enablement.

- [ ] **Step 5: Start the docs app and run manual UI/API scenarios**

  With `KB_HYBRID_SEARCH_ENABLED=true`, run the local server, query at least five exact phrases, five paraphrases, and three no-answer cases through both the API and `/kb/search`. Click the top results and confirm the linked section answers the query. Then unset the embedding key and separately force Algolia failure to confirm graceful degradation copy and recovery paths.

- [ ] **Step 6: Exercise the main `composio` skill against localhost**

  Set `COMPOSIO_KB_BASE_URL` to the local docs origin and run at least five agent scenarios: direct known fact, paraphrase, exact error, live-account question, and no-answer question. Require citations for the first three, a live-state boundary for the fourth, and an honest insufficiency response for the fifth.

- [ ] **Step 7: Commit evaluation assets locally**

  ```bash
  git add docs/evals/kb-search-v1.json docs/scripts/eval-kb-search.ts docs/package.json docs/tests/static/kb-hybrid-search.test.ts
  git commit -m "test(kb): add hybrid retrieval evaluation"
  ```

### Task 9: Verify, Inspect, and Produce the V1 Retrospective

**Files:**
- Modify only if failures reveal an in-scope defect.
- Create locally if useful: `docs/evals/results/kb-search-v1-local.json` (do not commit raw queries not already sanitized in the fixture).

**Interfaces:**
- Produces an evidence-backed handoff with local branch/commit IDs, commands, metrics, manual observations, goods, bads, and a prioritized V2 proposal.

- [ ] **Step 1: Inspect worktree ownership before broad validation**

  Run `git status --short`, `git diff --check`, and `git diff --stat` in all three edited repositories. Confirm the reconciliation agent's `support-knowledge` worktree was never modified and the original docs owner changes are still present.

- [ ] **Step 2: Run focused tests first**

  ```bash
  cd docs
  bun test tests/static/kb-import.test.ts tests/static/kb-semantic-artifact.test.ts tests/static/kb-hybrid-search.test.ts tests/static/knowledge-search.test.ts tests/static/knowledge-hub.test.tsx tests/static/kb-routes.test.ts
  bun run check:kb
  bun run check:kb-semantic
  ```

- [ ] **Step 3: Run the docs validation suite**

  ```bash
  cd docs
  bun run test
  bun run types:check
  bun run lint
  bun run lint:links
  bun run build
  ```

  `sync:search --dry-run` may be run only if the script is confirmed read-only for that flag. Do not mutate the hosted Algolia index.

- [ ] **Step 4: Run the CLI validation suite**

  ```bash
  cd ts/packages/cli
  pnpm run build:skills -- --channel stable --output-dir ./dist/skills
  pnpm run validate:skills
  pnpm vitest run test/src/effects/install-skill.test.ts test/src/commands/install-skill-root-flag.test.ts
  pnpm run typecheck
  ```

- [ ] **Step 5: Review every final diff and local commit**

  Use `git show --stat --oneline HEAD` and file-specific diffs. Verify there is no NeuralSearch configuration, generation endpoint, customer-safe string in public generated artifacts, query logging, secret, push, PR, or unrelated formatting churn.

- [ ] **Step 6: Summarize the MVP honestly**

  Report:

  - Goods: where hybrid improves retrieval, exact-match preservation, implementation simplicity, fallback behavior, and skill usefulness.
  - Bads: latency/cost of query embeddings, low-quality tail without a cutoff, editorial/search-record weaknesses, dependency/configuration friction, and cases the corpus cannot answer.
  - V2 proposal in priority order, driven by observed failures. Consider better section metadata/query aliases first; then a lightweight reranker or long-context agent read only if evaluation shows rank-order errors; authenticated customer-safe retrieval as a separate boundary; generated answers only after source retrieval is trusted; vector infrastructure only if corpus size or latency proves exact scan insufficient.

- [ ] **Step 7: Stop locally**

  Provide branch names, commit IDs, file links, test evidence, and how to run the local MVP. Do not push, open a PR, enable production flags, write to Algolia, or deploy.
