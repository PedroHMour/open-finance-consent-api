import { describe, expect, it } from 'vitest';
import { isValidCpf, normalizeCpf } from '../../src/shared/utils/cpf.js';

describe('CPF', () => {
  it('remove a máscara', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });

  it.each(['52998224725', '529.982.247-25', '11144477735'])('aceita CPF válido %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each([
    ['dígito verificador errado', '52998224724'],
    ['sequência repetida', '11111111111'],
    ['tamanho errado', '5299822472'],
    ['vazio', ''],
    ['letras', 'abcdefghijk'],
  ])('rejeita %s', (_caso, cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });
});
