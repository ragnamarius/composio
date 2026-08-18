import type { AlgoliaDocsRecord } from '@/lib/search-index';
import { normalizeKnowledgeText } from './search';
import type { KbSemanticRecord } from './semantic-artifact';
import type { ProductAreaSlug } from './types';

export interface PublicKbCandidateRecord {
  objectID: string;
  pageID: string;
  title: string;
  section: string | null;
  description: string;
  content: string;
  canonicalUrl: string;
  breadcrumbs: string[];
  productAreas: ProductAreaSlug[];
  toolkitSlugs: string[];
  keywords: string[];
  slug: string;
  toolNames: string[];
  toolSlugs: string[];
  pageRank: number;
  sectionRank: number;
  lastVerifiedAt: string | null;
}

export interface FusedKbCandidate {
  record: PublicKbCandidateRecord;
  exactTier: number;
  rrfScore: number;
  keywordRank: number | null;
  semanticRank: number | null;
}

export function publicKbCandidateFromAlgolia(record: AlgoliaDocsRecord): PublicKbCandidateRecord {
  if (record.source_type !== 'kb') throw new Error(`Expected a KB record: ${record.objectID}`);
  return {
    objectID: record.objectID,
    pageID: record.page_id,
    title: record.title,
    section: record.section ?? null,
    description: record.description ?? '',
    content: record.content,
    canonicalUrl: record.canonical_url,
    breadcrumbs: record.breadcrumbs ?? [],
    productAreas: record.product_areas,
    toolkitSlugs: record.toolkit_slugs,
    keywords: record.keywords ?? [],
    slug: record.slug ?? '',
    toolNames: record.tool_names ?? [],
    toolSlugs: record.tool_slugs ?? [],
    pageRank: record.page_rank,
    sectionRank: record.section_rank,
    lastVerifiedAt: record.last_verified_at,
  };
}

export function publicKbCandidateFromSemantic(record: KbSemanticRecord): PublicKbCandidateRecord {
  return {
    objectID: record.objectID,
    pageID: record.pageID,
    title: record.title,
    section: record.section,
    description: record.description,
    content: record.content,
    canonicalUrl: record.canonicalUrl,
    breadcrumbs: record.breadcrumbs,
    productAreas: record.productAreas,
    toolkitSlugs: record.toolkitSlugs,
    keywords: record.keywords,
    slug: record.slug,
    toolNames: record.toolNames,
    toolSlugs: record.toolSlugs,
    pageRank: record.pageRank,
    sectionRank: record.sectionRank,
    lastVerifiedAt: record.lastVerifiedAt,
  };
}

function exactTier(record: PublicKbCandidateRecord, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;
  const title = normalizeKnowledgeText(record.title);
  if (title === normalizedQuery) return 3;
  const identity = [
    ...record.keywords,
    record.slug,
    ...record.toolNames,
    ...record.toolSlugs,
    ...record.toolkitSlugs,
  ].map(normalizeKnowledgeText).filter(Boolean);
  if (identity.some(value => value === normalizedQuery)) return 2;
  const phraseFields = [title, ...identity, normalizeKnowledgeText(record.section ?? ''),
    normalizeKnowledgeText(record.description), normalizeKnowledgeText(record.content)];
  if (phraseFields.some(value => value.includes(normalizedQuery))) return 1;
  return 0;
}

function canonicalPage(url: string): string {
  return url.split('#', 1)[0] ?? url;
}

export function fusePublicKbCandidates(input: {
  query: string;
  keyword: PublicKbCandidateRecord[];
  semantic: PublicKbCandidateRecord[];
  limit: number;
  rrfConstant?: number;
}): FusedKbCandidate[] {
  const rrfConstant = input.rrfConstant ?? 60;
  const byObjectID = new Map<string, FusedKbCandidate>();
  const add = (
    record: PublicKbCandidateRecord,
    source: 'keyword' | 'semantic',
    rank: number,
  ) => {
    const current = byObjectID.get(record.objectID) ?? {
      record,
      exactTier: exactTier(record, normalizeKnowledgeText(input.query)),
      rrfScore: 0,
      keywordRank: null,
      semanticRank: null,
    };
    current.rrfScore += 1 / (rrfConstant + rank);
    if (source === 'keyword') current.keywordRank = rank;
    else current.semanticRank = rank;
    byObjectID.set(record.objectID, current);
  };
  input.keyword.slice(0, 50).forEach((record, index) => add(record, 'keyword', index + 1));
  input.semantic.slice(0, 50).forEach((record, index) => add(record, 'semantic', index + 1));

  const ranked = [...byObjectID.values()].sort((left, right) =>
    right.exactTier - left.exactTier ||
    right.rrfScore - left.rrfScore ||
    right.record.pageRank - left.record.pageRank ||
    right.record.sectionRank - left.record.sectionRank ||
    left.record.title.localeCompare(right.record.title) ||
    left.record.objectID.localeCompare(right.record.objectID),
  );
  const bestByPage = new Map<string, FusedKbCandidate>();
  for (const candidate of ranked) {
    const page = canonicalPage(candidate.record.canonicalUrl);
    if (!bestByPage.has(page)) bestByPage.set(page, candidate);
  }
  return [...bestByPage.values()].slice(0, Math.min(Math.max(0, input.limit), 20));
}
