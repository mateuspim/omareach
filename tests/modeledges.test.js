import assert from "node:assert/strict"
import { Model, Edges, run } from "./modelfixtures.js"

// ModelEdges.js: aspect presets, the ruler and the sliders.

const tests = {
  "limit keeps a tenth of the axis usable"() {
    assert.equal(Edges.limit("top", 1080, 1920), 1728)
    assert.equal(Edges.limit("left", 1080, 1920), 972)
    assert.equal(Edges.limit("top", 0, 0), 4000)
  },
  "opposite edges share the limit"() {
    assert.equal(Edges.limit("bottom", 1080, 1920, 1700), 28)
    assert.equal(Edges.limit("right", 1080, 1920, 2000), 0)
  },
  "fit trims hand-edited entries to the shared limit"() {
    const fitted = Edges.fit(Model.normalize({ top: 5000, bottom: 400, left: 100, right: 100 }), 1080, 1920)
    const { panels, ...edges } = fitted
    assert.deepEqual(edges, { enabled: true, fill: "black", clockEdge: "largest", clockHours: 24, clockDate: false, dim: 60, top: 1728, bottom: 0, left: 100, right: 100 })
    const kept = Edges.fit(Model.normalize({ top: 400, bottom: 200 }), 1080, 1920)
    assert.equal(kept.top, 400)
    assert.equal(kept.bottom, 200)
  },
  "fromDrag moves from the press value towards the middle and snaps"() {
    // 1080x1920 monitor drawn at 0.1 scale: one preview pixel is 10 px.
    assert.equal(Edges.fromDrag("top", 350, 0, 5, 0.1, 10, 1728), 400)
    assert.equal(Edges.fromDrag("bottom", 200, 0, 5, 0.1, 10, 1728), 150)
    assert.equal(Edges.fromDrag("left", 40, 3, 0, 0.1, 1, 972), 70)
    assert.equal(Edges.fromDrag("right", 40, 3, 0, 0.1, 1, 972), 10)
    assert.equal(Edges.fromDrag("top", 100, 0, -50, 0.1, 10, 1728), 0)
    assert.equal(Edges.fromDrag("top", 100, 0, 500, 0.1, 10, 1728), 1728)
    assert.equal(Edges.fromDrag("top", 405, 0, 0, 0, 10, 1728), 405)
  },
  "notches counts whole wheel steps in either direction"() {
    assert.equal(Edges.notches(119), 0)
    assert.equal(Edges.notches(240), 2)
    assert.equal(Edges.notches(-130), -1)
  },
  "parseAspect reads ratios and plain numbers"() {
    assert.equal(Edges.parseAspect("16:9"), 16 / 9)
    assert.equal(Edges.parseAspect("4/3"), 4 / 3)
    assert.equal(Edges.parseAspect("1.5"), 1.5)
    assert.equal(Edges.parseAspect("16:0"), 0)
    assert.equal(Edges.parseAspect("wide"), 0)
  },
  "alignment accepts edge names"() {
    assert.equal(Edges.alignment("Top"), "start")
    assert.equal(Edges.alignment("right"), "end")
    assert.equal(Edges.alignment("center"), "center")
    assert.equal(Edges.alignment("diagonal"), "")
    assert.equal(Edges.nextAlign("end"), "start")
  },
  "aspectEdges cuts the axis that is too long"() {
    // Portrait 1080x1920 to 16:9 leaves 1080x608 and reserves 1312 px.
    assert.deepEqual({ ...Edges.aspectEdges(1080, 1920, 16 / 9, "end") }, { top: 1312, bottom: 0, left: 0, right: 0 })
    assert.deepEqual({ ...Edges.aspectEdges(1080, 1920, 16 / 9, "start") }, { top: 0, bottom: 1312, left: 0, right: 0 })
    assert.deepEqual({ ...Edges.aspectEdges(1080, 1920, 1, "center") }, { top: 420, bottom: 420, left: 0, right: 0 })
    // Landscape 2560x1440 to 4:3 cuts the sides; the odd pixel goes to the end.
    assert.deepEqual({ ...Edges.aspectEdges(2560, 1440, 4 / 3, "center") }, { top: 0, bottom: 0, left: 320, right: 320 })
    assert.deepEqual({ ...Edges.aspectEdges(2561, 1440, 4 / 3, "center") }, { top: 0, bottom: 0, left: 320, right: 321 })
    // 21:9 on the same screen cuts top and bottom instead.
    assert.deepEqual({ ...Edges.aspectEdges(2560, 1440, 21 / 9, "start") }, { top: 0, bottom: 343, left: 0, right: 0 })
    assert.equal(Model.total(Edges.aspectEdges(2560, 1440, 16 / 9, "center")), 0)
    assert.equal(Model.total(Edges.aspectEdges(0, 0, 16 / 9, "center")), 0)
  },
  "aspectEdges stays within the shared limit"() {
    const edges = Edges.aspectEdges(1080, 1920, 10, "end")
    assert.equal(edges.top, 1728)
  },
  "the alignment starts from the reserved edges"() {
    assert.equal(Edges.inferAlign(Model.normalize({ top: 990 }), 1080, 1920), "end")
    assert.equal(Edges.inferAlign(Model.normalize({ bottom: 10 }), 1080, 1920), "start")
    assert.equal(Edges.inferAlign(Model.normalize({ left: 5, right: 5 }), 2560, 1440), "center")
    assert.equal(Edges.alignName("end", 1080, 1920), "Bottom")
    assert.equal(Edges.alignName("start", 2560, 1440), "Left")
  },
  "matchingAspect finds the preset an entry reserves"() {
    assert.equal(Edges.matchingAspect(Model.normalize({ top: 1312 }), 1080, 1920, "end"), "16:9")
    assert.equal(Edges.matchingAspect(Model.normalize({ top: 1312 }), 1080, 1920, "start"), "")
    assert.equal(Edges.matchingAspect(Model.normalize({ top: 990 }), 1080, 1920, "end"), "")
  },
  "rulerTicks marks every 10 px and labels every 100"() {
    const ticks = Edges.rulerTicks(250)
    assert.equal(ticks.length, 25)
    assert.deepEqual({ ...ticks[0] }, { at: 10, size: 1, label: "" })
    assert.equal(ticks[4].size, 2)
    assert.deepEqual({ ...ticks[9] }, { at: 100, size: 3, label: "100" })
  },
  "nudge clamps to the valid range"() {
    assert.equal(Edges.nudge(5, -10, 100), 0)
    assert.equal(Edges.nudge(95, 10, 100), 100)
    assert.equal(Edges.nudge(350, 100, 1728), 450)
  },
}

run(tests)
