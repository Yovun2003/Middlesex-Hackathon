import { describe, expect, it } from 'vitest'
import { assessPriority } from '../../src/priority'
import type { Report } from '../../src/model'

const report: Report = { id: 'ND-CC000001', type: 'shortage', town: 'Curepipe', condition: 'Low pressure', duration: 'Under 12 hours', households: 1, description: '', createdAt: '2026-11-27T00:00:00Z', source: 'resident', status: 'received' }
describe('explainable prioritisation', () => {
  it('does not increase priority just because more overlapping reports arrive', () => { expect(assessPriority(Array.from({ length: 50 }, () => report)).priority).toBe('Moderate'); expect(assessPriority([report, report]).households).toBe(1) })
  it('considers duration, lack of water and additional support needs', () => { const result = assessPriority([{ ...report, duration: 'Over 48 hours', condition: 'No running water', additionalNeeds: true }]); expect(result.priority).toBe('Critical'); expect(result.reasons).toHaveLength(4) })
  it('recognises heavy public leakage independently of complaint count', () => { expect(assessPriority([{ ...report, type: 'leak', duration: undefined, households: undefined, condition: 'Heavy flow' }]).priority).toBe('Critical') })
})
