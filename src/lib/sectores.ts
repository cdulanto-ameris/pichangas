// Sectores de la pichanga (matriz 3x3, sin arquero)
export const SECTORES = [
  'DEL_IZQ','DEL_CEN','DEL_DER',
  'MED_IZQ','MED_CEN','MED_DER',
  'DEF_IZQ','DEF_CEN','DEF_DER',
] as const;
export type Sector = typeof SECTORES[number];

export const SECTOR_LABELS: Record<Sector, string> = {
  DEL_IZQ: 'Delantero Izq',
  DEL_CEN: 'Delantero Centro',
  DEL_DER: 'Delantero Der',
  MED_IZQ: 'Medio Izq',
  MED_CEN: 'Medio Centro',
  MED_DER: 'Medio Der',
  DEF_IZQ: 'Defensa Izq',
  DEF_CEN: 'Defensa Centro',
  DEF_DER: 'Defensa Der',
};

// Coordenadas en la cancha (% desde arriba/izq) para equipo BLANCO (arriba)
// negro se refleja
export const SECTOR_COORDS: Record<Sector, { row: number; col: number }> = {
  DEL_IZQ: { row: 2, col: 0 }, DEL_CEN: { row: 2, col: 1 }, DEL_DER: { row: 2, col: 2 },
  MED_IZQ: { row: 1, col: 0 }, MED_CEN: { row: 1, col: 1 }, MED_DER: { row: 1, col: 2 },
  DEF_IZQ: { row: 0, col: 0 }, DEF_CEN: { row: 0, col: 1 }, DEF_DER: { row: 0, col: 2 },
};
