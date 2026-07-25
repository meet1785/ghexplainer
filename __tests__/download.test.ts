/**
 * Tests for download utilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { triggerDownload } from '@/lib/download';

describe('triggerDownload', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('Blob', class { constructor() {} });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'mock-url'),
      revokeObjectURL: vi.fn(),
    });
  });

  it('should create an anchor element, click it, and clean up', () => {
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    
    vi.stubGlobal('document', {
      createElement: vi.fn(() => mockAnchor),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    });

    triggerDownload('test content', 'test.md', 'text/markdown');

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockAnchor.href).toBe('mock-url');
    expect(mockAnchor.download).toBe('test.md');
    expect(document.body.appendChild).toHaveBeenCalledWith(mockAnchor);
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(document.body.removeChild).toHaveBeenCalledWith(mockAnchor);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('mock-url');
  });
});
