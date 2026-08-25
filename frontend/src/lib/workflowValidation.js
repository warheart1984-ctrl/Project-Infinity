export function validateProposedEdge({ nodes, edges, connection }) {
  if (!connection?.source || !connection?.target) {
    throw new Error('Connection is missing a source or target.');
  }
  if (connection.source === connection.target) {
    throw new Error('A node cannot connect to itself.');
  }

  const source = (nodes || []).find((node) => node.id === connection.source);
  const target = (nodes || []).find((node) => node.id === connection.target);
  if (!source || !target) {
    throw new Error('That connection is not valid.');
  }
  if (source.data?.kind === 'action' && target.data?.kind === 'trigger') {
    throw new Error('Actions cannot flow back into a trigger.');
  }
  if ((edges || []).some((edge) => edge.source === connection.source && edge.target === connection.target)) {
    throw new Error('That connection already exists.');
  }
  return true;
}

export function validateAndBuildWorkflowPayload({ workflowName, nodes, edges }) {
  const name = String(workflowName || '').trim();
  if (!name) {
    throw new Error('Workflow name is required.');
  }
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const edgeList = Array.isArray(edges) ? edges : [];
  const trigger = nodeList.find((node) => node.data?.kind === 'trigger');
  if (!trigger) {
    throw new Error('A workflow needs a trigger node.');
  }
  return {
    name,
    trigger: {
      type: trigger.data?.subtype,
      config: trigger.data?.config || {},
    },
    nodes: nodeList,
    edges: edgeList,
  };
}
