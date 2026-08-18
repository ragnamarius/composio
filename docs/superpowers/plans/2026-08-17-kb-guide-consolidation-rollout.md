# KB Guide Consolidation Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate eight header-heavy KB guides into the approved task-oriented format without losing factual support content.

**Architecture:** Edit only the authored Markdown in `kb/articles/`, then use the existing generator to rebuild the matching `content/kb/guide/*.mdx` pages. Preserve the manifest, source snapshot, routing metadata, identifiers, links, numbers, and technical qualifications; only the article organization and connective copy change.

**Tech Stack:** Markdown, Bun, the existing KB generator, Bun static tests, Next.js production build.

**Spec:** `docs/superpowers/specs/2026-08-17-kb-guide-consolidation-rollout-design.md`

## Global Constraints

- Open every guide with one sentence describing what the guide helps the reader accomplish.
- Use task-oriented level-two headings and bold lead-ins for related atomic facts.
- Preserve every exact tool slug, parameter, error message, scope URL, number, link, code block, and provider qualification.
- Do not change `kb/manifest.json`, `kb/source/`, aliases, canonical URLs, tags, topic assignments, review dates, or source references.
- Do not add new product claims.
- Human prose does not get brittle exact-copy tests; verification uses generation, corpus, route, and rendered-page checks.

---

### Task 1: Consolidate the Notion guide

**Files:**
- Modify: `docs/kb/articles/toolkits-notion.md`
- Generate: `docs/content/kb/guide/toolkits-notion.mdx`
- Test: `docs/tests/static/kb-generation.test.ts`
- Test: `docs/tests/static/knowledge-corpus.test.ts`

**Interfaces:**
- Consumes: the existing Notion factual sections and the KB generator.
- Produces: one introduction followed by “Use current Notion tools and triggers,” “Configure Notion access and connected accounts,” and “Troubleshoot Notion connections and large responses.”

- [ ] **Step 1: Rewrite the authored article**

Group the valid/deprecated tool slugs and trigger selection under the first heading; integration capabilities and auth-config lookup behavior under the second; revoked refresh tokens and response-size guidance under the third. Use bold lead-ins for each original fact.

- [ ] **Step 2: Regenerate the KB page**

Run: `bun run generate:kb`

Expected: `content/kb/guide/toolkits-notion.mdx` mirrors the authored grouping and generation reports zero held pages.

- [ ] **Step 3: Inspect the factual diff**

Run: `git diff -- kb/articles/toolkits-notion.md content/kb/guide/toolkits-notion.mdx`

Expected: all original identifiers and claims remain; only the introduction, headings, bold lead-ins, and ordering change.

- [ ] **Step 4: Run focused generation and corpus tests**

Run: `bun test tests/static/kb-generation.test.ts tests/static/knowledge-corpus.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the guide pair**

```bash
git add docs/kb/articles/toolkits-notion.md docs/content/kb/guide/toolkits-notion.mdx
git commit -m "docs: consolidate Notion support guide"
```

### Task 2: Consolidate the Google Sheets guide

**Files:**
- Modify: `docs/kb/articles/toolkits-googlesheets.md`
- Generate: `docs/content/kb/guide/toolkits-googlesheets.mdx`
- Test: `docs/tests/static/kb-generation.test.ts`
- Test: `docs/tests/static/knowledge-corpus.test.ts`

**Interfaces:**
- Consumes: the existing Google Sheets factual sections and the KB generator.
- Produces: one introduction followed by “Connect Google Sheets and discover tools,” “Update and populate spreadsheets,” and “Configure Google auth, versions, and quotas.”

- [ ] **Step 1: Rewrite the authored article**

Group Platform/Connect isolation, list limits, and spreadsheet-ID discovery under the first heading; current values tools and exact-slug execution under the second; placeholder-version 403s, Google Super, full scope URLs, and provider quotas under the third.

- [ ] **Step 2: Regenerate the KB page**

Run: `bun run generate:kb`

Expected: `content/kb/guide/toolkits-googlesheets.mdx` mirrors the authored grouping.

- [ ] **Step 3: Inspect the factual diff**

Run: `git diff -- kb/articles/toolkits-googlesheets.md content/kb/guide/toolkits-googlesheets.mdx`

Expected: all original tool slugs, quota numbers, links, and scope URLs remain.

- [ ] **Step 4: Run focused generation and corpus tests**

Run: `bun test tests/static/kb-generation.test.ts tests/static/knowledge-corpus.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the guide pair**

```bash
git add docs/kb/articles/toolkits-googlesheets.md docs/content/kb/guide/toolkits-googlesheets.mdx
git commit -m "docs: consolidate Google Sheets support guide"
```

### Task 3: Consolidate the Supabase guide

**Files:**
- Modify: `docs/kb/articles/toolkits-supabase.md`
- Generate: `docs/content/kb/guide/toolkits-supabase.mdx`
- Test: `docs/tests/static/kb-generation.test.ts`
- Test: `docs/tests/static/knowledge-corpus.test.ts`

**Interfaces:**
- Consumes: the existing Supabase factual sections and the KB generator.
- Produces: one introduction followed by “Connect Supabase with OAuth or an API key,” “Configure Supabase tools and endpoints,” and “Troubleshoot Supabase permissions and rate limits.”

- [ ] **Step 1: Rewrite the authored article**

Group organization scope, `supabase_personal_token`, supported auth schemes, and explicit MCP connection initiation under the first heading; SQL tool availability, hosted/self-hosted base URLs, and OAuth-app scopes under the second; provider permissions and underlying rate-limit errors under the third.

- [ ] **Step 2: Regenerate the KB page**

Run: `bun run generate:kb`

Expected: `content/kb/guide/toolkits-supabase.mdx` mirrors the authored grouping.

- [ ] **Step 3: Inspect the factual diff**

Run: `git diff -- kb/articles/toolkits-supabase.md content/kb/guide/toolkits-supabase.mdx`

Expected: auth field names, URLs, links, and provider/Composio distinctions remain exact.

- [ ] **Step 4: Run focused generation and corpus tests**

Run: `bun test tests/static/kb-generation.test.ts tests/static/knowledge-corpus.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the guide pair**

```bash
git add docs/kb/articles/toolkits-supabase.md docs/content/kb/guide/toolkits-supabase.mdx
git commit -m "docs: consolidate Supabase support guide"
```

### Task 4: Consolidate the Twitter/X guide

**Files:**
- Modify: `docs/kb/articles/toolkits-twitter.md`
- Generate: `docs/content/kb/guide/toolkits-twitter.mdx`
- Test: `docs/tests/static/kb-generation.test.ts`
- Test: `docs/tests/static/knowledge-corpus.test.ts`

**Interfaces:**
- Consumes: the existing Twitter/X factual sections and the KB generator.
- Produces: one introduction followed by “Configure Twitter/X authentication,” “Publish and search with the correct credentials,” and “Troubleshoot developer-app and toolkit-version errors.”

- [ ] **Step 1: Rewrite the authored article**

Group managed/customer-owned OAuth and callback configuration under the first heading; character-counting rules and Application Bearer Token actions under the second; developer project enrollment errors and older toolkit versions under the third.

- [ ] **Step 2: Regenerate the KB page**

Run: `bun run generate:kb`

Expected: `content/kb/guide/toolkits-twitter.mdx` mirrors the authored grouping.

- [ ] **Step 3: Inspect the factual diff**

Run: `git diff -- kb/articles/toolkits-twitter.md content/kb/guide/toolkits-twitter.mdx`

Expected: the 280-character guidance, exact errors, token type, and OAuth qualifications remain.

- [ ] **Step 4: Run focused generation and corpus tests**

Run: `bun test tests/static/kb-generation.test.ts tests/static/knowledge-corpus.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the guide pair**

```bash
git add docs/kb/articles/toolkits-twitter.md docs/content/kb/guide/toolkits-twitter.mdx
git commit -m "docs: consolidate Twitter support guide"
```

### Task 5: Consolidate the Google Drive guide

**Files:**
- Modify: `docs/kb/articles/toolkits-googledrive.md`
- Generate: `docs/content/kb/guide/toolkits-googledrive.mdx`
- Test: `docs/tests/static/kb-generation.test.ts`
- Test: `docs/tests/static/knowledge-corpus.test.ts`

**Interfaces:**
- Consumes: the existing Google Drive factual sections and the KB generator.
- Produces: one introduction followed by “Upload and download Google Drive files,” “Choose MCP or direct execution,” “Configure Google OAuth, scopes, and webhooks,” and “Troubleshoot account, toolkit, and session execution.”

- [ ] **Step 1: Rewrite the authored article**

Group auto file handling, temporary URLs, and raw download output under the first heading; curated MCP tools and deterministic file-browser guidance under the second; public webhook endpoints, customer-owned credentials, and narrow scopes under the third; invalid versions, account identity, required `arguments`, and same-entity sessions under the fourth.

- [ ] **Step 2: Regenerate the KB page**

Run: `bun run generate:kb`

Expected: `content/kb/guide/toolkits-googledrive.mdx` mirrors the authored grouping.

- [ ] **Step 3: Inspect the factual diff**

Run: `git diff -- kb/articles/toolkits-googledrive.md content/kb/guide/toolkits-googledrive.mdx`

Expected: the one-hour URL TTL, roughly one-day storage, exact error, slugs, and scope names remain.

- [ ] **Step 4: Run focused generation and corpus tests**

Run: `bun test tests/static/kb-generation.test.ts tests/static/knowledge-corpus.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the guide pair**

```bash
git add docs/kb/articles/toolkits-googledrive.md docs/content/kb/guide/toolkits-googledrive.mdx
git commit -m "docs: consolidate Google Drive support guide"
```

### Task 6: Consolidate the Google Docs guide

**Files:**
- Modify: `docs/kb/articles/toolkits-googledocs.md`
- Generate: `docs/content/kb/guide/toolkits-googledocs.mdx`
- Test: `docs/tests/static/kb-generation.test.ts`
- Test: `docs/tests/static/knowledge-corpus.test.ts`

**Interfaces:**
- Consumes: the existing Google Docs factual sections and the KB generator.
- Produces: one introduction followed by “Create and edit Google Docs content,” “Configure Google OAuth,” “Manage accounts, sessions, and auth configs,” and “Connect through Platform or Connect MCP.”

- [ ] **Step 1: Rewrite the authored article**

Group Markdown/table and tab-level tool guidance under the first heading; customer-owned OAuth, sensitive-scope verification, and redacted tokens under the second; multi-account selection, same-entity sessions, and explicit auth configs under the third; Platform/Connect isolation under the fourth.

- [ ] **Step 2: Regenerate the KB page**

Run: `bun run generate:kb`

Expected: `content/kb/guide/toolkits-googledocs.mdx` mirrors the authored grouping.

- [ ] **Step 3: Inspect the factual diff**

Run: `git diff -- kb/articles/toolkits-googledocs.md content/kb/guide/toolkits-googledocs.mdx`

Expected: all tool slugs, session errors, auth-config behavior, and OAuth qualifications remain.

- [ ] **Step 4: Run focused generation and corpus tests**

Run: `bun test tests/static/kb-generation.test.ts tests/static/knowledge-corpus.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the guide pair**

```bash
git add docs/kb/articles/toolkits-googledocs.md docs/content/kb/guide/toolkits-googledocs.mdx
git commit -m "docs: consolidate Google Docs support guide"
```

### Task 7: Consolidate the Airtable guide

**Files:**
- Modify: `docs/kb/articles/toolkits-airtable.md`
- Generate: `docs/content/kb/guide/toolkits-airtable.mdx`
- Test: `docs/tests/static/kb-generation.test.ts`
- Test: `docs/tests/static/knowledge-corpus.test.ts`

**Interfaces:**
- Consumes: the existing Airtable factual sections and the KB generator.
- Produces: a customer-facing introduction followed by “Connect and authenticate Airtable,” “Discover and execute Airtable tools,” and “Configure Airtable metadata triggers.”

- [ ] **Step 1: Rewrite the authored article**

Replace “The sections below provide public guidance” with a task-focused introduction. Group MCP connection, customer OAuth scopes, and ten-minute expiry under the first heading; list/version discovery and the ten-record batch limit under the second; preserve trigger-catalog guidance under the third.

- [ ] **Step 2: Regenerate the KB page**

Run: `bun run generate:kb`

Expected: `content/kb/guide/toolkits-airtable.mdx` mirrors the authored grouping.

- [ ] **Step 3: Inspect the factual diff**

Run: `git diff -- kb/articles/toolkits-airtable.md content/kb/guide/toolkits-airtable.mdx`

Expected: scope behavior, ten-minute expiry, deprecated/current tool names, ten-record limit, and trigger types remain.

- [ ] **Step 4: Run focused generation and corpus tests**

Run: `bun test tests/static/kb-generation.test.ts tests/static/knowledge-corpus.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the guide pair**

```bash
git add docs/kb/articles/toolkits-airtable.md docs/content/kb/guide/toolkits-airtable.mdx
git commit -m "docs: consolidate Airtable support guide"
```

### Task 8: Consolidate the Firecrawl guide

**Files:**
- Modify: `docs/kb/articles/toolkits-firecrawl.md`
- Generate: `docs/content/kb/guide/toolkits-firecrawl.mdx`
- Test: `docs/tests/static/kb-generation.test.ts`
- Test: `docs/tests/static/knowledge-corpus.test.ts`

**Interfaces:**
- Consumes: the existing Firecrawl factual sections and the KB generator.
- Produces: one introduction followed by “Connect Firecrawl with an API key,” “Discover and run Firecrawl tools,” “Configure endpoints and scrape timeouts,” and “Use Firecrawl with Connect MCP.”

- [ ] **Step 1: Rewrite the authored article**

Group API-key auth and `generic_api_key` connected-account creation under the first heading; list limits and scrape/extract tool choice under the second; batch size, `120000` timeout, and API base URL under the third; preserve individual consumer-account boundaries under the fourth.

- [ ] **Step 2: Regenerate the KB page**

Run: `bun run generate:kb`

Expected: `content/kb/guide/toolkits-firecrawl.mdx` mirrors the authored grouping.

- [ ] **Step 3: Inspect the factual diff**

Run: `git diff -- kb/articles/toolkits-firecrawl.md content/kb/guide/toolkits-firecrawl.mdx`

Expected: auth fields, tool slugs, list limit, batching, timeout, base URL, and account-boundary claims remain.

- [ ] **Step 4: Run focused generation and corpus tests**

Run: `bun test tests/static/kb-generation.test.ts tests/static/knowledge-corpus.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the guide pair**

```bash
git add docs/kb/articles/toolkits-firecrawl.md docs/content/kb/guide/toolkits-firecrawl.mdx
git commit -m "docs: consolidate Firecrawl support guide"
```

### Task 9: Verify the complete rollout

**Files:**
- Verify: all eight `docs/kb/articles/toolkits-*.md` files above
- Verify: all eight generated `docs/content/kb/guide/toolkits-*.mdx` files above

**Interfaces:**
- Consumes: the eight completed guide pairs.
- Produces: a generated, tested, buildable, visually inspected rollout.

- [ ] **Step 1: Check generated content for drift**

Run: `bun run check:kb`

Expected: exit 0 with no generated-content drift.

- [ ] **Step 2: Run all static tests**

Run: `bun test tests/static/`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Build the production site**

Run: `bun run build`

Expected: exit 0; known OpenAPI/toolkit-data warnings may remain, but there are no compilation or type errors.

- [ ] **Step 4: Inspect rendered pages**

Restart `bun run start`, then inspect at least `/kb/guide/toolkits-notion`, `/kb/guide/toolkits-googledrive`, and `/kb/guide/toolkits-firecrawl` at desktop width.

Expected: purpose sentence precedes the first heading; task headings are balanced; bold lead-ins, inline code, and links render correctly; no factual section is missing.

- [ ] **Step 5: Confirm metadata scope**

Run: `git diff --name-only 27c109c49..HEAD`

Expected: only the plan plus the eight authored articles and their eight generated pages changed during this rollout; no manifest or source-snapshot files changed.
