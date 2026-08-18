import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liteClient } from 'algoliasearch/lite';
import {
  ALGOLIA_DEFAULT_APP_ID,
  ALGOLIA_DEFAULT_INDEX_NAME,
  getAlgoliaSearchDocuments,
  type AlgoliaDocsRecord,
} from '@/lib/search-index';
import type { KbManifest } from '@/lib/kb/types';
import { embedTexts, embeddingContentHash } from '@/lib/knowledge/embeddings';
import {
  fusePublicKbCandidates,
  publicKbCandidateFromAlgolia,
  publicKbCandidateFromSemantic,
  type PublicKbCandidateRecord,
} from '@/lib/knowledge/hybrid-search';
import {
  rankSemanticCandidates,
  validateSemanticArtifact,
  type KbSemanticArtifact,
} from '@/lib/knowledge/semantic-artifact';
import {
  acquireDefaultSemanticSearch,
  defaultSemanticTimeoutMs,
  type SemanticSearchAdmission,
} from '@/lib/knowledge/semantic-protection';
import {
  queueKnowledgeSearchAnalytics,
  type KnowledgeSearchAnalyticsEvent,
} from '@/lib/knowledge/query-analytics';
import {
  algoliaFacetFilters,
  filterLegacyReferenceRecords,
  isKnowledgeFilter,
  knowledgeSearchResultFromRecord,
  plainKnowledgeExcerpt,
  searchKnowledgeRecords,
  type KnowledgeDegradationReason,
  type KnowledgeFilter,
  type KnowledgeRetrievalMode,
  type KnowledgeSearchResponse,
  type KnowledgeSearchResult,
} from '@/lib/knowledge/search';

interface HighlightValue {
  value?: string;
}

const KB_SEMANTIC_MINIMUM_SIMILARITY = 0.3;

type KnowledgeAlgoliaHit = AlgoliaDocsRecord & {
  _snippetResult?: { content?: HighlightValue };
  _highlightResult?: { description?: HighlightValue };
};

export interface KeywordCandidateSearch {
  candidates: PublicKbCandidateRecord[];
  degradedReason?: KnowledgeDegradationReason;
}

export interface KnowledgeSearchDependencies {
  hybridEnabled: () => boolean;
  searchKeywordCandidates: (query: string) => Promise<KeywordCandidateSearch>;
  searchSemanticCandidates: (
    query: string,
    options?: { signal: AbortSignal },
  ) => Promise<PublicKbCandidateRecord[]>;
  acquireSemanticSearch?: (request: Request) => SemanticSearchAdmission;
  semanticTimeoutMs?: () => number;
  captureSearch?: (event: KnowledgeSearchAnalyticsEvent) => void;
}

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, init);
}

async function searchAlgolia(
  query: string,
  filter: KnowledgeFilter,
): Promise<KnowledgeSearchResponse | null> {
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? ALGOLIA_DEFAULT_APP_ID;
  const searchApiKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;
  const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? ALGOLIA_DEFAULT_INDEX_NAME;
  if (!appId || !searchApiKey || !indexName) return null;

  const client = liteClient(appId, searchApiKey);
  const response = await client.searchForHits<KnowledgeAlgoliaHit>({
    requests: [{
      type: 'default',
      indexName,
      query,
      distinct: true,
      hitsPerPage: 30,
      facetFilters: algoliaFacetFilters(filter),
      attributesToHighlight: ['title', 'description', 'content'],
      attributesToSnippet: ['content:40'],
    }],
  });
  const result = response.results[0];
  const hits = result.hits ?? [];
  const visibleHits = filterLegacyReferenceRecords(
    hits.filter(hit => hit.source_type && hit.canonical_url),
    query,
    filter,
  );
  const mapped = visibleHits.map(hit => knowledgeSearchResultFromRecord(
    hit,
    hit._snippetResult?.content?.value ?? hit._highlightResult?.description?.value,
  ));
  return {
    query,
    filter,
    results: mapped,
    total: filter === 'reference' ? mapped.length : (result.nbHits ?? mapped.length),
  };
}

async function localKbCandidates(query: string): Promise<PublicKbCandidateRecord[]> {
  const records = (await getAlgoliaSearchDocuments()).filter(record => record.source_type === 'kb');
  const byObjectID = new Map(records.map(record => [record.objectID, record]));
  return searchKnowledgeRecords(records, { query, filter: 'kb', limit: 50 }).results
    .flatMap(result => {
      const record = byObjectID.get(result.objectID);
      return record ? [publicKbCandidateFromAlgolia(record)] : [];
    });
}

async function defaultKeywordSearch(query: string): Promise<KeywordCandidateSearch> {
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? ALGOLIA_DEFAULT_APP_ID;
  const searchApiKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;
  const indexName = process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? ALGOLIA_DEFAULT_INDEX_NAME;
  if (!appId || !searchApiKey || !indexName) {
    return { candidates: await localKbCandidates(query) };
  }

  try {
    const client = liteClient(appId, searchApiKey);
    const response = await client.searchForHits<KnowledgeAlgoliaHit>({
      requests: [{
        type: 'default',
        indexName,
        query,
        distinct: false,
        hitsPerPage: 50,
        facetFilters: [['source_type:kb']],
        attributesToHighlight: [],
        attributesToSnippet: [],
      }],
    });
    return {
      candidates: (response.results[0].hits ?? [])
        .filter(hit => hit.source_type === 'kb' && Boolean(hit.canonical_url))
        .map(publicKbCandidateFromAlgolia),
    };
  } catch {
    return {
      candidates: await localKbCandidates(query),
      degradedReason: 'keyword-request-failed',
    };
  }
}

let semanticArtifact: KbSemanticArtifact | null = null;

async function loadSemanticArtifact(): Promise<KbSemanticArtifact> {
  if (semanticArtifact) return semanticArtifact;
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'kb', 'manifest.json'), 'utf8'),
  ) as KbManifest;
  const artifact = JSON.parse(
    readFileSync(join(process.cwd(), 'kb', 'semantic-index.json'), 'utf8'),
  ) as KbSemanticArtifact;
  const hashes = new Map(
    (await getAlgoliaSearchDocuments())
      .filter(record => record.source_type === 'kb')
      .map(record => [record.objectID, embeddingContentHash(record)]),
  );
  semanticArtifact = validateSemanticArtifact(artifact, {
    sourceCommit: manifest.source.commit,
    contentHashes: hashes,
  });
  return semanticArtifact;
}

async function defaultSemanticSearch(
  query: string,
  options?: { signal: AbortSignal },
): Promise<PublicKbCandidateRecord[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('embedding-unavailable');
  let artifact: KbSemanticArtifact;
  try {
    artifact = await loadSemanticArtifact();
  } catch {
    throw new Error('semantic-artifact-invalid');
  }
  try {
    const [queryVector] = await embedTexts([query], { apiKey, signal: options?.signal });
    if (!queryVector) throw new Error('missing query vector');
    return rankSemanticCandidates(artifact, queryVector, 50, {
      minimumSimilarity: KB_SEMANTIC_MINIMUM_SIMILARITY,
    })
      .map(candidate => publicKbCandidateFromSemantic(candidate.record));
  } catch (error) {
    if (options?.signal.aborted) throw error;
    throw new Error('semantic-request-failed');
  }
}

const defaultDependencies: KnowledgeSearchDependencies = {
  hybridEnabled: () => process.env.KB_HYBRID_SEARCH_ENABLED === 'true',
  searchKeywordCandidates: defaultKeywordSearch,
  searchSemanticCandidates: defaultSemanticSearch,
  acquireSemanticSearch: acquireDefaultSemanticSearch,
  semanticTimeoutMs: defaultSemanticTimeoutMs,
  captureSearch: queueKnowledgeSearchAnalytics,
};

function degradationReason(error: unknown, fallback: KnowledgeDegradationReason): KnowledgeDegradationReason {
  const message = error instanceof Error ? error.message : '';
  const allowed: KnowledgeDegradationReason[] = [
    'embedding-unavailable',
    'semantic-artifact-invalid',
    'semantic-request-failed',
    'semantic-timeout',
    'semantic-rate-limited',
    'semantic-capacity-limited',
    'keyword-request-failed',
  ];
  return allowed.includes(message as KnowledgeDegradationReason)
    ? message as KnowledgeDegradationReason
    : fallback;
}

async function protectedSemanticSearch(
  query: string,
  request: Request,
  dependencies: KnowledgeSearchDependencies,
): Promise<PublicKbCandidateRecord[]> {
  const admission = dependencies.acquireSemanticSearch?.(request)
    ?? { allowed: true as const, release: () => {} };
  if (!admission.allowed) throw new Error(admission.reason);

  const controller = new AbortController();
  const timeoutMs = dependencies.semanticTimeoutMs?.() ?? defaultSemanticTimeoutMs();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error('semantic-timeout'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      dependencies.searchSemanticCandidates(query, { signal: controller.signal }),
      timeout,
    ]);
  } catch (error) {
    if (timedOut) throw new Error('semantic-timeout');
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    admission.release();
  }
}

function excerpt(value: string): string {
  const plain = plainKnowledgeExcerpt(value);
  return plain.length > 260 ? `${plain.slice(0, 257).trimEnd()}…` : plain;
}

function resultFromCandidate(record: PublicKbCandidateRecord): KnowledgeSearchResult {
  return {
    objectID: record.objectID,
    title: record.title,
    section: record.section,
    excerpt: excerpt(record.content || record.description || record.title),
    canonicalUrl: record.canonicalUrl,
    sourceType: 'kb',
    sourceLabel: 'Knowledge Base',
    breadcrumbs: record.breadcrumbs.filter(
      (breadcrumb, index) => index > 0 || breadcrumb.toLowerCase() !== 'knowledge base',
    ),
    productAreas: record.productAreas,
    toolkitSlugs: record.toolkitSlugs,
    lastVerifiedAt: record.lastVerifiedAt,
  };
}

export function createKnowledgeSearchHandler(
  dependencies: KnowledgeSearchDependencies = defaultDependencies,
): (request: Request) => Promise<Response> {
  return async request => {
    const url = new URL(request.url);
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
    const requestedFilter = url.searchParams.get('filter') ?? 'all';
    if (!isKnowledgeFilter(requestedFilter)) {
      return json({ error: `Invalid knowledge filter: ${requestedFilter}` }, { status: 400 });
    }
    if (!query) {
      return json({ query: '', filter: requestedFilter, results: [], total: 0 });
    }
    const startedAt = performance.now();
    const captureSearch = (
      event: Omit<KnowledgeSearchAnalyticsEvent, 'query' | 'filter' | 'durationMs'>,
    ): void => {
      if (event.degradationCategory) {
        console.warn('[kb-search]', JSON.stringify({
          event: 'kb_search_degraded',
          reason: event.degradationCategory,
          retrievalMode: event.retrievalMode,
          statusCode: event.statusCode,
        }));
      }
      try {
        dependencies.captureSearch?.({
          query,
          filter: requestedFilter,
          durationMs: performance.now() - startedAt,
          ...event,
        });
      } catch {
        // Search must remain available if analytics scheduling fails.
        console.warn('[kb-search]', JSON.stringify({
          event: 'kb_search_analytics_schedule_failed',
        }));
      }
    };

    if (requestedFilter !== 'kb' || !dependencies.hybridEnabled()) {
      let algoliaResponse: KnowledgeSearchResponse | null = null;
      try {
        algoliaResponse = await searchAlgolia(query, requestedFilter);
      } catch {
        algoliaResponse = null;
      }
      const response = algoliaResponse ?? searchKnowledgeRecords(
        await getAlgoliaSearchDocuments(),
        { query, filter: requestedFilter, limit: 30 },
      );
      if (requestedFilter === 'kb') response.mode = 'keyword';
      captureSearch({
        retrievalMode: response.mode ?? 'keyword',
        resultCount: response.results.length,
        degradationCategory: response.degradedReason ?? null,
        strongMatch: response.strongMatch ?? null,
        statusCode: 200,
      });
      return json(response, {
        headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' },
      });
    }

    const [keyword, semantic] = await Promise.allSettled([
      dependencies.searchKeywordCandidates(query),
      protectedSemanticSearch(query, request, dependencies),
    ]);
    if (keyword.status === 'rejected' && semantic.status === 'rejected') {
      captureSearch({
        retrievalMode: 'unavailable',
        resultCount: 0,
        degradationCategory: 'all-retrievers-failed',
        strongMatch: null,
        statusCode: 503,
      });
      return json({ error: 'Knowledge search is temporarily unavailable' }, { status: 503 });
    }

    const keywordCandidates = keyword.status === 'fulfilled' ? keyword.value.candidates : [];
    const semanticCandidates = semantic.status === 'fulfilled' ? semantic.value : [];
    let mode: KnowledgeRetrievalMode;
    if (keyword.status === 'fulfilled' && semantic.status === 'fulfilled') mode = 'hybrid';
    else if (semantic.status === 'fulfilled') mode = 'semantic';
    else mode = 'keyword';

    const degradedReason = keyword.status === 'rejected'
      ? degradationReason(keyword.reason, 'keyword-request-failed')
      : keyword.value.degradedReason ?? (semantic.status === 'rejected'
        ? degradationReason(semantic.reason, 'semantic-request-failed')
        : undefined);
    const fused = fusePublicKbCandidates({
      query,
      keyword: keywordCandidates,
      semantic: semanticCandidates,
      limit: 20,
    });
    const strongMatch = semantic.status === 'fulfilled'
      ? semanticCandidates.length > 0 || fused.some(candidate =>
        candidate.keywordRank !== null && candidate.exactTier > 0)
      : undefined;
    const results = (strongMatch === false ? [] : fused)
      .map(candidate => resultFromCandidate(candidate.record));
    const response: KnowledgeSearchResponse = {
      query,
      filter: 'kb',
      results,
      total: results.length,
      mode,
      ...(strongMatch === undefined ? {} : { strongMatch }),
      ...(degradedReason ? { degradedReason } : {}),
    };
    captureSearch({
      retrievalMode: mode,
      resultCount: results.length,
      degradationCategory: degradedReason ?? null,
      strongMatch: strongMatch ?? null,
      statusCode: 200,
    });
    return json(response, {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' },
    });
  };
}

export const GET = createKnowledgeSearchHandler();
