const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBrl(cents) {
  if (cents == null) return '—'
  const digits = String(cents).padStart(3, '0')
  return brl.format(digits.slice(0, -2) + '.' + digits.slice(-2))
}

export function parseBrl(value) {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const cents = Number(match[1] + (match[2] || '').padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}
