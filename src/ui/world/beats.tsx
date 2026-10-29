// One-shot moments: a parcel sliding onto the rack, a courier leaving, a missed promise binned.
// Each is keyed by its event so it mounts once and plays its CSS animation once, at any frame rate or day speed.
// Every beat starts at opacity 0, so with animations off (reduced motion) none of them is ever seen.
import { memo } from 'react';
import { CAST_BY_ID } from '../../engine/rules';
import { BIN, FINISH_BENCH, FOLDER, P, PILES, RACK, RACK_SHOWN, rackSlot, STREET, VIEW_H, VIEW_W } from './iso';
import { shift } from './looks';
import { Courier, Folder, Parcel } from './parts';

/** Game minutes a beat stays mounted after its event: long enough for its animation at the fastest day speed. */
export const BEAT_WINDOW = 320;

export interface DeliveryBeat {
  jobId: string;
  castId: string;
  /** Rack slot the parcel lands in (the top of the rack once it is full). */
  slot: number;
  bike: boolean;
}

const hueOf = (castId: string) => CAST_BY_ID[castId]?.hue ?? 40;

/** Parcels slide from the finishing bench to the rack, with a +1 in the neighbour's colour. Drawn over the rack. */
export const Deliveries = memo(function Deliveries({ list }: { list: DeliveryBeat[] }) {
  const [fx, fy] = P(PILES.finish[1][0], PILES.finish[1][1], FINISH_BENCH.h);
  const [tx, ty] = P(RACK.x + RACK.w / 2, RACK.y + RACK.d / 2, RACK.top + 30);
  return (
    <g aria-hidden="true">
      {list.map((b) => {
        const [x, y, z] = b.slot < RACK_SHOWN ? rackSlot(b.slot) : [RACK.x + 8, RACK.y + 50, RACK.top + 3];
        const [sx, sy] = P(x, y, z);
        return (
          <g key={b.jobId}>
            <g className="lw-beat lw-parcel" style={shift(fx - sx, fy - sy)}>
              <Parcel x={x} y={y} z={z} today />
            </g>
            <g transform={`translate(${Math.round(tx)} ${Math.round(ty)})`}>
              <g className="lw-beat lw-pip">
                <circle cx={0} cy={0} r={11} fill={`hsl(${hueOf(b.castId)} 55% 58%)`} strokeWidth={1.4} />
                <text x={0} y={4} textAnchor="middle" className="lw-tag" fill="var(--ink)" stroke="none">
                  +1
                </text>
              </g>
            </g>
          </g>
        );
      })}
    </g>
  );
});

/** Now and then a courier takes the parcels off down the street. */
export const Couriers = memo(function Couriers({ list }: { list: DeliveryBeat[] }) {
  const y = (STREET.kerb + STREET.farKerb) / 2 - 14;
  const [sx, sy] = P(RACK.x + 10, y, 0);
  const [ex, ey] = P(RACK.x + 520, y, 0);
  return (
    <g aria-hidden="true">
      {list
        .filter((b) => b.bike)
        .map((b) => (
          <g key={b.jobId} transform={`translate(${Math.round(sx)} ${Math.round(sy)})`}>
            <g className="lw-beat lw-ride" style={shift(ex - sx, ey - sy)}>
              <Courier />
            </g>
          </g>
        ))}
    </g>
  );
});

export interface MissBeat {
  jobId: string;
  castId: string;
  /** World (x, y, z) the folder starts from. */
  from: [number, number, number];
  at: number;
}

/** A missed promise: the folder drops into the bin with a puff, and the shop dims for a moment. */
export const Misses = memo(function Misses({ list }: { list: MissBeat[] }) {
  if (list.length === 0) return null;
  const top = BIN.h + 2;
  const [bx, by] = P(BIN.x + BIN.w / 2, BIN.y + BIN.d / 2, top);
  return (
    <g aria-hidden="true">
      {list.map((m, i) => {
        const x = BIN.x - 3;
        const y = BIN.y;
        const [sx, sy] = P(x, y, top);
        const [fx, fy] = P(m.from[0], m.from[1], m.from[2]);
        return (
          <g key={m.jobId} style={{ animationDelay: `${i * 160}ms` }} className="lw-beat lw-binned">
            <g className="lw-fly-bin" style={{ ...shift(fx - sx, fy - sy), animationDelay: `${i * 160}ms` }}>
              <Folder f={{ jobId: m.jobId, castId: m.castId, stage: 'finish', waiting: true, dueToday: true, templated: false }} x={x} y={y} z={top} />
            </g>
          </g>
        );
      })}
      <g key={`puff@${list[0]!.at}`} transform={`translate(${Math.round(bx)} ${Math.round(by - FOLDER.w)})`}>
        <g className="lw-beat lw-burst">
          <path d="M-16,6 a8,8 0 0 1 3,-15 a10,10 0 0 1 18,-4 a8,8 0 0 1 10,11 a7,7 0 0 1 -5,11 Z" fill="var(--brick-soft)" stroke="var(--brick)" strokeWidth={1.3} />
        </g>
      </g>
    </g>
  );
});

/** The brief dim over the whole scene when promises are missed. */
export function MissDim({ at }: { at: number }) {
  return <rect data-at={at} className="lw-beat lw-dim" x={0} y={0} width={VIEW_W} height={VIEW_H} fill="var(--ink)" stroke="none" pointerEvents="none" aria-hidden="true" />;
}
