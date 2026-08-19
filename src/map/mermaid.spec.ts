import { GraphEdge, GraphNode, renderFlowchart } from './mermaid';

describe('renderFlowchart', () => {
  it('declares nodes with generated ids and renders edges between them', () => {
    const mermaid = renderFlowchart(
      [
        { key: 'auth', label: 'auth' },
        { key: 'users', label: 'users' },
      ],
      [{ from: 'auth', to: 'users', label: '3' }],
    );

    expect(mermaid).toBe(
      ['flowchart LR', '  n0["auth"]', '  n1["users"]', '  n0 -->|"3"| n1'].join('\n'),
    );
  });

  it('renders each shape with its own delimiters', () => {
    const nodes: GraphNode[] = [
      { key: 'a', label: 'A', shape: 'subroutine' },
      { key: 'b', label: 'B', shape: 'hexagon' },
      { key: 'c', label: 'C', shape: 'rounded' },
      { key: 'd', label: 'D', shape: 'rect' },
    ];

    const mermaid = renderFlowchart(nodes, []);

    expect(mermaid).toContain('n0[["A"]]');
    expect(mermaid).toContain('n1{{"B"}}');
    expect(mermaid).toContain('n2("C")');
    expect(mermaid).toContain('n3["D"]');
  });

  it('nests grouped nodes in subgraphs and leaves ungrouped ones at the top level', () => {
    const mermaid = renderFlowchart(
      [
        { key: 'a', label: 'Loose' },
        { key: 'b', label: 'InSearch', group: 'search' },
        { key: 'c', label: 'AlsoInSearch', group: 'search' },
      ],
      [],
    );

    expect(mermaid).toBe(
      [
        'flowchart LR',
        '  n0["Loose"]',
        '  subgraph g0["search"]',
        '    n1["InSearch"]',
        '    n2["AlsoInSearch"]',
        '  end',
      ].join('\n'),
    );
  });

  it('draws dotted arrows for edges marked dotted', () => {
    const mermaid = renderFlowchart(
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      [{ from: 'a', to: 'b', label: 'injects', dotted: true }],
    );

    expect(mermaid).toContain('n0 -.->|"injects"| n1');
  });

  it('omits the label pipe entirely for an unlabelled edge', () => {
    const mermaid = renderFlowchart(
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      [{ from: 'a', to: 'b' }],
    );

    expect(mermaid).toContain('n0 --> n1');
    expect(mermaid).not.toContain('|');
  });

  describe('escaping', () => {
    // Node ids are generated rather than taken from input, so the only way
    // repository content reaches the output is inside a label. These cover
    // the characters that could otherwise end a label early and let the
    // rest of the name be read as Mermaid syntax.
    it('escapes quotes so a label cannot close its own delimiter', () => {
      const mermaid = renderFlowchart([{ key: 'a', label: 'evil"] --> hacked[" ' }], []);

      expect(mermaid).toContain('#quot;');
      // Exactly two quote characters on the line: the label's own opening
      // and closing delimiter. Any third would mean the label ended early
      // and the rest of the name is being read as syntax.
      const [, declaration] = mermaid.split('\n');
      expect(declaration.match(/"/g)).toHaveLength(2);
      // The injected arrow is inert: it's still inside the label, so no
      // second node or edge was created.
      expect(mermaid.split('\n')).toHaveLength(2);
    });

    it('escapes # before quotes, so a literal #quot; in a name stays text', () => {
      // Escaping " -> #quot; first and # second would decode this attacker
      // string into a real quote on the second pass.
      const mermaid = renderFlowchart([{ key: 'a', label: '#quot;] --> x[' }], []);

      expect(mermaid).toContain('#35;quot;');
      expect(mermaid).not.toContain('"] --> x["');
      expect(mermaid.split('\n')).toHaveLength(2);
    });

    it('escapes angle brackets and flattens newlines', () => {
      const mermaid = renderFlowchart([{ key: 'a', label: 'Repo<User>\nsecond line' }], []);

      expect(mermaid).toContain('Repo#lt;User#gt; second line');
      expect(mermaid.split('\n')).toHaveLength(2);
    });

    it('escapes subgraph titles too, not just node labels', () => {
      const mermaid = renderFlowchart([{ key: 'a', label: 'A', group: 'we"ird' }], []);

      expect(mermaid).toContain('subgraph g0["we#quot;ird"]');
    });
  });

  describe('determinism', () => {
    it('renders identically regardless of input order', () => {
      const nodes: GraphNode[] = [
        { key: 'c', label: 'C', group: 'z' },
        { key: 'a', label: 'A', group: 'm' },
        { key: 'b', label: 'B', group: 'z' },
      ];
      const edges: GraphEdge[] = [
        { from: 'c', to: 'a' },
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ];

      const forwards = renderFlowchart(nodes, edges);
      const backwards = renderFlowchart([...nodes].reverse(), [...edges].reverse());

      expect(forwards).toBe(backwards);
    });
  });

  it('drops edges pointing at nodes that are not in the graph', () => {
    // Mermaid would invent a bare node for the dangling id, which looks
    // like real content but isn't — better to draw nothing.
    const mermaid = renderFlowchart([{ key: 'a', label: 'A' }], [{ from: 'a', to: 'ghost' }]);

    expect(mermaid).toBe(['flowchart LR', '  n0["A"]'].join('\n'));
  });
});
