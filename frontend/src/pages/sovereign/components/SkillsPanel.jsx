import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { apiGet, apiPost, getApiErrorMessage } from '../../../lib/api';

/**
 * Mythic: Skill store subcontract panel
 * Engineering: SkillsPanel — GET/POST /api/operator/skill-store
 */
function SkillsPanel({ onInvoked }) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [invoking, setInvoking] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet('/api/operator/skill-store');
      setSkills(res.data?.skills || res.data?.catalog || []);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Could not load skill store.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const invoke = async (skillId) => {
    setInvoking(skillId);
    try {
      const res = await apiPost(`/api/operator/skill-store/${encodeURIComponent(skillId)}/invoke`, {
        operator_approved: true,
        args: {},
      });
      toast.success(res.data?.ok ? `Invoked ${skillId}` : `Invoke finished: ${skillId}`);
      onInvoked?.(res.data);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Skill invoke failed.'));
    } finally {
      setInvoking(null);
    }
  };

  return (
    <section className="sovereign-skills" data-testid="sovereign-skills-panel">
      <header>
        <h2>Skill store</h2>
        <button type="button" className="sovereign-ghost-btn" onClick={refresh} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </header>
      <ul>
        {skills.length === 0 && !loading ? (
          <li className="sovereign-muted">No skills in catalog.</li>
        ) : null}
        {skills.map((s) => {
          const id = s.skillId || s.skill_id || s.id;
          return (
            <li key={id}>
              <div>
                <strong>{s.displayName || s.display_name || id}</strong>
                <p className="sovereign-muted">{s.description}</p>
                <p className="sovereign-muted">
                  {s.provider} · {s.authorityLevel || s.authority_level || 'assist'}
                </p>
              </div>
              <button
                type="button"
                disabled={invoking === id}
                onClick={() => invoke(id)}
              >
                {invoking === id ? '…' : 'Invoke'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default SkillsPanel;
