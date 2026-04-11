import { escapeHtml } from '../utils.js'

interface ArrowEntry {
  from: string
  to: string
}

interface ArrowsResponse {
  name: string
  entries: ArrowEntry[]
}

// Pastel node fill palette
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

const NODE_R = 28
const CX = 250
const CY = 250
const ORBIT_R = 155
const VIEWBOX = '0 0 500 500'

class StruoArrows extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['name']
  }

  connectedCallback(): void {
    this.render()
  }

  private async render(): Promise<void> {
    const name = this.getAttribute('name') ?? ''

    let data: ArrowsResponse

    try {
      const res = await fetch(`/api/arrows/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json()
    } catch {
      this.innerHTML = `
        <div class="mapping-page">
          <nav class="mapping-nav">
            <a class="back-link" href="/">← collection</a>
          </nav>
          <div class="error-state">Arrows "${escapeHtml(name)}" not found.</div>
        </div>
      `
      return
    }

    const svg = buildGraph(data.entries)

    this.innerHTML = `
      <div class="mapping-page">
        <nav class="mapping-nav">
          <a class="back-link" href="/">← collection</a>
          <h1 class="mapping-title">${escapeHtml(data.name)}</h1>
          <span class="mapping-type-badge">arrows</span>
        </nav>
        <div class="graph-container">${svg}</div>
      </div>
    `
  }
}

function buildGraph(entries: ArrowEntry[]): string {
  // Collect unique nodes in order of appearance.
  const nodeOrder: string[] = []
  const nodeSet = new Set<string>()
  for (const e of entries) {
    if (!nodeSet.has(e.from)) { nodeSet.add(e.from); nodeOrder.push(e.from) }
    if (!nodeSet.has(e.to))   { nodeSet.add(e.to);   nodeOrder.push(e.to)   }
  }

  // Assign circular positions.
  const n = nodeOrder.length
  const pos = new Map<string, { x: number; y: number }>()

  if (n === 1) {
    pos.set(nodeOrder[0], { x: CX, y: CY })
  } else {
    nodeOrder.forEach((node, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2
      pos.set(node, {
        x: Math.round(CX + ORBIT_R * Math.cos(angle)),
        y: Math.round(CY + ORBIT_R * Math.sin(angle)),
      })
    })
  }

  // Render edges.
  const edgeSvg = entries.map((e) => {
    const from = pos.get(e.from)!
    const to = pos.get(e.to)!

    if (e.from === e.to) {
      return selfLoop(from.x, from.y)
    }

    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.sqrt(dx * dx + dy * dy)
    const ux = dx / len
    const uy = dy / len

    const sx = Math.round(from.x + ux * NODE_R)
    const sy = Math.round(from.y + uy * NODE_R)
    const ex = Math.round(to.x - ux * (NODE_R + 6))
    const ey = Math.round(to.y - uy * (NODE_R + 6))

    return `<line class="graph-edge" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" marker-end="url(#arrow)"/>`
  }).join('\n  ')

  // Render nodes.
  const nodeSvg = nodeOrder.map((node, i) => {
    const { x, y } = pos.get(node)!
    const fill = NODE_FILLS[i % NODE_FILLS.length]
    const stroke = NODE_STROKES[i % NODE_STROKES.length]
    return `
  <g class="graph-node">
    <circle cx="${x}" cy="${y}" r="${NODE_R}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <text class="graph-node-label" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${escapeHtml(node)}</text>
  </g>`
  }).join('')

  return `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#94a3b8"/>
    </marker>
  </defs>
  ${edgeSvg}${nodeSvg}
</svg>`
}

function selfLoop(cx: number, cy: number): string {
  const r = 22
  const x1 = cx - r / 2
  const y1 = cy - NODE_R + 4
  const x2 = cx + r / 2
  const y2 = cy - NODE_R + 4
  const cpx = cx
  const cpy = cy - NODE_R - 42
  return `<path class="graph-edge" d="M ${x1} ${y1} C ${cpx - 24} ${cpy}, ${cpx + 24} ${cpy}, ${x2} ${y2}" marker-end="url(#arrow)"/>`
}

customElements.define('struo-arrows', StruoArrows)
