import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EXPECTED = '996727915a57171fc6afb6f4b703ceece7c7af3fb17436083fdbced53ef27520';

describe('reference prototype', () => {
  it('is preserved byte-for-byte', () => {
    const bytes = readFileSync(new URL('../../docs/reference/prototype-0.1.html', import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(EXPECTED);
  });
});
