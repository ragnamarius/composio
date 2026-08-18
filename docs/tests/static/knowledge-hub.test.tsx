import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import KnowledgeBaseLayout from '@/app/(home)/kb/layout';
import { KnowledgeHub } from '@/components/kb/knowledge-hub';
import {
  getKnowledgeSearchHref,
  KnowledgeSearchForm,
} from '@/components/kb/knowledge-search-form';
import { KnowledgeSearchResults } from '@/components/kb/knowledge-search-results';
import * as knowledgeSearchResultsModule from '@/components/kb/knowledge-search-results';

function source(path: string): string {
  return readFileSync(join(import.meta.dir, '../..', path), 'utf8');
}

describe('knowledge hub', () => {
  test('does not add a second viewport height below the shared header', () => {
    const html = renderToStaticMarkup(
      <KnowledgeBaseLayout>
        <main>Short knowledge page</main>
      </KnowledgeBaseLayout>,
    );

    expect(html).not.toContain('min-h-dvh');
    expect(html).toContain('class="flex-1');
  });

  test('renders a search-first landing page with curated recovery paths', async () => {
    const html = renderToStaticMarkup(await KnowledgeHub());

    expect(html).toContain('Search Composio support knowledge');
    expect(html).not.toContain('Composio Knowledge Base');
    const linkedTopics = new Set(
      [...html.matchAll(/href="\/kb\/topic\/([a-z0-9-]+)"/g)].map((match) => match[1]),
    );
    expect(linkedTopics.size).toBe(5);
    expect(html.match(/href="\/kb\/topic\//g)?.length).toBe(linkedTopics.size);
    expect(html).toContain('Support topics');
    expect(html).toContain('Browse by toolkit');
    expect(html).toContain('View all toolkits');
    expect(html).toContain('sm:justify-between');
    expect(html).toContain('lg:grid-cols-5');
    expect(html).not.toContain('lg:col-span');
    expect(html).toContain('space-y-12');
    expect(html).not.toContain('Featured answers and guides');
    expect(html).not.toContain('href="/kb/guide/platform-pagination"');
    expect(html).not.toContain('Popular searches');
    expect(html).not.toContain('href="/kb/search?q=OAuth+errors&amp;filter=kb"');
  });

  test('keeps homepage discovery sections actionable', async () => {
    const html = renderToStaticMarkup(await KnowledgeHub());
    const discoverySections = [
      ...html.matchAll(/<section[^>]*aria-labelledby="[^"]+"[^>]*>[\s\S]*?<\/section>/g),
    ].map((match) => match[0]);

    expect(discoverySections.length).toBeGreaterThanOrEqual(2);
    expect(discoverySections.every((section) => section.includes('href='))).toBe(true);
  });

  test('builds a shareable search URL and exposes a screen-reader-only label', () => {
    expect(getKnowledgeSearchHref('oauth github'))
      .toBe('/kb/search?q=oauth+github&filter=kb');
    const html = renderToStaticMarkup(<KnowledgeSearchForm defaultQuery="oauth github" />);

    expect(html).toContain('<label');
    expect(html).toContain('Search support knowledge');
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('name="q"');
    expect(html).toContain('name="filter" value="kb"');
    expect(html).toContain('focus-visible:ring-2');
    expect(html).toContain('focus-within:ring-2');
    expect(html).toContain('border-l border-fd-border');
    expect(html).not.toContain('absolute right-2');
  });

  test('keeps the KB search surface focused on public support answers', () => {
    const html = renderToStaticMarkup(
      <KnowledgeSearchResults query="revoked oauth access" />,
    );

    expect(html).not.toContain('Filter search results');
    expect(html).not.toContain('>Docs<');
    expect(html).not.toContain('>Reference<');
  });

  test('shows a stable result skeleton while a search loads', () => {
    const html = renderToStaticMarkup(
      <KnowledgeSearchResults query="revoked oauth access" />,
    );

    expect(html).toContain('aria-label="Loading search results"');
    expect(html.match(/data-search-skeleton/g)).toHaveLength(4);
  });

  test('identifies matching query terms for result emphasis', () => {
    const getHighlightedSegments = (
      knowledgeSearchResultsModule as {
        getHighlightedSegments?: (
          text: string,
          query: string,
        ) => Array<{ text: string; highlighted: boolean }>;
      }
    ).getHighlightedSegments;

    expect(typeof getHighlightedSegments).toBe('function');
    expect(getHighlightedSegments?.('GitHub OAuth redirect URI', 'github uri')).toEqual([
      { text: 'GitHub', highlighted: true },
      { text: ' OAuth redirect ', highlighted: false },
      { text: 'URI', highlighted: true },
    ]);
  });

  test('uses customer-facing fallback copy in search results', () => {
    const getKnowledgeSearchDisplayExcerpt = (
      knowledgeSearchResultsModule as {
        getKnowledgeSearchDisplayExcerpt?: (excerpt: string) => string;
      }
    ).getKnowledgeSearchDisplayExcerpt;

    expect(typeof getKnowledgeSearchDisplayExcerpt).toBe('function');
    expect(getKnowledgeSearchDisplayExcerpt?.('Public support knowledge for Airtable.'))
      .toBe('Setup and troubleshooting guidance for Airtable in Composio.');
    expect(getKnowledgeSearchDisplayExcerpt?.('Current navigation for connecting apps.'))
      .toBe('Current navigation for connecting apps.');
  });

  test('implements accessible result, empty, and failure states', () => {
    const resultsSource = source('components/kb/knowledge-search-results.tsx');

    expect(resultsSource).toContain('aria-live="polite"');
    expect(resultsSource).toContain('No results for');
    expect(resultsSource).toContain('Browse support topics');
    expect(resultsSource).toContain('Browse toolkits');
    expect(resultsSource).toContain('Search is temporarily unavailable');
    expect(resultsSource).toContain('filter=kb');
  });

  test('removes the generated Fumadocs tree from the KB layout', () => {
    const layoutSource = source('app/(home)/kb/layout.tsx');
    expect(layoutSource).not.toContain('createDocsLayout');
    expect(layoutSource).not.toContain('knowledgeBaseSource.pageTree');
  });
});
