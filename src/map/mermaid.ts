/**
 * Minimal Mermaid `flowchart` emitter.
 *
 * Kept as a pure function, deliberately unaware of symbols and edges: it
 * takes an already-shaped graph and turns it into text. That split is what
 * makes escaping and determinism testable without a database.
 *
 * Two properties this file exists to guarantee:
 *
 * 1. **Node ids are generated, never taken from the input.** Ids are `n0`,
 *    `n1`, ... assigned in sorted key order. Repository content — file
 *    paths, class names — only ever reaches the output inside a *label*,
 *    never in a position where Mermaid would read it as syntax.
 * 2. **Output is deterministic.** Nodes, groups and edges are all sorted
 *    before emitting, so the same graph renders byte-identically every
 *    time. `map` promises a reproducible diagram; a Map iteration order
 *    leaking into the output would quietly break that.
 */

export type NodeShape = 'rect' | 'rounded' | 'hexagon' | 'subroutine';

export interface GraphNode {
  /** Unique within the graph. Used to reference the node from edges. */
  key: string;
  /** Human-readable text. Escaped on render — may contain anything. */
  label: string;
  shape?: NodeShape;
  /** Optional subgraph to nest this node under. */
  group?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  /** Dotted rather than solid — used for non-`calls` relationships. */
  dotted?: boolean;
}

const SHAPES: Record<NodeShape, [string, string]> = {
  rect: ['[', ']'],
  rounded: ['(', ')'],
  hexagon: ['{{', '}}'],
  subroutine: ['[[', ']]'],
};

export function renderFlowchart(nodes: GraphNode[], edges: GraphEdge[]): string {
  const sorted = [...nodes].sort((a, b) => a.key.localeCompare(b.key));
  const ids = new Map(sorted.map((node, i) => [node.key, `n${i}`]));

  const lines = ['flowchart LR'];

  const ungrouped = sorted.filter((n) => !n.group);
  for (const node of ungrouped) {
    lines.push(`  ${declare(node, ids)}`);
  }

  const groups = [...new Set(sorted.map((n) => n.group).filter(Boolean))].sort() as string[];
  for (const group of groups) {
    // The subgraph id is generated for the same reason node ids are: a
    // module name reaching a syntax position could break the diagram.
    lines.push(`  subgraph g${groups.indexOf(group)}["${escapeLabel(group)}"]`);
    for (const node of sorted.filter((n) => n.group === group)) {
      lines.push(`    ${declare(node, ids)}`);
    }
    lines.push('  end');
  }

  // Edges pointing at nodes that aren't in the graph are dropped rather
  // than emitted: Mermaid would silently invent a bare, unlabelled node
  // for the dangling id, which looks like real content but isn't.
  const renderable = edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) ||
        (a.label ?? '').localeCompare(b.label ?? ''),
    );

  for (const edge of renderable) {
    const arrow = edge.dotted ? '-.->' : '-->';
    const label = edge.label ? `|"${escapeLabel(edge.label)}"|` : '';
    lines.push(`  ${ids.get(edge.from)} ${arrow}${label} ${ids.get(edge.to)}`);
  }

  return lines.join('\n');
}

function declare(node: GraphNode, ids: Map<string, string>): string {
  const [open, close] = SHAPES[node.shape ?? 'rect'];
  return `${ids.get(node.key)}${open}"${escapeLabel(node.label)}"${close}`;
}

/**
 * Mermaid has no backslash escape for label text; it uses HTML-entity-style
 * `#nn;` codes instead. `#` is escaped first, so a label that already
 * contains a literal `#quot;` survives as text instead of being decoded
 * into a quote — which is exactly how an injected label would try to break
 * out of the surrounding `"..."`.
 */
function escapeLabel(text: string): string {
  return text
    .replace(/#/g, '#35;')
    .replace(/"/g, '#quot;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;')
    .replace(/\s*[\r\n]+\s*/g, ' ');
}
