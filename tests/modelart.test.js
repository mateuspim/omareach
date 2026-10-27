import assert from "node:assert/strict"
import { Art, run } from "./modelfixtures.js"

// ModelArt.js: the clock and logo bitmaps and their layout.

const tests = {
  "clockText is 24-hour HH:MM"() {
    assert.equal(Art.clockText(new Date(2026, 8, 29, 7, 5)), "07:05")
    assert.equal(Art.clockText(new Date(2026, 8, 29, 23, 59)), "23:59")
    assert.equal(Art.clockText(new Date(2026, 8, 29, 7, 5), 24), "07:05")
  },
  "clockText in 12-hour time has no leading zero"() {
    assert.equal(Art.clockText(new Date(2026, 8, 29, 7, 5), 12), "7:05")
    assert.equal(Art.clockText(new Date(2026, 8, 29, 0, 30), 12), "12:30")
    assert.equal(Art.clockText(new Date(2026, 8, 29, 12, 0), 12), "12:00")
    assert.equal(Art.clockText(new Date(2026, 8, 29, 23, 59), 12), "11:59")
  },
  "clockLayout puts the date under or beside the time, whichever keeps it bigger"() {
    const plain = (w, h) => Art.clockLayout("12:34", w, h).cell
    // A tall top edge: under the time, at full size.
    const tall = Art.clockLayout("12:34", 1080, 660, true)
    assert.equal(tall.date, "under")
    assert.equal(tall.cell, plain(1080, 660))
    assert.ok((tall.spanRows + 2) * tall.cell <= 660)
    // A short edge on a portrait monitor gives up some size for it.
    const short = Art.clockLayout("12:34", 1080, 460, true)
    assert.equal(short.date, "under")
    assert.ok(short.cell >= plain(1080, 460) * Art.DATE_KEEP)
    // A short wide strip: beside the time, which keeps its size.
    for (const [w, h] of [[2560, 160], [2560, 300], [3440, 400]]) {
      const strip = Art.clockLayout("12:34", w, h, true)
      assert.equal(strip.date, "beside", `${w}x${h}`)
      assert.equal(strip.cell, plain(w, h))
      assert.ok((strip.spanColumns + 2) * strip.cell <= w)
      assert.equal(strip.dateBox.x, strip.columns + Art.DATE_GAP)
    }
    // Where neither keeps most of the time's size, no date.
    assert.equal(Art.clockLayout("12:34", 400, 150, true).date, "")
    // The place holds whatever the time: a narrow 12-hour "3:24" does not
    // lose the date that "12:34" has.
    assert.equal(Art.clockLayout("3:24", 1080, 460, true).date, "under")
    for (const text of ["1:05", "9:59", "10:00", "12:59"]) assert.equal(Art.clockLayout(text, 2560, 160, true).date, "beside")
    // Without asking, never.
    assert.equal(Art.clockLayout("12:34", 1080, 660).date, "")
    assert.equal(Art.clockLayout("12:34", 1080, 660).dateBox, null)
  },
  "clockBitmap lays glyphs out with a gap"() {
    const one = Art.clockBitmap("1")
    assert.equal(one.columns, 3)
    assert.equal(one.cells.length, 8)
    const time = Art.clockBitmap("12:34")
    assert.equal(time.columns, 3 + 1 + 3 + 1 + 1 + 1 + 3 + 1 + 3)
    assert.equal(time.rows, 5)
    assert.ok(time.cells.some(cell => cell.x === 8 && cell.y === 1), "colon's top dot")
    assert.ok(time.cells.every(cell => cell.x < time.columns && cell.y < 5))
    const stacked = Art.clockBitmap(["12", "34"])
    assert.equal(stacked.columns, 7)
    assert.equal(stacked.rows, 11)
    assert.ok(stacked.cells.some(cell => cell.y === 10))
  },
  "clockLayout stays upright and picks the bigger blocks"() {
    const wide = Art.clockLayout("12:34", 1080, 460)
    assert.equal(wide.columns, 17)
    assert.equal(wide.cell, 56)
    const tall = Art.clockLayout("12:34", 510, 1460)
    assert.equal(tall.columns, 7)
    assert.equal(tall.rows, 11)
    assert.equal(tall.cell, 56)
    assert.ok(Art.clockLayout("12:34", 30, 20).cell < 2)
  },
  "a 12-hour clock keeps its size and shape all day"() {
    // DP-4's top edge, with and without the date, and a size where "1:05"
    // alone would go on one line and "12:59" on two.
    for (const [w, h, dated] of [[1440, 590, false], [1440, 590, true], [120, 100, false], [648, 300, true]]) {
      const shapes = ["1:05", "9:59", "10:00", "12:59"].map(text => Art.clockLayout(text, w, h, dated))
      for (const layout of shapes) {
        for (const key of ["cell", "columns", "rows", "spanColumns", "spanRows", "date"]) assert.equal(layout[key], shapes[3][key], `${w}x${h} ${key}`)
        assert.ok(layout.cells.every(c => c.x >= 0 && c.x < layout.columns), `${w}x${h} inside`)
      }
    }
    // The narrower time is centered: "1:05" starts two blocks in.
    assert.equal(Math.min(...Art.clockLayout("1:05", 1440, 590).cells.map(c => c.x)), 2)
  },
  "clockShift moves every 5 minutes within one cell"() {
    assert.deepEqual({ ...Art.clockShift(new Date(2026, 8, 29, 0, 4)) }, { x: 0, y: 0 })
    assert.deepEqual({ ...Art.clockShift(new Date(2026, 8, 29, 0, 5)) }, { x: 1, y: 0 })
    for (let minute = 0; minute < 1440; minute += 5) {
      const shift = Art.clockShift(new Date(2026, 8, 29, 0, minute))
      assert.ok(Math.abs(shift.x) <= 1 && Math.abs(shift.y) <= 1)
    }
  },
  "logoStep is a fiftieth of the smaller side, at least a pixel"() {
    assert.equal(Art.logoStep(400, 100), 2)
    assert.equal(Art.logoStep(20, 10), 1)
  },
  "untilNextMinute counts down to the minute"() {
    assert.equal(Art.untilNextMinute(new Date(2026, 8, 29, 7, 5, 59, 900)), 100)
    assert.equal(Art.untilNextMinute(new Date(2026, 8, 29, 7, 5, 0, 0)), 60000)
  },
  "untilNextShift counts down to the next clockShift move"() {
    assert.equal(Art.untilNextShift(new Date(2026, 8, 29, 7, 9, 59, 900)), 100)
    assert.equal(Art.untilNextShift(new Date(2026, 8, 29, 7, 5, 0, 0)), 300000)
    const before = new Date(2026, 8, 29, 7, 7, 30, 0)
    const after = new Date(before.getTime() + Art.untilNextShift(before))
    assert.notDeepEqual({ ...Art.clockShift(after) }, { ...Art.clockShift(before) })
  },
  "CLOCK_CELLS covers every time on either layout"() {
    for (let minutes = 0; minutes < 24 * 60; minutes++) {
      const text = Art.clockText(new Date(2026, 8, 29, Math.floor(minutes / 60), minutes % 60))
      assert.ok(Art.clockLayout(text, 1000, 100).cells.length <= Art.CLOCK_CELLS)
      assert.ok(Art.clockLayout(text, 100, 1000).cells.length <= Art.CLOCK_CELLS)
    }
  },
  "imageOffset lines a full-screen image up with the strip"() {
    assert.deepEqual({ ...Art.imageOffset("top", 400, 1080, 1920) }, { x: 0, y: 0 })
    assert.deepEqual({ ...Art.imageOffset("bottom", 400, 1080, 1920) }, { x: 0, y: -1520 })
    assert.deepEqual({ ...Art.imageOffset("left", 40, 1080, 1920) }, { x: 0, y: 0 })
    assert.deepEqual({ ...Art.imageOffset("right", 40, 1080, 1920) }, { x: -1040, y: 0 })
  },
  "svgAspect reads the viewBox, then width and height"() {
    assert.equal(Art.svgAspect('<svg fill="none" height="285" viewBox="0 0 1215 285" width="1215">', 4), 1215 / 285)
    assert.equal(Art.svgAspect('<svg viewBox="-10,-10, 200,100">', 4), 2)
    assert.equal(Art.svgAspect('<svg width="300" height="100">', 4), 3)
    assert.equal(Art.svgAspect("<svg>", 4), 4)
    assert.equal(Art.svgAspect("", 4), 4)
  },
  "recolorSvg repaints black fills and leaves the rest"() {
    assert.equal(Art.recolorSvg('<svg fill="none"><g fill="#000"><path fill="black"/></g></svg>', "#d8a657"),
      '<svg fill="none"><g fill="#d8a657"><path fill="#d8a657"/></g></svg>')
  },
  "blockBitmap reads two characters per cell"() {
    const art = Art.blockBitmap("████  ██\n██    ██\n")
    assert.equal(art.columns, 4)
    assert.equal(art.rows, 2)
    assert.deepEqual([...art.cells.map(cell => cell.x + "," + cell.y)], ["0,0", "1,0", "3,0", "0,1", "3,1"])
    assert.equal(Art.blockBitmap("").rows, 0)
  },
  "logoLayout stacks the icon over the wordmark only when asked"() {
    const icon = { columns: 27, rows: 26, cells: [] }
    const wide = Art.logoLayout(1080, 460, 1215 / 285, icon, false)
    assert.ok(!wide.stacked)
    assert.equal(wide.width, 540)
    const tall = Art.logoLayout(510, 1920, 1215 / 285, icon, true)
    assert.ok(tall.stacked)
    assert.equal(tall.cell, 13)
    assert.equal(tall.width, 351)
    assert.ok(!Art.logoLayout(510, 1920, 1215 / 285, null, true).stacked)
  },
  "hexColor formats and clamps channels"() {
    assert.equal(Art.hexColor(1, 0, 0.5), "#ff0080")
    assert.equal(Art.hexColor(2, -1, 0), "#ff0000")
  },
}

run(tests)
