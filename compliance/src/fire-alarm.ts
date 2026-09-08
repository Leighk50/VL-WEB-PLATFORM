export type FireAlarmCallPoint = { id: number | string; venue_id: number | string; active?: boolean | number };

export function resolveFireAlarmTestVenue(points: FireAlarmCallPoint[], callPointId: number): number {
  const point = points.find(item => Number(item.id) === callPointId && Boolean(item.active));
  if (!point) throw new Error("Select a valid active call point");
  const venueId = Number(point.venue_id);
  if (!Number.isInteger(venueId) || venueId < 1) throw new Error("Selected call point has no valid venue");
  return venueId;
}
