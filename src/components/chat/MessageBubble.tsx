import type { ChatMessageResponse } from '@/api/chat'
import SuggestionCard from './SuggestionCard'

/** One turn in the thread: the bubble, plus any suggestion cards beneath it. */
export default function MessageBubble({ message }: { message: ChatMessageResponse }) {
  const isUser = message.role === 'user'

  return (
    <div>
      <div
        style={
          isUser
            ? {
                background: 'var(--accent)',
                color: 'var(--accent-ink)',
                borderRadius: '18px 6px 18px 18px',
                padding: '14px 16px',
                fontSize: 15,
                lineHeight: 1.5,
                margin: '0 0 12px auto',
                maxWidth: '82%',
                fontWeight: 500,
                whiteSpace: 'pre-wrap',
              }
            : {
                background: 'var(--surface2)',
                borderRadius: '6px 18px 18px 18px',
                padding: '14px 16px',
                fontSize: 15,
                lineHeight: 1.5,
                marginBottom: message.suggestedRecipes.length > 0 ? 12 : 14,
                maxWidth: '88%',
                whiteSpace: 'pre-wrap',
              }
        }
      >
        {message.content}
      </div>

      {message.suggestedRecipes.map((recipe) => (
        <SuggestionCard key={recipe.id} recipe={recipe} />
      ))}
    </div>
  )
}

/** The assistant "typing…" placeholder shown while a reply is in flight. */
export function TypingBubble() {
  return (
    <div
      aria-label="Assistant is typing"
      style={{
        background: 'var(--surface2)',
        borderRadius: '6px 18px 18px 18px',
        padding: '14px 18px',
        marginBottom: 14,
        maxWidth: '88%',
        display: 'inline-flex',
        gap: 5,
        alignItems: 'center',
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'var(--muted)',
            display: 'inline-block',
            animation: 'chat-typing 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
    </div>
  )
}
