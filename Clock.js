.pragma library

// The Clock card's data, without any QML: the week and day of the year,
// other time zones, Omarchy's reminders and the sun, from what
// StatsSampler gathers (zones.sh, omarchy-reminder). StatsViews.js lays
// it out.

// --- the date ----------------------------------------------------------------

// The ISO 8601 week of `date`: weeks start on Monday, and week 1 holds the
// year's first Thursday, so 31 Dec can be in week 1 and 1 Jan in week 53.
function isoWeek(date) {
  var day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  var weekday = day.getUTCDay() || 7
  // The Thursday of this week decides its year.
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  var yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  return Math.ceil(((day.getTime() - yearStart) / 86400000 + 1) / 7)
}

// 1 on 1 Jan, 365 or 366 on 31 Dec. In UTC, so a daylight saving change
// in between does not shift it by an hour's fraction.
function dayOfYear(date) {
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 86400000) + 1
}

// The card's digits: HH:MM, or H:MM in 12-hour time without a leading
// zero (as the Clock fill), and ":SS" after them with `seconds`.
function clockDigits(date, hours, seconds) {
  var h = date.getHours()
  var text = (hours === 12 ? String(h % 12 || 12) : pad(h)) + ":" + pad(date.getMinutes())
  return seconds ? text + ":" + pad(date.getSeconds()) : text
}

var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function pad(n) {
  return ("0" + n).slice(-2)
}

// --- other time zones ----------------------------------------------------------

// Zones the dashboard shows at most, so they fit a card's rows beside the
// date and the rest.
var MAX_ZONES = 3

// An IANA zone name as tzdata spells them ("America/Argentina/Buenos_Aires",
// "Etc/GMT+3"): never a path out of /usr/share/zoneinfo, since zones.sh
// hands it to TZ.
function zoneName(value) {
  var text = String(value === null || value === undefined ? "" : value).trim()
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(text)) return ""
  return text
}

// The settings' statsZones: known-looking names only, each once, at most
// MAX_ZONES, in the order given. Anything but an array is none.
function zoneList(value) {
  if (!Array.isArray(value)) return []
  var result = []
  value.forEach(function(zone) {
    var name = zoneName(zone)
    if (name && result.indexOf(name) === -1 && result.length < MAX_ZONES) result.push(name)
  })
  return result
}

// The city of a zone ("America/Sao_Paulo" is "Sao Paulo"), as the row's
// label.
function zoneCity(zone) {
  var parts = String(zone).split("/")
  return parts[parts.length - 1].replace(/_/g, " ")
}

// zones.sh's lines, "Zone<TAB>+HHMM", as { zone: minutes east of UTC }.
// The first line, "@local<TAB>Zone", names this machine's zone.
function parseZoneOffsets(text) {
  var result = { local: "", offsets: {} }
  String(text || "").split("\n").forEach(function(line) {
    var fields = line.split("\t")
    if (fields.length !== 2) return
    if (fields[0] === "@local") { result.local = zoneName(fields[1]); return }
    var match = /^([+-])(\d\d)(\d\d)$/.exec(fields[1])
    if (!match || !zoneName(fields[0])) return
    var minutes = Number(match[2]) * 60 + Number(match[3])
    result.offsets[fields[0]] = match[1] === "-" ? -minutes : minutes
  })
  return result
}

// The time in a zone `offset` minutes east of UTC, at `now` (ms): QML's
// JavaScript ignores toLocaleString's timeZone, so the offset comes from
// zones.sh and the arithmetic is done here, on the UTC fields.
function zoneDate(now, offset) {
  var shifted = new Date(now + offset * 60000)
  return { hours: shifted.getUTCHours(), minutes: shifted.getUTCMinutes(), day: Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) }
}

// How far a zone is from here: "+3h", "−5h 30m", or "same time".
function offsetText(offset, localOffset) {
  var diff = offset - localOffset
  if (diff === 0) return "same time"
  var sign = diff > 0 ? "+" : "−"
  diff = Math.abs(diff)
  var minutes = diff % 60
  return sign + Math.floor(diff / 60) + "h" + (minutes ? " " + minutes + "m" : "")
}

// A row's text for a zone: its time, and the day when it is not today
// here ("Thu 01:05"), then how far it is.
function zoneText(now, offset, localOffset, hours) {
  var there = zoneDate(now, offset)
  var here = zoneDate(now, localOffset)
  var h = hours === 12 ? String(there.hours % 12 || 12) : pad(there.hours)
  var time = h + ":" + pad(there.minutes)
  if (there.day !== here.day) time = DAYS[new Date(there.day).getUTCDay()] + " " + time
  return time + "  ·  " + offsetText(offset, localOffset)
}

// zone1970.tab's zones with their coordinates, for the panel's list and
// for the sun: "AD\t+4230+00131\tEurope/Andorra". Sorted by name.
function parseZoneTab(text) {
  var zones = []
  String(text || "").split("\n").forEach(function(line) {
    if (!line || line.charAt(0) === "#") return
    var fields = line.split("\t")
    var place = coordinates(fields[1])
    var zone = zoneName(fields[2])
    if (zone && place) zones.push({ zone: zone, city: zoneCity(zone), lat: place.lat, lon: place.lon })
  })
  return zones.sort(function(a, b) { return a.zone < b.zone ? -1 : a.zone > b.zone ? 1 : 0 })
}

// ISO 6709 as the tab files write it: ±DDMM±DDDMM or ±DDMMSS±DDDMMSS.
function coordinates(text) {
  var match = /^([+-])(\d\d)(\d\d)(\d\d)?([+-])(\d\d\d)(\d\d)(\d\d)?$/.exec(String(text || ""))
  if (!match) return null
  function degrees(sign, d, m, s) {
    var value = Number(d) + Number(m) / 60 + Number(s || 0) / 3600
    return Math.round((sign === "-" ? -value : value) * 100) / 100
  }
  return { lat: degrees(match[1], match[2], match[3], match[4]), lon: degrees(match[5], match[6], match[7], match[8]) }
}

// --- the sun -------------------------------------------------------------------

// The settings' statsLocation: a latitude and longitude in degrees,
// rounded to two places (about a kilometre: the sun needs no more), or
// null when either is missing or out of range.
function location(value) {
  if (!value || typeof value !== "object") return null
  var lat = Number(value.lat), lon = Number(value.lon)
  if (value.lat === null || value.lon === null || value.lat === "" || value.lon === "") return null
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 }
}

// Sunrise and sunset on the day of `date` at `lat`, `lon`, as ms since
// the epoch, worked out here rather than fetched: the sunrise equation as
// suncalc (mourner/suncalc) writes it, good to a minute or two. Where the
// sun does not set or rise that day, `polar` is "day" or "night" and the
// times are null.
function sunTimes(date, lat, lon) {
  var rad = Math.PI / 180
  var J0 = 0.0009, J1970 = 2440587.5, J2000 = 2451545
  var lw = -lon * rad, phi = lat * rad
  // Local noon, so the day is the one on the clock here.
  var noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTime()
  var days = noon / 86400000 + J1970 - J2000
  var n = Math.round(days - J0 - lw / (2 * Math.PI))
  var ds = J0 + lw / (2 * Math.PI) + n
  var M = rad * (357.5291 + 0.98560028 * ds)
  var C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  var L = M + C + rad * 102.9372 + Math.PI
  var dec = Math.asin(Math.sin(L) * Math.sin(rad * 23.4397))
  var transit = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
  // The sun's top edge on the horizon, refraction included.
  var cosW = (Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec))
  if (cosW < -1) return { rise: null, set: null, polar: "day" }
  if (cosW > 1) return { rise: null, set: null, polar: "night" }
  var w = Math.acos(cosW)
  var set = J2000 + J0 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
  var rise = transit - (set - transit)
  function ms(j) { return Math.round((j - J1970) * 86400000) }
  return { rise: ms(rise), set: ms(set), polar: "" }
}

// --- reminders -----------------------------------------------------------------

// `omarchy-reminder show --json`'s reminders, soonest first, as
// { label, at } with `at` in ms. Nothing on anything else.
function parseReminders(text) {
  var data
  try { data = JSON.parse(text) } catch (e) { return [] }
  if (!data || !Array.isArray(data.reminders)) return []
  return data.reminders
    .filter(function(r) { return r && isFinite(Number(r.at)) && Number(r.at) > 0 })
    .map(function(r) { return { label: String(r.label || r.message || "Reminder"), at: Number(r.at) * 1000 } })
    .sort(function(a, b) { return a.at - b.at })
}

// Time left, to the second under a minute and to the minute under an
// hour: "45s", "12m 05s", "1h 05m".
function formatCountdown(seconds) {
  seconds = Math.max(0, Math.ceil(seconds))
  if (seconds < 60) return seconds + "s"
  var minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes + "m " + pad(seconds % 60) + "s"
  return Math.floor(minutes / 60) + "h " + pad(minutes % 60) + "m"
}

// --- the card ------------------------------------------------------------------

// Units of width the card needs for seconds beside the minutes: the
// blocky "00:00:00" is half as wide again as "00:00", and smaller blocks
// on a narrow card read worse than no seconds.
var SECONDS_SPAN = 26

// What StatsViews' clock view draws from `clock`, the sampler's
// { now, dateText, zones, offsets, local, reminders, location }, for a card `span`
// units wide: the digits, then rows in the order a short card drops them
// from the end.
function clockFacts(clock, hours, span, wide) {
  var date = new Date(clock.now)
  var localOffset = -date.getTimezoneOffset()
  var facts = { digits: clockDigits(date, hours, span >= SECONDS_SPAN || wide), rows: [], tips: {} }
  facts.rows.push({ label: "Date", text: clock.dateText || dateText(date) })
  facts.rows.push({ label: "Week", text: "W" + isoWeek(date) + "  ·  day " + dayOfYear(date) })
  var reminders = (clock.reminders || []).filter(function(r) { return r.at > clock.now })
  if (reminders.length) {
    var next = reminders[0]
    facts.rows.push({
      // Named like a zone's row: the reminder is the label, which a
      // narrow card cuts short, and the countdown is the value, which it
      // keeps.
      label: next.label, text: formatCountdown((next.at - clock.now) / 1000) + (reminders.length > 1 ? "  ·  +" + (reminders.length - 1) : ""),
      tip: reminders.map(function(r) { return r.label + " at " + clockDigits(new Date(r.at), hours, false) }).join("\n")
    })
  }
  ;(clock.zones || []).forEach(function(zone) {
    var offset = clock.offsets ? clock.offsets[zone] : undefined
    if (offset === undefined) return
    facts.rows.push({ label: zoneCity(zone), text: zoneText(clock.now, offset, localOffset, hours), tip: zone })
  })
  if (clock.location) {
    var sun = sunTimes(date, clock.location.lat, clock.location.lon)
    var text = sun.polar === "day" ? "No sunset today" : sun.polar === "night" ? "No sunrise today"
      : "↑ " + clockDigits(new Date(sun.rise), hours, false) + "  ↓ " + clockDigits(new Date(sun.set), hours, false)
    facts.rows.push({ label: "Sun", text: text })
  }
  return facts
}

// "Wed 28 Oct" in English, where the sampler gave no `dateText` in the
// locale (Qt.formatDate, as the Clock fill writes it), as under Node.
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function dateText(date) {
  return DAYS[date.getDay()] + " " + date.getDate() + " " + MONTHS[date.getMonth()]
}
