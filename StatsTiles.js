.pragma library

// How the stats fill's panels tile a strip, without any QML: the
// dashboard's base size, which panels fit and where each one goes.

// The dashboard's base size, its text height in pixels, for a strip of
// `width` by `height`: an eighth of the short side, within readable bounds.
function unitFor(width, height) {
  return Math.max(9, Math.min(18, Math.floor(Math.min(width, height) / 8)))
}

// Cards are about this wide for their height, and never smaller than this
// many units.
var CARD_ASPECT = 1.8

var CARD_MIN_WIDTH = 14

var CARD_MIN_HEIGHT = 6

// Units of height a card needs for its content: stacked, and wide with
// its rows beside the graphs. A card is wide past this width for its
// height. A short strip is all wide cards, and there larger text with a
// row or two fewer reads better than every row at 9 or 10 px: at 8 units
// a 160 px strip keeps 16 px text and three rows.
var CARD_ROOM = 14

var WIDE_ROOM = 8

var WIDE_CARD = 2

// Units of width a wide card needs for its headline and rows side by
// side. Its height alone let a 300 px card on a portrait strip take 16 px
// text, and every label and value was cut short.
var WIDE_SPAN = 22

// Units of width under which a wide Clock card stacks its digits over its
// rows like a narrow card: beside them, the digits share the width with
// the rows and came out a few pixels high on a half-width card.
var CLOCK_BESIDE_SPAN = 44

// Whether a card puts its headline beside its rows: past WIDE_CARD for
// its height, and for the Clock only when wide enough that its digits
// keep their size.
function wideCard(panel, width, height, unit) {
  if (!(width > height * WIDE_CARD)) return false
  return panel !== "clock" || width >= CLOCK_BESIDE_SPAN * unit
}

function roomy(card, unit) {
  if (card.width > card.height * WIDE_CARD) return card.height >= WIDE_ROOM * unit && card.width >= WIDE_SPAN * unit
  return card.height >= CARD_ROOM * unit
}

// The layout with the largest text that keeps every panel and gives each
// card room for its content: unitFor's size for a few panels, smaller for
// a crowded grid. When nothing makes room, the smallest text shows what
// fits. Returns layout's result with its `unit`.
function fit(panels, width, height) {
  // Not laid out yet: nothing to draw.
  if (!(width > 0 && height > 0)) return { unit: 9, cards: [], dropped: panels.slice() }
  for (var unit = unitFor(width, height); unit >= 9; unit--) {
    var grid = layout(panels, width, height, unit)
    if (grid.dropped.length) continue
    if (grid.cards.every(function(card) { return roomy(card, unit) })) return { unit: unit, cards: grid.cards, dropped: grid.dropped }
  }
  var fallback = layout(panels, width, height, 9)
  return { unit: 9, cards: fallback.cards, dropped: fallback.dropped }
}

// Where each of `panels` goes on a `width` by `height` strip with text
// `unit` pixels high: a grid with a unit of margin and gap, the columns and
// rows picked for the largest cards near CARD_ASPECT, a short last row
// stretched across. Panels that do not fit even one to a card are dropped
// from the end. Returns { cards: [{ panel, x, y, width, height }], dropped }.
function layout(panels, width, height, unit) {
  var gap = unit
  var innerWidth = width - 2 * unit, innerHeight = height - 2 * unit
  for (var count = panels.length; count > 0; count--) {
    var best = null
    for (var columns = 1; columns <= count; columns++) {
      var rows = Math.ceil(count / columns)
      var cardWidth = (innerWidth - gap * (columns - 1)) / columns
      var cardHeight = (innerHeight - gap * (rows - 1)) / rows
      if (cardWidth < CARD_MIN_WIDTH * unit || cardHeight < CARD_MIN_HEIGHT * unit) continue
      var score = Math.min(cardWidth, cardHeight * CARD_ASPECT)
      if (!best || score > best.score) best = { score: score, columns: columns, rows: rows, height: cardHeight }
    }
    if (!best) continue
    var cards = []
    for (var i = 0; i < count; i++) {
      var row = Math.floor(i / best.columns)
      var inRow = row === best.rows - 1 ? count - row * best.columns : best.columns
      var w = (innerWidth - gap * (inRow - 1)) / inRow
      cards.push({
        panel: panels[i],
        x: unit + (i % best.columns) * (w + gap),
        y: unit + row * (best.height + gap),
        width: w,
        height: best.height
      })
    }
    return { cards: cards, dropped: panels.slice(count) }
  }
  return { cards: [], dropped: panels.slice() }
}
