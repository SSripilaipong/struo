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

// forceLayout refines positions using a Fruchterman-Reingold-lite simulation.
// - names: the moveable nodes
// - edges: springs; endpoints may be names (moveable) or keys in pinned (fixed anchors)
// - initialPos: seed positions for moveable nodes
// - xMin/yMin/xMax/yMax: clamping bounds
// - pinned: optional fixed external nodes that exert spring attraction but don't move
// - kFixed: intra-group ideal distance (used as kInner when groups are present)
// - groups: subsets of names that form cohesive groups; inter-group forces use kOuter
//   derived from area/n. The group CoM repels other groups/nodes; cohesion springs
//   pull each member toward its CoM.
function forceLayout(
  names: string[],
  edges: Array<{ from: string; to: string }>,
  initialPos: Map<string, Pos>,
  xMin: number, yMin: number, xMax: number, yMax: number,
  nodeR: number,
  pinned?: Map<string, Pos>,
  kFixed?: number,
  groups?: Array<string[]>,
): Map<string, Pos> {
  const n = names.length
  if (n <= 1) return new Map(initialPos)

  const px = names.map(name => initialPos.get(name)!.x as number)
  const py = names.map(name => initialPos.get(name)!.y as number)
  const nameIdx = new Map(names.map((name, i) => [name, i]))

  const width = xMax - xMin
  const height = yMax - yMin
  // kOuter: inter-group ideal distance, always area-derived
  const kOuter = Math.sqrt((width * height) / n) * 0.9
  // kInner: intra-group ideal distance (kFixed when groups present, else kOuter)
  const kInner = (groups && kFixed !== undefined) ? kFixed : kOuter

  const minDist = nodeR * 2.2
  const pad = nodeR + 4

  let temp = Math.min(width, height) * 0.15

  // Build group membership lookup
  const nodeGroupIdx = new Map<string, number>()
  const groupMemberIndices: number[][] = []
  if (groups) {
    groups.forEach((grp, gi) => {
      const indices: number[] = []
      for (const nm of grp) {
        const i = nameIdx.get(nm)
        if (i !== undefined) { nodeGroupIdx.set(nm, gi); indices.push(i) }
      }
      groupMemberIndices.push(indices)
    })
  }
  const groupOf = (i: number): number => nodeGroupIdx.get(names[i]) ?? -1

  for (let iter = 0; iter < 300; iter++) {
    const ddx_arr = new Float64Array(n)
    const ddy_arr = new Float64Array(n)

    if (!groups) {
      // No groups: standard all-pairs repulsion with kInner (= kOuter)
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let ddx = px[i] - px[j]; let ddy = py[i] - py[j]
          let dist = Math.sqrt(ddx * ddx + ddy * ddy)
          if (dist < 0.01) { ddx = 0.1; ddy = 0.1; dist = 0.14 }
          const rep = (kInner * kInner) / Math.max(dist, minDist)
          const ux = ddx / dist; const uy = ddy / dist
          ddx_arr[i] += ux * rep; ddy_arr[i] += uy * rep
          ddx_arr[j] -= ux * rep; ddy_arr[j] -= uy * rep
        }
      }
    } else {
      // (A) Intra-group node-node repulsion (kInner).
      // The ×4 multiplier counters cross-group springs that get distributed to all group
      // members and would otherwise dominate, preventing inner nodes from spreading apart.
      for (const members of groupMemberIndices) {
        for (let a = 0; a < members.length; a++) {
          for (let b = a + 1; b < members.length; b++) {
            const i = members[a]; const j = members[b]
            let ddx = px[i] - px[j]; let ddy = py[i] - py[j]
            let dist = Math.sqrt(ddx * ddx + ddy * ddy)
            if (dist < 0.01) { ddx = 0.1; ddy = 0.1; dist = 0.14 }
            const rep = (kInner * kInner * 4) / Math.max(dist, minDist)
            const ux = ddx / dist; const uy = ddy / dist
            ddx_arr[i] += ux * rep; ddy_arr[i] += uy * rep
            ddx_arr[j] -= ux * rep; ddy_arr[j] -= uy * rep
          }
        }
      }

      // (B) Super-node CoM repulsion (kOuter)
      // Each group → one super-node at its CoM; each ungrouped node → its own super-node.
      type SuperNode = { x: number; y: number; indices: number[] }
      const superNodes: SuperNode[] = []
      for (const members of groupMemberIndices) {
        if (members.length === 0) continue
        let cx = 0; let cy = 0
        for (const i of members) { cx += px[i]; cy += py[i] }
        superNodes.push({ x: cx / members.length, y: cy / members.length, indices: members })
      }
      for (let i = 0; i < n; i++) {
        if (groupOf(i) < 0) superNodes.push({ x: px[i], y: py[i], indices: [i] })
      }

      const minDistOuter = Math.max(minDist, kOuter * 0.3)
      for (let a = 0; a < superNodes.length; a++) {
        for (let b = a + 1; b < superNodes.length; b++) {
          const sa = superNodes[a]; const sb = superNodes[b]
          let ddx = sa.x - sb.x; let ddy = sa.y - sb.y
          let dist = Math.sqrt(ddx * ddx + ddy * ddy)
          if (dist < 0.01) { ddx = 0.1; ddy = 0.1; dist = 0.14 }
          const rep = (kOuter * kOuter) / Math.max(dist, minDistOuter)
          const ux = ddx / dist; const uy = ddy / dist
          for (const i of sa.indices) { ddx_arr[i] += ux * rep / sa.indices.length; ddy_arr[i] += uy * rep / sa.indices.length }
          for (const j of sb.indices) { ddx_arr[j] -= ux * rep / sb.indices.length; ddy_arr[j] -= uy * rep / sb.indices.length }
        }
      }

      // (C) Cohesion: weak spring toward group CoM, keeping the group from drifting apart
      // without over-compressing it. Factor of 4 gives equilibrium at ~2.5×kInner spacing.
      for (const sn of superNodes) {
        if (sn.indices.length < 2) continue
        for (const i of sn.indices) {
          const ddx = sn.x - px[i]; const ddy = sn.y - py[i]
          const dist = Math.sqrt(ddx * ddx + ddy * ddy)
          if (dist < 0.01) continue
          const att = (dist * dist) / (kInner * 2)
          const ux = ddx / dist; const uy = ddy / dist
          ddx_arr[i] += ux * att; ddy_arr[i] += uy * att
        }
      }
    }

    // Spring attraction along edges
    for (const e of edges) {
      const i = nameIdx.get(e.from)
      const j = nameIdx.get(e.to)
      const fromPinned = pinned?.get(e.from)
      const toPinned = pinned?.get(e.to)
      const fromPos: { x: number; y: number } | undefined =
        i !== undefined ? { x: px[i], y: py[i] } : fromPinned
      const toPos: { x: number; y: number } | undefined =
        j !== undefined ? { x: px[j], y: py[j] } : toPinned
      if (!fromPos || !toPos) continue

      const isPinnedEdge = fromPinned !== undefined || toPinned !== undefined
      const ddx = toPos.x - fromPos.x; const ddy = toPos.y - fromPos.y
      const dist = Math.sqrt(ddx * ddx + ddy * ddy)
      if (dist < 0.01) continue
      const ux = ddx / dist; const uy = ddy / dist

      if (isPinnedEdge) {
        const att = kInner * 0.15
        if (i !== undefined) { ddx_arr[i] += ux * att; ddy_arr[i] += uy * att }
        if (j !== undefined) { ddx_arr[j] -= ux * att; ddy_arr[j] -= uy * att }
      } else if (groups && i !== undefined && j !== undefined) {
        const gi = groupOf(i); const gj = groupOf(j)
        const crossGroup = gi !== gj || gi < 0
        if (crossGroup) {
          // Cross-group: distribute force across all group members so the group moves
          // as a unit toward the other endpoint, preventing individual members from
          // being dragged together by separate edges to the same external node.
          const att = (dist * dist) / kOuter
          const iMembers = gi >= 0 ? groupMemberIndices[gi] : [i]
          const jMembers = gj >= 0 ? groupMemberIndices[gj] : [j]
          for (const m of iMembers) { ddx_arr[m] += ux * att / iMembers.length; ddy_arr[m] += uy * att / iMembers.length }
          for (const m of jMembers) { ddx_arr[m] -= ux * att / jMembers.length; ddy_arr[m] -= uy * att / jMembers.length }
        } else {
          const att = (dist * dist) / kInner
          ddx_arr[i] += ux * att; ddy_arr[i] += uy * att
          ddx_arr[j] -= ux * att; ddy_arr[j] -= uy * att
        }
      } else {
        const att = (dist * dist) / kInner
        if (i !== undefined) { ddx_arr[i] += ux * att; ddy_arr[i] += uy * att }
        if (j !== undefined) { ddx_arr[j] -= ux * att; ddy_arr[j] -= uy * att }
      }
    }

    // Apply displacements clamped to step size and bounds
    for (let i = 0; i < n; i++) {
      const mag = Math.sqrt(ddx_arr[i] * ddx_arr[i] + ddy_arr[i] * ddy_arr[i])
      if (mag > 0.01) {
        const scale = Math.min(mag, temp) / mag
        px[i] = Math.max(xMin + pad, Math.min(xMax - pad, px[i] + ddx_arr[i] * scale))
        py[i] = Math.max(yMin + pad, Math.min(yMax - pad, py[i] + ddy_arr[i] * scale))
      }
    }

    temp *= 0.95
  }

  const result = new Map<string, Pos>()
  names.forEach((name, i) => result.set(name, { x: Math.round(px[i]), y: Math.round(py[i]) }))
  return result
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
  const seed = new Map<string, Pos>()
  placeOnOrbit(objects.map(o => o.name), CX, CY, ORBIT_R, seed)
  const pos = forceLayout(
    objects.map(o => o.name), data.arrows, seed,
    NODE_R + 4, NODE_R + 4, 500 - NODE_R - 4, 480 - NODE_R - 4,
    NODE_R,
  )

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
// Layout uses a single joint force simulation: non-expanded nodes are ungrouped,
// inner nodes of each expanded object form a group. Group CoMs repel each other and
// ungrouped nodes; cohesion springs keep group members together.
function buildInteractiveSVG(data: GraphResponse, expandedNodes: Set<string>): string {
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

  // Seed top-level objects on outer orbit for initial positions.
  const bubbleSeed = new Map<string, Pos>()
  placeOnOrbit(objects.map(o => o.name), EX.CX, EX.CY, EX.OUTER_ORBIT_R, bubbleSeed)

  // Non-expanded nodes enter the simulation as ungrouped.
  for (const obj of objects) {
    if (!expandedNodes.has(obj.name)) {
      allNames.push(obj.name)
      jointInitialPos.set(obj.name, bubbleSeed.get(obj.name)!)
    }
  }

  // Expanded nodes: seed inner nodes around the bubble seed centre using
  // topology-aware angles, then register them as a group.
  for (const obj of objects) {
    if (!obj.subGraph || !expandedNodes.has(obj.name)) continue
    const bc = bubbleSeed.get(obj.name)!
    const innerNames = obj.subGraph.objects.map(o => o.name)
    const innerNodeSet = new Set(innerNames)
    const n = innerNames.length

    const hasExternal = new Set<string>()
    let sumDx = 0, sumDy = 0, extCount = 0
    for (const arrow of data.arrows) {
      const fromInner = innerNodeSet.has(arrow.from)
      const toInner = innerNodeSet.has(arrow.to)
      if (fromInner === toInner) continue
      const extName = fromInner ? arrow.to : arrow.from
      const innerName = fromInner ? arrow.from : arrow.to
      const extParent = innerToParent.get(extName)
      const extPos = extParent === undefined ? bubbleSeed.get(extName) : bubbleSeed.get(extParent)
      if (!extPos) continue
      hasExternal.add(innerName)
      sumDx += extPos.x - bc.x
      sumDy += extPos.y - bc.y
      extCount++
    }
    const sortedNames = [
      ...innerNames.filter(nm => hasExternal.has(nm)),
      ...innerNames.filter(nm => !hasExternal.has(nm)),
    ]
    const nExt = sortedNames.filter(nm => hasExternal.has(nm)).length
    const extAngle = extCount > 0 ? Math.atan2(sumDy / extCount, sumDx / extCount) : Math.PI / 2
    const startAngle = extCount > 0
      ? extAngle - ((nExt - 1) / 2) * (2 * Math.PI / n)
      : -Math.PI / 2

    sortedNames.forEach((nm, idx) => {
      const angle = (2 * Math.PI * idx / n) + startAngle
      jointInitialPos.set(nm, {
        x: Math.round(bc.x + EX.INNER_ORBIT_R * Math.cos(angle)),
        y: Math.round(bc.y + EX.INNER_ORBIT_R * Math.sin(angle)),
      })
    })
    groups.push(innerNames)
    allNames.push(...sortedNames)
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

  // Run the joint simulation. kFixed = INNER_ORBIT_R controls intra-group spacing;
  // kOuter is derived from canvas area / node count for inter-group spacing.
  const jointPos = forceLayout(
    allNames, jointEdges, jointInitialPos,
    EX.INNER_NODE_R + 4, EX.INNER_NODE_R + 4,
    700 - EX.INNER_NODE_R - 4, 720 - EX.INNER_NODE_R - 4,
    EX.INNER_NODE_R,
    undefined,
    EX.INNER_ORBIT_R,
    groups,
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

  const resolver: Resolver = (name) =>
    resolveEndpoint(name, innerToParent, bubblePos, innerPos, expandedNodes)

  // 4. Build inner arrows for each expanded node (scoped markers).
  const innerEdgeResults = objects.map((obj, i) => {
    if (!obj.subGraph || !expandedNodes.has(obj.name)) return { markers: '', edgeGroups: '', legendItems: '' }
    const innerResolver: Resolver = (name) => innerPos.get(name)
    return buildEdgesAndLegend(obj.subGraph.arrows, innerResolver, `i${i}`, EX.LEGEND_TOP, EX.INNER_NODE_R)
  })

  // 5. Build outer/cross-boundary arrows.
  const outerEdgeResult = buildEdgesAndLegend(displayArrows, resolver, 'o', EX.LEGEND_TOP, EX.INNER_NODE_R)

  const allMarkers = [...innerEdgeResults.map(r => r.markers), outerEdgeResult.markers]
    .filter(Boolean).join('\n    ')
  const innerArrowsSvg = innerEdgeResults.map(r => r.edgeGroups).join('\n  ')

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
