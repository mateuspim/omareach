.pragma library
.import "Clock.js" as Clock
.import "StatsRows.js" as Rows

// The Clock panel's view, apart from StatsViews.js: the time in the Clock
// fill's blocky digits, then the date, the week, the next reminder, other
// zones and the sun, the last dropped first. `state` is the sampler's
// clockData and the monitor's clockHours (StatsFill), not the samples.
function clockView(v, state, palette, g, room, wide, span) {
  var clock = state.clock
  if (!clock) { v.empty = "Waiting for data"; return }
  var facts = Clock.clockFacts(clock, state.clockHours, span || 0, wide)
  v.digits = facts.digits
  v.valueColor = palette.boxes.clock
  facts.rows.forEach(function(fact) {
    var r = Rows.row(fact.label, fact.text, fact.fraction, palette.boxes.clock)
    if (fact.tip) r.tip = fact.tip
    v.rows.push(r)
  })
  // The zone, unless the zones' rows already say how far they are.
  v.info = clock.zones && clock.zones.length ? "" : Clock.zoneCity(clock.local || "")
}
