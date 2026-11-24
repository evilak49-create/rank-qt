// Safari exposes pinch gestures separately from standard touch and wheel events.
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, event => event.preventDefault(), { passive: false })
}

document.addEventListener('wheel', event => {
  if (event.ctrlKey || event.metaKey) event.preventDefault()
}, { passive: false })

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && ['+', '=', '-'].includes(event.key)) event.preventDefault()
})
