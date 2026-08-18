import { describe, expect, test } from 'bun:test';
import { createKnowledgeSearchHandler } from '@/app/api/knowledge-search/route';
import { getPostHogPageViewUrl } from '@/components/posthog-provider';
import {
  buildKnowledgeSearchCapture,
  sendKnowledgeSearchAnalytics,
} from '@/lib/knowledge/query-analytics';

interface CapturedSearchEvent {
  query: string;
  filter: string;
  retrievalMode: string;
  resultCount: number;
  degradationCategory: string | null;
  strongMatch: boolean | null;
  statusCode: number;
  durationMs: number;
}

describe('knowledge search analytics', () => {
  test('records each completed API search with its retrieval outcome', async () => {
    const events: CapturedSearchEvent[] = [];
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [] }),
      searchSemanticCandidates: async () => [],
      captureSearch: event => events.push(event),
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=why+did+github+oauth+fail&filter=kb',
    ));

    expect(response.status).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      query: 'why did github oauth fail',
      filter: 'kb',
      retrievalMode: 'hybrid',
      resultCount: 0,
      degradationCategory: null,
      strongMatch: false,
      statusCode: 200,
    });
    expect(events[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('records semantic guardrail hits without failing the search request', async () => {
    const events: CapturedSearchEvent[] = [];
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [] }),
      searchSemanticCandidates: async () => {
        throw new Error('semantic search should not run after admission is denied');
      },
      acquireSemanticSearch: () => ({
        allowed: false,
        reason: 'semantic-capacity-limited',
      }),
      captureSearch: event => events.push(event),
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=github+oauth&filter=kb',
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: 'keyword',
      degradedReason: 'semantic-capacity-limited',
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      retrievalMode: 'keyword',
      degradationCategory: 'semantic-capacity-limited',
      statusCode: 200,
    });
  });

  test('builds an anonymous PostHog event with a lightly redacted query', () => {
    const capture = buildKnowledgeSearchCapture({
      query: 'GITHUB_CREATE_ISSUE failed token=sk-secretvalue123456',
      filter: 'kb',
      retrievalMode: 'keyword',
      resultCount: 2,
      degradationCategory: 'semantic-request-failed',
      strongMatch: null,
      statusCode: 200,
      durationMs: 42.7,
    }, {
      apiKey: 'phc_project_token',
      host: 'https://us.i.posthog.com/',
    });

    expect(capture).toEqual({
      url: 'https://us.i.posthog.com/i/v0/e/',
      body: {
        api_key: 'phc_project_token',
        event: 'kb_search_executed',
        properties: {
          distinct_id: 'public-kb-search',
          '$process_person_profile': false,
          query: 'GITHUB_CREATE_ISSUE failed token=[REDACTED]',
          filter: 'kb',
          retrieval_mode: 'keyword',
          result_count: 2,
          degradation_category: 'semantic-request-failed',
          strong_match: null,
          status_code: 200,
          duration_ms: 43,
        },
      },
    });
  });

  test('removes the KB query from generic PostHog pageview URLs', () => {
    expect(getPostHogPageViewUrl(
      'https://docs.composio.dev',
      '/kb/search',
      new URLSearchParams('q=github+oauth&filter=kb'),
    )).toBe('https://docs.composio.dev/kb/search?filter=kb');
    expect(getPostHogPageViewUrl(
      'https://docs.composio.dev',
      '/docs',
      new URLSearchParams('framework=nextjs'),
    )).toBe('https://docs.composio.dev/docs?framework=nextjs');
  });

  test('delivers the capture payload to the configured PostHog ingestion host', async () => {
    let receivedPath = '';
    let receivedBody: unknown;
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        receivedPath = new URL(request.url).pathname;
        receivedBody = await request.json();
        return new Response(null, { status: 202 });
      },
    });
    try {
      expect(await sendKnowledgeSearchAnalytics({
        query: 'github oauth delivery test',
        filter: 'kb',
        retrievalMode: 'hybrid',
        resultCount: 3,
        degradationCategory: null,
        strongMatch: true,
        statusCode: 200,
        durationMs: 25,
      }, {
        apiKey: 'phc_project_token',
        host: `http://127.0.0.1:${server.port}`,
        timeoutMs: 1_000,
      })).toBe(true);
      expect(receivedPath).toBe('/i/v0/e/');
      expect(receivedBody).toMatchObject({
        event: 'kb_search_executed',
        properties: { query: 'github oauth delivery test' },
      });
    } finally {
      server.stop(true);
    }
  });
});
