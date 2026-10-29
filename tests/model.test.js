import assert from "node:assert/strict"
import { Model, Profiles, run } from "./modelfixtures.js"

// Model.js: entries, fills, stats panels and the panel's pages.

const tests = {
  "normalize fills missing edges and defaults to enabled"() {
    const { panels, ...entry } = Model.normalize({ top: "350.4", left: -5 })
    assert.deepEqual(entry, { enabled: true, fill: "black", clockEdge: "largest", clockHours: 24, clockDate: false, clockSeconds: "off", dim: 60, top: 350, bottom: 0, left: 0, right: 0 })
    assert.deepEqual([...panels], ["gpu", "cpu", "memory", "network"])
    const { panels: _, ...empty } = Model.normalize(undefined)
    assert.deepEqual(empty, { enabled: true, fill: "black", clockEdge: "largest", clockHours: 24, clockDate: false, clockSeconds: "off", dim: 60, top: 0, bottom: 0, left: 0, right: 0 })
  },
  "panels keep known names, once each, in the order given"() {
    assert.deepEqual([...Model.panelList(["network", "gpu", "rainbow", "gpu"])], ["network", "gpu"])
    assert.deepEqual([...Model.panelList([])], [])
    assert.deepEqual([...Model.panelList("gpu")], [...Model.STATS_DEFAULT])
    assert.deepEqual([...Model.panelList(undefined)], ["gpu", "cpu", "memory", "network"])
    assert.deepEqual([...Model.normalize({ panels: ["system", "cpu"] }).panels], ["system", "cpu"])
    assert.deepEqual([...Model.STATS_PANELS], ["gpu", "igpu", "cpu", "memory", "network", "disks", "processes", "temps", "battery", "media", "system", "clock"])
    assert.equal(Model.panelFrom("Now playing"), "media")
    assert.equal(Model.panelFrom("temperatures"), "temps")
    assert.equal(Model.panelFrom("Sensors"), "temps")
    assert.equal(Model.panelFrom("fans"), "temps")
    assert.equal(Model.panelFrom("pressure"), "")
    assert.equal(Model.STATS_PANELS[1], "igpu")
    assert.equal(Model.panelFrom("iGPU"), "igpu")
    assert.equal(Model.panelFrom("integrated"), "igpu")
  },
  "retired panels read as the panel that took them over"() {
    // 1.7's Fans panel is part of Sensors (temps); Pressure became rows.
    assert.deepEqual([...Model.panelList(["fans", "cpu"])], ["temps", "cpu"])
    assert.deepEqual([...Model.panelList(["temps", "fans"])], ["temps"])
    assert.deepEqual([...Model.panelList(["pressure", "gpu"])], ["gpu"])
    assert.deepEqual([...Model.normalize({ panels: ["pressure"] }).panels], [])
  },
  "togglePanel adds a panel last or removes it"() {
    assert.deepEqual([...Model.togglePanel(["gpu", "cpu"], "cpu")], ["gpu"])
    assert.deepEqual([...Model.togglePanel(["memory", "cpu"], "gpu")], ["memory", "cpu", "gpu"])
    assert.deepEqual([...Model.togglePanel(["gpu"], "nope")], ["gpu"])
    assert.deepEqual([...Model.togglePanel(["gpu"], "gpu", true)], ["gpu"])
    assert.deepEqual([...Model.togglePanel(["gpu"], "cpu", false)], ["gpu"])
  },
  "movePanel moves a panel along the order, within it"() {
    assert.deepEqual([...Model.movePanel(["gpu", "cpu", "memory"], "memory", -1)], ["gpu", "memory", "cpu"])
    assert.deepEqual([...Model.movePanel(["gpu", "cpu", "memory"], "gpu", -1)], ["gpu", "cpu", "memory"])
    assert.deepEqual([...Model.movePanel(["gpu", "cpu", "memory"], "gpu", 5)], ["cpu", "memory", "gpu"])
    assert.deepEqual([...Model.movePanel(["gpu", "cpu"], "disks", 1)], ["gpu", "cpu"])
  },
  "panelOrder lists shown panels first, in their order, then the rest"() {
    const order = [...Model.panelOrder(["network", "gpu"])]
    assert.deepEqual(order.slice(0, 3), ["network", "gpu", "igpu"])
    assert.equal(order.length, Model.STATS_PANELS.length)
  },
  "panelsFrom reads a comma list of names or labels, in that order"() {
    assert.deepEqual([...Model.panelsFrom("CPU, gpu ,Disks")], ["cpu", "gpu", "disks"])
    assert.deepEqual([...Model.panelsFrom("all")], [...Model.STATS_PANELS])
    assert.deepEqual([...Model.panelsFrom("none")], [])
    assert.equal(Model.panelsFrom("gpu,rainbow"), null)
    assert.equal(Model.panelFrom("Top processes"), "processes")
    assert.equal(Model.panelFrom("procs"), "processes")
    assert.equal(Model.panelFrom("mem"), "memory")
    assert.equal(Model.panelFrom("rainbow"), "")
  },
  "statsStrip is the stats fill's edge across the monitor"() {
    assert.deepEqual({ ...Model.statsStrip(Model.normalize({ fill: "stats", top: 660 }), 1080, 1920) }, { width: 1080, height: 660 })
    assert.deepEqual({ ...Model.statsStrip(Model.normalize({ fill: "stats", left: 300 }), 2560, 1440) }, { width: 300, height: 1440 })
    assert.equal(Model.statsStrip(Model.normalize({ fill: "clock", top: 660 }), 1080, 1920), null)
    assert.equal(Model.statsStrip(Model.normalize({ fill: "stats" }), 1080, 1920), null)
  },
  "nextPage steps through the panel's pages, wrapping around"() {
    assert.equal(Model.nextPage("edges", 1), "fill")
    assert.equal(Model.nextPage("profiles", 1), "edges")
    assert.equal(Model.nextPage("edges", -1), "profiles")
    assert.equal(Model.nextPage("nope", 1), "edges")
    assert.deepEqual([...Model.PAGES], ["edges", "fill", "stats", "profiles"])
  },
  "rowCells stretches a short last row across the grid"() {
    // Seven fills four to a row: four, then three.
    assert.deepEqual([0, 3, 4, 6].map(i => Model.rowCells(7, 4, i)), [4, 4, 3, 3])
    // A full grid keeps every row whole.
    assert.equal(Model.rowCells(9, 3, 8), 3)
    assert.equal(Model.rowCells(1, 4, 0), 1)
  },
  "gridRows splits cells into rows with the rest last"() {
    assert.deepEqual([...Model.gridRows(7, 4)], [4, 3])
    assert.deepEqual([...Model.gridRows(6, 3)], [3, 3])
    assert.deepEqual([...Model.gridRows(0, 3)], [])
  },
  "gridMove walks the page's rows and lands under the middle"() {
    // Fills four then three, Shown on two, one button.
    const rows = [4, 3, 2, 1]
    assert.equal(Model.gridMove(rows, 0, 1, 0), 1)
    // Stops at the ends of a row instead of wrapping into the next.
    assert.equal(Model.gridMove(rows, 3, 1, 0), 3)
    assert.equal(Model.gridMove(rows, 4, -1, 0), 4)
    // Down from the last of four lands on the last of three; from the
    // first on the first.
    assert.equal(Model.gridMove(rows, 3, 0, 1), 6)
    assert.equal(Model.gridMove(rows, 0, 0, 1), 4)
    // Into a row of one, and back up to its middle.
    assert.equal(Model.gridMove(rows, 7, 0, 1), 9)
    assert.equal(Model.gridMove(rows, 9, 0, -1), 8)
    // Stops at the top and the bottom.
    assert.equal(Model.gridMove(rows, 1, 0, -1), 1)
    assert.equal(Model.gridMove(rows, 9, 0, 1), 9)
    // Off the grid: the first cell, or the last after cells went away.
    assert.equal(Model.gridMove(rows, -1, 0, 1), 0)
    assert.equal(Model.gridMove(rows, 12, 0, 1), 9)
    assert.equal(Model.gridMove([], 0, 0, 1), -1)
  },
  "cursorAfter keeps the cursor on the button it pressed"() {
    // Hide with three panels shown: one goes, and Hide moves up one place.
    const before = ["shown:gpu", "shown:cpu", "shown:memory", "earlier", "later", "hide", "add:disks", "pace"]
    const after = ["shown:gpu", "shown:cpu", "earlier", "later", "hide", "add:memory", "add:disks", "pace"]
    assert.equal(Model.cursorAfter(after, before[5], 5), 4)
    // An added panel is followed to its place among those shown.
    const added = ["shown:gpu", "shown:cpu", "shown:memory", "shown:disks", "earlier", "later", "hide", "pace"]
    assert.equal(Model.cursorAfter(added, "add:disks", 6, "shown:disks"), 3)
    // Gone without a fallback: the same place, kept on the page.
    assert.equal(Model.cursorAfter(["use", "pace"], "use", 0), 0)
    assert.equal(Model.cursorAfter(["pace"], "hide", 5), 0)
    assert.equal(Model.cursorAfter([], "hide", 5), -1)
  },
  "the panel list counts in same and isDefault"() {
    assert.ok(!Model.same(Model.normalize({ panels: ["gpu"] }), Model.normalize({})))
    assert.ok(Model.same(Model.normalize({ panels: ["gpu", "cpu", "memory", "network"] }), Model.normalize({})))
    // The order is the user's, so another order is another dashboard.
    assert.ok(!Model.same(Model.normalize({ panels: ["cpu", "gpu", "memory", "network"] }), Model.normalize({})))
    assert.ok(!Profiles.isDefault({ panels: ["temps"] }))
  },
  "the stats dashboard goes on one edge like the clock"() {
    const entry = Model.normalize({ top: 660, bottom: 100, fill: "stats" })
    assert.equal(Model.edgeFill(entry, "top"), "stats")
    assert.equal(Model.edgeFill(entry, "bottom"), "black")
    assert.equal(Model.fillFrom("Stats"), "stats")
    assert.equal(Model.fillName("stats"), "Stats")
  },
  "only the stats fill stays up beside a fullscreen window"() {
    assert.equal(Model.fullscreenFill("stats"), "stats")
    assert.equal(Model.fullscreenFill("logo"), "black")
    assert.equal(Model.fullscreenFill("black"), "black")
  },
  "paused entries reserve nothing but keep their values"() {
    const raw = { top: 350, enabled: false }
    assert.equal(Model.total(Model.active(raw)), 0)
    assert.equal(Model.normalize(raw).top, 350)
  },
  "summary lists reserved edges and flags paused ones"() {
    assert.equal(Model.summary(Model.normalize({})), "No reserved edges")
    assert.equal(Model.summary(Model.normalize({ top: 350, left: 40 })), "Top 350 px  ·  Left 40 px")
    assert.equal(Model.summary(Model.normalize({ top: 350, enabled: false })), "Paused  ·  Top 350 px")
  },
  "fill defaults to black and keeps only known values"() {
    assert.equal(Model.normalize({ fill: "wallpaper" }).fill, "wallpaper")
    assert.equal(Model.normalize({ fill: "logo" }).fill, "logo")
    assert.equal(Model.normalize({ fill: "clock" }).fill, "clock")
    assert.equal(Model.normalize({ fill: "rainbow" }).fill, "black")
    assert.equal(Model.active({ top: 10, fill: "logo", enabled: false }).fill, "logo")
  },
  "nextFill cycles through every fill"() {
    const seen = ["black"]
    for (let fill = Model.nextFill("black"); fill !== "black"; fill = Model.nextFill(fill)) seen.push(fill)
    assert.deepEqual(seen, ["black", "theme", "logo", "wallpaper", "dim", "clock", "stats"])
  },
  "fillFrom accepts keys and labels"() {
    assert.equal(Model.fillFrom("Logo"), "logo")
    assert.equal(Model.fillFrom("dimmed"), "dim")
    assert.equal(Model.fillFrom("dim"), "dim")
    assert.equal(Model.fillFrom("rainbow"), "")
  },
  "wallpaper and dim both draw the wallpaper"() {
    assert.ok(Model.showsWallpaper("wallpaper"))
    assert.ok(Model.showsWallpaper("dim"))
    assert.ok(!Model.showsWallpaper("logo"))
  },
  "the clock goes on the largest edge and the others stay black"() {
    const entry = Model.normalize({ top: 40, bottom: 300, left: 300, fill: "clock" })
    assert.equal(Model.clockEdge(entry), "bottom")
    assert.equal(Model.edgeFill(entry, "bottom"), "clock")
    assert.equal(Model.edgeFill(entry, "top"), "black")
    assert.equal(Model.edgeFill(entry, "left"), "black")
    assert.equal(Model.clockEdge(Model.normalize({})), "")
    const logo = Model.normalize({ top: 460, right: 500, fill: "logo" })
    assert.equal(Model.edgeFill(logo, "right"), "logo")
    assert.equal(Model.edgeFill(logo, "top"), "logo")
    assert.equal(Model.edgeFill(Model.normalize({ top: 40, left: 90, fill: "dim" }), "top"), "dim")
  },
  "the clock can prefer the top or bottom edge"() {
    const entry = Model.normalize({ top: 460, bottom: 100, right: 510, fill: "clock", clockEdge: "topBottom" })
    assert.equal(Model.clockEdge(entry), "top")
    assert.equal(Model.edgeFill(entry, "top"), "clock")
    assert.equal(Model.edgeFill(entry, "right"), "black")
    assert.equal(Model.clockEdge(Model.normalize({ top: 40, bottom: 90, left: 500, clockEdge: "topBottom" })), "bottom")
    assert.equal(Model.clockEdge(Model.normalize({ left: 500, right: 600, clockEdge: "topBottom" })), "right")
    assert.equal(Model.normalize({ clockEdge: "middle" }).clockEdge, "largest")
  },
  "normalize keeps the clock's hours and date, defaulting to 24-hour without"() {
    assert.equal(Model.normalize({}).clockHours, 24)
    assert.equal(Model.normalize({}).clockDate, false)
    assert.equal(Model.normalize({ clockHours: 12, clockDate: true }).clockHours, 12)
    assert.equal(Model.normalize({ clockHours: 13 }).clockHours, 24)
    assert.equal(Model.normalize({ clockHours: "12" }).clockHours, 24)
    assert.equal(Model.normalize({ clockDate: "yes" }).clockDate, false)
    assert.ok(!Model.same(Model.normalize({}), Model.normalize({ clockHours: 12 })))
    assert.ok(!Model.same(Model.normalize({}), Model.normalize({ clockDate: true })))
    assert.ok(!Profiles.isDefault({ clockDate: true }))
  },
  "shortSummary drops units and the fill, and abbreviates past two edges"() {
    assert.equal(Model.shortSummary(Model.normalize({})), "No reserved edges")
    assert.equal(Model.shortSummary(Model.normalize({ top: 460, bottom: 490, fill: "logo" })), "Top 460  ·  Bottom 490")
    assert.equal(Model.shortSummary(Model.normalize({ top: 460, left: 40, right: 40, enabled: false })), "Paused  ·  T 460  ·  L 40  ·  R 40")
  },
  "fullscreenChanges fits fullscreen windows on reserved monitors only"() {
    const clients = [
      { address: "0xa", monitor: 1, fullscreen: 2, fullscreenClient: 2 },
      { address: "0xb", monitor: 0, fullscreen: 2, fullscreenClient: 2 },
      { address: "0xc", monitor: 1, fullscreen: 1, fullscreenClient: 0 }
    ]
    const result = Model.fullscreenChanges(clients, [1], [])
    assert.deepEqual([...result.changes].map(c => ({ ...c })), [{ address: "0xa", internal: 1, client: 2 }])
    assert.deepEqual([...result.fitted], ["0xa"])
  },
  "fullscreenChanges keeps fitted windows and lets them leave fullscreen"() {
    const kept = Model.fullscreenChanges([{ address: "0xa", monitor: 1, fullscreen: 1, fullscreenClient: 2 }], [1], ["0xa"])
    assert.equal(kept.changes.length, 0)
    assert.deepEqual([...kept.fitted], ["0xa"])
    const again = Model.fullscreenChanges([{ address: "0xa", monitor: 1, fullscreen: 2, fullscreenClient: 2 }], [1], ["0xa"])
    assert.deepEqual([...again.changes].map(c => ({ ...c })), [{ address: "0xa", internal: 0, client: 0 }])
    assert.deepEqual([...again.fitted], [])
    const left = Model.fullscreenChanges([{ address: "0xa", monitor: 1, fullscreen: 0, fullscreenClient: 0 }], [1], ["0xa"])
    assert.deepEqual([...left.fitted], [])
  },
  "dimPercent bounds the dim amount"() {
    assert.equal(Model.dimPercent(undefined), 60)
    assert.equal(Model.dimPercent("abc"), 60)
    assert.equal(Model.dimPercent(""), 60)
    assert.equal(Model.dimPercent(0), 10)
    assert.equal(Model.dimPercent(95), 90)
    assert.equal(Model.dimPercent("44.6"), 45)
    assert.equal(Model.normalize({ dim: 30 }).dim, 30)
    assert.ok(!Model.same(Model.normalize({ dim: 30 }), Model.normalize({})))
  },
  "summary names a fill other than black"() {
    assert.equal(Model.summary(Model.normalize({ top: 350, fill: "wallpaper" })), "Top 350 px  ·  Wallpaper")
    assert.equal(Model.summary(Model.normalize({ top: 350, fill: "dim" })), "Top 350 px  ·  Dimmed")
    assert.equal(Model.summary(Model.normalize({ fill: "logo" })), "No reserved edges")
  },
  "same compares edges, the enabled flag and the fill"() {
    assert.ok(Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, enabled: true })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 20 })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, enabled: false })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, fill: "logo" })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, clockEdge: "topBottom" })))
  },
  "idle timeouts cycle and read as minutes or seconds"() {
    assert.equal(Model.nextIdle(0), 30)
    assert.equal(Model.nextIdle(300), 0)
    assert.equal(Model.nextIdle(45), 0)
    assert.equal(Model.idleName(0), "Off")
    assert.equal(Model.idleName(30), "30 s")
    assert.equal(Model.idleName(120), "2 min")
    assert.equal(Model.idleSeconds("-5"), 0)
  },
  "the stats frame pace cycles through its choices and keeps hand edits"() {
    assert.deepEqual([...Model.STATS_PACES], [0, 60, 30, 15, 1])
    assert.equal(Model.statsPace(undefined), 30)
    assert.equal(Model.statsPace("fast"), 30)
    assert.equal(Model.statsPace(0), 0)
    assert.equal(Model.statsPace("15"), 15)
    // Any whole number of frames a second up to 240, from a hand edit.
    assert.equal(Model.statsPace(144), 144)
    assert.equal(Model.statsPace(500), 30)
    assert.equal(Model.statsPace(2.5), 30)
    assert.equal(Model.nextPace(0), 60)
    assert.equal(Model.nextPace(30), 15)
    assert.equal(Model.nextPace(1), 0)
    assert.equal(Model.nextPace(144), 0)
    assert.equal(Model.paceName(0), "Display rate")
    assert.equal(Model.paceName(30), "30 fps")
    assert.equal(Model.paceName(1), "No animation")
  },
}

Object.assign(tests, {
  "normalize keeps the clock's seconds, off by default"() {
    assert.equal(Model.normalize({}).clockSeconds, "off")
    assert.equal(Model.normalize({ clockSeconds: "blink" }).clockSeconds, "blink")
    assert.equal(Model.normalize({ clockSeconds: "bar" }).clockSeconds, "bar")
    assert.equal(Model.normalize({ clockSeconds: true }).clockSeconds, "off")
    assert.ok(!Model.same(Model.normalize({}), Model.normalize({ clockSeconds: "bar" })))
    assert.ok(!Profiles.isDefault({ clockSeconds: "blink" }))
    assert.equal(Model.nextClockSeconds("off"), "blink")
    assert.equal(Model.nextClockSeconds("bar"), "off")
    assert.equal(Model.nextClockSeconds("nonsense"), "off")
  },
  "the Clock panel goes by its name and a few others"() {
    assert.equal(Model.panelFrom("clock"), "clock")
    assert.equal(Model.panelFrom("time"), "clock")
    assert.equal(Model.panelFrom("Clock"), "clock")
    assert.equal(Model.panelName("clock"), "Clock")
    // Opt-in: a new monitor's dashboard does not get it.
    assert.ok(Model.STATS_DEFAULT.indexOf("clock") === -1)
  },
  "paceShort names each pace in a word for its button"() {
    assert.deepEqual([...Model.STATS_PACES].map(Model.paceShort), ["Display", "60", "30", "15", "Off"])
    assert.equal(Model.paceShort("nonsense"), "30")
  },
})

run(tests)
