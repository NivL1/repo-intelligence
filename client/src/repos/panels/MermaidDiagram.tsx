import { useEffect, useRef, useState } from 'react';

// mermaid's bundle includes every diagram type it supports (sequence,
// class, architecture, even a katex math renderer) — several hundred KB
// of code this app never uses, since `map` only ever emits `flowchart`.
// A dynamic import turns that into its own chunk that only downloads the
// first time someone opens the Map tab, instead of weighing down the
// initial page load every visitor pays for.
let mermaidPromise: ReturnType<typeof loadMermaid> | undefined;

async function loadMermaid() {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  return mermaid;
}

function getMermaid() {
  mermaidPromise ??= loadMermaid();
  return mermaidPromise;
}

let renderCounter = 0;

export function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A fresh id per render — mermaid.render() rejects rendering the
    // same id twice into the DOM, which repeated Map/Zoom clicks would
    // otherwise trigger.
    const id = `mermaid-${++renderCounter}`;

    getMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'failed to render diagram');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) return <p className="error">{error}</p>;
  return <div className="mermaid-container" ref={containerRef} />;
}
