export function bridgeLine(waiting: number, takeable: number): string {
  const neighbours = waiting === 1 ? '1 neighbour is waiting.' : `${waiting} neighbours are waiting.`;
  if (takeable === 0) return `${neighbours} Nothing more fits today.`;
  if (takeable === 1) return `${neighbours} One more job fits today.`;
  return `${neighbours} ${takeable} jobs fit today, in queue order.`;
}

export function foldExplanations(day: number, runLabel: string | undefined, seen: boolean): boolean {
  return day === 1 && runLabel === 'First order: Main Street' && !seen;
}
