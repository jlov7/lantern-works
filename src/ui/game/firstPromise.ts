export type FirstPromise = 'clem' | 'yara';

export const promiseLineLimit = 180;

const uncertain = /\b(?:if|unless|maybe|perhaps|might|could|would|try|hope|rather|not|never|cannot|no longer|instead|and|or|but|asked|said|told|quoted|cancel|remove|forget|refuse|take that back)\b|n['’]t\b/i;
const commitment = /\b(?:i|we)\s+(?:will|shall|promise|guarantee|commit to|am going to|are going to)\b|\b(?:my word|count on|is booked|goes on)\b|^(?:(?:clem|yara),\s*)?(?:please\s+)?(?:put|show|keep|save|hold|reserve|leave|give)\b/;
const room = /\b(?:room|workroom|venue|doorway|jazz bar|opening.night photo(?:graph)?)\b/;
const poster = /\b(?:poster|print|sheet|proof)\b/;
const space = /\b(?:room|place|slot|opening|space|time|schedule|books|booked)\b/;
const tomorrow = /\b(?:tomorrow|next morning|next day)\b/;
const later = /\b(?:next (?:week|month|year)|in \w+ (?:days|weeks|months)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/;
const reserve = /\b(?:keep|hold|reserve|book|save|leave|fit|booked|goes on)\b/;
const forYara = /\bfor yara\b(?!')|\byara's (?:order|job|dance.school)\b|(?:^yara,|,\s*yara\b).*\byour\b|\byour (?:order|job|dance.school|pupils)\b.*,\s*yara\b/;

export function suggestFirstPromise(line: string): FirstPromise | undefined {
  if (line.length > promiseLineLimit || /[?"“”‘]|(?:^|\s)'|'(?:$|\s)/.test(line) || uncertain.test(line)) return;
  const words = line.normalize('NFKC').toLowerCase().replaceAll('’', "'").trim()
    .replace(/\b(i|we)'ll\b/g, '$1 will').replace(/\bi'm going to\b/g, 'i am going to');
  if (uncertain.test(words) || later.test(words) || !commitment.test(words)) return;
  const forClem = /\bclem\b/.test(words) && room.test(words) && poster.test(words) && !tomorrow.test(words) && !/\b(?:band|musicians|trio)\b/.test(words);
  const yaraReservation = forYara.test(words) && space.test(words) && tomorrow.test(words) && reserve.test(words);
  // A second addressee can change the meaning even when one obligation is explicit.
  if (forClem && !/\byara\b/.test(words)) return 'clem';
  if (yaraReservation && !/\bclem\b/.test(words)) return 'yara';
}
