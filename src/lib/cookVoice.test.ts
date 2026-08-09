import { describe, expect, it } from 'vitest'
import { composeSpokenStep, matchCommand, speakClock, spokenIngredient } from './cookVoice'
import type { RecipeIngredient } from '@/api/types'

const ing = (name: string, quantity: number, unit: RecipeIngredient['unit']): RecipeIngredient => ({
  name,
  quantity,
  unit,
})

describe('matchCommand', () => {
  it('matches the six commands through casing and punctuation', () => {
    expect(matchCommand('Next.')).toBe('next')
    expect(matchCommand('go back')).toBe('back')
    expect(matchCommand('Repeat that')).toBe('repeat')
    expect(matchCommand('start the timer')).toBe('startTimer')
    expect(matchCommand('Pause timer')).toBe('pauseTimer')
    expect(matchCommand('how long left?')).toBe('howLong')
  })

  it('does not match questions — they fall through to the assistant', () => {
    expect(matchCommand('can I use margarine instead of butter')).toBeNull()
    expect(matchCommand('what does the next step say about resting')).toBeNull()
    expect(matchCommand('')).toBeNull()
  })

  it('matches whole phrases only, not substrings', () => {
    // "next" inside a sentence is a question about the recipe, not a command.
    expect(matchCommand('is the next bit hard')).toBeNull()
  })
})

describe('speakClock', () => {
  it('speaks seconds, minutes and hours in words', () => {
    expect(speakClock(45)).toBe('45 seconds')
    expect(speakClock(480)).toBe('8 minutes')
    expect(speakClock(510)).toBe('8 minutes 30 seconds')
    expect(speakClock(3840)).toBe('1 hour 4 minutes')
    expect(speakClock(61)).toBe('1 minute 1 second')
  })

  it('floors and never goes below zero, like formatClock', () => {
    expect(speakClock(-5)).toBe('0 seconds')
    expect(speakClock(59.9)).toBe('59 seconds')
  })
})

describe('spokenIngredient', () => {
  it('speaks full unit words, pluralized by quantity', () => {
    expect(spokenIngredient(ing('flour', 400, 'Gram'))).toBe('400 grams flour')
    expect(spokenIngredient(ing('milk', 1, 'Cup'))).toBe('1 cup milk')
  })

  it('drops the unit word for pieces and the number for to-taste', () => {
    expect(spokenIngredient(ing('egg', 2, 'Piece'))).toBe('2 egg')
    expect(spokenIngredient(ing('salt', 1, 'ToTaste'))).toBe('salt, to taste')
  })
})

describe('composeSpokenStep', () => {
  it('is the prose verbatim when nothing is used and the factor is 1', () => {
    expect(
      composeSpokenStep({ description: 'Fold gently.', used: [], factor: 1, servings: 4 }),
    ).toBe('Fold gently.')
  })

  it('appends the scaled ingredient lines', () => {
    const spoken = composeSpokenStep({
      description: 'Add the flour.',
      used: [ing('flour', 400, 'Gram')],
      factor: 1,
      servings: 4,
    })
    expect(spoken).toBe('Add the flour. Using: 400 grams flour.')
  })

  it('states that spoken quantities win when a scale factor is active (D17)', () => {
    const spoken = composeSpokenStep({
      description: 'Add 200 grams of flour.',
      used: [ing('flour', 400, 'Gram')],
      factor: 2,
      servings: 8,
    })
    expect(spoken).toBe(
      'Add 200 grams of flour. Using: 400 grams flour. ' +
        'Quantities are scaled to 8 servings — where a number in the step disagrees, ' +
        'the spoken amounts are the ones to follow.',
    )
  })
})
