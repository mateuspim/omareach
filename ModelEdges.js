.pragma library
.import "Model.js" as Model

// Edge sizes, without any QML: aspect presets, the ruler's ticks and the
// limits, snapping and dragging of the panel's sliders.

// Aspect presets: the reachable area's width over height. `start` puts the
// reachable area at the top or left, `end` at the bottom or right.
var ASPECTS = ["21:9", "16:9", "4:3", "1:1"]

var ALIGNS = ["start", "center", "end"]

// "16:9", "16/9" or "1.78" as a number; 0 when it is not a positive ratio.
function parseAspect(text) {
  var parts = String(text).split(/[:\/x]/)
  var value = parts.length === 2 ? Number(parts[0]) / Number(parts[1]) : Number(text)
  return isFinite(value) && value > 0 ? value : 0
}

// "top" and "left" mean start, "bottom" and "right" end; "" for anything
// that is not an alignment.
function alignment(text) {
  text = String(text).toLowerCase()
  if (text === "start" || text === "top" || text === "left") return "start"
  if (text === "end" || text === "bottom" || text === "right") return "end"
  return text === "center" || text === "middle" ? "center" : ""
}

function nextAlign(align) {
  return ALIGNS[(ALIGNS.indexOf(align) + 1) % ALIGNS.length]
}

// The edges that leave a `width` by `height` screen a reachable area of
// `aspect`, placed by `align` along the axis that is cut. Only the pair of
// edges on that axis is reserved; center gives the odd pixel to the end.
function aspectEdges(width, height, aspect, align) {
  var edges = { top: 0, bottom: 0, left: 0, right: 0 }
  if (!(width > 0 && height > 0 && aspect > 0)) return edges
  var wide = width / height > aspect
  var cut = wide ? width - Math.round(height * aspect) : height - Math.round(width / aspect)
  var first = wide ? "left" : "top", second = wide ? "right" : "bottom"
  var before = align === "start" ? 0 : align === "end" ? cut : Math.floor(cut / 2)
  edges[first] = before
  edges[second] = cut - before
  return fit(edges, width, height)
}

// Where the reserved edges put the reachable area along the screen's long
// axis, for an alignment control that starts from what is on screen.
function inferAlign(entry, width, height) {
  var vertical = height > width
  var before = vertical ? entry.top : entry.left
  var after = vertical ? entry.bottom : entry.right
  return before === after ? "center" : before > after ? "end" : "start"
}

// The name of the reachable area's place for `align` on a screen of this
// shape: portrait screens are cut top and bottom, landscape ones mostly on
// the sides.
function alignName(align, width, height) {
  var vertical = height > width
  if (align === "start") return vertical ? "Top" : "Left"
  if (align === "end") return vertical ? "Bottom" : "Right"
  return "Center"
}

// The preset in ASPECTS whose edges `entry` reserves exactly for `align`,
// or "" when none does.
function matchingAspect(entry, width, height, align) {
  for (var i = 0; i < ASPECTS.length; i++) {
    var edges = aspectEdges(width, height, parseAspect(ASPECTS[i]), align)
    if (Model.EDGES.every(function(edge) { return edges[edge] === entry[edge] })) return ASPECTS[i]
  }
  return ""
}

// The marks of a ruler running `length` pixels in from a screen edge: a
// tick every 10 px, a longer one every 50 and a labelled one every 100.
function rulerTicks(length) {
  var ticks = []
  for (var at = 10; at <= length; at += 10)
    ticks.push({ at: at, size: at % 100 === 0 ? 3 : at % 50 === 0 ? 2 : 1, label: at % 100 === 0 ? String(at) : "" })
  return ticks
}

// Never let a typo swallow the whole monitor: a tenth of each axis stays
// usable, so the bar and the panel remain reachable. Opposite edges share
// that budget, so `oppositePixels` comes off the limit.
function limit(side, width, height, oppositePixels) {
  var size = Model.isHorizontal(side) ? height : width
  if (!(size > 0)) return 4000
  return Math.max(0, Math.floor(size * 0.9) - Model.pixels(oppositePixels))
}

// Applies the same budget to a whole entry, for values that never went
// through the panel: hand edits, or a monitor that changed to a smaller mode.
// The first edge of each pair keeps what it can and the second gets the rest.
function fit(entry, width, height) {
  var result = Object.assign({}, entry)
  var pairs = [["top", "bottom"], ["left", "right"]]
  for (var i = 0; i < pairs.length; i++) {
    var first = pairs[i][0], second = pairs[i][1]
    result[first] = Math.min(Model.pixels(result[first]), limit(first, width, height, 0))
    result[second] = Math.min(Model.pixels(result[second]), limit(second, width, height, result[first]))
  }
  return result
}

function snap(value, grid) {
  return grid > 1 ? Math.round(value / grid) * grid : Math.round(value)
}

// Converts a drag in the monitor preview into a reservation for `side`:
// the value at press time plus the pointer's travel towards the middle.
// `scale` is preview pixels per screen pixel.
function fromDrag(side, start, dx, dy, scale, grid, max) {
  if (!(scale > 0)) return Model.clamp(Model.pixels(start), 0, max)
  var inward = side === "top" ? dy
    : side === "bottom" ? -dy
    : side === "left" ? dx
    : -dx
  return Model.clamp(snap(Model.pixels(start) + inward / scale, grid), 0, max)
}

function nudge(value, delta, max) {
  return Model.clamp(Model.pixels(value) + delta, 0, max)
}

// Whole wheel notches (120 units each) in `rest`, which accumulates
// angleDelta; touchpads send many small deltas that add up to one notch.
function notches(rest) {
  return rest < 0 ? Math.ceil(rest / 120) : Math.floor(rest / 120)
}
