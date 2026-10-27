import { load } from "./qmljs.js"

export { run } from "./run.js"

// The stats scripts are QML `.pragma library` scripts, loaded like Model.js,
// each given the modules its `.import` lines name.
export const Format = load("StatsFormat.js")
export const Proc = load("StatsProc.js")
export const Net = load("StatsNet.js")
export const Sys = load("StatsSystem.js", { Format })
export const Gpu = load("StatsGpu.js", { Proc, Sys })
export const Stats = load("Stats.js", { Gpu, Net, Proc, Sys })
export const Tiles = load("StatsTiles.js")
export const Rows = load("StatsRows.js", { Format })
export const Views = load("StatsViews.js", { Format, Gpu, Rows, Sys })

// Objects made inside the sandbox have its prototypes; copy them out so
// strict deep equality compares only their contents.
export const plain = value => JSON.parse(JSON.stringify(value))

// One frame of stats.sh as captured on a desktop with a Ryzen, an RTX 4080,
// two NVMe drives and a SATA SSD.
export const frame = (time, cpu, extra = "") => `@time ${time}
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

export const ALL_PANELS = ["gpu", "igpu", "cpu", "memory", "network", "disks", "processes", "temps", "battery", "media", "system"]

// A state with data in every panel, and a palette to draw it in.
export const palette = Format.palette({ foreground: "#d8dee9", accent: "#81a1c1", red: "#bf616a", yellow: "#ebcb8b", green: "#a3be8c", cyan: "#88c0d0", blue: "#81a1c1", magenta: "#b48ead" })
let filled = Stats.ingest(Stats.empty(), Proc.parseFrame(frame(10, [100, 0, 0, 900, 0, 0, 0, 0, 0, 0], "@procs\n1 (game) S 1 2 3 4 5 6 7 8 9 10 100 0 0 0\n")))
filled = Stats.step(filled, frame(11, [150, 0, 0, 950, 0, 0, 0, 0, 0, 0], "@procs\n1 (game) S 1 2 3 4 5 6 7 8 9 10 150 0 0 0\n@gpuapps\n1, /opt/game, 512\n"),
  "0, NVIDIA GeForce RTX 4080, 55, 7551, 16376, 54, 149.65, 320.00, 2790, 30, 0, 12",
  { identity: "Spotify", title: "Song", artist: "Band", album: "Record", art: "", playing: true, position: 10, length: 200 })
export const full = filled
