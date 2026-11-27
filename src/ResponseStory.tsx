import { useRef, useState, type KeyboardEvent } from 'react'
import { BadgeCheck, ClipboardList, Droplet, Truck, Waves, Wrench } from 'lucide-react'
import { Stage } from './Stage'

const chapters = [
  { label: 'Report', icon: ClipboardList },
  { label: 'Respond', icon: Truck },
  { label: 'Verify', icon: BadgeCheck },
]
const stories = {
  shortage: [
    { title: 'Start with the tap.', copy: 'Tell us whether your tap is dry or the pressure is low. Add your locality and the details that help a coordinator understand the need.', visual: 'tap', phase: 0, status: 'A resident reports a shortage', caption: 'The report reaches the coordinator for review. It is not automatically a public incident.' },
    { title: 'Put the response in motion.', copy: 'A coordinator reviews the incident and assigns an available tanker. The driver records acceptance, travel, arrival, and the actual delivery.', visual: 'tanker', phase: .48, status: 'The assigned driver records progress', caption: 'The tanker illustrates a recorded milestone. It does not show a live GPS location.' },
    { title: 'Close the loop with evidence.', copy: 'The coordinator publishes the delivery record so residents can follow the outcome. Restoring regular water supply requires its own verification.', visual: 'tanker', phase: 1, status: 'The delivery is reviewed and published', caption: 'A delivery record and restoration of regular supply remain separate outcomes.' },
  ],
  leak: [
    { title: 'Make the hidden visible.', copy: 'Describe the flow, choose the locality, and add a road or recognisable landmark. A photo from a safe place can help the crew locate the leak.', visual: 'pipe', phase: 0, status: 'A resident reports a public leak', caption: 'A coordinator reviews the details before publishing an incident or assigning a crew.' },
    { title: 'Give the right crew a clear brief.', copy: 'The coordinator assigns a maintenance crew. The crew records its inspection and repair work against the same incident.', visual: 'pipe', phase: .5, status: 'The crew records the repair work', caption: 'The cutaway explains a repair stage. Actual work is recorded by the assigned crew.' },
    { title: 'A repair deserves a second look.', copy: 'The crew submits its work and supporting evidence. A coordinator verifies the outcome before the public incident is marked repaired.', visual: 'pipe', phase: 1, status: 'The coordinator verifies the repair', caption: 'Submitted work stays separate from a verified outcome.' },
  ],
} as const

export function ResponseStory() {
  const [kind, setKind] = useState<'shortage' | 'leak'>('shortage')
  const [step, setStep] = useState(0)
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const story = stories[kind][step]
  function navigate(event: KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null
    if (next === null) return
    event.preventDefault()
    setStep(next)
    tabs.current[next]?.focus()
  }
  return <section id="how-it-works" className="response-story" aria-labelledby="response-heading">
    <div className="container">
      <div className="story-heading"><div><p className="eyebrow">One connected response</p><h2 id="response-heading" tabIndex={-1}>From your street.<br /><em>To the next step.</em></h2></div><p>Residents, coordinators, and field teams.{' '}<br />A shared record, from report to verified outcome.</p></div>
      <div className="story-grid">
        <div className="story-controls">
          <div className="story-kinds" role="group" aria-label="Explore a response type">
            <button type="button" aria-pressed={kind === 'shortage'} onClick={() => setKind('shortage')}><Droplet size={16} /> Water shortage</button>
            <button type="button" aria-pressed={kind === 'leak'} onClick={() => setKind('leak')}><Waves size={17} /> Public leak</button>
          </div>
          <div className="story-tabs" role="tablist" aria-label="Response stages">
            {chapters.map(({ label, icon: Icon }, index) => <button key={label} ref={node => { tabs.current[index] = node }} id={`story-tab-${index}`} type="button" role="tab" aria-selected={step === index} aria-controls="story-panel" tabIndex={step === index ? 0 : -1} onClick={() => setStep(index)} onKeyDown={event => navigate(event, index)}><span>{index === 1 && kind === 'leak' ? <Wrench size={19} /> : <Icon size={19} />}</span>{label}</button>)}
          </div>
          <div id="story-panel" role="tabpanel" tabIndex={0} aria-labelledby={`story-tab-${step}`} className="story-panel">
            <h3>{story.title}</h3><p>{story.copy}</p>
          </div>
          <p className="illustration-disclosure">Interactive walkthrough · Illustrative stages, not an active case</p>
        </div>
        <Stage visual={story.visual} phase={story.phase} title={kind === 'shortage' ? 'Understanding a shortage response' : 'Understanding a leak response'} status={story.status}>{story.caption}</Stage>
      </div>
    </div>
  </section>
}
