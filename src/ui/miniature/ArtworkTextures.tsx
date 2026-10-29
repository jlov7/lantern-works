import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { AuthoredBrief } from '../game/portfolio';
import { CampaignArtwork } from '../portfolio/Artwork';
import { DesignedPrint } from '../creative/DesignedArtwork';
import type { CarriedPiece } from '../../engine/types';
import youngSerif from '@fontsource/young-serif/files/young-serif-latin-400-normal.woff2?url';
import atkinson from '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2?url';

export type PrintSource = { key: string; brief: AuthoredBrief; launch?: number; launches?: number } | { key: string; carried: CarriedPiece };
export type PrintTextures = ReadonlyMap<string, CanvasTexture>;
export interface TextureOwner { committed: (textures: PrintTextures) => void }
async function dataURL(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Artwork asset ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Artwork asset unreadable'));
    reader.readAsDataURL(blob);
  });
}
let fontCSS: Promise<string> | undefined;
function embeddedFonts() {
  return fontCSS ??= Promise.all([dataURL(youngSerif), dataURL(atkinson)]).then(([serif, sans]) => `@font-face{font-family:'Young Serif';src:url(${serif})} @font-face{font-family:'Atkinson Hyperlegible';src:url(${sans})}`);
}
const STYLES = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'font-family', 'font-size', 'font-weight', 'letter-spacing', 'color', 'opacity', 'text-anchor'];

/** Serialize the settled DOM, including resolved CSS, embedded local fonts and photographic assets. */
async function rasterizePrint(source: SVGSVGElement, signal: AbortSignal): Promise<CanvasTexture> {
  await document.fonts.ready;
  const fonts = await embeddedFonts();
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  signal.throwIfAborted();
  const clone = source.cloneNode(true) as SVGSVGElement;
  const originals = [source, ...source.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((element, i) => {
    const computed = getComputedStyle(element);
    STYLES.forEach(property => (copies[i] as SVGElement).style.setProperty(property, computed.getPropertyValue(property)));
  });
  await Promise.all([...clone.querySelectorAll('image')].map(async element => {
    const href = element.getAttribute('href');
    if (href && !href.startsWith('data:')) element.setAttribute('href', await dataURL(href));
  }));
  signal.throwIfAborted();
  const square = source.viewBox.baseVal.width === source.viewBox.baseVal.height;
  const width = square ? 1024 : 768;
  const height = 1024;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style'); style.textContent = fonts; clone.prepend(style);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Artwork canvas unavailable');
    context.drawImage(image, 0, 0, width, height);
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4;
    return texture;
  } finally { URL.revokeObjectURL(url); }
}

export function ArtworkTextures({ sources, onReady, onFailure, ref, active = true }: { sources: PrintSource[]; onReady: (textures: PrintTextures) => void; onFailure: () => void; ref: Ref<TextureOwner>; active?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const pool = useRef(new Map<string, CanvasTexture>());
  const requested = useRef(new Set<string>());
  const published = useRef<PrintTextures>(new Map());
  const generation = useRef(0);
  // The R3F commit confirms that no live material still uses a retired print.
  useImperativeHandle(ref, () => ({ committed(textures) {
    if (textures !== published.current) return;
    for (const [signature, texture] of pool.current) if (!requested.current.has(signature)) {
      texture.dispose(); pool.current.delete(signature);
    }
  } }), []);
  useEffect(() => {
    const current = ++generation.current;
    const owned = pool.current;
    return () => { queueMicrotask(() => {
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- Compare the generation after Strict Mode replays the effect.
      if (generation.current !== current) return;
      owned.forEach(texture => texture.dispose()); owned.clear();
    }); };
  }, []);
  useEffect(() => {
    if (!active) return;
    const abort = new AbortController();
    const entries = sources.map(source => ({ source, signature: JSON.stringify(source) }));
    requested.current = new Set(entries.map(entry => entry.signature));
    const publish = () => {
      const textures = new Map(entries.flatMap(({ source, signature }) => {
        const texture = pool.current.get(signature);
        return texture ? [[source.key, texture] as const] : [];
      }));
      published.current = textures;
      onReady(textures);
      setReady(textures.size === entries.length);
    };
    publish();
    const missing = entries.filter(entry => !pool.current.has(entry.signature));
    if (!missing.length) return () => abort.abort();
    void Promise.all(missing.map(async ({ source, signature }) => {
      const svg = root.current?.querySelector(`[data-print-key="${CSS.escape(source.key)}"] > svg`);
      if (!(svg instanceof SVGSVGElement)) throw new Error('Artwork source missing');
      const texture = await rasterizePrint(svg, abort.signal);
      if (abort.signal.aborted) { texture.dispose(); return; }
      pool.current.set(signature, texture);
    })).then(() => {
      if (abort.signal.aborted) return;
      publish();
    }).catch(() => { if (!abort.signal.aborted) { abort.abort(); onFailure(); } });
    return () => abort.abort();
  }, [sources, onReady, onFailure, active]);
  return <div className="miniature-art-sources" ref={root} aria-hidden="true" data-art-ready={ready}>{sources.map(source => <div key={source.key} data-print-key={source.key}>{'carried' in source ? <DesignedPrint piece={source.carried.design} copy={source.carried.copy} label={source.carried.title} /> : <CampaignArtwork brief={source.brief} launch={source.launch} launches={source.launches} />}</div>)}</div>;
}
