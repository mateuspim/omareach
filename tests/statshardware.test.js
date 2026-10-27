import assert from "node:assert/strict"
import { plain, frame, palette, full, Format, Gpu, Stats, Views, run } from "./statsfixtures.js"

// StatsViews.js: what the GPU, CPU, memory and sensors panels show.

const tests = {
  "the GPU view shows load, memory, temperature and power"() {
    const view = Views.view("gpu", full, palette)
    assert.equal(view.value, "55%")
    assert.equal(view.info, "RTX 4080")
    const labels = view.rows.map(row => row.label)
    for (const label of ["VRAM", "Temp", "Power", "Clock", "Fan", "Decode"]) assert.ok(labels.includes(label), label)
    // An idle encoder is left out.
    assert.ok(!labels.includes("Encode"))
    assert.equal(view.rows.find(row => row.label === "VRAM").text, "7.4 / 16.0 GiB")
    assert.equal(view.rows.find(row => row.label === "Power").text, "150 / 320 W")
  },
  "the GPU view says so when there is no GPU"() {
    assert.equal(Views.view("gpu", Stats.empty(), palette).empty, "Waiting for data")
    assert.equal(Views.view("gpu", Object.assign(Stats.empty(), { time: 1, nvidiaMissing: true }), palette).empty, "No GPU found")
  },
  "the GPU view shows an AMD card the same way"() {
    const state = Stats.step(Stats.empty(), frame(10, [0]), "")
    const view = Views.view("gpu", state, palette)
    assert.equal(view.info, "Radeon Graphics")
    assert.equal(view.value, "99%")
    assert.equal(view.rows.find(row => row.label === "Power").text, "0.2 W")
    assert.equal(view.rows.find(row => row.label === "VRAM").text, "1.1 / 2.0 GiB")
  },
  "the iGPU view shows the integrated GPU beside a discrete one"() {
    const view = Views.view("igpu", full, palette)
    assert.equal(view.title, "iGPU")
    assert.equal(view.info, "Radeon Graphics")
    assert.equal(view.value, "99%")
    assert.deepEqual(plain(view.graphs[0].values), [99])
    // Alone, the iGPU is the GPU panel's.
    const alone = Stats.step(Stats.empty(), frame(10, [0]), "")
    assert.equal(Views.view("igpu", alone, palette).empty, "Shown as GPU")
    assert.equal(Views.view("igpu", Object.assign(Stats.empty(), { time: 1 }), palette).empty, "No integrated GPU")
  },
  "an asleep GPU says so"() {
    const state = Object.assign(Stats.empty(), { time: 1, drm: Gpu.drmGpus({ card1: { driver: "amdgpu", status: "suspended" } }, {}, 0) })
    assert.equal(Views.view("gpu", state, palette).empty, "Asleep")
  },
  "the CPU view has a bar per core colored by load"() {
    const view = Views.view("cpu", full, palette)
    assert.equal(view.bars.length, 2)
    assert.equal(view.value, "50%")
    assert.equal(view.info, "2 threads")
  },
  "the CPU view lists its power draw first, with the clock beside the load"() {
    const view = Views.view("cpu", full, palette)
    assert.equal(view.caption, "load · 5.10 GHz")
    // The Sensors panel has the temperature too; nothing else has the power.
    assert.deepEqual(plain(view.rows.map(row => row.label)), ["Power", "Temp", "Load"])
    // No known limit: the watts alone, without a meter.
    assert.equal(view.rows[0].text, "65 W")
    assert.equal(view.rows[0].fraction, null)
    const unclocked = Object.assign({}, full, { cpu: Object.assign({}, full.cpu, { frequency: null, power: null }) })
    assert.equal(Views.view("cpu", unclocked, palette).caption, "load")
    assert.deepEqual(plain(Views.view("cpu", unclocked, palette).rows.map(row => row.label)), ["Temp", "Load"])
    // Against the CPU's limit, green to red like every level meter, when it is known.
    const ryzen = Object.assign({}, full, { sysinfo: { cpu: "AMD Ryzen 9 9900X 12-Core Processor" } })
    const power = Views.view("cpu", ryzen, palette).rows[0]
    assert.equal(power.text, "65 / 162 W")
    assert.equal(power.fraction, 65 / 162)
    assert.equal(power.color, Format.gradientAt(palette.gradients.level, 65 / 162))
  },
  "the CPU view's temperature fills towards the CPU's limit"() {
    const temp = Views.view("cpu", full, palette).rows.find(row => row.label === "Temp")
    assert.equal(temp.text, "67°C")
    assert.equal(temp.fraction, Format.heat(67.375, 95))
  },
  "a wide CPU card moves the clock from its narrow headline to a row"() {
    const stacked = Views.view("cpu", full, palette, undefined, false)
    assert.equal(stacked.caption, "load · 5.10 GHz")
    assert.ok(!stacked.rows.some(row => row.label === "Clock"))
    const wide = Views.view("cpu", full, palette, undefined, true)
    assert.equal(wide.caption, "load")
    assert.equal(wide.rows.find(row => row.label === "Clock").text, "5.10 GHz")
  },
  "a wide system card lists the uptime with the facts, leaving the logo its column"() {
    const stacked = Views.view("system", full, palette, undefined, false)
    assert.notEqual(stacked.value, "")
    const wide = Views.view("system", full, palette, undefined, true)
    assert.equal(wide.value, "")
    assert.equal(wide.logo, true)
    assert.equal(wide.rows.find(row => row.label === "Uptime").text, stacked.value)
  },
  "the load average names its minutes where there is room, against the threads"() {
    const narrow = Views.view("cpu", full, palette, undefined, false, 20).rows.find(row => row.label === "Load")
    assert.equal(narrow.text, "0.52  0.61  0.70")
    const wide = Views.view("cpu", full, palette, undefined, false, 22).rows.find(row => row.label === "Load")
    assert.equal(wide.text, "1m 0.52  5m 0.61  15m 0.70")
    // The frame has two threads: a load of 0.52 is about a quarter busy.
    assert.equal(wide.fraction, 0.26)
  },
  "a hybrid CPU's bars come in two groups, performance first"() {
    const hybrid = Object.assign({}, full, {
      sysinfo: { cpu_core: "1", cpu_atom: "0" },
      cpu: Object.assign({}, full.cpu, { cores: [10, 90], coreIds: [0, 1] })
    })
    const view = Views.view("cpu", hybrid, palette)
    assert.equal(view.info, "1 P + 1 E threads")
    assert.deepEqual(plain(view.bars.map(bar => bar.gap ? "gap" : bar.fraction)), [0.9, "gap", 0.1])
    // One kind of core: one block, as before.
    assert.ok(!Views.view("cpu", full, palette).bars.some(bar => bar.gap))
  },
  "a card asks for its warning color when something nears its limit"() {
    assert.equal(Views.view("cpu", full, palette).alert, 0)
    const hotCpu = Object.assign({}, full, { cpu: Object.assign({}, full.cpu, { temp: 92, tempLimit: 95 }) })
    assert.equal(Views.view("cpu", hotCpu, palette).alert, Views.ALERT)
    const hotSensor = Object.assign({}, full, { temps: full.temps.map(t => t.name === "CPU" ? Object.assign({}, t, { temp: 92 }) : t) })
    assert.equal(Views.view("temps", hotSensor, palette).alert, Views.ALERT)
    const fullMemory = Object.assign({}, full, { memory: Object.assign({}, full.memory, { used: full.memory.total * 0.95 }) })
    assert.equal(Views.view("memory", fullMemory, palette).alert, Views.ALERT)
    const stalled = Object.assign({}, full, { pressure: { cpu: 0, memory: 0, io: 25 } })
    assert.equal(Views.view("disks", stalled, palette).alert, Views.ALERT)
  },
  "the memory view is one stacked bar keyed by its rows"() {
    const view = Views.view("memory", full, palette)
    assert.equal(view.graphs.length, 0)
    assert.equal(view.stack.length, 2)
    const m = full.memory
    assert.equal(view.stack[0].fraction, m.used / m.total)
    assert.equal(view.stack[1].fraction, Math.min(m.cached, m.available) / m.total)
    assert.deepEqual(plain(view.rows.map(row => row.label)), ["Used", "Cached", "Available", "Swap", "Stalled"])
    assert.ok(view.rows[0].swatch && view.rows[1].swatch && !view.rows[2].swatch)
    assert.equal(view.rows[0].color, view.stack[0].color)
    // Used and available already add up: no meters for them.
    assert.equal(view.rows[2].fraction, null)
  },
  "the processes view lists CPU and GPU apps"() {
    const view = Views.view("processes", full, palette)
    assert.deepEqual(plain(view.lists.map(list => list.title)), ["CPU", "Memory", "VRAM"])
    assert.equal(view.lists[0].items[0].name, "game")
    assert.equal(view.lists[0].items[0].text, "50%")
  },
  "the sensors view leads with the hottest sensor for its limit, then the rest and the fans"() {
    const view = Views.view("temps", full, palette)
    assert.equal(view.title, "Sensors")
    // The CPU, 67 °C of 95, is nearest its limit; it has no row as well,
    // and its limit sits in the title's corner, clear of the caption.
    assert.equal(view.value, "67°C")
    assert.equal(view.caption, "CPU")
    assert.equal(view.info, "max 95°C")
    // A wide card's headline is too narrow for a caption: the name and
    // limit go on the line under the value.
    const wide = Views.view("temps", full, palette, undefined, true)
    assert.equal(wide.caption, "")
    assert.equal(wide.info, "")
    assert.equal(wide.note, "CPU · max 95°C")
    assert.deepEqual(plain(view.rows.map(row => row.label)), ["CCD 1", "GPU", "iGPU", "nvme0n1", "nvme1", "DIMM 1", "DIMM 2", "CPU fan", "GPU fan"])
    assert.equal(view.rows.find(row => row.label === "GPU").text, "54°C")
    assert.equal(view.rows.find(row => row.label === "GPU fan").text, "30%")
    // Each against its own limit: NVIDIA's slowdown, a DIMM's critical.
    assert.equal(view.rows.find(row => row.label === "GPU").fraction, Format.heat(54, 90))
    // A graph of a temperature over a minute is a flat line.
    assert.equal(view.graphs.length, 0)
    // Rows past the card's room are left out: beside the headline in a
    // wide card, under it in a stacked one, where the value takes about
    // two rows' room.
    assert.equal(Views.view("temps", full, palette, 6, true).rows.length, 6)
    assert.equal(Views.view("temps", full, palette, 6, false).rows.length, 3)
    // Without a temperature there is no headline, just the fans.
    const bare = Object.assign(Stats.empty(), { fans: [{ name: "CPU fan", rpm: 900 }] })
    assert.equal(Views.view("temps", bare, palette).value, "")
    assert.deepEqual(plain(Views.view("temps", bare, palette).rows.map(row => row.label)), ["CPU fan"])
  },
  "the sensors view leaves out what the other panels on the dashboard show"() {
    const view = Views.view("temps", full, palette, undefined, false, 30, ["gpu", "igpu", "cpu", "temps"])
    // The CPU, GPU and iGPU panels have their own temperatures and the
    // GPU's fan. The CPU's dies are only here, but beside the CPU panel
    // they would lead with nearly its reading, so another sensor leads.
    assert.equal(view.caption, "DIMM 1")
    assert.deepEqual(plain(view.rows.map(row => row.label)), ["CCD 1", "nvme0n1", "nvme1", "DIMM 2", "CPU fan"])
    // Beside a Sensors panel the disks leave their temperatures to it.
    const disks = Views.view("disks", full, palette, undefined, false, 40, ["disks", "temps"])
    assert.ok(disks.rows.every(row => !/°C/.test(row.text)))
    assert.ok(Views.view("disks", full, palette, undefined, false, 40, ["disks"]).rows.some(row => /°C/.test(row.text)))
    // Every sensor elsewhere: the card says so.
    const covered = Object.assign(Stats.empty(), { time: 1, temps: [{ name: "CPU", temp: 50, limit: 95 }] })
    assert.equal(Views.view("temps", covered, palette, undefined, false, 30, ["cpu", "temps"]).empty, "Every sensor is on its own panel")
  },
  "a resting AMD card keeps its last readings while stats.sh leaves it alone"() {
    const awake = "@drm\ncard1\tamdgpu\tstatus\tactive\ncard1\tamdgpu\tdedicated\t1\ncard1\tamdgpu\tbusy\t0\ncard1\tamdgpu\ttemp\t45000\n"
    const resting = "@drm\ncard1\tamdgpu\tstatus\tactive\ncard1\tamdgpu\trest\t1\n"
    let state = Stats.step(Stats.empty(), frame(10, [0], awake), [])
    state = Stats.step(state, frame(11, [0], resting), [])
    const card = state.drm.find(gpu => gpu.id === "card1")
    assert.equal(card.resting, true)
    assert.equal(card.kind, "discrete")
    assert.equal(card.temp, 45)
    assert.equal(card.load, 0)
    assert.equal(Views.view("gpu", state, palette).caption, "idle")
  },
  "a laptop dGPU that sits idle is checked only now and then, so it can sleep"() {
    const managed = "@drm\ncard1\tnvidia\tstatus\tactive\ncard1\tnvidia\tcontrol\tauto\n"
    const idle = ["0, NVIDIA GeForce RTX 4060 Laptop GPU, 0, 5, 8188, 41, 3.1, 80.00, 210, , 0, 0"]
    let state = Stats.step(Stats.empty(), frame(10, [0], managed), idle)
    assert.equal(Gpu.nvidiaPoll(state), "on")
    for (let t = 11; t < 10 + Gpu.REST_AFTER; t++) state = Stats.step(state, frame(t, [0], managed), idle)
    assert.equal(Gpu.nvidiaPoll(state), "check")
    // Its last reading stays, marked resting, rather than going stale.
    for (let t = 20; t <= 40; t++) state = Stats.step(state, frame(t, [0], managed), [])
    assert.equal(state.nvidia.resting, true)
    assert.equal(Views.view("gpu", state, palette).caption, "idle")
    // A check that finds it busy brings the loop back.
    state = Stats.step(state, frame(41, [0], managed), ["0, NVIDIA GeForce RTX 4060 Laptop GPU, 35, 900, 8188, 55, 40.0, 80.00, 2100, , 0, 0"])
    assert.equal(Gpu.nvidiaPoll(state), "on")
    assert.equal(state.nvidia.resting, false)
  },
  "a sleeping laptop dGPU is never woken, and its panel says it is asleep"() {
    const managed = "@drm\ncard1\tnvidia\tstatus\tactive\ncard1\tnvidia\tcontrol\tauto\n"
    const asleep = "@drm\ncard1\tnvidia\tstatus\tsuspended\ncard1\tnvidia\tcontrol\tauto\n"
    let state = Stats.step(Stats.empty(), frame(10, [0], managed), ["0, NVIDIA GeForce RTX 4060 Laptop GPU, 0, 5, 8188, 41, 3.1, 80.00, 210, , 0, 0"])
    state = Stats.step(state, frame(11, [0], asleep), [])
    assert.equal(Gpu.nvidiaPoll(state), "off")
    const main = Gpu.gpuRoles(state).main
    assert.equal(main.vendor, "NVIDIA")
    assert.equal(main.asleep, true)
    assert.equal(main.name, "RTX 4060 Laptop GPU")
    assert.equal(Views.view("gpu", state, palette).empty, "Asleep")
    // Asleep from the start, with no name yet.
    const cold = Stats.step(Stats.empty(), frame(10, [0], asleep), [])
    assert.equal(Gpu.nvidiaPoll(cold), "off")
    assert.equal(Gpu.gpuRoles(cold).main.vendor, "NVIDIA")
    // Woken by something else, it is read again.
    state = Stats.step(state, frame(12, [0], managed), [])
    assert.equal(Gpu.nvidiaPoll(state), "on")
  },
  "a stacked GPU card keeps only the rows that fit under its headline"() {
    const rows = Views.view("gpu", full, palette).rows.length
    assert.ok(rows >= 5)
    assert.equal(Views.view("gpu", full, palette, 7, false).rows.length, 3)
    assert.equal(Views.view("gpu", full, palette, 7, true).rows.length, Math.min(rows, 7))
    // No room under the headline: no row, rather than half of one.
    assert.equal(Views.view("gpu", full, palette, 2, false).rows.length, 0)
  },
  "a stacked card keeps only the rows that fit under its headline"() {
    // The value (about 1.8 rows), each graph (1), the core bars (1.4) and
    // the gap (0.3) come off the room first.
    assert.equal(Views.view("cpu", full, palette, 6, false).rows.length, 1)
    assert.equal(Views.view("cpu", full, palette, 3, true).rows.length, 3)
    // The stacked bar takes less room than a graph did.
    assert.equal(Views.view("memory", full, palette, 6, false).rows.length, 3)
    assert.equal(Views.view("network", full, palette, 5, false).rows.length, 2)
    // Without a room, every row.
    assert.equal(Views.view("memory", full, palette).rows.length, 5)
  },
}

run(tests)
