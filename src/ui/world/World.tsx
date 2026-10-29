// The hero miniature: Lantern Works as a cut-away model on a street through one working day. Pure presentation of a
// WorldFrame. The static layers are memoised on a quantised clock; per frame only people, folders and beats change.
import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent, type PointerEvent } from 'react';
import { CAST_BY_ID } from '../../engine/rules';
import type { CompanyState } from '../../engine/types';
import type { FolderFrame, WorldFrame } from '../timeline';
import { BEAT_WINDOW, Couriers, Deliveries, Misses, MissDim, type DeliveryBeat, type MissBeat } from './beats';
import { AI_DESKS, BIN, BRIEF_TABLE, CLOCK, FINISH_BENCH, MAKE_DESKS, MAKE_PILE, P, PILES, TRAY, VIEW_H, VIEW_W, box } from './iso';
import { lightAt } from './light';
import { neighbourLook, STAFF_LOOKS } from './looks';
import { Walker } from './motion';
import { AiDesk, Bin, Box, Bubble, EmptyAiSpot, Figure, FolderPiles, Table, WallClock, type Flights } from './parts';
import { aiWorkers, describeFrame, folderSpot, groupFolders, moodLabel, placeHumans, placeNeighbours, spotAnchor, staffRoute, type PlacedNeighbour } from './place';
import { Backdrop, DeliveryRack, Defs, Dressing, FrontStubs, Ground, InteriorLight, KitBoard, MissedPuff, Plant, Shopfront, ShopShell, StreetLamps } from './scene';
import { phoneView } from './view';
import { DeliveredWall, MilestoneWall, StreetWork, WorkSurfaces } from './StudioWork';
import { portfolioAt, projectSceneAt } from '../game/portfolio';
import { hasStudioRules } from '../../engine/versions';
import './world.css';

export interface WorldProps {
  frame: WorldFrame;
  /** Historical projection uses frame.minute, even when this is the final state of the playing day. */
  state?: CompanyState;
  selectedRequestId?: string | null;
  onSelectNeighbour?: (requestId: string) => void;
  reducedMotion?: boolean;
  /** Dresses the street for the season (festival bunting, careful-season ribbons, a Main Street banner). Defaults to the frame's. */
  scenarioId?: string;
}

/** Below this container width the view crops to the shopfront or working studio, and drags to pan. */
const PHONE = 640;

const SURFACE_Z: Record<string, number> = { brief: BRIEF_TABLE.h, tray: TRAY.h, finish: FINISH_BENCH.h };

function useWidth(ref: React.RefObject<SVGSVGElement | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => setW(Math.round(es[0]!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function World({ frame, state, selectedRequestId = null, onSelectNeighbour, reducedMotion = false, scenarioId }: WorldProps): JSX.Element {
  const id = `lw${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const svg = useRef<SVGSVGElement>(null);
  const width = useWidth(svg);
  const phone = width > 0 && width < PHONE;
  const played = frame.played === true;
  const closed = played && frame.offset >= 480;
  const [panned, setPanned] = useState<{ day: number; played: boolean; closed: boolean; pan: number } | null>(null);
  const pan = panned?.day === frame.day && panned.played === played && panned.closed === closed ? panned.pan : 0;
  const drag = useRef<{ x: number; y: number; pan: number; panning: boolean; day: number; played: boolean; closed: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    setPanned(null);
    drag.current = null;
    suppressClick.current = false;
  }, [frame.day, played, closed]);
  const lightKey = Math.round((played ? frame.offset : 0) / 5) * 5;
  const light = useMemo(() => lightAt(lightKey), [lightKey]);
  const scene = scenarioId ?? frame.scenarioId;
  const motion = !reducedMotion;
  const pieces = useMemo(() => state ? portfolioAt(state, frame.minute) : [], [state, frame.minute]);
  const projectScene = useMemo(() => state && hasStudioRules(state.rulesVersion) ? projectSceneAt(state, frame.minute) : undefined, [state, frame.minute]);

  const recent = motion && played ? (frame.beats ?? []).filter((b) => frame.offset - b.at <= BEAT_WINDOW) : [];
  const deliveries: DeliveryBeat[] = [];
  const base = frame.packagesTotal - frame.packagesToday.length;
  (frame.beats ?? [])
    .filter((b) => b.kind === 'delivered')
    .forEach((b, i) => {
      if (recent.includes(b)) deliveries.push({ jobId: b.jobId!, castId: b.castId!, slot: base + i, bike: i % 3 === 0 });
    });
  const misses: MissBeat[] = recent
    .filter((b) => b.kind === 'missed')
    .map((b) => {
      const spot = b.stage === 'brief' ? 'brief' : b.stage === 'produce' ? 'tray' : 'finish';
      const a = spotAnchor(spot, frame.workers)!;
      return { jobId: b.jobId!, castId: b.castId!, from: [a[0], a[1], SURFACE_Z[spot]!] as [number, number, number], at: b.at };
    });
  const kitAt = recent.filter((b) => b.kind === 'kit_ready').at(-1)?.at ?? null;

  // Keep the sign close in the morning and all production in view while the day plays.
  const { x: x0, y: y0, w: cropW, h: cropH } = phoneView(width, played, pan);
  const homeX = phoneView(width, played, 0).x;
  const viewBox = phone ? `${Math.round(x0)} ${Math.round(y0)} ${Math.round(cropW)} ${Math.round(cropH)}` : `0 0 ${VIEW_W} ${VIEW_H}`;
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    suppressClick.current = false;
    if (phone) drag.current = { x: e.clientX, y: e.clientY, pan: x0 - homeX, panning: false, day: frame.day, played, closed };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || !phone) return;
    if (drag.current.day !== frame.day || drag.current.played !== played || drag.current.closed !== closed) {
      drag.current = null;
      return;
    }
    const dx = e.clientX - drag.current.x;
    if (!drag.current.panning) {
      const dy = e.clientY - drag.current.y;
      if (Math.abs(dy) >= 6 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(dx) < 6) return;
      drag.current.panning = true;
      suppressClick.current = true;
    }
    setPanned({ day: frame.day, played, closed, pan: Math.max(-homeX, Math.min(VIEW_W - cropW - homeX, drag.current.pan - dx * cropW / width)) });
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <svg
      ref={svg}
      className={`lw-world${reducedMotion ? ' lw-reduced' : ''}${phone ? ' lw-phone' : ''}${closed ? ' lw-closed' : ''}`}
      viewBox={viewBox}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={`${describeFrame(frame)}${projectScene ? ` ${projectScene.night.label}.${projectScene.milestones.length ? ` Completed artifacts: ${projectScene.milestones.map(p => `${p.record.artifact}${p.record.earned ? '' : ' (original brief, extra change declined)'}`).join('; ')}.` : ''}` : ''}`}
      stroke="var(--ink)"
      strokeWidth={1.25}
      strokeLinejoin="round"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={() => { endDrag(); suppressClick.current = false; }}
      onClickCapture={(e) => {
        if (suppressClick.current && e.detail > 0) {
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <Defs id={id} light={light} />
      <Backdrop id={id} light={light} />
      <Ground id={id} light={light} />
      <ShopShell />
      <DeliveredWall pieces={pieces} />
      {projectScene && <MilestoneWall scene={projectScene} />}
      <Dressing scenarioId={scene} part="inside" />
      <WallClock x={CLOCK.x} z={CLOCK.z} r={CLOCK.r} clock={frame.clock} offset={frame.offset} />
      <KitBoard id={id} kit={frame.kit} fresh={kitAt} />

      <g aria-hidden="true">
        <Furniture />
        <FolderLayer frame={frame} motion={motion} />
        {state && <WorkSurfaces state={state} frame={frame} />}
        <Bin {...BIN} />
        <Misses list={misses} />
        <DeliveryRack total={frame.packagesTotal} today={frame.packagesToday.length} landing={deliveries.length} />
        <Deliveries list={deliveries} />
        <Plant x={722} y={174} />
      </g>

      <Staff frame={frame} reduced={reducedMotion} />

      <InteriorLight id={id} closing={played ? light.closing : 0} />
      <FrontStubs />
      <Shopfront id={id} menu={frame.menu} closed={closed} />
      <Dressing scenarioId={scene} part="outside" />
      <StreetWork pieces={pieces} scene={projectScene} />
      {frame.missedToday.length > 0 && <MissedPuff count={frame.missedToday.length} />}
      <StreetLamps id={id} near={false} lamps={light.lamps} festival={scene === 'festival-week'} />
      {/* One list so a neighbour glides from the window to the far pavement; the near lamps stand in front. */}
      <g>
        {placeNeighbours(frame).map((p) => (
          <Neighbour
            key={p.n.requestId}
            p={p}
            order={p.queue}
            arrive={!played && p.queue >= 0}
            selected={p.n.requestId === selectedRequestId}
            reduced={reducedMotion}
            onSelect={onSelectNeighbour}
          />
        ))}
      </g>
      <Couriers list={deliveries} />
      <StreetLamps id={id} near lamps={light.lamps} festival={scene === 'festival-week'} />
      {misses.length > 0 && <MissDim key={`dim@${misses[0]!.at}`} at={misses[0]!.at} />}
    </svg>
  );
}

/** Tables, tray and desks: nothing here changes during a day. */
const Furniture = memo(function Furniture() {
  return (
    <g>
      <Table s={BRIEF_TABLE} />
      <Table s={{ ...TRAY, h: TRAY.h - 4 }} />
      <Box x={TRAY.x + 2} y={TRAY.y + 2} z={TRAY.h - 4} w={TRAY.w - 4} d={TRAY.d - 4} h={4} fills={{ top: 'var(--timber-dark)', front: 'var(--timber)', side: 'var(--timber-dark)' }} />
      {MAKE_DESKS.map((s, i) => (
        <g key={i}>
          <Table s={s} />
          <Box x={s.x + s.w - 14} y={s.y + 6} z={s.h} w={7} d={7} h={10} fills={{ top: 'var(--ink-soft)', front: 'var(--dusk-600)', side: 'var(--ink-soft)' }} />
          <polygon points={box(s.x + 10, s.y + 10, s.h, 24, 18, 0.5).top} fill="var(--paper)" strokeWidth={0.9} />
        </g>
      ))}
      <Table s={FINISH_BENCH} />
    </g>
  );
});

/** A cheap fingerprint of everything the folder layer draws, so it re-renders only when a folder moves. */
function folderKey(frame: WorldFrame, motion: boolean): string {
  const w = frame.workers.map((x) => `${x.id}:${x.station}:${x.jobId ?? ''}:${x.working ? 1 : 0}:${x.retired ? 1 : 0}`).join(',');
  const f = frame.folders.map((x) => `${x.jobId}:${x.stage}:${x.waiting ? 1 : 0}:${x.dueToday ? 1 : 0}:${x.templated ? 1 : 0}:${motion && frame.played && x.moved && frame.offset - x.moved.at <= BEAT_WINDOW ? x.moved.at : ''}`).join(',');
  return `${w}|${f}|${frame.outage ? 1 : 0}`;
}

const FolderLayer = memo(
  function FolderLayer({ frame, motion }: { frame: WorldFrame; motion: boolean }) {
    const folders = groupFolders(frame);
    const ai = aiWorkers(frame);
    const humanIds = frame.workers.filter((w) => w.kind === 'human').map((w) => w.id);
    // Two making desks: a third or fourth person making shares a desk with the first or second.
    const deskFolders = (i: number) => humanIds.filter((_, k) => k % MAKE_DESKS.length === i).flatMap((wid) => folders.desk.get(wid) ?? []);
    const flights: Flights = new Map();
    if (motion && frame.played) {
      const at = (f: FolderFrame): string => {
        if (f.stage === 'brief') return 'brief';
        if (f.stage === 'finish' || f.stage === 'rework') return 'finish';
        for (const [wid, list] of folders.desk) if (list.includes(f)) return `desk:${wid}`;
        return 'tray';
      };
      for (const f of frame.folders) {
        if (!f.moved || frame.offset - f.moved.at > BEAT_WINDOW) continue;
        const from = folderSpot(f.moved.stage, f.moved.holder, frame.workers);
        if (from === at(f)) continue;
        const a = spotAnchor(from, frame.workers);
        if (!a) continue;
        const z = SURFACE_Z[from] ?? (from.startsWith('desk:') ? 32 : 30);
        const [fx, fy] = P(a[0], a[1], z);
        flights.set(f.jobId, { fx, fy, at: f.moved.at });
      }
    }
    return (
      <g>
        <FolderPiles folders={folders.brief} piles={PILES.brief} z={BRIEF_TABLE.h} flights={flights} />
        <FolderPiles folders={folders.tray} piles={PILES.tray} z={TRAY.h} flights={flights} />
        {MAKE_DESKS.map((s, i) => (
          <FolderPiles key={i} folders={deskFolders(i)} piles={[[s.x + MAKE_PILE[0], s.y + MAKE_PILE[1]]]} z={s.h} flights={flights} />
        ))}
        {AI_DESKS.map((s, i) => {
          const w = ai[i];
          return w ? <AiDesk key={w.id} s={s} worker={w} outage={frame.outage} folders={folders.desk.get(w.id) ?? []} flights={flights} /> : <EmptyAiSpot key={i} s={s} />;
        })}
        <FolderPiles folders={folders.finish} piles={PILES.finish} z={FINISH_BENCH.h} flights={flights} />
      </g>
    );
  },
  (a, b) => a.motion === b.motion && folderKey(a.frame, a.motion) === folderKey(b.frame, b.motion),
);

function Staff({ frame, reduced }: { frame: WorldFrame; reduced: boolean }) {
  return (
    <g aria-hidden="true">
      {placeHumans(frame).map((p) => (
        <Walker key={p.worker.id} x={p.x} y={p.y} move="walk" gone={p.gone} reduced={reduced} route={staffRoute}>
          <g className={p.worker.working ? 'lw-bob' : undefined}>
            <Figure look={STAFF_LOOKS[p.index]!} pose={p.pose} activity={p.worker.working ? p.worker.station : undefined} />
          </g>
        </Walker>
      ))}
    </g>
  );
}

interface NeighbourProps {
  p: PlacedNeighbour;
  /** Place in the morning queue, for the arrival stagger. */
  order: number;
  arrive: boolean;
  selected: boolean;
  reduced: boolean;
  onSelect?: (requestId: string) => void;
}

function Neighbour({ p, order, arrive, selected, reduced, onSelect }: NeighbourProps) {
  const cast = CAST_BY_ID[p.n.castId];
  const look = neighbourLook(p.n.castId, cast?.hue ?? 220);
  const label = `${cast ? `${cast.name}, ${cast.business}` : p.n.castId}: ${moodLabel(p.n)}`;
  const activate = () => onSelect?.(p.n.requestId);
  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate();
    }
  };
  const control = { role: 'button', tabIndex: -1, 'aria-label': label, 'aria-pressed': selected, onClick: activate, onKeyDown };
  return (
    <Walker x={p.x} y={p.y} move={p.move} walking={p.walking} gone={p.gone} reduced={reduced} speed={200} maxMs={2600}>
      <g className={`lw-nb${selected ? ' lw-selected' : ''}`} {...control}>
        <g className={arrive ? 'lw-arrive' : undefined} style={arrive ? ({ '--delay': `${order * 150}ms` } as CSSProperties) : undefined}>
          <rect className="lw-hit" x={-18} y={-74} width={36} height={80} fill="transparent" stroke="none" />
          {selected && (
            <g fill="none">
              <ellipse cx={0} cy={0} rx={15} ry={5.5} stroke="var(--ink)" strokeWidth={5} />
              <ellipse cx={0} cy={0} rx={15} ry={5.5} stroke="var(--lamp)" strokeWidth={2.5} />
            </g>
          )}
          <g transform={p.flip ? 'scale(-1 1)' : undefined} stroke={selected ? 'var(--lamp)' : undefined} strokeWidth={selected ? 2.2 : undefined}>
            <Figure look={look} pose={p.pose} mood={p.n.mood} />
          </g>
          {p.bubble && (p.bubble === 'dots' ? <Bubble g={p.bubble} x={9} y={-48} /> : <Bubble g={p.bubble} x={p.flip ? -13 : 13} y={-26} />)}
          {p.n.mood === 'served' && (
            <g transform="translate(10 -22) rotate(-14)">
              <rect x={-3} y={-6} width={9} height={12} rx={1} fill="var(--paper)" strokeWidth={1} />
              <rect x={-3} y={-6} width={9} height={3.5} fill="var(--lamp)" strokeWidth={1} />
            </g>
          )}
          <g className="lw-focus" fill="none">
            <rect x={-19} y={-76} width={38} height={84} rx={6} stroke="var(--ink)" strokeWidth={4} />
            <rect x={-19} y={-76} width={38} height={84} rx={6} stroke="var(--lamp)" strokeWidth={2} />
          </g>
        </g>
      </g>
    </Walker>
  );
}
