import { lazy, Suspense, useState } from 'react'
import { getPlace, type Coordinate } from './geo'
import { TOWNS } from './model'
const GeoMap = lazy(() => import('./GeoMap'))
type Point = { latitude: number; longitude: number }
export function LocationPicker({ value, town, onChange, onTown }: { value?: Point; town: string; onChange: (p?: Point) => void; onTown: (town: string) => void }) {
  const [open,setOpen]=useState(false)
  const [error,setError]=useState('')
  function pick(p:Coordinate) {
    if(p[0]<57.25||p[0]>57.9||p[1]<-20.6||p[1]>-19.9){setError('Choose a location on Mauritius.');return}
    setError('');onChange({longitude:p[0],latitude:p[1]})
    const nearest=[...TOWNS].sort((a,b)=>{const x=getPlace(a)!,y=getPlace(b)!;return Math.hypot(x[0]-p[0],x[1]-p[1])-Math.hypot(y[0]-p[0],y[1]-p[1])})[0]
    onTown(nearest)
  }
  return <section className="report-location" aria-label="Report location">
    <strong>Exact location <small>Optional</small></strong>
    <p>Drop a pin to help the response team find you. Your household pin is shared with authorised response staff, not the public map.</p>
    <button className="wf-button wf-button--quiet" type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Close location map':value?'Change map pin':'Choose location on map'}</button>
    {open && <><p>Zoom in and tap the location. You can drag the pin to adjust it.</p><div className="report-location-map"><Suspense fallback={<p>Loading map…</p>}><GeoMap incidents={[]} onSelect={()=>{}} center={getPlace(town)} pin={value?[value.longitude,value.latitude]:undefined} onPick={pick}/></Suspense></div><p>For keyboard selection, move the map with arrow keys and choose “Use centre of map”.</p></>}
    {value && <div className="location-confirmation"><span>Location selected · {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}</span><button type="button" className="text-button" onClick={()=>onChange(undefined)}>Remove pin</button></div>}
    {error&&<p role="alert">{error}</p>}
  </section>
}
