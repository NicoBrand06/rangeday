import { EVENT_CATEGORIES, type EventInput } from "@/lib/staff";
import { saveEventAction } from "@/app/staff/actions";

/** Create or edit an event. Used by staff only. */
export default function EventForm({ id, e, minDate }: { id?: number; e: Partial<EventInput>; minDate: string }) {
  return (
    <form action={saveEventAction}>
      {id && <input type="hidden" name="id" value={id} />}
      <label className="field"><span>Title</span><input name="title" className="input" required defaultValue={e.title} /></label>
      <div className="row">
        <label className="field" style={{ flex: "1 1 160px" }}><span>Category</span>
          <select name="category" className="input" defaultValue={e.category ?? "Clinic"}>
            {EVENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: "1 1 160px" }}><span>Places</span>
          <input name="capacity" type="number" min={1} max={500} className="input" required defaultValue={e.capacity ?? 12} />
        </label>
      </div>
      <div className="row">
        <label className="field" style={{ flex: "1 1 160px" }}><span>Date</span><input name="date" type="date" min={minDate} className="input" required defaultValue={e.date} /></label>
        <label className="field" style={{ flex: "1 1 100px" }}><span>Starts</span><input name="start_time" type="time" step={900} className="input" required defaultValue={e.start_time ?? "09:00"} /></label>
        <label className="field" style={{ flex: "1 1 100px" }}><span>Ends</span><input name="end_time" type="time" step={900} className="input" required defaultValue={e.end_time ?? "11:00"} /></label>
      </div>
      <label className="field"><span>Location</span><input name="location" className="input" required defaultValue={e.location} placeholder="e.g. 5-Stand, Field 1" /></label>
      <label className="field"><span>Description</span><textarea name="description" rows={4} className="input" defaultValue={e.description} /></label>
      <button className="btn">{id ? "Save changes" : "Publish event"}</button>
    </form>
  );
}
