export const SPECIES_IDS = [
  'dolphin',
  'jellyfish',
  'squid',
  'turtle',
  'crab',
  'clownfish',
] as const;

export type SpeciesId = (typeof SPECIES_IDS)[number];

export type FacingDirection = 'left' | 'right' | 'front';
export type HabitatZone = 'upper-mid' | 'all-water' | 'mid-water' | 'seabed';

export interface SpeciesSpec {
  readonly id: SpeciesId;
  readonly name: string;
  readonly sourceImage: string;
  readonly outlineUrl: string;
  readonly defaultFacing: FacingDirection;
  readonly habitat: HabitatZone;
  /** 6-bit [6,3] linear code (min Hamming distance 3 across all species) */
  readonly barcodeBits: readonly [number, number, number, number, number, number];
  /** Default base width in logical Aquarium pixels */
  readonly baseDisplayWidth: number;
}

export const SPECIES_CATALOG: Record<SpeciesId, SpeciesSpec> = {
  dolphin: {
    id: 'dolphin',
    name: '海豚',
    sourceImage: '1.png',
    outlineUrl: './templates/dolphin-outline.png',
    defaultFacing: 'left',
    habitat: 'upper-mid',
    barcodeBits: [0, 0, 1, 0, 1, 1],
    baseDisplayWidth: 168,
  },
  jellyfish: {
    id: 'jellyfish',
    name: '水母',
    sourceImage: '2.png',
    outlineUrl: './templates/jellyfish-outline.png',
    defaultFacing: 'front',
    habitat: 'all-water',
    barcodeBits: [0, 1, 0, 1, 1, 0],
    baseDisplayWidth: 112,
  },
  squid: {
    id: 'squid',
    name: '烏賊',
    sourceImage: '3.png',
    outlineUrl: './templates/squid-outline.png',
    defaultFacing: 'front',
    habitat: 'all-water',
    barcodeBits: [0, 1, 1, 1, 0, 1],
    baseDisplayWidth: 118,
  },
  turtle: {
    id: 'turtle',
    name: '海龜',
    sourceImage: '4.png',
    outlineUrl: './templates/turtle-outline.png',
    defaultFacing: 'right',
    habitat: 'mid-water',
    barcodeBits: [1, 0, 0, 1, 0, 1],
    baseDisplayWidth: 150,
  },
  crab: {
    id: 'crab',
    name: '螃蟹',
    sourceImage: '5.png',
    outlineUrl: './templates/crab-outline.png',
    defaultFacing: 'front',
    habitat: 'seabed',
    barcodeBits: [1, 0, 1, 1, 1, 0],
    baseDisplayWidth: 126,
  },
  clownfish: {
    id: 'clownfish',
    name: '小丑魚',
    sourceImage: '6.png',
    outlineUrl: './templates/clownfish-outline.png',
    defaultFacing: 'left',
    habitat: 'mid-water',
    barcodeBits: [1, 1, 0, 0, 1, 1],
    baseDisplayWidth: 132,
  },
};

export const SPECIES_LIST: readonly SpeciesSpec[] = SPECIES_IDS.map((id) => SPECIES_CATALOG[id]);

export function getSpeciesSpec(id: SpeciesId): SpeciesSpec {
  return SPECIES_CATALOG[id];
}
