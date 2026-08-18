import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AlgoliaDocsRecord } from '@/lib/search-index';
import {
  algoliaFacetFilters,
  filterLegacyReferenceRecords,
  knowledgeSearchResultFromRecord,
  searchKnowledgeRecords,
} from '@/lib/knowledge/search';
import { createKnowledgeSearchHandler, GET } from '@/app/api/knowledge-search/route';
import { publicKbCandidateFromAlgolia } from '@/lib/knowledge/hybrid-search';
import type { KnowledgeSourceType } from '@/lib/knowledge/types';

function record(input: {
  id: string;
  title: string;
  sourceType: KnowledgeSourceType;
  pageRank: number;
  description?: string;
  content?: string;
  keywords?: string[];
}): AlgoliaDocsRecord {
  const canonicalUrl = `/${input.sourceType}/${input.id}`;
  return {
    objectID: input.id,
    title: input.title,
    description: input.description ?? input.title,
    breadcrumbs: ['Knowledge'],
    url: canonicalUrl,
    page_id: canonicalUrl,
    content: input.content ?? input.description ?? input.title,
    keywords: input.keywords ?? [],
    slug: input.id,
    headings: [],
    type: input.sourceType,
    lang: 'en',
    page_rank: input.pageRank,
    toolkit_popularity: 0,
    section_rank: 120,
    position: 0,
    depth: 0,
    source_type: input.sourceType,
    canonical_url: canonicalUrl,
    product_areas: input.sourceType === 'reference' || input.sourceType === 'legacy'
      ? ['sdk-api-and-mcp']
      : [],
    toolkit_slugs: [],
    intents: [],
    last_verified_at: input.sourceType === 'kb' ? '2026-07-22' : null,
  };
}

const closeMatchRecords = [
  record({ id: 'docs', title: 'Connected account setup', sourceType: 'docs', pageRank: 2_000 }),
  record({ id: 'kb', title: 'Connected account setup', sourceType: 'kb', pageRank: 1_900 }),
  record({ id: 'oauth', title: 'Connected account setup', sourceType: 'oauth-guide', pageRank: 1_700 }),
  record({ id: 'toolkit', title: 'Connected account setup', sourceType: 'toolkit', pageRank: 1_500 }),
  record({ id: 'example', title: 'Connected account setup', sourceType: 'example', pageRank: 1_300 }),
  record({ id: 'reference', title: 'Connected account setup', sourceType: 'reference', pageRank: 700 }),
  record({ id: 'changelog', title: 'Connected account setup', sourceType: 'changelog', pageRank: 350 }),
  record({ id: 'legacy', title: 'Connected account setup', sourceType: 'legacy', pageRank: 25 }),
];

describe('unified knowledge search', () => {
  test('uses source rank only to break equally relevant close matches', () => {
    const result = searchKnowledgeRecords(closeMatchRecords, {
      query: 'connected account setup',
      filter: 'all',
      limit: 20,
    });

    expect(result.results.map((item) => item.sourceType)).toEqual([
      'docs', 'kb', 'oauth-guide', 'toolkit', 'example', 'reference', 'changelog', 'legacy',
    ]);
  });

  test('lets exact titles, action slugs, and error phrases beat page rank', () => {
    const records = [
      record({
        id: 'generic-doc',
        title: 'Troubleshoot toolkit actions',
        sourceType: 'docs',
        pageRank: 2_400,
        content: 'Calendly and Odoo troubleshooting overview.',
      }),
      record({
        id: 'calendly',
        title: 'Use CALENDLY_POST_INVITEE for invitee creation',
        sourceType: 'kb',
        pageRank: 1_900,
        keywords: ['CALENDLY_POST_INVITEE'],
      }),
      record({
        id: 'odoo',
        title: 'Inspect Odoo JSON-RPC errors inside HTTP 200 responses',
        sourceType: 'kb',
        pageRank: 1_900,
        content: 'The response has HTTP 200 but contains an Odoo JSON-RPC error object.',
      }),
      record({
        id: 'exact-reference',
        title: 'Create a connected account',
        sourceType: 'reference',
        pageRank: 700,
      }),
    ];

    expect(searchKnowledgeRecords(records, {
      query: 'CALENDLY_POST_INVITEE', filter: 'all', limit: 10,
    }).results[0]?.objectID).toBe('calendly');
    expect(searchKnowledgeRecords(records, {
      query: 'HTTP 200 but contains an Odoo JSON-RPC error', filter: 'all', limit: 10,
    }).results[0]?.objectID).toBe('odoo');
    expect(searchKnowledgeRecords(records, {
      query: 'Create a connected account', filter: 'all', limit: 10,
    }).results[0]?.objectID).toBe('exact-reference');
  });

  test('maps every source filter and keeps examples and changelog in All', () => {
    expect(algoliaFacetFilters('all')).toEqual([]);
    expect(algoliaFacetFilters('docs')).toEqual([['source_type:docs']]);
    expect(algoliaFacetFilters('kb')).toEqual([['source_type:kb']]);
    expect(algoliaFacetFilters('oauth')).toEqual([['source_type:oauth-guide']]);
    expect(algoliaFacetFilters('toolkits')).toEqual([['source_type:toolkit']]);
    expect(algoliaFacetFilters('reference')).toEqual([
      ['source_type:reference', 'source_type:legacy'],
    ]);

    const all = searchKnowledgeRecords(closeMatchRecords, {
      query: 'connected', filter: 'all', limit: 20,
    });
    expect(all.results.some((item) => item.sourceType === 'example')).toBe(true);
    expect(all.results.some((item) => item.sourceType === 'changelog')).toBe(true);
    expect(searchKnowledgeRecords(closeMatchRecords, {
      query: 'connected', filter: 'oauth', limit: 20,
    }).results.every((item) => item.sourceType === 'oauth-guide')).toBe(true);
  });

  test('hides legacy reference unless it is the only exact match', () => {
    const records = [
      record({
        id: 'current-auth', title: 'Authentication reference', sourceType: 'reference', pageRank: 700,
      }),
      record({
        id: 'legacy-token', title: 'Old token endpoint foo_unique', sourceType: 'legacy', pageRank: 25,
      }),
    ];

    expect(searchKnowledgeRecords(records, {
      query: 'reference', filter: 'reference', limit: 20,
    }).results.map((item) => item.objectID)).toEqual(['current-auth']);
    expect(searchKnowledgeRecords(records, {
      query: 'Old token endpoint foo_unique', filter: 'reference', limit: 20,
    }).results.map((item) => item.objectID)).toEqual(['legacy-token']);

    const currentExact = record({
      id: 'current-exact', title: 'Create connected account', sourceType: 'reference', pageRank: 700,
    });
    const legacyExact = record({
      id: 'legacy-exact', title: 'Create connected account', sourceType: 'legacy', pageRank: 25,
    });
    expect(filterLegacyReferenceRecords(
      [legacyExact, currentExact],
      'Create connected account',
      'reference',
    ).map((item) => item.objectID)).toEqual(['current-exact']);
    expect(searchKnowledgeRecords([legacyExact, currentExact], {
      query: 'Create connected account', filter: 'reference', limit: 20,
    }).results.map((item) => item.objectID)).toEqual(['current-exact']);
  });

  test('returns no documents for an empty query', () => {
    expect(searchKnowledgeRecords(closeMatchRecords, {
      query: '   ', filter: 'all', limit: 20,
    })).toEqual({ query: '', filter: 'all', results: [], total: 0 });
  });

  test('does not let incidental stop-word matches outrank a meaningful partial match', () => {
    const records = [
      record({
        id: 'generic',
        title: 'Audit data handling',
        sourceType: 'kb',
        pageRank: 2_400,
        content: 'The audit row is retained when data storage is disabled.',
      }),
      record({
        id: 'calendar',
        title: 'Google Calendar troubleshooting',
        sourceType: 'kb',
        pageRank: 1_900,
        content: 'Use primary when the signed-in user alias fails as a calendar ID.',
      }),
    ];

    expect(searchKnowledgeRecords(records, {
      query: 'Why does the signed-in user alias fail when I pass it as a calendar id?',
      filter: 'kb',
      limit: 20,
    }).results[0]?.objectID).toBe('calendar');
    expect(searchKnowledgeRecords(records, {
      query: 'the and when does it',
      filter: 'kb',
      limit: 20,
    }).results).toEqual([]);
  });

  test('does not repeat the source badge as the first breadcrumb', () => {
    const toolkit = record({
      id: 'github', title: 'GitHub', sourceType: 'toolkit', pageRank: 1_500,
    });
    toolkit.breadcrumbs = ['Toolkit', 'Authentication'];
    expect(knowledgeSearchResultFromRecord(toolkit).breadcrumbs).toEqual(['Authentication']);
  });

  test('returns plain-text excerpts from Algolia highlight markup', () => {
    const docs = record({
      id: 'auth', title: 'Authentication', sourceType: 'docs', pageRank: 2_000,
    });
    expect(knowledgeSearchResultFromRecord(
      docs,
      'Use &lt;managed&gt; <mark>OAuth</mark> &amp; API keys.',
    ).excerpt).toBe('Use <managed> OAuth & API keys.');
  });

  test('removes markdown decoration from result excerpts', () => {
    const guide = record({
      id: 'oauth', title: 'OAuth setup', sourceType: 'kb', pageRank: 1_900,
    });

    expect(knowledgeSearchResultFromRecord(
      guide,
      '# Create an auth config\n\nUse **custom OAuth** credentials from `GitHub`.',
    ).excerpt).toBe('Create an auth config Use custom OAuth credentials from GitHub.');
  });

  test('rejects invalid API filters', async () => {
    const response = await GET(new Request(
      'http://localhost/api/knowledge-search?q=github&filter=invalid',
    ));
    expect(response.status).toBe(400);
  });

  test('returns fused public KB results with provider-neutral retrieval metadata', async () => {
    const github = publicKbCandidateFromAlgolia(record({
      id: 'github-answer',
      title: 'Reconnect GitHub',
      sourceType: 'kb',
      pageRank: 1_900,
    }));
    const oauth = publicKbCandidateFromAlgolia(record({
      id: 'oauth-answer',
      title: 'Refresh OAuth access',
      sourceType: 'kb',
      pageRank: 1_900,
    }));
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [github, oauth] }),
      searchSemanticCandidates: async () => [oauth, github],
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=revoked+access&filter=kb',
    ));
    const body = await response.json() as {
      mode: string;
      results: Array<{ objectID: string; sourceType: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.mode).toBe('hybrid');
    expect(body.results.map(result => result.objectID)).toEqual(['github-answer', 'oauth-answer']);
    expect(body.results.every(result => result.sourceType === 'kb')).toBe(true);
  });

  test('removes markdown decoration from hybrid result excerpts', async () => {
    const github = publicKbCandidateFromAlgolia(record({
      id: 'github-oauth',
      title: 'Configure GitHub OAuth',
      sourceType: 'kb',
      pageRank: 1_900,
      content: '# Create an auth config\n\nUse **custom OAuth** credentials from `GitHub`.',
    }));
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [github] }),
      searchSemanticCandidates: async () => [github],
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=github+oauth&filter=kb',
    ));
    const body = await response.json() as {
      results: Array<{ excerpt: string }>;
    };

    expect(body.results[0]?.excerpt).toBe(
      'Create an auth config Use custom OAuth credentials from GitHub.',
    );
  });

  test('abstains when hybrid retrieval has neither semantic nor exact keyword evidence', async () => {
    const incidentalKeywordMatch = publicKbCandidateFromAlgolia(record({
      id: 'incidental',
      title: 'Operational health checks',
      sourceType: 'kb',
      pageRank: 1_900,
      content: 'A generic page sharing only incidental words with the query.',
    }));
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [incidentalKeywordMatch] }),
      searchSemanticCandidates: async () => [],
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=unrelated+request&filter=kb',
    ));
    const body = await response.json() as {
      strongMatch?: boolean;
      total: number;
      results: unknown[];
    };

    expect(response.status).toBe(200);
    expect(body.strongMatch).toBe(false);
    expect(body.total).toBe(0);
    expect(body.results).toEqual([]);
  });

  test('keeps an exact keyword identity when semantic retrieval abstains', async () => {
    const exactKeywordMatch = publicKbCandidateFromAlgolia(record({
      id: 'exact-identifier',
      title: 'Action troubleshooting',
      sourceType: 'kb',
      pageRank: 1_900,
      keywords: ['EXACT_ACTION_IDENTIFIER'],
    }));
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [exactKeywordMatch] }),
      searchSemanticCandidates: async () => [],
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=EXACT_ACTION_IDENTIFIER&filter=kb',
    ));
    const body = await response.json() as {
      strongMatch?: boolean;
      results: Array<{ objectID: string }>;
    };

    expect(body.strongMatch).toBe(true);
    expect(body.results.map(result => result.objectID)).toEqual(['exact-identifier']);
  });

  test('allows a cold semantic request to finish without degrading', async () => {
    const answer = publicKbCandidateFromAlgolia(record({
      id: 'cold-answer',
      title: 'Cold-start answer',
      sourceType: 'kb',
      pageRank: 1_900,
    }));
    const handler = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [answer] }),
      searchSemanticCandidates: async () => {
        await new Promise(resolve => setTimeout(resolve, 2_200));
        return [answer];
      },
    });

    const response = await handler(new Request(
      'http://localhost/api/knowledge-search?q=cold-start+answer&filter=kb',
    ));
    const body = await response.json() as {
      mode: string;
      degradedReason?: string;
    };

    expect(body.mode).toBe('hybrid');
    expect(body.degradedReason).toBeUndefined();
  });

  test('degrades to either retriever and fails only when both are unavailable', async () => {
    const answer = publicKbCandidateFromAlgolia(record({
      id: 'answer',
      title: 'Known answer',
      sourceType: 'kb',
      pageRank: 1_900,
    }));
    const semanticFailure = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => ({ candidates: [answer] }),
      searchSemanticCandidates: async () => {
        throw new Error('semantic-request-failed');
      },
    });
    const keywordFailure = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => {
        throw new Error('keyword-request-failed');
      },
      searchSemanticCandidates: async () => [answer],
    });
    const bothFail = createKnowledgeSearchHandler({
      hybridEnabled: () => true,
      searchKeywordCandidates: async () => {
        throw new Error('keyword-request-failed');
      },
      searchSemanticCandidates: async () => {
        throw new Error('semantic-request-failed');
      },
    });
    const request = () => new Request(
      'http://localhost/api/knowledge-search?q=known+answer&filter=kb',
    );

    expect(await (await semanticFailure(request())).json()).toMatchObject({
      mode: 'keyword',
      degradedReason: 'semantic-request-failed',
    });
    expect(await (await keywordFailure(request())).json()).toMatchObject({
      mode: 'semantic',
      degradedReason: 'keyword-request-failed',
    });
    expect((await bothFail(request())).status).toBe(503);
  });

  test('configures normalized search facets and retrieval fields', () => {
    const syncSource = readFileSync(
      join(import.meta.dir, '../../scripts/sync-algolia-search.ts'),
      'utf8',
    );
    const retrievalFields = syncSource.slice(
      syncSource.indexOf('attributesToRetrieve:'),
      syncSource.indexOf('searchableAttributes:'),
    );



    for (const field of [
      'source_type', 'canonical_url', 'product_areas', 'toolkit_slugs', 'intents',
      'last_verified_at', 'keywords', 'slug', 'tool_names', 'tool_slugs',
    ]) {
      expect(retrievalFields).toContain(`'${field}'`);
    }
    expect(syncSource).toContain("customRanking: [\n            'desc(page_rank)',\n            'desc(section_rank)',\n          ]");
  });
});
