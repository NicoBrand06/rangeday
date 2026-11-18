import { EVENT_CATEGORIES, type EventInput } from "@/lib/events";
import { saveEventAction } from "@/app/staff/events/actions";
import SubmitButton from "./SubmitButton";

/** Create or edit an event. Used by staff only. */
export default function EventForm({ id, e, minDate, inSeries, repeat }: { id?: number; e: Partial<EventInput>; minDate: string; inSeries?: boolean; repeat?: string }) {
  return (
    <form action={saveEventAction}>
      {id && <input type="hidden" name="id" value={id} />}
      <label className="field"><span>Title</span><input name="title" className="input" required defaultValue={e.title} /></label>
      <div className="row">
        <label className="field" style={{ flex: "1 1 160px" }}><span>Category</span>
          <select name="category" className="input" defaultValue={e.category ?? "Social"}>
            {EVENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: "1 1 160px" }}><span>Places</span>
          <input name="capacity" type="number" min={1} max={1000} className="input" required defaultValue={e.capacity ?? 12} />
        </label>
      </div>
      <div className="row">
        <label className="field" style={{ flex: "1 1 160px" }}>
          <span>{id ? "Date" : "Date (first date, if repeating)"}</span>
          <input name="date" type="date" min={minDate} className="input" required defaultValue={e.date} readOnly={inSeries} aria-describedby={inSeries ? "date-note" : undefined} />
        </label>
        <label className="field" style={{ flex: "1 1 100px" }}><span>Starts</span><input name="start_time" type="time" step={900} className="input" required defaultValue={e.start_time ?? "09:00"} /></label>
        <label className="field" style={{ flex: "1 1 100px" }}><span>Ends</span><input name="end_time" type="time" step={900} className="input" required defaultValue={e.end_time ?? "11:00"} /></label>
      </div>
      {inSeries && <p id="date-note" className="muted">Dates in a repeating series can&apos;t be moved. To move one, cancel this date and create a one-off.</p>}
      {!id && (
        <label className="field"><span>Repeats</span>
          <select name="repeat" className="input" defaultValue={repeat ?? "none"}>
            <option value="none">Doesn&apos;t repeat (one-off)</option>
            <option value="weekly">Every week, same weekday</option>
            <option value="monthly">Every month, same week and weekday (e.g. first Saturday)</option>
            <option value="yearly">Every year, same date</option>
          </select>
        </label>
      )}
      <label className="field"><span>Location</span><input name="location" className="input" required defaultValue={e.location} placeholder="e.g. 5-Stand" /></label>
      <label className="field"><span>Description</span><textarea name="description" rows={4} className="input" defaultValue={e.description} /></label>
      {inSeries && (
        <fieldset className="field" style={{ border: 0 }}>
          <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--navy2)" }}>Apply changes to</span>
          <label className="row" style={{ marginTop: 4 }}><input type="radio" name="scope" value="one" defaultChecked /> Only this date</label>
          <label className="row"><input type="radio" name="scope" value="future" /> This and all later dates</label>
        </fieldset>
      )}
      <SubmitButton>{id ? "Save changes" : "Publish event"}</SubmitButton>
    </form>
  );
}
