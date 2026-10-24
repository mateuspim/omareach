import assert from "node:assert/strict"
import { load } from "./qmljs.js"

// Stats.js and StatsViews.js are QML `.pragma library` scripts, loaded like
// Model.js; the views import the data script as `Stats`.
const Stats = load("Stats.js")
const Views = load("StatsViews.js", { Stats })

// Objects made inside the sandbox have its prototypes; copy them out so
// strict deep equality compares only their contents.
const plain = value => JSON.parse(JSON.stringify(value))

// One frame of stats.sh as captured on a desktop with a Ryzen, an RTX 4080,
// two NVMe drives and a SATA SSD.
const frame = (time, cpu, extra = "") => `@time ${time}
@stat
cpu  ${cpu.join(" ")}
cpu0 ${cpu.map(n => Math.floor(n / 2)).join(" ")}
cpu1 ${cpu.map(n => Math.ceil(n / 2)).join(" ")}
@loadavg
0.52 0.61 0.70 2/1234 5678
@meminfo
MemTotal:       63412576 kB
MemFree:         3389572 kB
MemAvailable:   35827448 kB
Buffers:            3676 kB
Cached:         36056908 kB
SwapTotal:      126826340 kB
SwapFree:       126826340 kB
@route
Iface	Destination	Gateway 	Flags	RefCnt	Use	Metric	Mask		MTU	Window	IRTT
eno1	82624692	0132A8C0	0007	0	0	100	FFFFFFFF	0	0	0
eno1	00000000	0132A8C0	0003	0	0	100	00000000	0	0	0
@net
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 173185512 1045587    0    0    0     0          0         0 173185512 1045587    0    0    0     0       0          0
  eno1:${29099514268 + time * 1000} 21340164    0  578    0     0          0     40622 ${1410672755 + time * 100} 9140346    0    0    0     0       0          0
@disk
   8       0 sda 243 2 8385 121 4 0 0 0 0 103 121 0 0 0 0 4 0
 259       0 nvme0n1 197532 1577 ${43858112 + time * 2} 184524 45005 399 5502352 60618 0 37472 246574 803 0 3832304 451 192 980
 259       1 nvme0n1p1 197462 1577 43855576 184516 45005 399 5502352 60618 0 37259 245585 803 0 3832304 451 0 0
 252       0 zram0 75 0 2848 0 1 0 8 0 0 0 0 0 0 0 0 0 0
 254       0 dm-0 75 0 2848 0 1 0 8 0 0 0 0 0 0 0 0 0 0
@model
nvme0n1	KINGSTON SFYRDK2000G
sda	SanDisk SSD PLUS
@psi
cpu some avg10=0.12 avg60=0.30 avg300=0.34 total=136314838
cpu full avg10=0.00 avg60=0.00 avg300=0.00 total=0
memory some avg10=1.50 avg60=0.00 avg300=0.00 total=36660
io some avg10=4.00 avg60=0.00 avg300=0.00 total=14948124
@hwmon
nvme	temp1	Composite	34850
k10temp	temp1	Tctl	67375
k10temp	temp3	Tccd1	65500
asus	fan1	CPU fan	1210
amdgpu	temp1	edge	41000
spd5118	temp1		58000
spd5118	temp1		56250
@nvme
nvme0	34850
nvme1	42850
@freq
5399595
4800000
@system
hostname	odin
kernel	7.2.5-3-omarchy
uptime	35458.33
@power
hidpp_battery_0	type	Battery
hidpp_battery_0	scope	Device
hidpp_battery_0	status	Unknown
hidpp_battery_0	capacity	64
hidpp_battery_0	model_name	G502 X LIGHTSPEED
@rapl
package-0	${1000000000 + time * 65000000}	65532610987
@drm
card2	amdgpu	status	active
card2	amdgpu	busy	99
card2	amdgpu	vram_used	1228115968
card2	amdgpu	vram_total	2147483648
card2	amdgpu	temp	60000
card2	amdgpu	power	157000
card2	amdgpu	freq	2200000000
${extra}@end
`

const ALL_PANELS = ["gpu", "igpu", "cpu", "memory", "network", "disks", "processes", "temps", "battery", "media", "system"]

const tests = {
  "parseFrame splits a frame into its sections"() {
    const sections = Stats.parseFrame(frame(10, [1, 2, 3, 4, 5, 6, 7, 8, 0, 0]))
    assert.equal(sections.time, 10)
    assert.equal(sections.stat.length, 3)
    assert.equal(sections.freq.length, 2)
    assert.equal(sections.procs, undefined)
  },
  "parseCpu reads busy and total ticks per line"() {
    const cpu = Stats.parseCpu(["cpu  100 0 50 800 50 0 0 0 0 0", "cpu0 10 0 0 90 0 0 0 0 0 0"])
    // Idle is idle plus iowait; guest time is already counted in user.
    assert.deepEqual(plain(cpu), { total: { busy: 150, all: 1000 }, cores: [{ id: "cpu0", busy: 10, all: 100 }] })
  },
  "cpuLoad is the busy share of the ticks between two samples"() {
    const a = { total: { busy: 100, all: 1000 }, cores: [{ id: "cpu0", busy: 0, all: 100 }, { id: "cpu1", busy: 50, all: 100 }] }
    const b = { total: { busy: 175, all: 1100 }, cores: [{ id: "cpu0", busy: 50, all: 150 }, { id: "cpu1", busy: 50, all: 200 }] }
    assert.deepEqual(plain(Stats.cpuLoad(a, b)), { total: 75, cores: [100, 0] })
    assert.deepEqual(plain(Stats.cpuLoad(a, a)), { total: 0, cores: [0, 0] })
  },
  "cpuLoad matches cores by name when one goes offline"() {
    const a = { total: { busy: 0, all: 0 }, cores: [{ id: "cpu0", busy: 0, all: 100 }, { id: "cpu1", busy: 100, all: 200 }, { id: "cpu2", busy: 0, all: 100 }] }
    const b = { total: { busy: 0, all: 0 }, cores: [{ id: "cpu0", busy: 10, all: 200 }, { id: "cpu2", busy: 0, all: 200 }] }
    assert.deepEqual(plain(Stats.cpuLoad(a, b).cores), [10, 0])
  },
  "parseMeminfo reports used as total less available, in bytes"() {
    const memory = Stats.parseMeminfo(Stats.parseFrame(frame(1, [0])).meminfo)
    assert.equal(memory.total, 63412576 * 1024)
    assert.equal(memory.used, (63412576 - 35827448) * 1024)
    assert.equal(memory.available, 35827448 * 1024)
    assert.equal(memory.cached, (36056908 + 3676) * 1024)
    assert.equal(memory.swapUsed, 0)
  },
  "defaultInterface follows the default route, the lowest metric first"() {
    const lines = Stats.parseFrame(frame(1, [0])).route
    assert.equal(Stats.defaultInterface(lines), "eno1")
    assert.equal(Stats.defaultInterface([lines[0], "wlan0\t00000000\t0\t3\t0\t0\t600\t00000000", "eth1\t00000000\t0\t3\t0\t0\t50\t00000000"]), "eth1")
    assert.equal(Stats.defaultInterface([lines[0]]), "")
  },
  "parseNetDev reads byte counters, glued colons and all"() {
    const net = Stats.parseNetDev(Stats.parseFrame(frame(0, [0])).net)
    assert.deepEqual(plain(net.eno1), { rx: 29099514268, tx: 1410672755 })
    assert.deepEqual(plain(net.lo), { rx: 173185512, tx: 173185512 })
  },
  "parseDiskstats keeps whole disks only, in bytes"() {
    const disks = Stats.parseDiskstats(Stats.parseFrame(frame(0, [0])).disk)
    assert.deepEqual(Object.keys(disks), ["sda", "nvme0n1"])
    assert.deepEqual(plain(disks.nvme0n1), { read: 43858112 * 512, written: 5502352 * 512 })
  },
  "parsePressure reads the some avg10 stall of each resource"() {
    const pressure = Stats.parsePressure(Stats.parseFrame(frame(0, [0])).psi)
    assert.deepEqual(plain(pressure), { cpu: 0.12, memory: 1.5, io: 4 })
  },
  "parseSensors finds the CPU temperature, fans and NVMe temperatures"() {
    const sections = Stats.parseFrame(frame(0, [0]))
    const sensors = Stats.parseSensors(sections.hwmon, sections.nvme)
    assert.equal(sensors.cpuTemp, 67.375)
    assert.deepEqual(plain(sensors.fans), [{ name: "CPU fan", rpm: 1210 }])
    assert.deepEqual(plain(sensors.nvme), { nvme0: 34.85, nvme1: 42.85 })
    // coretemp names its package, other chips their first sensor.
    assert.equal(Stats.parseSensors(["coretemp\ttemp2\tCore 0\t50000", "coretemp\ttemp1\tPackage id 0\t55000"], []).cpuTemp, 55)
    assert.equal(Stats.parseSensors(["cpu_thermal\ttemp1\t\t48000"], []).cpuTemp, 48)
    assert.equal(Stats.parseSensors([], []).cpuTemp, null)
  },
  "parseSensors names the CPU dies and memory modules for the sensors panel"() {
    const sections = Stats.parseFrame(frame(0, [0]))
    const sensors = Stats.parseSensors(sections.hwmon, sections.nvme)
    assert.deepEqual(plain(sensors.temps), [
      { name: "CPU", temp: 67.375, limit: 95 }, { name: "CCD 1", temp: 65.5, limit: 95 },
      { name: "DIMM 1", temp: 58, limit: 85 }, { name: "DIMM 2", temp: 56.25, limit: 85 }
    ])
    // Intel's per-core sensors stay out; its package is the CPU.
    const intel = Stats.parseSensors(["coretemp\ttemp1\tPackage id 0\t55000", "coretemp\ttemp2\tCore 0\t50000"], [])
    assert.deepEqual(plain(intel.temps), [{ name: "CPU", temp: 55, limit: 100 }])
  },
  "parseSensors takes each sensor's critical temperature as its limit"() {
    // stats.sh's fifth column, as a coretemp gives its TjMax and a DDR5
    // module its limit; NVMe lines carry theirs third.
    const sensors = Stats.parseSensors([
      "coretemp\ttemp1\tPackage id 0\t72000\t105000",
      "spd5118\ttemp1\t\t51000\t85000",
      "spd5118\ttemp1\t\t49000\t"
    ], ["nvme0\t42850\t84850", "nvme1\t33850"])
    assert.equal(sensors.cpuTemp, 72)
    assert.equal(sensors.cpuLimit, 105)
    assert.deepEqual(plain(sensors.temps.map(t => t.limit)), [105, 85, 85])
    assert.deepEqual(plain(sensors.nvmeLimits), { nvme0: 84.85, nvme1: 80 })
    // k10temp gives none: AMD desktops throttle at 95 °C.
    assert.equal(Stats.parseSensors(["k10temp\ttemp1\tTctl\t66000\t"], []).cpuLimit, 95)
  },
  "heat fills a meter from room temperature to the limit"() {
    assert.equal(Stats.heat(30, 95), 0)
    assert.equal(Stats.heat(95, 95), 1)
    assert.equal(Stats.heat(62.5, 95), 0.5)
    assert.equal(Stats.heat(20, 95), 0)
    assert.equal(Stats.heat(null, 95), 0)
    // No usable limit reads as 100 °C.
    assert.equal(Stats.heat(65, null), 0.5)
  },
  "coreGroups splits a hybrid CPU's threads by kind"() {
    assert.deepEqual(plain(Stats.cpuList("0-3,8,10-11")), [0, 1, 2, 3, 8, 10, 11])
    assert.deepEqual(plain(Stats.cpuList("")), [])
    assert.deepEqual(plain(Stats.coreGroups({ cpu_core: "0-15", cpu_atom: "16-23" })), {
      performance: [...Array(16).keys()], efficient: [16, 17, 18, 19, 20, 21, 22, 23]
    })
    assert.equal(Stats.coreGroups({ cpu_core: "0-15" }), null)
    assert.equal(Stats.coreGroups(null), null)
  },
  "parseSystem reads the host, kernel and uptime"() {
    const system = Stats.parseSystem(Stats.parseFrame(frame(0, [0])).system)
    assert.deepEqual(plain(system), { hostname: "odin", kernel: "7.2.5-3-omarchy", uptime: 35458.33 })
  },
  "parsePower reads batteries, in watts and watt-hours"() {
    const supplies = Stats.parsePower([
      "BAT0\ttype\tBattery", "BAT0\tstatus\tDischarging", "BAT0\tcapacity\t81",
      "BAT0\tpower_now\t12500000", "BAT0\tenergy_now\t40000000", "BAT0\tenergy_full\t50000000",
      "AC\ttype\tMains", "AC\tonline\t0",
      "BAT1\ttype\tBattery", "BAT1\tstatus\tCharging", "BAT1\tcapacity\t50",
      "BAT1\tcurrent_now\t2000000", "BAT1\tvoltage_now\t12000000", "BAT1\tcharge_now\t2000000", "BAT1\tcharge_full\t4000000",
      "hidpp_battery_0\ttype\tBattery", "hidpp_battery_0\tscope\tDevice", "hidpp_battery_0\tcapacity_level\tLow", "hidpp_battery_0\tmodel_name\tMX Keys"
    ])
    assert.deepEqual(plain(supplies.map(s => s.id)), ["BAT0", "BAT1", "hidpp_battery_0"])
    assert.deepEqual(plain(supplies[0]), { id: "BAT0", name: "BAT0", device: false, status: "Discharging", capacity: 81, level: "", power: 12.5, energy: 40, full: 50, health: null, cycles: null })
    // Charge and current, as some batteries report, times the voltage.
    assert.equal(supplies[1].power, 24)
    assert.equal(supplies[1].energy, 24)
    assert.equal(supplies[1].full, 48)
    assert.deepEqual(plain(supplies[2]), { id: "hidpp_battery_0", name: "MX Keys", device: true, status: "", capacity: null, level: "Low", power: null, energy: null, full: null, health: null, cycles: null })
  },
  "parsePower reads a battery's health and cycles"() {
    const [energy, charge, uncounted] = Stats.parsePower([
      "BAT0\ttype\tBattery", "BAT0\tenergy_full\t45000000", "BAT0\tenergy_full_design\t50000000", "BAT0\tcycle_count\t312",
      "BAT1\ttype\tBattery", "BAT1\tcharge_full\t3600000", "BAT1\tcharge_full_design\t4000000",
      "BAT2\ttype\tBattery", "BAT2\tcycle_count\t0"
    ])
    assert.equal(energy.health, 90)
    assert.equal(energy.cycles, 312)
    assert.equal(charge.health, 90)
    // A battery that does not count its cycles reports 0.
    assert.equal(uncounted.cycles, null)
    assert.equal(uncounted.health, null)
  },
  "formatDuration and formatUptime"() {
    assert.equal(Stats.formatDuration(83), "1:23")
    assert.equal(Stats.formatDuration(3723), "1:02:03")
    assert.equal(Stats.formatDuration(null), "—")
    assert.equal(Stats.formatUptime(35458.33), "9h 50m")
    assert.equal(Stats.formatUptime(200000), "2d 7h")
    assert.equal(Stats.formatUptime(300), "5m")
  },
  "averageFrequency is in MHz"() {
    assert.equal(Stats.averageFrequency(["5399595", "4800000"]), 5099.7975)
    assert.equal(Stats.averageFrequency([]), null)
  },
  "parseGpu reads nvidia-smi's CSV, with N/A as null"() {
    const gpu = Stats.parseGpu("0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 12")
    assert.deepEqual(plain(gpu), {
      index: 0, name: "RTX 4080", load: 55, memUsed: 7551 * 1048576, memTotal: 16376 * 1048576,
      temp: 54, power: 149.65, powerLimit: 320, clock: 2790, fan: 30, encoder: 0, decoder: 12
    })
    assert.equal(Stats.parseGpu("0, Tesla T4, 3, 100, 15360, 40, [N/A], [Not Supported], 300, [N/A], 0, 0").fan, null)
    assert.equal(Stats.parseGpu("NVIDIA-SMI has failed"), null)
  },
  "parseGpuApps lists apps by video memory, with short names"() {
    const apps = Stats.parseGpuApps([
      "407143, S:\\steamapps\\common\\MGSDelta\\Binaries\\Win64\\MGSDelta-Win64-Shipping.exe, 7204",
      "2211, /usr/bin/python3, 812",
      "No running processes found"
    ])
    assert.deepEqual(plain(apps), [
      { pid: 407143, name: "MGSDelta-Win64-Shipping", memory: 7204 * 1048576 },
      { pid: 2211, name: "python3", memory: 812 * 1048576 }
    ])
  },
  "parseProcs reads each process's name and CPU ticks"() {
    const procs = Stats.parseProcs([
      "1234 (Web Content) S 1 2 3 4 5 6 7 8 9 10 300 50 0 0 20 0 1 0",
      "77 (a) b) R 1 2 3 4 5 6 7 8 9 10 5 5 0 0 20 0 1 0",
      "garbage"
    ])
    // Lines this short carry no resident set.
    assert.deepEqual(plain(procs), { 1234: { name: "Web Content", ticks: 350, rss: 0 }, 77: { name: "a) b", ticks: 10, rss: 0 } })
    // Field 24 is the resident set, in pages.
    const full = Stats.parseProcs(["5 (game) S 1 2 3 4 5 6 7 8 9 10 300 50 0 0 20 0 1 0 100 4096000 2500"])
    assert.equal(full[5].rss, 2500)
  },
  "topMemory adds up the resident memory of processes of one name"() {
    const procs = { 1: { name: "firefox", rss: 1000 }, 2: { name: "firefox", rss: 3000 }, 3: { name: "bash", rss: 100 }, 4: { name: "zombie", rss: 0 } }
    const top = plain(Stats.topMemory(procs, 4096, 10))
    assert.deepEqual(top.map(p => [p.name, p.memory, p.count, p.pid]), [["firefox", 4000 * 4096, 2, 2], ["bash", 100 * 4096, 1, 3]])
    // Pages of another size, as on some ARM kernels; 4 KiB without one.
    assert.equal(Stats.topMemory(procs, 16384, 1)[0].memory, 4000 * 16384)
    assert.equal(Stats.topMemory(procs, NaN, 1)[0].memory, 4000 * 4096)
  },
  "topProcesses ranks CPU use since the last sample, as top does"() {
    const before = { 1: { name: "game", ticks: 100 }, 2: { name: "idle", ticks: 5 }, 3: { name: "gone", ticks: 1 } }
    const after = { 1: { name: "game", ticks: 400 }, 2: { name: "idle", ticks: 5 }, 4: { name: "new", ticks: 50 } }
    // 300 ticks at 100 Hz over 2 s is 150% of one core; a new process
    // counts from 0 only if it started since, so it is left out.
    assert.deepEqual(plain(Stats.topProcesses(before, after, 2, 5)), [{ pid: 1, name: "game", cpu: 150, count: 1 }])
  },
  "topProcesses adds up processes of the same name"() {
    const before = { 1: { name: "brave", ticks: 0 }, 2: { name: "brave", ticks: 0 }, 3: { name: "game", ticks: 0 } }
    const after = { 1: { name: "brave", ticks: 30 }, 2: { name: "brave", ticks: 50 }, 3: { name: "game", ticks: 60 } }
    assert.deepEqual(plain(Stats.topProcesses(before, after, 1, 5)), [
      { pid: 2, name: "brave", cpu: 80, count: 2 },
      { pid: 3, name: "game", cpu: 60, count: 1 }
    ])
  },
  "history keeps the last samples, oldest first"() {
    let series = []
    for (let i = 1; i <= 5; i++) series = Stats.pushHistory(series, i, 3)
    assert.deepEqual(plain(series), [3, 4, 5])
  },
  "ingest turns two frames into loads and rates"() {
    let state = Stats.ingest(Stats.empty(), Stats.parseFrame(frame(100, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0])))
    assert.equal(state.cpu.total, null)
    assert.equal(state.network.rx, null)
    assert.equal(state.memory.used, (63412576 - 35827448) * 1024)
    state = Stats.ingest(state, Stats.parseFrame(frame(102, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0])))
    assert.equal(state.cpu.total, 50)
    assert.equal(state.cpu.cores.length, 2)
    assert.equal(state.cpu.temp, 67.375)
    assert.deepEqual(plain(state.cpu.loadavg), [0.52, 0.61, 0.7])
    assert.equal(state.network.interface, "eno1")
    assert.equal(state.network.rx, 1000)
    assert.equal(state.network.tx, 100)
    const nvme = state.disks.find(disk => disk.name === "nvme0n1")
    assert.deepEqual(plain(nvme), { name: "nvme0n1", model: "KINGSTON SFYRDK2000G", read: 1024, write: 0, temp: 34.85, tempLimit: 80 })
    assert.equal(state.disks.find(disk => disk.name === "sda").temp, null)
    assert.deepEqual(plain(state.history.cpu), [50])
    assert.deepEqual(plain(state.history.rx), [1000])
  },
  "parseRapl sums the packages' energy counters, in joules"() {
    assert.deepEqual(plain(Stats.parseRapl(["package-0\t2000000\t65532610987", "package-1\t1000000\t65532610987"])),
      { energy: 3, range: 131065.221974, limit: null })
    assert.equal(Stats.parseRapl([]), null)
    assert.equal(Stats.parseRapl(["package-0\t\t65532610987"]), null)
    // Intel's long-term limit (PL1) comes with the counter, in microwatts.
    assert.equal(Stats.parseRapl(["package-0\t2000000\t65532610987\t125000000"]).limit, 125)
  },
  "cpuPowerLimit is Intel's own limit, or an AMD desktop's stock PPT by model"() {
    assert.equal(Stats.cpuPowerLimit("Intel(R) Core(TM) i7-14700K", 125), 125)
    // PPT is 1.35 times the TDP on AM4 and AM5.
    assert.equal(Stats.cpuPowerLimit("AMD Ryzen 9 9900X 12-Core Processor", null), 162)
    assert.equal(Stats.cpuPowerLimit("AMD Ryzen 7 9800X3D 8-Core Processor", null), 162)
    assert.equal(Stats.cpuPowerLimit("AMD Ryzen 9 7950X 16-Core Processor", null), 230)
    assert.equal(Stats.cpuPowerLimit("AMD Ryzen 7 5800X3D 8-Core Processor", null), 142)
    assert.equal(Stats.cpuPowerLimit("AMD Ryzen 5 7600 6-Core Processor", null), 88)
    // A laptop's or an unknown model's: none, so no color.
    assert.equal(Stats.cpuPowerLimit("AMD Ryzen 7 7840HS w/ Radeon 780M Graphics", null), null)
    assert.equal(Stats.cpuPowerLimit("", null), null)
  },
  "ingest turns the CPU's energy counter into watts"() {
    let state = Stats.ingest(Stats.empty(), Stats.parseFrame(frame(100, [0])))
    assert.equal(state.cpu.power, null)
    state = Stats.ingest(state, Stats.parseFrame(frame(102, [0])))
    assert.equal(state.cpu.power, 65)
    // The counter wraps at its range.
    const wrap = text => text.replace(/@rapl\n[^\n]*/, "@rapl\npackage-0\t" + text.match(/@time (\S+)/)[1] * 1e6 + "\t100000000")
    state = Stats.ingest(Stats.empty(), Stats.parseFrame(wrap(frame(98, [0]))))
    state = Stats.ingest(state, Stats.parseFrame(wrap(frame(2, [0])).replace("@time 2", "@time 99")))
    assert.equal(state.cpu.power, 4)
    // Unreadable without a udev rule: no power.
    state = Stats.ingest(Stats.empty(), Stats.parseFrame(frame(100, [0]).replace(/@rapl\n[^\n]*\n/, "@rapl\n")))
    state = Stats.ingest(state, Stats.parseFrame(frame(101, [0]).replace(/@rapl\n[^\n]*\n/, "@rapl\n")))
    assert.equal(state.cpu.power, null)
  },
  "ingest starts the rates over after a long gap"() {
    let state = Stats.ingest(Stats.empty(), Stats.parseFrame(frame(100, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0])))
    state = Stats.ingest(state, Stats.parseFrame(frame(200, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0])))
    assert.equal(state.cpu.total, null)
    assert.equal(state.network.rx, null)
  },
  "ingest ranks processes when the frame carries them"() {
    const procs = ticks => `@procs\n1 (game) S 1 2 3 4 5 6 7 8 9 10 ${ticks} 0 0 0\n@gpuapps\n1, /opt/game, 512\n`
    let state = Stats.ingest(Stats.empty(), Stats.parseFrame(frame(10, [0], procs(100))))
    assert.deepEqual(plain(state.processes), [])
    state = Stats.ingest(state, Stats.parseFrame(frame(11, [0])))
    assert.deepEqual(plain(state.processes), [])
    state = Stats.ingest(state, Stats.parseFrame(frame(13, [0], procs(400))))
    assert.deepEqual(plain(state.processes), [{ pid: 1, name: "game", cpu: 100, count: 1 }])
    assert.deepEqual(plain(state.gpuApps), [{ pid: 1, name: "game", memory: 512 * 1048576 }])
  },
  "ingestGpu keeps the NVIDIA GPU with the lowest index of a frame's lines"() {
    const lines = ["1, NVIDIA GeForce RTX 3060, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9", "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0", "garbage"]
    let state = Stats.ingestGpu(Stats.empty(), lines)
    assert.equal(state.nvidia.name, "RTX 4080")
    // Every frame brings both GPUs' lines; the lowest index keeps updating.
    state = Stats.ingestGpu(state, ["1, NVIDIA GeForce RTX 3060, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9", "0, NVIDIA GeForce RTX 4080, 70, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"])
    assert.equal(state.nvidia.load, 70)
  },
  "an NVIDIA reading that stops coming is dropped after a few frames"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), ["0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"])
    for (let t = 11; t <= 13; t++) state = Stats.step(state, frame(t, [0]), [])
    // A frame or two without a line is timing; the reading stays.
    assert.equal(state.nvidia.load, 55)
    for (let t = 14; t <= 16; t++) state = Stats.step(state, frame(t, [0]), [])
    assert.equal(state.nvidia, null)
  },
  "a sleeping discrete GPU keeps the kind it had awake"() {
    const awake = "@drm\ncard1\tamdgpu\tstatus\tactive\ncard1\tamdgpu\tdedicated\t1\ncard1\tamdgpu\tvram_total\t17163091968\ncard1\tamdgpu\tbusy\t5\n"
    const asleep = "@drm\ncard1\tamdgpu\tstatus\tsuspended\n"
    let state = Stats.step(Stats.empty(), frame(10, [0], awake), [])
    state = Stats.step(state, frame(11, [0], asleep), [])
    const card = state.drm.find(gpu => gpu.id === "card1")
    assert.equal(card.asleep, true)
    assert.equal(card.kind, "discrete")
    assert.equal(card.name, "Radeon")
    // So the GPU panel keeps it, asleep, rather than swapping to the iGPU.
    assert.equal(Stats.gpuRoles(state).main.id, "card1")
  },
  "the iGPU history starts over when another GPU takes the panel"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), ["0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"])
    assert.deepEqual(plain(state.history.igpu), [99])
    const intel = "@drm\ncard0\ti915\tstatus\tactive\ncard0\ti915\tidle_ms\t100\n"
    state = Stats.step(state, frame(11, [0], intel), [])
    assert.equal(Stats.gpuRoles(state).integrated.id, "card0")
    assert.deepEqual(plain(state.history.igpu), [])
  },
  "parseDrm reads AMD and Intel cards from stats.sh"() {
    const cards = Stats.parseDrm([
      "card2\tamdgpu\tstatus\tactive", "card2\tamdgpu\tbusy\t99", "card2\tamdgpu\tvram_total\t2147483648",
      "card0\ti915\tfreq_mhz\t1300", "card0\ti915\tidle_ms\t5000",
      "card3\tamdgpu\tstatus\tsuspended"
    ])
    assert.deepEqual(plain(cards.card2), { driver: "amdgpu", status: "active", busy: 99, vram_total: 2147483648 })
    assert.equal(cards.card0.idle_ms, 5000)
    assert.equal(cards.card3.status, "suspended")
  },
  "drmGpus turns cards into GPUs, integrated or discrete"() {
    const sections = Stats.parseFrame(frame(0, [0]))
    const [amd] = plain(Stats.drmGpus(Stats.parseDrm(sections.drm), {}, 0))
    assert.deepEqual(amd, {
      id: "card2", vendor: "AMD", name: "Radeon Graphics", kind: "integrated", asleep: false, resting: false,
      load: 99, memUsed: 1228115968, memTotal: 2147483648, temp: 60, tempLimit: 100, power: 0.157, powerLimit: null,
      clock: 2200, fan: null, encoder: null, decoder: null
    })
    // An AMD card with memory of its own (from a VRAM vendor) is a discrete one, and its fan
    // speed comes from its PWM duty.
    const big = Stats.drmGpus({ card1: { driver: "amdgpu", status: "active", busy: 40, dedicated: 1, vram_total: 17163091968, pwm: 102, power_cap: 300000000 } }, {}, 0)[0]
    assert.equal(big.kind, "discrete")
    assert.equal(big.name, "Radeon")
    assert.equal(big.fan, 40)
    assert.equal(big.powerLimit, 300)
    // A sleeping card is reported asleep, with no readings.
    const asleep = Stats.drmGpus({ card3: { driver: "amdgpu", status: "suspended" } }, {}, 0)[0]
    assert.equal(asleep.asleep, true)
    assert.equal(asleep.load, null)
    // A card that gives a critical temperature is measured against it.
    assert.equal(Stats.drmGpus({ card1: { driver: "amdgpu", status: "active", temp: 70000, temp_crit: 110000 } }, {}, 0)[0].tempLimit, 110)
  },
  "drmGpus names a card by the marketing name stats.sh looked up"() {
    const card = { card2: { driver: "amdgpu", status: "active", busy: 5 } }
    // From pci.ids, the bracketed product; from amdgpu.ids, without "AMD".
    assert.equal(Stats.drmGpus(card, {}, 0, {}, [], { gpu_name_card2: "Radeon 610M" })[0].name, "Radeon 610M")
    assert.equal(Stats.drmGpus(card, {}, 0, {}, [], { gpu_name_card2: "AMD Radeon 780M Graphics" })[0].name, "Radeon 780M")
    assert.equal(Stats.drmGpus({ card0: { driver: "i915", freq_mhz: 300 } }, {}, 0, {}, [], { gpu_name_card0: "UHD Graphics 770" })[0].name, "Intel UHD Graphics 770")
    assert.equal(Stats.drmGpus(card, {}, 0, {}, [], { gpu_name_card2: "AMD Radeon Graphics" })[0].name, "Radeon Graphics")
    // Without one, by vendor and kind.
    assert.equal(Stats.drmGpus(card, {}, 0, {}, [], {})[0].name, "Radeon Graphics")
  },
  "Intel load is the share of time the GPU was not idle"() {
    const now = { card0: { driver: "i915", freq_mhz: 1300, idle_ms: 5750 } }
    const [intel] = Stats.drmGpus(now, { card0: 5000 }, 1)
    assert.equal(intel.vendor, "Intel")
    assert.equal(intel.kind, "integrated")
    assert.equal(intel.load, 25)
    assert.equal(intel.clock, 1300)
    // Without a sample before, there is no load yet.
    assert.equal(Stats.drmGpus(now, {}, 1)[0].load, null)
    // xe names its counters the same once stats.sh has read them.
    assert.equal(Stats.drmGpus({ card0: { driver: "xe", idle_ms: 2000 } }, { card0: 1000 }, 2)[0].load, 50)
  },
  "gpuRoles puts the discrete GPU first and the integrated one beside it"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0")
    let roles = Stats.gpuRoles(state)
    assert.equal(roles.main.name, "RTX 4080")
    assert.equal(roles.integrated.name, "Radeon Graphics")
    // With only the iGPU, it is the main GPU and there is no second one.
    state = Stats.step(Stats.empty(), frame(10, [0]), "")
    roles = Stats.gpuRoles(state)
    assert.equal(roles.main.name, "Radeon Graphics")
    assert.equal(roles.integrated, null)
  },
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
      const grid = Views.fit(["gpu", "cpu"], w, h)
      assert.deepEqual(plain(grid.cards), [], w + "x" + h)
      assert.deepEqual(plain(grid.dropped), ["gpu", "cpu"])
    }
  },
  "the disks view fits its rows to the room"() {
    // Under the I/O graph in a stacked card, beside it in a wide one.
    assert.equal(Views.view("disks", full, palette, 4).rows.length, 2)
    assert.equal(Views.view("disks", full, palette, 2, true).rows.length, 2)
  },
  "NVMe temperatures carry over frames that do not read them"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), [])
    state = Stats.step(state, frame(11, [0]).replace(/@nvme\n(.*\n)*?@freq/, "@freq"), [])
    assert.equal(state.nvmeTemps.nvme0, 34.85)
    assert.equal(state.disks.find(disk => disk.name === "nvme0n1").temp, 34.85)
  },
  "step applies a frame and the GPU line that came with it in one update"() {
    const gpuLine = "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0"
    let state = Stats.step(Stats.empty(), frame(10, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0]), gpuLine)
    state = Stats.step(state, frame(11, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0]), "")
    assert.equal(state.cpu.total, 50)
    assert.equal(state.nvidia.load, 55)
    // The GPU history advances with the frames, one sample each.
    assert.deepEqual(plain(state.history.gpu), [55, 55])
    assert.equal(state.history.gpu.length, state.history.cpu.length + 1)
    assert.deepEqual(plain(state.history.igpu), [99, 99])
  },
  "the GPU history starts over when another GPU becomes the main one"() {
    let state = Stats.step(Stats.empty(), frame(10, [0]), "")
    assert.deepEqual(plain(state.history.gpu), [99])
    state = Stats.step(state, frame(11, [0]), "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 0")
    assert.deepEqual(plain(state.history.gpu), [55])
  },
  "parseColors reads an Omarchy colors.toml"() {
    const colors = Stats.parseColors('mode = "dark"\naccent = "#81a1c1"\n# red = "#000000"\nred = "#BF616A"\ncolor2 = \'#a3be8c\'\n')
    assert.deepEqual(plain(colors), { accent: "#81a1c1", red: "#bf616a", color2: "#a3be8c" })
  },
  "palette builds btop-style gradients from the theme's named colors"() {
    const palette = Stats.palette({ foreground: "#d8dee9", background: "#2e3440", accent: "#81a1c1", muted: "#4c566a", red: "#bf616a", yellow: "#ebcb8b", green: "#a3be8c", cyan: "#88c0d0", blue: "#81a1c1", magenta: "#b48ead", orange: "#d5967a" })
    assert.deepEqual(plain(palette.gradients.cpu), ["#88c0d0", "#81a1c1", "#b48ead"])
    assert.deepEqual(plain(palette.gradients.level), ["#a3be8c", "#a3be8c", "#ebcb8b", "#bf616a"])
    assert.equal(palette.alert, "#bf616a")
    assert.equal(palette.boxes.cpu, "#b48ead")
    assert.equal(palette.boxes.memory, "#a3be8c")
    assert.equal(palette.foreground, "#d8dee9")
    assert.equal(palette.line, "#4c566a")
  },
  "palette falls back to the numbered colors, then the foreground"() {
    const palette = Stats.palette({ color0: "#000000", color1: "#aa0000", color2: "#00aa00", color3: "#aaaa00", color4: "#0000aa", color5: "#aa00aa", color6: "#00aaaa", color7: "#cccccc", color8: "#555555" })
    assert.deepEqual(plain(palette.gradients.level), ["#00aa00", "#00aa00", "#aaaa00", "#aa0000"])
    assert.equal(palette.foreground, "#cccccc")
    assert.equal(palette.line, "#555555")
    // orange falls back to yellow.
    assert.equal(palette.gradients.download[1], "#aaaa00")
    const bare = Stats.palette({}, { foreground: "#eeeeee", accent: "#3366ff" })
    assert.equal(bare.boxes.gpu, "#3366ff")
    assert.deepEqual(plain(bare.gradients.cpu), ["#3366ff", "#3366ff", "#3366ff"])
  },
  "gradientAt mixes the stops"() {
    const stops = ["#000000", "#808080", "#ffffff"]
    assert.equal(Stats.gradientAt(stops, 0), "#000000")
    assert.equal(Stats.gradientAt(stops, 0.5), "#808080")
    assert.equal(Stats.gradientAt(stops, 0.25), "#404040")
    assert.equal(Stats.gradientAt(stops, 2), "#ffffff")
    assert.equal(Stats.gradientAt(stops, -1), "#000000")
  },
  "formatters"() {
    assert.equal(Stats.formatBytes(0), "0 B")
    assert.equal(Stats.formatBytes(1536), "1.5 KiB")
    assert.equal(Stats.formatBytes(7551 * 1048576), "7.4 GiB")
    assert.equal(Stats.formatBytes(150 * 1048576), "150 MiB")
    assert.equal(Stats.formatRate(2048), "2.0 KiB/s")
    assert.equal(Stats.formatRate(null), "—")
    assert.equal(Stats.formatPercent(54.6), "55%")
    assert.equal(Stats.formatPercent(null), "—")
    assert.equal(Stats.formatTemp(67.375), "67°C")
    assert.equal(Stats.formatTemp(null), "—")
    assert.equal(Stats.formatFrequency(5099.8), "5.10 GHz")
    assert.equal(Stats.formatFrequency(800), "800 MHz")
    assert.equal(Stats.formatShort(0), "0")
    assert.equal(Stats.formatShort(958464), "936K")
    assert.equal(Stats.formatShort(2.1 * 1048576), "2.1M")
    assert.equal(Stats.formatShort(null), "—")
  },
  "the disks view keeps each row short"() {
    const view = Views.view("disks", full, palette)
    const nvme = view.rows.find(row => row.label === "nvme0n1")
    assert.equal(nvme.text, "R 1.0K  W 0  35°C")
  },
  "the processes view names merged processes with their count"() {
    const state = Object.assign(Stats.empty(), { processes: [{ pid: 2, name: "brave", cpu: 80, count: 3 }] })
    assert.equal(Views.view("processes", state, palette).lists[0].items[0].name, "brave ×3")
  },
  "unitFor sizes the dashboard's text to the strip"() {
    assert.equal(Views.unitFor(1440, 660), 18)
    assert.equal(Views.unitFor(2560, 96), 12)
    assert.equal(Views.unitFor(2560, 40), 9)
  },
  "layout tiles the panels in the grid with the largest cards"() {
    // A 1440x660 top strip fits four panels two by two.
    const grid = Views.layout(["gpu", "cpu", "memory", "network"], 1440, 660, 18)
    assert.deepEqual(plain(grid.cards.map(card => card.panel)), ["gpu", "cpu", "memory", "network"])
    assert.deepEqual(plain(grid.dropped), [])
    assert.equal(grid.cards[0].y, grid.cards[1].y)
    assert.ok(grid.cards[2].y > grid.cards[0].y)
    // A wide, short strip puts them in one row.
    const row = Views.layout(["gpu", "cpu", "memory"], 2560, 160, 14)
    assert.equal(new Set(row.cards.map(card => card.y)).size, 1)
    // A tall side strip stacks them.
    const column = Views.layout(["gpu", "cpu", "memory"], 320, 1600, 16)
    assert.equal(new Set(column.cards.map(card => card.x)).size, 1)
  },
  "layout keeps cards inside the strip with a margin"() {
    const grid = Views.layout(ALL_PANELS, 1440, 660, 18)
    for (const card of grid.cards) {
      assert.ok(card.x >= 18 && card.y >= 18, JSON.stringify(card))
      assert.ok(card.x + card.width <= 1440 - 18 + 0.01 && card.y + card.height <= 660 - 18 + 0.01, JSON.stringify(card))
    }
  },
  "layout stretches a short last row across the strip"() {
    const grid = Views.layout(["gpu", "cpu", "memory"], 1440, 660, 18)
    const last = grid.cards[grid.cards.length - 1]
    if (last.y !== grid.cards[0].y) assert.equal(Math.round(last.x + last.width), 1440 - 18)
  },
  "fit shrinks the text until every card has room for its content"() {
    // Four panels on the 1080x660 strip keep the largest text.
    assert.equal(Views.fit(["gpu", "cpu", "memory", "network"], 1080, 660).unit, 18)
    // Every panel makes a crowded grid; the text shrinks until each card,
    // stacked or wide, has room for its content.
    const dense = Views.fit(ALL_PANELS, 1080, 660)
    assert.ok(dense.unit < 18)
    assert.equal(dense.cards.length, ALL_PANELS.length)
    for (const card of dense.cards) assert.ok(Views.roomy(card, dense.unit), JSON.stringify(card))
    // A short, wide strip gets wide cards, which need less height.
    const strip = Views.fit(["gpu", "cpu", "memory", "network"], 2560, 160)
    assert.equal(strip.cards.length, 4)
    assert.ok(strip.cards[0].width > strip.cards[0].height * Views.WIDE_CARD)
    assert.ok(strip.cards[0].height >= Views.WIDE_ROOM * strip.unit)
    // Wide cards take fewer rows for larger text: a 160 px strip keeps
    // 16 px text, not the 13 px that every row needed.
    assert.ok(strip.unit >= 16, String(strip.unit))
    assert.ok(Views.fit(["gpu", "cpu", "memory", "network"], 2560, 120).unit >= 12)
    // When nothing makes room, the smallest text still shows what fits.
    const tiny = Views.fit(ALL_PANELS, 600, 120)
    assert.equal(tiny.unit, 9)
    assert.ok(tiny.cards.length > 0)
  },
  "a wide card leaves out the headline parts it has no room for"() {
    const view = () => ({ value: "39%", note: "Tctl · 95°C", alert: 0, graphs: [{}, {}], bars: [{}, {}], stack: [{}] })
    // Room for everything: nothing goes.
    const roomy = view()
    Views.fitHeadline(roomy, 10)
    assert.equal(roomy.bars.length, 2)
    assert.equal(roomy.graphs.length, 2)
    // Three rows: the bars go first, then the stack, the note and the
    // second graph, never the value or the first graph.
    const short = view()
    Views.fitHeadline(short, 3)
    assert.equal(short.bars.length, 0)
    assert.equal(short.stack.length, 0)
    assert.equal(short.note, "")
    assert.equal(short.graphs.length, 1)
    assert.ok(Views.headlineRows(short) <= 3 + Views.GAP_ROWS)
    // Four rows keep the CPU's value, graph and per-core bars.
    const cpu = { value: "39%", note: "", alert: 0, graphs: [{}], bars: [{}], stack: [] }
    Views.fitHeadline(cpu, 4)
    assert.equal(cpu.bars.length, 1)
    // A warning's note stays.
    const warned = Object.assign(view(), { alert: Views.ALERT })
    Views.fitHeadline(warned, 3)
    assert.equal(warned.note, "Tctl · 95°C")
  },
  "layout drops the last panels when they do not fit"() {
    const grid = Views.layout(["gpu", "cpu", "memory", "network", "disks"], 600, 120, 12)
    assert.ok(grid.cards.length < 5)
    assert.deepEqual(plain(grid.dropped), ["gpu", "cpu", "memory", "network", "disks"].slice(grid.cards.length))
    assert.deepEqual(plain(Views.layout(["gpu"], 50, 50, 9).dropped), ["gpu"])
    assert.deepEqual(plain(Views.layout([], 1440, 660, 18).cards), [])
  },
}

// A view for every panel, from a state with data and from an empty one.
const palette = Stats.palette({ foreground: "#d8dee9", accent: "#81a1c1", red: "#bf616a", yellow: "#ebcb8b", green: "#a3be8c", cyan: "#88c0d0", blue: "#81a1c1", magenta: "#b48ead" })
let full = Stats.ingest(Stats.empty(), Stats.parseFrame(frame(10, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0], "@procs\n1 (game) S 1 2 3 4 5 6 7 8 9 10 100 0 0 0\n")))
full = Stats.step(full, frame(11, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0], "@procs\n1 (game) S 1 2 3 4 5 6 7 8 9 10 150 0 0 0\n@gpuapps\n1, /opt/game, 512\n"),
  "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 12",
  { identity: "Spotify", title: "Song", artist: "Band", album: "Record", art: "", playing: true, position: 10, length: 200 })
ALL_PANELS.forEach(panel => {
  tests["view of " + panel + " has a title, a box color and content"] = () => {
    const view = Views.view(panel, full, palette)
    assert.ok(view.title && view.icon, panel)
    assert.match(view.color, /^#[0-9a-f]{6}$/)
    assert.equal(view.empty, "", panel + " should have data")
    assert.ok(view.rows.length + view.lists.length + view.bars.length + view.graphs.length + (view.media ? 1 : 0) + (view.value ? 1 : 0) > 0, panel)
    for (const row of view.rows) assert.ok(row.fraction === null || (row.fraction >= 0 && row.fraction <= 1), JSON.stringify(row))
    const empty = Views.view(panel, Stats.empty(), palette)
    assert.equal(empty.title, view.title)
  }
})

Object.assign(tests, {
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
    const state = Object.assign(Stats.empty(), { time: 1, drm: Stats.drmGpus({ card1: { driver: "amdgpu", status: "suspended" } }, {}, 0) })
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
    assert.equal(power.color, Stats.gradientAt(palette.gradients.level, 65 / 162))
  },
  "the CPU view's temperature fills towards the CPU's limit"() {
    const temp = Views.view("cpu", full, palette).rows.find(row => row.label === "Temp")
    assert.equal(temp.text, "67°C")
    assert.equal(temp.fraction, Stats.heat(67.375, 95))
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
  "the network rates are rows keyed to their graphs, which carry no text"() {
    const view = Views.view("network", full, palette)
    // Text over a spiky graph is unreadable.
    assert.ok(view.graphs.every(graph => graph.label === ""))
    // Both totals on one row, so a short card never shows only one.
    assert.deepEqual(plain(view.rows.map(row => row.label)), ["Down", "Up", "Peak", "Total"])
    assert.equal(view.rows[3].text, "↓ " + Stats.formatShort(full.network.rxTotal) + "  ↑ " + Stats.formatShort(full.network.txTotal))
    assert.equal(view.rows[0].text, Stats.formatRate(full.network.rx))
    assert.ok(view.rows[0].swatch && view.rows[1].swatch)
    // Keyed by the low color a quiet graph's line shows.
    assert.equal(view.rows[0].color, palette.gradients.download[0])
    // The peak each graph's top stands for.
    assert.equal(view.rows[2].text, "↓ " + Stats.formatShort(view.graphs[0].max) + "  ↑ " + Stats.formatShort(view.graphs[1].max))
    // The disks graph's peak sits in the title's corner.
    const disks = Views.view("disks", full, palette)
    assert.equal(disks.info, "2 disks · peak " + Stats.formatShort(disks.graphs[0].max) + "/s")
    assert.equal(disks.graphs[0].label, "")
  },
  "the processes view lists CPU and GPU apps"() {
    const view = Views.view("processes", full, palette)
    assert.deepEqual(plain(view.lists.map(list => list.title)), ["CPU", "Memory", "VRAM"])
    assert.equal(view.lists[0].items[0].name, "game")
    assert.equal(view.lists[0].items[0].text, "50%")
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
    assert.equal(view.rows.find(row => row.label === "GPU").fraction, Stats.heat(54, 90))
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
  "the system view leaves live numbers to the panels that show them"() {
    const alone = Views.view("system", full, palette).rows.map(row => row.label)
    assert.ok(alone.includes("Memory") && alone.includes("Load"))
    const beside = Views.view("system", full, palette, undefined, false, 30, ["cpu", "memory", "system"]).rows.map(row => row.label)
    assert.ok(!beside.includes("Memory") && !beside.includes("Load"))
  },
  "a panel with nothing to show on this machine takes no card"() {
    // The fixture has an RTX 4080 and a Radeon iGPU, and a wireless mouse.
    assert.deepEqual(plain(Views.availablePanels(["gpu", "igpu", "battery"], full)), ["gpu", "igpu", "battery"])
    const desktop = Object.assign({}, full, { drm: [], power: [] })
    assert.deepEqual(plain(Views.availablePanels(["gpu", "igpu", "cpu", "battery"], desktop)), ["gpu", "cpu"])
    // Before the first frame, every panel.
    assert.deepEqual(plain(Views.availablePanels(["igpu", "battery"], Stats.empty())), ["igpu", "battery"])
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
    assert.equal(view.info, "on battery")
    // A peripheral reporting only a level reads as about that full.
    assert.deepEqual(plain(view.rows.map(row => [row.label, row.text])), [["Power", "12.5 W"], ["Energy", "40.0 / 50.0 Wh"], ["MX Keys", "20%"]])
    // A low battery that is not charging asks for attention.
    assert.equal(view.alert, 0)
    // Louder as it empties: 15%, 10% and 5%, laptop or peripheral.
    const at = capacity => Object.assign({}, laptop, { power: [Object.assign({}, laptop.power[0], { capacity })] })
    assert.equal(Views.view("battery", at(16), palette).alert, 0)
    assert.equal(Views.view("battery", at(15), palette).alert, Views.CAUTION)
    assert.equal(Views.view("battery", at(15), palette).note, "low")
    assert.equal(Views.view("battery", at(10), palette).alert, Views.ALERT)
    assert.equal(Views.view("battery", at(5), palette).alert, Views.CRITICAL)
    assert.equal(Views.view("battery", at(5), palette).note, "critical")
    const headset = Object.assign({}, laptop, { power: [laptop.power[0], { id: "bt", name: "EDIFIER W830NB", device: true, status: "", capacity: 8, level: "", power: null, energy: null, full: null }] })
    const loud = Views.view("battery", headset, palette)
    assert.equal(loud.alert, Views.ALERT)
    // Named when it is not the battery leading the card.
    assert.equal(loud.note, "EDIFIER W830NB very low")
    const charging = Object.assign({}, laptop, { power: [Object.assign({}, laptop.power[0], { capacity: 12, status: "Charging" })] })
    assert.equal(Views.view("battery", charging, palette).alert, 0)
    // Health and cycles where the battery reports them.
    const worn = Object.assign({}, laptop, { power: [Object.assign({}, laptop.power[0], { health: 82, cycles: 412 })] })
    assert.deepEqual(plain(Views.view("battery", worn, palette).rows.map(row => [row.label, row.text])), [["Power", "12.5 W"], ["Energy", "40.0 / 50.0 Wh"], ["Health", "82%"], ["Cycles", "412"]])
    assert.equal(Views.view("battery", Object.assign(Stats.empty(), { time: 1 }), palette).empty, "No batteries")
  },
  "pickPlayer prefers a playing player with a track, then any with one"() {
    const players = [
      { identity: "Brave", isPlaying: true, trackTitle: "" },
      { identity: "mpv", isPlaying: false, trackTitle: "Film" },
      { identity: "Spotify", isPlaying: true, trackTitle: "Song" }
    ]
    assert.equal(Stats.pickPlayer(players).identity, "Spotify")
    assert.equal(Stats.pickPlayer(players.slice(0, 2)).identity, "mpv")
    assert.equal(Stats.pickPlayer(players.slice(0, 1)).identity, "Brave")
    assert.equal(Stats.pickPlayer([]), null)
    // A player left behind with nothing in it (a closed browser tab) is
    // nothing playing.
    assert.equal(Stats.pickPlayer([{ identity: "Brave", isPlaying: false, trackTitle: "" }]), null)
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
  "an AMD card is discrete by its own memory, not by how much VRAM it has"() {
    // A big APU (Strix Halo) carves out a lot of system memory, but has no
    // VRAM vendor; a small discrete card has one.
    const apu = Stats.drmGpus({ card1: { driver: "amdgpu", status: "active", busy: 3, vram_total: 96 * 1073741824 } }, {}, 0)[0]
    assert.equal(apu.kind, "integrated")
    const small = Stats.drmGpus({ card1: { driver: "amdgpu", status: "active", busy: 3, dedicated: 1, vram_total: 2147483648 } }, {}, 0)[0]
    assert.equal(small.kind, "discrete")
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
  "NVIDIA cards are left to the NVIDIA panel, not the AMD and Intel list"() {
    const nvidia = "@drm\ncard1\tnvidia\tstatus\tactive\ncard1\tnvidia\tcontrol\ton\n"
    const state = Stats.step(Stats.empty(), frame(10, [0], nvidia), [])
    assert.equal(state.drm.some(gpu => gpu.id === "card1"), false)
  },
  "nvidia-smi runs all the time unless the dGPU can power itself down"() {
    const unmanaged = "@drm\ncard1\tnvidia\tstatus\tactive\ncard1\tnvidia\tcontrol\ton\n"
    let state = Stats.step(Stats.empty(), frame(10, [0], unmanaged), ["0, NVIDIA GeForce RTX 4080, 0, 7551, 16376, 54, 20.0, 320.00, 210, 30, 0, 0"])
    for (let t = 11; t <= 20; t++) state = Stats.step(state, frame(t, [0], unmanaged), ["0, NVIDIA GeForce RTX 4080, 0, 7551, 16376, 54, 20.0, 320.00, 210, 30, 0, 0"])
    assert.equal(Stats.nvidiaPoll(state), "on")
    // Without any NVIDIA card in sysfs (no driver yet), it runs too.
    assert.equal(Stats.nvidiaPoll(Stats.step(Stats.empty(), frame(10, [0]), [])), "on")
  },
  "a laptop dGPU that sits idle is checked only now and then, so it can sleep"() {
    const managed = "@drm\ncard1\tnvidia\tstatus\tactive\ncard1\tnvidia\tcontrol\tauto\n"
    const idle = ["0, NVIDIA GeForce RTX 4060 Laptop GPU, 0, 5, 8188, 41, 3.1, 80.00, 210, , 0, 0"]
    let state = Stats.step(Stats.empty(), frame(10, [0], managed), idle)
    assert.equal(Stats.nvidiaPoll(state), "on")
    for (let t = 11; t < 10 + Stats.REST_AFTER; t++) state = Stats.step(state, frame(t, [0], managed), idle)
    assert.equal(Stats.nvidiaPoll(state), "check")
    // Its last reading stays, marked resting, rather than going stale.
    for (let t = 20; t <= 40; t++) state = Stats.step(state, frame(t, [0], managed), [])
    assert.equal(state.nvidia.resting, true)
    assert.equal(Views.view("gpu", state, palette).caption, "idle")
    // A check that finds it busy brings the loop back.
    state = Stats.step(state, frame(41, [0], managed), ["0, NVIDIA GeForce RTX 4060 Laptop GPU, 35, 900, 8188, 55, 40.0, 80.00, 2100, , 0, 0"])
    assert.equal(Stats.nvidiaPoll(state), "on")
    assert.equal(state.nvidia.resting, false)
  },
  "a sleeping laptop dGPU is never woken, and its panel says it is asleep"() {
    const managed = "@drm\ncard1\tnvidia\tstatus\tactive\ncard1\tnvidia\tcontrol\tauto\n"
    const asleep = "@drm\ncard1\tnvidia\tstatus\tsuspended\ncard1\tnvidia\tcontrol\tauto\n"
    let state = Stats.step(Stats.empty(), frame(10, [0], managed), ["0, NVIDIA GeForce RTX 4060 Laptop GPU, 0, 5, 8188, 41, 3.1, 80.00, 210, , 0, 0"])
    state = Stats.step(state, frame(11, [0], asleep), [])
    assert.equal(Stats.nvidiaPoll(state), "off")
    const main = Stats.gpuRoles(state).main
    assert.equal(main.vendor, "NVIDIA")
    assert.equal(main.asleep, true)
    assert.equal(main.name, "RTX 4060 Laptop GPU")
    assert.equal(Views.view("gpu", state, palette).empty, "Asleep")
    // Asleep from the start, with no name yet.
    const cold = Stats.step(Stats.empty(), frame(10, [0], asleep), [])
    assert.equal(Stats.nvidiaPoll(cold), "off")
    assert.equal(Stats.gpuRoles(cold).main.vendor, "NVIDIA")
    // Woken by something else, it is read again.
    state = Stats.step(state, frame(12, [0], managed), [])
    assert.equal(Stats.nvidiaPoll(state), "on")
  },
  "sensors read only now and then keep their last values between reads"() {
    const slow = "@slowhwmon\ndell_smm\tfan1\tProcessor Fan\t2400\n"
    let state = Stats.step(Stats.empty(), frame(10, [0], slow), [])
    state = Stats.step(state, frame(11, [0]), [])
    assert.deepEqual(plain(state.fans.map(fan => fan.name)), ["CPU fan", "Processor Fan"])
    assert.equal(state.fans[1].rpm, 2400)
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
    const batteries = plain(Stats.upowerBatteries(devices))
    assert.deepEqual(batteries.map(b => [b.id, b.name, b.capacity, b.device]), [
      ["hidpp_battery_0", "Logitech G502 X LS", 63, true],
      ["/org/bluez/hci0/dev_08_F0_B6_67_89_F3", "EDIFIER W830NB", 70, true]
    ])
    assert.deepEqual(plain(Stats.upowerBatteries(null)), [])
    // Quickshell's lists are array-like, not arrays; a real array comes out.
    const listLike = { length: 2, 0: devices[0], 1: devices[1] }
    const fromList = Stats.upowerBatteries(listLike)
    assert.ok(Array.isArray(fromList))
    assert.equal(fromList.length, 2)
  },
  "step adds UPower's peripherals to the batteries, once each"() {
    const extra = Stats.upowerBatteries([
      { nativePath: "hidpp_battery_0", model: "Logitech G502 X LS", type: "Mouse", powerSupply: false, percentage: 0.64, state: "Discharging" },
      { nativePath: "/org/bluez/hci0/dev_1", model: "EDIFIER W830NB", type: "Headset", powerSupply: false, percentage: 0.7, state: "Unknown" }
    ])
    const state = Stats.step(Stats.empty(), frame(10, [0]), [], undefined, extra)
    assert.deepEqual(plain(state.power.map(b => b.name)), ["G502 X LIGHTSPEED", "EDIFIER W830NB"])
    const view = Views.view("battery", state, palette)
    assert.equal(view.caption, "G502 X LIGHTSPEED")
    assert.deepEqual(plain(view.rows.map(row => [row.label, row.text])), [["EDIFIER W830NB", "70%"]])
    // A headset alone leads.
    const alone = Stats.step(Stats.empty(), frame(10, [0]).replace(/@power[\s\S]*?@drm/, "@power\n@drm"), [], undefined, extra.slice(1))
    assert.equal(Views.view("battery", alone, palette).value, "70%")
    // Without the list (the panel is not shown), the kernel's batteries only.
    assert.equal(Stats.step(Stats.empty(), frame(10, [0]), []).power.length, 1)
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
})

let failed = 0
for (const [name, run] of Object.entries(tests)) {
  try { run(); console.log("ok   " + name) } catch (error) { failed++; console.log("FAIL " + name + "\n     " + error.message) }
}
process.exit(failed ? 1 : 0)
