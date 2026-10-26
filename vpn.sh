#!/usr/bin/env bash
# Where the VPN and mesh clients whose tunnels are up are connected, for
# the network card: Stats.parseVpnInfo reads the sections. The kernel
# only knows a tunnel is up; the server, country and peers are each
# client's own, so each is asked its own way. The shell runs this every
# 10 s while a tunnel is up, never otherwise.
#
#   vpn.sh CLIENT...
#
# CLIENT: proton, tailscale, nordvpn, mullvad, pia, ivpn, windscribe
# (Stats.TUNNELS), or generic for a tunnel with a name no client owns
# (tun0): then every installed client that may have made it is asked, and
# Stats.parseVpnInfo takes the one that says it is connected. Any other
# CLIENT is ignored, as is a client whose state cannot be read.

export LC_ALL=C

# Proton's app (NetworkManager backend) keeps the server it connected to
# in its cache, and every server's place in its server list. The list is
# pretty-printed JSON; a logical server's fields come after its "Name",
# before the next one's.
# With `openvpn` only an OpenVPN connection counts: Proton's WireGuard
# tunnel has a name of its own (proton0), and OpenVPN's is a plain tun0.
ask_proton() {
  local dir=${STATS_PROTON_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/Proton/VPN}
  local text="" line
  { while IFS= read -r line || [[ -n $line ]]; do text+=$line; done < "$dir/connection/connection_persistence.json"; } 2>/dev/null
  if [[ $1 == openvpn ]]; then
    [[ $text =~ \"protocol\":\ *\"openvpn ]] || return 0
  fi
  [[ $text =~ \"server_name\":\ *\"([^\"]+)\" ]] || return 0
  local server=${BASH_REMATCH[1]}
  printf '@proton\nserver\t%s\n' "$server"
  awk -v name="\"Name\": \"$server\"" '
    index($0, name) { found = 1; next }
    !found { next }
    /"Name": "/ { exit }
    match($0, /"(ExitCountry|City|State)": "[^"]*"/) {
      split(substr($0, RSTART, RLENGTH), kv, /": "/)
      key = substr(kv[1], 2); value = substr(kv[2], 1, length(kv[2]) - 1)
      if (!(key in seen)) { seen[key] = 1; count++; printf "%s\t%s\n", tolower(key == "ExitCountry" ? "country" : key), value }
      if (count == 3) exit
    }
  ' "$dir/serverlist.json" 2>/dev/null
}

# A command's output under its section, if the command is installed. Each
# gets 3 s: a client whose daemon hangs must not stall the next run.
section() {
  local name=$1; shift
  command -v "$1" >/dev/null || return 0
  printf '@%s\n' "$name"
  timeout 3 "$@" 2>/dev/null
}

# PIA's piactl answers one key at a time (pia-foss/desktop,
# cli/src/getcommand.cpp): the state ("Connected"), then the chosen
# region's CLI name ("us-florida"), or "auto".
ask_pia() {
  command -v piactl >/dev/null || return 0
  printf '@pia\nstate\t%s\nregion\t%s\n' "$(timeout 3 piactl get connectionstate 2>/dev/null)" "$(timeout 3 piactl get region 2>/dev/null)"
}

# ExpressVPN's current CLI, expressvpnctl, answers by key like piactl; the
# older expressvpn prints "Connected to USA - New York". Neither is open
# source; both formats are from ExpressVPN's support pages, untested here.
ask_expressvpn() {
  if command -v expressvpnctl >/dev/null; then
    printf '@expressvpn\nstate\t%s\nregion\t%s\n' "$(timeout 3 expressvpnctl get connectionstate 2>/dev/null)" "$(timeout 3 expressvpnctl get region 2>/dev/null)"
  else
    section expressvpn expressvpn status
  fi
}

for client in "$@"; do
  case $client in
    proton) ask_proton ;;
    pia) ask_pia ;;
    # ivpn status (ivpn/desktop-app, cli/commands/base.go) prints
    # "VPN : CONNECTED" and the server's place on the line after.
    ivpn) section ivpn ivpn status ;;
    # windscribe-cli starts the app when it is not running, so it is only
    # asked when its own tunnel (utun420) is up, never for a generic one.
    windscribe) section windscribe windscribe-cli status ;;
    # A tunnel no client names: Proton and Mullvad over OpenVPN, PIA's and
    # IVPN's OpenVPN, ExpressVPN.
    generic)
      ask_proton openvpn
      ask_pia
      ask_expressvpn
      section ivpn ivpn status
      section mullvad mullvad status
      ;;
    # The JSON as is: Stats.parseTailscale reads it. A daemon newer than
    # the CLI warns on stderr.
    tailscale) section tailscale tailscale status --json ;;
    nordvpn) section nordvpn nordvpn status ;;
    mullvad) section mullvad mullvad status ;;
  esac
done
exit 0
