export type Pos = { x: number; y: number }

/**
 * Read/write context passed to every Force each tick.
 * Forces read px/py and accumulate into ddx/ddy; the loop owns velocity integration.
 */
export interface SimulationState {
  readonly n: number
  readonly names: readonly string[]
  readonly nameToIdx: ReadonlyMap<string, number>
  readonly px: Float64Array
  readonly py: Float64Array
  ddx: Float64Array  // zeroed by loop before each tick
  ddy: Float64Array
  readonly kOuter: number    // sqrt(area / n) * 0.9 — inter-group ideal distance
  readonly kInner: number    // kFixed ?? kOuter — intra-group ideal distance
  readonly minDist: number   // nodeR * 2.2
  readonly nodeR: number
  readonly edges: ReadonlyArray<{ readonly from: string; readonly to: string }>
  readonly pinned: ReadonlyMap<string, { readonly x: number; readonly y: number }>
  readonly groupMemberIndices: ReadonlyArray<ReadonlyArray<number>>
  readonly groupOf: Int32Array  // groupOf[i] = group index, or -1 if ungrouped
  readonly xMin: number
  readonly yMin: number
  readonly xMax: number
  readonly yMax: number
}

export interface Force {
  /** Called once after SimulationState is built, before the loop. Use to pre-filter edges/groups. */
  init?(state: SimulationState): void
  /** Called every tick after ddx/ddy are zeroed. Must only write to state.ddx and state.ddy. */
  apply(state: SimulationState): void
}

export interface ForceGraphConfig {
  nodes: string[]
  edges: Array<{ from: string; to: string }>
  initialPos: Map<string, Pos>
  bounds: { xMin: number; yMin: number; xMax: number; yMax: number }
  nodeR: number
  pinned?: Map<string, Pos>
  kFixed?: number
  groups?: Array<string[]>
  forces: Force[]
  maxIter?: number
}

// ─── Force factories ──────────────────────────────────────────────────────────

/**
 * Intra-group node-node repulsion (×intraGroupFactor) plus super-node CoM repulsion
 * (×superNodeFactor). When no groups are present, falls back to all-pairs repulsion
 * with the ×1 formula.
 *
 * Current-behaviour values: interGroupNodeRepel(4, 1)
 */
export function interGroupNodeRepel(intraGroupFactor: number, superNodeFactor: number): Force {
  return {
    apply(state: SimulationState): void {
      const { px, py, ddx, ddy, n, groupOf, groupMemberIndices, kInner, kOuter, minDist } = state

      if (groupMemberIndices.length === 0) {
        // No groups: standard all-pairs repulsion
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            let dx = px[i] - px[j]; let dy = py[i] - py[j]
            let dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 0.01) { dx = 0.1; dy = 0.1; dist = 0.14 }
            const rep = (kInner * kInner) / Math.max(dist, minDist)
            const ux = dx / dist; const uy = dy / dist
            ddx[i] += ux * rep; ddy[i] += uy * rep
            ddx[j] -= ux * rep; ddy[j] -= uy * rep
          }
        }
        return
      }

      // (A) Intra-group node-node repulsion
      for (const members of groupMemberIndices) {
        for (let a = 0; a < members.length; a++) {
          for (let b = a + 1; b < members.length; b++) {
            const i = members[a]; const j = members[b]
            let dx = px[i] - px[j]; let dy = py[i] - py[j]
            let dist = Math.sqrt(dx * dx + dy * dy)
            if (dist < 0.01) { dx = 0.1; dy = 0.1; dist = 0.14 }
            const rep = (kInner * kInner * intraGroupFactor) / Math.max(dist, minDist)
            const ux = dx / dist; const uy = dy / dist
            ddx[i] += ux * rep; ddy[i] += uy * rep
            ddx[j] -= ux * rep; ddy[j] -= uy * rep
          }
        }
      }

      // (B) Super-node CoM repulsion: each group → one super-node, each ungrouped node → its own
      type SuperNode = { x: number; y: number; indices: number[] }
      const superNodes: SuperNode[] = []
      for (const members of groupMemberIndices) {
        if (members.length === 0) continue
        let cx = 0; let cy = 0
        for (const i of members) { cx += px[i]; cy += py[i] }
        superNodes.push({ x: cx / members.length, y: cy / members.length, indices: [...members] })
      }
      for (let i = 0; i < n; i++) {
        if (groupOf[i] < 0) superNodes.push({ x: px[i], y: py[i], indices: [i] })
      }

      const minDistOuter = Math.max(minDist, kOuter * 0.3)
      for (let a = 0; a < superNodes.length; a++) {
        for (let b = a + 1; b < superNodes.length; b++) {
          const sa = superNodes[a]; const sb = superNodes[b]
          let dx = sa.x - sb.x; let dy = sa.y - sb.y
          let dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 0.01) { dx = 0.1; dy = 0.1; dist = 0.14 }
          const rep = (kOuter * kOuter * superNodeFactor) / Math.max(dist, minDistOuter)
          const ux = dx / dist; const uy = dy / dist
          for (const i of sa.indices) { ddx[i] += ux * rep / sa.indices.length; ddy[i] += uy * rep / sa.indices.length }
          for (const j of sb.indices) { ddx[j] -= ux * rep / sb.indices.length; ddy[j] -= uy * rep / sb.indices.length }
        }
      }
    },
  }
}

/**
 * Cohesion spring pulling each group member toward the group CoM.
 * Formula: att = dist² * strength / kInner
 * Current-behaviour value: groupGravity(0.5)  (equivalent to dist²/(kInner*2))
 */
export function groupGravity(strength: number): Force {
  let memberGroups: ReadonlyArray<ReadonlyArray<number>> = []

  return {
    init(state: SimulationState): void {
      memberGroups = state.groupMemberIndices.filter(g => g.length >= 2)
    },

    apply(state: SimulationState): void {
      const { px, py, ddx, ddy, kInner } = state

      for (const members of memberGroups) {
        let cx = 0.0; let cy = 0.0
        const len = members.length
        for (let m = 0; m < len; m++) { cx += px[members[m]]; cy += py[members[m]] }
        cx /= len; cy /= len

        for (let m = 0; m < len; m++) {
          const i = members[m]
          const dx = cx - px[i]; const dy = cy - py[i]
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 0.01) continue
          const att = (dist * dist) * strength / kInner
          const ux = dx / dist; const uy = dy / dist
          ddx[i] += ux * att; ddy[i] += uy * att
        }
      }
    },
  }
}

/**
 * FR attraction spring on cross-group edges.
 * Formula: att = dist² / kOuter  (no free multiplier in the current implementation)
 * Current-behaviour: interGroupEdgeSpring()
 */
export function interGroupEdgeSpring(): Force {
  let crossGroupEdges: Array<{ i: number; j: number }> = []

  return {
    init(state: SimulationState): void {
      crossGroupEdges = []
      for (const e of state.edges) {
        const i = state.nameToIdx.get(e.from)
        const j = state.nameToIdx.get(e.to)
        if (i === undefined || j === undefined) continue
        if (state.pinned.has(e.from) || state.pinned.has(e.to)) continue
        const gi = state.groupOf[i]; const gj = state.groupOf[j]
        if (gi !== gj || gi < 0) crossGroupEdges.push({ i, j })
      }
    },

    apply(state: SimulationState): void {
      const { px, py, ddx, ddy, kOuter } = state

      for (const { i, j } of crossGroupEdges) {
        const dx = px[j] - px[i]; const dy = py[j] - py[i]
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 0.01) continue
        const att = (dist * dist) / kOuter
        const ux = dx / dist; const uy = dy / dist
        ddx[i] += ux * att; ddy[i] += uy * att
        ddx[j] -= ux * att; ddy[j] -= uy * att
      }
    },
  }
}

/**
 * Spring attraction on intra-group, ungrouped, and pinned edges.
 * - Pinned edges: constant force att = kInner * pinnedStrength
 * - Intra-group / ungrouped edges: att = dist² / kInner  (no free multiplier)
 *
 * Current-behaviour value: intraGroupEdgeSpring(0.15)
 */
export function intraGroupEdgeSpring(pinnedStrength: number): Force {
  type PinnedEdge = {
    i: number | undefined
    j: number | undefined
    pinnedFrom: Pos | undefined  // fixed position if from-node is pinned
    pinnedTo: Pos | undefined    // fixed position if to-node is pinned
  }
  type SpringEdge = { i: number; j: number }
  let pinnedEdges: PinnedEdge[] = []
  let springEdges: SpringEdge[] = []

  return {
    init(state: SimulationState): void {
      pinnedEdges = []
      springEdges = []

      for (const e of state.edges) {
        const i = state.nameToIdx.get(e.from)
        const j = state.nameToIdx.get(e.to)
        const pinnedFrom = state.pinned.get(e.from)
        const pinnedTo = state.pinned.get(e.to)

        if (pinnedFrom !== undefined || pinnedTo !== undefined) {
          pinnedEdges.push({ i, j, pinnedFrom, pinnedTo })
          continue
        }

        if (i === undefined || j === undefined) continue

        // In grouped mode: cross-group edges are handled by interGroupEdgeSpring
        if (state.groupMemberIndices.length > 0) {
          const gi = state.groupOf[i]; const gj = state.groupOf[j]
          if (gi !== gj || gi < 0) continue
        }

        springEdges.push({ i, j })
      }
    },

    apply(state: SimulationState): void {
      const { px, py, ddx, ddy, kInner } = state

      for (const { i, j, pinnedFrom, pinnedTo } of pinnedEdges) {
        const fromPos = pinnedFrom ?? (i !== undefined ? { x: px[i], y: py[i] } : undefined)
        const toPos = pinnedTo ?? (j !== undefined ? { x: px[j], y: py[j] } : undefined)
        if (!fromPos || !toPos) continue
        const dx = toPos.x - fromPos.x; const dy = toPos.y - fromPos.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 0.01) continue
        const att = kInner * pinnedStrength
        const ux = dx / dist; const uy = dy / dist
        if (i !== undefined) { ddx[i] += ux * att; ddy[i] += uy * att }
        if (j !== undefined) { ddx[j] -= ux * att; ddy[j] -= uy * att }
      }

      for (const { i, j } of springEdges) {
        const dx = px[j] - px[i]; const dy = py[j] - py[i]
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 0.01) continue
        const att = (dist * dist) / kInner
        const ux = dx / dist; const uy = dy / dist
        ddx[i] += ux * att; ddy[i] += uy * att
        ddx[j] -= ux * att; ddy[j] -= uy * att
      }
    },
  }
}

// ─── Simulation loop ──────────────────────────────────────────────────────────

export function forceDirectedGraph(config: ForceGraphConfig): Map<string, Pos> {
  const {
    nodes: names, edges, initialPos,
    bounds: { xMin, yMin, xMax, yMax },
    nodeR, pinned = new Map(), kFixed, groups = [],
    forces, maxIter = 3000,
  } = config

  const n = names.length
  if (n <= 1) return new Map(initialPos)

  const width = xMax - xMin
  const height = yMax - yMin

  const px = new Float64Array(names.map(name => initialPos.get(name)!.x))
  const py = new Float64Array(names.map(name => initialPos.get(name)!.y))
  const nameToIdx = new Map(names.map((name, i) => [name, i]))

  const kOuter = Math.sqrt((width * height) / n) * 0.9
  const kInner = (groups.length > 0 && kFixed !== undefined) ? kFixed : kOuter
  const minDist = nodeR * 2.2
  const pad = nodeR + 4

  const groupOf = new Int32Array(n).fill(-1)
  const groupMemberIndices: number[][] = []
  for (let gi = 0; gi < groups.length; gi++) {
    const indices: number[] = []
    for (const name of groups[gi]) {
      const i = nameToIdx.get(name)
      if (i !== undefined) { groupOf[i] = gi; indices.push(i) }
    }
    groupMemberIndices.push(indices)
  }

  const state: SimulationState = {
    n, names, nameToIdx,
    px, py,
    ddx: new Float64Array(n),
    ddy: new Float64Array(n),
    kOuter, kInner, minDist, nodeR,
    edges, pinned,
    groupMemberIndices, groupOf,
    xMin, yMin, xMax, yMax,
  }

  for (const force of forces) force.init?.(state)

  let temp = Math.min(width, height) * 0.15
  const cooling = Math.pow(0.95, 300 / maxIter)

  for (let iter = 0; iter < maxIter; iter++) {
    state.ddx = new Float64Array(n)
    state.ddy = new Float64Array(n)

    for (const force of forces) force.apply(state)

    let maxMove = 0
    for (let i = 0; i < n; i++) {
      const mag = Math.sqrt(state.ddx[i] * state.ddx[i] + state.ddy[i] * state.ddy[i])
      if (mag > 0.01) {
        const scale = Math.min(mag, temp) / mag
        const dx = state.ddx[i] * scale
        const dy = state.ddy[i] * scale
        px[i] = Math.max(xMin + pad, Math.min(xMax - pad, px[i] + dx))
        py[i] = Math.max(yMin + pad, Math.min(yMax - pad, py[i] + dy))
        const moved = Math.sqrt(dx * dx + dy * dy)
        if (moved > maxMove) maxMove = moved
      }
    }

    temp *= cooling
    if (maxMove < temp * 0.05) { console.log(`forceDirectedGraph converged at iter ${iter + 1}, temp=${temp.toFixed(4)}, ratio=${(maxMove / temp).toFixed(4)}`); break }
    if (iter === maxIter - 1) console.log(`forceDirectedGraph hit max iterations, temp=${temp.toFixed(4)}`)
  }

  const result = new Map<string, Pos>()
  names.forEach((name, i) => result.set(name, { x: Math.round(px[i]), y: Math.round(py[i]) }))
  return result
}
