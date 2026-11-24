const labels = { pending: '待确认', active: '保障中', inactive: '未生效' }

export function protectionStatusLabel(status) {
  return Object.hasOwn(labels, status) ? labels[status] : labels.pending
}
