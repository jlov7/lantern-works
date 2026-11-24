import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { DUR, EASE } from './motion';

it('keeps the rendered camera on the same timing as the CSS tokens', () => {
  const tokens = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  for (const [name, duration] of Object.entries(DUR)) {
    expect(tokens).toMatch(new RegExp(`--dur-${name}:\\s*${duration}ms;`));
  }
  for (const [name, ease] of Object.entries(EASE)) {
    const value = tokens.match(new RegExp(`--ease-${name}:\\s*cubic-bezier\\(([^)]+)\\)`))?.[1]?.split(',').map(Number);
    expect(value).toEqual(ease);
  }
});
