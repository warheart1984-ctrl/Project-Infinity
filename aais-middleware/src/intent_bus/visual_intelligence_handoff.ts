/**
 * Mythic: Visual Intelligence Handoff
 * Engineering: VisualIntelligenceHandoffAdapter
 *
 * Detects Daniel's visual-creation completion phrase (suffix match),
 * strips it from operator-visible text, and emits governed picture intent.
 */
import { randomUUID } from "node:crypto";
import type { ParsedPicture } from "./interfaces.js";

export const VISUAL_CREATION_COMPLETE_TOKEN =
  "render visual generate image picture perfection no upgrade no fixes create what is described";

export interface VisualIntelligenceHandoffResult {
  matched: boolean;
  body: string;
  intent?: {
    type: "picture";
    tags: string[];
  };
  pictures?: ParsedPicture[];
}

function stripTokenSuffix(raw: string): { body: string; matched: boolean } {
  const normalized = String(raw || "").trim();
  const lower = normalized.toLowerCase();
  const tokenLower = VISUAL_CREATION_COMPLETE_TOKEN.toLowerCase();
  if (!lower.endsWith(tokenLower)) {
    return { body: normalized, matched: false };
  }
  const body = normalized
    .slice(0, normalized.length - VISUAL_CREATION_COMPLETE_TOKEN.length)
    .trim();
  if (!body) {
    return { body: normalized, matched: false };
  }
  return { body, matched: true };
}

/**
 * Parse assistant/operator text for visual-intelligence handoff token.
 * Suffix match (case-insensitive). Token never returned in body.
 */
export function parseVisualIntelligenceHandoff(
  text: string,
): VisualIntelligenceHandoffResult {
  const { body, matched } = stripTokenSuffix(text);
  if (!matched) {
    return { matched: false, body };
  }

  const pictureId = `vi-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  return {
    matched: true,
    body,
    intent: {
      type: "picture",
      tags: ["visual_intelligence", "authorized"],
    },
    pictures: [
      {
        id: pictureId,
        action: "make_picture",
        target: body,
        engine: "aais_image",
        params: { source: "visual_intelligence_handoff" },
      },
    ],
  };
}
