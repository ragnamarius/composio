# Public Knowledge Base

## Decision

Host the Composio public knowledge base in the existing documentation site at
`docs.composio.dev/kb`. Add **Knowledge Base** as a top-level navigation item
between Docs and Examples.

`ComposioHQ/support-knowledge` is the canonical authoring repository. The docs
site contains a pinned, manually reviewed publication snapshot with source
provenance and freshness metadata. A pull-only importer validates an explicit
local checkout and atomically refreshes that snapshot; it never writes upstream.

## Context

Customer-shareable support knowledge is classified in `support-knowledge` as
either `public` or `customer-safe`. Only `public.md` leaves are eligible for the
hosted site, public search artifacts, and public agent skills. The first
implementation prototype rendered two reviewed guides inside the marketing
`landing` repository. That prototype proved the
publication gates and user experience, but the docs application is a better
runtime because it already provides:

- Fumadocs content collections and article layouts;
- navigation, responsive sidebars, and search;
- Algolia indexing with a local Fumadocs fallback;
- feedback collection, sitemap generation, and LLM-readable endpoints;
- a public GitHub repository and an established documentation review process.

Keeping the KB in `landing` would duplicate those systems and split technical
support content from the documentation audience.

Three locations were considered:

1. **Docs application (chosen):** native documentation UX and discovery with a
   small amount of collection and route work.
2. **Marketing application:** strongest main-domain ownership, but duplicates
   docs rendering, search, feedback, and discovery infrastructure.
3. **Separate repository or subdomain:** independent deployment, but creates a
   third public content surface and the largest maintenance burden.

## Architecture

The system has three distinct responsibilities:

1. **Authoring:** support maintainers edit classified leaves in
   `support-knowledge`; its validation, freshness, manifest, and human review
   gates remain authoritative.
2. **Publication:** a maintainer runs the pull-only importer against an explicit
   source checkout and commit. The staged snapshot records source provenance,
   public routes, content hashes, verification dates, and review deadlines, and
   replaces the previous valid snapshot only after validation succeeds.
3. **Rendering:** the `docs/` Fumadocs application renders only published pages
   and includes them in navigation, search, sitemap, feedback, and LLM outputs.

The initial release keeps invocation and review manual. It automates the
mechanical copy so classification enforcement is reproducible, but it does not
fetch private repositories at application runtime, open pull requests, publish,
or write back to `support-knowledge`.

## Content Model

Every reviewed `public.md` file is eligible for the public corpus, but a source
file is not necessarily one web page. A self-contained level-two problem or
question can become an individual guide. Structural headings stay with their
parent guide.

The publication layer records:

- stable slug and aliases;
- title and description;
- source repository, commit, path, and selected heading;
- topics, tags, and related resources;
- updated and last-verified dates;
- freshness class and review deadline;
- `published`, `needs-review`, or `retired` state.

The docs-site snapshot imports every public leaf from a verified
`ComposioHQ/support-knowledge` commit. Customer-safe leaves remain excluded.
The manifest records both the exact commit and a deterministic hash of the
vendored public source bytes.

## Routes and Navigation

- `/kb` is the knowledge-base landing page.
- `/kb/<topic>` is a topic landing page when a topic has multiple guides.
- `/kb/<topic>/<guide-slug>` is the canonical guide route.
- aliases permanently redirect to the canonical route.

The header order is Docs, Knowledge Base, Examples, Toolkits, Reference. KB
pages use native Fumadocs layouts and components rather than maintaining a
second design system. The KB landing page may use a small custom MDX landing
page for search, featured guides, recently verified guides, and topic cards.

The marketing site may later redirect `composio.dev/kb` to
`docs.composio.dev/kb`; the unmerged marketing prototype does not establish a
public URL contract.

## Search and Discovery

Published KB sections participate in the existing ordinary Algolia keyword
index and a checked-in OpenAI `text-embedding-3-small` artifact. `/kb/search`
fuses up to 50 candidates from each retriever with deterministic Reciprocal
Rank Fusion, preserves exact identifier matches, and returns source passages and
canonical links without generating an answer. The semantic side uses a
256-dimensional exact cosine scan; this corpus does not justify Algolia
NeuralSearch, a vector database, or an approximate index.

Global Docs search remains keyword-only. If query embedding or the semantic
artifact is unavailable, KB search returns keyword results. If Algolia is
unavailable, it combines local lexical results with semantic results. No failure
path widens the corpus beyond public KB records.

Semantic requests have a short timeout, an eight-request concurrency ceiling,
a 60-request-per-minute client budget, and a generous 600-request-per-minute
process ceiling. Hitting any semantic guardrail is logged and degrades to
keyword results rather than blocking a user search. All limits are configurable.

The same read-only search and canonical-page contract is available to the
existing public `composio` skill as a fallback after its primary documentation
and CLI sources. The skill retrieves evidence and lets its host agent answer; it
does not contain a duplicate fact corpus or run its own generation service.
Authenticated retrieval of `customer-safe` content is a separate future design.

Published KB pages are also included in:

- the XML sitemap;
- `llms.txt`, `llms-full.txt`, and scoped `llms.mdx` routes;
- link validation;
- the existing feedback flow.

`needs-review` and retired entries are excluded from routes and every discovery
surface.

## Freshness and Privacy

Publication fails when a published entry:

- is not explicitly public;
- contains known private-data markers;
- has no verification or review deadline;
- has an expired review deadline;
- references an unknown topic, related guide, source section, or alias;
- collides with another canonical route or alias.

Default review windows remain 180 days for evergreen guidance, 30 days for
provider or OAuth setup, and 7 days for active incidents. These are publication
defaults in the docs application, not changes to the canonical source schema.

Guide pages show the last-verified date. Time-sensitive material is held by
default until its live behavior has been rechecked.

## Failure Handling

The KB validator runs before docs builds and reports the source path and reason
for invalid content. A failed or stale entry must not be silently omitted from
a supposedly successful publication. External resource failures must not make
the local KB unavailable; they may degrade to ordinary links.

## Testing and Verification

The implementation is complete when:

- parser and publication-gate unit tests pass;
- the importer verifies the upstream repository and exact checked-out commit;
- the validator reports the expected public guide count and no private leaves;
- `/kb`, topic pages, guide pages, and aliases render in a local docs build;
- held content is absent from routes, search, sitemap, and LLM outputs;
- existing docs tests, type checks, lint, link validation, and production build
  pass;
- the header exposes Knowledge Base in desktop and mobile navigation.

## Consequences

- The unmerged `landing` KB branch becomes a prototype, not the production
  destination. Reusable publication logic and tests are ported; custom page
  chrome is not.
- Public KB prose continues to be maintained in `support-knowledge`.
- The docs repository owns the deployed snapshot, route metadata, validation,
  and presentation.
- No new repository, subdomain, or synchronization service is introduced.
- The hosted UI, API, and agent skills share one public-only retrieval contract;
  customer-safe and live operational evidence remain separate boundaries.
