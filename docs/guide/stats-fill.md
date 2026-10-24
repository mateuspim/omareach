# The stats fill

A live, btop-style system dashboard on one reserved edge.

<p align="center">
  <img src="../stats.png" width="540"
       alt="The top 660 pixels of a portrait monitor showing four btop-style boxes: GPU with a load graph and VRAM, temperature, power and clock meters; CPU with a bar per thread, power against its limit, temperature and load average; memory as one bar of used and cached memory keyed by its rows, with available and swap; and network download and upload graphs above rows for the rates, the peaks and the totals since boot">
</p>

The Stats fill shows live system numbers on one edge, as rounded boxes
with history graphs and meters:

| Panel | Shows | From |
| --- | --- | --- |
| GPU | The discrete GPU: load, video memory, temperature, power against its limit, clock, fan, video encode/decode while busy | `nvidia-smi` for NVIDIA, sysfs for AMD and Intel |
| iGPU | The integrated GPU beside it, read the same way; on a machine with one GPU it takes no card | sysfs |
| CPU | Load and clock with a bar per thread (performance and efficient cores apart on a hybrid Intel CPU), power draw against the CPU's limit, temperature, load average, and how long tasks stalled waiting for the CPU while they do | `/proc/stat`, the CPU's hwmon sensor, RAPL, cpufreq, `/proc/pressure` |
| Memory | One bar of used and cached memory, available, swap, and how long tasks stalled waiting for memory while they do | `/proc/meminfo`, `/proc/pressure` |
| Network | Download and upload graphs, with the rates, the peak each graph's top stands for and the totals since boot as rows, on the interface of the default route | `/proc/net/dev`, `/proc/net/route` |
| Disks | Read and write per disk with the peak of the last minute, NVMe temperatures (unless Sensors is shown), and how long tasks stalled on I/O while they do | `/proc/diskstats`, NVMe hwmon, `/proc/pressure` |
| Processes | The programs using the most CPU, memory and video memory, processes of one name added up; a small card keeps the top one of each | `/proc/<pid>/stat`, `nvidia-smi` |
| Sensors | The temperatures no other panel on the dashboard shows (the CPU and its dies, the GPUs, NVMe drives, memory modules), each against its own limit, led by the hottest for its limit, then the fans | hwmon, sysfs, `nvidia-smi` |
| Battery | A laptop's battery with the time left, a bar of its level, its draw, energy, health and charge cycles; peripherals such as a wireless mouse or Bluetooth headphones, the emptiest leading when there is no laptop battery, each with its meter and a mark while it charges; without a battery it takes no card | `/sys/class/power_supply`, the shell's UPower devices |
| Now playing | The track playing, with its cover and progress | the shell's MPRIS players |
| System | Like fastfetch: Omarchy's icon beside the uptime, OS, Omarchy version and update channel, host, kernel, CPU, GPUs, memory, packages, shell, desktop, theme, load and threads | `/proc`, `/sys`, `/etc/os-release`, pacman's database |

GPU, CPU, Memory and Network are on by default. Each card shows what fits
its size: a small one keeps its headline and the first rows, never half
of one, and a bigger one adds rows (a GPU's fan and encoder, more
temperatures, processes and system facts). Meters too narrow to read
are left out, and a narrow Disks card leaves the temperatures to the
Sensors panel. The panels tile the edge in the grid that gives them the
most room, and the text shrinks for a crowded one; panels that still do
not fit are left off from the end of the monitor's order.

## Reading the cards

The dashboard sits on an edge you can't reach, so it is made to be read
at a glance, from a distance:

- **One color rule for meters.** A meter that measures how close
  something is to a limit (temperature, power, video memory, swap, load,
  stalls, fans, battery) runs green through its first half, then yellow,
  then red. Headlines and graphs keep their card's own hues, as in btop.
- **Temperatures against their limit.** A temperature meter fills from
  30 °C to the sensor's own limit: the critical temperature the chip
  reports (Intel's TjMax, a memory module's or NVMe drive's limit, an AMD
  GPU's), or else where such parts throttle (95 °C for AMD's CPUs, 90 °C
  for NVIDIA's GPUs, which nvidia-smi does not report for every driver).
  The Sensors card names its leading sensor's limit.
- **A warning color.** A card's outline and title turn red, with a
  warning mark for its icon, while one of its sensors is within 5 °C of
  its limit, memory is 90% used, video memory 95%, or tasks stall 10% of
  the time; the meter that caused it is red too. No card uses red or
  yellow as its own color, so a warning never looks like a card's normal
  hue. Batteries step up as they empty while not charging, a laptop's or
  a peripheral's alike: yellow at 15%, red at 10%, and red with the title
  filled in at 5%, with "low", "very low" or "critical" under the
  number.
- **Aligned rows.** A card's meters start and end together. A value too
  long to leave its meter room (VRAM's "6.2 / 16.0 GiB" in a narrow card)
  keeps its text whole and goes without a meter.
- **Graphs that name their scale, and carry no text.** The Network and
  Disks graphs scale to the busiest second of the last minute, which the
  Network card's Peak row and the Disks card's title corner name, so a
  quiet minute does not look like a busy one. Text over a spiky graph is
  unreadable, so the rates are rows, keyed to their graph by color.
- **Each reading once.** The CPU, GPU and iGPU panels keep their own
  temperatures beside their load; the Sensors panel leaves those out
  while they are on the same dashboard, and the System panel leaves out
  memory and load beside the Memory and CPU panels. A reading that only
  makes a flat line over a minute (a temperature, a battery's level) gets
  no graph.
- **GPU names.** AMD and Intel GPUs are named by model ("Radeon 610M"),
  looked up once in libdrm's `amdgpu.ids` and hwdata's `pci.ids`, since
  the kernel reports only their PCI ids.
- **The load average** names its 1, 5 and 15 minutes where the card is
  wide enough, and its meter is the last minute's load per thread.
- **Stalls** (pressure stall information) show on the CPU, Memory and
  Disks cards only while tasks stall at least 1% of the time.

## Panels

The **Stats** page of the panel lists the panels this monitor shows, in
order, two to a row; the dashboard lays them out in that order and
leaves them off from the end when the edge runs out of room. Click a
panel to select it, then **Earlier**, **Later** or **Hide** below the
list act on it. A shown panel the dashboard does not draw is dimmed, and
the line under the buttons says why when it is selected: "doesn't fit"
when the edge runs out of room, "not on this machine" for an iGPU panel
without a second GPU or a Battery panel without a battery (which **Add**
leaves out, and the count leaves out too). Click one under **Add** to
show it last. Right-click a panel, Hide or one under Add to do the same
on every monitor. The page's **Every monitor** row sets the Animation
and CPU power (below) for every dashboard. Without the Stats fill, the
page offers to switch to it.

From the keyboard, the arrows (or `h` `j` `k` `l`) walk the page and
select the panel they reach; Shift with an arrow moves it earlier or
later, `x` or Delete hides it, and Enter presses the button under the
cursor.

The System panel's facts barely change, so it keeps the same text lit in
the same place all day; on an OLED panel, leave it off or last.

Settings from 1.7 and earlier read as before: the Fans panel is now part
of Sensors, and the Pressure panel's numbers are the Stalled rows.

The GPU panel shows the discrete GPU (NVIDIA first), and the iGPU panel the
integrated one beside it; on a machine with only one GPU, that one is the
GPU panel's. AMD GPUs report everything nvidia-smi does except video
encode/decode; an AMD GPU whose memory has a vendor is discrete, and one
without, an APU whatever memory it sets aside, is integrated. Intel GPUs report no
load, so it is worked out from how long the GPU sat idle, and only the
clock besides: their temperature and power are the CPU's. A GPU the
kernel has put to sleep, such as a laptop's discrete one, shows as asleep
and is not read, since reading it would wake it. Reading an awake GPU
also keeps it awake, so a discrete GPU that can power itself down (runtime
power management on, as on most laptops) and has shown no load for 5
seconds rests: nvidia-smi stops, an AMD card is read every 10 seconds
instead of every second, and the panel shows its last reading as idle
until a reading finds it busy again.

## CPU power

The CPU's power draw comes from its RAPL energy counter (Intel, and AMD
since Zen), which the kernel lets only root read; once it can, the CPU
panel lists it first ("Power 85 / 162 W", with the clock
moving up beside the load), its meter blue through green and yellow to
red as it nears the CPU's power limit: Intel's own (PL1), or an
AMD desktop's stock PPT, looked up by model since AMD keeps it in
firmware. A laptop's or unlisted model's watts show without a meter. The Stats page's **CPU power · Enable** button,
shown only where there is such a counter, opens a floating terminal that
prints the root commands it would run, asks, and runs them with
`sudo`, which asks for the password right there (or `pkexec` where there
is no sudo): a udev rule that lets everyone read the counter from boot on,
as btop's docs suggest, and a `chmod` that opens it now. Once on, the
button reads **CPU power · On**, and clicking it takes both back the same
way. By hand:

```bash
echo 'SUBSYSTEM=="powercap", ACTION=="add", RUN+="/bin/chmod a+r /sys%p/energy_uj"' |
  sudo tee /etc/udev/rules.d/70-rapl-energy.rules
sudo chmod a+r /sys/class/powercap/*/energy_uj
```

The counter is root's because watching it closely enough can leak what
another program computes (Platypus, CVE-2020-8694); a desktop with one
user gives little away.

## Colors, sampling and animation

The colors come from the theme's `colors.toml`, the way Omarchy's btop
themes are built: each box has its own hue, and graphs and meters run
from cool to hot (CPU cyan, blue, magenta; temperature green, yellow,
red). Omarchy reads that file at startup and sends theme switches to the
shell over IPC, so the plugin reads it again whenever the shell's theme
colors change, and the dashboard follows a theme switch at once.

The numbers come from `stats.sh`, which prints them once a second using
shell builtins only, so it starts no process per sample, and from one
`nvidia-smi` that keeps running and prints a line a second. Process
lists come every 3 seconds and only while the Processes panel is shown.
Nothing runs unless a monitor shows the Stats fill (or the panel shows
it in its preview), and everything stops while the session is idle.
Logitech Bolt receivers are not supported by the kernel's Logitech
driver, so a mouse or keyboard on one reports no battery (Solaar reads it
directly; the panel does not).
NVMe temperatures and Dell laptops' fans, which are read through the
firmware and stall the CPU for a moment, are read every 5 seconds.

The graphs scroll and the meters ease between samples at 30 frames a
second by default, and the dashboard redraws only as often. The
Animation list on the Stats page (or `pace`) sets it for every monitor:
the display's own rate for the smoothest motion, 60, 30 or 15 fps, or no
animation, which redraws once a second.
