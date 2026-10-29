# Stats sampler output

`stats.sh` feeds the stats fill. `StatsSampler.qml` runs it, splits its
stdout on `@end\n`, and hands each frame to `Stats.step`, which
splits it with `StatsProc.js`'s `parseFrame` and ingests it. This page is
the format between them, taken from `stats.sh` and the `Stats*.js`
parsers. The design is in
[ADR 6](../adr/0006-one-builtin-only-stats-sampler.md).

## Invocation

```bash
stats.sh INTERVAL PROCESS_EVERY [FRAMES]
```

| Argument | Meaning |
| --- | --- |
| `INTERVAL` | Seconds between frames (the shell passes `1`). The pause uses `read -t` on a pipe, not `sleep`. |
| `PROCESS_EVERY` | List processes on every Nth frame, starting with the first; `0` never. The shell passes `3` while the Processes panel shows, else `0`. |
| `FRAMES` | Stop after this many frames; `0` or none runs until the pipe closes. Tests use it. |

| Environment | Meaning |
| --- | --- |
| `STATS_NVIDIA=0` | Leave `nvidia-smi` out of `@gpuapps`. The shell sets it while the NVIDIA GPU rests or sleeps ([ADR 7](../adr/0007-let-an-idle-dgpu-rest.md)). |
| `OMARCHY_PATH` | An Omarchy checkout other than `/usr/share/omarchy` makes `@sysinfo` report `omarchy` as `dev`. |
| `STATS_TUNNEL_ADDRESS=1` | Fill `@tunnel`'s address column from one `ip -o -4 addr show`, run on every 10th frame and whenever the set of tunnels changes. The shell sets it while the panel's **Mesh addresses** switch is on. |
| `STATS_SYS_NET`, `STATS_IF_INET6` | Other paths for `/sys/class/net` and `/proc/net/if_inet6`, for tests. |
| `STATS_AMDGPU_IDS`, `STATS_PCI_IDS` | Other paths for libdrm's `amdgpu.ids` and hwdata's `pci.ids`, for the GPU names. Defaults `/usr/share/libdrm/amdgpu.ids`, `/usr/share/hwdata/pci.ids`. |

`LC_ALL=C` is forced. Unreadable files are skipped quietly; the script
never exits on a missing sensor.

## Frame layout

A frame is a run of sections. A section starts with a line `@<name>`;
its lines follow until the next `@` line. `@time` carries its value on
the same line. `@end` closes the frame. Empty lines are ignored.

```
@time 12345.67
@stat
cpu  …
cpu0 …
@loadavg
…
@end
```

`parseFrame` returns `{ time, <section>: [lines] }`. A section that
is present but empty is `[]`; one not printed this frame is `undefined`,
which `Stats.ingest` reads as "keep the last value".

## Sections

Columns marked *tab* are separated by a single tab; empty fields stay as
empty strings.

| Section | Every | Lines |
| --- | --- | --- |
| `@time <seconds>` | frame | Seconds since boot from `/proc/uptime`. Rates are counters over the difference; frames more than 10 s apart (`Stats.GAP`) make no rate. |
| `@stat` | frame | The `cpu` and `cpuN` lines of `/proc/stat`, as is. |
| `@loadavg` | frame | `/proc/loadavg`. |
| `@meminfo` | frame | `/proc/meminfo`. |
| `@route` | frame | `/proc/net/route`; the default route with the lowest metric picks the interface. |
| `@net` | frame | `/proc/net/dev`. |
| `@tunnel` | frame | *tab* `interface`, `kind`, `routable`, `ipv4` for each interface in `/sys/class/net` that is up (`flags` bit 0) and is a tunnel: `wireguard` (type 65534, `DEVTYPE=wireguard`), `tun` or `tap` (has `tun_flags`; bit `0x2` is tap), `ppp` (type 512) or `tunnel` (any other type 65534). `routable` is `1` when `/proc/net/if_inet6` gives it an address of scope `00` (global or unique local, not `fe80`), else `0`. `ipv4` is empty unless `STATS_TUNNEL_ADDRESS=1`. `Stats.parseTunnels` names them by interface (`Stats.TUNNELS`; `tap` only for ZeroTier, since a VM's tap is likelier than a VPN's), leaves out the default route's interface (a PPPoE `ppp0` is the uplink), and counts Tailscale as on only with a routable or IPv4 address: a stopped Tailscale keeps `tailscale0` up. Other meshes take their interface down. |
| `@disk` | frame | `/proc/diskstats`; whole disks only are used (sd, hd, vd, xvd, nvme namespaces, mmcblk). |
| `@model` | frame | *tab* `block device`, `model`, for devices that report one. |
| `@psi` | frame | `<resource> <line>` for `cpu`, `memory`, `io` from `/proc/pressure`. |
| `@hwmon` | frame | *tab* `chip`, `sensor`, `label`, `value`, `critical`: every chip's fans, plus temperatures of CPU and memory chips (`k10temp`, `zenpower`, `coretemp`, `k8temp`, `cpu_thermal`, `spd5118`, `jc42`). `critical` is the sensor's `temp*_crit` in m°C, empty when it has none (always for fans). Chips whose device is runtime-suspended are skipped. |
| `@slowhwmon` | 5th frame | Same columns, for chips that read through firmware (`dell_smm`). |
| `@nvme` | 5th frame | *tab* `controller`, `millidegrees` from each NVMe's `temp1_input`, `critical` from its `temp1_crit` (empty without one). |
| `@rapl` | frame | *tab* `zone`, `energy_uj`, `max_energy_range_uj`, `long-term limit µW` per CPU package (`intel-rapl:N`, also on AMD). `energy_uj` is empty while the counter is root's; the limit is empty without an Intel PL1. |
| `@freq` | frame | One `scaling_cur_freq` (kHz) per CPU. |
| `@system` | frame | *tab* `hostname`, `kernel`, `uptime` lines. |
| `@sysinfo` | 60th frame | *tab* key and value: `user`, `shell`, `desktop`, `os`, `omarchy` (package version or `dev`), `channel` (`stable`, `rc`, `edge`, `unknown`, or `mirror / repo` when they differ), `theme`, `sys_vendor`, `product_name`, `board_vendor`, `board_name`, `cpu`, `cpu_core` and `cpu_atom` (a hybrid Intel CPU's performance and efficient CPUs as a sysfs list like `0-15`, only when present), `page_size` (bytes, from `getconf PAGESIZE` once at start, for the processes' resident memory), `gpu_name_<card>` for each AMD and Intel card whose name was found (looked up once at start: libdrm's `amdgpu.ids` by device and revision for AMD, else hwdata's `pci.ids` by device, the bracketed product when there is one), `packages`, `flatpaks` (the last two only when present). |
| `@power` | frame | *tab* `supply`, `key`, `value` for `/sys/class/power_supply/*` keys `type`, `scope`, `status`, `capacity`, `capacity_level`, `model_name`, `power_now`, `current_now`, `voltage_now`, `energy_now`, `energy_full`, `energy_full_design`, `charge_now`, `charge_full`, `charge_full_design`, `cycle_count`. |
| `@drm` | frame | *tab* `card`, `driver`, `key`, `value` for `amdgpu`, `i915`, `xe` and `nvidia` cards; see below. |
| `@procs` | every `PROCESS_EVERY` frames | `/proc/<pid>/stat` lines, as is: CPU ticks (fields 14 and 15) and the resident set in pages (field 24). |
| `@gpuapps` | with `@procs`, when nvidia-smi is there and allowed | `nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader,nounits`, run with a 2 s timeout. |
| `@end` | frame | Closes the frame. |

"5th" and "60th" frames count from the first (frame 0 carries them).

### `@drm` keys

Every listed card prints `status` (`active` when the kernel reports
nothing, or its runtime status). Then:

- `nvidia`: `control` (runtime power management, `auto` or `on`) and
  nothing else; its numbers come from nvidia-smi. A suspended NVIDIA card
  also keeps `@gpuapps` from calling nvidia-smi.
- A suspended AMD or Intel card prints only `status`.
- `amdgpu` with `control` `auto` that read `busy 0` for 5 frames in a row
  is resting: it prints `rest 1` and is read only on every 10th frame.
- `amdgpu`: `vram_used`, `vram_total` (bytes), `dedicated 1` when its
  memory has a vendor (a discrete card), `busy` (percent), and per hwmon
  `temp` (m°C), `temp_crit` (m°C), `power` (µW, average or input), `power_cap`, `freq` (Hz),
  `pwm` (0 to 255).
- `i915`: `freq_mhz`, `idle_ms` (RC6 residency).
- `xe`: `freq_mhz`, `idle_ms` (GT idle residency).

## nvidia-smi

Outside `stats.sh`, `StatsSampler.qml` runs one long-lived

```bash
nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit,clocks.gr,fan.speed,utilization.encoder,utilization.decoder --format=csv,noheader,nounits -lms 1000
```

and holds its lines until the next `stats.sh` frame, so the dashboard
changes once a second. `Stats.parseGpu` takes exactly 12 comma-separated
fields with a numeric index; `[N/A]` and `[Not Supported]` read as null,
memory is MiB. While the GPU rests it runs the same query without `-lms`
every 10 s instead; while it sleeps, not at all. Three runs in a row that
print nothing mark the GPU missing.

## vpn.sh

```bash
vpn.sh CLIENT...
```

`StatsSampler.qml` runs it with `Stats.tunnelClients` of the last frame
(`proton`, `tailscale`, `nordvpn`, `mullvad`, `pia`, `ivpn`, `windscribe`,
or `generic` for a tunnel no client names, such as `tun0`) every 10 s while there are
any and as soon as they change, and hands its stdout to
`Stats.parseVpnInfo`; `Stats.withTunnelInfo` lays it over every frame
after. Each client it can read prints a section; others print nothing.
It always exits 0.

| Section | Lines |
| --- | --- |
| `@proton` | *tab* `server` (`US-FL#332`) from `server_name` in the app's `connection/connection_persistence.json`, then `country`, `city`, `state` from that server's entry in `serverlist.json`, when it has them. Both are in `$XDG_CACHE_HOME/Proton/VPN` (`STATS_PROTON_CACHE` for tests). |
| `@tailscale` | `tailscale status --json`, as is. Read: `BackendState` (`Running` only), `TailscaleIPs` and `DNSName` of `Self`, and each peer's `Online`, `OS`, `CurAddr` (direct) or `Relay`, and `ExitNode`. Nodes go by the first label of `DNSName`, else `HostName`; `CurrentTailnet` is not read. |
| `@nordvpn` | `nordvpn status`, as is: `Status`, `Country`, `City`. |
| `@mullvad` | `mullvad status`, as is: `Visible location: …` or the older `Connected to … in …`. |
| `@pia` | *tab* `state` and `region` from `piactl get connectionstate` and `piactl get region` (`Connected`; `us-florida`, or `auto`). From pia-foss/desktop's `cli/src/getcommand.cpp`. |
| `@ivpn` | `ivpn status`, as is: `VPN : CONNECTED`, and `gateway [host], City (CC), Country`. From ivpn/desktop-app's `cli/commands/base.go`. |
| `@windscribe` | `windscribe-cli status`, as is: `Connect state: Connected: City`, `Protocol: …`. From Windscribe/Desktop-App's `src/windscribe-cli/strings.cpp`. Asked only for its own tunnel (`utun420`), since the CLI starts the app. |
| `@expressvpn` | *tab* `state` and `region` from `expressvpnctl get`, or the older `expressvpn status` as is (`Connected to USA - New York`). |

`generic` asks Proton (an OpenVPN connection only: its WireGuard tunnel
is `proton0`), PIA, ExpressVPN, IVPN and Mullvad, each only if installed;
`Stats.withTunnelInfo` names the tunnel after the first of them
(`Stats.GENERIC_CLIENTS`) that is connected and owns no named tunnel.

Each command runs with a 3 s timeout. The NordVPN, Mullvad and ExpressVPN
formats come from their documentation; PIA's, IVPN's and Windscribe's
from their clients' source. None of them is tested on a real install.

## Restart behaviour

The shell restarts `stats.sh` 5 s after it exits while still wanted, and
restarts it 200 ms after `PROCESS_EVERY` or the nvidia-smi mode changes.
Nothing runs while no monitor shows the stats fill and no open panel
previews it, or while the session is idle.
