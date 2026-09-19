import { describe, expect, it } from 'vitest'
import { slugify } from '@/utilities/formatSlug'

// Slug vzniká z názvu v adminu (hook slugField) i v doběhových skriptech.
// Starý web i první verze hooku písmena bez rozkladu v NFD (ö v Malmö, ø, þ, ł…)
// tiše mazaly — odtud adresy jako /svedsko/malm. Tenhle test hlídá, že se
// přepisují, a že apostrof nedělá pomlčku.
describe('slugify', () => {
  it('rozloží běžnou diakritiku', () => {
    expect(slugify('Údolí králů')).toBe('udoli-kralu')
    expect(slugify('Národní park Snæfellsjökull')).toBe('narodni-park-snaefellsjokull')
    expect(slugify('Klášter Moldovița')).toBe('klaster-moldovita')
  })

  it('přepíše písmena, která NFD nerozkládá', () => {
    expect(slugify('Malmö')).toBe('malmo')
    expect(slugify('Göteborg')).toBe('goteborg')
    expect(slugify('Třída Strøget')).toBe('trida-stroget')
    expect(slugify('Þjóðmenningarhúsið')).toBe('thjodmenningarhusid')
    expect(slugify('Ulice Długa')).toBe('ulice-dluga')
    expect(slugify('Karađozbegova mešita')).toBe('karadozbegova-mesita')
    expect(slugify('Anıtkabir')).toBe('anitkabir')
    expect(slugify('Straße')).toBe('strasse')
  })

  it('apostrofy a uvozovky vypouští, nedělá z nich pomlčku', () => {
    expect(slugify("Fisherman's Wharf")).toBe('fishermans-wharf')
    expect(slugify('Musée d’Aquitaine')).toBe('musee-daquitaine')
    expect(slugify('Arthur´s Pass')).toBe('arthurs-pass')
  })

  it('ostatní znaky spojí do jedné pomlčky a okraje ořízne', () => {
    expect(slugify('  Lodž pohádková  (Lodz bajkowa) ')).toBe('lodz-pohadkova-lodz-bajkowa')
    expect(slugify('Plaza de España')).toBe('plaza-de-espana')
  })
})
