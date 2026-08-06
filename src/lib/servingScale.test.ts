import { describe, expect, it } from 'vitest'
import {
  formatFactor,
  scaleFactor,
  scaleIngredients,
  scaleQuantity,
} from './servingScale'
import type { RecipeIngredient } from '@/api/types'

// Decision D17's arithmetic, and the mirror of the backend's ServingScaleTests.
// The assertions that matter are about what scaling is ALLOWED to touch — the
// multiplication is the part nothing can get wrong.
describe('servingScale', () => {
  const line = (name: string, quantity: number, unit: RecipeIngredient['unit']): RecipeIngredient => ({
    name,
    quantity,
    unit,
  })

  it('is the ratio of the two serving counts', () => {
    expect(scaleFactor(4, 8)).toBe(2)
    expect(scaleFactor(4, 2)).toBe(0.5)
    expect(scaleFactor(4, 4)).toBe(1)
  })

  it('refuses to divide by a recipe that serves nobody', () => {
    expect(scaleFactor(0, 8)).toBe(1)
    expect(scaleFactor(4, 0)).toBe(1)
    expect(scaleFactor(Number.NaN, 8)).toBe(1)
  })

  it('scales a quantity and rounds to the two decimals formatQuantity renders', () => {
    expect(scaleQuantity(250, 'Gram', 2)).toBe(500)
    expect(scaleQuantity(1, 'Cup', 1 / 3)).toBe(0.33)
  })

  it('leaves ToTaste alone — its number is never rendered', () => {
    expect(scaleQuantity(1, 'ToTaste', 4)).toBe(1)
  })

  it('does scale the other imprecise units', () => {
    // A handful of spinach for two is not a handful for eight; leaving these
    // unscaled would silently under-season a doubled recipe.
    expect(scaleQuantity(1, 'Handful', 4)).toBe(4)
    expect(scaleQuantity(1, 'Pinch', 2)).toBe(2)
  })

  it('lets count units come out fractional rather than quietly changing the recipe', () => {
    expect(scaleQuantity(1, 'Piece', 0.5)).toBe(0.5)
  })

  it('returns a new list and leaves the original untouched', () => {
    // Scaling is a VIEW. The frozen snapshot cook mode holds must not be mutated
    // by looking at it differently.
    const original = [line('flour', 250, 'Gram'), line('pepper', 1, 'ToTaste')]
    const scaled = scaleIngredients(original, 4, 8)

    expect(scaled[0].quantity).toBe(500)
    expect(scaled[1].quantity).toBe(1)
    expect(original[0].quantity).toBe(250)
    expect(scaled[0]).not.toBe(original[0])
  })

  it('carries stream G\'s catalogue id through', () => {
    const original = [{ ...line('flour', 100, 'Gram'), ingredientId: 'abc' }]
    expect(scaleIngredients(original, 2, 4)[0].ingredientId).toBe('abc')
  })

  it('announces the factor the way the banner shows it', () => {
    expect(formatFactor(2)).toBe('×2')
    expect(formatFactor(0.5)).toBe('×0.5')
    expect(formatFactor(4 / 3)).toBe('×1.33')
  })
})
