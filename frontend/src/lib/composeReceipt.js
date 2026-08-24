export const COMPOSE_MODE_LABELS = {
  fast: 'Fast',
  think: 'Think',
  debug: 'Debug',
  builder: 'Builder',
  research: 'Research',
  operator: 'Operator',
  small: 'Small',
  tiny: 'Tiny',
  governed_full: 'Governed',
};

export function normalizeComposeReceipt(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const source = payload.compose_receipt || payload.composeReceipt || payload;
  const composeMode = source.compose_mode || source.composeMode || payload.compose_mode;
  const status = source.status || payload.compose_status;
  const arisStatus = source.aris_status || source.arisStatus || payload.aris_status;

  if (!composeMode && !status && !arisStatus && !source.nova_face_id && !source.novaFaceId) {
    return null;
  }

  return {
    composeMode,
    composeModeLabel: source.compose_mode_label || source.composeModeLabel,
    status: status || 'ok',
    arisStatus,
    novaFaceId: source.nova_face_id || source.novaFaceId,
    composeMs: source.compose_ms ?? source.composeMs ?? null,
    hasCoherenceProjection: Boolean(source.has_coherence_projection || source.hasCoherenceProjection),
    spineDoctrine: source.spine_doctrine || source.spineDoctrine,
    activeRuntimes: source.active_runtimes || source.activeRuntimes || [],
    reasonCodes: source.reason_codes || source.reasonCodes || [],
  };
}

export function summarizeSuperNovaCompose(superNovaState, receipt) {
  const activation = superNovaState?.activation || {};
  return {
    activationState: activation.current_state || 'dormant',
    phaseDecision: receipt?.status || 'idle',
    tokenPresent: Boolean(activation.activation_token_present),
    lastAdmission: superNovaState?.trace?.[0]?.event_type || '',
  };
}
