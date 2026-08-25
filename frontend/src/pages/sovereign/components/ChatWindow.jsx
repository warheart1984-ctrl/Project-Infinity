import React from 'react';
import { Link } from 'react-router-dom';
import TaskCards from './TaskCards';

/**
 * Mythic: Chat surface
 * Engineering: ChatWindow
 */
function ChatWindow({
  messages = [],
  adaptiveMode,
  onOpenReplay,
  loading,
  dense = false,
}) {
  return (
    <section
      className={`sovereign-chat${dense ? ' sovereign-chat--dense' : ''}`}
      data-testid="sovereign-chat-window"
      aria-live="polite"
    >
      <header className="sovereign-chat__header">
        <div>
          <p className="sovereign-kicker">Assistant</p>
          <h2>Chat</h2>
        </div>
        <div className="sovereign-chat__mode" data-testid="sovereign-adaptive-mode">
          <span className="sovereign-badge">
            Adaptive: {adaptiveMode?.mode || 'idle'}
            {adaptiveMode?.status ? ` · ${adaptiveMode.status}` : ''}
          </span>
          {adaptiveMode?.deepLink ? (
            <Link to={adaptiveMode.deepLink || '/adaptive-music'}>Score</Link>
          ) : (
            <Link to="/adaptive-music">Score</Link>
          )}
        </div>
      </header>

      <div className="sovereign-chat__messages">
        {messages.length === 0 ? (
          <div className="sovereign-empty">
            <p>Ask in plain language. Dispatch hits the Constitutional Task Bus.</p>
            <p className="sovereign-muted">
              Example: Make a follow-up task for Sarah tomorrow and sync it to Microsoft.
            </p>
          </div>
        ) : null}
        {messages.map((msg) => (
          <article
            key={msg.id}
            className={`sovereign-bubble sovereign-bubble--${msg.role}`}
            data-testid={`sovereign-msg-${msg.role}`}
          >
            <div className="sovereign-bubble__meta">
              <strong>{msg.role === 'user' ? 'You' : 'AAIS'}</strong>
              {msg.traceId ? (
                <button type="button" className="sovereign-link-btn" onClick={() => onOpenReplay?.(msg.traceId)}>
                  Replay timeline
                </button>
              ) : null}
            </div>
            <p className="sovereign-bubble__text">{msg.text}</p>
            {msg.cards?.length ? <TaskCards cards={msg.cards} /> : null}
            {msg.error ? <p className="sovereign-error">{msg.error}</p> : null}
          </article>
        ))}
        {loading ? (
          <article className="sovereign-bubble sovereign-bubble--assistant">
            <p className="sovereign-muted">Dispatching…</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}

export default ChatWindow;
