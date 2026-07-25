/**
 * Tests for clipboard utilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { copyToClipboard } from '@/lib/clipboard';

describe('copyToClipboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return true when copy succeeds', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    const result = await copyToClipboard('test');
    expect(result).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test');
  });

  it('should return false when copy fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('fail')),
      },
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await copyToClipboard('test');
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should return false if navigator.clipboard is undefined', async () => {
    vi.stubGlobal('navigator', {});

    const result = await copyToClipboard('test');
    expect(result).toBe(false);
  });
});
