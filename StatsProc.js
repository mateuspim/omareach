.pragma library

// What the kernel's /proc says, without any QML: stats.sh's frames split
// by section, CPU ticks, memory, disks, pressure and processes.

// Clock ticks per second in /proc/<pid>/stat (USER_HZ), 100 on Linux.
var HZ = 100

var MIB = 1048576

// A frame's lines by section, as { time, stat: [lines], meminfo: [...] }.
// Sections are opened by "@name" lines; "@time" carries its value.
function parseFrame(text) {
  var sections = { time: null }
  var current = null
  var lines = String(text || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    if (line.charAt(0) === "@") {
      var parts = line.slice(1).split(" ")
      if (parts[0] === "time") { sections.time = Number(parts[1]); current = null; continue }
      if (parts[0] === "end") break
      current = sections[parts[0]] = []
    } else if (current && line !== "") {
      current.push(line)
    }
  }
  return sections
}

function ticks(line) {
  var f = line.trim().split(/\s+/).slice(1).map(Number)
  // user nice system idle iowait irq softirq steal; guest time is already
  // part of user.
  var idle = (f[3] || 0) + (f[4] || 0)
  var busy = (f[0] || 0) + (f[1] || 0) + (f[2] || 0) + (f[5] || 0) + (f[6] || 0) + (f[7] || 0)
  return { busy: busy, all: busy + idle }
}

// Busy and total ticks from /proc/stat's cpu lines.
function parseCpu(lines) {
  var result = { total: { busy: 0, all: 0 }, cores: [] }
  for (var i = 0; i < lines.length; i++) {
    if (/^cpu\s/.test(lines[i])) result.total = ticks(lines[i])
    else if (/^cpu\d/.test(lines[i])) result.cores.push(Object.assign({ id: lines[i].split(" ")[0] }, ticks(lines[i])))
  }
  return result
}

function share(a, b) {
  var all = b.all - a.all
  return all > 0 ? Math.max(0, Math.min(100, (b.busy - a.busy) / all * 100)) : 0
}

// Percent busy between two parseCpu samples, in total and per core. Cores
// match by name: one taken offline drops out of the list, and the next
// must not be measured against its ticks.
function cpuLoad(before, after) {
  var was = {}
  before.cores.forEach(function(core) { was[core.id] = core })
  return {
    total: share(before.total, after.total),
    cores: after.cores.map(function(core) { return was[core.id] ? share(was[core.id], core) : 0 })
  }
}

// Bytes from /proc/meminfo. Used is what the kernel could not hand out
// right now: total less available, as free and btop count it.
function parseMeminfo(lines) {
  var kb = {}
  for (var i = 0; i < lines.length; i++) {
    var match = /^(\w+):\s+(\d+)/.exec(lines[i])
    if (match) kb[match[1]] = Number(match[2]) * 1024
  }
  var total = kb.MemTotal || 0
  var available = kb.MemAvailable !== undefined ? kb.MemAvailable : (kb.MemFree || 0)
  return {
    total: total,
    used: Math.max(0, total - available),
    available: available,
    cached: (kb.Cached || 0) + (kb.Buffers || 0),
    swapTotal: kb.SwapTotal || 0,
    swapUsed: Math.max(0, (kb.SwapTotal || 0) - (kb.SwapFree || 0))
  }
}

// Whole disks, not partitions, device mapper or zram.
var DISK = /^(sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/

// Bytes read and written per disk from /proc/diskstats, which counts
// 512-byte sectors whatever the disk's own sector size.
function parseDiskstats(lines) {
  var result = {}
  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].trim().split(/\s+/)
    if (f.length < 10 || !DISK.test(f[2])) continue
    result[f[2]] = { read: Number(f[5]) * 512, written: Number(f[9]) * 512 }
  }
  return result
}

// The share of the last 10 s some task stalled on each resource, from
// /proc/pressure, in percent.
function parsePressure(lines) {
  var result = { cpu: null, memory: null, io: null }
  for (var i = 0; i < lines.length; i++) {
    var match = /^(cpu|memory|io) some avg10=([\d.]+)/.exec(lines[i])
    if (match) result[match[1]] = Number(match[2])
  }
  return result
}

// The programs holding the most memory in one process sample, by name as
// topProcesses adds them up, in bytes: their resident sets of `page`
// bytes a page (4096 without one). Pages two processes share count for
// each, as in top's RES.
function topMemory(procs, page, count) {
  page = page > 0 ? page : 4096
  var byName = {}
  for (var pid in procs) {
    var p = procs[pid]
    if (!(p.rss > 0)) continue
    var entry = byName[p.name] || (byName[p.name] = { pid: Number(pid), name: p.name, memory: 0, count: 0, most: 0 })
    entry.memory += p.rss * page
    entry.count++
    if (p.rss > entry.most) { entry.most = p.rss; entry.pid = Number(pid) }
  }
  return Object.keys(byName).map(function(name) {
    var entry = byName[name]
    return { pid: entry.pid, name: entry.name, memory: entry.memory, count: entry.count }
  }).sort(function(a, b) { return b.memory - a.memory }).slice(0, count)
}

// Name and CPU ticks (user plus system) per pid from /proc/<pid>/stat
// lines. The name sits in parentheses and can hold anything, parentheses
// included, so it runs to the last one.
function parseProcs(lines) {
  var result = {}
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    var open = line.indexOf(" ("), close = line.lastIndexOf(")")
    if (open < 0 || close < open) continue
    var f = line.slice(close + 2).split(" ")
    if (f.length < 13) continue
    // Field 24, the resident set in pages, where the line has it.
    result[line.slice(0, open)] = { name: line.slice(open + 2, close), ticks: Number(f[11]) + Number(f[12]), rss: f.length > 21 ? Number(f[21]) || 0 : 0 }
  }
  return result
}

// The busiest programs between two parseProcs samples `seconds` apart, as
// top counts it: 100% is one core. Processes of the same name add up, as
// a browser's dozens of them are one program at a glance; `pid` is the
// busiest one's and `count` how many there are. A pid that changed name
// was reused, and one that is new has no baseline; both are left out.
function topProcesses(before, after, seconds, count) {
  var byName = {}
  if (!(seconds > 0)) return []
  for (var pid in after) {
    var was = before[pid]
    if (!was || was.name !== after[pid].name) continue
    var cpu = (after[pid].ticks - was.ticks) / HZ / seconds * 100
    if (!(cpu > 0)) continue
    var name = after[pid].name
    var entry = byName[name] || (byName[name] = { pid: Number(pid), name: name, cpu: 0, count: 0, most: 0 })
    entry.cpu += cpu
    entry.count++
    if (cpu > entry.most) { entry.most = cpu; entry.pid = Number(pid) }
  }
  return Object.keys(byName).map(function(name) {
    var entry = byName[name]
    return { pid: entry.pid, name: entry.name, cpu: entry.cpu, count: entry.count }
  }).sort(function(a, b) { return b.cpu - a.cpu }).slice(0, count)
}
