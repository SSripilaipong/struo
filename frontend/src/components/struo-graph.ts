import { escapeHtml } from '../utils.js'
import {
  forceDirectedGraph, roundPositions, alignHorizontal, interGroupNodeRepel, groupGravity, interGroupEdgeSpring, intraGroupEdgeSpring, globalGravity,
  type Pos,
} from './force-simulation.js'

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

// Layout parameters for interactive mode (graph-objects as expandable bubbles).
const EXPANDED = {
  BUBBLE_R: 75,
  INNER_NODE_R: 16,
  INNER_ORBIT_R: 38,
} as const

type Resolver = (name: string) => Pos | undefined

// randomSeed places each name at a uniformly random position within the given bounds.
function randomSeed(
  names: string[], xMin: number, yMin: number, xMax: number, yMax: number,
): Map<string, Pos> {
  const into = new Map<string, Pos>()
  for (const name of names) {
    into.set(name, {
      x: Math.round(xMin + Math.random() * (xMax - xMin)),
      y: Math.round(yMin + Math.random() * (yMax - yMin)),
    })
  }
  return into
}

// centerPositions translates all positions so their bounding-box centre aligns with (cx, cy).
function centerPositions(pos: Map<string, Pos>, cx: number, cy: number): Map<string, Pos> {
  if (pos.size === 0) return pos
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const { x, y } of pos.values()) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const dx = Math.round(cx - (minX + maxX) / 2)
  const dy = Math.round(cy - (minY + maxY) / 2)
  const out = new Map<string, Pos>()
  for (const [name, { x, y }] of pos) out.set(name, { x: x + dx, y: y + dy })
  return out
}


// computeViewBox derives a tight SVG viewBox from the bounding box of node centres + margin.
// minBottom optionally extends the bottom edge (e.g. to include a legend row below the nodes).
// targetRatio, when provided, pads the viewBox symmetrically to match that aspect ratio so the
// SVG content fills the container without letterboxing.
function computeViewBox(pos: Map<string, Pos>, nodeR: number, padding: number, minBottom = -Infinity, targetRatio?: number): { viewBox: string; minX: number; minY: number } {
  if (pos.size === 0) return { viewBox: '0 0 300 200', minX: 0, minY: 0 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const { x, y } of pos.values()) {
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const margin = nodeR + padding
  let vx = Math.floor(minX - margin), vy = Math.floor(minY - margin)
  let vw = Math.ceil(maxX + margin) - vx
  let vh = Math.ceil(Math.max(maxY + margin, minBottom)) - vy
  if (targetRatio !== undefined && targetRatio > 0) {
    if (vw / vh < targetRatio) {
      const newVw = Math.ceil(vh * targetRatio)
      vx -= Math.floor((newVw - vw) / 2)
      vw = newVw
    } else {
      const newVh = Math.ceil(vw / targetRatio)
      vy -= Math.floor((newVh - vh) / 2)
      vh = newVh
    }
  }
  return { viewBox: `${vx} ${vy} ${vw} ${vh}`, minX, minY }
}

// minEnclosingCircle returns the smallest circle containing all given points (Ritter's algorithm).
function minEnclosingCircle(pts: Pos[]): { cx: number; cy: number; r: number } {
  if (pts.length === 0) return { cx: 0, cy: 0, r: 0 }
  if (pts.length === 1) return { cx: pts[0].x, cy: pts[0].y, r: 0 }

  // Find the farthest pair to initialise the diameter.
  let maxD = 0, p1 = pts[0], p2 = pts[1]
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y)
      if (d > maxD) { maxD = d; p1 = pts[i]; p2 = pts[j] }
    }
  }
  let cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2, r = maxD / 2

  // Expand to enclose any point outside the current circle.
  for (const p of pts) {
    const d = Math.hypot(p.x - cx, p.y - cy)
    if (d > r + 0.01) {
      r = (r + d) / 2
      const t = (d - r) / d
      cx += (p.x - cx) * t
      cy += (p.y - cy) * t
    }
  }
  return { cx: Math.round(cx), cy: Math.round(cy), r: Math.ceil(r) }
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
  private prevBubblePos = new Map<string, Pos>()

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

  private _renderSVG(isFinalise = false): void {
    const container = this.querySelector<HTMLElement>('.graph-container')
    if (!container) return
    const { clientWidth: w, clientHeight: h } = container
    if (w === 0 || h === 0) {
      requestAnimationFrame(() => this._renderSVG())
      return
    }
    container.innerHTML = buildGraphSVG(this.cachedData!, this.expandedNodes, this.prevBubblePos, w / h)
    this._attachHandlers()
    // After inserting the SVG the flex container may settle to a different height.
    // One follow-up frame corrects the viewBox without re-running indefinitely.
    if (!isFinalise) {
      requestAnimationFrame(() => {
        const w2 = container.clientWidth, h2 = container.clientHeight
        if (Math.abs(w2 / h2 - w / h) > 0.02) this._renderSVG(true)
      })
    }
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

function buildGraphSVG(data: GraphResponse, expandedNodes: Set<string>, prevBubblePos: Map<string, Pos>, containerRatio: number): string {
  const objects = data.objects
  const n = objects.length

  if (n === 0) {
    return `<svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <text x="150" y="100" text-anchor="middle" fill="#94a3b8" font-size="14">empty graph</text>
</svg>`
  }

  const hasSubGraphs = objects.some(o => o.subGraph != null)
  return hasSubGraphs
    ? buildInteractiveSVG(data, expandedNodes, prevBubblePos, containerRatio)
    : buildFlatSVG(data, containerRatio)
}

// buildFlatSVG renders graphs whose objects are all plain nodes (no sub-graphs).
function buildFlatSVG(data: GraphResponse, containerRatio: number): string {
  const objects = data.objects
  const seed = randomSeed(objects.map(o => o.name), NODE_R + 4, NODE_R + 4, 500 - NODE_R - 4, 480 - NODE_R - 4)
  const pos = roundPositions(
    alignHorizontal(forceDirectedGraph({
      nodes: objects.map(o => o.name), edges: data.arrows, initialPos: seed,
      bounds: { xMin: NODE_R + 4, yMin: NODE_R + 4, xMax: 500 - NODE_R - 4, yMax: 480 - NODE_R - 4 },
      nodeR: NODE_R,
      forces: [interGroupNodeRepel(1, 1), intraGroupEdgeSpring(0.15), globalGravity(0.05)],
    }))
  )

  let legendTop = -Infinity
  for (const { y } of pos.values()) if (y > legendTop) legendTop = y
  legendTop = Math.ceil(legendTop + NODE_R + 20)
  const totalNamedFlat = countNamedLabels(data.arrows)
  const hasLegend = totalNamedFlat > 0

  const { viewBox: probeVB } = computeViewBox(pos, NODE_R, 12, -Infinity, containerRatio)
  const probeVw = Number(probeVB.split(' ')[2])
  const itemsPerRow = Math.max(1, Math.floor(probeVw / 80))
  const legendRows = hasLegend ? Math.ceil(totalNamedFlat / itemsPerRow) : 0
  const legendBottom = hasLegend ? legendTop + legendRows * 28 : -Infinity

  const { viewBox, minX } = computeViewBox(pos, NODE_R, 12, legendBottom, containerRatio)

  const resolve: Resolver = (name) => pos.get(name)
  const { markers, edgeGroups, legendItems } = buildEdgesAndLegend(
    data.arrows, resolve, '', legendTop, minX, NODE_R, 0, itemsPerRow,
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

  return `<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
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
// Layout uses a single joint force simulation: non-expanded nodes are ungrouped,
// inner nodes of each expanded object form a group. Group CoMs repel each other and
// ungrouped nodes; cohesion springs keep group members together.
function buildInteractiveSVG(data: GraphResponse, expandedNodes: Set<string>, prevBubblePos: Map<string, Pos>, containerRatio: number): string {
  const objects = data.objects
  const EX = EXPANDED

  // 1. Map inner node → parent object.
  const innerToParent = buildInnerToParent(data)

  // 2. Compute display arrows with deduplication.
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
        const key = `${outerLabel}|${fromParent}|${toParent}`
        if (!dedupMap.has(key)) {
          dedupMap.set(key, { label: outerLabel, from: fromParent!, to: toParent! })
        }
      } else {
        dedupMap.set(`${arrow.label}|${arrow.from}|${arrow.to}`, arrow)
      }
    } else {
      dedupMap.set(`${arrow.label ?? ''}|${arrow.from}|${arrow.to}`, arrow)
    }
  }
  const displayArrows = [...dedupMap.values()]

  // 3. Build joint simulation.
  // Non-expanded top-level nodes are ungrouped participants.
  // Expanded subgraph inner nodes form a group (their parent is excluded from allNames;
  // its position is computed as the group CoM after simulation).
  const allNames: string[] = []
  const jointInitialPos = new Map<string, Pos>()
  const groups: Array<string[]> = []

  // Seed each top-level object: reuse its last known position if available,
  // otherwise place it randomly (first render only).
  const bubbleSeed = new Map<string, Pos>()
  const xMin = EX.INNER_NODE_R + 4, yMin = EX.INNER_NODE_R + 4
  const xMax = 700 - EX.INNER_NODE_R - 4, yMax = 720 - EX.INNER_NODE_R - 4
  for (const obj of objects) {
    bubbleSeed.set(obj.name, prevBubblePos.get(obj.name) ?? {
      x: Math.round(xMin + Math.random() * (xMax - xMin)),
      y: Math.round(yMin + Math.random() * (yMax - yMin)),
    })
  }

  // Non-expanded nodes enter the simulation as ungrouped.
  for (const obj of objects) {
    if (!expandedNodes.has(obj.name)) {
      allNames.push(obj.name)
      jointInitialPos.set(obj.name, bubbleSeed.get(obj.name)!)
    }
  }

  // Expanded nodes: seed inner nodes tightly around the parent's seed position
  // (which is the previous bubble position if known, else random).
  for (const obj of objects) {
    if (!obj.subGraph || !expandedNodes.has(obj.name)) continue
    const bc = bubbleSeed.get(obj.name)!
    const innerNames = obj.subGraph.objects.map(o => o.name)

    for (const nm of innerNames) {
      jointInitialPos.set(nm, {
        x: Math.round(bc.x + (Math.random() * 2 - 1) * 4),
        y: Math.round(bc.y + (Math.random() * 2 - 1) * 4),
      })
    }
    groups.push(innerNames)
    allNames.push(...innerNames)
  }

  // Resolve an arrow endpoint name to its simulation node name:
  // top-level non-expanded → itself; inner of expanded → itself;
  // inner of collapsed → its parent; expanded top-level → null (not in sim).
  const toSimName = (name: string): string | null => {
    const parent = innerToParent.get(name)
    if (parent === undefined) return expandedNodes.has(name) ? null : name
    return expandedNodes.has(parent) ? name : parent
  }

  // Collect edges (deduplicated) for the joint simulation.
  const jointEdgeSet = new Set<string>()
  const jointEdges: Array<{ from: string; to: string }> = []
  const addJointEdge = (from: string, to: string) => {
    const key = `${from}→${to}`
    if (!jointEdgeSet.has(key)) { jointEdgeSet.add(key); jointEdges.push({ from, to }) }
  }

  // Inner subgraph edges for expanded objects.
  for (const obj of objects) {
    if (!obj.subGraph || !expandedNodes.has(obj.name)) continue
    for (const arrow of obj.subGraph.arrows) addJointEdge(arrow.from, arrow.to)
  }

  // All data arrows (outer and cross-boundary), resolved to simulation names.
  for (const arrow of data.arrows) {
    const from = toSimName(arrow.from)
    const to = toSimName(arrow.to)
    if (!from || !to || from === to) continue
    // Skip intra-group edges already added above.
    const fParent = innerToParent.get(arrow.from)
    const tParent = innerToParent.get(arrow.to)
    if (fParent && tParent && fParent === tParent && expandedNodes.has(fParent)) continue
    addJointEdge(from, to)
  }

  const jointPos = roundPositions(
    alignHorizontal(forceDirectedGraph({
      nodes: allNames, edges: jointEdges, initialPos: jointInitialPos,
      bounds: { xMin: EX.INNER_NODE_R + 4, yMin: EX.INNER_NODE_R + 4, xMax: 700 - EX.INNER_NODE_R - 4, yMax: 720 - EX.INNER_NODE_R - 4 },
      nodeR: EX.INNER_NODE_R,
      kFixed: EX.INNER_ORBIT_R, groups,
      forces: [
        interGroupNodeRepel(4, 1),
        groupGravity(0.5),
        interGroupEdgeSpring(),
        intraGroupEdgeSpring(0.15),
        globalGravity(0.05),
      ],
    }))
  )

  // Extract bubble and inner positions from joint result.
  const bubblePos = new Map<string, Pos>()
  const innerPos = new Map<string, Pos>()

  for (const obj of objects) {
    if (!expandedNodes.has(obj.name)) {
      bubblePos.set(obj.name, jointPos.get(obj.name)!)
    } else if (obj.subGraph) {
      // Expanded: bubble centre = CoM of settled inner nodes.
      const innerNames = obj.subGraph.objects.map(o => o.name)
      let cx = 0, cy = 0
      for (const nm of innerNames) {
        const p = jointPos.get(nm)!
        innerPos.set(nm, p)
        cx += p.x; cy += p.y
      }
      bubblePos.set(obj.name, { x: Math.round(cx / innerNames.length), y: Math.round(cy / innerNames.length) })
    }
  }

  // Bubble circle = minimum enclosing circle of settled inner nodes + padding.
  const bubbleCircles = new Map<string, { cx: number; cy: number; r: number }>()
  for (const obj of objects) {
    if (obj.subGraph && expandedNodes.has(obj.name)) {
      const pts = obj.subGraph.objects.map(o => innerPos.get(o.name)!)
      const enc = minEnclosingCircle(pts)
      bubbleCircles.set(obj.name, { cx: enc.cx, cy: enc.cy, r: enc.r + EX.INNER_NODE_R + 12 })
    }
  }

  // Build boundary positions using actual visual edge points for all objects.
  // Expanded bubbles use their computed circle radius; collapsed nodes use their
  // visual radius (NODE_R + 9 for the dashed ring, NODE_R for plain nodes).
  const boundaryPos = new Map<string, Pos>()
  for (const obj of objects) {
    let cx: number, cy: number, r: number
    if (expandedNodes.has(obj.name) && bubbleCircles.has(obj.name)) {
      const b = bubbleCircles.get(obj.name)!
      cx = b.cx; cy = b.cy; r = b.r
    } else {
      const bc = bubblePos.get(obj.name)!
      cx = bc.x; cy = bc.y
      r = obj.subGraph ? NODE_R + 9 : NODE_R
    }
    boundaryPos.set(`${obj.name}__N`, { x: cx, y: cy - r })
    boundaryPos.set(`${obj.name}__S`, { x: cx, y: cy + r })
    boundaryPos.set(`${obj.name}__E`, { x: cx + r, y: cy })
    boundaryPos.set(`${obj.name}__W`, { x: cx - r, y: cy })
  }
  // boundaryPos edge points already represent visual extents; nodeR=0 in computeViewBox.
  let legendTop = -Infinity
  for (const { y } of boundaryPos.values()) if (y > legendTop) legendTop = y
  legendTop = Math.ceil(legendTop + 16)
  const innerNamedCount = objects.reduce((sum, obj) =>
    obj.subGraph && expandedNodes.has(obj.name) ? sum + countNamedLabels(obj.subGraph.arrows) : sum, 0)
  const totalNamedInteractive = innerNamedCount + countNamedLabels(displayArrows)
  const hasLegend = totalNamedInteractive > 0

  const { viewBox: probeVB } = computeViewBox(boundaryPos, 0, 20, -Infinity, containerRatio)
  const probeVw = Number(probeVB.split(' ')[2])
  const itemsPerRow = Math.max(1, Math.floor(probeVw / 80))
  const legendRows = hasLegend ? Math.ceil(totalNamedInteractive / itemsPerRow) : 0
  const legendBottom = hasLegend ? legendTop + legendRows * 28 : -Infinity

  const { viewBox, minX } = computeViewBox(boundaryPos, 0, 20, legendBottom, containerRatio)

  // Persist bubble positions so the next render can use them as stable seeds.
  for (const [name, pos] of bubblePos) prevBubblePos.set(name, pos)

  const resolver: Resolver = (name) =>
    resolveEndpoint(name, innerToParent, bubblePos, innerPos, expandedNodes)

  // 4. Build inner arrows for each expanded node (scoped markers).
  let colorOffset = 0
  const innerEdgeResults = objects.map((obj, i) => {
    if (!obj.subGraph || !expandedNodes.has(obj.name)) return { markers: '', edgeGroups: '', legendItems: '' }
    const innerResolver: Resolver = (name) => innerPos.get(name)
    const result = buildEdgesAndLegend(obj.subGraph.arrows, innerResolver, `i${i}`, legendTop, minX, EX.INNER_NODE_R, colorOffset, itemsPerRow)
    colorOffset += countNamedLabels(obj.subGraph.arrows)
    return result
  })

  // 5. Build outer/cross-boundary arrows.
  const outerEdgeResult = buildEdgesAndLegend(displayArrows, resolver, 'o', legendTop, minX, EX.INNER_NODE_R, colorOffset, itemsPerRow)

  const allMarkers = [...innerEdgeResults.map(r => r.markers), outerEdgeResult.markers]
    .filter(Boolean).join('\n    ')
  const innerArrowsSvg = innerEdgeResults.map(r => r.edgeGroups).join('\n  ')
  const allLegendItems = [...innerEdgeResults.map(r => r.legendItems), outerEdgeResult.legendItems]
    .filter(Boolean).join('\n    ')

  // 6. Render object circles/bubbles.
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

    // Expanded bubble: circle wraps around the settled inner nodes.
    const bcirc = bubbleCircles.get(obj.name)!
    const labelY = bcirc.cy - bcirc.r - 8
    return `<g class="graph-bubble" data-toggle-node="${escapeHtml(obj.name)}" style="cursor:pointer">
    <circle cx="${bcirc.cx}" cy="${bcirc.cy}" r="${bcirc.r}" fill="${fill}" fill-opacity="0.25" stroke="${stroke}" stroke-width="2" stroke-dasharray="6 3"/>
    <text class="graph-node-label" x="${bcirc.cx}" y="${labelY}" text-anchor="middle" font-size="13" fill="#475569" font-weight="600">${escapeHtml(obj.name)}</text>
  </g>`
  }).join('\n  ')

  // 7. Render inner nodes for expanded objects (drawn above arrows).
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

  return `<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${allMarkers}
  </defs>
  ${objectsSvg}
  ${innerArrowsSvg}
  ${innerNodeSvg}
  ${outerEdgeResult.edgeGroups}
  <g class="graph-legend">
    ${allLegendItems}
  </g>
</svg>`
}

function countNamedLabels(arrows: ArrowEntry[]): number {
  const seen = new Set<string>()
  for (const e of arrows) { if (e.label) seen.add(e.label) }
  return seen.size
}

// buildEdgesAndLegend groups arrows by label, builds SVG markers, edge paths, and legend.
// markerScope prefixes marker IDs to avoid collisions when multiple calls share one SVG.
// colorOffset shifts the color palette index so multiple calls don't reuse the same colors.
function buildEdgesAndLegend(
  arrows: ArrowEntry[],
  resolve: Resolver,
  markerScope: string,
  legendTop: number,
  legendX: number,
  nodeR: number,
  colorOffset: number = 0,
  itemsPerRow: number = Infinity,
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
    const color = label === null ? UNLABELED_COLOR : EDGE_COLORS[(colorOffset + li) % EDGE_COLORS.length]
    const id = `${scopePrefix}a${li}`
    return `<marker id="${id}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="${color}"/>
    </marker>`
  }).join('\n    ')

  const edgeGroups = labelList.map((label, li) => {
    const color = label === null ? UNLABELED_COLOR : EDGE_COLORS[(colorOffset + li) % EDGE_COLORS.length]
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
    const globalIndex = colorOffset + li
    const color = EDGE_COLORS[globalIndex % EDGE_COLORS.length]
    const col = globalIndex % itemsPerRow
    const row = Math.floor(globalIndex / itemsPerRow)
    const lx = legendX + col * 80
    const ly = legendTop + row * 28
    return `<rect x="${lx}" y="${ly}" width="16" height="16" rx="3" fill="${color}"/>
    <text x="${lx + 22}" y="${ly + 12}" font-size="13" fill="#475569">${escapeHtml(label)}</text>`
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

  // Base start/end points on the node circumferences (used for single edge)
  const sx0 = from.x + ux * nodeR
  const sy0 = from.y + uy * nodeR
  const ex0 = to.x - ux * (nodeR + 6)
  const ey0 = to.y - uy * (nodeR + 6)

  // Label midpoint (for single edge)
  const midX = (sx0 + ex0) / 2
  const midY = (sy0 + ey0) / 2

  if (total <= 1) {
    // Single edge: straight line with optional label
    const labelX = Math.round(midX - uy * 12)
    const labelY = Math.round(midY + ux * 12)
    const labelSvg = label
      ? `\n    <text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="${color}" font-weight="600">${escapeHtml(label)}</text>`
      : ''
    return `<line stroke="${color}" stroke-width="1.5" x1="${Math.round(sx0)}" y1="${Math.round(sy0)}" x2="${Math.round(ex0)}" y2="${Math.round(ey0)}" marker-end="url(#${markerId})"/>${labelSvg}`
  }

  // Multiple parallel edges: offset start, control point, and end perpendicularly so
  // arrows fan out at both endpoints instead of converging on the same point.
  const spread = 40 * (idx - (total - 1) / 2)
  // Perpendicular unit vector: (-uy, ux)
  const sx = Math.round(sx0 - uy * spread * 0.4)
  const sy = Math.round(sy0 + ux * spread * 0.4)
  const exCurve = Math.round(ex0 - uy * spread * 0.4)
  const eyCurve = Math.round(ey0 + ux * spread * 0.4)
  const cpMidX = (sx + exCurve) / 2
  const cpMidY = (sy + eyCurve) / 2
  const cpx = Math.round(cpMidX - uy * spread * 0.8)
  const cpy = Math.round(cpMidY + ux * spread * 0.8)
  const labelX = Math.round(cpx - uy * 14)
  const labelY = Math.round(cpy + ux * 14)
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
