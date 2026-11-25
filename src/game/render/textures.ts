import { ImageSource, Rectangle, Texture, type TextureSource } from 'pixi.js';
import { urlParam } from '../../utils/urlParams';

export type ShipSkin = 'player' | 'chaser' | 'shooter';
export type DamageLevel = 0 | 1 | 2;

export interface TextureSet {
  ships: Record<ShipSkin, [Texture, Texture, Texture]>;
  ball: Texture;
  explosions: [Texture, Texture, Texture];
  fire: [Texture, Texture];
  water: Texture;
  sand: Texture;
  grass: Texture;
  rocks: Texture[];
  palms: Texture[];
  barFrame: Texture;
  barGreen: Texture;
  barRed: Texture;
  /** World units per texel of the tile textures (0.5 with the 2x sheet). */
  tileScale: number;
  destroy(): void;
}

export function damageLevel(healthRatio: number): DamageLevel {
  return healthRatio > 0.66 ? 0 : healthRatio > 0.33 ? 1 : 2;
}

/** Failure injection for E2E: `?failAssets=always`, or `once` to fail only the first attempt. */
let attempts = 0;
function injectedFailure(): boolean {
  attempts += 1;
  const mode = urlParam('failAssets');
  return mode === 'always' || (mode === 'once' && attempts === 1);
}

const SHIP_FRAMES: Record<ShipSkin, [number, number, number]> = {
  player: [5, 11, 17],
  chaser: [2, 8, 14],
  shooter: [3, 9, 15],
};

/** Cells of the 16-column tile sheet, 1-based as numbered in the asset pack. */
const TILE = { water: 73, sand: 20, grass: 23, rocks: [49, 50, 51], palms: [70, 71, 72] } as const;

const BASE = `${import.meta.env.BASE_URL}assets/`;

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status}).`);
  return res;
}

const loadBitmap = async (url: string): Promise<ImageBitmap> =>
  createImageBitmap(await (await fetchOk(url)).blob());

function parseAtlas(xml: string): Map<string, Rectangle> {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const frames = new Map<string, Rectangle>();
  for (const el of Array.from(doc.querySelectorAll('SubTexture'))) {
    const name = (el.getAttribute('name') ?? '').replace(/\.png$/, '');
    frames.set(
      name,
      new Rectangle(
        +el.getAttribute('x')!,
        +el.getAttribute('y')!,
        +el.getAttribute('width')!,
        +el.getAttribute('height')!,
      ),
    );
  }
  return frames;
}

export async function loadTextures(onProgress: (p: number) => void): Promise<TextureSet> {
  if (injectedFailure()) throw new Error('Failed to load game textures (simulated failure).');

  const dense = (window.devicePixelRatio || 1) >= 1.5;
  const tileUnit = dense ? 128 : 64;
  const ui = `${BASE}ui/1x/hud/`;
  const jobs: Array<() => Promise<unknown>> = [
    () => loadBitmap(`${BASE}game/ships.png`),
    async () => parseAtlas(await (await fetchOk(`${BASE}game/ships.xml`)).text()),
    () => loadBitmap(`${BASE}game/tiles${dense ? '@2x' : ''}.png`),
    () => loadBitmap(`${ui}enemy_health_frame.png`),
    () => loadBitmap(`${ui}enemy_health_fill_green.png`),
    () => loadBitmap(`${ui}enemy_health_fill_red.png`),
  ];
  let done = 0;
  const results = await Promise.all(
    jobs.map(async (job) => {
      const r = await job();
      done += 1;
      onProgress(done / jobs.length);
      return r;
    }),
  );
  const [shipsBmp, atlas, tilesBmp, frameBmp, greenBmp, redBmp] = results as [
    ImageBitmap,
    Map<string, Rectangle>,
    ImageBitmap,
    ImageBitmap,
    ImageBitmap,
    ImageBitmap,
  ];

  const bitmaps = [shipsBmp, tilesBmp, frameBmp, greenBmp, redBmp];
  const created: Texture[] = [];
  const sources = new Set<TextureSource>();
  const keep = (t: Texture): Texture => {
    created.push(t);
    sources.add(t.source);
    return t;
  };
  const release = (): void => {
    created.forEach((t) => t.destroy(false));
    sources.forEach((src) => src.destroy());
    bitmaps.forEach((b) => b.close());
  };

  try {
    const shipSheet = keep(new Texture({ source: new ImageSource({ resource: shipsBmp }) }));
    const sub = (name: string): Texture => {
      const frame = atlas.get(name);
      if (!frame) throw new Error(`Missing sprite "${name}" in the ship atlas.`);
      return keep(new Texture({ source: shipSheet.source, frame }));
    };

    const tilesSheet = keep(new Texture({ source: new ImageSource({ resource: tilesBmp }) }));
    const cell = (n: number): Rectangle =>
      new Rectangle(((n - 1) % 16) * tileUnit, Math.floor((n - 1) / 16) * tileUnit, tileUnit, tileUnit);
    const tileSprite = (n: number): Texture =>
      keep(new Texture({ source: tilesSheet.source, frame: cell(n) }));
    // Atlas sub-frames cannot repeat, so tileable fills get their own texture source.
    const tileFill = (n: number): Texture => {
      const r = cell(n);
      const c = document.createElement('canvas');
      c.width = r.width;
      c.height = r.height;
      const g = c.getContext('2d');
      if (!g) throw new Error('2D canvas is not available.');
      g.drawImage(tilesBmp, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
      const t = keep(Texture.from(c));
      t.source.style.addressMode = 'repeat';
      return t;
    };

    const ships = {} as TextureSet['ships'];
    for (const skin of Object.keys(SHIP_FRAMES) as ShipSkin[]) {
      ships[skin] = SHIP_FRAMES[skin].map((n) => sub(`ship_${n}`)) as [Texture, Texture, Texture];
    }

    return {
      ships,
      ball: sub('cannon_ball'),
      explosions: [sub('explosion_1'), sub('explosion_2'), sub('explosion_3')],
      fire: [sub('fire_1'), sub('fire_2')],
      water: tileFill(TILE.water),
      sand: tileFill(TILE.sand),
      grass: tileFill(TILE.grass),
      rocks: TILE.rocks.map(tileSprite),
      palms: TILE.palms.map(tileSprite),
      barFrame: keep(Texture.from(frameBmp)),
      barGreen: keep(Texture.from(greenBmp)),
      barRed: keep(Texture.from(redBmp)),
      tileScale: 64 / tileUnit,
      destroy: release,
    };
  } catch (err) {
    release();
    throw err;
  }
}
