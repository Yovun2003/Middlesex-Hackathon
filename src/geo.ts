export type Coordinate = [longitude: number, latitude: number]

export type MapIncident = {
  id: string
  town: string
  title: string
  tone: 'critical' | 'response' | 'leak' | 'verified'
  coordinate?: Coordinate
}

export type MapProps = {
  incidents: MapIncident[]
  selectedId?: string
  onSelect: (id: string) => void
  center?: Coordinate
  pin?: Coordinate
  onPick?: (point: Coordinate) => void
}

export const places = {
  'Port Louis': [57.4989, -20.1609],
  'Rose Hill': [57.4669, -20.242],
  'Beau Bassin': [57.4602, -20.2244],
  'Quatre Bornes': [57.4796, -20.2654],
  Vacoas: [57.479, -20.2983],
  Phoenix: [57.5033, -20.283],
  Curepipe: [57.5259, -20.3188],
  Bambous: [57.4073, -20.2583],
  'Flic en Flac': [57.3724, -20.2782],
  Tamarin: [57.3758, -20.325],
  'Rivière Noire': [57.3658, -20.3532],
  'Le Morne': [57.3232, -20.4545],
  Souillac: [57.5169, -20.5166],
  'Rose Belle': [57.5951, -20.4003],
  Mahébourg: [57.7017, -20.4081],
  'Centre de Flacq': [57.7177, -20.2002],
  'Bel Air': [57.7458, -20.2578],
  'Rivière du Rempart': [57.6818, -20.1031],
  Goodlands: [57.6506, -20.0391],
  'Grand Baie': [57.5811, -20.0171],
  Triolet: [57.5504, -20.0552],
  Pamplemousses: [57.5684, -20.102],
  'Saint Pierre': [57.5229, -20.2251],
  Moka: [57.4959, -20.2189],
  'Trou d’Eau Douce': [57.7883, -20.2397],
  'Plaine Magnien': [57.6699, -20.4298],
  'Bel Ombre': [57.4114, -20.5016],
} satisfies Record<string, Coordinate>

const normalizeTown = (town: string) => town.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const placeIndex = new Map<string, Coordinate>(Object.entries(places).map(([town, coordinate]) => [normalizeTown(town), coordinate]))
placeIndex.set('flacq', places['Centre de Flacq'])
placeIndex.set('centralflacq', places['Centre de Flacq'])
placeIndex.set('beaubassinrosehill', places['Rose Hill'])
placeIndex.set('stpierre', places['Saint Pierre'])

export function getPlace(town: string) {
  return placeIndex.get(normalizeTown(town))
}

export const islandBounds = { west: 57.27, east: 57.87, north: -19.91, south: -20.57 }
export const islandCenter: Coordinate = [(islandBounds.west + islandBounds.east) / 2, (islandBounds.north + islandBounds.south) / 2]
export const terrainWidth = 9.26
export const terrainLength = 10.86
export const elevationScale = 0.002

export function terrainPosition([longitude, latitude]: Coordinate): [x: number, z: number] {
  return [
    ((longitude - islandBounds.west) / (islandBounds.east - islandBounds.west) - 0.5) * terrainWidth,
    ((islandBounds.north - latitude) / (islandBounds.north - islandBounds.south) - 0.5) * terrainLength,
  ]
}

// An explanatory depot-to-distribution route through central Mauritius.
export const tankRoute: Coordinate[] = [
  [57.5293, -20.2219], [57.5244, -20.2286], [57.5201, -20.2308],
  [57.5148, -20.2328], [57.5107, -20.2408], [57.5031, -20.2489],
  [57.501, -20.259], [57.5013, -20.27], [57.505, -20.2791],
  [57.5091, -20.2932], [57.5162, -20.3038], [57.5225, -20.3093],
  [57.5232, -20.3157], places.Curepipe,
]

export const markerLabels: Record<MapIncident['tone'], string> = {
  critical: 'Critical shortage',
  response: 'Response in progress',
  leak: 'Verified public leak',
  verified: 'Verified outcome',
}

let webglAvailable: boolean | undefined

export function canRenderWebGL() {
  if (webglAvailable !== undefined) return webglAvailable
  try {
    const context = document.createElement('canvas').getContext('webgl2')
    webglAvailable = Boolean(context)
    context?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglAvailable = false
  }
  return webglAvailable
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
