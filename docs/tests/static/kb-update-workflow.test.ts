import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflowPath = resolve(process.cwd(), '..', '.github', 'workflows', 'docs-update-kb.yml');
const dataWorkflowPath = resolve(
  process.cwd(),
  '..',
  '.github',
  'workflows',
  'docs-update-data.yml',
);
const importerPath = resolve(process.cwd(), 'scripts', 'import-support-knowledge.ts');

describe('support knowledge refresh workflow', () => {
  test('imports the private upstream and proposes every generated KB artifact', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('repository: ComposioHQ/support-knowledge');
    expect(workflow).toContain('bun run import:kb');
    expect(workflow).toContain('bun run build:kb-semantic');
    expect(workflow).toContain('bun run verify:kb');
    expect(workflow).toContain('docs/kb/');
    expect(workflow).toContain('docs/content/kb/');
    expect(workflow).toContain('branch: docs/auto-update-kb');
    expect(workflow).toContain('base: next');
    expect(workflow).toContain('refresh:');
    expect(workflow).toContain('propose:');
    expect(workflow).toContain('needs: refresh');
    expect(workflow).toContain('id: upstream-token');
    expect(workflow).toContain('id: write-token');
    expect(workflow).toContain('permission-contents: read');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('actions/upload-artifact@');
    expect(workflow).toContain('actions/download-artifact@');
  });

  test('can refresh immediately or discover upstream changes on a schedule', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('support-knowledge-updated');
    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('workflow_dispatch:');
  });

  test('gives the existing freshness sweep read access to the pinned upstream', () => {
    const workflow = readFileSync(dataWorkflowPath, 'utf8');

    expect(workflow).toContain('repositories: support-knowledge');
    expect(workflow).toContain('id: source-token');
    expect(workflow).toContain('GH_TOKEN: ${{ steps.source-token.outputs.token }}');
  });

  test('treats upstream files as data instead of executing upstream code', () => {
    const importer = readFileSync(importerPath, 'utf8');

    expect(importer).not.toContain('scripts/validate-kb.py');
    expect(importer).not.toContain("spawnSync('python3'");
  });
});
