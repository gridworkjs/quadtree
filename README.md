<p align="center">
  <img src="logo.svg" width="256" height="256" alt="@gridworkjs/quadtree">
</p>

<h1 align="center">@gridworkjs/quadtree</h1>

<p align="center">quadtree spatial index for sparse, uneven point and region data</p>

## install

```
npm install @gridworkjs/quadtree
```

## usage

```js
import { createQuadtree } from '@gridworkjs/quadtree'
import { point, rect, bounds } from '@gridworkjs/core'

// create a quadtree with a bounds accessor
const tree = createQuadtree(item => bounds(item.position))

// insert items - any shape, the accessor extracts bounds
tree.insert({ id: 1, position: point(10, 20) })
tree.insert({ id: 2, position: point(50, 60) })
tree.insert({ id: 3, position: rect(70, 70, 90, 90) })

// search for items intersecting a region
tree.search({ minX: 0, minY: 0, maxX: 55, maxY: 65 })
// => [{ id: 1, ... }, { id: 2, ... }]

// also accepts geometry objects as queries
tree.search(rect(0, 0, 55, 65))

// find nearest neighbors
tree.nearest({ x: 12, y: 22 }, 2)
// => [{ id: 1, ... }, { id: 2, ... }]

// remove by identity
tree.remove(item)

tree.size   // number of items
tree.bounds // current root bounds
tree.clear()
```

## options

```js
createQuadtree(accessor, {
  bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 }, // world bounds (optional, auto-grows)
  maxItems: 16,  // items per node before splitting
  maxDepth: 8    // maximum tree depth
})
```

If `bounds` is omitted, the tree auto-creates bounds from the first insert and grows as needed.

## API

### `createQuadtree(accessor, options?)`

Creates a new quadtree. The `accessor` function maps each item to its bounding box (`{ minX, minY, maxX, maxY }`). Use `bounds()` from `@gridworkjs/core` to convert geometries.

Returns a spatial index implementing the gridwork protocol.

### `index.insert(item)`

Adds an item to the tree.

### `index.remove(item)`

Removes an item by identity (`===`). Returns `true` if found and removed.

### `index.search(query)`

Returns all items whose bounds intersect the query. Accepts bounds objects or geometry objects (point, rect, circle).

### `index.nearest(point, k?)`

Returns the `k` nearest items to the given point, sorted by distance. Defaults to `k=1`. Accepts `{ x, y }` or a point geometry.

### `index.clear()`

Removes all items. Preserves fixed bounds if provided at construction.

### `index.size`

Number of items in the tree.

### `index.bounds`

Current root bounds, or `null` if empty and no fixed bounds were set.

## license

MIT
