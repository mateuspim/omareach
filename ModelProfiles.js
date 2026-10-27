.pragma library
.import "Model.js" as Model

// Profiles, without any QML: how monitors are keyed, named snapshots of
// every monitor's entry, and the ones applied when a set of monitors connects.

// Storage key per connector name. Connector names such as DP-4 can swap
// between boots behind a dock, so a monitor is keyed by its description
// (make, model and serial) when that is known and unique among the connected
// monitors, and by its connector name otherwise. `monitors` holds
// { name, description } pairs.
function outputKeys(monitors) {
  var counts = {}
  var keys = {}
  var i, description
  for (i = 0; i < monitors.length; i++) {
    description = String(monitors[i].description || "").trim()
    if (description) counts[description] = (counts[description] || 0) + 1
  }
  for (i = 0; i < monitors.length; i++) {
    var name = String(monitors[i].name || "")
    description = String(monitors[i].description || "").trim()
    if (name) keys[name] = description && counts[description] === 1 ? description : name
  }
  return keys
}

// A profile name as typed: trimmed, at most 32 characters; "" is no name.
function profileName(text) {
  return String(text || "").trim().replace(/\s+/g, " ").slice(0, 32)
}

// Whether an entry says anything: a monitor without one is left out of a
// snapshot, as it would be missing from `outputs`.
function isDefault(entry) {
  return Model.same(Model.normalize(entry), Model.normalize(null))
}

// The entries in `outputs` worth keeping, normalized, as a profile holds
// them.
function snapshot(outputs) {
  var result = {}
  for (var key in outputs || {}) if (!isDefault(outputs[key])) result[key] = Model.normalize(outputs[key])
  return result
}

// Whether two maps of entries reserve, enable and fill the same, a missing
// entry counting as the default one.
function sameOutputs(a, b) {
  a = a || {}
  b = b || {}
  var keys = Object.keys(a).concat(Object.keys(b))
  for (var i = 0; i < keys.length; i++)
    if (!Model.same(Model.normalize(a[keys[i]]), Model.normalize(b[keys[i]]))) return false
  return true
}

// Profiles read from the state file: valid names with an object of
// entries, anything else dropped.
function profiles(raw) {
  var result = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result
  for (var name in raw) {
    var clean = profileName(name)
    if (clean && raw[name] && typeof raw[name] === "object" && !Array.isArray(raw[name]))
      result[clean] = snapshot(raw[name])
  }
  return result
}

// Profile names in the order the panel lists them.
function profileNames(profiles) {
  return Object.keys(profiles || {}).sort(function(a, b) { return a.localeCompare(b) })
}

// The profile `outputs` matches, or "" when none does (or no profile
// exists). Several profiles can hold the same thing; `preferred`, the one
// last applied or saved, wins while it still matches, and otherwise the
// first by name.
function currentProfile(profiles, outputs, preferred) {
  if (preferred && profiles && profiles[preferred] !== undefined && sameOutputs(profiles[preferred], outputs)) return preferred
  var names = profileNames(profiles)
  for (var i = 0; i < names.length; i++) if (sameOutputs(profiles[names[i]], outputs)) return names[i]
  return ""
}

// The profile `text` names, by exact name or else ignoring case; "" when
// none does.
function findProfile(profiles, text) {
  var name = profileName(text)
  if (!name) return ""
  if (profiles && profiles[name] !== undefined) return name
  var names = profileNames(profiles)
  for (var i = 0; i < names.length; i++) if (names[i].toLowerCase() === name.toLowerCase()) return names[i]
  return ""
}

// The storage keys of the connected monitors, from outputKeys, sorted.
function monitorSet(keys) {
  var set = []
  for (var name in keys || {}) if (set.indexOf(keys[name]) === -1) set.push(String(keys[name]))
  return set.sort()
}

function sameSet(a, b) {
  a = a || []
  b = b || []
  if (a.length !== b.length) return false
  for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) === -1) return false
  return true
}

// A set of monitor keys read from the state file: strings, sorted, each
// once; [] for anything else.
function keyList(raw) {
  if (!Array.isArray(raw)) return []
  var list = []
  for (var i = 0; i < raw.length; i++) {
    var key = String(raw[i] || "").trim()
    if (key && list.indexOf(key) === -1) list.push(key)
  }
  return list.sort()
}

// Automatic profiles read from the state file, as { name: [keys] }: only
// profiles that exist, with a set of at least one monitor.
function autoProfiles(raw, profiles) {
  var result = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result
  for (var name in raw) {
    var found = findProfile(profiles, name)
    var set = keyList(raw[name])
    if (found && set.length) result[found] = set
  }
  return result
}

// The automatic profile for this set of monitors, the first by name; ""
// when there is none.
function autoProfileFor(autos, set) {
  if (!set || !set.length) return ""
  var names = profileNames(autos)
  for (var i = 0; i < names.length; i++) if (sameSet(autos[names[i]], set)) return names[i]
  return ""
}
