import type { Bay } from './signatureTargets';

export function bayAppearance(bay: Bay, selected: Bay | null, hover: Bay | null, pressed: Bay | null, focus: Bay | null) {
  const isSelected = selected === bay;
  const onHover = hover === bay;
  const onPress = pressed === bay;
  const values = onPress ? { frame: .45, glass: .80, outline: .80, scale: .98, poster: 1 }
    : isSelected ? { frame: onHover ? .45 : .38, glass: onHover ? 1 : .95, outline: 1, scale: onHover ? 1.02 : 1, poster: 1.04 }
      : onHover ? { frame: .28, glass: .70, outline: .50, scale: 1.02, poster: 1 }
        : { frame: 0, glass: .30, outline: 0, scale: 1, poster: 1 };
  return { ...values, outline: Math.max(values.outline, focus === bay ? .50 : 0) };
}
