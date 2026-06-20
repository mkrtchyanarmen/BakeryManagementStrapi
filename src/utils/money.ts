export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function multiplyMoney(a: number, b: number): number {
  return roundMoney(a * b);
}

export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((total, value) => total + value, 0));
}
