#!/usr/bin/env bash
# The UTC offset of each zone the Clock card shows, for Clock.parseZoneOffsets.
# QML's JavaScript ignores toLocaleString's timeZone, so the offsets come
# from the C library's tzdata here: bash's printf %(...)T reads TZ, with
# no process per zone. The shell runs this every 5 minutes while the card
# is shown, and again when the zones change.
#
#   zones.sh ZONE...
#
# Prints "@local<TAB>Zone" for this machine's own zone (TZ, else the
# /etc/localtime link), then "Zone<TAB>+HHMM" per zone. A name that is
# not a file under the zoneinfo directory is skipped: TZ would quietly
# read it as UTC.

export LC_ALL=C
zoneinfo=${STATS_ZONEINFO:-/usr/share/zoneinfo}

zone_of() {
  local target=$1
  [[ $target == *zoneinfo/* ]] && target=${target##*zoneinfo/}
  [[ $target == :* ]] && target=${target#:}
  printf '%s' "$target"
}

if [[ -n $TZ ]]; then
  local_zone=$(zone_of "$TZ")
else
  local_zone=$(zone_of "$(readlink /etc/localtime 2>/dev/null)")
fi
printf '@local\t%s\n' "$local_zone"

for zone in "$@"; do
  # The same names Clock.zoneName accepts: never a path out of zoneinfo.
  [[ $zone =~ ^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$ ]] || continue
  [[ -f $zoneinfo/$zone ]] || continue
  # As a prefix: bash runs tzset for an assignment before a builtin, but
  # not for `local TZ` in a function, which kept the old zone.
  TZ=$zone printf '%s\t%(%z)T\n' "$zone" -1
done
exit 0
