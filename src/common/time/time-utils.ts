export function hasPassed(
  date: Date | null | undefined,
  reference: Date,
): boolean {
  if (!date) {
    return false;
  }
  return date.getTime() < reference.getTime();
}

export function isUpcoming(
  date: Date | null | undefined,
  reference: Date,
): boolean {
  if (!date) {
    return false;
  }
  return date.getTime() > reference.getTime();
}
