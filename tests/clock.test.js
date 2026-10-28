import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { load } from "./qmljs.js"

// Clock.js, the Clock card's data, and zones.sh, which gives it the other
// zones' offsets. Dates are built in the machine's own zone, as QML's are.
const Clock = load("Clock.js")
const plain = value => JSON.parse(JSON.stringify(value))
const zonesScript = new URL("../zones.sh", import.meta.url).pathname
const zones = (args, env = {}) => spawnSync("bash", [zonesScript, ...args], { encoding: "utf8", env: { ...process.env, ...env } }).stdout

const tests = {
  "isoWeek follows ISO 8601 across the turn of the year"() {
    assert.equal(Clock.isoWeek(new Date(2026, 9, 28)), 44)
    // 30 Dec 2024 is a Monday in the week of 2 Jan 2025's Thursday.
    assert.equal(Clock.isoWeek(new Date(2024, 11, 30)), 1)
    // 1 Jan 2021 is a Friday, still in 2020's week 53.
    assert.equal(Clock.isoWeek(new Date(2021, 0, 1)), 53)
    assert.equal(Clock.isoWeek(new Date(2026, 0, 1)), 1)
    // A Sunday ends its week.
    assert.equal(Clock.isoWeek(new Date(2026, 10, 1)), 44)
    assert.equal(Clock.isoWeek(new Date(2026, 10, 2)), 45)
  },
  "dayOfYear counts from 1 and knows leap years"() {
    assert.equal(Clock.dayOfYear(new Date(2026, 0, 1)), 1)
    assert.equal(Clock.dayOfYear(new Date(2026, 9, 28)), 301)
    assert.equal(Clock.dayOfYear(new Date(2026, 11, 31)), 365)
    assert.equal(Clock.dayOfYear(new Date(2028, 11, 31)), 366)
  },
  "clockDigits writes the time as the Clock fill does, seconds on request"() {
    const date = new Date(2026, 9, 28, 7, 5, 9)
    assert.equal(Clock.clockDigits(date, 24, false), "07:05")
    assert.equal(Clock.clockDigits(date, 12, false), "7:05")
    assert.equal(Clock.clockDigits(date, 24, true), "07:05:09")
    assert.equal(Clock.clockDigits(new Date(2026, 9, 28, 0, 30), 12, false), "12:30")
  },
  "zoneName takes tzdata's names and nothing that leaves zoneinfo"() {
    assert.equal(Clock.zoneName(" America/Argentina/Buenos_Aires "), "America/Argentina/Buenos_Aires")
    assert.equal(Clock.zoneName("Etc/GMT+3"), "Etc/GMT+3")
    assert.equal(Clock.zoneName("UTC"), "UTC")
    for (const bad of ["../etc/passwd", "/etc/passwd", "Europe/../../x", "Europe//Lisbon", "", null, "Europe/Lis bon", "-x"]) assert.equal(Clock.zoneName(bad), "", String(bad))
  },
  "zoneList keeps three valid zones, each once"() {
    assert.deepEqual(plain(Clock.zoneList(["Europe/Lisbon", "nope/../x", "Asia/Tokyo", "Europe/Lisbon", "UTC", "America/New_York"])), ["Europe/Lisbon", "Asia/Tokyo", "UTC"])
    assert.deepEqual(plain(Clock.zoneList("Europe/Lisbon")), [])
    assert.deepEqual(plain(Clock.zoneList(undefined)), [])
    assert.equal(Clock.zoneCity("America/Sao_Paulo"), "Sao Paulo")
    assert.equal(Clock.zoneCity("UTC"), "UTC")
  },
  "parseZoneOffsets reads zones.sh's lines"() {
    const parsed = Clock.parseZoneOffsets("@local\tAmerica/Sao_Paulo\nAsia/Tokyo\t+0900\nAsia/Kolkata\t+0530\nAmerica/St_Johns\t-0230\nbad line\nUTC\tlater\n")
    assert.equal(parsed.local, "America/Sao_Paulo")
    assert.deepEqual(plain(parsed.offsets), { "Asia/Tokyo": 540, "Asia/Kolkata": 330, "America/St_Johns": -150 })
    assert.deepEqual(plain(Clock.parseZoneOffsets("")), { local: "", offsets: {} })
  },
  "zoneText gives a zone's time, its day when that differs, and how far it is"() {
    // 12:00 UTC; here is São Paulo, three hours behind.
    const now = Date.UTC(2026, 9, 28, 12, 0)
    assert.equal(Clock.zoneText(now, 540, -180, 24), "21:00  ·  +12h")
    assert.equal(Clock.zoneText(now, 330, -180, 24), "17:30  ·  +8h 30m")
    assert.equal(Clock.zoneText(now, -180, -180, 12), "9:00  ·  same time")
    // Past midnight there: the day is named.
    assert.equal(Clock.zoneText(Date.UTC(2026, 9, 28, 20, 0), 780, -180, 24), "Thu 09:00  ·  +16h")
    assert.equal(Clock.zoneText(Date.UTC(2026, 9, 28, 1, 0), -600, -180, 24), "15:00  ·  \u22127h")
    // Seen from Tokyo, Wednesday morning, Honolulu is still on Tuesday.
    assert.equal(Clock.zoneText(Date.UTC(2026, 9, 28, 1, 0), -600, 540, 24), "Tue 15:00  ·  \u221219h")
  },
  "parseZoneTab reads zones and their coordinates, sorted"() {
    const tab = "# comment\nPT\t+3843-00908\tEurope/Lisbon\nAD\t+4230+00131\tEurope/Andorra\nAQ\t-690022+0393524\tAntarctica/Syowa\nbad\tline\n"
    assert.deepEqual(plain(Clock.parseZoneTab(tab)), [
      { zone: "Antarctica/Syowa", city: "Syowa", lat: -69.01, lon: 39.59 },
      { zone: "Europe/Andorra", city: "Andorra", lat: 42.5, lon: 1.52 },
      { zone: "Europe/Lisbon", city: "Lisbon", lat: 38.72, lon: -9.13 }
    ])
  },
  "location keeps a real latitude and longitude, to two places"() {
    assert.deepEqual(plain(Clock.location({ lat: "38.7223", lon: -9.1393 })), { lat: 38.72, lon: -9.14 })
    assert.equal(Clock.location({ lat: 91, lon: 0 }), null)
    assert.equal(Clock.location({ lat: 0, lon: 181 }), null)
    assert.equal(Clock.location({ lat: "", lon: 0 }), null)
    assert.equal(Clock.location({ lat: null, lon: 0 }), null)
    assert.equal(Clock.location("38,-9"), null)
    assert.equal(Clock.location(null), null)
  },
  "sunTimes matches the almanac to a couple of minutes"() {
    const near = (ms, iso) => assert.ok(Math.abs(ms - Date.parse(iso)) < 3 * 60000, new Date(ms).toISOString() + " vs " + iso)
    // London at the June solstice: 04:43 and 21:21 BST.
    const london = Clock.sunTimes(new Date(2026, 5, 21), 51.5, -0.13)
    near(london.rise, "2026-06-21T03:43:00Z")
    near(london.set, "2026-06-21T20:21:00Z")
    assert.equal(london.polar, "")
    // Svalbard: midnight sun in June, polar night in December.
    assert.equal(Clock.sunTimes(new Date(2026, 5, 21), 78.2, 15.6).polar, "day")
    assert.equal(Clock.sunTimes(new Date(2026, 11, 21), 78.2, 15.6).polar, "night")
    assert.equal(Clock.sunTimes(new Date(2026, 11, 21), 78.2, 15.6).rise, null)
  },
  "parseReminders reads omarchy-reminder's JSON, soonest first"() {
    const json = JSON.stringify({ count: 2, reminders: [
      { label: "Tea", at: 1800000600, atTime: "8:10" },
      { label: "", message: "", minutes: 5, at: 1800000300 },
      { label: "Broken", at: "soon" }
    ] })
    assert.deepEqual(plain(Clock.parseReminders(json)), [{ label: "Reminder", at: 1800000300000 }, { label: "Tea", at: 1800000600000 }])
    assert.deepEqual(plain(Clock.parseReminders("not json")), [])
    assert.deepEqual(plain(Clock.parseReminders('{"count":0}')), [])
  },
  "formatCountdown reads to the second, then the minute"() {
    assert.equal(Clock.formatCountdown(44.2), "45s")
    assert.equal(Clock.formatCountdown(725), "12m 05s")
    assert.equal(Clock.formatCountdown(3900), "1h 05m")
    assert.equal(Clock.formatCountdown(-3), "0s")
  },
  "clockFacts lists the date, week, reminder, zones and sun, in drop order"() {
    const now = new Date(2026, 9, 28, 14, 5, 30).getTime()
    const here = -new Date(now).getTimezoneOffset()
    const facts = Clock.clockFacts({
      now, dateText: "", zones: ["Asia/Tokyo", "Nowhere/Zone"], offsets: { "Asia/Tokyo": here + 60 },
      reminders: [{ label: "Done", at: now - 1000 }, { label: "Tea", at: now + 725000 }, { label: "Call", at: now + 3600000 }],
      location: { lat: 38.72, lon: -9.14 }
    }, 24, 30, false)
    assert.equal(facts.digits, "14:05:30")
    assert.deepEqual(plain(facts.rows.map(r => r.label)), ["Date", "Week", "Tea", "Tokyo", "Sun"])
    assert.equal(facts.rows[0].text, "Wed 28 Oct")
    assert.equal(facts.rows[1].text, "W44  ·  day 301")
    // A reminder that went off is gone; the rest count down.
    assert.equal(facts.rows[2].text, "12m 05s  ·  +1")
    assert.match(facts.rows[2].tip, /^Tea at \d\d:\d\d\nCall at \d\d:\d\d$/)
    assert.equal(facts.rows[3].text, "15:05  ·  +1h")
    assert.match(facts.rows[4].text, /^\u2191 \d\d:\d\d  \u2193 \d\d:\d\d$/)
    // A narrow card leaves out the seconds; the locale's date wins.
    const narrow = Clock.clockFacts({ now, dateText: "qua 28 out", zones: [], reminders: [], location: null }, 12, 20, false)
    assert.equal(narrow.digits, "2:05")
    assert.deepEqual(plain(narrow.rows.map(r => r.text)), ["qua 28 out", "W44  ·  day 301"])
  },
  "zones.sh prints each zone's offset and leaves out bad names"() {
    // Etc zones never change offset, so the test holds all year.
    const out = zones(["Etc/GMT-9", "../../etc/passwd", "Nowhere/Zone", "Etc/GMT+3"], { TZ: "Etc/GMT-1" })
    assert.equal(out, "@local\tEtc/GMT-1\nEtc/GMT-9\t+0900\nEtc/GMT+3\t-0300\n")
    assert.equal(Clock.parseZoneOffsets(out).offsets["Etc/GMT-9"], 540)
    assert.equal(zones([], { TZ: ":/usr/share/zoneinfo/Etc/UTC" }), "@local\tEtc/UTC\n")
  }
}

let failed = 0
for (const [name, run] of Object.entries(tests)) {
  try { run(); console.log("ok   " + name) } catch (error) { failed++; console.log("FAIL " + name + "\n     " + error.message) }
}
process.exit(failed ? 1 : 0)
