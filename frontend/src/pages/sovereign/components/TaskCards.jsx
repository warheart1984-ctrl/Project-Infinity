import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Mythic: Inline capability cards
 * Engineering: TaskCards
 */
const TYPE_LABEL = {
  aais: 'AAIS Task',
  crm: 'CRM',
  graph: 'Graph',
  mandala: 'Mandala',
  image: 'Image',
  spreadsheet: 'Excel',
};

function TaskCards({ cards = [] }) {
  if (!cards.length) return null;
  return (
    <div className="sovereign-cards" data-testid="sovereign-task-cards">
      {cards.map((card) => (
        <article key={card.id} className={`sovereign-card sovereign-card--${card.type}`}>
          <p className="sovereign-card__type">{TYPE_LABEL[card.type] || card.type}</p>
          <h3>{card.title}</h3>
          {card.body ? <p>{String(card.body)}</p> : null}
          {card.href ? (
            <Link to={card.href} className="sovereign-card__link">
              Open
            </Link>
          ) : null}
          {card.meta?.skipped ? (
            <p className="sovereign-muted">Skipped: {card.meta.reason || 'policy'}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export default TaskCards;
