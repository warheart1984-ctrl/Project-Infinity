/**
 * Shared AAIS / Task-Bus domain contracts for the Sovereign Assistant.
 * Engineering names only — mythic labels stay in comments/docs.
 */

export type ConflictPolicy = 'prefer_aais' | 'prefer_graph' | 'report';

export type RiskLevel = 'low' | 'normal' | 'high';

export type MessageRole = 'user' | 'assistant' | 'system';

export type SovereignPanel =
  | 'chat'
  | 'middleware'
  | 'console'
  | 'dashboard'
  | 'plugins'
  | 'settings'
  | 'crm'
  | 'telemetry'
  | 'scratch';

export type ArtifactTab =
  | 'tasks'
  | 'crm'
  | 'graph'
  | 'images'
  | 'mandala'
  | 'spreadsheet'
  | 'notes'
  | 'summaries';

export type InlineCardType =
  | 'aais'
  | 'crm'
  | 'graph'
  | 'mandala'
  | 'image'
  | 'spreadsheet';

export interface InlineCard {
  id: string;
  type: InlineCardType;
  title: string;
  body?: string;
  href?: string;
  meta?: Record<string, unknown>;
}

/** Conversational message. Task outcomes attach via messageId. */
export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: string;
  /** Links this bubble to task-bus execution evidence */
  traceId?: string;
  requestId?: string;
  /** Parent user message this assistant result answers */
  replyToMessageId?: string;
  cards?: InlineCard[];
  error?: string;
  /** Raw dispatch snapshot (typed separately when present) */
  result?: TaskBusDispatchResult | null;
}

export interface AaisTask {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  tags?: string[];
  source?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ProviderLaneEvent {
  id?: string;
  provider: string;
  lane?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  timestamp?: string;
  latencyMs?: number;
  latency_ms?: number;
  durationMs?: number;
}

export interface EvidenceRecord {
  id?: string;
  requestId?: string;
  provider: string;
  justification: string;
  metadata?: Record<string, unknown>;
}

export interface DecisionEvent {
  event: string;
  reasonCode?: string;
  reason_code?: string;
  embedding?: EmbeddingMeta;
  [key: string]: unknown;
}

export interface EmbeddingMeta {
  backend?: string;
  dims?: number;
  model?: string;
  [key: string]: unknown;
}

export interface ReplayTrace {
  requestId?: string;
  traceId?: string;
  events: ProviderLaneEvent[];
  evidence: EvidenceRecord[];
  decisionEvents?: DecisionEvent[];
  decision_events?: DecisionEvent[];
}

export interface LanePlanRow {
  provider: string;
  allowed: boolean;
  reasonCode?: string;
  reason_code?: string;
  auth_status?: string;
}

export interface AdaptiveSnapshot {
  mode?: string;
  status?: string;
  deepLink?: string;
  proposedAdaptations?: string[];
  allowedProviders?: string[];
  [key: string]: unknown;
}

export interface TaskFlowOutputs {
  aais?: AaisTask | Record<string, unknown>;
  crm?: Record<string, unknown>;
  graph?: Record<string, unknown>;
  spreadsheet?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TaskBusOutputs {
  tasks?: Array<AaisTask | Record<string, unknown>>;
  skills?: Array<Record<string, unknown>>;
  pictures?: Array<Record<string, unknown>>;
  taskFlow?: TaskFlowOutputs;
  task_flow?: TaskFlowOutputs;
  spreadsheet?: Record<string, unknown>;
}

export interface TaskBusDispatchResult {
  ok: boolean;
  requestId?: string;
  request_id?: string;
  traceId?: string;
  trace_id?: string;
  intent?: {
    raw?: string;
    type?: string;
    confidence?: number;
    tags?: string[];
  };
  policy?: Record<string, unknown>;
  authority?: Record<string, unknown>;
  lanePlan?: LanePlanRow[];
  lane_plan?: LanePlanRow[];
  outputs?: TaskBusOutputs;
  trace?: ReplayTrace;
  reasonCodes?: string[];
  reason_codes?: string[];
  adaptive?: AdaptiveSnapshot;
  deepLinks?: Record<string, string>;
  deep_links?: Record<string, string>;
  decision_events?: DecisionEvent[];
  decisionEvents?: DecisionEvent[];
  error?: string;
  /** Originating chat message this result answers */
  messageId?: string;
}

export interface TaskSkillsRequestPayload {
  intent?: string;
  text?: string;
  context?: {
    user: string;
    workspace?: string;
    project?: string;
    session?: string;
  };
  policy?: { riskLevel?: RiskLevel };
  forceDemo?: boolean;
  force_demo?: boolean;
  tasks?: Array<{
    id: string;
    action: string;
    target: string;
    constraints?: Record<string, unknown>;
  }>;
}

export interface MiddlewareProviderStatus {
  connected?: boolean;
  mode?: string;
  auth_status?: string;
  [key: string]: unknown;
}

export interface MiddlewareStatus {
  ok?: boolean;
  mode?: string;
  provider_status?: Record<string, MiddlewareProviderStatus>;
  oauth?: Record<string, unknown>;
  plugs?: unknown;
  aais_tasks?: AaisTask[];
  recent_requests?: unknown[];
}

export interface SkillStoreEntry {
  skillId?: string;
  skill_id?: string;
  id?: string;
  displayName?: string;
  display_name?: string;
  provider?: string;
  description?: string;
  authorityLevel?: string;
  authority_level?: string;
  tags?: string[];
}

export interface SkillStoreCatalog {
  ok?: boolean;
  skills?: SkillStoreEntry[];
  catalog?: SkillStoreEntry[];
}

export interface SkillInvokeResult {
  ok?: boolean;
  skillId?: string;
  [key: string]: unknown;
}

export interface GraphSyncResult {
  ok?: boolean;
  outcome?: string;
  reason_code?: string;
  activation_hint?: string;
  [key: string]: unknown;
}

/** Live telemetry frame from optional WebSocket lane */
export type SocketConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  | 'error'
  | 'disabled';

export interface TelemetryFrame {
  type?: string;
  event?: string;
  traceId?: string;
  messageId?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SovereignArtifacts {
  tasks: Array<Record<string, unknown>>;
  crm: Array<Record<string, unknown>>;
  graph: Array<Record<string, unknown>>;
  images: Array<Record<string, unknown>>;
  mandala: Array<Record<string, unknown>>;
  spreadsheet: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  summaries: Array<Record<string, unknown>>;
  providerEvents: ProviderLaneEvent[];
  toolLoops: Array<{
    provider?: string;
    lane?: string;
    rounds: unknown[];
  }>;
  embeddingMeta: EmbeddingMeta | null;
  decisionEvents: DecisionEvent[];
  evidence: EvidenceRecord[];
}

export interface ConversationThread {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
  lastResult: TaskBusDispatchResult | null;
}

/**
 * Intent authority ladder — UI remembers without nagging.
 * mentioned = noted in chat/scratch; intended = user wants a task someday;
 * authorized = user confirmed Task-Bus execution.
 * Classifier may be stubbed; affordances stay ready without fake certainty.
 */
export type IntentAuthorityClass = 'mentioned' | 'intended' | 'authorized';

export type StimulationDensity = 'calm' | 'balanced' | 'dense';
export type AnimationLevel = 'off' | 'reduced' | 'full';
export type VisualComplexity = 'minimal' | 'standard' | 'rich';
export type NotificationLevel = 'off' | 'essential' | 'all';

/** User-controlled cognitive-load / stimulation preferences (not a clinical mode). */
export interface SovereignCognitivePrefs {
  density: StimulationDensity;
  animation: AnimationLevel;
  notifications: NotificationLevel;
  visualComplexity: VisualComplexity;
  /** Focus layout: one objective + next action as calm default */
  focusView: boolean;
  /** Show interruption recovery strip on return */
  showRecoveryStrip: boolean;
  /** Auto-offer commitment extraction after assistant turns */
  offerTaskExtraction: boolean;
}

export const DEFAULT_COGNITIVE_PREFS: SovereignCognitivePrefs = {
  density: 'calm',
  animation: 'reduced',
  notifications: 'essential',
  visualComplexity: 'minimal',
  focusView: true,
  showRecoveryStrip: true,
  offerTaskExtraction: true,
};

/** Persistable session posture — “Where was I?” (not a chat dump). */
export interface SessionPosture {
  conversationId: string;
  updatedAt: string;
  activeObjective: string;
  lastActionSummary: string;
  lastActionOutcome: 'ok' | 'denied' | 'error' | 'idle' | 'partial';
  nextSuggestion: string;
  lastTraceId?: string;
  lastMessageId?: string;
  panel?: SovereignPanel;
}

/** Scratch capture — unfinished thought, no forced organization. */
export interface ScratchCaptureItem {
  id: string;
  text: string;
  createdAt: string;
  /** Authority class; starts as mentioned */
  authority: IntentAuthorityClass;
  sourceMessageId?: string;
  promotedTaskId?: string;
}

/** Commitment candidate extracted from chat (heuristic, not certainty). */
export interface CommitmentCandidate {
  id: string;
  text: string;
  sourceMessageId?: string;
  /** Heuristic hint only — never presented as backend truth */
  suggestedAuthority: IntentAuthorityClass;
  confidence: 'low' | 'medium';
}
