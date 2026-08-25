/**
 * Mythic: Excel Workbook Session
 * Engineering: ExcelWorkbookSessionClient — Graph createSession / range R/W / close
 */
import { callGraph, type FetchLike, type GraphCallResult } from "./graph_client.js";

export interface WorkbookSession {
  workbookPath: string;
  sessionId: string;
}

export interface WorkbookSessionOpts {
  fetchImpl?: FetchLike;
  /** Drive item path under me/drive/root: e.g. /AAIS/exports/report.xlsx */
  itemPath?: string;
  /** Or raw item id: me/drive/items/{id}/workbook/... */
  itemId?: string;
}

function workbookBase(opts: WorkbookSessionOpts = {}): string {
  if (opts.itemId) {
    return `me/drive/items/${encodeURIComponent(opts.itemId)}/workbook`;
  }
  const raw = (opts.itemPath || "/AAIS/exports/aais.xlsx").replace(/^\/+/, "");
  const safe = raw.replace(/[^\w./-]+/g, "_").slice(0, 200);
  return `me/drive/root:/${safe}:/workbook`;
}

function sessionHeaders(sessionId?: string): Record<string, string> {
  return sessionId ? { "workbook-session-id": sessionId } : {};
}

/** Create a persistent workbook session (persistChanges=true). */
export async function createWorkbookSession(
  token: string | undefined,
  opts: WorkbookSessionOpts & { persistChanges?: boolean } = {},
): Promise<GraphCallResult & { session?: WorkbookSession }> {
  if (!token) {
    return {
      ok: false,
      status: 401,
      reasonCode: "EXCEL_NEEDS_AUTH",
      error: "Graph token required for Excel workbook session",
    };
  }
  const base = workbookBase(opts);
  const res = await callGraph(
    token,
    `${base}/createSession`,
    "POST",
    { persistChanges: opts.persistChanges !== false },
    { fetchImpl: opts.fetchImpl },
  );
  if (!res.ok) {
    return { ...res, reasonCode: res.reasonCode || "EXCEL_SESSION_CREATE_FAILED" };
  }
  const data = (res.data || {}) as { id?: string };
  const sessionId = String(data.id || "");
  if (!sessionId && !res.simulated) {
    return {
      ok: false,
      status: res.status,
      reasonCode: "EXCEL_SESSION_MISSING_ID",
      error: "createSession returned no id",
      data: res.data,
    };
  }
  return {
    ...res,
    reasonCode: res.simulated ? "EXCEL_SESSION_SIMULATE" : "EXCEL_SESSION_CREATED",
    session: {
      workbookPath: base,
      sessionId: sessionId || "sim-session",
    },
  };
}

export async function getWorkbookRange(
  token: string | undefined,
  session: WorkbookSession,
  address: string,
  opts?: { fetchImpl?: FetchLike },
): Promise<GraphCallResult> {
  if (!token) {
    return {
      ok: false,
      status: 401,
      reasonCode: "EXCEL_NEEDS_AUTH",
      error: "Graph token required",
    };
  }
  const addr = encodeURIComponent(address || "A1:B2");
  // callGraph doesn't pass custom headers yet — embed session via query workaround:
  // Graph requires workbook-session-id header; extend call with header inject via fetchImpl wrap.
  const fetchImpl = wrapSessionFetch(opts?.fetchImpl, session.sessionId);
  return callGraph(
    token,
    `${session.workbookPath}/worksheets/Sheet1/range(address='${addr}')`,
    "GET",
    undefined,
    { fetchImpl },
  );
}

export async function updateWorkbookRange(
  token: string | undefined,
  session: WorkbookSession,
  address: string,
  values: unknown[][],
  opts?: { fetchImpl?: FetchLike },
): Promise<GraphCallResult> {
  if (!token) {
    return {
      ok: false,
      status: 401,
      reasonCode: "EXCEL_NEEDS_AUTH",
      error: "Graph token required",
    };
  }
  const addr = encodeURIComponent(address || "A1");
  const fetchImpl = wrapSessionFetch(opts?.fetchImpl, session.sessionId);
  return callGraph(
    token,
    `${session.workbookPath}/worksheets/Sheet1/range(address='${addr}')`,
    "PATCH",
    { values },
    { fetchImpl },
  );
}

export async function closeWorkbookSession(
  token: string | undefined,
  session: WorkbookSession,
  opts?: { fetchImpl?: FetchLike },
): Promise<GraphCallResult> {
  if (!token) {
    return {
      ok: false,
      status: 401,
      reasonCode: "EXCEL_NEEDS_AUTH",
      error: "Graph token required",
    };
  }
  const fetchImpl = wrapSessionFetch(opts?.fetchImpl, session.sessionId);
  return callGraph(token, `${session.workbookPath}/closeSession`, "POST", {}, { fetchImpl });
}

/**
 * Full governed flow: create → write → read → close.
 * Fail closed without token; evidence-ready result object.
 */
export async function runWorkbookSessionFlow(
  token: string | undefined,
  input: {
    itemPath?: string;
    itemId?: string;
    address?: string;
    values?: unknown[][];
  },
  opts?: { fetchImpl?: FetchLike },
): Promise<{
  ok: boolean;
  reasonCode: string;
  error?: string;
  steps: Record<string, unknown>[];
  sessionId?: string;
  values?: unknown;
}> {
  const steps: Record<string, unknown>[] = [];
  const created = await createWorkbookSession(token, {
    itemPath: input.itemPath,
    itemId: input.itemId,
    fetchImpl: opts?.fetchImpl,
  });
  steps.push({ step: "createSession", ...created, session: created.session });
  if (!created.ok || !created.session) {
    return {
      ok: false,
      reasonCode: created.reasonCode,
      error: created.error,
      steps,
    };
  }
  const session = created.session;
  const address = input.address || "A1:B2";
  const values = input.values || [
    ["metric", "value"],
    ["demo", 1],
  ];
  const written = await updateWorkbookRange(token, session, address, values, {
    fetchImpl: opts?.fetchImpl,
  });
  steps.push({ step: "updateRange", ...written });
  if (!written.ok) {
    await closeWorkbookSession(token, session, { fetchImpl: opts?.fetchImpl });
    return {
      ok: false,
      reasonCode: written.reasonCode,
      error: written.error,
      steps,
      sessionId: session.sessionId,
    };
  }
  const read = await getWorkbookRange(token, session, address, { fetchImpl: opts?.fetchImpl });
  steps.push({ step: "getRange", ...read });
  const closed = await closeWorkbookSession(token, session, { fetchImpl: opts?.fetchImpl });
  steps.push({ step: "closeSession", ...closed });
  return {
    ok: read.ok && closed.ok,
    reasonCode: read.ok ? "EXCEL_SESSION_FLOW_OK" : read.reasonCode,
    error: read.ok ? undefined : read.error,
    steps,
    sessionId: session.sessionId,
    values: (read.data as { values?: unknown })?.values,
  };
}

function wrapSessionFetch(
  base: FetchLike | undefined,
  sessionId: string,
): FetchLike {
  const inner = base ?? (globalThis.fetch as FetchLike);
  return async (input, init) => {
    const headers = { ...(init?.headers || {}), "workbook-session-id": sessionId };
    return inner(input, { ...init, headers });
  };
}

/** @deprecated use runWorkbookSessionFlow */
export const graphWorkbookStub = async (
  token: string | undefined,
  name: string,
  opts?: { fetchImpl?: FetchLike },
): Promise<GraphCallResult> => {
  const flow = await runWorkbookSessionFlow(
    token,
    { itemPath: `/AAIS/exports/${name}.xlsx` },
    opts,
  );
  return {
    ok: flow.ok,
    status: flow.ok ? 200 : 400,
    reasonCode: flow.reasonCode,
    error: flow.error,
    data: flow,
  };
};
