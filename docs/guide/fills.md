# Fills

What the reserved edges show: black, the theme color, the wallpaper, the
Omarchy logo, a clock or the stats dashboard, and black when idle.

- **Fill**: what the reserved edges show on this monitor. **Black** is the
  default and the right choice for OLED panels. **Theme** uses the theme's
  background color. **Wallpaper** shows the slice of your wallpaper that
  would be there, so the desktop looks like it carries on into the edge;
  **Dimmed** darkens that slice, by 60% unless you move its **Dim**
  slider (10% to 90%). **Logo** puts the Omarchy logo, in the
  theme's text color, on black: the wordmark on the top and bottom edges,
  Omarchy's icon over it on the sides. **Clock** shows a 24-hour HH:MM clock
  (or with **12-hour**, H:MM without AM or PM)
  in big blocky digits, in the theme's accent color, on one edge: the
  largest reserved edge, or with **Top or bottom** the larger of those two
  whenever either is reserved. The monitor's other edges stay black. The
  digits are always upright and as large as the edge allows: one line on a
  wide edge, hours over minutes on a tall one. With **Date** on, the date
  ("Sat 24 Oct", in your locale) goes under the time when the edge is tall
  enough that the time keeps most of its size; a short strip shows only
  the time. **Stats** turns the same one
  edge into a live system dashboard in the style of btop (see [The stats fill](stats-fill.md)).
  **Same on every monitor** (or right-clicking a fill) gives every monitor
  this one's fill, with its dim amount, clock settings and stats panels.
  Every fill except Black keeps something lit in the
  same place all day, which can burn into an OLED panel. The clock and the
  logo move a few pixels every 5 minutes to spread the wear, and so does the
  stats dashboard. While the monitor shows a fullscreen window, every edge
  goes black, except the stats dashboard, which stays up beside a game.
- **Stats page**: which panels the dashboard shows, and in which order (see
  [The stats fill](stats-fill.md#panels)).
- **Idle** (the moon button in the panel's footer, beside Ruler and
  Clear): every edge on every monitor goes black after 30 s, 1 min or
  5 min without input, and back on the next input, whatever
  the fill. Off by default. An app that holds off the screensaver, such as a
  video player, holds this off too.
