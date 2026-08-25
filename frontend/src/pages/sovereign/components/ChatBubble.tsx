/**
 * Scaffold: ChatBubble
 * Mythic: conversational turn · Engineering: ChatBubble
 */
import React from 'react';
import TaskCard from './TaskCard';
import type { Message } from '../../../types/aais';

export interface ChatBubbleProps {
  message: Message;
  onOpenReplay?: (traceId: string) => void;
}

function ChatBubble({ message, onOpenReplay }: ChatBubbleProps): React.ReactElement {
  return (
    <article
      className={`sovereign-bubble sovereign-bubble--${message.role}`}
      data-testid={`sovereign-msg-${message.role}`}
      data-scaffold="ChatBubble"
    >
      <div className="sovereign-bubble__meta">
        <strong>{message.role === 'user' ? 'You' : 'AAIS'}</strong>
        {message.traceId ? (
          <button
            type="button"
            className="sovereign-link-btn"
            onClick={() => onOpenReplay?.(message.traceId as string)}
          >
            Replay timeline
          </button>
        ) : null}
      </div>
      <p className="sovereign-bubble__text">{message.text}</p>
      {message.cards?.length ? <TaskCard cards={message.cards} /> : null}
      {message.error ? <p className="sovereign-error">{message.error}</p> : null}
    </article>
  );
}

export default ChatBubble;
