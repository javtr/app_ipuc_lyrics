import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Screen WakeLock browser API', () => {
  let mockRequest: ReturnType<typeof vi.fn>;
  let mockSentinel: { release: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockSentinel = {
      release: vi.fn().mockResolvedValue(undefined)
    };
    mockRequest = vi.fn().mockResolvedValue(mockSentinel);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        wakeLock: { request: mockRequest }
      },
      configurable: true,
      writable: true
    });
  });

  it('debe solicitar wakeLock de tipo screen para evitar que el móvil se apague', async () => {
    const sentinel = await navigator.wakeLock.request('screen');

    expect(mockRequest).toHaveBeenCalledWith('screen');
    expect(sentinel).toBe(mockSentinel);

    await sentinel.release();
    expect(mockSentinel.release).toHaveBeenCalled();
  });
});
