/**
 * Sovereign / AAIS frontend scaffold — routes, chat→orchestration, design tokens
 *
 * Package path: `frontend/` (npm name `aais-frontend`)
 * Preferred approach: folded into existing Sovereign Assistant (commit de391bf),
 * not a parallel fragile app.
 */

## Routes (React Router)

| Scaffold page | Path | Panel | Notes |
|---|---|---|---|
| ChatPage | `/sovereign` (alias `/assistant`) | `chat` | Calm Focus view; no EnergyFlow |
| ConsolePage | `/sovereign/console` | `console` | MiddlewareTab + ProviderLanes + ReplayTimeline |
| DashboardPage | `/sovereign/dashboard` | `dashboard` | EnergyFlow + lanes (animation-gated) |
| Middleware | `/sovereign/middleware` | `middleware` | MiddlewareTab only |
| Telemetry | `/sovereign/telemetry` | `telemetry` | Chat + expanded lanes/replay |
| Scratch | `/sovereign/scratch` | `scratch` | Low-friction capture |
| Settings | `/sovereign/settings` | `settings` | Cognitive-load / stimulation prefs |

Also: `/task-bus`, `/middleware` → Task Bus console (separate page).

## How chat triggers AAIS orchestration

1. Operator types in **ChatInput** (alias of InputBox) on ChatPage.
2. Slash commands (`/task`, `/crm`, `/render`, `/capture`, …) are handled locally.
3. Plain text → `useTaskBus.dispatchAsk(text)`:
   - `mapOperatorAskToTaskBusPayload` builds TaskSkillsRequest
   - `aaisClient.dispatchTaskBus` → `POST /api/jarvis/task-bus/dispatch`
4. Result normalizes into Messages + InlineCards; adaptive snapshot drives `useAdaptiveMode`.
5. Optional live lane stream: Settings → enable WS, or `/socket`. Uses env-driven
   `VITE_AAIS_WS_*` via `websocketClient` / `useWebSocketLanes`.

## Component map (scaffold → implementation)

| Scaffold | Implementation |
|---|---|
| Sidebar | `components/Sidebar.jsx` → `SovereignSidebar` |
| ChatWindow | `components/ChatWindow.jsx` |
| ChatInput | `components/ChatInput.jsx` → `InputBox` |
| ChatBubble | `components/ChatBubble.tsx` |
| TaskCard | `components/TaskCard.jsx` → `TaskCards` |
| ProviderLanes | `components/ProviderLanes.tsx` |
| ReplayTimeline | `components/ReplayTimeline.tsx` |
| MiddlewareTab | `components/MiddlewareTab.tsx` |
| EnergyFlow | `components/EnergyFlow.tsx` (SVG arcs; optional `window.__AAIS_D3__` hook, no hard d3 dep) |
| useTaskBus | `hooks/useTaskBus.ts` (canonical) |
| useWebSocketLanes | `hooks/useWebSocketLanes.ts` |
| useAdaptiveMode | `hooks/useAdaptiveMode.ts` |
| aaisClient | `lib/aaisClient.ts` (+ `aaisClient` export bag) |
| websocketClient | `lib/websocketClient.ts` |

## Design tokens

CSS variables on `.sovereign-assistant`:

- `--graphite` / `--graphite-deep`, `--navy` / `--navy-mid`
- `--gold` / `--gold-soft` accents
- Font: **IBM Plex Sans** (+ IBM Plex Mono for mono slots)
- Motion: `--sovereign-motion` from cognitive prefs; orbital EnergyFlow only when
  `animation === 'full'` (or dense/rich disclosure on Dashboard)

## Env endpoints

```
VITE_API_BASE_URL / VITE_API_URL     REST base (empty = same-origin; Render: https://…)
VITE_AAIS_WS_ENABLED=1              opt-in WS
VITE_AAIS_WS_URL=wss://…/{sessionId} explicit WSS (preferred on Render)
VITE_AAIS_WS_PATH=/ws/chat/{sessionId}
```

Docker / Render: see [RENDER_DEPLOY.md](./RENDER_DEPLOY.md).
`frontend/Dockerfile` is multi-stage (node build → nginx). Runtime `API_UPSTREAM`
proxies `/api` + `/ws` when the browser uses same-origin.

## Slash commands

`/task`, `/crm`, `/render`, `/capture`, plus `/demo`, `/live`, `/sync`, `/replay`,
`/console`, `/dashboard`, `/telemetry`, `/socket`, `/help`.
