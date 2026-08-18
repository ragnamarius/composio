# Support Knowledge Hybrid Search V1 Design

**Date:** 2026-08-17
**Status:** Approved for implementation planning
**Scope:** Public Knowledge Base search in the Composio docs application

## Decision

V1 will provide deterministic hybrid retrieval for the public Support Knowledge
corpus. It will combine the existing Algolia keyword results with an independent
semantic embedding index and return ranked source passages. It will not generate
answers, rewrite queries, rerank with an LLM, or use an agent loop.

Algolia NeuralSearch is explicitly out of scope. Algolia remains the keyword
retriever. Semantic retrieval is implemented in the docs server with a small,
precomputed embedding artifact and an exact cosine-similarity scan. The corpus is
small enough that V1 does not need a vector database or approximate-nearest-neighbor
index.

The first consumers are the public `/kb/search` experience, its read-only API, and
the existing public `composio` skill. The skill treats the KB as a fallback public
source when its primary documentation and CLI sources do not answer a product or
troubleshooting question. Global Docs search remains unchanged. Customer-safe
retrieval is a later extension of the same knowledge contract.

All implementation work remains on a local branch in the public `composio`
repository. This work must not be pushed and no pull request may be created until
the repository owner explicitly changes that instruction.

## Goals

- Improve support-query recall without weakening exact identifier and error-string
  lookup.
- Let a user search the public Support Knowledge corpus and inspect canonical source
  pages without waiting for generated prose.
- Keep the search implementation small enough to replace after real usage informs
  the next iteration.
- Make a refreshed `support-knowledge` snapshot reindexable without application-code
  changes.
- Give user agents and internal support agents a small, source-grounded search/read
  workflow instead of copying support facts into multiple skills.
- Preserve a strict boundary: no `customer-safe` content or metadata may appear in
  public search artifacts, APIs, logs, or pages.

## Non-goals

- Generated answers, RAG responses, summaries, or chat.
- LLM query expansion, reranking, classification, or confidence judgments.
- Algolia NeuralSearch, Dynamic Re-Ranking, personalization, or training from search
  events.
- A dedicated vector database, PostgreSQL extension, or new hosted search service.
- Changing global Docs search behavior.
- Customer-safe or internal support search.
- Automatically opening pull requests from `support-knowledge` changes.
- Replacing the separate corpus audit and reconciliation already in progress.

## Existing System

The docs application already has most of the delivery shell:

- `docs/scripts/sync-algolia-search.ts` builds and atomically replaces the existing
  Algolia keyword index.
- `docs/app/api/knowledge-search/route.ts` exposes search results and falls back to a
  local lexical implementation when Algolia is unavailable.
- `docs/app/(home)/kb/search/page.tsx` and the KB search components provide the
  public results experience.
- Search records already carry titles, section text, exact identifiers, source type,
  product areas, toolkit slugs, canonical URLs, and stable object IDs.
- The current publication snapshot and decision record still contain older
  `support-workflows` or `public-kb` source assumptions. The V1 importer must replace
  those assumptions with `ComposioHQ/support-knowledge`.

Existing uncommitted KB UI changes belong to the repository owner and must be
preserved. Implementation should patch around them and must not revert or reformat
them.

## Architecture

```text
ComposioHQ/support-knowledge
          |
          | reviewed, public-only snapshot import
          v
normalized public KB section records
       /                         \
      v                           v
Algolia keyword index       embedding build script
                                  |
                                  v
                         checked-in vector artifact
       \                         /
        \                       /
         v                     v
          public search API
    keyword rank + semantic rank
       exact pinning + RRF merge
                  |
                  v
       /kb/search results
       public agent skill
      internal support skills
```

The semantic index is not a second content model. Both retrievers consume the same
normalized public KB section records, and both results resolve back to the same
stable object ID and canonical URL.

## Source and Publication Contract

`ComposioHQ/support-knowledge` is authoritative for customer-shareable support
knowledge. V1 consumes a pinned snapshot rather than fetching a private repository
at application runtime.

The importer will:

1. Accept an explicit local `support-knowledge` checkout and source commit.
2. Validate the repository using its own manifest and validation commands.
3. Copy only leaves classified as `public` into the docs publication snapshot;
4. split each leaf into its self-contained level-two answer sections;
5. produce normalized search records and page-generation inputs;
6. record the source repository, source commit, source path, section heading, content
   hash, and review metadata; and
7. fail before replacing any previously valid snapshot when validation fails.

The importer must never copy `customer-safe` files into the public snapshot. Public
visibility is enforced during import, generation, and search-index construction so
that no later query filter is responsible for the privacy boundary.

The ongoing audit may add, remove, rename, or reclassify leaves. No application code,
test, or UI should hardcode the current number of documents or sections.

V1 keeps publication manual: after the separate audit completes, a maintainer runs
the importer, reviews its diff, regenerates embeddings, runs verification, and
commits the refreshed artifacts locally.

## Search Record

Each semantic and keyword candidate represents one atomic answer section and
contains:

- `objectID`: stable section identity;
- `pageID`: stable parent-page identity;
- `title` and `section`;
- `content` and optional description;
- `canonicalUrl` including the section anchor where available;
- aliases, tags, toolkit slugs, action or trigger slugs, and known exact terms;
- product areas and answer intent;
- source repository, commit, path, and heading;
- content hash and last-reviewed date; and
- `visibility: public` as a validated invariant.

The text embedded for semantic search is a deterministic concatenation of the title,
section heading, aliases and exact terms, short document context, and section body.
Including this context prevents generic section text from losing the product or
toolkit identity that makes it retrievable.

## Semantic Embedding Artifact

V1 uses the OpenAI Embeddings API with `text-embedding-3-small` and 256 dimensions.
This is the only model dependency. It does not generate text.

The build script batches changed public section records, keyed by content hash, and
writes a generated artifact containing:

- artifact format version;
- embedding provider, model, and dimensions;
- source repository and commit;
- build timestamp;
- ordered object IDs and content hashes; and
- normalized float vectors encoded compactly rather than expanded as verbose JSON
  arrays.

The artifact is checked into the local branch so ordinary docs builds do not need an
embedding API key. A model or dimension change invalidates the complete artifact.
A content change invalidates only records whose content hashes changed.

At query time the server embeds the normalized query with the same model and
dimensions, loads the artifact once per process, computes cosine similarity against
every public section, and keeps the top semantic candidates. With fewer than a few
thousand sections, an exact scan is simpler and provides perfect vector recall.

The embedding API key remains server-side. Public content and the user's search
query are the only data sent to the embedding provider. The browser never receives
the key or the embedding artifact.

## Keyword Retrieval

The API continues to query the existing Algolia index in ordinary keyword mode. The
request is constrained to `source_type:kb` before results are accepted. It retrieves
enough candidates for fusion rather than treating Algolia's first page as the final
ordering.

When Algolia is unavailable, the existing local lexical path supplies keyword
candidates. Semantic retrieval is independent of Algolia availability.

Keyword retrieval remains responsible for precision on:

- exact error text and codes;
- toolkit, action, and trigger slugs;
- OAuth scopes and API fields;
- titles and known aliases; and
- phrases copied directly from the product or provider response.

## Deterministic Fusion

The search service obtains up to 50 keyword candidates and 50 semantic candidates.
It then:

1. normalizes and deduplicates candidates by stable object ID;
2. pins exact title, identifier, and normalized phrase matches ahead of non-exact
   candidates;
3. combines the remaining rankings with Reciprocal Rank Fusion using a fixed
   constant of 60;
4. breaks ties by the existing page rank, section rank, and stable title order;
5. selects the strongest section for each canonical page; and
6. returns at most 20 displayed pages.

RRF depends on rank position rather than incomparable keyword and cosine score
scales. This makes the initial behavior deterministic and keeps tuning limited to
candidate counts, exact-match rules, and one documented fusion constant.

V1 does not apply a semantic similarity cutoff until the evaluation set shows a
reliable threshold. A query with weak semantic candidates can still return a small
set of low-quality results, so the UI must keep the existing recovery links and
provide a no-results state when neither retriever returns a candidate.

## Public Search API

The existing knowledge-search route remains the public contract but V1's KB surface
always searches the public KB corpus. Global content filters remain an internal
compatibility concern and are not shown in the first-slice KB UI.

The response contains:

- normalized query;
- retrieval mode: `hybrid`, `semantic`, or `keyword`;
- degradation reason when one retriever failed;
- total result count;
- stable object ID, title, section-aware excerpt, canonical URL, breadcrumbs,
  product areas, toolkit slugs, and review date for each result; and
- no generated answer, confidence claim, or model-written explanation.

The route keeps its existing query-length limit and short public response cache. It
must validate the embedding artifact at startup or first use and must not serve a
vector with a mismatched model, dimension, content hash, or source commit.

## User Experience

The first slice uses the existing `/kb/search` page and visual language. It changes
the experience only where required to make it KB-specific:

- default and constrain searches to public KB results;
- remove the unified Docs/OAuth/Toolkits/Reference filter tabs from this first
  surface;
- preserve search by product question, exact error, action slug, or toolkit name;
- display source excerpts and canonical links immediately; and
- preserve browse and recovery paths for failures and empty results.

The UI does not label results as AI-generated and does not expose raw similarity or
fusion scores. Semantic retrieval is an implementation detail.

Global Docs search continues using its existing Algolia keyword behavior throughout
V1 testing.

## Skill Integration

Skills are part of V1 because agents should use the same fresh evidence as the human
search UI. V1 does not teach skills the support corpus by copying answers into their
Markdown. It teaches them how to search and read the shared corpus.

### Unified user-agent skill

The public repository's existing `skills/composio/SKILL.md` remains the single user
entrypoint. Its canonical-information section links to the public Knowledge Base
and search endpoint after the skill's primary sources. The instruction stays simple
and open-ended so the host agent can decide when to search, inspect excerpts, and
open canonical pages without a second routing layer or separately installed skill.

The KB is public evidence, not proof of live account state, active incidents, or
customer-specific configuration. The host agent performs no separate model call for
retrieval; semantic search only embeds the query in the docs server.

### Internal support skills

The internal support configuration will add one shared support-knowledge lookup
skill and route its main support entrypoints through it:

- `draft-support-response` searches the shared KB before reusing legacy canned
  answers or starting a debugging workflow;
- `support-debug-issue` searches the shared KB after hydrating the live customer
  thread and before querying operational systems;
- the legacy FAQ, platform FAQ, toolkit FAQ, reply, and triage skills treat the
  shared KB as authoritative for public product facts; and
- the Decimal chat skill is deprecated as a default knowledge source because its
  generated answers and independently indexed corpus can drift from
  `support-knowledge`.

Internal skills must still inspect live Plain context, logs, databases, code, and
incident state when a question depends on customer configuration or current system
behavior. Search results are evidence, not proof of live state.

The first implementation uses the public KB only. It must not make `customer-safe`
content public merely to give internal skills access. Authenticated internal
retrieval remains deferred until the separate private index is designed.

## Failure Handling

- Missing or invalid embedding API credentials: return keyword results and mark the
  API response as degraded.
- Embedding API timeout or rate limit: return keyword results; do not fail the whole
  search request.
- Missing, corrupt, or mismatched semantic artifact: fail semantic initialization,
  log a structured reason without query text, and return keyword results.
- Algolia failure: use the existing local lexical retriever and keep semantic
  results.
- Both retrievers fail: return a service error so the UI shows its existing browse
  recovery paths.
- Snapshot or embedding generation failure: leave the previous generated snapshot
  and semantic artifact untouched.

No failure path may widen the corpus from public KB content to global Docs or
customer-safe content.

## Evaluation and Acceptance

V1 includes a small checked-in retrieval fixture derived from sanitized support
questions. It contains three query classes:

- exact identifiers and copied error text;
- paraphrased symptoms and natural-language questions; and
- out-of-scope or no-answer questions.

Each answerable fixture records one or more acceptable canonical KB URLs. Evaluation
reports Recall@1, Recall@3, Recall@5, and mean reciprocal rank separately for exact
and semantic query classes. The keyword-only output is retained as a baseline.

The first slice is acceptable when:

- every indexed record is provably public;
- exact-identifier Recall@3 does not regress from the keyword baseline;
- hybrid Recall@5 exceeds keyword-only Recall@5 on the paraphrase subset;
- repeated runs over the same snapshot and query produce identical ranking;
- a semantic or keyword dependency failure degrades as specified;
- the expected canonical section is easy to find during manual tests of common
  support questions; and
- global Docs search behavior and tests remain unchanged.

The repository owner performs the final qualitative relevance pass before the local
feature flag is enabled by default.

## Analytics

V1 reuses existing client analytics where possible and adds only provider-neutral
events for the KB surface:

- search completed, result count, and retrieval mode;
- zero-result search;
- result clicked, stable object ID, and displayed position; and
- dependency degradation category.

The server sends the first 200 characters of each query to PostHog after redacting
common credential patterns. This is intentional for MVP relevance review; the
public disclosure for query logging is handled separately. Client click/search
events remain provider-neutral and must not attach the query through URL metadata.
Algolia query IDs may continue to measure the keyword candidate request, but hybrid
display positions must not be misreported as Algolia's original keyword positions.

## Rollout

1. Build and test the importer and normalized public records against the current
   local snapshot.
2. Build the semantic artifact and offline evaluation command.
3. Implement hybrid retrieval behind a server-side feature flag, disabled by
   default.
4. Point only the local `/kb/search` experience at the hybrid mode.
5. Add the KB fallback to the existing public `composio` skill and test it against
   the local endpoint.
6. Route the internal support drafting and debugging skills through the same search
   contract.
7. Run automated retrieval evaluation, skill scenarios, and manual relevance
   testing.
8. Refresh the snapshot and semantic artifact after the separate corpus audit lands.
9. Enable hybrid search locally for continued testing.

There is no production deployment, push, or pull request in this plan. Any later
publication or rollout requires a separate explicit instruction.

## Verification

Implementation verification will include:

```bash
cd docs
bun run generate:kb
bun run sync:search --dry-run
bun run test
bun run types:check
bun run lint
bun run lint:links
bun run build
```

The implementation plan will add focused commands for building and checking the
semantic artifact and running the retrieval evaluation. Tests must cover importer
visibility enforcement, artifact version and content-hash validation, cosine
ranking, exact-match pinning, RRF merging, canonical-page deduplication, dependency
degradation, API schema, KB-only UI behavior, skill packaging, skill installation,
and representative skill search/read scenarios.

## Deferred Decisions

The following decisions require evidence from V1 usage rather than additional design
now:

- whether to add a cross-encoder or LLM reranker;
- whether to generate answers in the hosted UI;
- whether agents should load full articles or a broader long-context bundle after
  the V1 search/read workflow;
- whether the same hybrid retriever should replace global Docs search;
- how to expose customer-safe content to authenticated internal agents; and
- whether corpus growth warrants a vector database or approximate index.
