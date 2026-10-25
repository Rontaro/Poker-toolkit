import { describe, expect, it } from 'vitest'
import { AmountFormatError, CHIP_SCALE, Money } from '../src/index.js'

const eur = (text: string) => Money.fromDecimalString(text)

describe('Chips', () => {
  it('reads decimal amounts as integers', () => {
    expect(Money.toUnits(eur('0.01'))).toBe(100)
    expect(Money.toUnits(eur('€0.02'))).toBe(200)
    expect(Money.toUnits(eur('1'))).toBe(CHIP_SCALE)
    expect(Money.toUnits(eur('1500'))).toBe(1500 * CHIP_SCALE)
    expect(Money.toUnits(eur('-0.02'))).toBe(-200)
  })

  it('strips currency symbols and thousands separators', () => {
    expect(eur('€1,234.56')).toBe(eur('1234.56'))
    expect(eur('$0.05')).toBe(eur('0.05'))
    expect(eur('1500 EUR')).toBe(eur('1500'))
  })

  it('honours a locale that swaps the separators', () => {
    const commaDecimal = { decimal: ',', thousands: '.' }
    expect(Money.fromDecimalString('1.234,56', commaDecimal)).toBe(eur('1234.56'))
  })

  it('rejects amounts it cannot represent exactly', () => {
    expect(() => eur('')).toThrow(AmountFormatError)
    expect(() => eur('1.2.3')).toThrow(AmountFormatError)
    expect(() => eur('abc')).toThrow(AmountFormatError)
    expect(() => eur('0.123456')).toThrow(AmountFormatError)
  })

  it('does not drift the way floats do', () => {
    expect(Money.add(eur('0.1'), eur('0.2'))).toBe(eur('0.3'))

    let total = Money.ZERO
    for (let i = 0; i < 1000; i += 1) total = Money.add(total, eur('0.01'))
    expect(total).toBe(eur('10'))
    expect(Money.toDecimalString(total)).toBe('10.00')
  })

  it('formats back to the text it came from', () => {
    expect(Money.toDecimalString(eur('0.01'))).toBe('0.01')
    expect(Money.toDecimalString(eur('1.5'))).toBe('1.50')
    expect(Money.toDecimalString(eur('1234.56'))).toBe('1234.56')
    expect(Money.toDecimalString(eur('-0.02'))).toBe('-0.02')
    expect(Money.toDecimalString(eur('1500'), 0)).toBe('1500')
  })

  it('refuses fractional units so rounding bugs cannot hide', () => {
    expect(() => Money.chips(1.5)).toThrow(TypeError)
    expect(() => Money.times(eur('1'), 0.5)).toThrow(TypeError)
  })

  it('splits a pot without losing a unit to rounding', () => {
    const pot = eur('0.05')
    expect(Money.scaleBy(pot, 1, 2)).toBe(eur('0.025'))
    expect(Money.scaleBy(eur('1'), 40, 100)).toBe(eur('0.4'))
  })

  it('normalises to big blinds so cash and tournaments compare', () => {
    expect(Money.toBigBlinds(eur('0.66'), eur('0.02'))).toBe(33)
    expect(Money.toBigBlinds(eur('4950'), eur('150'))).toBe(33)
    expect(Money.toBigBlinds(eur('1'), Money.ZERO)).toBe(0)
  })

  it('converts big blinds back to chips', () => {
    expect(Money.fromBigBlinds(2.5, eur('0.02'))).toBe(eur('0.05'))
  })
})
