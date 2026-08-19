/**
 * "src/search/search.service.ts" -> "search"; "src/main.ts" -> "src".
 *
 * A heuristic, not a real module boundary — good enough to group symbols
 * for blast radius and architecture maps without needing NestJS-specific
 * module-file parsing. Shared by `impact` and `map` so both group the
 * same way; a diagram that disagreed with the blast radius about which
 * module a file belongs to would be worse than either alone.
 */
export function moduleOf(filePath: string): string {
  const segments = filePath.split('/');
  return segments[0] === 'src' && segments.length > 2 ? segments[1] : segments[0];
}
