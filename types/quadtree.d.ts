/**
 * Creates a quadtree spatial index.
 *
 * @param {(item: any) => Bounds} accessor - maps items to their bounding boxes
 * @param {QuadtreeOptions} [options]
 * @returns {SpatialIndex}
 */
export function createQuadtree(accessor: (item: any) => Bounds, options?: QuadtreeOptions): SpatialIndex;
export type Bounds<T> = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};
export type Point<T> = {
    x: number;
    y: number;
};
export type Accessor<T> = (item: T) => Bounds;
export type QuadtreeOptions = {
    /**
     * - fixed world bounds (auto-grows if omitted)
     */
    bounds?: Bounds;
    /**
     * - items per node before splitting
     */
    maxItems?: number;
    /**
     * - maximum tree depth
     */
    maxDepth?: number;
};
export type SpatialIndex = {
    SPATIAL_INDEX?: true;
    size: number;
    bounds: Bounds | null;
    insert: (item: any) => void;
    remove: (item: any) => boolean;
    search: (query: Bounds | object) => any[];
    nearest: (point: Point, k?: number) => any[];
    clear: () => void;
};
