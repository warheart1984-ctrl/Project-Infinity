import { createHash, randomUUID } from "node:crypto";
import type { EvidenceRecord } from "./interfaces.js";

export class EvidenceStore {
  private records: EvidenceRecord[] = [];

  seal( partial: Omit<EvidenceRecord, "id"> & { id?: string }): EvidenceRecord {
    const material = JSON.stringify({
      requestId: partial.requestId,
      provider: partial.provider,
      justification: partial.justification,
      metadata: partial.metadata ?? {},
    });
    const digest = createHash("sha3-256").update(material).digest("hex");
    const record: EvidenceRecord = {
      id: partial.id ?? `evidence:${digest.slice(0, 32)}`,
      requestId: partial.requestId,
      provider: partial.provider,
      justification: partial.justification,
      metadata: {
        ...(partial.metadata ?? {}),
        sealedAt: new Date().toISOString(),
        nonce: randomUUID().slice(0, 8),
      },
    };
    this.records.push(record);
    return record;
  }

  all(): EvidenceRecord[] {
    return [...this.records];
  }
}
