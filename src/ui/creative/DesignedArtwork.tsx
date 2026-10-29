import { useId, useLayoutEffect, useState } from 'react';
import { LAYOUTS, MOTIFS, PALETTES, TYPEFACES, motifSize, type BriefCopy, type DesignPiece } from '../../engine/design';
import { Motif } from './Motif';
import '../../styles/creative.css';

function linesFor(text: string, width: number, measure: (line: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && measure(`${line} ${word}`) > width) { lines.push(line); line = ''; }
    if (measure(word) > width) {
      for (const character of word) {
        if (line && measure(line + character) > width) { lines.push(line); line = ''; }
        line += character;
      }
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function typeset(texts: string[], width: number, height: number, size: number, measure: (text: string, font: number) => number) {
  let font = size;
  let lines: string[] = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    lines = texts.flatMap(text => linesFor(text, width, line => measure(line, font)));
    if (lines.length * font * 1.4 <= height) break;
    font *= .94;
  }
  return { font, lines };
}

/** Measure the actual local face, including after fonts load. No word is clipped. */
function PrintedCopy({ texts, x, y, width, height, size, align = 'middle', family, className }: { texts: string[]; x: number; y: number; width: number; height: number; size: number; align?: 'start' | 'middle'; family: string; className?: string }) {
  const key = JSON.stringify({ texts, width, height, size, family });
  const [measured, setMeasured] = useState<{ key: string; font: number; lines: string[] }>();
  useLayoutEffect(() => {
    let active = true;
    const fit = () => {
      const context = document.createElement('canvas').getContext('2d');
      if (!context || !active) return;
      const data: { texts: string[]; width: number; height: number; size: number; family: string } = JSON.parse(key);
      const result = typeset(data.texts, data.width, data.height, data.size, (text, font) => {
        context.font = `${font}px ${data.family}`;
        return context.measureText(text).width;
      });
      setMeasured({ key, ...result });
    };
    fit();
    void document.fonts.ready.then(fit);
    return () => { active = false; };
  }, [key]);
  if (!texts.length) return null;
  const { font, lines } = measured?.key === key ? measured : typeset(texts, width, height, size, (line, font) => line.length * font * .72);
  const top = y + (height - lines.length * font * 1.4) / 2 + font * 1.1;
  return <text className={className} x={align === 'middle' ? x + width / 2 : x} y={top} textAnchor={align} fontSize={font} fontFamily={family}>
    {lines.map((line, index) => <tspan key={index} x={align === 'middle' ? x + width / 2 : x} dy={index ? font * 1.4 : 0}>{line}</tspan>)}
  </text>;
}

export interface DesignedArtworkProps { piece: DesignPiece; copy: BriefCopy[]; label?: string; className?: string; compact?: boolean }

export function DesignedPrint({ piece, copy, label, className = '', compact = false }: DesignedArtworkProps) {
  const id = useId().replace(/:/g, '');
  const palette = PALETTES[piece.palette];
  const family = TYPEFACES[piece.typeface].family;
  const selectedCopy = copy.filter(item => piece.copy.includes(item.id));
  const titles = selectedCopy.filter(c => c.role === 'title').map(c => c.text);
  if (piece.headline?.trim()) titles.unshift(piece.headline.trim());
  const details = selectedCopy.filter(c => c.role !== 'title').map(c => c.text);
  const art = LAYOUTS[piece.layout].art;
  const titleZone = piece.layout === 'headline' ? { x: 8, y: 7, width: 84, height: 29, size: 7.2 }
    : piece.layout === 'split' ? { x: 8, y: 15, width: 36, height: 56, size: 6.4 }
    : piece.layout === 'stack' ? { x: 8, y: 61, width: 84, height: 14, size: 5.2 }
    : { x: 8, y: 7, width: 84, height: 16, size: 5.8 };
  const description = [label, ...selectedCopy.map(c => c.text), piece.headline, ...piece.motifs.map(m => piece.kind === 'portrait' && m.id === 'bench' ? 'Hugo at his watchmaker’s bench' : MOTIFS[m.id])].filter(Boolean).join('. ');
  return <svg viewBox="0 0 100 100" role={compact ? undefined : "img"} aria-hidden={compact || undefined} aria-label={compact ? undefined : description} className={`designed-artwork__print ${className}`} style={{ color: palette.ink, backgroundColor: palette.paper }} fill="currentColor" data-layout={piece.layout} data-palette={piece.palette} data-typeface={piece.typeface} data-treatment={piece.treatment}>
      <defs><pattern id={`grain-${id}`} width="4" height="4" patternUnits="userSpaceOnUse"><path d="m.3 .4.2.1m2 1.8.1.1M1 3h.1" stroke="currentColor" strokeWidth=".12" opacity=".2" /></pattern></defs>
      <rect width="100" height="100" fill={palette.paper} /><rect width="100" height="100" fill={`url(#grain-${id})`} />
      <rect x="3" y="3" width="94" height="94" fill="none" stroke="currentColor" strokeWidth=".15" opacity=".45" />
      {piece.treatment === 'hand-border' && <g fill="none" stroke="currentColor" strokeWidth=".35"><path d="M5 22 5.4 5.5 31 5m38 .4 25.5-.2L95 30m-.3 40 .1 24.7L71 95m-42-.3L5 95.1 5.3 73" /><path d="m7 8 5 2m-3-3 1 5m78-5 2 5m-3-2 5-2M7 88l5 2m-3-3 1 5m78-5 2 5m-3-2 5-2" /></g>}
      <g opacity=".24" stroke="currentColor" strokeWidth=".12"><path d={`M${art.x} ${art.y}h${art.width}M${art.x} ${art.y + art.height}h${art.width}`} /></g>
      {piece.layout === 'headline' && <path d="M8 38h84" stroke="currentColor" strokeWidth=".5" />}
      {piece.layout === 'split' && <path d="M46 15v60" stroke="currentColor" strokeWidth=".2" />}
      {piece.layout === 'stack' && <path d="M8 59h84" stroke="currentColor" strokeWidth=".5" />}
      <svg aria-hidden="true" focusable="false" x={art.x} y={art.y} width={art.width} height={art.height} viewBox={`0 0 ${art.width} ${art.height}`} overflow="hidden">
        {piece.layout === 'gallery' && <g><path d={`M${art.width * .17} ${art.height}V${art.height * .55}a${art.width * .33} ${art.height * .5} 0 0 1 ${art.width * .66} 0V${art.height}Z`} fill="currentColor" opacity=".055" /><path d={`M2 ${art.height - 2}h18m${art.width - 40} 0h18M2 2h18m${art.width - 40} 0h18`} stroke="currentColor" strokeWidth=".4" /></g>}
        {piece.layout === 'headline' && <g><path d={`M${art.width * .1} ${art.height} ${art.width * .38} 0h${art.width * .52}L${art.width * .62} ${art.height}Z`} fill="currentColor" opacity=".075" /><circle cx={art.width * .72} cy={art.height * .5} r={art.height * .43} fill="none" stroke="currentColor" strokeWidth=".3" opacity=".4" /></g>}
        {piece.layout === 'split' && <g><path d={`M0 ${art.height}V${art.width / 2}a${art.width / 2} ${art.width / 2} 0 0 1 ${art.width} 0V${art.height}Z`} fill="currentColor" opacity=".08" /><path d={`M3 ${art.height - 4}h${art.width - 6}m-${art.width - 6} -2h${art.width - 6}`} stroke="currentColor" strokeWidth=".3" /></g>}
        {piece.layout === 'stack' && <g><circle cx={art.width * .5} cy={art.height * .5} r={art.height * .48} fill="currentColor" opacity=".07" /><path d={`M3 3h15M3 3v15m${art.width - 6} ${art.height - 21}v15h-15`} stroke="currentColor" strokeWidth=".55" /></g>}
      </svg>
      <g className="designed-artwork__illustrations">{piece.motifs.map((motif, index) => {
        const size = motifSize(motif.scale);
        return <g key={index} transform={`translate(${motif.x} ${motif.y}) rotate(${motif.rotation})`} color={piece.treatment === 'third-ink' && index % 2 === 0 ? palette.accent : palette.ink}>
          <svg aria-hidden="true" focusable="false" x={-size / 2} y={-size / 2} width={size} height={size}><Motif id={motif.id} portrait={piece.kind === 'portrait'} /></svg>
        </g>;
      })}</g>
      <PrintedCopy texts={titles} {...titleZone} family={family} align={piece.layout === 'split' ? 'start' : 'middle'} className="designed-artwork__title" />
      <PrintedCopy texts={details} x={8} y={78} width={84} height={14} size={2.8} family={TYPEFACES.sans.family} />
      <g stroke={piece.treatment === 'third-ink' ? palette.accent : 'currentColor'} strokeWidth=".25"><path d="M45 95h10M50 94v2" /></g>
    </svg>;
}

export function DesignedArtwork(props: DesignedArtworkProps) {
  const { piece, label, className = '', compact = false } = props;
  const palette = PALETTES[piece.palette];
  return <figure className={`designed-artwork designed-artwork--${piece.layout} ${compact ? 'designed-artwork--compact' : ''} ${className}`} style={{ color: palette.ink, backgroundColor: palette.paper }}><DesignedPrint {...props} className="" />{label && <figcaption>{label}</figcaption>}</figure>;
}
