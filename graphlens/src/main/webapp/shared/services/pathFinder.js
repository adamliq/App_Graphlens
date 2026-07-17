/**
 * Client-side shortest-path discovery over the graph currently loaded in
 * the browser (never the full dataset in Splunk). This is a convenience
 * for visually tracing a route between two visible nodes, not a
 * general-purpose graph-database traversal - see USER_GUIDE.md for the
 * exact wording shown to users so this distinction is not overstated.
 */

/**
 * Breadth-first shortest path between two node ids using the currently
 * visible (rendered) edges, treated as undirected for path-finding
 * purposes (an investigator tracing "how are these two things connected"
 * cares about reachability, not edge direction).
 *
 * @param {Array<{id:string}>} nodes
 * @param {Array<{id:string, source:string, target:string}>} edges
 * @param {string} startNodeId
 * @param {string} endNodeId
 * @param {number} [maxDepth]
 * @returns {{ nodeIds: string[], edgeIds: string[] } | null}
 */
export function findShortestPath(nodes, edges, startNodeId, endNodeId, maxDepth = 5) {
  if (startNodeId === endNodeId) {
    return { nodeIds: [startNodeId], edgeIds: [] };
  }
  const nodeIdSet = new Set(nodes.map((n) => n.id));
  if (!nodeIdSet.has(startNodeId) || !nodeIdSet.has(endNodeId)) {
    return null;
  }

  const adjacency = new Map();
  edges.forEach((edge) => {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
    adjacency.get(edge.source).push({ neighbour: edge.target, edgeId: edge.id });
    adjacency.get(edge.target).push({ neighbour: edge.source, edgeId: edge.id });
  });

  const visited = new Set([startNodeId]);
  const queue = [{ nodeId: startNodeId, depth: 0 }];
  const cameFrom = new Map(); // nodeId -> { nodeId: parentId, edgeId }

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift();
    if (depth >= maxDepth) continue;
    const neighbours = adjacency.get(nodeId) || [];
    for (let i = 0; i < neighbours.length; i += 1) {
      const { neighbour, edgeId } = neighbours[i];
      if (visited.has(neighbour)) continue;
      visited.add(neighbour);
      cameFrom.set(neighbour, { nodeId, edgeId });
      if (neighbour === endNodeId) {
        return reconstructPath(cameFrom, startNodeId, endNodeId);
      }
      queue.push({ nodeId: neighbour, depth: depth + 1 });
    }
  }

  return null; // no path within maxDepth using the currently visible graph
}

function reconstructPath(cameFrom, startNodeId, endNodeId) {
  const nodeIds = [endNodeId];
  const edgeIds = [];
  let cursor = endNodeId;
  while (cursor !== startNodeId) {
    const step = cameFrom.get(cursor);
    if (!step) return null; // should not happen
    edgeIds.unshift(step.edgeId);
    nodeIds.unshift(step.nodeId);
    cursor = step.nodeId;
  }
  return { nodeIds, edgeIds };
}
