import { useEffect, useState, type ReactNode } from 'react';
import { CustomerPortrait } from '../atelier/AtelierWindow';
import { castName } from '../format';
import street from '../atelier/assets/window.webp';
import clem from '../atelier/assets/clem.webp';
import mara from '../atelier/assets/mara.webp';
import hugo from '../atelier/assets/hugo.webp';
import ivo from '../atelier/assets/ivo.webp';
import jazzScene from './assets/jazz.webp';
import bakeryScene from './assets/bakery.webp';
import watchScene from './assets/watch.webp';
import courtyardScene from './assets/courtyard.webp';
import openStudiosScene from './assets/open-studios.webp';
const scenes: Record<string, string> = { clem: jazzScene, mara: bakeryScene, hugo: watchScene, ivo: watchScene };
const portraits: Record<string, string> = { clem, mara, hugo, ivo };
import '../../styles/neighbourhood.css';

export type NeighbourhoodLocation = { id: string; placeId: string; castId: string; name: string; place: string; title: string; line: string; contributors?: string[]; privateKeepsake?: boolean; eventPiece?: boolean; featured?: boolean; lent?: boolean; artwork: ReactNode; earned: boolean };
type Mode = 'studio' | 'courtyard' | 'trail' | 'open-studios' | 'unfinished';
const modeCopy: Record<Mode, string> = {
  studio: 'A place for the work to meet the street.',
  courtyard: 'A shared place for the neighbourhood.',
  trail: 'Follow the work from door to door.',
  'open-studios': 'The studio doors are open.',
  unfinished: 'The work is still finding its place.',
};

export function NeighbourhoodScene({ locations, mode, eventName, eventNote, reducedMotion, hosts = [] }: { locations: NeighbourhoodLocation[]; mode: Mode; eventName: string; eventNote?: string; reducedMotion: boolean; hosts?: { castId: string }[] }) {
  const available = locations.filter(location => location.earned);
  const [motionSkipped, setMotionSkipped] = useState(false);
  const [selectedId, setSelectedId] = useState(() => available[0]?.placeId);
  const selected = available.find(location => location.placeId === selectedId) ?? available[0];
  const stagedHosts = selected && !selected.privateKeepsake && !selected.featured && !selected.lent ? hosts.filter(host => selected.eventPiece || host.castId === selected.castId) : [];
  const credits = selected ? selected.contributors?.length ? selected.contributors : [selected.castId] : [];
  useEffect(() => { if (selected && selected.placeId !== selectedId) setSelectedId(selected.placeId); }, [selected, selectedId]);
  return <section className="neighbourhood" data-mode={mode} data-reduced-motion={reducedMotion || undefined} aria-label={eventName}>
    <header className="neighbourhood-heading"><h2>{eventName}</h2><p>{eventNote ?? modeCopy[mode]}</p></header>
    {available.length > 1 && <nav className="neighbourhood-nav" aria-label="View the work"><p>Look around · {available.length} pieces</p><div>{available.map(location => <button key={location.placeId} type="button" aria-pressed={location.placeId === selected?.placeId} onClick={() => { if (location.placeId !== selected?.placeId) { setMotionSkipped(false); setSelectedId(location.placeId); } }}><span>{location.place}<small>{location.title}</small></span></button>)}</div></nav>}
    <div className="neighbourhood-scene" data-scene-motion={!reducedMotion && !motionSkipped || undefined} style={{ backgroundImage: `url(${selected ? selected.featured ? street : selected.lent ? jazzScene : mode === 'courtyard' ? courtyardScene : mode === 'open-studios' ? openStudiosScene : selected.privateKeepsake ? street : scenes[selected.castId] ?? street : street})` }}>
      <div className="neighbourhood-scrim" />
      {mode === 'trail' && <div className="neighbourhood-trail" aria-hidden="true" />}
      {selected ? <>
        {stagedHosts.length > 0 && <div className="neighbourhood-hosts" aria-label="Hosts"><div>{stagedHosts.map(host => <figure key={host.castId} data-scene-host={host.castId}><img src={portraits[host.castId]} alt="" /><figcaption>{castName(host.castId)} <span>· host</span></figcaption></figure>)}</div></div>}
        <div key={selected.id} className="neighbourhood-print" onAnimationEnd={() => setMotionSkipped(true)}>{selected.artwork}</div>
        <div className="neighbourhood-scene-label"><span>{selected.featured ? 'Featured at the studio' : selected.lent ? 'Retained artwork on loan' : selected.privateKeepsake ? 'A private keepsake' : mode === 'courtyard' ? 'On display in the courtyard' : mode === 'trail' ? 'Along the trail' : mode === 'open-studios' ? 'Inside the open studio' : mode === 'unfinished' ? 'Delivered pieces · gathering unfinished' : 'At the window'}</span><strong>{selected.place}</strong></div>
      </> : <div className="neighbourhood-empty">{mode === 'unfinished' ? 'There is more work to do before anything is ready to show.' : 'No work is ready to show here yet.'}</div>}
    </div>
    {selected && !reducedMotion && <button type="button" className="scene-skip" onClick={() => setMotionSkipped(!motionSkipped)}>{motionSkipped ? 'Replay placement' : 'Skip placement'}</button>}
    {selected && <div className="neighbourhood-details" aria-live="polite"><div><span className="neighbourhood-detail-label">{selected.privateKeepsake ? 'Kept' : 'On display'}</span><h3>{selected.title}</h3><p>{selected.line}</p></div><div className="neighbourhood-credits"><p className="neighbourhood-detail-label">{selected.contributors?.length ? 'Featuring completed work for' : 'Commissioned by'}</p><ul>{credits.map(castId => <li key={castId} data-cast={castId}><span className="neighbourhood-credit-portrait" aria-hidden="true">{portraits[castId] ? <img className="atelier-portrait-image" src={portraits[castId]} alt="" loading="lazy" /> : <CustomerPortrait castId={castId} />}</span><span>{castName(castId)}</span></li>)}</ul></div></div>}
  </section>;
}
