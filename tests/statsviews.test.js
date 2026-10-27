import assert from "node:assert/strict"
import { plain, frame, ALL_PANELS, palette, full, Sys, Gpu, Stats, Tiles, Rows, Views, run } from "./statsfixtures.js"

// StatsViews.js: how the panels tile a strip.

const tests = {
  "stalls show as rows on the CPU, memory and disks views, where the kernel reports them"() {
    // Under 1%, a stall is left off: the frame's CPU stalls 0.12%.
    assert.ok(!Views.view("cpu", full, palette).rows.some(row => row.label === "Stalled"))
    assert.equal(Views.view("memory", full, palette).rows.find(row => row.label === "Stalled").text, "1.5%")
    assert.equal(Views.view("disks", full, palette).rows.find(row => row.label === "Stalled").text, "4.0%")
    const bare = Stats.step(Stats.empty(), frame(10, [0]).replace(/@psi\n(.*\n)*?@hwmon/, "@psi\n@hwmon"), [])
    for (const panel of ["cpu", "memory", "disks"])
      assert.ok(!Views.view(panel, bare, palette).rows.some(row => row.label === "Stalled"), panel)
  },
  "fit draws nothing on a strip with no size yet"() {
    for (const [w, h] of [[0, 0], [NaN, 100], [100, -5]]) {
      const grid = Tiles.fit(["gpu", "cpu"], w, h)
      assert.deepEqual(plain(grid.cards), [], w + "x" + h)
      assert.deepEqual(plain(grid.dropped), ["gpu", "cpu"])
    }
  },
  "the disks view fits its rows to the room"() {
    // Under the I/O graph in a stacked card, beside it in a wide one.
    assert.equal(Views.view("disks", full, palette, 4).rows.length, 2)
    assert.equal(Views.view("disks", full, palette, 2, true).rows.length, 2)
  },
  "the disks view keeps each row short"() {
    const view = Views.view("disks", full, palette)
    const nvme = view.rows.find(row => row.label === "nvme0n1")
    assert.equal(nvme.text, "R 1.0K  W 0  35°C")
  },
  "unitFor sizes the dashboard's text to the strip"() {
    assert.equal(Tiles.unitFor(1440, 660), 18)
    assert.equal(Tiles.unitFor(2560, 96), 12)
    assert.equal(Tiles.unitFor(2560, 40), 9)
  },
  "layout tiles the panels in the grid with the largest cards"() {
    // A 1440x660 top strip fits four panels two by two.
    const grid = Tiles.layout(["gpu", "cpu", "memory", "network"], 1440, 660, 18)
    assert.deepEqual(plain(grid.cards.map(card => card.panel)), ["gpu", "cpu", "memory", "network"])
    assert.deepEqual(plain(grid.dropped), [])
    assert.equal(grid.cards[0].y, grid.cards[1].y)
    assert.ok(grid.cards[2].y > grid.cards[0].y)
    // A wide, short strip puts them in one row.
    const row = Tiles.layout(["gpu", "cpu", "memory"], 2560, 160, 14)
    assert.equal(new Set(row.cards.map(card => card.y)).size, 1)
    // A tall side strip stacks them.
    const column = Tiles.layout(["gpu", "cpu", "memory"], 320, 1600, 16)
    assert.equal(new Set(column.cards.map(card => card.x)).size, 1)
  },
  "layout keeps cards inside the strip with a margin"() {
    const grid = Tiles.layout(ALL_PANELS, 1440, 660, 18)
    for (const card of grid.cards) {
      assert.ok(card.x >= 18 && card.y >= 18, JSON.stringify(card))
      assert.ok(card.x + card.width <= 1440 - 18 + 0.01 && card.y + card.height <= 660 - 18 + 0.01, JSON.stringify(card))
    }
  },
  "layout stretches a short last row across the strip"() {
    const grid = Tiles.layout(["gpu", "cpu", "memory"], 1440, 660, 18)
    const last = grid.cards[grid.cards.length - 1]
    if (last.y !== grid.cards[0].y) assert.equal(Math.round(last.x + last.width), 1440 - 18)
  },
  "fit shrinks the text until every card has room for its content"() {
    // Four panels on the 1080x660 strip keep the largest text.
    assert.equal(Tiles.fit(["gpu", "cpu", "memory", "network"], 1080, 660).unit, 18)
    // Every panel makes a crowded grid; the text shrinks until each card,
    // stacked or wide, has room for its content.
    const dense = Tiles.fit(ALL_PANELS, 1080, 660)
    assert.ok(dense.unit < 18)
    assert.equal(dense.cards.length, ALL_PANELS.length)
    for (const card of dense.cards) assert.ok(Tiles.roomy(card, dense.unit), JSON.stringify(card))
    // A short, wide strip gets wide cards, which need less height.
    const strip = Tiles.fit(["gpu", "cpu", "memory", "network"], 2560, 160)
    assert.equal(strip.cards.length, 4)
    assert.ok(strip.cards[0].width > strip.cards[0].height * Tiles.WIDE_CARD)
    assert.ok(strip.cards[0].height >= Tiles.WIDE_ROOM * strip.unit)
    // Wide cards take fewer rows for larger text: a 160 px strip keeps
    // 16 px text, not the 13 px that every row needed.
    assert.ok(strip.unit >= 16, String(strip.unit))
    assert.ok(Tiles.fit(["gpu", "cpu", "memory", "network"], 2560, 120).unit >= 12)
    // A wide card needs room across too: two to a row on a 648 px
    // portrait strip, the text shrinks until headline and rows fit.
    const portrait = Tiles.fit(ALL_PANELS.slice(0, 10), 648, 750)
    for (const card of portrait.cards) assert.ok(card.width >= Tiles.WIDE_SPAN * portrait.unit || card.width <= card.height * Tiles.WIDE_CARD, JSON.stringify(card))
    assert.ok(portrait.unit <= 13, String(portrait.unit))
    // When nothing makes room, the smallest text still shows what fits.
    const tiny = Tiles.fit(ALL_PANELS, 600, 120)
    assert.equal(tiny.unit, 9)
    assert.ok(tiny.cards.length > 0)
  },
  "a wide card leaves out the headline parts it has no room for"() {
    const view = () => ({ value: "39%", note: "Tctl · 95°C", alert: 0, graphs: [{}, {}], bars: [{}, {}], stack: [{}] })
    // Room for everything: nothing goes.
    const roomy = view()
    Rows.fitHeadline(roomy, 10)
    assert.equal(roomy.bars.length, 2)
    assert.equal(roomy.graphs.length, 2)
    // Three rows: the bars go first, then the stack, the note and the
    // second graph, never the value or the first graph.
    const short = view()
    Rows.fitHeadline(short, 3)
    assert.equal(short.bars.length, 0)
    assert.equal(short.stack.length, 0)
    assert.equal(short.note, "")
    assert.equal(short.graphs.length, 1)
    assert.ok(Rows.headlineRows(short) <= 3 + Rows.GAP_ROWS)
    // Four rows keep the CPU's value, graph and per-core bars.
    const cpu = { value: "39%", note: "", alert: 0, graphs: [{}], bars: [{}], stack: [] }
    Rows.fitHeadline(cpu, 4)
    assert.equal(cpu.bars.length, 1)
    // A warning's note stays.
    const warned = Object.assign(view(), { alert: Rows.ALERT })
    Rows.fitHeadline(warned, 3)
    assert.equal(warned.note, "Tctl · 95°C")
  },
  "layout drops the last panels when they do not fit"() {
    const grid = Tiles.layout(["gpu", "cpu", "memory", "network", "disks"], 600, 120, 12)
    assert.ok(grid.cards.length < 5)
    assert.deepEqual(plain(grid.dropped), ["gpu", "cpu", "memory", "network", "disks"].slice(grid.cards.length))
    assert.deepEqual(plain(Tiles.layout(["gpu"], 50, 50, 9).dropped), ["gpu"])
    assert.deepEqual(plain(Tiles.layout([], 1440, 660, 18).cards), [])
  },
  "a panel with nothing to show on this machine takes no card"() {
    // The fixture has an RTX 4080 and a Radeon iGPU, and a wireless mouse.
    assert.deepEqual(plain(Views.availablePanels(["gpu", "igpu", "battery"], full)), ["gpu", "igpu", "battery"])
    const desktop = Object.assign({}, full, { drm: [], power: [] })
    assert.deepEqual(plain(Views.availablePanels(["gpu", "igpu", "cpu", "battery"], desktop)), ["gpu", "cpu"])
    // Before the first frame, every panel.
    assert.deepEqual(plain(Views.availablePanels(["igpu", "battery"], Stats.empty())), ["igpu", "battery"])
  },
  "pickPlayer prefers a playing player with a track, then any with one"() {
    const players = [
      { identity: "Brave", isPlaying: true, trackTitle: "" },
      { identity: "mpv", isPlaying: false, trackTitle: "Film" },
      { identity: "Spotify", isPlaying: true, trackTitle: "Song" }
    ]
    assert.equal(Sys.pickPlayer(players).identity, "Spotify")
    assert.equal(Sys.pickPlayer(players.slice(0, 2)).identity, "mpv")
    assert.equal(Sys.pickPlayer(players.slice(0, 1)).identity, "Brave")
    assert.equal(Sys.pickPlayer([]), null)
    // A player left behind with nothing in it (a closed browser tab) is
    // nothing playing.
    assert.equal(Sys.pickPlayer([{ identity: "Brave", isPlaying: false, trackTitle: "" }]), null)
  },
  "an AMD card is discrete by its own memory, not by how much VRAM it has"() {
    // A big APU (Strix Halo) carves out a lot of system memory, but has no
    // VRAM vendor; a small discrete card has one.
    const apu = Gpu.drmGpus({ card1: { driver: "amdgpu", status: "active", busy: 3, vram_total: 96 * 1073741824 } }, {}, 0)[0]
    assert.equal(apu.kind, "integrated")
    const small = Gpu.drmGpus({ card1: { driver: "amdgpu", status: "active", busy: 3, dedicated: 1, vram_total: 2147483648 } }, {}, 0)[0]
    assert.equal(small.kind, "discrete")
  },
  "NVIDIA cards are left to the NVIDIA panel, not the AMD and Intel list"() {
    const nvidia = "@drm\ncard1\tnvidia\tstatus\tactive\ncard1\tnvidia\tcontrol\ton\n"
    const state = Stats.step(Stats.empty(), frame(10, [0], nvidia), [])
    assert.equal(state.drm.some(gpu => gpu.id === "card1"), false)
  },
  "nvidia-smi runs all the time unless the dGPU can power itself down"() {
    const unmanaged = "@drm\ncard1\tnvidia\tstatus\tactive\ncard1\tnvidia\tcontrol\ton\n"
    let state = Stats.step(Stats.empty(), frame(10, [0], unmanaged), ["0, NVIDIA GeForce RTX 4080, 0, 7551, 16376, 54, 20.0, 320.00, 210, 30, 0, 0"])
    for (let t = 11; t <= 20; t++) state = Stats.step(state, frame(t, [0], unmanaged), ["0, NVIDIA GeForce RTX 4080, 0, 7551, 16376, 54, 20.0, 320.00, 210, 30, 0, 0"])
    assert.equal(Gpu.nvidiaPoll(state), "on")
    // Without any NVIDIA card in sysfs (no driver yet), it runs too.
    assert.equal(Gpu.nvidiaPoll(Stats.step(Stats.empty(), frame(10, [0]), [])), "on")
  },
  "sensors read only now and then keep their last values between reads"() {
    const slow = "@slowhwmon\ndell_smm\tfan1\tProcessor Fan\t2400\n"
    let state = Stats.step(Stats.empty(), frame(10, [0], slow), [])
    state = Stats.step(state, frame(11, [0]), [])
    assert.deepEqual(plain(state.fans.map(fan => fan.name)), ["CPU fan", "Processor Fan"])
    assert.equal(state.fans[1].rpm, 2400)
  },
  "ease and progress drive the paced animations"() {
    assert.equal(Stats.ease(0), 0)
    assert.equal(Stats.ease(1), 1)
    assert.equal(Stats.ease(0.5), 0.5)
    assert.equal(Stats.ease(0.25), 0.125)
    assert.equal(Stats.ease(-1), 0)
    assert.equal(Stats.ease(2), 1)
    assert.equal(Stats.progress(1500, 1000, 1000), 0.5)
    assert.equal(Stats.progress(900, 1000, 1000), 0)
    assert.equal(Stats.progress(5000, 1000, 1000), 1)
    assert.equal(Stats.progress(1000, 1000, 0), 1)
  },
  "upowerBatteries takes the peripherals UPower knows, such as Bluetooth headsets"() {
    const devices = [
      { nativePath: "hidpp_battery_0", model: "Logitech G502 X LS", type: "Mouse", powerSupply: false, percentage: 0.63, state: "Discharging" },
      { nativePath: "/org/bluez/hci0/dev_08_F0_B6_67_89_F3", model: "EDIFIER W830NB", type: "Headset", powerSupply: false, percentage: 0.7, state: "Unknown" },
      { nativePath: "BAT0", model: "5B10W51867", type: "Battery", powerSupply: true, percentage: 0.81, state: "Discharging" },
      { nativePath: "", model: "", type: "Unknown", powerSupply: false, percentage: 0, state: "Unknown" }
    ]
    const batteries = plain(Sys.upowerBatteries(devices))
    assert.deepEqual(batteries.map(b => [b.id, b.name, b.kind, b.capacity, b.device]), [
      ["hidpp_battery_0", "Logitech G502 X LS", "Mouse", 63, true],
      ["/org/bluez/hci0/dev_08_F0_B6_67_89_F3", "EDIFIER W830NB", "Headset", 70, true]
    ])
    assert.equal(Sys.deviceKind("GamingInput"), "Controller")
    assert.equal(Sys.deviceKind("Battery"), "")
    // Types no one calls a device by keep the model name.
    for (const type of ["BluetoothGeneric", "Pda", "OtherAudio", "Unknown", undefined]) assert.equal(Sys.deviceKind(type), "")
    assert.deepEqual(plain(Sys.upowerBatteries(null)), [])
    // Quickshell's lists are array-like, not arrays; a real array comes out.
    const listLike = { length: 2, 0: devices[0], 1: devices[1] }
    const fromList = Sys.upowerBatteries(listLike)
    assert.ok(Array.isArray(fromList))
    assert.equal(fromList.length, 2)
  },
}

run(tests)
