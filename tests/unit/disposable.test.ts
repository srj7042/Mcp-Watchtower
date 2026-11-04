import { describe, it, expect, vi } from 'vitest';
import { CompositeDisposable } from '../../src/utils/disposable.js';

describe('CompositeDisposable', () => {
  it('disposes all added disposables', () => {
    const composite = new CompositeDisposable();
    const d1 = { dispose: vi.fn() };
    const d2 = { dispose: vi.fn() };

    composite.add(d1);
    composite.add(d2);

    composite.dispose();

    expect(d1.dispose).toHaveBeenCalledTimes(1);
    expect(d2.dispose).toHaveBeenCalledTimes(1);
  });

  it('immediately disposes item if composite is already disposed', () => {
    const composite = new CompositeDisposable();
    composite.dispose();

    const d = { dispose: vi.fn() };
    composite.add(d);

    expect(d.dispose).toHaveBeenCalledTimes(1);
  });
});

