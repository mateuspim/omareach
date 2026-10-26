#!/usr/bin/env bash
# The stats fill's sampler: prints a frame of system counters every
# INTERVAL seconds, for Stats.parseFrame. It reads /proc and /sys with
# builtins only, so a frame costs no new processes, apart from one
# nvidia-smi call for the GPU's apps on frames that list processes.
#
#   stats.sh INTERVAL PROCESS_EVERY [FRAMES]
#
# PROCESS_EVERY: list every process (and GPU app) on every Nth frame,
# starting with the first; 0 never does. FRAMES: stop after that many
# frames; 0 or none runs until the shell closes the pipe.
# STATS_NVIDIA=0 in the environment leaves nvidia-smi out: the shell sets
# it while the NVIDIA GPU rests or sleeps, since asking wakes it.

export LC_ALL=C
interval=${1:-1}
every=${2:-0}
frames=${3:-0}

# Lines of a file, quietly: sensors and processes come and go.
dump() {
  local line
  while IFS= read -r line || [[ -n $line ]]; do printf '%s\n' "$line"; done < "$1"
} 2>/dev/null

# Only the CPU's and memory modules' temperature chips are read: reading
# another device's sensors can wake it from a low-power state.
# ACPI thermal zones are left out: reading one runs firmware code.
temp_chip='^(k10temp|zenpower|coretemp|k8temp|cpu_thermal|spd5118|jc42)$'
# Chips read every fifth frame only: a Dell's fans are read through the
# firmware (SMM), which stalls every core for the moment it takes.
slow_chip='^(dell_smm)$'
nvidia=$(type -P nvidia-smi)
[[ ${STATS_NVIDIA:-1} == 0 ]] && nvidia=""
# Frames in a row each AMD card that can power itself down read idle;
# after five it is read only every tenth frame, so it can go to sleep.
declare -A rest

# A hwmon chip's lines (chip, sensor, label, value, critical): its fans,
# and its temperatures when it is the CPU's or memory's, with the
# temperature the chip calls critical when it gives one (Intel's TjMax, a
# DIMM's limit), so a meter can fill towards it. A device asleep is left
# alone: reading its sensors would wake it.
sensors() {
  local dir=$1 chip=$2 status="" input sensor label value crit
  { read -r status < "$dir/device/power/runtime_status"; } 2>/dev/null
  [[ $status == suspended ]] && return
  local inputs=("$dir"/fan*_input)
  [[ $chip =~ $temp_chip ]] && inputs+=("$dir"/temp*_input)
  for input in "${inputs[@]}"; do
    [[ -e $input ]] || continue
    sensor=${input##*/}
    sensor=${sensor%_input}
    label="" value="" crit=""
    [[ -r $dir/${sensor}_label ]] && read -r label < "$dir/${sensor}_label"
    [[ -r $dir/${sensor}_crit ]] && { read -r crit < "$dir/${sensor}_crit"; } 2>/dev/null
    { read -r value < "$input"; } 2>/dev/null
    printf '%s\t%s\t%s\t%s\t%s\n' "$chip" "$sensor" "$label" "$value" "$crit"
  done
}

# Each AMD and Intel card's marketing name, looked up once: sysfs gives
# only PCI ids. libdrm's amdgpu.ids has AMD's names by device and revision
# (as btop and nvtop use it); hwdata's pci.ids names the rest, with the
# product in brackets ("Granite Ridge [Radeon 610M]"). Both are optional.
declare -A gpu_names
amdgpu_ids=${STATS_AMDGPU_IDS:-/usr/share/libdrm/amdgpu.ids}
pci_ids=${STATS_PCI_IDS:-/usr/share/hwdata/pci.ids}
for card in /sys/class/drm/card*; do
  id=${card##*/}
  [[ $id == *-* ]] && continue
  vendor="" device="" revision=""
  { read -r vendor < "$card/device/vendor"; read -r device < "$card/device/device"; read -r revision < "$card/device/revision"; } 2>/dev/null
  vendor=${vendor#0x} device=${device#0x} revision=${revision#0x}
  [[ $vendor == 1002 || $vendor == 8086 ]] || continue
  name=""
  if [[ $vendor == 1002 && -r $amdgpu_ids ]]; then
    want="${device^^},"$'\t'"${revision^^},"$'\t'
    while IFS= read -r line; do
      [[ $line == "$want"* ]] && { name=${line#"$want"}; break; }
    done < "$amdgpu_ids"
  fi
  if [[ -z $name && -r $pci_ids ]]; then
    in_vendor=0
    while IFS= read -r line; do
      if [[ $line == "$vendor  "* ]]; then in_vendor=1; continue; fi
      (( in_vendor )) || continue
      [[ $line == $'\t'* ]] || break
      [[ $line == $'\t'"$device  "* ]] && { name=${line#$'\t'"$device  "}; break; }
    done < "$pci_ids"
    [[ $name == *"["*"]"* ]] && { name=${name##*\[}; name=${name%%]*}; }
  fi
  [[ -n $name ]] && gpu_names[$id]=$name
done

# Network interfaces, for the tunnels a VPN or a mesh (Tailscale) brings
# up. STATS_SYS_NET points tests at a made-up tree.
net_root=${STATS_SYS_NET:-/sys/class/net}
# STATS_TUNNEL_ADDRESS=1 adds each tunnel's IPv4 address. The kernel keeps
# no per-interface IPv4 file (only /proc/net/if_inet6, for IPv6), so this
# asks `ip` once, on every tenth frame and whenever the tunnels change.
tunnel_address=${STATS_TUNNEL_ADDRESS:-0}
declare -A tunnel_ips
tunnels_were=""
tunnel_fresh=0

# The page size, for the processes' resident memory, which /proc/<pid>/stat
# gives in pages: 4 KiB on x86, but 16 or 64 KiB on some ARM kernels.
# Asked once, so no frame starts a process for it.
page_size=$(getconf PAGESIZE 2>/dev/null)

# A pipe nobody writes to, for sleeping with read -t instead of forking
# sleep on every frame.
exec {sleeper}<> <(:)

n=0
while :; do
  # Seconds since boot: unlike the wall clock, it never jumps back or
  # ahead, so the rates hold across a clock change.
  read -r uptime _ < /proc/uptime
  printf '@time %s\n' "$uptime"

  printf '@stat\n'
  while IFS= read -r line; do
    [[ $line == cpu* ]] || break
    printf '%s\n' "$line"
  done < /proc/stat

  printf '@loadavg\n'; dump /proc/loadavg
  printf '@meminfo\n'; dump /proc/meminfo
  printf '@route\n'; dump /proc/net/route
  printf '@net\n'; dump /proc/net/dev

  # The tunnels that are up. A VPN client (Proton, NordLynx, Mullvad,
  # wg-quick) routes through its tunnel with policy rules (ip rule), so the
  # default route in @route keeps naming the wired or wireless interface
  # while it is connected: only the interfaces themselves tell. A tunnel
  # has no hardware address (type 65534: WireGuard and tun), is PPP (512),
  # or has tun_flags (tun and tap). Proton's leak guards are dummies (type
  # 1) and stay out.
  tunnels=() kinds=()
  for dir in "$net_root"/*; do
    type="" flags="" kind=""
    { read -r type < "$dir/type"; read -r flags < "$dir/flags"; } 2>/dev/null || continue
    [[ $flags == 0x* ]] && (( flags & 1 )) || continue
    if [[ -e $dir/tun_flags ]]; then
      tun=0
      { read -r tun < "$dir/tun_flags"; } 2>/dev/null
      # IFF_TAP
      (( tun & 2 )) && kind=tap || kind=tun
    elif [[ $type == 512 ]]; then kind=ppp
    elif [[ $type == 65534 ]]; then
      kind=tunnel
      { while IFS= read -r line; do [[ $line == DEVTYPE=wireguard ]] && kind=wireguard; done < "$dir/uevent"; } 2>/dev/null
    else continue
    fi
    tunnels+=("${dir##*/}") kinds+=("$kind")
  done
  # A new tunnel's client may give it its address a moment after bringing
  # it up, so the three frames after a change ask again.
  [[ "${tunnels[*]}" != "$tunnels_were" ]] && tunnel_fresh=3
  if [[ $tunnel_address == 1 && ${#tunnels[@]} -gt 0 ]] && { (( n % 10 == 0 )) || (( tunnel_fresh > 0 )); }; then
    tunnel_ips=()
    while read -r _ name _ address _; do
      [[ -z ${tunnel_ips[$name]:-} ]] && tunnel_ips[$name]=${address%/*}
    done < <(ip -o -4 addr show 2>/dev/null)
  fi
  tunnels_were="${tunnels[*]}"
  (( tunnel_fresh > 0 )) && (( tunnel_fresh-- ))
  # Tunnels with an IPv6 address past link-local (scope 00, global or
  # unique local), which a mesh gets once it is connected: a stopped
  # Tailscale keeps tailscale0 up with only its fe80 address.
  declare -A routable=()
  if (( ${#tunnels[@]} )); then
    { while read -r _ _ _ scope _ name; do
      [[ $scope == 00 ]] && routable[$name]=1
    done < "${STATS_IF_INET6:-/proc/net/if_inet6}"; } 2>/dev/null
  fi
  printf '@tunnel\n'
  for i in "${!tunnels[@]}"; do
    printf '%s\t%s\t%s\t%s\n' "${tunnels[i]}" "${kinds[i]}" "${routable[${tunnels[i]}]:-0}" "${tunnel_ips[${tunnels[i]}]:-}"
  done
  printf '@disk\n'; dump /proc/diskstats

  printf '@model\n'
  for dir in /sys/block/*; do
    model=""
    [[ -r $dir/device/model ]] && read -r model < "$dir/device/model"
    [[ -n $model ]] && printf '%s\t%s\n' "${dir##*/}" "$model"
  done

  printf '@psi\n'
  for resource in cpu memory io; do
    [[ -r /proc/pressure/$resource ]] || continue
    while IFS= read -r line; do printf '%s %s\n' "$resource" "$line"; done < "/proc/pressure/$resource"
  done

  printf '@hwmon\n'
  slow=()
  for dir in /sys/class/hwmon/hwmon*; do
    { read -r chip < "$dir/name"; } 2>/dev/null || continue
    if [[ $chip =~ $slow_chip ]]; then slow+=("$dir"); continue; fi
    sensors "$dir" "$chip"
  done

  # Every fifth frame: each read sends the drive a command, which wakes a
  # laptop's SSD from its deepest power state.
  if (( n % 5 == 0 )); then
    printf '@slowhwmon\n'
    for dir in "${slow[@]}"; do
      { read -r chip < "$dir/name"; } 2>/dev/null && sensors "$dir" "$chip"
    done
    printf '@nvme\n'
    for input in /sys/class/nvme/nvme*/hwmon*/temp1_input; do
      [[ -e $input ]] || continue
      controller=${input#/sys/class/nvme/}
      value="" crit=""
      { read -r value < "$input"; } 2>/dev/null
      { read -r crit < "${input%_input}_crit"; } 2>/dev/null
      printf '%s\t%s\t%s\n' "${controller%%/*}" "$value" "$crit"
    done
  fi

  # The CPU packages' energy counters, for their power draw, and Intel's
  # limit. Only root can read the counters unless a udev rule lets
  # everyone (see docs/guide/stats-fill.md); until then their lines carry no energy.
  printf '@rapl\n'
  for zone in /sys/class/powercap/intel-rapl:[0-9] /sys/class/powercap/intel-rapl:[0-9][0-9]; do
    [[ -d $zone ]] || continue
    energy="" range=""
    { read -r energy < "$zone/energy_uj"; } 2>/dev/null
    { read -r range < "$zone/max_energy_range_uj"; } 2>/dev/null
    # Intel's long-term limit (PL1); AMD's zones have none.
    limit="" name=""
    { read -r name < "$zone/constraint_0_name"; } 2>/dev/null
    [[ $name == long_term ]] && { read -r limit < "$zone/constraint_0_power_limit_uw"; } 2>/dev/null
    printf '%s\t%s\t%s\t%s\n' "${zone##*/}" "$energy" "$range" "$limit"
  done

  printf '@freq\n'
  for input in /sys/devices/system/cpu/cpu[0-9]*/cpufreq/scaling_cur_freq; do
    [[ -r $input ]] && read -r value < "$input" && printf '%s\n' "$value"
  done

  printf '@system\n'
  for key in hostname:/proc/sys/kernel/hostname kernel:/proc/sys/kernel/osrelease uptime:/proc/uptime; do
    value=""
    { read -r value < "${key#*:}"; } 2>/dev/null && printf '%s\t%s\n' "${key%%:*}" "$value"
  done

  # What fastfetch shows that seldom changes, every minute.
  if (( n % 60 == 0 )); then
    printf '@sysinfo\n'
    printf 'user\t%s\nshell\t%s\ndesktop\t%s\n' "${USER:-}" "${SHELL##*/}" "${XDG_CURRENT_DESKTOP:-}"
    os=""
    { while IFS='=' read -r key value; do [[ $key == PRETTY_NAME ]] && os=${value//\"/}; done < /etc/os-release; } 2>/dev/null
    printf 'os\t%s\n' "$os"
    # Omarchy's version and update channel, found as omarchy-version and
    # omarchy-version-channel find them: the installed package's version
    # (a checkout elsewhere is "dev"), and the mirror and package repo.
    omarchy_path=${OMARCHY_PATH:-/usr/share/omarchy}
    value=""
    if [[ ${omarchy_path%/} != /usr/share/omarchy ]]; then
      value=dev
    else
      for dir in /var/lib/pacman/local/omarchy-dev-[0-9]*/ /var/lib/pacman/local/omarchy-[0-9]*/; do
        [[ -d $dir ]] || continue
        dir=${dir%/}; dir=${dir##*/}; dir=${dir#omarchy-dev-}; value=${dir#omarchy-}
        break
      done
    fi
    printf 'omarchy\t%s\n' "$value"
    # The first of stable, rc and edge whose URL file $1 names, as
    # omarchy-version-channel looks for them; into $found.
    channel() {
      local text="" line
      { while IFS= read -r line; do text+="$line"$'\n'; done < "$1"; } 2>/dev/null
      found=unknown
      if [[ $text == *"$2"* ]]; then found=stable
      elif [[ $text == *"$3"* ]]; then found=rc
      elif [[ $text == *"$4"* ]]; then found=edge
      fi
    }
    channel /etc/pacman.d/mirrorlist https://stable-mirror.omarchy.org/ https://rc-mirror.omarchy.org/ https://mirror.omarchy.org/
    mirror=$found
    channel /etc/pacman.conf https://pkgs.omarchy.org/stable/ https://pkgs.omarchy.org/rc/ https://pkgs.omarchy.org/edge/
    repo=$found
    [[ $mirror == "$repo" ]] && printf 'channel\t%s\n' "$mirror" || printf 'channel\t%s / %s\n' "$mirror" "$repo"
    value=""; { read -r value < "$HOME/.local/state/omarchy/current/theme.name"; } 2>/dev/null; printf 'theme\t%s\n' "$value"
    for key in sys_vendor product_name board_vendor board_name; do
      value=""; { read -r value < "/sys/devices/virtual/dmi/id/$key"; } 2>/dev/null; printf '%s\t%s\n' "$key" "$value"
    done
    { while IFS=: read -r key value; do
        [[ $key == "model name"* ]] && { printf 'cpu\t%s\n' "${value# }"; break; }
      done < /proc/cpuinfo; } 2>/dev/null
    for id in "${!gpu_names[@]}"; do printf 'gpu_name_%s\t%s\n' "$id" "${gpu_names[$id]}"; done
    [[ -n $page_size ]] && printf 'page_size\t%s\n' "$page_size"
    # Intel's hybrid CPUs list their performance and efficient cores apart
    # (cpu_core, cpu_atom), as CPU ranges like 0-15.
    for kind in cpu_core cpu_atom; do
      value=""; { read -r value < "/sys/devices/$kind/cpus"; } 2>/dev/null
      [[ -n $value ]] && printf '%s\t%s\n' "$kind" "$value"
    done
    # Installed packages: a directory each in pacman's database.
    packages=(/var/lib/pacman/local/*/)
    [[ -d ${packages[0]} ]] && printf 'packages\t%s\n' "${#packages[@]}"
    flatpaks=(/var/lib/flatpak/app/*/)
    [[ -d ${flatpaks[0]} ]] && printf 'flatpaks\t%s\n' "${#flatpaks[@]}"
  fi

  # Batteries, the laptop's and peripherals', and power adapters.
  printf '@power\n'
  for supply in /sys/class/power_supply/*; do
    [[ -d $supply ]] || continue
    for key in type scope status capacity capacity_level model_name power_now current_now voltage_now energy_now energy_full energy_full_design charge_now charge_full charge_full_design cycle_count; do
      [[ -r $supply/$key ]] || continue
      value=""
      { read -r value < "$supply/$key"; } 2>/dev/null && printf '%s\t%s\t%s\n' "${supply##*/}" "$key" "$value"
    done
  done

  # AMD and Intel GPUs, by card; NVIDIA's come from nvidia-smi, and only
  # say here whether they sleep. A card the kernel put to sleep only
  # reports that: reading it would wake it.
  printf '@drm\n'
  for card in /sys/class/drm/card*; do
    id=${card##*/}
    [[ $id == *-* ]] && continue
    dev=$card/device
    driver=""
    { while IFS='=' read -r key value; do [[ $key == DRIVER ]] && driver=$value; done < "$dev/uevent"; } 2>/dev/null
    [[ $driver == amdgpu || $driver == i915 || $driver == xe || $driver == nvidia ]] || continue
    status="" control=""
    [[ -r $dev/power/runtime_status ]] && read -r status < "$dev/power/runtime_status"
    [[ -r $dev/power/control ]] && read -r control < "$dev/power/control"
    gpu() { [[ -r $2 ]] && read -r value < "$2" && printf '%s\t%s\t%s\t%s\n' "$id" "$driver" "$1" "$value"; }
    printf '%s\t%s\tstatus\t%s\n' "$id" "$driver" "${status:-active}"
    if [[ $driver == nvidia ]]; then
      printf '%s\t%s\tcontrol\t%s\n' "$id" "$driver" "$control"
      [[ $status == suspended ]] && nvidia=""
      continue
    fi
    [[ $status == suspended ]] && continue
    # Resting: left alone but every tenth frame.
    if [[ $driver == amdgpu && $control == auto ]] && (( ${rest[$id]:-0} >= 5 && n % 10 != 0 )); then
      printf '%s\t%s\trest\t1\n' "$id" "$driver"
      continue
    fi
    gpu vram_used "$dev/mem_info_vram_used"
    gpu vram_total "$dev/mem_info_vram_total"
    if [[ $driver == amdgpu ]]; then
      # Only a discrete card's memory has a vendor.
      [[ -e $dev/mem_info_vram_vendor ]] && printf '%s\t%s\tdedicated\t1\n' "$id" "$driver"
      busy=""
      { read -r busy < "$dev/gpu_busy_percent"; } 2>/dev/null
      [[ -n $busy ]] && printf '%s\t%s\tbusy\t%s\n' "$id" "$driver" "$busy"
      if [[ $control == auto && $busy == 0 ]]; then rest[$id]=$(( ${rest[$id]:-0} + 1 )); else rest[$id]=0; fi
      for hwmon in "$dev"/hwmon/hwmon*; do
        gpu temp "$hwmon/temp1_input"
        gpu temp_crit "$hwmon/temp1_crit"
        if [[ -r $hwmon/power1_average ]]; then gpu power "$hwmon/power1_average"; else gpu power "$hwmon/power1_input"; fi
        gpu power_cap "$hwmon/power1_cap"
        gpu freq "$hwmon/freq1_input"
        gpu pwm "$hwmon/pwm1"
      done
    elif [[ $driver == i915 ]]; then
      gpu freq_mhz "$card/gt_cur_freq_mhz"
      gpu idle_ms "$card/gt/gt0/rc6_residency_ms"
    else
      gpu freq_mhz "$dev/tile0/gt0/freq0/cur_freq"
      gpu idle_ms "$dev/tile0/gt0/gtidle/idle_residency_ms"
    fi
  done

  if (( every > 0 && n % every == 0 )); then
    printf '@procs\n'
    for input in /proc/[0-9]*/stat; do
      { read -r line < "$input"; } 2>/dev/null && printf '%s\n' "$line"
    done
    if [[ -n $nvidia ]]; then
      printf '@gpuapps\n'
      # A hung driver must not stall every panel.
      timeout 2 "$nvidia" --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits 2>/dev/null
    fi
  fi

  printf '@end\n'
  (( ++n == frames )) && break
  read -t "$interval" -u "$sleeper"
done
