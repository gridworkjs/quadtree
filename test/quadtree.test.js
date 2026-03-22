import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createQuadtree } from '../src/index.js'
import {
  point, rect, circle, bounds,
  SPATIAL_INDEX, isSpatialIndex
} from '@gridworkjs/core'

const accessor = item => bounds(item.geo)

function pts(coords) {
  return coords.map(([x, y], i) => ({ id: i, geo: point(x, y) }))
}

describe('protocol compliance', () => {
  it('has the SPATIAL_INDEX symbol', () => {
    const tree = createQuadtree(accessor)
    assert.equal(tree[SPATIAL_INDEX], true)
  })

  it('passes isSpatialIndex', () => {
    const tree = createQuadtree(accessor)
    assert.equal(isSpatialIndex(tree), true)
  })

  it('has all required methods', () => {
    const tree = createQuadtree(accessor)
    for (const m of ['insert', 'remove', 'search', 'nearest', 'clear']) {
      assert.equal(typeof tree[m], 'function')
    }
  })
})

describe('insert and size', () => {
  it('starts empty', () => {
    const tree = createQuadtree(accessor)
    assert.equal(tree.size, 0)
  })

  it('tracks size after inserts', () => {
    const tree = createQuadtree(accessor)
    const items = pts([[10, 20], [30, 40], [50, 60]])
    for (const item of items) tree.insert(item)
    assert.equal(tree.size, 3)
  })

  it('handles duplicate inserts as separate entries', () => {
    const tree = createQuadtree(accessor)
    const item = { id: 0, geo: point(5, 5) }
    tree.insert(item)
    tree.insert(item)
    assert.equal(tree.size, 2)
  })
})

describe('search', () => {
  it('returns empty for empty tree', () => {
    const tree = createQuadtree(accessor)
    assert.deepEqual(tree.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 }), [])
  })

  it('finds items within bounds', () => {
    const tree = createQuadtree(accessor)
    const items = pts([[10, 10], [50, 50], [90, 90]])
    for (const item of items) tree.insert(item)

    const found = tree.search({ minX: 0, minY: 0, maxX: 60, maxY: 60 })
    const ids = found.map(i => i.id).sort()
    assert.deepEqual(ids, [0, 1])
  })

  it('finds items on the boundary edge', () => {
    const tree = createQuadtree(accessor)
    const item = { id: 0, geo: point(50, 50) }
    tree.insert(item)

    const found = tree.search({ minX: 50, minY: 50, maxX: 100, maxY: 100 })
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 0)
  })

  it('excludes items outside bounds', () => {
    const tree = createQuadtree(accessor)
    const items = pts([[10, 10], [200, 200]])
    for (const item of items) tree.insert(item)

    const found = tree.search({ minX: 0, minY: 0, maxX: 50, maxY: 50 })
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 0)
  })

  it('accepts geometry objects as query', () => {
    const tree = createQuadtree(accessor)
    const items = pts([[10, 10], [50, 50]])
    for (const item of items) tree.insert(item)

    const found = tree.search(rect(0, 0, 30, 30))
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 0)
  })

  it('accepts circle as query', () => {
    const tree = createQuadtree(accessor)
    const items = pts([[10, 10], [200, 200]])
    for (const item of items) tree.insert(item)

    const found = tree.search(circle(10, 10, 5))
    assert.equal(found.length, 1)
  })

  it('searches with point query', () => {
    const tree = createQuadtree(accessor)
    const item = { id: 0, geo: point(10, 10) }
    tree.insert(item)

    const found = tree.search(point(10, 10))
    assert.equal(found.length, 1)
  })
})

describe('region items', () => {
  const regionAccessor = item => bounds(item.geo)

  it('indexes rectangles', () => {
    const tree = createQuadtree(regionAccessor)
    const r1 = { id: 0, geo: rect(0, 0, 20, 20) }
    const r2 = { id: 1, geo: rect(80, 80, 100, 100) }
    tree.insert(r1)
    tree.insert(r2)

    const found = tree.search({ minX: 10, minY: 10, maxX: 30, maxY: 30 })
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 0)
  })

  it('finds overlapping regions', () => {
    const tree = createQuadtree(regionAccessor)
    const r1 = { id: 0, geo: rect(0, 0, 60, 60) }
    const r2 = { id: 1, geo: rect(40, 40, 100, 100) }
    tree.insert(r1)
    tree.insert(r2)

    const found = tree.search({ minX: 45, minY: 45, maxX: 55, maxY: 55 })
    const ids = found.map(i => i.id).sort()
    assert.deepEqual(ids, [0, 1])
  })

  it('handles items spanning quadrant boundaries', () => {
    const tree = createQuadtree(regionAccessor, {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      maxItems: 1
    })
    const wide = { id: 0, geo: rect(10, 10, 90, 90) }
    const small = { id: 1, geo: rect(5, 5, 15, 15) }
    tree.insert(wide)
    tree.insert(small)

    const found = tree.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    assert.equal(found.length, 2)
  })
})

describe('remove', () => {
  it('returns false for empty tree', () => {
    const tree = createQuadtree(accessor)
    assert.equal(tree.remove({ id: 0, geo: point(0, 0) }), false)
  })

  it('removes an item by identity', () => {
    const tree = createQuadtree(accessor)
    const item = { id: 0, geo: point(10, 10) }
    tree.insert(item)
    assert.equal(tree.size, 1)

    assert.equal(tree.remove(item), true)
    assert.equal(tree.size, 0)
    assert.deepEqual(tree.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 }), [])
  })

  it('does not remove a different object with same coords', () => {
    const tree = createQuadtree(accessor)
    const item = { id: 0, geo: point(10, 10) }
    const clone = { id: 0, geo: point(10, 10) }
    tree.insert(item)

    assert.equal(tree.remove(clone), false)
    assert.equal(tree.size, 1)
  })

  it('removes items from child nodes after splitting', () => {
    const tree = createQuadtree(accessor, {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      maxItems: 2
    })

    const items = pts([[10, 10], [20, 20], [80, 80], [90, 90]])
    for (const item of items) tree.insert(item)
    assert.equal(tree.size, 4)

    assert.equal(tree.remove(items[0]), true)
    assert.equal(tree.size, 3)

    const found = tree.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    assert.equal(found.length, 3)
    assert.ok(!found.includes(items[0]))
  })
})

describe('nearest', () => {
  it('returns empty for empty tree', () => {
    const tree = createQuadtree(accessor)
    assert.deepEqual(tree.nearest({ x: 0, y: 0 }), [])
  })

  it('finds the single nearest item', () => {
    const tree = createQuadtree(accessor)
    const items = pts([[10, 10], [50, 50], [90, 90]])
    for (const item of items) tree.insert(item)

    const result = tree.nearest({ x: 12, y: 12 })
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 0)
  })

  it('finds k nearest items', () => {
    const tree = createQuadtree(accessor)
    const items = pts([[0, 0], [10, 10], [20, 20], [100, 100]])
    for (const item of items) tree.insert(item)

    const result = tree.nearest({ x: 5, y: 5 }, 2)
    assert.equal(result.length, 2)
    const ids = result.map(i => i.id).sort()
    assert.deepEqual(ids, [0, 1])
  })

  it('returns all items when k exceeds size', () => {
    const tree = createQuadtree(accessor)
    const items = pts([[10, 10], [20, 20]])
    for (const item of items) tree.insert(item)

    const result = tree.nearest({ x: 0, y: 0 }, 10)
    assert.equal(result.length, 2)
  })

  it('handles k=0', () => {
    const tree = createQuadtree(accessor)
    tree.insert({ id: 0, geo: point(10, 10) })
    assert.deepEqual(tree.nearest({ x: 0, y: 0 }, 0), [])
  })

  it('accepts point geometry', () => {
    const tree = createQuadtree(accessor)
    const items = pts([[10, 10], [50, 50]])
    for (const item of items) tree.insert(item)

    const result = tree.nearest(point(11, 11))
    assert.equal(result.length, 1)
    assert.equal(result[0].id, 0)
  })

  it('returns items in distance order', () => {
    const tree = createQuadtree(accessor)
    const items = pts([[100, 100], [10, 10], [50, 50]])
    for (const item of items) tree.insert(item)

    const result = tree.nearest({ x: 0, y: 0 }, 3)
    assert.equal(result[0].id, 1)
    assert.equal(result[1].id, 2)
    assert.equal(result[2].id, 0)
  })
})

describe('clear', () => {
  it('resets the tree', () => {
    const tree = createQuadtree(accessor)
    const items = pts([[10, 10], [50, 50]])
    for (const item of items) tree.insert(item)

    tree.clear()
    assert.equal(tree.size, 0)
    assert.deepEqual(tree.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 }), [])
  })

  it('preserves fixed bounds after clear', () => {
    const b = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    const tree = createQuadtree(accessor, { bounds: b })
    tree.insert({ id: 0, geo: point(10, 10) })
    tree.clear()
    assert.deepEqual(tree.bounds, b)
  })

  it('allows inserts after clear', () => {
    const tree = createQuadtree(accessor)
    tree.insert({ id: 0, geo: point(10, 10) })
    tree.clear()

    tree.insert({ id: 1, geo: point(20, 20) })
    assert.equal(tree.size, 1)
    const found = tree.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    assert.equal(found[0].id, 1)
  })
})

describe('bounds property', () => {
  it('is null for empty tree without fixed bounds', () => {
    const tree = createQuadtree(accessor)
    assert.equal(tree.bounds, null)
  })

  it('returns fixed bounds when provided', () => {
    const b = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    const tree = createQuadtree(accessor, { bounds: b })
    assert.deepEqual(tree.bounds, b)
  })

  it('expands to contain items', () => {
    const tree = createQuadtree(accessor)
    tree.insert({ id: 0, geo: point(10, 10) })
    assert.ok(tree.bounds !== null)
    assert.ok(tree.bounds.minX <= 10)
    assert.ok(tree.bounds.maxX >= 10)
  })
})

describe('auto-growing bounds', () => {
  it('grows when item is inserted outside initial bounds', () => {
    const tree = createQuadtree(accessor, {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    })
    tree.insert({ id: 0, geo: point(50, 50) })
    tree.insert({ id: 1, geo: point(200, 200) })

    assert.equal(tree.size, 2)
    assert.ok(tree.bounds.maxX >= 200)
    assert.ok(tree.bounds.maxY >= 200)

    const found = tree.search({ minX: 190, minY: 190, maxX: 210, maxY: 210 })
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 1)
  })

  it('grows in negative direction', () => {
    const tree = createQuadtree(accessor, {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    })
    tree.insert({ id: 0, geo: point(-50, -50) })
    assert.ok(tree.bounds.minX <= -50)
    assert.ok(tree.bounds.minY <= -50)

    const found = tree.search({ minX: -60, minY: -60, maxX: -40, maxY: -40 })
    assert.equal(found.length, 1)
  })

  it('auto-creates bounds from first insert', () => {
    const tree = createQuadtree(accessor)
    tree.insert({ id: 0, geo: point(500, 500) })
    tree.insert({ id: 1, geo: point(501, 501) })

    assert.equal(tree.size, 2)
    const found = tree.search({ minX: 499, minY: 499, maxX: 502, maxY: 502 })
    assert.equal(found.length, 2)
  })
})

describe('splitting behavior', () => {
  it('splits when exceeding maxItems', () => {
    const tree = createQuadtree(accessor, {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      maxItems: 2
    })

    const items = pts([[10, 10], [20, 20], [80, 80]])
    for (const item of items) tree.insert(item)

    const all = tree.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    assert.equal(all.length, 3)
  })

  it('respects maxDepth', () => {
    const tree = createQuadtree(accessor, {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      maxItems: 1,
      maxDepth: 2
    })

    const items = pts([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]])
    for (const item of items) tree.insert(item)

    const all = tree.search({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
    assert.equal(all.length, 5)
  })
})

describe('stress', () => {
  it('handles many random points', () => {
    const tree = createQuadtree(accessor, {
      bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }
    })

    const items = []
    for (let i = 0; i < 1000; i++) {
      const item = { id: i, geo: point(Math.random() * 1000, Math.random() * 1000) }
      items.push(item)
      tree.insert(item)
    }

    assert.equal(tree.size, 1000)

    const found = tree.search({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 })
    assert.equal(found.length, 1000)

    const half = tree.search({ minX: 0, minY: 0, maxX: 500, maxY: 500 })
    assert.ok(half.length > 0)
    assert.ok(half.length < 1000)

    for (const item of half) {
      const b = bounds(item.geo)
      assert.ok(b.minX <= 500 && b.minY <= 500)
    }
  })

  it('nearest returns correct order with many points', () => {
    const tree = createQuadtree(accessor, {
      bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }
    })

    for (let i = 0; i < 500; i++) {
      tree.insert({ id: i, geo: point(Math.random() * 1000, Math.random() * 1000) })
    }

    const result = tree.nearest({ x: 500, y: 500 }, 10)
    assert.equal(result.length, 10)

    for (let i = 1; i < result.length; i++) {
      const prevB = bounds(result[i - 1].geo)
      const currB = bounds(result[i].geo)
      const prevDist = Math.hypot(prevB.minX - 500, prevB.minY - 500)
      const currDist = Math.hypot(currB.minX - 500, currB.minY - 500)
      assert.ok(prevDist <= currDist + 1e-10)
    }
  })
})

describe('accessor validation', () => {
  it('throws on NaN bounds from accessor', () => {
    const tree = createQuadtree(() => ({ minX: NaN, minY: 0, maxX: 10, maxY: 10 }))
    assert.throws(() => tree.insert({ id: 1 }), /non-finite bounds/)
  })

  it('throws on Infinity bounds from accessor', () => {
    const tree = createQuadtree(() => ({ minX: 0, minY: 0, maxX: Infinity, maxY: 10 }))
    assert.throws(() => tree.insert({ id: 1 }), /non-finite bounds/)
  })

  it('throws on inverted bounds from accessor', () => {
    const tree = createQuadtree(() => ({ minX: 10, minY: 0, maxX: 0, maxY: 10 }))
    assert.throws(() => tree.insert({ id: 1 }), /inverted bounds/)
  })
})

describe('accessor property', () => {
  it('exposes the accessor function', () => {
    const fn = item => item.geo
    const tree = createQuadtree(fn)
    assert.equal(tree.accessor, fn)
  })
})

describe('remove straddling items', () => {
  it('removes items stored in parent nodes', () => {
    const tree = createQuadtree(accessor, { maxItems: 2, maxDepth: 4 })
    const items = [
      { id: 0, geo: point(25, 25) },
      { id: 1, geo: point(75, 75) },
      { id: 2, geo: point(25, 75) },
      { id: 3, geo: rect(40, 40, 60, 60) }
    ]
    for (const item of items) tree.insert(item)
    assert.equal(tree.remove(items[3]), true)
    assert.equal(tree.size, 3)
    assert.equal(tree.search(rect(40, 40, 60, 60)).length, 0)
  })
})

describe('nearest with region items', () => {
  it('computes distance to rectangle edge', () => {
    const tree = createQuadtree(accessor)
    tree.insert({ id: 0, geo: rect(10, 10, 20, 20) })
    tree.insert({ id: 1, geo: rect(50, 50, 60, 60) })
    const results = tree.nearest({ x: 0, y: 0 }, 1)
    assert.equal(results.length, 1)
    assert.equal(results[0].id, 0)
  })
})
