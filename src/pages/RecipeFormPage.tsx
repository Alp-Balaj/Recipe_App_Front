// Placeholder — checkpoint 05 (lane B) replaces this with the real create form.
export default function RecipeFormPage() {
  return (
    <div
      className="scroll"
      style={{
        position: 'absolute',
        inset: 0,
        bottom: 'var(--nav-h, 74px)',
        overflowY: 'auto',
        padding: '54px 18px 16px',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>New recipe</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Share what you're cooking</div>

      <div
        style={{
          marginTop: 18,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--cardsh)',
          borderRadius: 20,
          padding: '22px 18px',
          fontSize: 14.5,
          color: 'var(--muted)',
          lineHeight: 1.5,
        }}
      >
        ✎ The recipe editor is coming soon — you'll be able to add ingredients, steps, and tags right here.
      </div>
    </div>
  )
}
