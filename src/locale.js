import { inject, provide, ref } from 'vue'
import { portuguese } from './portuguese.js'

const languageKey = Symbol('language')
const defaultLocale = ref('zh-CN')

function createLocale(locale) {
  const t = (message, translation) => locale.value === 'pt-BR'
    ? translation ?? (Object.hasOwn(portuguese, message) ? portuguese[message] : message)
    : message
  return { locale, t }
}

export function provideLocale(language) {
  provide(languageKey, language)
  return createLocale(language)
}

export function useLocale() {
  return createLocale(inject(languageKey, defaultLocale))
}
