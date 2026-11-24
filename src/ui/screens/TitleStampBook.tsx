import { loadStamps } from '../persist';
import { STAMPS } from '../stamps';
import { StampGlyph } from './StampGlyph';

export default function TitleStampBook() {
  const stamps = loadStamps();
  return <>
    <p className="muted small">
      {stamps.filter(id => STAMPS.some(stamp => stamp.id === id)).length} of {STAMPS.length} collected.
    </p>
    <ul className="stamps">
      {STAMPS.map(stamp => (
        <li key={stamp.id} className={stamps.includes(stamp.id) ? 'got' : 'missing'}>
          <StampGlyph glyph={stamp.glyph} />
          <span className="stamp-text">
            <strong>{stamps.includes(stamp.id) ? stamp.title : 'Not yet'}</strong>
            <span>{stamp.hint}</span>
          </span>
        </li>
      ))}
    </ul>
  </>;
}
