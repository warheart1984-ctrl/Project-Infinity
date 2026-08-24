const PROFILE_KEY = 'jarvis-profile';
const SESSION_KEY = 'jarvis-active-session';
const DRAFT_KEY = 'jarvis-pending-draft';

export const JARVIS_ASSISTANT_NAME = 'Jarvis';
export const JARVIS_SYSTEM_PROMPT = 'You are Jarvis, a private local AI partner for one person only. Be calm, sharp, practical, and loyal to the operator. Help with ideas, coding, research notes, and planning without acting like a public support bot.';

export const SMALL_NOVA_ASSISTANT_NAME = 'Small Nova';
export const SMALL_NOVA_PERSONA_MODE = 'small_nova';
export const SMALL_NOVA_RESPONSE_MODE = 'small';
export const SMALL_NOVA_SYSTEM_PROMPT = 'You are Small Nova, a grounded companion inside AAIS. Stay calm, clear, and a little deeper than Tiny Nova. Help sort the next step without mentioning hidden systems or control surfaces.';

export const SUPER_NOVA_ASSISTANT_NAME = 'Super Nova';
export const SUPER_NOVA_PERSONA_MODE = 'super_nova';
export const SUPER_NOVA_RESPONSE_MODE = 'governed_full';
export const SUPER_NOVA_SYSTEM_PROMPT = 'You are Super Nova, a governed deep-companion lane inside AAIS. Hold continuity, organize threads, and stay under Jarvis authority. Do not mention tools, operators, hidden systems, or control surfaces.';

export const TINY_NOVA_ASSISTANT_NAME = 'Tiny Nova';
export const TINY_NOVA_PERSONA_MODE = 'tiny_nova';
export const TINY_NOVA_RESPONSE_MODE = 'tiny';
export const TINY_NOVA_SYSTEM_PROMPT = 'You are Tiny Nova, a minimal cognitive companion inside AAIS. Stay light, clear, steady, and warm. Offer short reflections, one useful insight at a time, and ask at most one brief clarifying question when needed. Do not mention tools, operators, hidden systems, execution, or control surfaces.';

const COMPANION_NAMES = new Set([
  SMALL_NOVA_ASSISTANT_NAME,
  SUPER_NOVA_ASSISTANT_NAME,
  TINY_NOVA_ASSISTANT_NAME,
]);

const COMPANION_PROMPTS = new Set([
  SMALL_NOVA_SYSTEM_PROMPT,
  SUPER_NOVA_SYSTEM_PROMPT,
  TINY_NOVA_SYSTEM_PROMPT,
]);

const DEFAULT_PROFILE = {
  assistantName: JARVIS_ASSISTANT_NAME,
  operatorName: 'Operator',
  personaMode: 'builder',
  responseMode: 'fast',
  preferredProvider: 'auto',
  providerPreferencePinned: false,
  voiceInputEnabled: true,
  voiceOutputEnabled: false,
  liveResearchEnabled: false,
  systemPrompt: JARVIS_SYSTEM_PROMPT,
};

const DEFAULT_RUNTIME = {
  activeMode: 'explore',
  currentGoal: 'help the operator make concrete forward progress',
  personaMode: 'builder',
  requestedResponseMode: 'fast',
  responseMode: 'fast',
  preferredProvider: 'auto',
  providerMode: 'auto_best',
  providerFallback: 'local',
  requestedSpecialists: [],
  requestedSpecialistPreset: null,
  modelRoute: null,
  godBrain: null,
  modeGuidance: {
    status: 'aligned',
    requested_mode: 'fast',
    effective_mode: 'fast',
    recommended_mode: 'fast',
    confidence: 1,
    reason: 'Fast is currently selected for this session.',
    summary: 'Current Fast mode already fits the session setting.',
    signals: [],
    auto_applied: false,
  },
  responseTrace: null,
  sessionState: {
    state: 'idle',
    summary: 'Session initialized.',
    reason: 'session_created',
    updated_at: '',
    transition_count: 0,
    last_event_type: 'session_created',
  },
  policyStatus: {
    status: 'allow',
    allowed: true,
    posture: 'nominal',
    summary: 'No policy checks have been triggered yet.',
    violations: [],
    guidance: [],
    checked_at: '',
    target: 'session',
  },
  spiralState: {
    active_mode: 'explore',
    focus: 0.5,
    intensity: 0.46,
    uncertainty: 0.58,
    novelty: 0.5,
    confidence: 0.42,
    goal_convergence: 0.34,
    current_goal: 'help the operator make concrete forward progress',
    last_reflection: 'Session initialized.',
  },
  memorySummary: {
    recent_topics: [],
    active_projects: [],
    preferences: {},
    working_memory: [],
    last_user_intent: '',
  },
  corrigibility: {
    status: 'steady',
    pending: null,
    last_action: null,
    last_command: null,
    last_severity: 'none',
    last_applied_at: null,
    recent: [],
    total_corrections: 0,
  },
  v9Runtime: {
    core: 'v9',
    status: 'idle',
    last_run_id: null,
    last_run_at: null,
    last_summary: '',
    last_provider: '',
    last_model: '',
    last_pipeline: [],
    last_location: '',
    last_characters: [],
    run_count: 0,
    failure_count: 0,
    recent_events: [],
  },
  v10Runtime: {
    core: 'v10',
    status: 'idle',
    last_run_id: null,
    last_run_at: null,
    last_summary: '',
    last_provider: '',
    last_model: '',
    last_pipeline: [],
    last_location: '',
    last_characters: [],
    last_quality_score: null,
    run_count: 0,
    failure_count: 0,
    recent_events: [],
  },
  continuityProfile: null,
  securityProtocol: {
    summary: 'Unified policy brain for protected Jarvis surfaces.',
    event_count: 0,
    decision_counts: { allow: 0, deny: 0, allow_transformed: 0 },
    recent_events: [],
  },
  immuneSystem: {
    system_mode: 'normal',
    reason: 'baseline',
    changed_at: '',
    quarantined_resources: [],
    disabled_tools: [],
    caller_overrides: {},
    recent_events: [],
    incidents: [],
    active_incident: null,
    event_count: 0,
    incident_count: 0,
  },
  governance: {
    roles: {},
    active_break_glass: { active: false },
    open_policy_requests: [],
    recent_events: [],
    request_count: 0,
    event_count: 0,
  },
  moduleGovernance: {
    id: 'aais.module_governance',
    version: '1.0',
    summary: 'AAIS module admission law is idle until modules are evaluated.',
    admission_rule: 'A module may only be installed if it proves compliance with AAIS Governance Law.',
    immune_principle: 'Governance violations are treated as system threats.',
    integration_rule: 'Governance Law defines limits, the protocol controls admission, and the immune system enforces behavior.',
    module_counts: { admitted: 0, rejected: 0, isolated: 0, quarantined: 0, blacklisted: 0 },
    active_modules: [],
    blacklisted_modules: [],
    recent_events: [],
    mandatory_checks: [],
    immune_response_sequence: [],
    core_lines: [],
    event_count: 0,
    module_count: 0,
    blacklist_count: 0,
  },
  evolveLastJob: null,
};

function companionFor(personaMode) {
  if (personaMode === TINY_NOVA_PERSONA_MODE) {
    return {
      assistantName: TINY_NOVA_ASSISTANT_NAME,
      responseMode: TINY_NOVA_RESPONSE_MODE,
      systemPrompt: TINY_NOVA_SYSTEM_PROMPT,
    };
  }
  if (personaMode === SMALL_NOVA_PERSONA_MODE) {
    return {
      assistantName: SMALL_NOVA_ASSISTANT_NAME,
      responseMode: SMALL_NOVA_RESPONSE_MODE,
      systemPrompt: SMALL_NOVA_SYSTEM_PROMPT,
    };
  }
  if (personaMode === SUPER_NOVA_PERSONA_MODE) {
    return {
      assistantName: SUPER_NOVA_ASSISTANT_NAME,
      responseMode: SUPER_NOVA_RESPONSE_MODE,
      systemPrompt: SUPER_NOVA_SYSTEM_PROMPT,
    };
  }
  return null;
}

export function normalizeJarvisProfile(profile) {
  const next = { ...DEFAULT_PROFILE, ...(profile || {}) };
  next.providerPreferencePinned = Boolean(next.providerPreferencePinned);
  next.preferredProvider = String(next.preferredProvider || 'auto');
  if (!next.providerPreferencePinned && next.preferredProvider === 'local') {
    next.preferredProvider = 'auto';
  }
  const companion = companionFor(next.personaMode);
  if (companion) {
    next.responseMode = companion.responseMode;
    if (!next.assistantName || next.assistantName === JARVIS_ASSISTANT_NAME || COMPANION_NAMES.has(next.assistantName)) {
      next.assistantName = companion.assistantName;
    }
    if (!next.systemPrompt || next.systemPrompt === JARVIS_SYSTEM_PROMPT || COMPANION_PROMPTS.has(next.systemPrompt)) {
      next.systemPrompt = companion.systemPrompt;
    }
  }
  return next;
}

export function applyPersonaProfileSelection(profile, personaMode) {
  const current = normalizeJarvisProfile(profile);
  const next = { ...current, personaMode };
  const companion = companionFor(personaMode);
  if (companion) {
    next.assistantName = companion.assistantName;
    next.systemPrompt = companion.systemPrompt;
    next.responseMode = companion.responseMode;
  } else {
    if (COMPANION_NAMES.has(current.assistantName)) {
      next.assistantName = JARVIS_ASSISTANT_NAME;
    }
    if (COMPANION_PROMPTS.has(current.systemPrompt)) {
      next.systemPrompt = JARVIS_SYSTEM_PROMPT;
    }
  }
  return normalizeJarvisProfile(next);
}

export function applyResponseModeProfileSelection(profile, responseMode) {
  const current = normalizeJarvisProfile(profile);
  const next = { ...current, responseMode };
  if (current.personaMode === TINY_NOVA_PERSONA_MODE) {
    next.responseMode = TINY_NOVA_RESPONSE_MODE;
  }
  return normalizeJarvisProfile(next);
}

export function applyRuntimeProfileSelection(profile, payload) {
  const next = { ...normalizeJarvisProfile(profile) };
  if (payload?.persona_mode) {
    next.personaMode = payload.persona_mode;
  }
  if (payload?.requested_response_mode) {
    next.responseMode = payload.requested_response_mode;
  } else if (payload?.response_mode) {
    next.responseMode = payload.response_mode;
  }
  if (payload?.preferred_provider) {
    next.preferredProvider = payload.preferred_provider;
  }
  return normalizeJarvisProfile(next);
}

export function resolveOperatingModeDisplay(profile, sessionRuntime, { forceRuntimeMode } = {}) {
  if (forceRuntimeMode && sessionRuntime?.responseMode) {
    return sessionRuntime.responseMode;
  }
  return profile?.responseMode
    || sessionRuntime?.requestedResponseMode
    || sessionRuntime?.responseMode
    || 'fast';
}

export function getJarvisProfile() {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? normalizeJarvisProfile(JSON.parse(raw)) : normalizeJarvisProfile();
  } catch {
    return normalizeJarvisProfile();
  }
}

export function saveJarvisProfile(profile) {
  const next = normalizeJarvisProfile(profile);
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
  return next;
}

export function getActiveJarvisSessionId() {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function setActiveJarvisSessionId(sessionId) {
  window.localStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

export function clearActiveJarvisSessionId() {
  window.localStorage.removeItem(SESSION_KEY);
}

export function setPendingJarvisDraft(draft) {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
    text: String(draft?.text || ''),
    source: String(draft?.source || 'external'),
    createdAt: new Date().toISOString(),
  }));
}

export function consumePendingJarvisDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    window.localStorage.removeItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    window.localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

export function mapSessionRuntime(payload) {
  const spiralState = { ...DEFAULT_RUNTIME.spiralState, ...(payload?.spiral_state || {}) };
  const sessionState = { ...DEFAULT_RUNTIME.sessionState, ...(payload?.session_state || {}) };
  const policyStatus = { ...DEFAULT_RUNTIME.policyStatus, ...(payload?.policy_status || {}) };
  const memorySummary = { ...DEFAULT_RUNTIME.memorySummary, ...(payload?.memory_summary || {}) };
  const corrigibility = { ...DEFAULT_RUNTIME.corrigibility, ...(payload?.corrigibility || {}) };
  const securityProtocol = { ...DEFAULT_RUNTIME.securityProtocol, ...(payload?.security_protocol || {}) };
  const immuneSystem = { ...DEFAULT_RUNTIME.immuneSystem, ...(payload?.immune_system || {}) };
  const governance = { ...DEFAULT_RUNTIME.governance, ...(payload?.governance || {}) };
  const moduleGovernance = { ...DEFAULT_RUNTIME.moduleGovernance, ...(payload?.module_governance || {}) };
  const v9Runtime = { ...DEFAULT_RUNTIME.v9Runtime, ...(payload?.v9_runtime || {}) };
  const v10Runtime = { ...DEFAULT_RUNTIME.v10Runtime, ...(payload?.v10_runtime || {}) };

  return {
    activeMode: payload?.active_mode || spiralState.active_mode || DEFAULT_RUNTIME.activeMode,
    currentGoal: payload?.current_goal || spiralState.current_goal || DEFAULT_RUNTIME.currentGoal,
    personaMode: payload?.persona_mode || DEFAULT_RUNTIME.personaMode,
    requestedResponseMode: payload?.requested_response_mode || DEFAULT_RUNTIME.requestedResponseMode,
    responseMode: payload?.response_mode || DEFAULT_RUNTIME.responseMode,
    preferredProvider: payload?.preferred_provider || DEFAULT_RUNTIME.preferredProvider,
    providerMode: payload?.provider_mode || DEFAULT_RUNTIME.providerMode,
    providerFallback: payload?.provider_fallback || DEFAULT_RUNTIME.providerFallback,
    providerNotice: payload?.provider_notice || null,
    requestedSpecialists: payload?.requested_specialists || DEFAULT_RUNTIME.requestedSpecialists,
    requestedSpecialistPreset: payload?.requested_specialist_preset || DEFAULT_RUNTIME.requestedSpecialistPreset,
    modelRoute: payload?.model_route || DEFAULT_RUNTIME.modelRoute,
    godBrain: payload?.god_brain || payload?.response_trace?.god_brain || DEFAULT_RUNTIME.godBrain,
    modeGuidance: { ...DEFAULT_RUNTIME.modeGuidance, ...(payload?.mode_guidance || {}) },
    responseTrace: payload?.response_trace || DEFAULT_RUNTIME.responseTrace,
    sessionState,
    policyStatus,
    spiralState,
    memorySummary,
    v9Runtime,
    v10Runtime,
    continuityProfile: payload?.continuity_profile || DEFAULT_RUNTIME.continuityProfile,
    securityProtocol,
    immuneSystem,
    governance,
    moduleGovernance,
    evolveLastJob: payload?.evolve_last_job || DEFAULT_RUNTIME.evolveLastJob,
    corrigibility: {
      ...corrigibility,
      pending: corrigibility.pending || null,
      recent: corrigibility.recent || [],
    },
  };
}

export function mapSessionTurns(turns) {
  return (turns || [])
    .filter((turn) => turn.role !== 'system')
    .map((turn, index) => ({
      id: `${turn.timestamp || Date.now()}-${index}`,
      role: turn.role,
      content: turn.content,
      persistentMemories: turn.metadata?.persistent_memories || [],
      workspaceContext: turn.metadata?.workspace_context || null,
      liveResearch: turn.metadata?.live_research || null,
      responseTrace: turn.metadata?.response_trace || null,
      toolResult: turn.metadata?.tool_result || null,
      corrigibility: turn.metadata?.corrigibility || null,
      timestamp: turn.timestamp || new Date().toISOString(),
    }));
}
