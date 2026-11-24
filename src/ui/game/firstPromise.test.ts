import { describe, expect, it } from 'vitest';
import { promiseLineLimit, suggestFirstPromise } from './firstPromise';

describe('the local first-morning promise preview', () => {
  it.each([
    ['I’ll show Clem’s old jazz bar on tonight’s print.', 'clem'],
    ['Clem, put the opening-night photograph on the sheet.', 'clem'],
    ['I’m going to hold tomorrow’s last slot for Yara.', 'yara'],
    ['Yara, please save a space for your pupils next morning.', 'yara'],
  ])('suggests one of the authored commitments for %j', (line, promise) => {
    expect(suggestFirstPromise(line)).toBe(promise);
  });

  it.each([
    'I’ll show Clem’s room on the print only if the ink arrives.',
    'I cannot promise the room on Clem’s poster.',
    'I’ll leave a space for Yara tomorrow, but I might need it.',
    'I’ll cancel Yara’s booked time tomorrow.',
    'Clem asked me to “put the room on the poster”.',
    'Keep a slot for Yara tomorrow and put the room on Clem’s poster.',
    'Can I save a place for Yara tomorrow?',
    'I’ll put Clem’s musicians in the room on the poster.',
    'I promise Yara a poster tomorrow.',
    'I promise Clem the room poster next month.',
    'I promise Yara I’ll reserve tomorrow’s slot for my cousin.',
    'I promise Clem the room poster tonight and a website tomorrow.',
    'Good luck to both of them.',
    '',
    `I’ll keep a place for Yara tomorrow. ${'x'.repeat(promiseLineLimit)}`,
  ])('asks for clarification on %j', line => {
    expect(suggestFirstPromise(line)).toBeUndefined();
  });
});
