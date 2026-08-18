'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import type { KnowledgeSearchResponse } from '@/lib/knowledge/search';
import { PRODUCT_AREAS } from '@/lib/knowledge/taxonomy';
import { getKnowledgeDisplayDescription } from '@/lib/knowledge/display';

interface KnowledgeSearchResultsProps {
  query: string;
}

export function getHighlightedSegments(
  text: string,
  query: string,
): Array<{ text: string; highlighted: boolean }> {
  const terms = [...new Set(
    query.toLowerCase().match(/[a-z0-9_-]{2,}/g) ?? [],
  )].sort((left, right) => right.length - left.length);
  if (terms.length === 0) return [{ text, highlighted: false }];

  const pattern = new RegExp(`(${terms.join('|')})`, 'gi');
  return text.split(pattern).filter(Boolean).map((segment) => ({
    text: segment,
    highlighted: terms.includes(segment.toLowerCase()),
  }));
}

export function getKnowledgeSearchDisplayExcerpt(excerpt: string): string {
  return getKnowledgeDisplayDescription(excerpt);
}

function RecoveryLinks() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link href="/kb#support-topics" className="border border-fd-border px-3 py-2 text-sm font-medium hover:bg-fd-accent">
        Browse support topics
      </Link>
      <Link href="/kb/toolkits" className="border border-fd-border px-3 py-2 text-sm font-medium hover:bg-fd-accent">
        Browse toolkits
      </Link>
    </div>
  );
}

export function KnowledgeSearchResults({ query }: KnowledgeSearchResultsProps) {
  const normalizedQuery = query.trim();
  const [request, setRequest] = useState<{
    query: string;
    response: KnowledgeSearchResponse | null;
    failed: boolean;
  }>({ query: '', response: null, failed: false });
  const posthog = usePostHog();

  useEffect(() => {
    if (!normalizedQuery) return;
    const controller = new AbortController();
    fetch(`/api/knowledge-search?q=${encodeURIComponent(normalizedQuery)}&filter=kb`, {
      signal: controller.signal,
    })
      .then(async (result) => {
        if (!result.ok) throw new Error(`Search failed: ${result.status}`);
        return result.json() as Promise<KnowledgeSearchResponse>;
      })
      .then((result) => {
        setRequest({ query: normalizedQuery, response: result, failed: false });
        posthog?.capture('kb_search_completed', {
          retrieval_mode: result.mode ?? 'keyword',
          result_count: result.results.length,
          degradation_category: result.degradedReason ?? null,
        });
        if (result.results.length === 0) {
          posthog?.capture('kb_search_zero_results', {
            retrieval_mode: result.mode ?? 'keyword',
            degradation_category: result.degradedReason ?? null,
          });
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setRequest({ query: normalizedQuery, response: null, failed: true });
      });
    return () => controller.abort();
  }, [normalizedQuery, posthog]);

  const isCurrentRequest = request.query === normalizedQuery;
  const response = isCurrentRequest ? request.response : null;
  const state: 'idle' | 'loading' | 'ready' | 'error' = !normalizedQuery
    ? 'idle'
    : !isCurrentRequest
      ? 'loading'
      : request.failed
        ? 'error'
        : 'ready';

  return (
    <section aria-labelledby="knowledge-results-heading">
      <div aria-live="polite">
        {!normalizedQuery && (
          <div>
            <h2 id="knowledge-results-heading" className="text-xl font-semibold">Start with a product area</h2>
            <p className="mt-2 text-sm text-fd-muted-foreground">Search by product question, exact error, action slug, or toolkit name.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PRODUCT_AREAS.filter((area) => area.defaultBrowse).map((area) => (
                <Link key={area.slug} href={`/kb/topic/${area.slug}`} className="border border-fd-border p-4 hover:bg-fd-accent/50">
                  <span className="font-medium">{area.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {state === 'loading' && (
          <div role="status" aria-label="Loading search results" className="grid gap-3">
            <span className="sr-only">Searching public support knowledge…</span>
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                data-search-skeleton
                className="animate-pulse border border-fd-border bg-fd-muted/20 p-5"
              >
                <div className="h-3 w-24 bg-fd-muted" />
                <div className="mt-4 h-5 w-2/3 bg-fd-muted" />
                <div className="mt-4 h-3 w-full bg-fd-muted" />
                <div className="mt-2 h-3 w-4/5 bg-fd-muted" />
              </div>
            ))}
          </div>
        )}

        {state === 'error' && (
          <div className="border border-fd-border bg-fd-muted/20 p-6">
            <h2 id="knowledge-results-heading" className="text-lg font-semibold">Search is temporarily unavailable</h2>
            <p className="mt-2 text-sm text-fd-muted-foreground">Browse the curated paths below while the search service recovers.</p>
            <RecoveryLinks />
          </div>
        )}

        {state === 'ready' && response?.results.length === 0 && (
          <div className="border border-fd-border bg-fd-muted/20 p-6">
            <h2 id="knowledge-results-heading" className="text-lg font-semibold">No results for “{query}”</h2>
            <p className="mt-2 text-sm text-fd-muted-foreground">Try a shorter error phrase, action slug, or toolkit name.</p>
            <RecoveryLinks />
          </div>
        )}

        {state === 'ready' && response && response.results.length > 0 && (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="knowledge-results-heading" className="text-xl font-semibold">Results for “{query}”</h2>
              <span className="text-sm text-fd-muted-foreground">{response.total} results</span>
            </div>
            <ol className="mt-5 grid gap-3">
              {response.results.map((result, index) => (
                <li key={result.objectID}>
                  <a
                    href={result.canonicalUrl}
                    onClick={() => posthog?.capture('kb_search_result_clicked', {
                      object_id: result.objectID,
                      displayed_position: index + 1,
                      retrieval_mode: response.mode ?? 'keyword',
                    })}
                    className="group block border border-fd-border bg-fd-background p-5 transition-colors hover:border-fd-primary/40 hover:bg-fd-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {result.breadcrumbs.length > 0 && (
                        <span className="border border-fd-border bg-fd-muted/30 px-2 py-1 text-xs text-fd-muted-foreground">
                          {result.breadcrumbs.join(' / ')}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-start justify-between gap-4">
                      <h3 className="text-base font-semibold group-hover:text-fd-primary sm:text-lg">
                        {getHighlightedSegments(result.title, query).map((segment, segmentIndex) => (
                          segment.highlighted
                            ? <mark key={segmentIndex} className="bg-fd-primary/15 text-inherit">{segment.text}</mark>
                            : segment.text
                        ))}
                      </h3>
                      <ArrowUpRight className="mt-1 size-4 shrink-0 text-fd-muted-foreground" aria-hidden="true" />
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-fd-muted-foreground">
                      {getHighlightedSegments(getKnowledgeSearchDisplayExcerpt(result.excerpt), query).map((segment, segmentIndex) => (
                        segment.highlighted
                          ? <mark key={segmentIndex} className="bg-fd-primary/15 text-inherit">{segment.text}</mark>
                          : segment.text
                      ))}
                    </p>
                  </a>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
