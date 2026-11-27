import type { Report } from './model'

export function assessPriority(reports: Report[]) {
  const longest = Math.max(0, ...reports.map(r => ({ 'Under 12 hours': 12, '12–24 hours': 24, '24–48 hours': 48, 'Over 48 hours': 72 }[r.duration ?? ''] ?? 0)))
  const households = Math.max(0, ...reports.map(r => r.households ?? 0))
  const support = reports.some(r => r.additionalNeeds)
  const heavyLeak = reports.some(r => r.condition === 'Heavy flow')
  const dry = reports.some(r => r.condition === 'No running water')
  const score = (longest >= 48 ? 3 : longest >= 24 ? 2 : 0) + (households >= 20 ? 2 : households >= 5 ? 1 : 0) + (support ? 3 : 0) + (dry ? 2 : 0) + (heavyLeak ? 5 : 0)
  const reasons = [
    longest ? `Longest reported duration: ${longest > 48 ? 'over 48' : `up to ${longest}`} hours.` : null,
    households ? `Largest reported household estimate: ${households}. Overlapping reports are not added together.` : null,
    support ? 'A resident flagged additional support needs.' : null,
    heavyLeak ? 'Heavy escaping flow reported on public infrastructure.' : null,
    dry ? 'At least one report describes no running water.' : null,
  ].filter(Boolean) as string[]
  return { priority: (score >= 5 ? 'Critical' : score >= 2 ? 'High' : 'Moderate') as 'Critical' | 'High' | 'Moderate', score, reasons, households }
}
