import {
  SPATIAL_INDEX, bounds as toBounds,
  intersects, contains, distanceToPoint
} from '@gridworkjs/core'

/**
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Bounds
 * @typedef {{ x: number, y: number }} Point
 * @typedef {(item: T) => Bounds} Accessor
 * @template T
 */

/**
 * @typedef {object} QuadtreeOptions
 * @property {Bounds} [bounds] - fixed world bounds (auto-grows if omitted)
 * @property {number} [maxItems=16] - items per node before splitting
 * @property {number} [maxDepth=8] - maximum tree depth
 */

/**
 * @typedef {object} SpatialIndex
 * @property {true} [SPATIAL_INDEX]
 * @property {number} size
 * @property {Bounds | null} bounds
 * @property {(item: any) => void} insert
 * @property {(item: any) => boolean} remove
 * @property {(query: Bounds | object) => any[]} search
 * @property {(point: Point, k?: number) => any[]} nearest
 * @property {() => void} clear
 */

function createNode(bounds) {
  return { bounds, items: [], children: null }
}

function childBounds(bounds) {
  const midX = (bounds.minX + bounds.maxX) / 2
  const midY = (bounds.minY + bounds.maxY) / 2
  return [
    { minX: bounds.minX, minY: bounds.minY, maxX: midX, maxY: midY },
    { minX: midX, minY: bounds.minY, maxX: bounds.maxX, maxY: midY },
    { minX: bounds.minX, minY: midY, maxX: midX, maxY: bounds.maxY },
    { minX: midX, minY: midY, maxX: bounds.maxX, maxY: bounds.maxY }
  ]
}

function split(node, maxItems, maxDepth, depth) {
  const quads = childBounds(node.bounds)
  node.children = quads.map(b => createNode(b))

  const kept = []
  for (const entry of node.items) {
    if (!pushDown(node.children, entry, maxItems, maxDepth, depth + 1)) {
      kept.push(entry)
    }
  }
  node.items = kept
}

function pushDown(children, entry, maxItems, maxDepth, depth) {
  for (const child of children) {
    if (contains(child.bounds, entry.bounds)) {
      insertEntry(child, entry, maxItems, maxDepth, depth)
      return true
    }
  }
  return false
}

function insertEntry(node, entry, maxItems, maxDepth, depth) {
  if (node.children) {
    if (!pushDown(node.children, entry, maxItems, maxDepth, depth + 1)) {
      node.items.push(entry)
    }
    return
  }

  node.items.push(entry)

  if (node.items.length > maxItems && depth < maxDepth) {
    split(node, maxItems, maxDepth, depth)
  }
}

function searchNode(node, query, results) {
  if (!intersects(node.bounds, query)) return

  for (const entry of node.items) {
    if (intersects(entry.bounds, query)) {
      results.push(entry.item)
    }
  }

  if (node.children) {
    for (const child of node.children) {
      searchNode(child, query, results)
    }
  }
}

function removeEntry(node, item, itemBounds) {
  const idx = node.items.findIndex(e => e.item === item)
  if (idx !== -1) {
    node.items.splice(idx, 1)
    return true
  }

  if (node.children) {
    for (const child of node.children) {
      if (intersects(child.bounds, itemBounds)) {
        if (removeEntry(child, item, itemBounds)) {
          tryCollapse(node)
          return true
        }
      }
    }
  }

  return false
}

function tryCollapse(node) {
  if (!node.children) return
  let total = node.items.length
  for (const child of node.children) {
    if (child.children) return
    total += child.items.length
  }
  if (total === 0) {
    node.children = null
  }
}

function growToContain(root, target) {
  while (!contains(root.bounds, target)) {
    const { minX, minY, maxX, maxY } = root.bounds
    const w = Math.max(maxX - minX, 1)
    const h = Math.max(maxY - minY, 1)

    const tcx = (target.minX + target.maxX) / 2
    const rcx = (minX + maxX) / 2
    const tcy = (target.minY + target.maxY) / 2
    const rcy = (minY + maxY) / 2

    let newBounds, quadrant

    if (tcx < rcx && tcy < rcy) {
      newBounds = { minX: minX - w, minY: minY - h, maxX, maxY }
      quadrant = 3
    } else if (tcx >= rcx && tcy < rcy) {
      newBounds = { minX, minY: minY - h, maxX: maxX + w, maxY }
      quadrant = 2
    } else if (tcx < rcx && tcy >= rcy) {
      newBounds = { minX: minX - w, minY, maxX, maxY: maxY + h }
      quadrant = 1
    } else {
      newBounds = { minX, minY, maxX: maxX + w, maxY: maxY + h }
      quadrant = 0
    }

    const newRoot = createNode(newBounds)
    const quads = childBounds(newBounds)
    newRoot.children = quads.map((b, i) => i === quadrant ? root : createNode(b))
    root = newRoot
  }
  return root
}

function normalizeBounds(input) {
  if (input != null && typeof input === 'object' &&
      'minX' in input && 'minY' in input && 'maxX' in input && 'maxY' in input) {
    return input
  }
  return toBounds(input)
}

function heapPush(heap, entry) {
  heap.push(entry)
  let i = heap.length - 1
  while (i > 0) {
    const p = (i - 1) >> 1
    if (heap[p].dist <= heap[i].dist) break
    ;[heap[p], heap[i]] = [heap[i], heap[p]]
    i = p
  }
}

function heapPop(heap) {
  const top = heap[0]
  const last = heap.pop()
  if (heap.length > 0) {
    heap[0] = last
    let i = 0
    for (;;) {
      let s = i
      const l = 2 * i + 1
      const r = 2 * i + 2
      if (l < heap.length && heap[l].dist < heap[s].dist) s = l
      if (r < heap.length && heap[r].dist < heap[s].dist) s = r
      if (s === i) break
      ;[heap[i], heap[s]] = [heap[s], heap[i]]
      i = s
    }
  }
  return top
}

function nearestSearch(root, px, py, k) {
  if (!root || k <= 0) return []

  const results = []
  const heap = []

  heapPush(heap, { kind: 'node', node: root, dist: distanceToPoint(root.bounds, px, py) })

  while (heap.length > 0 && results.length < k) {
    const cur = heapPop(heap)

    if (cur.kind === 'item') {
      results.push(cur.item)
      continue
    }

    const node = cur.node

    for (const entry of node.items) {
      heapPush(heap, { kind: 'item', item: entry.item, dist: distanceToPoint(entry.bounds, px, py) })
    }

    if (node.children) {
      for (const child of node.children) {
        heapPush(heap, { kind: 'node', node: child, dist: distanceToPoint(child.bounds, px, py) })
      }
    }
  }

  return results
}

/**
 * Creates a quadtree spatial index.
 *
 * @param {(item: any) => Bounds} accessor - maps items to their bounding boxes
 * @param {QuadtreeOptions} [options]
 * @returns {SpatialIndex}
 */
export function createQuadtree(accessor, options = {}) {
  const maxItems = options.maxItems ?? 16
  const maxDepth = options.maxDepth ?? 8
  const fixedBounds = options.bounds ? normalizeBounds(options.bounds) : null

  let root = fixedBounds ? createNode(fixedBounds) : null
  let size = 0

  const index = {
    [SPATIAL_INDEX]: true,

    get size() { return size },

    get bounds() { return root ? root.bounds : null },

    insert(item) {
      const itemBounds = accessor(item)
      const entry = { item, bounds: itemBounds }

      if (!root) {
        const { minX, minY, maxX, maxY } = itemBounds
        const w = Math.max(maxX - minX, 1)
        const h = Math.max(maxY - minY, 1)
        root = createNode({
          minX: minX - w, minY: minY - h,
          maxX: maxX + w, maxY: maxY + h
        })
      }

      if (!contains(root.bounds, itemBounds)) {
        root = growToContain(root, itemBounds)
      }

      insertEntry(root, entry, maxItems, maxDepth, 0)
      size++
    },

    remove(item) {
      if (!root) return false
      const itemBounds = accessor(item)
      const removed = removeEntry(root, item, itemBounds)
      if (removed) size--
      return removed
    },

    search(query) {
      if (!root) return []
      const queryBounds = normalizeBounds(query)
      const results = []
      searchNode(root, queryBounds, results)
      return results
    },

    nearest(point, k = 1) {
      if (!root) return []
      return nearestSearch(root, point.x, point.y, k)
    },

    clear() {
      root = fixedBounds ? createNode(fixedBounds) : null
      size = 0
    }
  }

  return index
}
