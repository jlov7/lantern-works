import type { MotifId } from '../../engine/design';
import firstNightRoom from './assets/first-night-room.jpg';
import hugoAtBench from './assets/hugo-at-bench.webp';

/** A fictional archive print and original line drawings share the printed page. */
export function Motif({ id, portrait = false }: { id: MotifId; portrait?: boolean }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" {...common}>
    {id === 'first-photo' && <>
      <path fill="#ebdfc7" stroke="none" d="m3 5 93 1-1 89-91-1Z" />
      <image href={firstNightRoom} x="7" y="9" width="85" height="80" preserveAspectRatio="xMidYMid slice" />
      <path stroke="#d8c7a7" strokeWidth=".8" d="m4 6 91 1-1 87-89-1Z" />
      <path stroke="#f0e3c7" strokeWidth=".3" opacity=".6" d="m9 12 3 59m61-58 2 64m-51 8 50 1" />
      <path stroke="#76654c" strokeWidth=".5" d="m10 92 9-.3m2 .3 6-.2m54 .1 9 .4" />
    </>}
    {id === 'trumpet' && <>
      <path fill="currentColor" opacity=".12" d="m9 46 49-2 27-20v47L58 57H23C12 57 8 65 15 70h40v-6H25c-5 0-5-7 0-7" />
      <path d="M8 44h48c14 0 20-11 29-20v47c-10-9-16-15-29-15H23c-13 0-15 18-3 18h35v-9H25m33-21v12m27-32c8 0 8 47 0 47M8 40v11M31 44V32m11 12V30m11 14V32M27 32h8m3-2h8m3 2h8M63 27l4-9m6 9 6-8M17 83l61-2" />
      <path strokeWidth="1" d="M34 48v4m11-4v4m10-4v4M88 32v29" />
    </>}
    {id === 'crescent' && <>
      <path fill="currentColor" opacity=".15" d="M67 10C12 13 6 77 51 89c16 4 30-2 39-14C40 89 23 30 67 10Z" />
      <path d="M67 10C12 13 6 77 51 89c16 4 30-2 39-14C40 89 23 30 67 10Z" /><path strokeWidth=".8" d="M25 37c-12 28 3 48 23 49M18 50l6 2m-6 6h6m-5 6 6-2m-1 9 5-4m1 11 4-5" />
      <path d="m78 19 2 7 7 2-7 2-2 7-2-7-7-2 7-2zM85 49h7m-3-4v8" />
    </>}
    {id === 'loaf' && <>
      <path fill="currentColor" opacity=".13" d="M9 57c0-25 19-38 41-37 23-1 41 13 41 37v14c-20 14-62 14-82 0Z" />
      <path d="M9 57c0-25 19-38 41-37 23-1 41 13 41 37v14c-20 14-62 14-82 0ZM9 59c19 14 63 14 82 0M22 46c1-9 6-15 11-18m8 26c0-13 6-23 12-28m8 28c0-12 4-20 9-24" />
      <path strokeWidth="1" d="m17 67 4 3m8 1 3 2m10 0 2 2m10-1h3m12-3h3m9-4 3-2M14 83h72M32 12l3-6m15 6V4m15 8-3-6" />
    </>}
    {id === 'wheat' && <>
      <path d="M49 92 52 13M46 83 20 37m33 46 26-48M52 13l-5-8m5 8 6-8" />
      {[22, 35, 48, 61, 74].map((y, i) => <g key={y}><path fill="currentColor" opacity={.15 + i * .025} d={`M51 ${y + 9}Q34 ${y + 4} 36 ${y - 7}Q50 ${y - 5} 51 ${y + 9}M52 ${y + 9}Q69 ${y + 4} 68 ${y - 7}Q54 ${y - 5} 52 ${y + 9}`} /><path d={`M51 ${y + 9}Q34 ${y + 4} 36 ${y - 7}Q50 ${y - 5} 51 ${y + 9}M52 ${y + 9}Q69 ${y + 4} 68 ${y - 7}Q54 ${y - 5} 52 ${y + 9}`} /></g>)}
      <path d="m30 56-16-4 1-12 15 16m3 7-18-3 3-11m51 8 16-5-1-12-15 17m-4 9 19-4-2-11M40 89l20 2" />
    </>}
    {id === 'watch' && <>
      <path d="M43 17v-6h14v6M46 10V5h8v5M39 18h22v8H39z" /><circle cx="50" cy="58" r="32" fill="currentColor" opacity=".12" /><circle cx="50" cy="58" r="32" /><circle cx="50" cy="58" r="26" />
      {Array.from({ length: 12 }, (_, i) => <path key={i} transform={`rotate(${i * 30} 50 58)`} d="M50 35v4" />)}
      <path d="M50 43v15l14 7M50 58l-8 13M67 20c17-18 26 5 14 12m-2-4c14 2 18 17 5 24" /><circle cx="50" cy="58" r="2" fill="currentColor" />
    </>}
    {id === 'bench' && portrait && <image data-illustration="hugo-at-bench" href={hugoAtBench} x="1" y="1" width="98" height="98" preserveAspectRatio="xMidYMid meet" />}
    {id === 'bench' && !portrait && <>
      <path fill="currentColor" opacity=".12" d="M8 56h84v9H8zm15-34h23v31H23z" /><path d="M8 56h84v9H8zm8 9-3 28m70-28 4 28M22 65v18h51V65M25 72h44m-27 5h10M23 53V22h23v31M29 27h11v9H29z" />
      <path d="M56 55V29l8-8 12 8-8 6m-8-11 10-12 12 8-9 12M68 35l-7 20M16 17h9m-5-4v8M33 48h6m43 6V43m-4 0h8M5 94h90" />
      <circle cx="52" cy="51" r="4" /><path d="m14 49 9-2m51 2h9M37 15V8m-4 0h8" />
    </>}
    {id === 'hands' && <>
      <path fill="currentColor" opacity=".12" d="m7 67 20-26 20-8 14 10-15 11 15 8 14-15 18 17-23 23-22-3-18-10-13 9Z" />
      <path d="m7 67 20-26 18-8 14 8c4 3 1 8-3 7l-13-6-9 8m-17 33 12-12 18 11c6 4 10-1 7-5L40 66m14 10 8 4c5 3 9-2 5-6L49 61m15 11 6 3c5 3 9-2 5-6L57 56m15 11 5 2c6 2 8-4 4-7L61 48m-10-7 9-9 18 7 15 25M30 74l-6-9m51-18 8 8M4 71l11 13m69-29 10 10" />
      <path strokeWidth=".8" d="m20 49 8 4m-9 2 6 3m43-21-2 6M42 38l-3 6" />
    </>}
    {id === 'lantern' && <>
      <path d="M42 16V8h16v8M37 18h26v8H37zM37 76h26v6H37zM50 82v13m-6-10v8m12-8v8" />
      <path fill="currentColor" opacity=".15" d="M37 26C5 41 12 69 37 76h26c25-7 32-35 0-50Z" /><path d="M37 26C5 41 12 69 37 76h26c25-7 32-35 0-50ZM39 27c-13 15-13 34 0 48m22-48c13 15 13 34 0 48M50 27v48M18 43h64M17 58h66" />
      <path strokeWidth=".8" d="M29 32 22 67m49-35 7 35M38 37h24m-27 9h30m-30 9h30m-27 9h24M43 21h14" />
    </>}
    {id === 'star' && <>
      <path fill="currentColor" opacity=".14" d="m50 8 9 28 30-4-23 21 13 30-29-17-29 17 13-30L11 32l30 4Z" /><path d="m50 8 9 28 30-4-23 21 13 30-29-17-29 17 13-30L11 32l30 4Z M50 8v45m39-21L50 53m29 30L50 53M21 83l29-30M11 32l39 21" />
      <path strokeWidth="1" d="M50 1v3m44 20-4 2M9 24l-4-2m82 65 3 3M12 89l3-3M38 95h24" />
    </>}
    {id === 'door' && <>
      <path fill="currentColor" opacity=".12" d="M20 89V12h61v77ZM29 82l31-9V20L29 28Z" /><path d="M20 89V12h61v77M27 89V20h47v69M29 82l31-9V20L29 28ZM7 91h86M68 21v60M35 33l18-5v35l-18 5Z" />
      <path d="M53 49h2M61 75l17 14M68 80l19 9M14 16h-5m4 12H5M88 45h7m-6 10h5M31 6h36" /><path strokeWidth=".8" d="m38 88 18-7m-10 8 14-6" />
    </>}
    {id === 'leaf' && <>
      <path fill="currentColor" opacity=".15" d="M19 79C9 42 35 11 86 10c-1 48-31 79-67 69Z" /><path d="M19 79C9 42 35 11 86 10c-1 48-31 79-67 69ZM10 93 75 23M25 76l1-29m13 14 1-31m11 18 3-25M28 74l28-3M41 59l29-5M54 45l22-4" />
      <path strokeWidth=".8" d="M17 64c-1-20 16-42 39-48m-31 66 10 2M11 91l8 1" />
    </>}
  </svg>;
}
