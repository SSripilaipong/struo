import { escapeHtml } from '../utils.js'

interface ArrowResponse {
  name: string
  label?: string
  from: string
  to: string
}

const NODE_FILLS = ['#e9d5ff', '#bbf7d0']
const NODE_STROKES = ['#c4b5fd', '#86efac']
const EDGE_COLOR = '#8b5cf6'

const NODE_R = 28
const CX = 250
const CY = 250
const VIEWBOX = '0 0 500 300'

class StruoArrow extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['name']
  }

  connectedCallback(): void {
    this.render()
  }

  private async render(): Promise<void> {
    const name = this.getAttribute('name') ?? ''

    let data: ArrowResponse

    try {
      const res = await fetch(`/api/arrow/${encodeURIComponent(name)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json()
    } catch {
      this.innerHTML = `
        <div class="mapping-page">
          <nav class="mapping-nav">
            <a class="back-link" href="/">← collection</a>
          </nav>
          <div class="error-state">Arrow "${escapeHtml(name)}" not found.</div>
        </div>
      `
      return
    }

    const svg = buildArrowSVG(data)

    this.innerHTML = `
      <div class="mapping-page">
        <nav class="mapping-nav">
          <a class="back-link" href="/">← collection</a>
          <h1 class="mapping-title">${escapeHtml(data.name)}</h1>
          <span class="mapping-type-badge">arrow</span>
        </nav>
        <div class="graph-container">${svg}</div>
      </div>
    `
  }
}

function buildArrowSVG(data: ArrowResponse): string {
  const isSelfLoop = data.from === data.to

  const fromPos = { x: 150, y: CY }
  const toPos = { x: 350, y: CY }

  if (isSelfLoop) {
    const cx = CX
    const cy = CY
    const r = 22
    const x1 = cx - r / 2
    const y1 = cy - NODE_R + 4
    const x2 = cx + r / 2
    const y2 = cy - NODE_R + 4
    const cpx = cx
    const cpy = cy - NODE_R - 42
    const labelX = cpx
    const labelY = cpy - 12

    const loopPath = `<path stroke="${EDGE_COLOR}" stroke-width="1.5" fill="none" d="M ${x1} ${y1} C ${cpx - 24} ${cpy}, ${cpx + 24} ${cpy}, ${x2} ${y2}" marker-end="url(#arrow)"/>`
    const labelSvg = data.label
      ? `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="${EDGE_COLOR}" font-weight="600">${escapeHtml(data.label)}</text>`
      : ''
    const nodeSvg = `<g class="graph-node">
      <circle cx="${cx}" cy="${cy}" r="${NODE_R}" fill="${NODE_FILLS[0]}" stroke="${NODE_STROKES[0]}" stroke-width="2"/>
      <text class="graph-node-label" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${escapeHtml(data.from)}</text>
    </g>`

    return `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${EDGE_COLOR}"/>
    </marker>
  </defs>
  ${loopPath}
  ${labelSvg}
  ${nodeSvg}
</svg>`
  }

  const dx = toPos.x - fromPos.x
  const dy = toPos.y - fromPos.y
  const len = Math.sqrt(dx * dx + dy * dy)
  const ux = dx / len
  const uy = dy / len

  const sx = Math.round(fromPos.x + ux * NODE_R)
  const sy = Math.round(fromPos.y + uy * NODE_R)
  const ex = Math.round(toPos.x - ux * (NODE_R + 6))
  const ey = Math.round(toPos.y - uy * (NODE_R + 6))

  const midX = (sx + ex) / 2
  const midY = (sy + ey) / 2
  const labelX = Math.round(midX - uy * 16)
  const labelY = Math.round(midY + ux * 16)

  const edgeSvg = `<line stroke="${EDGE_COLOR}" stroke-width="1.5" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" marker-end="url(#arrow)"/>`
  const labelSvg = data.label
    ? `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="${EDGE_COLOR}" font-weight="600">${escapeHtml(data.label)}</text>`
    : ''

  const nodesSvg = [
    { node: data.from, pos: fromPos, fi: 0 },
    { node: data.to,   pos: toPos,   fi: 1 },
  ].map(({ node, pos, fi }) => `<g class="graph-node">
    <circle cx="${pos.x}" cy="${pos.y}" r="${NODE_R}" fill="${NODE_FILLS[fi]}" stroke="${NODE_STROKES[fi]}" stroke-width="2"/>
    <text class="graph-node-label" x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="central">${escapeHtml(node)}</text>
  </g>`).join('\n  ')

  return `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${EDGE_COLOR}"/>
    </marker>
  </defs>
  ${edgeSvg}
  ${labelSvg}
  ${nodesSvg}
</svg>`
}

customElements.define('struo-arrow', StruoArrow)
