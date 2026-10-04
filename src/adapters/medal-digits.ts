import { assertBalance } from '../core/invariants.ts';

/** Original 5×7 dot glyphs; no font, external asset, rounding or game state. */
const glyphs: Readonly<Record<string, string>> = {
  '0': '01110/10001/10011/10101/11001/10001/01110',
  '1': '00100/01100/00100/00100/00100/00100/01110',
  '2': '01110/10001/00001/00010/00100/01000/11111',
  '3': '11110/00001/00001/01110/00001/00001/11110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/10000/11110/00001/00001/11110',
  '6': '01110/10000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00001/01110',
};

/** The hidden text remains the authoritative output; the SVG is decorative. */
export function medalDigits(balance: number): string {
  assertBalance(balance);
  const value = String(balance), rows = glyphs['0']!.split('/');
  const advance = rows[0]!.length + 1, width = value.length * advance + 1, height = rows.length + 1 + 1;
  const digits = [...value].map((digit, index) => {
    const dots = glyphs[digit]!.split('/').map((row, y) => [...row].map((lit, x) => lit === '1'
      ? `<circle cx="${index * advance + x + 1}.5" cy="${y + 1}.5" r=".38"/>` : '').join('')).join('');
    return `<g data-medal-digit="${digit}">${dots}</g>`;
  }).join('');
  return `<span class="sr-only">${value}</span><svg class="medal-digits" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" fill="currentColor">${digits}</svg>`;
}
