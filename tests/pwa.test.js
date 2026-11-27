import assert from 'node:assert/strict'
import test from 'node:test'

test('browser visits are detected independently of installation, including iPhone standalone mode', async () => {
  const { isStandalone, installationUrl } = await import('../src/pwa.js')
  assert.equal(isStandalone({ matches: false }, { standalone: true }), true)
  assert.equal(isStandalone({ matches: true }, {}), true)
  assert.equal(isStandalone({ matches: false }, {}), false)
  assert.equal(installationUrl('qvip.com', 'www.qvip.com'), 'https://qvip.com/?install-pwa=1')
  assert.equal(installationUrl('qvip.com', 'qvip.com'), null)
  assert.equal(installationUrl('qvip.com@invalid.com', 'qvip.com'), null)
  assert.equal(installationUrl('0x7f000001', 'qvip.com'), null)
  assert.equal(installationUrl('qvip.com', 'www.qvip.com', 'pt-BR'), 'https://qvip.com/?install-pwa=1&pwa-lang=pt-BR')
})
