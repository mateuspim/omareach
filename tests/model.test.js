import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"

// Model.js is a QML `.pragma library` script; strip the pragma and run it as
// a plain script so its functions land on the sandbox.
const source = readFileSync(new URL("../Model.js", import.meta.url), "utf8").replace(/^\.pragma library\s*/, "")
const Model = {}
vm.runInNewContext(source, Model)

const tests = {
  "normalize fills missing edges and defaults to enabled"() {
    const { panels, ...entry } = Model.normalize({ top: "350.4", left: -5 })
    assert.deepEqual(entry, { enabled: true, fill: "black", clockEdge: "largest", clockHours: 24, clockDate: false, dim: 60, top: 350, bottom: 0, left: 0, right: 0 })
    assert.deepEqual([...panels], ["gpu", "cpu", "memory", "network"])
    const { panels: _, ...empty } = Model.normalize(undefined)
    assert.deepEqual(empty, { enabled: true, fill: "black", clockEdge: "largest", clockHours: 24, clockDate: false, dim: 60, top: 0, bottom: 0, left: 0, right: 0 })
  },
  "panels keep known names, once each, in the order given"() {
    assert.deepEqual([...Model.panelList(["network", "gpu", "rainbow", "gpu"])], ["network", "gpu"])
    assert.deepEqual([...Model.panelList([])], [])
    assert.deepEqual([...Model.panelList("gpu")], [...Model.STATS_DEFAULT])
    assert.deepEqual([...Model.panelList(undefined)], ["gpu", "cpu", "memory", "network"])
    assert.deepEqual([...Model.normalize({ panels: ["system", "cpu"] }).panels], ["system", "cpu"])
    assert.deepEqual([...Model.STATS_PANELS], ["gpu", "igpu", "cpu", "memory", "network", "disks", "processes", "temps", "battery", "media", "system"])
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
  "the panel list counts in same and isDefault"() {
    assert.ok(!Model.same(Model.normalize({ panels: ["gpu"] }), Model.normalize({})))
    assert.ok(Model.same(Model.normalize({ panels: ["gpu", "cpu", "memory", "network"] }), Model.normalize({})))
    // The order is the user's, so another order is another dashboard.
    assert.ok(!Model.same(Model.normalize({ panels: ["cpu", "gpu", "memory", "network"] }), Model.normalize({})))
    assert.ok(!Model.isDefault({ panels: ["temps"] }))
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
  "clockText is 24-hour HH:MM"() {
    assert.equal(Model.clockText(new Date(2026, 8, 29, 7, 5)), "07:05")
    assert.equal(Model.clockText(new Date(2026, 8, 29, 23, 59)), "23:59")
    assert.equal(Model.clockText(new Date(2026, 8, 29, 7, 5), 24), "07:05")
  },
  "clockText in 12-hour time has no leading zero"() {
    assert.equal(Model.clockText(new Date(2026, 8, 29, 7, 5), 12), "7:05")
    assert.equal(Model.clockText(new Date(2026, 8, 29, 0, 30), 12), "12:30")
    assert.equal(Model.clockText(new Date(2026, 8, 29, 12, 0), 12), "12:00")
    assert.equal(Model.clockText(new Date(2026, 8, 29, 23, 59), 12), "11:59")
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
    assert.ok(!Model.isDefault({ clockDate: true }))
  },
  "clockLayout puts the date under or beside the time, whichever keeps it bigger"() {
    const plain = (w, h) => Model.clockLayout("12:34", w, h).cell
    // A tall top edge: under the time, at full size.
    const tall = Model.clockLayout("12:34", 1080, 660, true)
    assert.equal(tall.date, "under")
    assert.equal(tall.cell, plain(1080, 660))
    assert.ok((tall.spanRows + 2) * tall.cell <= 660)
    // A short edge on a portrait monitor gives up some size for it.
    const short = Model.clockLayout("12:34", 1080, 460, true)
    assert.equal(short.date, "under")
    assert.ok(short.cell >= plain(1080, 460) * Model.DATE_KEEP)
    // A short wide strip: beside the time, which keeps its size.
    for (const [w, h] of [[2560, 160], [2560, 300], [3440, 400]]) {
      const strip = Model.clockLayout("12:34", w, h, true)
      assert.equal(strip.date, "beside", `${w}x${h}`)
      assert.equal(strip.cell, plain(w, h))
      assert.ok((strip.spanColumns + 2) * strip.cell <= w)
      assert.equal(strip.dateBox.x, strip.columns + Model.DATE_GAP)
    }
    // Where neither keeps most of the time's size, no date.
    assert.equal(Model.clockLayout("12:34", 400, 150, true).date, "")
    // The place holds whatever the time: a narrow 12-hour "3:24" does not
    // lose the date that "12:34" has.
    assert.equal(Model.clockLayout("3:24", 1080, 460, true).date, "under")
    for (const text of ["1:05", "9:59", "10:00", "12:59"]) assert.equal(Model.clockLayout(text, 2560, 160, true).date, "beside")
    // Without asking, never.
    assert.equal(Model.clockLayout("12:34", 1080, 660).date, "")
    assert.equal(Model.clockLayout("12:34", 1080, 660).dateBox, null)
  },
  "clockBitmap lays glyphs out with a gap"() {
    const one = Model.clockBitmap("1")
    assert.equal(one.columns, 3)
    assert.equal(one.cells.length, 8)
    const time = Model.clockBitmap("12:34")
    assert.equal(time.columns, 3 + 1 + 3 + 1 + 1 + 1 + 3 + 1 + 3)
    assert.equal(time.rows, 5)
    assert.ok(time.cells.some(cell => cell.x === 8 && cell.y === 1), "colon's top dot")
    assert.ok(time.cells.every(cell => cell.x < time.columns && cell.y < 5))
    const stacked = Model.clockBitmap(["12", "34"])
    assert.equal(stacked.columns, 7)
    assert.equal(stacked.rows, 11)
    assert.ok(stacked.cells.some(cell => cell.y === 10))
  },
  "clockLayout stays upright and picks the bigger blocks"() {
    const wide = Model.clockLayout("12:34", 1080, 460)
    assert.equal(wide.columns, 17)
    assert.equal(wide.cell, 56)
    const tall = Model.clockLayout("12:34", 510, 1460)
    assert.equal(tall.columns, 7)
    assert.equal(tall.rows, 11)
    assert.equal(tall.cell, 56)
    assert.ok(Model.clockLayout("12:34", 30, 20).cell < 2)
  },
  "clockShift moves every 5 minutes within one cell"() {
    assert.deepEqual({ ...Model.clockShift(new Date(2026, 8, 29, 0, 4)) }, { x: 0, y: 0 })
    assert.deepEqual({ ...Model.clockShift(new Date(2026, 8, 29, 0, 5)) }, { x: 1, y: 0 })
    for (let minute = 0; minute < 1440; minute += 5) {
      const shift = Model.clockShift(new Date(2026, 8, 29, 0, minute))
      assert.ok(Math.abs(shift.x) <= 1 && Math.abs(shift.y) <= 1)
    }
  },
  "logoStep is a fiftieth of the smaller side, at least a pixel"() {
    assert.equal(Model.logoStep(400, 100), 2)
    assert.equal(Model.logoStep(20, 10), 1)
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
  "untilNextMinute counts down to the minute"() {
    assert.equal(Model.untilNextMinute(new Date(2026, 8, 29, 7, 5, 59, 900)), 100)
    assert.equal(Model.untilNextMinute(new Date(2026, 8, 29, 7, 5, 0, 0)), 60000)
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
  "profileName trims and bounds a typed name"() {
    assert.equal(Model.profileName("  Desk   setup "), "Desk setup")
    assert.equal(Model.profileName("   "), "")
    assert.equal(Model.profileName(undefined), "")
    assert.equal(Model.profileName("x".repeat(40)).length, 32)
  },
  "snapshot keeps only entries that say something"() {
    const shot = Model.snapshot({ A: { top: 300 }, B: {}, C: { fill: "logo" }, D: { enabled: true, top: 0 } })
    assert.deepEqual([...Object.keys(shot)].sort(), ["A", "C"])
    assert.equal(shot.A.top, 300)
    assert.equal(shot.A.fill, "black")
    assert.equal(shot.C.fill, "logo")
  },
  "sameOutputs treats a missing entry as the default"() {
    assert.ok(Model.sameOutputs({ A: { top: 300 } }, { A: { top: 300, enabled: true }, B: {} }))
    assert.ok(!Model.sameOutputs({ A: { top: 300 } }, { A: { top: 300 }, B: { left: 10 } }))
    assert.ok(!Model.sameOutputs({ A: { top: 300 } }, { A: { top: 300, enabled: false } }))
    assert.ok(Model.sameOutputs({}, undefined))
  },
  "profiles drops what is not a profile"() {
    const read = Model.profiles({ " Desk ": { A: { top: 300 } }, "": { A: {} }, Bad: 3, List: [], Empty: {} })
    assert.deepEqual([...Model.profileNames(read)], ["Desk", "Empty"])
    assert.equal(read.Desk.A.top, 300)
    assert.deepEqual({ ...Model.profiles(null) }, {})
    assert.deepEqual({ ...Model.profiles([1]) }, {})
  },
  "currentProfile finds the profile on screen"() {
    const profiles = { Gaming: { A: { top: 0, left: 200, right: 200 } }, Desk: { A: { top: 300 } }, Off: {} }
    assert.equal(Model.currentProfile(profiles, { A: { top: 300 } }), "Desk")
    assert.equal(Model.currentProfile(profiles, {}), "Off")
    assert.equal(Model.currentProfile(profiles, { A: { top: 310 } }), "")
    assert.equal(Model.currentProfile({}, {}), "")
  },
  "currentProfile prefers the last profile among equal ones"() {
    const profiles = { Alpha: { A: { top: 300 } }, Beta: { A: { top: 300 } } }
    assert.equal(Model.currentProfile(profiles, { A: { top: 300 } }), "Alpha")
    assert.equal(Model.currentProfile(profiles, { A: { top: 300 } }, "Beta"), "Beta")
    assert.equal(Model.currentProfile(profiles, { A: { top: 310 } }, "Beta"), "")
    assert.equal(Model.currentProfile(profiles, { A: { top: 300 } }, "Gone"), "Alpha")
  },
  "findProfile matches a name exactly, else ignoring case"() {
    const profiles = { Desk: {}, desk: {}, Gaming: {} }
    assert.equal(Model.findProfile(profiles, "desk"), "desk")
    assert.equal(Model.findProfile(profiles, " GAMING "), "Gaming")
    assert.equal(Model.findProfile(profiles, "Laptop"), "")
    assert.equal(Model.findProfile(profiles, ""), "")
  },
  "monitorSet lists the connected monitors' keys once, sorted"() {
    assert.deepEqual([...Model.monitorSet({ "DP-5": "LG 27", "DP-4": "Dell U27" })], ["Dell U27", "LG 27"])
    assert.deepEqual([...Model.monitorSet({})], [])
    assert.ok(Model.sameSet(["a", "b"], ["b", "a"]))
    assert.ok(!Model.sameSet(["a"], ["a", "b"]))
    assert.ok(Model.sameSet(undefined, []))
  },
  "autoProfiles keeps sets for profiles that exist"() {
    const profiles = { Docked: {}, Laptop: {} }
    const autos = Model.autoProfiles({ docked: ["B", "A", "A", ""], Laptop: [], Gone: ["A"], Bad: "A" }, profiles)
    assert.deepEqual(Object.keys(autos), ["Docked"])
    assert.deepEqual([...autos.Docked], ["A", "B"])
    assert.deepEqual({ ...Model.autoProfiles(null, profiles) }, {})
  },
  "autoProfileFor picks the profile tied to exactly these monitors"() {
    const autos = { Docked: ["A", "B"], Laptop: ["eDP-1"] }
    assert.equal(Model.autoProfileFor(autos, ["B", "A"]), "Docked")
    assert.equal(Model.autoProfileFor(autos, ["eDP-1"]), "Laptop")
    assert.equal(Model.autoProfileFor(autos, ["A"]), "")
    assert.equal(Model.autoProfileFor(autos, []), "")
  },
  "untilNextShift counts down to the next clockShift move"() {
    assert.equal(Model.untilNextShift(new Date(2026, 8, 29, 7, 9, 59, 900)), 100)
    assert.equal(Model.untilNextShift(new Date(2026, 8, 29, 7, 5, 0, 0)), 300000)
    const before = new Date(2026, 8, 29, 7, 7, 30, 0)
    const after = new Date(before.getTime() + Model.untilNextShift(before))
    assert.notDeepEqual({ ...Model.clockShift(after) }, { ...Model.clockShift(before) })
  },
  "CLOCK_CELLS covers every time on either layout"() {
    for (let minutes = 0; minutes < 24 * 60; minutes++) {
      const text = Model.clockText(new Date(2026, 8, 29, Math.floor(minutes / 60), minutes % 60))
      assert.ok(Model.clockLayout(text, 1000, 100).cells.length <= Model.CLOCK_CELLS)
      assert.ok(Model.clockLayout(text, 100, 1000).cells.length <= Model.CLOCK_CELLS)
    }
  },
  "summary names a fill other than black"() {
    assert.equal(Model.summary(Model.normalize({ top: 350, fill: "wallpaper" })), "Top 350 px  ·  Wallpaper")
    assert.equal(Model.summary(Model.normalize({ top: 350, fill: "dim" })), "Top 350 px  ·  Dimmed")
    assert.equal(Model.summary(Model.normalize({ fill: "logo" })), "No reserved edges")
  },
  "imageOffset lines a full-screen image up with the strip"() {
    assert.deepEqual({ ...Model.imageOffset("top", 400, 1080, 1920) }, { x: 0, y: 0 })
    assert.deepEqual({ ...Model.imageOffset("bottom", 400, 1080, 1920) }, { x: 0, y: -1520 })
    assert.deepEqual({ ...Model.imageOffset("left", 40, 1080, 1920) }, { x: 0, y: 0 })
    assert.deepEqual({ ...Model.imageOffset("right", 40, 1080, 1920) }, { x: -1040, y: 0 })
  },
  "svgAspect reads the viewBox, then width and height"() {
    assert.equal(Model.svgAspect('<svg fill="none" height="285" viewBox="0 0 1215 285" width="1215">', 4), 1215 / 285)
    assert.equal(Model.svgAspect('<svg viewBox="-10,-10, 200,100">', 4), 2)
    assert.equal(Model.svgAspect('<svg width="300" height="100">', 4), 3)
    assert.equal(Model.svgAspect("<svg>", 4), 4)
    assert.equal(Model.svgAspect("", 4), 4)
  },
  "recolorSvg repaints black fills and leaves the rest"() {
    assert.equal(Model.recolorSvg('<svg fill="none"><g fill="#000"><path fill="black"/></g></svg>', "#d8a657"),
      '<svg fill="none"><g fill="#d8a657"><path fill="#d8a657"/></g></svg>')
  },
  "blockBitmap reads two characters per cell"() {
    const art = Model.blockBitmap("████  ██\n██    ██\n")
    assert.equal(art.columns, 4)
    assert.equal(art.rows, 2)
    assert.deepEqual([...art.cells.map(cell => cell.x + "," + cell.y)], ["0,0", "1,0", "3,0", "0,1", "3,1"])
    assert.equal(Model.blockBitmap("").rows, 0)
  },
  "logoLayout stacks the icon over the wordmark only when asked"() {
    const icon = { columns: 27, rows: 26, cells: [] }
    const wide = Model.logoLayout(1080, 460, 1215 / 285, icon, false)
    assert.ok(!wide.stacked)
    assert.equal(wide.width, 540)
    const tall = Model.logoLayout(510, 1920, 1215 / 285, icon, true)
    assert.ok(tall.stacked)
    assert.equal(tall.cell, 13)
    assert.equal(tall.width, 351)
    assert.ok(!Model.logoLayout(510, 1920, 1215 / 285, null, true).stacked)
  },
  "hexColor formats and clamps channels"() {
    assert.equal(Model.hexColor(1, 0, 0.5), "#ff0080")
    assert.equal(Model.hexColor(2, -1, 0), "#ff0000")
  },
  "same compares edges, the enabled flag and the fill"() {
    assert.ok(Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, enabled: true })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 20 })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, enabled: false })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, fill: "logo" })))
    assert.ok(!Model.same(Model.normalize({ top: 10 }), Model.normalize({ top: 10, clockEdge: "topBottom" })))
  },
  "limit keeps a tenth of the axis usable"() {
    assert.equal(Model.limit("top", 1080, 1920), 1728)
    assert.equal(Model.limit("left", 1080, 1920), 972)
    assert.equal(Model.limit("top", 0, 0), 4000)
  },
  "opposite edges share the limit"() {
    assert.equal(Model.limit("bottom", 1080, 1920, 1700), 28)
    assert.equal(Model.limit("right", 1080, 1920, 2000), 0)
  },
  "fit trims hand-edited entries to the shared limit"() {
    const fitted = Model.fit(Model.normalize({ top: 5000, bottom: 400, left: 100, right: 100 }), 1080, 1920)
    const { panels, ...edges } = fitted
    assert.deepEqual(edges, { enabled: true, fill: "black", clockEdge: "largest", clockHours: 24, clockDate: false, dim: 60, top: 1728, bottom: 0, left: 100, right: 100 })
    const kept = Model.fit(Model.normalize({ top: 400, bottom: 200 }), 1080, 1920)
    assert.equal(kept.top, 400)
    assert.equal(kept.bottom, 200)
  },
  "fromDrag moves from the press value towards the middle and snaps"() {
    // 1080x1920 monitor drawn at 0.1 scale: one preview pixel is 10 px.
    assert.equal(Model.fromDrag("top", 350, 0, 5, 0.1, 10, 1728), 400)
    assert.equal(Model.fromDrag("bottom", 200, 0, 5, 0.1, 10, 1728), 150)
    assert.equal(Model.fromDrag("left", 40, 3, 0, 0.1, 1, 972), 70)
    assert.equal(Model.fromDrag("right", 40, 3, 0, 0.1, 1, 972), 10)
    assert.equal(Model.fromDrag("top", 100, 0, -50, 0.1, 10, 1728), 0)
    assert.equal(Model.fromDrag("top", 100, 0, 500, 0.1, 10, 1728), 1728)
    assert.equal(Model.fromDrag("top", 405, 0, 0, 0, 10, 1728), 405)
  },
  "notches counts whole wheel steps in either direction"() {
    assert.equal(Model.notches(119), 0)
    assert.equal(Model.notches(240), 2)
    assert.equal(Model.notches(-130), -1)
  },
  "outputKeys prefers a unique description over the connector"() {
    const keys = Model.outputKeys([
      { name: "DP-4", description: "Dell Inc. DELL U2720Q 1A2B3C4" },
      { name: "DP-5", description: "" },
      { name: "HDMI-A-1", description: "Same Panel 0" },
      { name: "HDMI-A-2", description: "Same Panel 0" },
    ])
    assert.deepEqual({ ...keys }, { "DP-4": "Dell Inc. DELL U2720Q 1A2B3C4", "DP-5": "DP-5", "HDMI-A-1": "HDMI-A-1", "HDMI-A-2": "HDMI-A-2" })
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
  "parseAspect reads ratios and plain numbers"() {
    assert.equal(Model.parseAspect("16:9"), 16 / 9)
    assert.equal(Model.parseAspect("4/3"), 4 / 3)
    assert.equal(Model.parseAspect("1.5"), 1.5)
    assert.equal(Model.parseAspect("16:0"), 0)
    assert.equal(Model.parseAspect("wide"), 0)
  },
  "alignment accepts edge names"() {
    assert.equal(Model.alignment("Top"), "start")
    assert.equal(Model.alignment("right"), "end")
    assert.equal(Model.alignment("center"), "center")
    assert.equal(Model.alignment("diagonal"), "")
    assert.equal(Model.nextAlign("end"), "start")
  },
  "aspectEdges cuts the axis that is too long"() {
    // Portrait 1080x1920 to 16:9 leaves 1080x608 and reserves 1312 px.
    assert.deepEqual({ ...Model.aspectEdges(1080, 1920, 16 / 9, "end") }, { top: 1312, bottom: 0, left: 0, right: 0 })
    assert.deepEqual({ ...Model.aspectEdges(1080, 1920, 16 / 9, "start") }, { top: 0, bottom: 1312, left: 0, right: 0 })
    assert.deepEqual({ ...Model.aspectEdges(1080, 1920, 1, "center") }, { top: 420, bottom: 420, left: 0, right: 0 })
    // Landscape 2560x1440 to 4:3 cuts the sides; the odd pixel goes to the end.
    assert.deepEqual({ ...Model.aspectEdges(2560, 1440, 4 / 3, "center") }, { top: 0, bottom: 0, left: 320, right: 320 })
    assert.deepEqual({ ...Model.aspectEdges(2561, 1440, 4 / 3, "center") }, { top: 0, bottom: 0, left: 320, right: 321 })
    // 21:9 on the same screen cuts top and bottom instead.
    assert.deepEqual({ ...Model.aspectEdges(2560, 1440, 21 / 9, "start") }, { top: 0, bottom: 343, left: 0, right: 0 })
    assert.equal(Model.total(Model.aspectEdges(2560, 1440, 16 / 9, "center")), 0)
    assert.equal(Model.total(Model.aspectEdges(0, 0, 16 / 9, "center")), 0)
  },
  "aspectEdges stays within the shared limit"() {
    const edges = Model.aspectEdges(1080, 1920, 10, "end")
    assert.equal(edges.top, 1728)
  },
  "the alignment starts from the reserved edges"() {
    assert.equal(Model.inferAlign(Model.normalize({ top: 990 }), 1080, 1920), "end")
    assert.equal(Model.inferAlign(Model.normalize({ bottom: 10 }), 1080, 1920), "start")
    assert.equal(Model.inferAlign(Model.normalize({ left: 5, right: 5 }), 2560, 1440), "center")
    assert.equal(Model.alignName("end", 1080, 1920), "Bottom")
    assert.equal(Model.alignName("start", 2560, 1440), "Left")
  },
  "matchingAspect finds the preset an entry reserves"() {
    assert.equal(Model.matchingAspect(Model.normalize({ top: 1312 }), 1080, 1920, "end"), "16:9")
    assert.equal(Model.matchingAspect(Model.normalize({ top: 1312 }), 1080, 1920, "start"), "")
    assert.equal(Model.matchingAspect(Model.normalize({ top: 990 }), 1080, 1920, "end"), "")
  },
  "rulerTicks marks every 10 px and labels every 100"() {
    const ticks = Model.rulerTicks(250)
    assert.equal(ticks.length, 25)
    assert.deepEqual({ ...ticks[0] }, { at: 10, size: 1, label: "" })
    assert.equal(ticks[4].size, 2)
    assert.deepEqual({ ...ticks[9] }, { at: 100, size: 3, label: "100" })
  },
  "nudge clamps to the valid range"() {
    assert.equal(Model.nudge(5, -10, 100), 0)
    assert.equal(Model.nudge(95, 10, 100), 100)
    assert.equal(Model.nudge(350, 100, 1728), 450)
  },
}

let failed = 0
for (const [name, run] of Object.entries(tests)) {
  try { run(); console.log("ok   " + name) } catch (error) { failed++; console.log("FAIL " + name + "\n     " + error.message) }
}
process.exit(failed ? 1 : 0)
