/**
 * The landing page's figures. Drawn rather than captured, and deliberately
 * unlabelled: a node reading `features/arena` would stop being a drawing and
 * become a claim about somebody's repository. Every stroke and fill is a token
 * the canvas already uses, so the two palettes and the two themes stay one.
 */

import type { ReactNode } from "react";

/** The canvas' dot grid, redrawn here so a figure reads as the same surface. */
function DotGrid({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="var(--border)" />
      </pattern>
    </defs>
  );
}

function Frame({ grid, children }: { grid: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 360 240" aria-hidden className="h-auto w-full select-none">
      <DotGrid id={grid} />
      <rect x="0" y="0" width="360" height="240" fill={`url(#${grid})`} />
      {children}
    </svg>
  );
}

/** Folders as boxes, imports as lines: what the map is, reduced to three nodes. */
export function FoldedMap() {
  return (
    <Frame grid="map-grid">
      {/* Edges first, so the boxes they join sit on top of them. */}
      <path
        d="M150 120 C 188 120, 178 62, 214 62"
        fill="none"
        stroke="var(--outgoing)"
        strokeWidth="1.4"
      />
      <path
        d="M150 120 C 188 120, 178 178, 214 178"
        fill="none"
        stroke="var(--incoming)"
        strokeWidth="1.4"
      />

      {/* One folder, opened into file rows. */}
      <g>
        <rect
          x="18"
          y="66"
          width="132"
          height="110"
          rx="3"
          fill="var(--surface)"
          stroke="var(--border)"
        />
        <line x1="18" y1="90" x2="150" y2="90" stroke="var(--border)" />
        <rect x="28" y="76" width="6" height="6" rx="1" fill="var(--kind-source)" />
        <rect x="28" y="100" width="6" height="6" rx="1" fill="var(--kind-source)" />
        <rect x="28" y="120" width="6" height="6" rx="1" fill="var(--kind-test)" />
        <rect x="28" y="140" width="6" height="6" rx="1" fill="var(--kind-barrel)" />
        <line x1="42" y1="103" x2="132" y2="103" stroke="var(--muted)" opacity="0.5" />
        <line x1="42" y1="123" x2="112" y2="123" stroke="var(--muted)" opacity="0.5" />
        <line x1="42" y1="143" x2="124" y2="143" stroke="var(--muted)" opacity="0.5" />
      </g>

      {/* Two folded folders. */}
      <g>
        <rect
          x="214"
          y="36"
          width="128"
          height="52"
          rx="3"
          fill="var(--surface)"
          stroke="var(--border)"
        />
        <rect x="226" y="60" width="6" height="6" rx="1" fill="var(--kind-source)" />
        <line x1="240" y1="63" x2="322" y2="63" stroke="var(--muted)" opacity="0.5" />
      </g>
      <g>
        <rect
          x="214"
          y="152"
          width="128"
          height="52"
          rx="3"
          fill="var(--surface)"
          stroke="var(--border)"
        />
        <rect x="226" y="176" width="6" height="6" rx="1" fill="var(--kind-barrel)" />
        <line x1="240" y1="179" x2="316" y2="179" stroke="var(--muted)" opacity="0.5" />
      </g>
    </Frame>
  );
}

/** A file in, edges out: the parser turning source into a graph. */
export function ParsePipeline() {
  return (
    <Frame grid="pipeline-grid">
      {/* A file. */}
      <g>
        <path
          d="M30 74 h52 l18 18 v74 a2 2 0 0 1 -2 2 h-68 a2 2 0 0 1 -2 -2 v-90 a2 2 0 0 1 2 -2 z"
          fill="var(--surface)"
          stroke="var(--border)"
        />
        <path d="M82 74 v18 h18" fill="none" stroke="var(--border)" />
        <rect x="40" y="104" width="6" height="6" rx="1" fill="var(--kind-source)" />
        <rect x="40" y="124" width="6" height="6" rx="1" fill="var(--kind-source)" />
        <rect x="40" y="144" width="6" height="6" rx="1" fill="var(--kind-test)" />
        <line x1="54" y1="107" x2="86" y2="107" stroke="var(--muted)" strokeWidth="1.4" opacity="0.6" />
        <line x1="54" y1="127" x2="78" y2="127" stroke="var(--muted)" strokeWidth="1.4" opacity="0.6" />
        <line x1="54" y1="147" x2="90" y2="147" stroke="var(--muted)" strokeWidth="1.4" opacity="0.6" />
      </g>

      {/* Read, then resolved. */}
      <path d="M122 120 H 170" fill="none" stroke="var(--accent)" strokeWidth="1.4" />
      <path d="M164 116 l6 4 l-6 4" fill="none" stroke="var(--accent)" strokeWidth="1.4" />

      {/* Three files, joined by the edges the imports really made. */}
      <path d="M214 74 C 250 74, 250 120, 286 120" fill="none" stroke="var(--outgoing)" strokeWidth="1.4" />
      <path d="M214 120 H 286" fill="none" stroke="var(--incoming)" strokeWidth="1.4" />
      <path d="M214 166 C 250 166, 250 120, 286 120" fill="none" stroke="var(--incoming)" strokeWidth="1.4" />
      <g>
        <rect x="178" y="58" width="36" height="32" rx="3" fill="var(--surface)" stroke="var(--border)" />
        <rect x="190" y="72" width="6" height="6" rx="1" fill="var(--kind-source)" />
        <rect x="178" y="104" width="36" height="32" rx="3" fill="var(--surface)" stroke="var(--border)" />
        <rect x="190" y="118" width="6" height="6" rx="1" fill="var(--kind-barrel)" />
        <rect x="178" y="150" width="36" height="32" rx="3" fill="var(--surface)" stroke="var(--border)" />
        <rect x="190" y="164" width="6" height="6" rx="1" fill="var(--kind-test)" />
      </g>
      <g>
        <rect x="286" y="104" width="52" height="32" rx="3" fill="var(--surface)" stroke="var(--border)" />
        <rect x="298" y="118" width="6" height="6" rx="1" fill="var(--kind-declaration)" />
        <rect x="310" y="118" width="6" height="6" rx="1" fill="var(--kind-declaration)" />
      </g>
    </Frame>
  );
}

/** The conventions an adapter adds, drawn as layers over the plain graph. */
export function FrameworkLayers() {
  const layers = [
    { y: 48, x: 60, w: 240, swatch: "var(--kind-source)" },
    { y: 94, x: 44, w: 272, swatch: "var(--kind-barrel)" },
    { y: 140, x: 60, w: 240, swatch: "var(--kind-test)" },
    { y: 186, x: 76, w: 208, swatch: "var(--kind-declaration)" },
  ];

  return (
    <Frame grid="layers-grid">
      <line x1="34" y1="120" x2="72" y2="120" stroke="var(--border)" />
      {layers.map((layer) => (
        <g key={layer.y}>
          <rect
            x={layer.x}
            y={layer.y}
            width={layer.w}
            height={30}
            rx="3"
            fill="var(--surface)"
            stroke="var(--border)"
          />
          <rect x={layer.x + 10} y={layer.y + 12} width="6" height="6" rx="1" fill={layer.swatch} />
          <line
            x1={layer.x + 26}
            y1={layer.y + 15}
            x2={layer.x + layer.w - 12}
            y2={layer.y + 15}
            stroke="var(--muted)"
            strokeWidth="1.4"
            opacity="0.45"
          />
        </g>
      ))}
    </Frame>
  );
}
