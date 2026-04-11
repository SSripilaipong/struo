import { escapeHtml } from '../utils.js'

interface ArrowEntry {
  from: string
  to: string
}

interface GraphResponse {
  name: string
  objects: string[]
  arrows: Record<string, ArrowEntry[]>
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
  const arrowSetNames = Object.keys(data.arrows)

  // Assign circular positions based on the canonical objects list.
  const n = objects.length
  const pos = new Map<string, { x: number; y: number }>()

  if (n === 0) {
    return `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <text x="250" y="250" text-anchor="middle" fill="#94a3b8" font-size="14">empty graph</text>
</svg>`
  }

  if (n === 1) {
    pos.set(objects[0], { x: CX, y: CY })
  } else {
    objects.forEach((obj, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2
      pos.set(obj, {
        x: Math.round(CX + ORBIT_R * Math.cos(angle)),
        y: Math.round(CY + ORBIT_R * Math.sin(angle)),
      })
    })
  }

  // For each (from, to) pair, track how many arrow-sets reference it and which index
  // this set is — used to offset parallel edges with bezier curves.
  const pairCounts = new Map<string, number>()
  const pairIndex = new Map<string, number[]>()

  for (const [, entries] of Object.entries(data.arrows)) {
    for (const e of entries) {
      const key = `${e.from}→${e.to}`
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
    }
  }

  // Build SVG markers (one per arrows-set for colored arrowheads)
  const markers = arrowSetNames.map((setName, si) => {
    const color = EDGE_COLORS[si % EDGE_COLORS.length]
    const id = `arrow-${CSS.escape(setName)}`
    return `<marker id="${id}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${color}"/>
    </marker>`
  }).join('\n    ')

  // Build edge groups per arrows-set
  const edgeGroups = arrowSetNames.map((setName, si) => {
    const color = EDGE_COLORS[si % EDGE_COLORS.length]
    const markerId = `arrow-${CSS.escape(setName)}`
    const entries = data.arrows[setName] ?? []

    const edges = entries.map((e) => {
      const fromPos = pos.get(e.from)
      const toPos = pos.get(e.to)
      if (!fromPos || !toPos) return ''

      const key = `${e.from}→${e.to}`
      const total = pairCounts.get(key) ?? 1
      const idx = pairIndex.get(key)?.length ?? 0
      if (!pairIndex.has(key)) pairIndex.set(key, [])
      pairIndex.get(key)!.push(si)

      if (e.from === e.to) {
        return selfLoopEdge(fromPos.x, fromPos.y, color, markerId, setName, si, total)
      }

      return straightOrCurvedEdge(fromPos, toPos, color, markerId, setName, total, idx)
    }).join('\n    ')

    return `<g class="arrows-set" data-name="${escapeHtml(setName)}">\n    ${edges}\n  </g>`
  }).join('\n  ')

  // Render nodes (on top of edges)
  const nodeSvg = objects.map((obj, i) => {
    const p = pos.get(obj)!
    const fill = NODE_FILLS[i % NODE_FILLS.length]
    const stroke = NODE_STROKES[i % NODE_STROKES.length]
    return `<g class="graph-node">
    <circle cx="${p.x}" cy="${p.y}" r="${NODE_R}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <text class="graph-node-label" x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central">${escapeHtml(obj)}</text>
  </g>`
  }).join('\n  ')

  // Legend
  const legendItems = arrowSetNames.map((setName, si) => {
    const color = EDGE_COLORS[si % EDGE_COLORS.length]
    const lx = 20 + si * 80
    return `<rect x="${lx}" y="${LEGEND_TOP}" width="16" height="16" rx="3" fill="${color}"/>
    <text x="${lx + 22}" y="${LEGEND_TOP + 12}" font-size="13" fill="#475569">${escapeHtml(setName)}</text>`
  }).join('\n    ')

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

function straightOrCurvedEdge(
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  markerId: string,
  setName: string,
  total: number,
  idx: number,
): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const ux = dx / len
  const uy = dy / len

  const sx = from.x + ux * NODE_R
  const sy = from.y + uy * NODE_R
  const ex = to.x - ux * (NODE_R + 6)
  const ey = to.y - uy * (NODE_R + 6)

  // Label midpoint
  const midX = (sx + ex) / 2
  const midY = (sy + ey) / 2

  if (total <= 1) {
    // Single edge: straight line with label
    const labelX = Math.round(midX - uy * 12)
    const labelY = Math.round(midY + ux * 12)
    return `<line stroke="${color}" stroke-width="1.5" x1="${Math.round(sx)}" y1="${Math.round(sy)}" x2="${Math.round(ex)}" y2="${Math.round(ey)}" marker-end="url(#${markerId})"/>
    <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="${color}" font-weight="600">${escapeHtml(setName)}</text>`
  }

  // Multiple edges: offset with quadratic bezier. Alternate above/below.
  const offset = 30 * (idx - (total - 1) / 2)
  const cpx = Math.round(midX - uy * offset)
  const cpy = Math.round(midY + ux * offset)

  // Recalculate endpoint offsets for the curve direction
  const exCurve = Math.round(to.x - ux * (NODE_R + 6))
  const eyCurve = Math.round(to.y - uy * (NODE_R + 6))
  const labelX = Math.round(cpx - uy * 10)
  const labelY = Math.round(cpy + ux * 10)

  return `<path stroke="${color}" stroke-width="1.5" fill="none" d="M ${Math.round(sx)} ${Math.round(sy)} Q ${cpx} ${cpy} ${exCurve} ${eyCurve}" marker-end="url(#${markerId})"/>
    <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="${color}" font-weight="600">${escapeHtml(setName)}</text>`
}

function selfLoopEdge(
  cx: number,
  cy: number,
  color: string,
  markerId: string,
  setName: string,
  idx: number,
  _total: number,
): string {
  // Offset successive self-loops slightly to the side
  const offset = (idx % 3) * 18
  const r = 22
  const x1 = cx - r / 2 + offset
  const y1 = cy - NODE_R + 4
  const x2 = cx + r / 2 + offset
  const y2 = cy - NODE_R + 4
  const cpx = cx + offset
  const cpy = cy - NODE_R - 42
  const labelX = cpx
  const labelY = cpy - 8
  return `<path stroke="${color}" stroke-width="1.5" fill="none" d="M ${x1} ${y1} C ${cpx - 24} ${cpy}, ${cpx + 24} ${cpy}, ${x2} ${y2}" marker-end="url(#${markerId})"/>
    <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="${color}" font-weight="600">${escapeHtml(setName)}</text>`
}

customElements.define('struo-graph', StruoGraph)
