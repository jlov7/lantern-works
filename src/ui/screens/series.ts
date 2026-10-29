// Series styles for the served chart: a colour token, a dash pattern and a marker each, so no line relies on hue.
export type Marker = 'circle' | 'square' | 'triangle' | 'diamond' | 'plus';

export interface Series {
  id: string;
  label: string;
  color: string;
  dash: string;
  marker: Marker;
  values: number[];
}

export const SERIES_STYLE: Record<'you' | 'old' | 'faster' | 'hand' | 'bright', Omit<Series, 'values'>> = {
  you: { id: 'you', label: 'Your studio', color: 'var(--lamp)', dash: '', marker: 'circle' },
  old: { id: 'old', label: 'Old Lantern', color: 'var(--brick-soft)', dash: '8 5', marker: 'square' },
  faster: { id: 'faster', label: 'Faster Lantern', color: 'var(--sky-equip)', dash: '2 4', marker: 'triangle' },
  hand: { id: 'hand', label: 'Handmade Lantern', color: 'var(--lilac-soft)', dash: '1 4', marker: 'plus' },
  bright: { id: 'bright', label: 'Bright Lantern', color: 'var(--moss-soft)', dash: '12 4 3 4', marker: 'diamond' },
};
