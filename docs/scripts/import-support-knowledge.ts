import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildKbCatalog } from '@/lib/kb/catalog';
import {
  buildSupportKnowledgeSnapshot,
  writeSupportKnowledgeSnapshot,
} from '@/lib/kb/support-knowledge';
import type { KbManifest } from '@/lib/kb/types';

const args = process.argv.slice(2);

function argument(name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const sourceRootArgument = argument('--source-root');
const sourceCommit = argument('--source-commit')?.trim();
if (!sourceRootArgument || !isAbsolute(sourceRootArgument)) {
  throw new Error('--source-root must be an absolute path to a support-knowledge checkout');
}
if (!sourceCommit) throw new Error('--source-commit is required');

const sourceRoot = realpathSync(sourceRootArgument);
const targetRoot = resolve(process.cwd(), 'kb');
const previousManifestPath = join(targetRoot, 'manifest.json');
const previousManifest = existsSync(previousManifestPath)
  ? JSON.parse(readFileSync(previousManifestPath, 'utf8')) as KbManifest
  : undefined;

const validation = spawnSync('python3', ['scripts/validate-kb.py'], {
  cwd: sourceRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (validation.status !== 0) {
  const details = [validation.stdout, validation.stderr].filter(Boolean).join('\n').trim();
  throw new Error(`support-knowledge validation failed${details ? `:\n${details}` : ''}`);
}

const now = new Date();
const snapshot = buildSupportKnowledgeSnapshot({
  sourceRoot,
  sourceCommit,
  previousManifest,
  now,
});

writeSupportKnowledgeSnapshot({
  snapshot,
  targetRoot,
  validate: stagedRoot => {
    buildKbCatalog(
      snapshot.manifest,
      sourcePath => readFileSync(join(stagedRoot, 'source', sourcePath), 'utf8'),
      now,
      articlePath => readFileSync(join(stagedRoot, 'articles', articlePath), 'utf8'),
    );
  },
});

console.log(
  `Imported ${snapshot.manifest.guides.length} public guides from ${sourceCommit}; run bun run generate:kb next.`,
);
