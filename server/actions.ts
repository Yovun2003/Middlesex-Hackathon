import type { Action, Evidence } from '../src/model.ts'

type RecordValue = Record<string, unknown>

export function record(value: unknown): RecordValue {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid request.')
  return value as RecordValue
}

export function text(value: unknown, max = 600, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()))
    throw new Error('Check the required fields and try again.')
  return value.trim()
}

function number(value: unknown, min = 0, max = 100_000): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw new Error('Enter a valid whole number.')
  return value
}

function photo(input: unknown): Evidence | undefined {
  if (input === undefined) return
  const value = record(input)
  const name = text(value.name, 255)
  const preview = value.preview === undefined ? undefined : text(value.preview, 1_500_000)
  if (preview && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(preview))
    throw new Error('Choose a PNG, JPEG, or WebP photo.')
  return { name, preview }
}

export function readAction(input: unknown): Action {
  const value = record(input)
  const type = text(value.type, 32)
  const id = () => text(value.id, 64)
  const incidentId = () => text(value.incidentId, 64)
  switch (type) {
    case 'submitReport': {
      const report = record(value.report)
      const kind = report.type
      if (kind !== 'shortage' && kind !== 'leak') throw new Error('Choose a report type.')
      const reportId = text(report.id, 11)
      if (!/^ND-[A-F0-9]{8}$/.test(reportId)) throw new Error('Invalid report reference.')
      return {
        type,
        report: {
          id: reportId, type: kind, town: text(report.town, 80),
          condition: text(report.condition, 80), description: text(report.description, 600, true),
          ...(kind === 'shortage' ? {
            duration: text(report.duration, 80),
            households: number(report.households, 1, 200),
            requestedLitres: report.requestedLitres === undefined ? undefined : number(report.requestedLitres, 1),
          } : { location: text(report.location, 160), evidence: photo(report.evidence) }),
        },
      }
    }
    case 'verifyReport':
      return { type, reportId: text(value.reportId, 64), estimatedLitres: value.estimatedLitres === undefined ? undefined : number(value.estimatedLitres, 1) }
    case 'assignTanker':
      return { type, incidentId: incidentId(), vehicleId: text(value.vehicleId, 32), approvedLitres: number(value.approvedLitres, 1), destination: text(value.destination, 160) }
    case 'advanceTanker': {
      const step = value.step
      if (step !== 'accepted' && step !== 'en-route' && step !== 'arrived') throw new Error('Invalid assignment step.')
      return { type, id: id(), step }
    }
    case 'recordProblem':
      return { type, id: id(), detail: text(value.detail) }
    case 'recordDelivery':
      return { type, id: id(), actualLitres: number(value.actualLitres) }
    case 'publishDelivery':
    case 'startRepair':
      return { type, id: id() }
    case 'verifyRestoration':
      return { type, incidentId: incidentId(), evidence: text(value.evidence) }
    case 'assignCrew':
      return { type, leakId: text(value.leakId, 64), crew: text(value.crew, 80) }
    case 'inspectRepair':
      return { type, id: id(), inspection: text(value.inspection), evidence: photo(value.evidence) }
    case 'submitRepair':
      return { type, id: id(), work: text(value.work), evidence: photo(value.evidence) }
    case 'verifyRepair':
      return { type, id: id(), evidence: text(value.evidence) }
    case 'publishNotice':
      return { type, town: text(value.town, 80), text: text(value.text, 500) }
    default:
      throw new Error('This operation is unavailable.')
  }
}
