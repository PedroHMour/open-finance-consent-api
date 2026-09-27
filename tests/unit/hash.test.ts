import { describe, expect, it } from 'vitest';
import { hashSecret, stableHash, verifySecret } from '../../src/shared/utils/hash.js';

describe('stableHash', () => {
  it('ignora a ordem das chaves', () => {
    expect(stableHash({ a: 1, b: { c: 2, d: 3 } })).toBe(stableHash({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it('diferencia conteúdos diferentes, inclusive ordem de arrays', () => {
    expect(stableHash({ p: ['A', 'B'] })).not.toBe(stableHash({ p: ['B', 'A'] }));
  });
});

describe('hashSecret', () => {
  it('confere a senha correta e recusa a errada', async () => {
    const hash = await hashSecret('Senha@123');
    expect(hash).not.toContain('Senha@123');
    await expect(verifySecret('Senha@123', hash)).resolves.toBe(true);
    await expect(verifySecret('outra', hash)).resolves.toBe(false);
  });
});
