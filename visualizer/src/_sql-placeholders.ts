export function placeholders(count: number): string {
  if (count < 1) {
    throw new Error("placeholder count must be positive");
  }

  return Array.from({ length: count }, () => "?").join(", ");
}
