/**
 * Turns a citation into a link straight to the cited lines on GitHub, so
 * "trust but verify" on an `ask` answer is one click instead of a manual
 * clone-and-grep. Returns null for anything that isn't a plain github.com
 * https:// source (a local path, a self-hosted git server) — a citation
 * with no working link is just plain text, not a broken one.
 */
export function githubFileUrl(
  source: string,
  commit: string | null,
  filePath: string,
  startLine: number,
  endLine: number,
): string | null {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(source);
  if (!match || !commit) return null;

  const [, owner, repo] = match;
  const lines = startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`;
  return `https://github.com/${owner}/${repo}/blob/${commit}/${filePath}#${lines}`;
}
