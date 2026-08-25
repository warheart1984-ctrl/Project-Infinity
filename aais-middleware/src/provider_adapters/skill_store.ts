/**
 * Mythic: Skill Store subcontract
 * Engineering: SkillStoreRegistry — list / invoke / govern with evidence
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AdapterResult } from "../intent_bus/interfaces.js";

export interface SkillDescriptor {
  skillId: string;
  displayName: string;
  provider: "gpt_tools" | "claude_writer" | "aais";
  description: string;
  authorityLevel: "assist" | "execute";
  tags: string[];
}

export interface SkillInvokeRequest {
  skillId: string;
  args?: Record<string, unknown>;
  operatorApproved?: boolean;
}

const BUILTIN: SkillDescriptor[] = [
  {
    skillId: "capability_bridge",
    displayName: "Capability Bridge Compose",
    provider: "gpt_tools",
    description: "Compose AAIS capability bridge hops for a target",
    authorityLevel: "assist",
    tags: ["skill", "compose"],
  },
  {
    skillId: "workflow_compose",
    displayName: "Workflow Compose",
    provider: "gpt_tools",
    description: "Plan a governed workflow chain",
    authorityLevel: "assist",
    tags: ["skill", "workflow"],
  },
  {
    skillId: "longform_writer",
    displayName: "Longform Writer",
    provider: "claude_writer",
    description: "Governed longform draft (not Computer Use)",
    authorityLevel: "assist",
    tags: ["skill", "write", "longform"],
  },
  {
    skillId: "critique_pass",
    displayName: "Critique Pass",
    provider: "claude_writer",
    description: "Structured critique of operator text",
    authorityLevel: "assist",
    tags: ["skill", "write"],
  },
];

export class SkillStoreRegistry {
  private readonly filePath: string;

  constructor(opts?: { runtimeRoot?: string; filePath?: string }) {
    const root =
      opts?.runtimeRoot || process.env.AAIS_RUNTIME_DIR || join(process.cwd(), ".runtime");
    this.filePath = opts?.filePath || join(root, "skill_store", "catalog.json");
  }

  private loadOverlay(): SkillDescriptor[] {
    if (!existsSync(this.filePath)) return [];
    try {
      const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as { skills?: SkillDescriptor[] };
      return Array.isArray(raw.skills) ? raw.skills : [];
    } catch {
      return [];
    }
  }

  list(): SkillDescriptor[] {
    const overlay = this.loadOverlay();
    const byId = new Map<string, SkillDescriptor>();
    for (const s of BUILTIN) byId.set(s.skillId, s);
    for (const s of overlay) byId.set(s.skillId, s);
    return [...byId.values()];
  }

  register(skill: SkillDescriptor): void {
    const overlay = this.loadOverlay().filter((s) => s.skillId !== skill.skillId);
    overlay.push(skill);
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(
      this.filePath,
      JSON.stringify({ updatedAt: new Date().toISOString(), skills: overlay }, null, 2) + "\n",
      "utf8",
    );
  }

  invoke(req: SkillInvokeRequest): AdapterResult {
    const skill = this.list().find((s) => s.skillId === req.skillId);
    if (!skill) {
      return {
        provider: "skill_store",
        lane: "skills",
        status: "error",
        ok: false,
        justification: `Unknown skill: ${req.skillId}`,
        reasonCode: "SKILL_STORE_NOT_FOUND",
      };
    }
    if (skill.authorityLevel === "execute" && !req.operatorApproved) {
      return {
        provider: "skill_store",
        lane: "skills",
        status: "denied",
        ok: false,
        justification: "Execute-level skill requires operatorApproved",
        reasonCode: "SKILL_STORE_NEEDS_APPROVAL",
        output: { skill },
      };
    }
    return {
      provider: "skill_store",
      lane: "skills",
      status: "ok",
      ok: true,
      justification: `Invoked skill ${skill.skillId} via ${skill.provider}`,
      reasonCode: "SKILL_STORE_INVOKED",
      output: {
        skill,
        args: req.args || {},
        plan: {
          provider: skill.provider,
          next: skill.provider === "claude_writer" ? "claude_writer" : "gpt_tools",
        },
      },
    };
  }

  catalogStatus(): Record<string, unknown> {
    const skills = this.list();
    return {
      store: "AAIS Skill Store",
      count: skills.length,
      skills,
      notClaimed: ["Vendor ChatGPT/Claude marketplace clone", "Unsigned third-party skill install"],
    };
  }
}

export const defaultSkillStore = new SkillStoreRegistry();
