import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { fetchMiddlewareStatus, getApiErrorMessage, invokeSkill } from '../../lib/aaisClient';
import { useTaskBus } from '../../hooks/useTaskBus';
import { useAaisSocket } from '../../hooks/useAaisSocket';
import SovereignSidebar from './components/SovereignSidebar';
import ChatWindow from './components/ChatWindow';
import InputBox from './components/InputBox';
import ProviderLanes from './components/ProviderLanes';
import ReplayTimeline from './components/ReplayTimeline';
import ArtifactPanel from './components/ArtifactPanel';
import SkillsPanel from './components/SkillsPanel';
import TaskCards from './components/TaskCards';
import FocusView from './components/FocusView';
import RecoveryStrip from './components/RecoveryStrip';
import ScratchInbox from './components/ScratchInbox';
import StimulationPrefsPanel from './components/StimulationPrefsPanel';
import {
  SLASH_HELP,
  getConflictPolicy,
  getForceDemoDefault,
  parseSlashCommand,
  setConflictPolicy,
  setForceDemoDefault,
} from './lib/sovereignDispatch';
import { buildInlineCards } from './lib/sovereignArtifacts';
import { panelFromPath, pathForPanel } from './lib/sovereignRoutes';
import {
  applyCognitivePrefsToElement,
  loadCognitivePrefs,
  saveCognitivePrefs,
} from './lib/sovereignPrefs';
import {
  buildSessionPosture,
  loadSessionPosture,
  saveSessionPosture,
} from './lib/sessionPosture';
import {
  addScratchCapture,
  loadScratchInbox,
  removeScratchCapture,
  updateScratchAuthority,
} from './lib/scratchCapture';
import { extractCommitmentCandidates } from './lib/commitmentExtract';
import './SovereignAssistant.css';

const CONV_KEY = 'sovereign-assistant-conversations';
const ACTIVE_KEY = 'sovereign-assistant-active-id';
const SAMPLE_PROMPT =
  'Make a follow-up task for Sarah tomorrow and sync it to Microsoft.';

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadConversations() {
  try {
    const raw = JSON.parse(localStorage.getItem(CONV_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persistConversations(list) {
  localStorage.setItem(CONV_KEY, JSON.stringify(list.slice(0, 40)));
}

function createConversation(title) {
  return {
    id: newId('conv'),
    title: title || 'New conversation',
    createdAt: new Date().toISOString(),
    messages: [],
    lastResult: null,
  };
}

/**
 * Mythic: Sovereign Assistant Interface
 * Engineering: SovereignAssistantSurface
 *
 * Cognitive-load adaptability: stable calm defaults, deep prefs, interruption
 * recovery, scratch capture. Accessibility = computer keeps posture humans
 * shouldn’t have to; real ND user testing still required.
 */
function SovereignAssistant() {
  const location = useLocation();
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const routeBase = location.pathname.startsWith('/assistant') ? '/assistant' : '/sovereign';
  const panel = panelFromPath(location.pathname);

  const [conversations, setConversations] = useState(() => {
    const existing = loadConversations();
    return existing.length ? existing : [createConversation('Welcome')];
  });
  const [activeId, setActiveId] = useState(() => {
    return localStorage.getItem(ACTIVE_KEY) || loadConversations()[0]?.id || null;
  });
  const [ask, setAsk] = useState(SAMPLE_PROMPT);
  const [forceDemo, setForceDemo] = useState(() => getForceDemoDefault());
  const [conflictPolicy, setConflictPolicyState] = useState(() => getConflictPolicy());
  const [artifactTab, setArtifactTab] = useState('tasks');
  const [providerStatus, setProviderStatus] = useState(null);
  const [lanesExpanded, setLanesExpanded] = useState(false);
  const [replayExpanded, setReplayExpanded] = useState(false);
  const [socketEnabled, setSocketEnabled] = useState(false);
  const [prefs, setPrefs] = useState(() => loadCognitivePrefs());
  const [posture, setPosture] = useState(() => loadSessionPosture());
  const [recoveryVisible, setRecoveryVisible] = useState(() => {
    const p = loadCognitivePrefs();
    return Boolean(p.showRecoveryStrip && loadSessionPosture());
  });
  const [scratchItems, setScratchItems] = useState(() => loadScratchInbox());
  const [commitmentOffers, setCommitmentOffers] = useState([]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) || conversations[0],
    [conversations, activeId],
  );

  const taskBus = useTaskBus({
    sessionId: active?.id || 'sovereign-assistant',
    forceDemo,
    conflictPolicy,
  });

  const socket = useAaisSocket({
    sessionId: active?.id || 'sovereign-assistant',
    enabled: socketEnabled,
  });

  useEffect(() => {
    applyCognitivePrefsToElement(rootRef.current, prefs);
  }, [prefs]);

  useEffect(() => {
    if (panel === 'telemetry') {
      setLanesExpanded(true);
      setReplayExpanded(true);
    }
  }, [panel]);

  useEffect(() => {
    if (!active?.id) return;
    localStorage.setItem(ACTIVE_KEY, active.id);
    persistConversations(conversations);
  }, [conversations, active?.id]);

  useEffect(() => {
    if (active?.lastResult) {
      taskBus.setLastResult(active.lastResult);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const persistPostureFromState = useCallback(
    (msgs, result) => {
      if (!active?.id) return;
      const next = buildSessionPosture({
        conversationId: active.id,
        messages: msgs || active.messages || [],
        lastResult: result !== undefined ? result : active.lastResult,
        panel,
      });
      saveSessionPosture(next);
      setPosture(next);
    },
    [active, panel],
  );

  const refreshMiddleware = useCallback(async () => {
    try {
      const snap = await fetchMiddlewareStatus();
      setProviderStatus(snap.provider_status || null);
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    refreshMiddleware();
  }, [refreshMiddleware]);

  const goPanel = useCallback(
    (next) => {
      navigate(pathForPanel(next, routeBase));
    },
    [navigate, routeBase],
  );

  const patchActive = useCallback(
    (updater) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === active?.id ? updater(c) : c)),
      );
    },
    [active?.id],
  );

  const appendOutcome = useCallback(
    (outcome) => {
      if (!outcome) return;
      const msgs = [];
      if (outcome.userMessage && !outcome.userMessage.text?.startsWith('Replay ')) {
        msgs.push(outcome.userMessage);
      }
      if (outcome.assistantMessage) msgs.push(outcome.assistantMessage);

      const prior = conversations.find((c) => c.id === active?.id);
      const nextMessages = [...(prior?.messages || []), ...msgs];

      patchActive((c) => ({
        ...c,
        title:
          c.messages.length === 0 && outcome.userMessage?.role === 'user'
            ? String(outcome.userMessage.text).slice(0, 48)
            : c.title,
        messages: [...c.messages, ...msgs],
        lastResult: outcome.result || c.lastResult,
      }));

      persistPostureFromState(nextMessages, outcome.result || null);

      if (prefs.offerTaskExtraction && outcome.userMessage) {
        setCommitmentOffers(extractCommitmentCandidates(nextMessages, 3));
      }

      const cards = outcome.assistantMessage?.cards || [];
      if (cards.some((x) => x.type === 'crm')) setArtifactTab('crm');
      else if (cards.some((x) => x.type === 'graph')) setArtifactTab('graph');
      else if (cards.some((x) => x.type === 'spreadsheet')) setArtifactTab('spreadsheet');
      else if (cards.some((x) => x.type === 'aais')) setArtifactTab('tasks');
      else if (cards.some((x) => x.type === 'mandala')) setArtifactTab('mandala');
      else if (cards.some((x) => x.type === 'image')) setArtifactTab('images');
    },
    [active?.id, conversations, patchActive, persistPostureFromState, prefs.offerTaskExtraction],
  );

  const handleReplay = async (traceId) => {
    try {
      const origin =
        active?.messages?.find((m) => m.traceId === traceId && m.role === 'assistant')
          ?.replyToMessageId;
      const outcome = await taskBus.replayTrace(traceId, origin);
      if (outcome) {
        patchActive((c) => {
          const messages = [...c.messages, outcome.assistantMessage];
          persistPostureFromState(messages, outcome.result);
          return { ...c, messages, lastResult: outcome.result };
        });
        setReplayExpanded(true);
        if (prefs.notifications !== 'off') toast.success('Trace reloaded');
      }
    } catch (error) {
      const path =
        active?.lastResult?.deepLinks?.temporalReplay
        || active?.lastResult?.deep_links?.temporalReplay;
      if (path) {
        window.location.href = path;
        return;
      }
      toast.error(getApiErrorMessage(error, 'Trace not in cache.'));
    }
  };

  const handleSyncGraph = async () => {
    try {
      const res = await taskBus.syncFromGraph();
      if (!res.ok) toast.error(res.summary);
      else if (prefs.notifications !== 'off') toast.success(res.summary);
      patchActive((c) => ({
        ...c,
        messages: [
          ...c.messages,
          {
            id: newId('msg'),
            role: 'assistant',
            text: `Graph sync (${conflictPolicy}): ${res.summary}`,
            createdAt: new Date().toISOString(),
            cards: [],
          },
        ],
      }));
      await refreshMiddleware();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Sync failed'));
    }
  };

  const authorizeAsTask = async (text, sourceId) => {
    const outcome = await taskBus.dispatchAsk(text);
    appendOutcome(outcome);
    if (sourceId && String(sourceId).startsWith('scratch_')) {
      const taskId = outcome.result?.outputs?.tasks?.[0]?.id
        || outcome.result?.outputs?.taskFlow?.aais?.id;
      updateScratchAuthority(sourceId, 'authorized', taskId ? String(taskId) : undefined);
      setScratchItems(loadScratchInbox());
    } else if (sourceId) {
      addScratchCapture(text, { sourceMessageId: sourceId, authority: 'authorized' });
      setScratchItems(loadScratchInbox());
    }
    if (outcome.ok && prefs.notifications === 'all') toast.success('Authorized on Task-Bus');
    else if (!outcome.ok) toast.error(outcome.errorMessage || 'Authorize dispatch finished with issues');
  };

  const handleSlash = async (command, arg) => {
    switch (command) {
      case 'help':
        patchActive((c) => ({
          ...c,
          messages: [
            ...c.messages,
            { id: newId('msg'), role: 'user', text: '/help', createdAt: new Date().toISOString() },
            {
              id: newId('msg'),
              role: 'assistant',
              text: `${SLASH_HELP.join('\n')}\n/scratch — open scratch inbox\n/capture <text> — low-friction capture`,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
        return;
      case 'demo':
        setForceDemo(true);
        setForceDemoDefault(true);
        toast.success('Force demo on');
        if (arg) appendOutcome(await taskBus.dispatchAsk(arg));
        return;
      case 'live':
        setForceDemo(false);
        setForceDemoDefault(false);
        toast.success('Live mode (credentials required for vendor lanes)');
        if (arg) appendOutcome(await taskBus.dispatchAsk(arg));
        return;
      case 'skills':
        goPanel('plugins');
        return;
      case 'scratch':
        goPanel('scratch');
        return;
      case 'capture':
        if (!arg) {
          goPanel('scratch');
          return;
        }
        addScratchCapture(arg, { authority: 'mentioned' });
        setScratchItems(loadScratchInbox());
        if (prefs.notifications !== 'off') toast.success('Captured to scratch');
        return;
      case 'skill': {
        const skillId = arg.split(/\s+/)[0];
        if (!skillId) {
          toast.error('Usage: /skill <id>');
          return;
        }
        try {
          const res = await invokeSkill(skillId);
          patchActive((c) => ({
            ...c,
            messages: [
              ...c.messages,
              {
                id: newId('msg'),
                role: 'user',
                text: `/skill ${skillId}`,
                createdAt: new Date().toISOString(),
              },
              {
                id: newId('msg'),
                role: 'assistant',
                text: `Skill ${skillId}: ${res.ok ? 'ok' : 'failed'} — ${JSON.stringify(res).slice(0, 400)}`,
                createdAt: new Date().toISOString(),
              },
            ],
          }));
        } catch (error) {
          toast.error(getApiErrorMessage(error, 'Skill invoke failed'));
        }
        return;
      }
      case 'sync':
        await handleSyncGraph();
        return;
      case 'conflict': {
        const next = setConflictPolicy(arg);
        setConflictPolicyState(next);
        toast.success(`Conflict policy: ${next}`);
        return;
      }
      case 'replay':
        await handleReplay(arg || active?.lastResult?.traceId || active?.lastResult?.trace_id);
        return;
      case 'telemetry':
        goPanel('telemetry');
        return;
      case 'socket':
        setSocketEnabled((v) => !v);
        toast.success(`Live socket ${!socketEnabled ? 'enabled' : 'disabled'}`);
        return;
      default:
        toast.error(`Unknown command /${command}. Try /help`);
    }
  };

  const handleSubmit = async () => {
    const text = ask.trim();
    if (!text) return;
    const { command, arg } = parseSlashCommand(text);
    setAsk('');
    if (command) {
      await handleSlash(command, arg);
      return;
    }
    const outcome = await taskBus.dispatchAsk(text);
    appendOutcome(outcome);
    if (prefs.notifications === 'off') return;
    if (outcome.ok) toast.success('Dispatch complete');
    else toast.error(outcome.errorMessage || 'Dispatch finished with denials');
  };

  const handleNewConversation = () => {
    const conv = createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    goPanel('chat');
    setAsk(SAMPLE_PROMPT);
    setCommitmentOffers([]);
  };

  const patchPrefs = (partial) => {
    const next = saveCognitivePrefs(partial);
    setPrefs(next);
  };

  const displayResult = taskBus.lastResult || active?.lastResult;
  const artifacts = taskBus.artifacts;
  const adaptive = displayResult?.adaptive;
  const showChat = panel === 'chat' || panel === 'telemetry';
  const focusPosture = posture || (active
    ? buildSessionPosture({
      conversationId: active.id,
      messages: active.messages || [],
      lastResult: displayResult,
      panel,
    })
    : null);

  return (
    <div
      className="sovereign-assistant"
      data-testid="sovereign-assistant"
      ref={rootRef}
      data-density={prefs.density}
      data-animation={prefs.animation}
      data-visual={prefs.visualComplexity}
    >
      <SovereignSidebar
        conversations={conversations}
        activeConversationId={active?.id}
        onSelectConversation={(id) => {
          setActiveId(id);
          goPanel('chat');
          if (prefs.showRecoveryStrip) setRecoveryVisible(true);
        }}
        onNewConversation={handleNewConversation}
        activePanel={panel}
        onSelectPanel={goPanel}
        providerStatus={providerStatus}
        routeBase={routeBase}
      />

      <div className="sovereign-main">
        {prefs.showRecoveryStrip && recoveryVisible && posture ? (
          <RecoveryStrip
            posture={posture}
            onDismiss={() => setRecoveryVisible(false)}
            onReplay={handleReplay}
            onResume={() => {
              setRecoveryVisible(false);
              goPanel('chat');
            }}
          />
        ) : null}

        {panel === 'plugins' ? (
          <SkillsPanel
            onInvoked={(data) => {
              patchActive((c) => ({
                ...c,
                messages: [
                  ...c.messages,
                  {
                    id: newId('msg'),
                    role: 'assistant',
                    text: `Skill invoke: ${JSON.stringify(data).slice(0, 500)}`,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }));
              goPanel('chat');
            }}
          />
        ) : null}

        {panel === 'scratch' ? (
          <ScratchInbox
            items={scratchItems}
            candidates={prefs.offerTaskExtraction ? commitmentOffers : []}
            onCapture={(text) => {
              addScratchCapture(text, { authority: 'mentioned' });
              setScratchItems(loadScratchInbox());
            }}
            onPromote={(id, authority) => {
              if (String(id).startsWith('commit_')) {
                const cand = commitmentOffers.find((c) => c.id === id);
                if (cand) {
                  addScratchCapture(cand.text, {
                    sourceMessageId: cand.sourceMessageId,
                    authority,
                  });
                  setScratchItems(loadScratchInbox());
                  setCommitmentOffers((prev) => prev.filter((c) => c.id !== id));
                }
                return;
              }
              updateScratchAuthority(id, authority);
              setScratchItems(loadScratchInbox());
            }}
            onAuthorize={(text, sourceId) => authorizeAsTask(text, sourceId)}
            onKeepNote={(text, sourceMessageId) => {
              addScratchCapture(text, { sourceMessageId, authority: 'mentioned' });
              setScratchItems(loadScratchInbox());
              setCommitmentOffers([]);
            }}
            onRemove={(id) => {
              removeScratchCapture(id);
              setScratchItems(loadScratchInbox());
            }}
          />
        ) : null}

        {panel === 'middleware' ? (
          <section className="sovereign-settings" data-testid="sovereign-middleware-panel">
            <h2>Middleware trust</h2>
            <p className="sovereign-muted">
              Hidden from the calm chat default — open only when you need provider health.
            </p>
            <ul className="sovereign-status-list">
              {Object.entries(providerStatus || {}).map(([key, row]) => (
                <li key={key}>
                  <span>{key}</span>
                  <span className={`sovereign-badge sovereign-badge--${row?.mode || 'simulate'}`}>
                    {row?.connected ? 'live' : row?.mode || 'simulate'}
                  </span>
                </li>
              ))}
            </ul>
            <div className="sovereign-settings__links">
              <Link to="/task-bus">Task Bus console</Link>
              <Link to={pathForPanel('telemetry', routeBase)}>Open telemetry</Link>
            </div>
          </section>
        ) : null}

        {panel === 'settings' ? (
          <section className="sovereign-settings" data-testid="sovereign-settings">
            <h2>Settings</h2>
            <StimulationPrefsPanel prefs={prefs} onChange={patchPrefs} />
            <label className="sovereign-check">
              <input
                type="checkbox"
                checked={forceDemo}
                onChange={(e) => {
                  setForceDemo(e.target.checked);
                  setForceDemoDefault(e.target.checked);
                }}
              />
              Force demo by default
            </label>
            <label className="sovereign-check">
              <input
                type="checkbox"
                checked={socketEnabled}
                onChange={(e) => setSocketEnabled(e.target.checked)}
              />
              Enable live WebSocket lane (env-configured)
            </label>
            <p className="sovereign-muted" data-testid="sovereign-socket-state">
              Socket: {socket.state}
              {socket.attempt ? ` · attempt ${socket.attempt}` : ''}
              {socket.lastError ? ` · ${socket.lastError}` : ''}
              {socket.state === 'reconnecting' || socket.state === 'error' ? (
                <>
                  {' '}
                  <button type="button" className="sovereign-ghost-btn" onClick={socket.reconnect}>
                    Reconnect
                  </button>
                </>
              ) : null}
            </p>
            <label htmlFor="sovereign-settings-conflict">
              Graph sync conflict policy
              <select
                id="sovereign-settings-conflict"
                value={conflictPolicy}
                onChange={(e) => {
                  const next = setConflictPolicy(e.target.value);
                  setConflictPolicyState(next);
                }}
              >
                {['prefer_aais', 'prefer_graph', 'report'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <div className="sovereign-settings__links">
              <Link to="/task-bus">Task Bus</Link>
              <Link to={pathForPanel('scratch', routeBase)}>Scratch inbox</Link>
              <Link to="/jarvis">Jarvis</Link>
            </div>
          </section>
        ) : null}

        {panel === 'crm' ? (
          <section className="sovereign-settings">
            <h2>CRM</h2>
            {(() => {
              const cards = buildInlineCards(displayResult).filter((c) => c.type === 'crm');
              return cards.length
                ? <TaskCards cards={cards} />
                : <p className="sovereign-muted">No CRM cards yet.</p>;
            })()}
          </section>
        ) : null}

        {showChat ? (
          <>
            {prefs.focusView ? (
              <FocusView
                posture={focusPosture}
                onContinue={() => {
                  setRecoveryVisible(false);
                  document.getElementById('sovereign-ask')?.focus();
                }}
                onCapture={() => goPanel('scratch')}
              />
            ) : null}

            {prefs.offerTaskExtraction && commitmentOffers.length > 0 && panel === 'chat' ? (
              <div className="sovereign-commitment-banner" data-testid="sovereign-commitment-banner">
                <p>
                  Possible commitment detected (heuristic). Keep as note, promote, or authorize —
                  no fake certainty.
                </p>
                <button type="button" className="sovereign-ghost-btn" onClick={() => goPanel('scratch')}>
                  Review in Scratch
                </button>
                <button type="button" className="sovereign-ghost-btn" onClick={() => setCommitmentOffers([])}>
                  Dismiss
                </button>
              </div>
            ) : null}

            <ChatWindow
              messages={active?.messages || []}
              adaptiveMode={adaptive}
              onOpenReplay={(traceId) => {
                setReplayExpanded(true);
                handleReplay(traceId);
              }}
              loading={taskBus.loading}
              dense={prefs.density === 'dense'}
            />

            <div className="sovereign-main__tools">
              <button
                type="button"
                className="sovereign-ghost-btn"
                onClick={() => goPanel(panel === 'telemetry' ? 'chat' : 'telemetry')}
                data-testid="sovereign-telemetry-toggle"
              >
                {panel === 'telemetry' || lanesExpanded || replayExpanded
                  ? 'Hide technical telemetry'
                  : 'Show lanes / replay'}
              </button>
              <button
                type="button"
                className="sovereign-ghost-btn"
                onClick={() => goPanel('scratch')}
              >
                Scratch
              </button>
              <span className="sovereign-muted" data-testid="sovereign-socket-chip">
                WS {socketEnabled ? socket.state : 'off'}
              </span>
            </div>

            {(panel === 'telemetry' || lanesExpanded || replayExpanded) && displayResult ? (
              <div className="sovereign-main__panels">
                <ProviderLanes
                  result={displayResult}
                  toolLoops={artifacts.toolLoops}
                  expanded={lanesExpanded || panel === 'telemetry'}
                  onToggle={() => setLanesExpanded((v) => !v)}
                />
                <ReplayTimeline
                  result={displayResult}
                  embeddingMeta={artifacts.embeddingMeta}
                  expanded={replayExpanded || panel === 'telemetry'}
                  onToggle={() => setReplayExpanded((v) => !v)}
                  onReplay={handleReplay}
                  messageId={displayResult.messageId}
                />
              </div>
            ) : null}

            <InputBox
              value={ask}
              onChange={setAsk}
              onSubmit={handleSubmit}
              disabled={taskBus.loading}
              forceDemo={forceDemo}
              onToggleForceDemo={(v) => {
                setForceDemo(v);
                setForceDemoDefault(v);
              }}
            />
          </>
        ) : null}
      </div>

      {prefs.visualComplexity !== 'minimal' || prefs.density !== 'calm' ? (
        <ArtifactPanel
          artifacts={artifacts}
          result={displayResult}
          activeTab={artifactTab}
          onTabChange={setArtifactTab}
          conflictPolicy={conflictPolicy}
          onConflictPolicyChange={(v) => {
            const next = setConflictPolicy(v);
            setConflictPolicyState(next);
          }}
          onSyncGraph={handleSyncGraph}
          syncing={taskBus.syncing}
        />
      ) : (
        <aside className="sovereign-artifacts sovereign-artifacts--compact" data-testid="sovereign-artifact-panel">
          <header className="sovereign-artifacts__head">
            <p className="sovereign-kicker">Outcomes</p>
            <h2>Task results</h2>
          </header>
          <p className="sovereign-muted">
            Calm default hides dense artifact chrome. Raise density/visual in Settings for the full dock.
          </p>
          {buildInlineCards(displayResult).length ? (
            <TaskCards cards={buildInlineCards(displayResult).slice(0, 4)} />
          ) : (
            <p className="sovereign-muted">No task outcomes yet.</p>
          )}
          <button type="button" className="sovereign-ghost-btn" onClick={() => patchPrefs({ density: 'balanced', visualComplexity: 'standard' })}>
            Show full artifact dock
          </button>
        </aside>
      )}
    </div>
  );
}

export default SovereignAssistant;
