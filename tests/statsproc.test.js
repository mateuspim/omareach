import assert from "node:assert/strict"
import { plain, frame, full, Proc, run } from "./statsfixtures.js"

// StatsProc.js: what the kernel's /proc says.

const tests = {
  "parseFrame splits a frame into its sections"() {
    const sections = Proc.parseFrame(frame(10, [1, 2, 3, 4, 5, 6, 7, 8, 0, 0]))
    assert.equal(sections.time, 10)
    assert.equal(sections.stat.length, 3)
    assert.equal(sections.freq.length, 2)
    assert.equal(sections.procs, undefined)
  },
  "parseCpu reads busy and total ticks per line"() {
    const cpu = Proc.parseCpu(["cpu  100 0 50 800 50 0 0 0 0 0", "cpu0 10 0 0 90 0 0 0 0 0 0"])
    // Idle is idle plus iowait; guest time is already counted in user.
    assert.deepEqual(plain(cpu), { total: { busy: 150, all: 1000 }, cores: [{ id: "cpu0", busy: 10, all: 100 }] })
  },
  "cpuLoad is the busy share of the ticks between two samples"() {
    const a = { total: { busy: 100, all: 1000 }, cores: [{ id: "cpu0", busy: 0, all: 100 }, { id: "cpu1", busy: 50, all: 100 }] }
    const b = { total: { busy: 175, all: 1100 }, cores: [{ id: "cpu0", busy: 50, all: 150 }, { id: "cpu1", busy: 50, all: 200 }] }
    assert.deepEqual(plain(Proc.cpuLoad(a, b)), { total: 75, cores: [100, 0] })
    assert.deepEqual(plain(Proc.cpuLoad(a, a)), { total: 0, cores: [0, 0] })
  },
  "cpuLoad matches cores by name when one goes offline"() {
    const a = { total: { busy: 0, all: 0 }, cores: [{ id: "cpu0", busy: 0, all: 100 }, { id: "cpu1", busy: 100, all: 200 }, { id: "cpu2", busy: 0, all: 100 }] }
    const b = { total: { busy: 0, all: 0 }, cores: [{ id: "cpu0", busy: 10, all: 200 }, { id: "cpu2", busy: 0, all: 200 }] }
    assert.deepEqual(plain(Proc.cpuLoad(a, b).cores), [10, 0])
  },
  "parseMeminfo reports used as total less available, in bytes"() {
    const memory = Proc.parseMeminfo(Proc.parseFrame(frame(1, [0])).meminfo)
    assert.equal(memory.total, 63412576 * 1024)
    assert.equal(memory.used, (63412576 - 35827448) * 1024)
    assert.equal(memory.available, 35827448 * 1024)
    assert.equal(memory.cached, (36056908 + 3676) * 1024)
    assert.equal(memory.swapUsed, 0)
  },
  "parseDiskstats keeps whole disks only, in bytes"() {
    const disks = Proc.parseDiskstats(Proc.parseFrame(frame(0, [0])).disk)
    assert.deepEqual(Object.keys(disks), ["sda", "nvme0n1"])
    assert.deepEqual(plain(disks.nvme0n1), { read: 43858112 * 512, written: 5502352 * 512 })
  },
  "parsePressure reads the some avg10 stall of each resource"() {
    const pressure = Proc.parsePressure(Proc.parseFrame(frame(0, [0])).psi)
    assert.deepEqual(plain(pressure), { cpu: 0.12, memory: 1.5, io: 4 })
  },
  "parseProcs reads each process's name and CPU ticks"() {
    const procs = Proc.parseProcs([
      "1234 (Web Content) S 1 2 3 4 5 6 7 8 9 10 300 50 0 0 20 0 1 0",
      "77 (a) b) R 1 2 3 4 5 6 7 8 9 10 5 5 0 0 20 0 1 0",
      "garbage"
    ])
    // Lines this short carry no resident set.
    assert.deepEqual(plain(procs), { 1234: { name: "Web Content", ticks: 350, rss: 0 }, 77: { name: "a) b", ticks: 10, rss: 0 } })
    // Field 24 is the resident set, in pages.
    const full = Proc.parseProcs(["5 (game) S 1 2 3 4 5 6 7 8 9 10 300 50 0 0 20 0 1 0 100 4096000 2500"])
    assert.equal(full[5].rss, 2500)
  },
  "topMemory adds up the resident memory of processes of one name"() {
    const procs = { 1: { name: "firefox", rss: 1000 }, 2: { name: "firefox", rss: 3000 }, 3: { name: "bash", rss: 100 }, 4: { name: "zombie", rss: 0 } }
    const top = plain(Proc.topMemory(procs, 4096, 10))
    assert.deepEqual(top.map(p => [p.name, p.memory, p.count, p.pid]), [["firefox", 4000 * 4096, 2, 2], ["bash", 100 * 4096, 1, 3]])
    // Pages of another size, as on some ARM kernels; 4 KiB without one.
    assert.equal(Proc.topMemory(procs, 16384, 1)[0].memory, 4000 * 16384)
    assert.equal(Proc.topMemory(procs, NaN, 1)[0].memory, 4000 * 4096)
  },
  "topProcesses ranks CPU use since the last sample, as top does"() {
    const before = { 1: { name: "game", ticks: 100 }, 2: { name: "idle", ticks: 5 }, 3: { name: "gone", ticks: 1 } }
    const after = { 1: { name: "game", ticks: 400 }, 2: { name: "idle", ticks: 5 }, 4: { name: "new", ticks: 50 } }
    // 300 ticks at 100 Hz over 2 s is 150% of one core; a new process
    // counts from 0 only if it started since, so it is left out.
    assert.deepEqual(plain(Proc.topProcesses(before, after, 2, 5)), [{ pid: 1, name: "game", cpu: 150, count: 1 }])
  },
  "topProcesses adds up processes of the same name"() {
    const before = { 1: { name: "brave", ticks: 0 }, 2: { name: "brave", ticks: 0 }, 3: { name: "game", ticks: 0 } }
    const after = { 1: { name: "brave", ticks: 30 }, 2: { name: "brave", ticks: 50 }, 3: { name: "game", ticks: 60 } }
    assert.deepEqual(plain(Proc.topProcesses(before, after, 1, 5)), [
      { pid: 2, name: "brave", cpu: 80, count: 2 },
      { pid: 3, name: "game", cpu: 60, count: 1 }
    ])
  },
}

run(tests)
