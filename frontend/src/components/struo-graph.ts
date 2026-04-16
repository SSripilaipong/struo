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

// Layout parameters for interactive mode (graph-objects as expandable bubbles).
const EXPANDED = {
  CX: 350, CY: 320,
  OUTER_ORBIT_R: 200,
  BUBBLE_R: 75,
  INNER_NODE_R: 16,
  INNER_ORBIT_R: 38,
  LEGEND_TOP: 650,
  VIEWBOX: '0 0 700 720',
} as const

type Pos = { x: number; y: number }
type Resolver = (name: string) => Pos | undefined

// placeOnOrbit distributes n items evenly on a circle and populates a Map with their positions.
// Single items are placed at the centre.
function placeOnOrbit(
  names: string[], cx: number, cy: number, orbitR: number,
  into: Map<string, Pos>,
): void {
  const n = names.length
  if (n === 1) {
    into.set(names[0], { x: cx, y: cy })
  } else {
    names.forEach((name, i) => {
      const angle = (2 * Math.PI * i / n) - Math.PI / 2
      into.set(name, {
        x: Math.round(cx + orbitR * Math.cos(angle)),
        y: Math.round(cy + orbitR * Math.sin(angle)),
      })
    })
  }
}

// buildInnerToParent maps each inner node name to the top-level graph-object that contains it.
function buildInnerToParent(data: GraphResponse): Map<string, string> {
  const map = new Map<string, string>()
  for (const obj of data.objects) {
    if (obj.subGraph) {
      for (const inner of obj.subGraph.objects) {
        map.set(inner.name, obj.name)
      }
    }
  }
  return map
}

// resolveEndpoint returns the pixel position for an arrow endpoint.
// Inner nodes of expanded objects use their inner position; collapsed → bubble centre; top-level → bubble centre.
function resolveEndpoint(
  name: string,
  innerToParent: Map<string, string>,
  bubblePos: Map<string, Pos>,
  innerPos: Map<string, Pos>,
  expandedNodes: Set<string>,
): Pos | undefined {
  const parent = innerToParent.get(name)
  if (parent === undefined) return bubblePos.get(name)
  if (expandedNodes.has(parent)) return innerPos.get(name)
  return bubblePos.get(parent)
}

class StruoGraph extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['name']
  }

  private cachedData: GraphResponse | null = null
  private expandedNodes = new Set<string>()

  connectedCallback(): void {
    this.render()
  }

  private async render(): Promise<void> {
    const name = this.getAttribute('name') ?? ''

    if (!this.cachedData) {
      try {
        const res = await fetch(`/api/graph/${encodeURIComponent(name)}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        this.cachedData = await res.json()
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
      this.innerHTML = `
        <div class="mapping-page">
          <nav class="mapping-nav">
            <a class="back-link" href="/">← collection</a>
            <h1 class="mapping-title">${escapeHtml(this.cachedData!.name)}</h1>
            <span class="mapping-type-badge">graph</span>
          </nav>
          <div class="graph-container"></div>
        </div>
      `
    }

    this._renderSVG()
  }

  private _renderSVG(): void {
    const svg = buildGraphSVG(this.cachedData!, this.expandedNodes)
    this.querySelector('.graph-container')!.innerHTML = svg
    this._attachHandlers()
  }

  private _attachHandlers(): void {
    this.querySelectorAll<HTMLElement>('[data-toggle-node]').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.dataset.toggleNode!
        this.expandedNodes.has(name) ? this.expandedNodes.delete(name) : this.expandedNodes.add(name)
        this._renderSVG()
      })
    })
  }
}

function buildGraphSVG(data: GraphResponse, expandedNodes: Set<string>): string {
  const objects = data.objects
  const n = objects.length

  if (n === 0) {
    return `<svg viewBox="${VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <text x="250" y="250" text-anchor="middle" fill="#94a3b8" font-size="14">empty graph</text>
</svg>`
  }

  const hasSubGraphs = objects.some(o => o.subGraph != null)
  return hasSubGraphs
    ? buildInteractiveSVG(data, expandedNodes)
    : buildFlatSVG(data)
}

// buildFlatSVG renders graphs whose objects are all plain nodes (no sub-graphs).
function buildFlatSVG(data: GraphResponse): string {
  const objects = data.objects
  const pos = new Map<string, Pos>()
  placeOnOrbit(objects.map(o => o.name), CX, CY, ORBIT_R, pos)

  const resolve: Resolver = (name) => pos.get(name)
  const { markers, edgeGroups, legendItems } = buildEdgesAndLegend(
    data.arrows, resolve, '', LEGEND_TOP, NODE_R,
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

// buildInteractiveSVG renders graphs that have graph-objects (sub-graphs as expandable bubbles).
// Nodes with subGraphs are collapsed by default and expand on click.
// Arrows auto-deduplicate or expand based on which nodes are expanded.
function buildInteractiveSVG(data: GraphResponse, expandedNodes: Set<string>): string {
  const objects = data.objects
  const EX = EXPANDED

  // 1. Position bubble centres for all top-level objects.
  const bubblePos = new Map<string, Pos>()
  placeOnOrbit(objects.map(o => o.name), EX.CX, EX.CY, EX.OUTER_ORBIT_R, bubblePos)

  // 2. Position inner nodes for expanded objects.
  const innerPos = new Map<string, Pos>()
  objects.forEach(obj => {
    if (!obj.subGraph || !expandedNodes.has(obj.name)) return
    const bc = bubblePos.get(obj.name)!
    placeOnOrbit(obj.subGraph.objects.map(o => o.name), bc.x, bc.y, EX.INNER_ORBIT_R, innerPos)
  })

  // 3. Map inner node → parent object.
  const innerToParent = buildInnerToParent(data)
  const resolver: Resolver = (name) =>
    resolveEndpoint(name, innerToParent, bubblePos, innerPos, expandedNodes)

  // 4. Compute display arrows with deduplication.
  // Compound arrows (label contains '::') where both endpoints are collapsed
  // are collapsed into a single outer arrow (e.g. 'f::u' + 'f::v' → 'f: g→h').
  const dedupMap = new Map<string, ArrowEntry>()
  for (const arrow of data.arrows) {
    const sepIdx = arrow.label?.indexOf('::') ?? -1
    if (sepIdx >= 0 && arrow.label) {
      const outerLabel = arrow.label.slice(0, sepIdx)
      const fromParent = innerToParent.get(arrow.from)
      const toParent = innerToParent.get(arrow.to)
      const fromCollapsed = fromParent !== undefined && !expandedNodes.has(fromParent)
      const toCollapsed = toParent !== undefined && !expandedNodes.has(toParent)
      if (fromCollapsed && toCollapsed) {
        // Both sides collapsed → synthetic single outer arrow (deduplicated by key).
        const key = `${outerLabel}|${fromParent}|${toParent}`
        if (!dedupMap.has(key)) {
          dedupMap.set(key, { label: outerLabel, from: fromParent!, to: toParent! })
        }
      } else {
        // At least one side expanded → show individual compound arrow.
        dedupMap.set(`${arrow.label}|${arrow.from}|${arrow.to}`, arrow)
      }
    } else {
      // Non-compound arrow: always shown as-is.
      dedupMap.set(`${arrow.label ?? ''}|${arrow.from}|${arrow.to}`, arrow)
    }
  }
  const displayArrows = [...dedupMap.values()]

  // 5. Build inner arrows for each expanded node (scoped markers).
  const innerEdgeResults = objects.map((obj, i) => {
    if (!obj.subGraph || !expandedNodes.has(obj.name)) return { markers: '', edgeGroups: '', legendItems: '' }
    const innerResolver: Resolver = (name) => innerPos.get(name)
    return buildEdgesAndLegend(obj.subGraph.arrows, innerResolver, `i${i}`, EX.LEGEND_TOP, EX.INNER_NODE_R)
  })

  // 6. Build outer/cross-boundary arrows.
  const outerEdgeResult = buildEdgesAndLegend(displayArrows, resolver, 'o', EX.LEGEND_TOP, EX.INNER_NODE_R)

  const allMarkers = [...innerEdgeResults.map(r => r.markers), outerEdgeResult.markers]
    .filter(Boolean).join('\n    ')
  const innerArrowsSvg = innerEdgeResults.map(r => r.edgeGroups).join('\n  ')

  // 7. Render object circles/bubbles.
  const objectsSvg = objects.map((obj, i) => {
    const bc = bubblePos.get(obj.name)!
    const fill = NODE_FILLS[i % NODE_FILLS.length]
    const stroke = NODE_STROKES[i % NODE_STROKES.length]

    if (!obj.subGraph) {
      return `<g class="graph-node">
    <circle cx="${bc.x}" cy="${bc.y}" r="${NODE_R}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <text class="graph-node-label" x="${bc.x}" y="${bc.y}" text-anchor="middle" dominant-baseline="central">${escapeHtml(obj.name)}</text>
  </g>`
    }

    if (!expandedNodes.has(obj.name)) {
      // Collapsed expandable node: subtle outer dashed ring hints at expandability.
      return `<g class="graph-node" data-toggle-node="${escapeHtml(obj.name)}" style="cursor:pointer">
    <circle cx="${bc.x}" cy="${bc.y}" r="${NODE_R + 9}" fill="none" stroke="${stroke}" stroke-width="1" stroke-dasharray="3 2" opacity="0.5"/>
    <circle cx="${bc.x}" cy="${bc.y}" r="${NODE_R}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    <text class="graph-node-label" x="${bc.x}" y="${bc.y}" text-anchor="middle" dominant-baseline="central">${escapeHtml(obj.name)}</text>
  </g>`
    }

    // Expanded bubble.
    const labelY = bc.y - EX.BUBBLE_R - 8
    return `<g class="graph-bubble" data-toggle-node="${escapeHtml(obj.name)}" style="cursor:pointer">
    <circle cx="${bc.x}" cy="${bc.y}" r="${EX.BUBBLE_R}" fill="${fill}" fill-opacity="0.25" stroke="${stroke}" stroke-width="2" stroke-dasharray="6 3"/>
    <text class="graph-node-label" x="${bc.x}" y="${labelY}" text-anchor="middle" font-size="13" fill="#475569" font-weight="600">${escapeHtml(obj.name)}</text>
  </g>`
  }).join('\n  ')

  // 8. Render inner nodes for expanded objects (drawn above arrows).
  const innerNodeSvg = objects.flatMap((obj, i) => {
    if (!obj.subGraph || !expandedNodes.has(obj.name)) return []
    return obj.subGraph.objects.map((innerObj, j) => {
      const p = innerPos.get(innerObj.name)
      if (!p) return ''
      const fill = NODE_FILLS[(i + j + 2) % NODE_FILLS.length]
      const stroke = NODE_STROKES[(i + j + 2) % NODE_STROKES.length]
      return `<g class="graph-node">
    <circle cx="${p.x}" cy="${p.y}" r="${EX.INNER_NODE_R}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
    <text class="graph-node-label" x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central" font-size="11">${escapeHtml(innerObj.name)}</text>
  </g>`
    })
  }).join('\n  ')

  return `<svg viewBox="${EX.VIEWBOX}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${allMarkers}
  </defs>
  ${objectsSvg}
  ${innerArrowsSvg}
  ${innerNodeSvg}
  ${outerEdgeResult.edgeGroups}
  <g class="graph-legend">
    ${outerEdgeResult.legendItems}
  </g>
</svg>`
}

// buildEdgesAndLegend groups arrows by label, builds SVG markers, edge paths, and legend.
// markerScope prefixes marker IDs to avoid collisions when multiple calls share one SVG.
function buildEdgesAndLegend(
  arrows: ArrowEntry[],
  resolve: Resolver,
  markerScope: string,
  legendTop: number,
  nodeR: number,
): { markers: string; edgeGroups: string; legendItems: string } {
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

  const scopePrefix = markerScope ? `${markerScope}-` : ''
  const markers = labelList.map((label, li) => {
    const color = label === null ? UNLABELED_COLOR : EDGE_COLORS[li % EDGE_COLORS.length]
    const id = `${scopePrefix}a${li}`
    return `<marker id="${id}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${color}"/>
    </marker>`
  }).join('\n    ')

  const edgeGroups = labelList.map((label, li) => {
    const color = label === null ? UNLABELED_COLOR : EDGE_COLORS[li % EDGE_COLORS.length]
    const markerId = `${scopePrefix}a${li}`
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
