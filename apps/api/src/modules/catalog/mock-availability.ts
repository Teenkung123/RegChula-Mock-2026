export const minimumMockRemainingSeats = 5

export function mockSectionCapacity(
  capacity: number,
  baselineEnrolled: number,
  localActive = 0,
): number {
  const occupied = baselineEnrolled + localActive
  return capacity <= occupied ? occupied + minimumMockRemainingSeats : capacity
}
