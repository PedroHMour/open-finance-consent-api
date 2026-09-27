/**
 * Formata centavos no padrão de valores do Open Finance: string com 2 casas decimais.
 * Ex.: 150075 -> "1500.75". Usar string evita perda de precisão do float no cliente.
 */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Valor em centavos inválido: ${cents}`);
  }
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const centavos = String(abs % 100).padStart(2, '0');
  return `${sign}${reais}.${centavos}`;
}

export interface Amount {
  amount: string;
  currency: string;
}

export function toAmount(cents: number, currency = 'BRL'): Amount {
  return { amount: formatCents(cents), currency };
}
