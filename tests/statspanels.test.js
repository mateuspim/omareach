import assert from "node:assert/strict"
import { plain, frame, ALL_PANELS, palette, full, clockState, Format, Net, Sys, Stats, Rows, Views, run } from "./statsfixtures.js"

// StatsViews.js: what each panel shows, and the network, processes, system,
// battery, media and disks panels.

const tests = {}

ALL_PANELS.forEach(panel => {
  tests["view of " + panel + " has a title, a box color and content"] = () => {
    const view = Views.view(panel, panel === "clock" ? clockState : full, palette)
    assert.ok(view.title && view.icon, panel)
    assert.match(view.color, /^#[0-9a-f]{6}$/)
    assert.equal(view.empty, "", panel + " should have data")
    assert.ok(view.rows.length + view.lists.length + view.bars.length + view.graphs.length + (view.media ? 1 : 0) + (view.value ? 1 : 0) + (view.digits ? 1 : 0) > 0, panel)
    for (const row of view.rows) assert.ok(row.fraction === null || (row.fraction >= 0 && row.fraction <= 1), JSON.stringify(row))
    const empty = Views.view(panel, Stats.empty(), palette)
    assert.equal(empty.title, view.title)
  }
})

Object.assign(tests, {
  "the network rates are rows keyed to their graphs, which carry no text"() {
    const view = Views.view("network", full, palette)
    // Text over a spiky graph is unreadable.
    assert.ok(view.graphs.every(graph => graph.label === ""))
    // Both totals on one row, so a short card never shows only one.
    assert.deepEqual(plain(view.rows.map(row => row.label)), ["Down", "Up", "Peak", "Total"])
    assert.equal(view.rows[3].text, "↓ " + Format.formatShort(full.network.rxTotal) + "  ↑ " + Format.formatShort(full.network.txTotal))
    assert.equal(view.rows[0].text, Format.formatRate(full.network.rx))
    assert.ok(view.rows[0].swatch && view.rows[1].swatch)
    // Keyed by the low color a quiet graph's line shows.
    assert.equal(view.rows[0].color, palette.gradients.download[0])
    // The peak each graph's top stands for.
    assert.equal(view.rows[2].text, "↓ " + Format.formatShort(view.graphs[0].max) + "  ↑ " + Format.formatShort(view.graphs[1].max))
    // The disks graph's peak sits in the title's corner.
    const disks = Views.view("disks", full, palette)
    assert.equal(disks.info, "2 disks · peak " + Format.formatShort(disks.graphs[0].max) + "/s")
    assert.equal(disks.graphs[0].label, "")
  },
  "the network view says whether a VPN is on, and which meshes"() {
    // No VPN this session: no row about one.
    assert.ok(!Views.view("network", full, palette).rows.some(row => row.label === "VPN"))
    const withNetwork = network => Object.assign({}, full, { network: Object.assign({}, full.network, network) })
    const on = Views.view("network", withNetwork({ vpn: [{ name: "Proton VPN", interface: "proton0", address: "10.2.0.2" }], vpnSeen: true }), palette)
    // Ahead of Peak and Total, which a short card drops first.
    assert.deepEqual(plain(on.rows.map(row => row.label)), ["Down", "Up", "VPN", "Peak", "Total"])
    assert.equal(on.rows[2].text, "Proton VPN")
    assert.equal(on.rows[2].color, palette.gradients.level[0])
    const off = Views.view("network", withNetwork({ vpn: [], vpnSeen: true }), palette)
    assert.equal(off.rows[2].text, "off")
    assert.equal(off.rows[2].color, palette.alert)
    // A mesh shows its address when stats.sh was asked for it, else "on".
    const mesh = Views.view("network", withNetwork({ mesh: [{ name: "Tailscale", interface: "tailscale0", address: "" }] }), palette)
    assert.deepEqual(plain(mesh.rows.slice(2, 3).map(row => [row.label, row.text])), [["Tailscale", "on"]])
    const shown = Views.view("network", withNetwork({ mesh: [{ name: "Tailscale", interface: "tailscale0", address: "100.101.102.103" }] }), palette)
    assert.equal(shown.rows[2].text, "100.101.102.103")
    // With vpn.sh's word on where each goes.
    const placed = Views.view("network", withNetwork({ vpn: [{ name: "Proton VPN", place: "Miami, US" }], vpnSeen: true, mesh: [{ name: "Tailscale", address: "100.101.102.103", peers: 4, online: 1 }] }), palette)
    assert.equal(placed.rows[2].text, "Proton VPN · Miami, US")
    assert.equal(placed.rows[3].text, "100.101.102.103 · 1/4 online")
    assert.equal(Rows.meshText({ name: "ZeroTier" }), "on")
    assert.equal(Rows.meshText({ peers: 4, online: 0 }), "0/4 online")
    assert.equal(Rows.vpnTip([{ name: "VPN", interface: "tun0" }]), "VPN\ntun0")
    assert.equal(Rows.meshTip({ interface: "wt0" }), "wt0")
    // Hovering says more.
    const status = Net.parseVpnInfo("@tailscale\n" + JSON.stringify({
      BackendState: "Running",
      Self: { DNSName: "desk.tail1234.ts.net.", TailscaleIPs: ["100.64.0.1"] },
      Peer: Object.fromEntries(Array.from({ length: 10 }, (_, i) => ["p" + i, { HostName: "node" + i, OS: "linux", Online: i === 0, CurAddr: i === 0 ? "1.2.3.4:41641" : "" }]))
    })).tailscale
    const hovered = Views.view("network", withNetwork({ vpn: [{ name: "Proton VPN", interface: "proton0", place: "Miami, US", details: ["US-FL#332 · Miami, Florida"] }], vpnSeen: true, mesh: [{ name: "Tailscale", interface: "tailscale0", peers: 10, online: 1, status }] }), palette)
    assert.equal(hovered.rows[2].tip, "Proton VPN · Miami, US\nUS-FL#332 · Miami, Florida\nproton0")
    const tip = hovered.rows[3].tip.split("\n")
    assert.deepEqual(tip.slice(0, 4), ["desk.tail1234.ts.net", "100.64.0.1", "", "● node0  linux, direct"])
    assert.equal(tip[4], "○ node1  linux, offline")
    assert.equal(tip[tip.length - 1], "and 2 more")
  },
  "the processes view ranks memory, and keeps one line per resource when small"() {
    const state = Object.assign({}, full, {
      memoryProcesses: [{ pid: 2, name: "firefox", memory: 4 * 1073741824, count: 12 }, { pid: 3, name: "code", memory: 1073741824, count: 1 }]
    })
    const memory = Views.view("processes", state, palette).lists[1]
    assert.deepEqual(plain(memory.items.map(item => [item.name, item.text])), [["firefox ×12", "4.0 GiB"], ["code", "1.0 GiB"]])
    assert.equal(memory.items[0].fraction, 4 * 1073741824 / full.memory.total)
    // Too little room for a title and a line per list: the top of each,
    // named for what it uses, in one list without a title.
    const small = Views.view("processes", state, palette, 4)
    assert.equal(small.lists.length, 1)
    assert.equal(small.lists[0].title, "")
    // The line to spare goes to the next program.
    assert.deepEqual(plain(small.lists[0].items.map(item => item.name)), ["CPU · game", "Memory · firefox ×12", "VRAM · game", "Memory · code"])
  },
  "the system view leaves live numbers to the panels that show them"() {
    const alone = Views.view("system", full, palette).rows.map(row => row.label)
    assert.ok(alone.includes("Memory") && alone.includes("Load"))
    const beside = Views.view("system", full, palette, undefined, false, 30, ["cpu", "memory", "system"]).rows.map(row => row.label)
    assert.ok(!beside.includes("Memory") && !beside.includes("Load"))
  },
  "the system view leads with the uptime"() {
    const view = Views.view("system", full, palette)
    assert.equal(view.value, "9h 50m")
    assert.equal(view.caption, "up")
    assert.equal(view.info, "odin")
    assert.equal(view.logo, true)
    assert.equal(view.rows.find(row => row.label === "Kernel").text, "7.2.5-3-omarchy")
    assert.equal(view.rows.find(row => row.label === "Threads").text, "1234")
  },
  "the system view reads like fastfetch, most telling first"() {
    const info = "@sysinfo\nuser\tpym\nos\tOmarchy\nomarchy\t4.0.4-1\nchannel\tstable\nsys_vendor\tASUS\nproduct_name\tSystem Product Name\n" +
      "board_vendor\tASUSTeK COMPUTER INC.\nboard_name\tTUF GAMING B650M-E WIFI\ncpu\tAMD Ryzen 9 9900X 12-Core Processor\n" +
      "packages\t1176\nflatpaks\t3\nshell\tbash\ndesktop\tHyprland\ntheme\tcozy-ui\n"
    let state = Stats.step(Stats.empty(), frame(10, [0], info), ["0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"])
    // Read every minute only, they stand between reads.
    state = Stats.step(state, frame(11, [0]), ["0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"])
    const view = Views.view("system", state, palette)
    assert.equal(view.info, "pym@odin")
    assert.deepEqual(plain(view.rows.map(row => [row.label, row.text])), [
      ["OS", "Omarchy 4.0.4-1"],
      ["Channel", "stable"],
      ["Host", "TUF GAMING B650M-E WIFI"],
      ["Kernel", "7.2.5-3-omarchy"],
      ["CPU", "Ryzen 9 9900X"],
      ["GPU", "RTX 4080"],
      ["iGPU", "Radeon Graphics"],
      ["Memory", "26.3 / 60.5 GiB"],
      ["Packages", "1176 pacman, 3 flatpak"],
      ["Shell", "bash"],
      ["Desktop", "Hyprland"],
      // Named as omarchy-theme-current names it.
      ["Theme", "Cozy Ui"],
      ["Load", "0.52  0.61  0.70"],
      ["Threads", "1234"]
    ])
    // A small card keeps the first rows, under the uptime.
    assert.deepEqual(plain(Views.view("system", state, palette, 6, false).rows.map(row => row.label)), ["OS", "Channel", "Host"])
  },
  "the battery view shows a laptop battery and peripherals"() {
    // Without a laptop battery the first peripheral leads. A battery's
    // level over a minute is a flat line, so there is no graph.
    const mouseOnly = Views.view("battery", full, palette)
    assert.equal(mouseOnly.value, "64%")
    assert.equal(mouseOnly.caption, "G502 X LIGHTSPEED")
    assert.equal(mouseOnly.graphs.length, 0)
    // A bar of its level under the headline, and it is not listed again.
    assert.deepEqual(plain(mouseOnly.stack.map(part => part.fraction)), [0.64])
    assert.deepEqual(plain(mouseOnly.rows), [])
    // With several peripherals the emptiest leads; the rest are rows.
    const twoMice = Object.assign({}, full, { power: full.power.concat([
      { id: "hid2", name: "MX Master 3S", device: true, status: "Charging", capacity: 40, level: "", power: null, energy: null, full: null }
    ]) })
    const mice = Views.view("battery", twoMice, palette)
    assert.equal(mice.caption, "MX Master 3S  ·  charging")
    assert.equal(mice.info, "2 devices")
    assert.deepEqual(plain(mice.rows.map(row => [row.label, row.text, row.fraction])), [["G502 X LIGHTSPEED", "64%", 0.64]])
    assert.equal(mice.alert, 0)
    const laptop = Object.assign(Stats.empty(), { time: 1, history: Object.assign(Stats.empty().history, { battery: [81] }), power: [
      { id: "BAT0", name: "BAT0", device: false, status: "Discharging", capacity: 81, level: "", power: 12.5, energy: 40, full: 50 },
      { id: "hid", name: "MX Keys", device: true, status: "", capacity: null, level: "Low", power: null, energy: null, full: null }
    ] })
    const view = Views.view("battery", laptop, palette)
    assert.equal(view.value, "81%")
    assert.equal(view.caption, "3h 12m left")
    // The emptiest peripheral takes the title's room, which a short card
    // keeps when it drops the device rows.
    assert.equal(view.info, "MX Keys 20%")
    const bare = Object.assign({}, laptop, { power: [laptop.power[0]] })
    assert.equal(Views.view("battery", bare, palette).info, "on battery")
    // A peripheral reporting only a level reads as about that full.
    assert.deepEqual(plain(view.rows.map(row => [row.label, row.text])), [["Power", "12.5 W"], ["Energy", "40.0 / 50.0 Wh"], ["MX Keys", "20%"]])
    // A low battery that is not charging asks for attention.
    assert.equal(view.alert, 0)
    // Louder as it empties: 15%, 10% and 5%, laptop or peripheral.
    const at = capacity => Object.assign({}, laptop, { power: [Object.assign({}, laptop.power[0], { capacity })] })
    assert.equal(Views.view("battery", at(16), palette).alert, 0)
    assert.equal(Views.view("battery", at(15), palette).alert, Rows.CAUTION)
    assert.equal(Views.view("battery", at(15), palette).note, "low")
    assert.equal(Views.view("battery", at(10), palette).alert, Rows.ALERT)
    assert.equal(Views.view("battery", at(5), palette).alert, Rows.CRITICAL)
    assert.equal(Views.view("battery", at(5), palette).note, "critical")
    const headset = Object.assign({}, laptop, { power: [laptop.power[0], { id: "bt", name: "EDIFIER W830NB", device: true, status: "", capacity: 8, level: "", power: null, energy: null, full: null }] })
    const loud = Views.view("battery", headset, palette)
    assert.equal(loud.alert, Rows.ALERT)
    // Named when it is not the battery leading the card.
    assert.equal(loud.note, "EDIFIER W830NB very low")
    const charging = Object.assign({}, laptop, { power: [Object.assign({}, laptop.power[0], { capacity: 12, status: "Charging" })] })
    assert.equal(Views.view("battery", charging, palette).alert, 0)
    // Health and cycles where the battery reports them.
    const worn = Object.assign({}, laptop, { power: [Object.assign({}, laptop.power[0], { health: 82, cycles: 412 })] })
    assert.deepEqual(plain(Views.view("battery", worn, palette).rows.map(row => [row.label, row.text])), [["Power", "12.5 W"], ["Energy", "40.0 / 50.0 Wh"], ["Health", "82%"], ["Cycles", "412"]])
    assert.equal(Views.view("battery", Object.assign(Stats.empty(), { time: 1 }), palette).empty, "No batteries")
  },
  "the media view shows the track, with its progress"() {
    const media = { identity: "Spotify", title: "Song", artist: "Band", album: "Record", art: "file:///a.png", playing: true, position: 83, length: 225 }
    const state = Stats.step(Stats.empty(), frame(10, [0]), "", media)
    const view = Views.view("media", state, palette)
    assert.equal(view.info, "Spotify")
    assert.equal(view.media.title, "Song")
    assert.equal(view.media.time, "1:23 / 3:45")
    assert.ok(Math.abs(view.media.progress - 83 / 225) < 1e-9)
    assert.equal(Views.view("media", Stats.step(Stats.empty(), frame(10, [0]), "", null), palette).empty, "Nothing playing")
    // A player that tells nothing of its track is named instead.
    const bare = Views.view("media", Stats.step(Stats.empty(), frame(10, [0]), "", { identity: "Brave", title: "", artist: "", album: "", art: "", playing: true, position: null, length: null }), palette)
    assert.equal(bare.media.title, "Brave")
    assert.equal(bare.info, "")
    assert.equal(bare.media.time, "")
  },
  "the media view loads local artwork only"() {
    const media = { identity: "Browser", title: "Song", playing: true, position: null, length: null }
    const art = url => Views.view("media", Stats.step(Stats.empty(), frame(10, [0]), "", { ...media, art: url }), palette).media.art
    assert.equal(art("file:///tmp/cover.png"), "file:///tmp/cover.png")
    for (const url of ["https://example.com/cover.png", "http://127.0.0.1/cover.png", "file://host/cover.png", "file:////host/cover.png", "data:image/png;base64,AAAA", "image://provider/cover"])
      assert.equal(art(url), "", url)
  },
  "the processes view fills the room it is given"() {
    const many = Array.from({ length: 12 }, (_, i) => ({ pid: i + 1, name: "p" + i, cpu: 50 - i, count: 1 }))
    const apps = Array.from({ length: 5 }, (_, i) => ({ pid: i + 1, name: "a" + i, memory: 1048576 * (5 - i) }))
    const state = Object.assign(Stats.empty(), { processes: many, gpuApps: apps, nvidia: full.nvidia })
    // Room for 12 rows: three list titles, "Nothing busy" for memory (no
    // sample yet), three apps, and the rest for programs.
    let view = Views.view("processes", state, palette, 12)
    assert.deepEqual(plain(view.lists.map(list => list.items.length)), [5, 0, 3])
    view = Views.view("processes", state, palette, 14)
    assert.deepEqual(plain(view.lists.map(list => list.items.length)), [7, 0, 3])
    // A short card ranks a few of each, not many programs and no apps.
    view = Views.view("processes", state, palette, 8)
    assert.deepEqual(plain(view.lists.map(list => list.items.length)), [2, 0, 2])
    // Room for a title and a line per list keeps the top of each.
    view = Views.view("processes", state, palette, 6)
    assert.deepEqual(plain(view.lists.map(list => list.items.length)), [1, 0, 1])
    // Without a room given, the usual five and three.
    view = Views.view("processes", state, palette)
    assert.deepEqual(plain(view.lists.map(list => list.items.length)), [5, 0, 3])
  },
  "an idle player with no track shows nothing playing"() {
    const idle = { identity: "Brave", title: "", artist: "", album: "", art: "", playing: false, position: 0, length: null }
    assert.equal(Views.view("media", Stats.step(Stats.empty(), frame(10, [0]), "", idle), palette).empty, "Nothing playing")
  },
  "the media view hides the time when the player gives no length"() {
    const brave = { identity: "Brave", title: "", artist: "", album: "", art: "", playing: true, position: 0, length: null }
    const view = Views.view("media", Stats.step(Stats.empty(), frame(10, [0]), "", brave), palette)
    assert.equal(view.media.time, "")
    assert.equal(view.media.progress, null)
  },
  "step adds UPower's peripherals to the batteries, once each"() {
    const extra = Sys.upowerBatteries([
      { nativePath: "hidpp_battery_0", model: "Logitech G502 X LS", type: "Mouse", powerSupply: false, percentage: 0.64, state: "Discharging" },
      { nativePath: "/org/bluez/hci0/dev_1", model: "EDIFIER W830NB", type: "Headset", powerSupply: false, percentage: 0.7, state: "Unknown" }
    ])
    const state = Stats.step(Stats.empty(), frame(10, [0]), [], undefined, extra)
    assert.deepEqual(plain(state.power.map(b => b.name)), ["G502 X LIGHTSPEED", "EDIFIER W830NB"])
    // The kernel's entry takes the kind UPower knows the same device as.
    assert.deepEqual(plain(state.power.map(b => b.kind)), ["Mouse", "Headset"])
    // One of each kind: named by kind, which a narrow card has room for.
    const view = Views.view("battery", state, palette)
    assert.equal(view.caption, "Mouse")
    assert.deepEqual(plain(view.rows.map(row => [row.label, row.text])), [["Headset", "70%"]])
    // Which mouse and which headset, in full on hover.
    assert.equal(view.captionTip, "G502 X LIGHTSPEED")
    // A wide card's headline is too narrow beside the value: the name goes
    // on the line under it, with its tip, and a warning after it.
    const wideView = Views.view("battery", state, palette, 4, true)
    assert.equal(wideView.caption, "")
    assert.equal(wideView.note, "Mouse")
    assert.equal(wideView.noteTip, "G502 X LIGHTSPEED")
    const low = Object.assign({}, state, { power: state.power.map(b => b.kind === "Mouse" ? Object.assign({}, b, { capacity: 9, status: "Discharging" }) : b) })
    assert.equal(Views.view("battery", low, palette, 4, true).note, "Mouse  ·  very low")
    // When another device is the low one, the lead keeps its name.
    const other = Object.assign({}, state, { power: state.power.map(b => b.kind === "Mouse"
      ? Object.assign({}, b, { capacity: 10, status: "Charging" })
      : Object.assign({}, b, { capacity: 14, status: "Discharging" })) })
    const both = Views.view("battery", other, palette, 4, true)
    assert.equal(both.value, "10%")
    assert.equal(both.note, "Mouse  ·  charging  ·  Headset low")
    assert.equal(both.noteTip, "G502 X LIGHTSPEED  ·  EDIFIER W830NB")
    assert.equal(Views.view("battery", other, palette).note, "Headset low")
    assert.deepEqual(plain(view.rows.map(row => row.tip)), ["EDIFIER W830NB"])
    // Two of a kind keep their names.
    const second = Object.assign({}, extra[0], { id: "hid2", name: "MX Master 3S", capacity: 90 })
    const two = Views.view("battery", Stats.step(Stats.empty(), frame(10, [0]), [], undefined, extra.concat([second])), palette)
    assert.equal(two.caption, "G502 X LIGHTSPEED")
    assert.deepEqual(plain(two.rows.map(row => row.label)), ["Headset", "MX Master 3S"])
    // A name shown already needs no tip.
    assert.equal(two.captionTip, "")
    assert.equal(two.rows[1].tip, "")
    // A headset alone leads.
    const alone = Stats.step(Stats.empty(), frame(10, [0]).replace(/@power[\s\S]*?@drm/, "@power\n@drm"), [], undefined, extra.slice(1))
    assert.equal(Views.view("battery", alone, palette).value, "70%")
    // Without the list (the panel is not shown), the kernel's batteries only.
    assert.equal(Stats.step(Stats.empty(), frame(10, [0]), []).power.length, 1)
  },
  "the processes view counts an empty list's line"() {
    const many = Array.from({ length: 12 }, (_, i) => ({ pid: i + 1, name: "p" + i, cpu: 50 - i, count: 1 }))
    const state = Object.assign(Stats.empty(), { processes: many, gpuApps: [], nvidia: full.nvidia })
    // Three titles and two "Nothing busy" lines leave three rows of programs.
    assert.equal(Views.view("processes", state, palette, 8).lists[0].items.length, 3)
  },
  "a narrow disks card leaves the temperatures to their panel"() {
    const wide = Views.view("disks", full, palette, 6, false, 30)
    assert.ok(wide.rows.some(row => /°C/.test(row.text)))
    const narrow = Views.view("disks", full, palette, 6, false, 20)
    assert.ok(!narrow.rows.some(row => /°C/.test(row.text)))
  },
  "the clock view draws the time in digits over the date and the rest"() {
    const view = Views.view("clock", clockState, palette, 6, false, 30)
    assert.equal(view.digits, "14:05:30")
    assert.equal(view.value, "")
    assert.equal(view.valueColor, palette.boxes.clock)
    assert.equal(view.info, "Lisbon")
    assert.deepEqual(plain(view.rows.map(row => row.label)), ["Date", "Week", "Today"])
    // The day's meter is in the Clock's color.
    assert.equal(view.rows[2].color, palette.boxes.clock)
    assert.ok(view.rows[2].fraction > 0.58 && view.rows[2].fraction < 0.59)
    // A short card keeps the date, leaving the week; a narrow one the
    // minutes alone.
    assert.deepEqual(plain(Views.view("clock", clockState, palette, 4, false, 30).rows.map(row => row.label)), ["Date"])
    assert.equal(Views.view("clock", clockState, palette, 6, false, 20).digits, "14:05")
    // With other zones the info line gives way to their rows.
    const zoned = Object.assign({}, clockState, { clock: Object.assign({}, clockState.clock, { zones: ["Asia/Tokyo"], offsets: { "Asia/Tokyo": 540 } }) })
    const withZone = Views.view("clock", zoned, palette, 9, false, 30)
    assert.equal(withZone.info, "")
    assert.equal(withZone.rows[2].label, "Tokyo")
    assert.equal(withZone.rows[2].tip, "Asia/Tokyo")
    assert.equal(Views.view("clock", full, palette).empty, "Waiting for data")
  },
  "the processes view names merged processes with their count"() {
    const state = Object.assign(Stats.empty(), { processes: [{ pid: 2, name: "brave", cpu: 80, count: 3 }] })
    assert.equal(Views.view("processes", state, palette).lists[0].items[0].name, "brave ×3")
  },
})

run(tests)
