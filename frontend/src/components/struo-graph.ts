import { escapeHtml } from '../utils.js'

interface ArrowEntry {
  label?: string
  from: string
  to: string
}

interface SubGraphContent {
  objects: GraphObject[]
  arrows: ArrowEntry[]
}

interface GraphObject {
  name: string
  subGraph?: SubGraphContent
}

interface GraphResponse {
  name: string
  objects: GraphObject[]
  arrows: ArrowEntry[]
}

// Node appearance
const NODE_FILLS = [
  '#e9d5ff', // lavender
  '#bbf7d0', // mint
  '#fed7aa', // peach
  '#bfdbfe', // sky
  '#fde68a', // butter
  '#fecdd3', // rose
]
const NODE_STROKES = [
  '#c4b5fd',
  '#86efac',
  '#fdba74',
  '#93c5fd',
  '#fcd34d',
  '#fda4af',
]

// Arrows-set stroke palette (distinct from node fills)
const EDGE_COLORS = [
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f97316', // orange
  '#3b82f6', // blue
  '#eab308', // yellow
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
]

const NODE_R = 28
const CX = 250
const CY = 250
const ORBIT_R = 155
const LEGEND_TOP = 520
const VIEWBOX = '0 0 500 600'

// Expanded-mode constants (when graph-objects contain sub-graphs)
const EX_CX = 350
const EX_CY = 320
const EX_OUTER_ORBIT_R = 200
const EX_BUBBLE_R = 75
const EX_INNER_NODE_R = 16
const EX_INNER_ORBIT_R = 38
const EX_LEGEND_TOP = 650
const EX_VIEWBOX = '0 0 700 720'

class StruoGraph extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['name']
  }

  connectedCallback(): void {
    this.render()
  }

  private async render(): Promise<void> {
    const name = this.getAttribute('name') ?? ''

    let data: GraphResponse

    try {
      const res = await fetch(`/api/graph/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json()
    } catch {
      this.innerHTML = `
        <div class="mapping-page">
          <nav class="mapping-nav">
            <a class="back-link" href="/">← collection</a>
          </nav>
          <div class="error-state">Graph "${escapeHtml(name)}" not found.</div>
        </div>
      `
      return
    }

    const svg = buildGraphSVG(data)

    this.innerHTML = `
      <div class="mapping-page">
        <nav class="mapping-nav">
          <a class="back-link" href="/">← collection</a>
          <h1 class="mapping-title">${escapeHtml(data.name)}</h1>
          <span class="mapping-type-badge">graph</span>
        </nav>
        <div class="graph-container">${svg}</div>
      </div>
    `
  }
}

function buildGraphSVG(data: GraphResponse): string {
  const objects = data.objects
  const n = objects.length

  if (n === 0) {
    return `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <text x="250" y="250" text-anchor="middle" fill="#94a3b8" font-size="14">empty graph</text>
</svg>`
  }

  const hasSubGraphs = objects.some(o => o.subGraph != null)
  return hasSubGraphs
    ? buildExpandedSVG(data)
    : buildFlatSVG(data)
}

// buildFlatSVG renders graphs whose objects are all plain nodes (no sub-graphs).
function buildFlatSVG(data: GraphResponse): string {
  const objects = data.objects
  const n = objects.length
  const pos = new Map<string, { x: number; y: number }>()

  if (n === 1) {
    pos.set(objects[0].name, { x: CX, y: CY })
  } else {
    objects.forEach((obj, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2
      pos.set(obj.name, {
        x: Math.round(CX + ORBIT_R * Math.cos(angle)),
        y: Math.round(CY + ORBIT_R * Math.sin(angle)),
      })
    })
  }

  const { markers, edgeGroups, legendItems } = buildEdgesAndLegend(
    data.arrows, pos, LEGEND_TOP, NODE_R,
  )

  const nodeSvg = objects.map((obj, i) => {
    const p = pos.get(obj.name)!
    const fill = NODE_FILLS[i % NODE_FILLS.length]
    const stroke = NODE_STROKES[i % NODE_STROKES.length]
    return `<g class="graph-node">
    <circle cx="${p.x}" cy="${p.y}" r="${NODE_R}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <text class="graph-node-label" x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central">${escapeHtml(obj.name)}</text>
  </g>`
  }).join('\n  ')

  return `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${markers}
  </defs>
  ${edgeGroups}
  ${nodeSvg}
  <g class="graph-legend">
    ${legendItems}
  </g>
</svg>`
}

// buildExpandedSVG renders graphs that have graph-objects (sub-graphs as bubbles).
function buildExpandedSVG(data: GraphResponse): string {
  const objects = data.objects
  const n = objects.length

  // Position bubble centres on the outer orbit.
  const bubblePos = new Map<string, { x: number; y: number }>()
  if (n === 1) {
    bubblePos.set(objects[0].name, { x: EX_CX, y: EX_CY })
  } else {
    objects.forEach((obj, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2
      bubblePos.set(obj.name, {
        x: Math.round(EX_CX + EX_OUTER_ORBIT_R * Math.cos(angle)),
        y: Math.round(EX_CY + EX_OUTER_ORBIT_R * Math.sin(angle)),
      })
    })
  }

  // Position inner nodes within each bubble on a small orbit.
  const innerPos = new Map<string, { x: number; y: number }>()
  objects.forEach((obj) => {
    if (!obj.subGraph) return
    const bc = bubblePos.get(obj.name)!
    const innerObjs = obj.subGraph.objects
    const m = innerObjs.length
    if (m === 1) {
      innerPos.set(innerObjs[0].name, { x: bc.x, y: bc.y })
    } else {
      innerObjs.forEach((innerObj, j) => {
        const angle = (2 * Math.PI * j / m) - Math.PI / 2
        innerPos.set(innerObj.name, {
          x: Math.round(bc.x + EX_INNER_ORBIT_R * Math.cos(angle)),
          y: Math.round(bc.y + EX_INNER_ORBIT_R * Math.sin(angle)),
        })
      })
    }
  })

  // Combined position resolver: inner nodes first, then bubble centres.
  const resolvePos = (name: string) => innerPos.get(name) ?? bubblePos.get(name)

  // Render bubble outlines (drawn first, as the background layer).
  const bubbleSvg = objects.map((obj, i) => {
    const bc = bubblePos.get(obj.name)!
    const fill = NODE_FILLS[i % NODE_FILLS.length]
    const stroke = NODE_STROKES[i % NODE_STROKES.length]
    if (!obj.subGraph) {
      return `<g class="graph-node">
    <circle cx="${bc.x}" cy="${bc.y}" r="${NODE_R}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <text class="graph-node-label" x="${bc.x}" y="${bc.y}" text-anchor="middle" dominant-baseline="central">${escapeHtml(obj.name)}</text>
  </g>`
    }
    const labelY = bc.y - EX_BUBBLE_R - 8
    return `<g class="graph-bubble">
    <circle cx="${bc.x}" cy="${bc.y}" r="${EX_BUBBLE_R}" fill="${fill}" fill-opacity="0.25" stroke="${stroke}" stroke-width="2" stroke-dasharray="6 3"/>
    <text class="graph-node-label" x="${bc.x}" y="${labelY}" text-anchor="middle" font-size="13" fill="#475569" font-weight="600">${escapeHtml(obj.name)}</text>
  </g>`
  }).join('\n  ')

  // Render arrows internal to each sub-graph.
  const innerArrowsSvg = objects.flatMap((obj) => {
    if (!obj.subGraph) return []
    const { edgeGroups } = buildEdgesAndLegend(
      obj.subGraph.arrows, innerPos, EX_LEGEND_TOP, EX_INNER_NODE_R,
    )
    return [edgeGroups]
  }).join('\n  ')

  // Render cross-boundary (outer) arrows using resolved positions.
  const { markers, edgeGroups: outerEdgeGroups, legendItems } = buildEdgesAndLegend(
    data.arrows, resolvePos, EX_LEGEND_TOP, EX_INNER_NODE_R,
  )

  // Render inner nodes (drawn on top of arrows, inside bubbles).
  const innerNodeSvg = objects.flatMap((obj, i) => {
    if (!obj.subGraph) return []
    return obj.subGraph.objects.map((innerObj, j) => {
      const p = innerPos.get(innerObj.name)
      if (!p) return ''
      const fill = NODE_FILLS[(i + j + 2) % NODE_FILLS.length]
      const stroke = NODE_STROKES[(i + j + 2) % NODE_STROKES.length]
      return `<g class="graph-node">
    <circle cx="${p.x}" cy="${p.y}" r="${EX_INNER_NODE_R}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
    <text class="graph-node-label" x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-size="11">${escapeHtml(innerObj.name)}</text>
  </g>`
    })
  }).join('\n  ')

  return `<svg viewBox="${EX_VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${markers}
  </defs>
  ${bubbleSvg}
  ${innerArrowsSvg}
  ${outerEdgeGroups}
  ${innerNodeSvg}
  <g class="graph-legend">
    ${legendItems}
  </g>
</svg>`
}

// buildEdgesAndLegend groups arrows by label, builds SVG markers, edge paths, and legend.
// posMap can be either a Map or a resolver function.
function buildEdgesAndLegend(
  arrows: ArrowEntry[],
  posMap: Map<string, { x: number; y: number }> | ((name: string) => { x: number; y: number } | undefined),
  legendTop: number,
  nodeR: number,
): { markers: string; edgeGroups: string; legendItems: string } {
  const resolve = typeof posMap === 'function'
    ? posMap
    : (name: string) => (posMap as Map<string, { x: number; y: number }>).get(name)

  const labelGroups = new Map<string | null, ArrowEntry[]>()
  for (const e of arrows) {
    const key = e.label ?? null
    if (!labelGroups.has(key)) labelGroups.set(key, [])
    labelGroups.get(key)!.push(e)
  }

  const labelList = [...labelGroups.keys()]
  const UNLABELED_COLOR = '#94a3b8'

  const pairCounts = new Map<string, number>()
  const pairIndex = new Map<string, number>()
  for (const entries of labelGroups.values()) {
    for (const e of entries) {
      const key = `${e.from}→${e.to}`
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
    }
  }

  const markers = labelList.map((label, li) => {
    const color = label === null ? UNLABELED_COLOR : EDGE_COLORS[li % EDGE_COLORS.length]
    const id = label === null ? 'arrow-unlabeled' : `arrow-${CSS.escape(label)}`
    return `<marker id="${id}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${color}"/>
    </marker>`
  }).join('\n    ')

  const edgeGroups = labelList.map((label, li) => {
    const color = label === null ? UNLABELED_COLOR : EDGE_COLORS[li % EDGE_COLORS.length]
    const markerId = label === null ? 'arrow-unlabeled' : `arrow-${CSS.escape(label)}`
    const entries = labelGroups.get(label)!

    const edges = entries.map((e) => {
      const fromPos = resolve(e.from)
      const toPos = resolve(e.to)
      if (!fromPos || !toPos) return ''

      const key = `${e.from}→${e.to}`
      const total = pairCounts.get(key) ?? 1
      const idx = pairIndex.get(key) ?? 0
      pairIndex.set(key, idx + 1)

      if (e.from === e.to) {
        return selfLoopEdge(fromPos.x, fromPos.y, color, markerId, label, idx, total, nodeR)
      }

      return straightOrCurvedEdge(fromPos, toPos, color, markerId, label, total, idx, nodeR)
    }).join('\n    ')

    const groupLabel = label ?? ''
    return `<g class="arrows-set" data-name="${escapeHtml(groupLabel)}">\n    ${edges}\n  </g>`
  }).join('\n  ')

  const namedLabels = labelList.filter((l): l is string => l !== null)
  const legendItems = namedLabels.map((label, li) => {
    const color = EDGE_COLORS[li % EDGE_COLORS.length]
    const lx = 20 + li * 80
    return `<rect x="${lx}" y="${legendTop}" width="16" height="16" rx="3" fill="${color}"/>
    <text x="${lx + 22}" y="${legendTop + 12}" font-size="13" fill="#475569">${escapeHtml(label)}</text>`
  }).join('\n    ')

  return { markers, edgeGroups, legendItems }
}

function straightOrCurvedEdge(
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  markerId: string,
  label: string | null,
  total: number,
  idx: number,
  nodeR: number,
): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const ux = dx / len
  const uy = dy / len

  const sx = from.x + ux * nodeR
  const sy = from.y + uy * nodeR
  const ex = to.x - ux * (nodeR + 6)
  const ey = to.y - uy * (nodeR + 6)

  // Label midpoint
  const midX = (sx + ex) / 2
  const midY = (sy + ey) / 2

  if (total <= 1) {
    // Single edge: straight line with optional label
    const labelX = Math.round(midX - uy * 12)
    const labelY = Math.round(midY + ux * 12)
    const labelSvg = label
      ? `\n    <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="${color}" font-weight="600">${escapeHtml(label)}</text>`
      : ''
    return `<line stroke="${color}" stroke-width="1.5" x1="${Math.round(sx)}" y1="${Math.round(sy)}" x2="${Math.round(ex)}" y2="${Math.round(ey)}" marker-end="url(#${markerId})"/>${labelSvg}`
  }

  // Multiple edges: offset with quadratic bezier. Alternate above/below.
  const offset = 30 * (idx - (total - 1) / 2)
  const cpx = Math.round(midX - uy * offset)
  const cpy = Math.round(midY + ux * offset)

  // Recalculate endpoint offsets for the curve direction
  const exCurve = Math.round(to.x - ux * (nodeR + 6))
  const eyCurve = Math.round(to.y - uy * (nodeR + 6))
  const labelX = Math.round(cpx - uy * 10)
  const labelY = Math.round(cpy + ux * 10)
  const labelSvg = label
    ? `\n    <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="${color}" font-weight="600">${escapeHtml(label)}</text>`
    : ''

  return `<path stroke="${color}" stroke-width="1.5" fill="none" d="M ${Math.round(sx)} ${Math.round(sy)} Q ${cpx} ${cpy} ${exCurve} ${eyCurve}" marker-end="url(#${markerId})"/>${labelSvg}`
}

function selfLoopEdge(
  cx: number,
  cy: number,
  color: string,
  markerId: string,
  label: string | null,
  idx: number,
  _total: number,
  nodeR: number,
): string {
  // Offset successive self-loops slightly to the side
  const offset = (idx % 3) * 18
  const r = 22
  const x1 = cx - r / 2 + offset
  const y1 = cy - nodeR + 4
  const x2 = cx + r / 2 + offset
  const y2 = cy - nodeR + 4
  const cpx = cx + offset
  const cpy = cy - nodeR - 42
  const labelX = cpx
  const labelY = cpy - 8
  const labelSvg = label
    ? `\n    <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="${color}" font-weight="600">${escapeHtml(label)}</text>`
    : ''
  return `<path stroke="${color}" stroke-width="1.5" fill="none" d="M ${x1} ${y1} C ${cpx - 24} ${cpy}, ${cpx + 24} ${cpy}, ${x2} ${y2}" marker-end="url(#${markerId})"/>${labelSvg}`
}

customElements.define('struo-graph', StruoGraph)
