/**
 * Tests for tree builder logic.
 */

import { describe, it, expect } from 'vitest';
import { buildFileTree } from '@/lib/tree-builder';

describe('buildFileTree', () => {
  it('should handle an empty array', () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it('should build a flat list of files', () => {
    const paths = ['a.txt', 'b.txt'];
    const tree = buildFileTree(paths);
    expect(tree).toEqual([
      { name: 'a.txt', path: 'a.txt', type: 'file' },
      { name: 'b.txt', path: 'b.txt', type: 'file' }
    ]);
  });

  it('should build nested directories and files', () => {
    const paths = ['src/index.ts', 'src/utils/math.ts', 'package.json'];
    const tree = buildFileTree(paths);
    expect(tree).toEqual([
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [
          {
            name: 'utils',
            path: 'src/utils',
            type: 'directory',
            children: [
              { name: 'math.ts', path: 'src/utils/math.ts', type: 'file' }
            ]
          },
          { name: 'index.ts', path: 'src/index.ts', type: 'file' }
        ]
      },
      { name: 'package.json', path: 'package.json', type: 'file' }
    ]);
  });

  it('should sort directories before files and then alphabetically', () => {
    const paths = ['z_file.txt', 'a_dir/file.txt', 'a_file.txt', 'b_dir/file.txt'];
    const tree = buildFileTree(paths);
    expect(tree.map(n => n.name)).toEqual(['a_dir', 'b_dir', 'a_file.txt', 'z_file.txt']);
  });
});
