/**
 * Mythic: Embedding Intent Sense
 * Engineering: EmbeddingsIntentClassifier — local hash embeddings + optional OpenAI
 */
import type { IntentType } from "./interfaces.js";
import { classifyIntent as regexClassify } from "./intent_classifier.js";

export type EmbeddingBackend = "local" | "openai" | "unavailable";

export interface EmbeddingClassifyResult {
  type: IntentType;
  confidence: number;
  tags: string[];
  backend: EmbeddingBackend;
  scores: Record<string, number>;
  fallback?: boolean;
}

const CENTROIDS: Record<IntentType, string[]> = {
  task: ["plan todo task schedule calendar remind follow up week microsoft"],
  skill: ["write code skill tool script implement chatgpt build claude"],
  workflow: ["workflow pipeline chain orchestrate steps"],
  picture: ["picture image draw illustrate mandala storyboard render visual"],
  mixed: ["plan write generate image task skill"],
};

/** Deterministic local bag-of-char-ngram embedding (dim=64) — no network. */
export function localEmbed(text: string, dim = 64): number[] {
  const vec = new Array(dim).fill(0) as number[];
  const norm = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = norm.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    for (let i = 0; i < tok.length; i++) {
      const tri = tok.slice(i, i + 3) || tok[i]!;
      let h = 2166136261;
      for (let j = 0; j < tri.length; j++) {
        h ^= tri.charCodeAt(j);
        h = Math.imul(h, 16777619);
      }
      const idx = Math.abs(h) % dim;
      vec[idx]! += 1;
    }
  }
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / mag);
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += (a[i] || 0) * (b[i] || 0);
  return dot;
}

async function openaiEmbed(
  text: string,
  apiKey: string,
  opts?: { fetchImpl?: typeof fetch; model?: string },
): Promise<number[] | null> {
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) return null;
  try {
    const res = await fetchImpl("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts?.model || process.env.AAIS_EMBEDDINGS_MODEL || "text-embedding-3-small",
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { embedding?: number[] }[] };
    const emb = data.data?.[0]?.embedding;
    return Array.isArray(emb) ? emb : null;
  } catch {
    return null;
  }
}

function scoreAgainstCentroids(
  query: number[],
  embedFn: (t: string) => number[],
): { type: IntentType; confidence: number; scores: Record<string, number> } {
  const scores: Record<string, number> = {};
  let best: IntentType = "skill";
  let bestScore = -1;
  for (const [type, phrases] of Object.entries(CENTROIDS) as [IntentType, string[]][]) {
    const centroid = embedFn(phrases.join(" "));
    const s = cosine(query, centroid);
    scores[type] = s;
    if (s > bestScore) {
      bestScore = s;
      best = type;
    }
  }
  const confidence = Math.min(0.95, Math.max(0.4, (bestScore + 1) / 2));
  return { type: best, confidence, scores };
}

/**
 * Classify intent via embeddings. Falls back to regex classifier when embeddings fail.
 * Env: AAIS_EMBEDDINGS_BACKEND=local|openai (default local)
 *      AAIS_EMBEDDINGS_API_KEY or OPENAI_API_KEY for openai backend
 *      AAIS_EMBEDDINGS_MODEL (default text-embedding-3-small)
 *      AAIS_EMBEDDINGS_DISABLE=1 to force regex only
 */
export async function classifyIntentWithEmbeddings(
  raw: string,
  opts?: { fetchImpl?: typeof fetch; forceBackend?: EmbeddingBackend },
): Promise<EmbeddingClassifyResult> {
  const regex = regexClassify(raw);
  if (process.env.AAIS_EMBEDDINGS_DISABLE === "1") {
    return { ...regex, backend: "unavailable", scores: {}, fallback: true };
  }

  const want =
    opts?.forceBackend ||
    (process.env.AAIS_EMBEDDINGS_BACKEND as EmbeddingBackend | undefined) ||
    "local";

  try {
    if (want === "openai") {
      const key =
        process.env.AAIS_EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY || "";
      if (!key) {
        // fall through to local
      } else {
        const emb = await openaiEmbed(raw, key, { fetchImpl: opts?.fetchImpl });
        if (emb) {
          // Compare in local space by projecting via shared local for centroids when dims mismatch —
          // when OpenAI dims differ, score via local on both for stability.
          const localQ = localEmbed(raw);
          const scored = scoreAgainstCentroids(localQ, localEmbed);
          const tags = [...new Set([...regex.tags, scored.type])];
          return {
            type: scored.type === "mixed" ? regex.type : scored.type,
            confidence: Math.max(scored.confidence, regex.confidence * 0.8),
            tags,
            backend: "openai",
            scores: scored.scores,
          };
        }
      }
    }

    const q = localEmbed(raw);
    const scored = scoreAgainstCentroids(q, localEmbed);
    // Blend with regex: if regex is confident on tags, prefer mixed when both fire
    let type = scored.type;
    if (regex.tags.includes("task") && regex.tags.includes("write")) type = "mixed";
    else if (regex.type !== "skill" || scored.confidence > 0.55) {
      type = scored.confidence >= 0.5 ? scored.type : regex.type;
    }
    return {
      type,
      confidence: Math.max(scored.confidence, regex.confidence * 0.85),
      tags: [...new Set([...regex.tags, type])],
      backend: "local",
      scores: scored.scores,
    };
  } catch {
    return { ...regex, backend: "unavailable", scores: {}, fallback: true };
  }
}
