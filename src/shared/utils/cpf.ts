/** Remove tudo que não for dígito: "123.456.789-09" -> "12345678909". */
export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

/** Valida CPF pelos dígitos verificadores (algoritmo da Receita Federal). */
export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);

  if (cpf.length !== 11) return false;
  // Sequências repetidas (000..., 111...) passam no cálculo mas são inválidas.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map(Number);

  const checkDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += digits[i]! * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}
