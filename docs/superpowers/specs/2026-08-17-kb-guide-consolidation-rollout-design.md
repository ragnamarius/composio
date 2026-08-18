# KB Guide Consolidation Rollout

## Objective

Extend the approved Gmail, Google Calendar, and HubSpot editorial pattern to a first cohort of eight high-use guides whose current pages contain many short, isolated sections. Improve scanning and narrative flow without removing support knowledge or changing routing and provenance.

## First cohort

1. Notion
2. Google Sheets
3. Supabase
4. Twitter/X
5. Google Drive
6. Google Docs
7. Airtable
8. Firecrawl

These guides rank relatively highly in the canonical toolkit order and have at least five sections with unusually little body content per heading. Guides such as GitHub, Slack, and Outlook remain candidates for a later, individually reviewed cohort because their existing sections are denser and less mechanically mergeable.

## Editorial pattern

Each guide will:

- Open with one sentence describing what the guide helps the reader accomplish.
- Replace issue-shaped headings with a smaller set of task-oriented level-two headings.
- Convert short, related facts into bold lead-ins within the appropriate task section.
- Keep distinct procedures, warnings, and troubleshooting branches separate when merging would blur the action a reader should take.
- Preserve exact tool slugs, parameter names, error messages, scope URLs, limits, links, code, and provider-specific qualifications.
- Avoid introducing new product claims or rewriting factual content beyond the connective copy needed for consolidation.

## Intended grouping

| Guide | Task-oriented groups |
| --- | --- |
| Notion | Use current tools and triggers; configure access and connection behavior; troubleshoot tokens and response size |
| Google Sheets | Connect and discover tools; update and populate sheets; troubleshoot auth, versions, and quotas |
| Supabase | Connect with OAuth or API keys; configure hosted and self-hosted endpoints; expose tools through MCP; troubleshoot permissions and rate limits |
| Twitter/X | Configure managed or customer-owned OAuth; publish and search with the correct credentials; troubleshoot developer-app and toolkit-version errors |
| Google Drive | Upload and download files; choose MCP or direct execution; configure OAuth and scopes; troubleshoot account, version, and session issues |
| Google Docs | Create and edit documents; configure Google OAuth; manage multiple accounts and sessions; connect through Platform or Connect MCP |
| Airtable | Connect and configure OAuth; execute and batch tools; configure triggers and troubleshoot discovery or connection expiry |
| Firecrawl | Connect with an API key; discover and run retrieval tools; configure endpoints and timeouts; understand Connect MCP account boundaries |

Final heading wording may be tightened during editing, but each fact must remain under a group with the same practical meaning.

## Source and data flow

The authored files in `kb/articles/` are the only hand-edited content. The existing KB generator will rebuild the corresponding `content/kb/guide/*.mdx` pages. The manifest, source snapshot, aliases, canonical URLs, tags, topic assignments, review dates, and source references remain unchanged.

Generated UI pages, search records, and agent indexes will receive the reorganized headings and prose order, but they must retain every factual claim present before the edit.

## Verification

For each guide:

1. Compare the before-and-after factual units and confirm none were lost.
2. Confirm exact identifiers, links, numbers, and error text are unchanged.
3. Regenerate KB content and require a clean generation check.
4. Run the KB static test suite and the production build.
5. Inspect representative rendered pages for heading balance, readable grouping, and intact inline code and links.

The rollout is successful when the eight pages have fewer, task-oriented headings; no source or routing metadata changes; all verification passes; and the pages retain the full support knowledge available before consolidation.
