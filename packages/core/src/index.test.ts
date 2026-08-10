import { describe, expect, it } from 'vitest';

import * as core from './index';

describe('@bodycoach/core', () => {
  it('barrel export dapat dimuat', () => {
    expect(core.CORE_PACKAGE).toBe('@bodycoach/core');
  });
});
