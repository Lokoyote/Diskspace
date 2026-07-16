# Disk Space — GNOME Shell panel indicator

A lightweight GNOME Shell extension that shows the occupancy of a disk
volume directly in the top panel, and lets you inspect every mounted
volume (internal and external) from a single dropdown menu.

![shell-version](https://img.shields.io/badge/GNOME%20Shell-45%20%7C%2046-blue)
![license](https://img.shields.io/badge/license-GPL--3.0-green)

## Features

- 📊 **Permanent panel indicator** — always-on percentage of the volume
  of your choice, right in the top bar. Turns red past 90% usage so
  you notice before it's too late.
- 📂 **One menu, every volume** — click the indicator to see all
  mounted internal and external drives, each with a usage bar, exact
  size, and the same name Nautilus gives it.
- ⚙️ **Simple preferences** — pick which volume feeds the panel
  percentage from a dropdown; falls back automatically to the system
  disk if that volume gets unplugged.
- 🔄 **Always fresh** — refreshes instantly when a drive is
  plugged/unplugged or a preference changes, when the menu opens, and
  every 30 seconds in the background.
- 🪶 **Lightweight** — no polling loops over heavy filesystem scans;
  relies on the standard `Gio` filesystem-info API.

## Screenshots



## Installation

### From extensions.gnome.org

*(link to the extension page once published)*

### Manual installation

```bash
git clone https://github.com/<your-username>/diskspace-gnome-extension.git
cd diskspace-gnome-extension

mkdir -p ~/.local/share/gnome-shell/extensions/diskspace@lokoyote.eu
cp -r metadata.json extension.js prefs.js mounts.js schemas \
    ~/.local/share/gnome-shell/extensions/diskspace@lokoyote.eu/

glib-compile-schemas ~/.local/share/gnome-shell/extensions/diskspace@lokoyote.eu/schemas/

gnome-extensions enable diskspace@lokoyote.eu
```

Then log out and back in (Wayland) or press `Alt+F2` → `r` → `Enter`
(X11) to load the extension.

## Configuration

Open the preferences from the "Extensions" / "Extension Manager" app,
or run:

```bash
gnome-extensions prefs diskspace@lokoyote.eu
```

Choose which mounted volume drives the panel percentage. "Automatic"
always tracks the system disk (`/`).

## How it works

`mounts.js` reads `/proc/mounts` to build the list of real, physically
mounted volumes (internal and external), filtering out virtual and
technical filesystems (tmpfs, proc, overlay, snap, containers...). For
display names, it reuses `Gio.Mount.get_name()` — the exact same name
Nautilus shows in its sidebar and "Other Locations" view. Filesystem
usage is queried asynchronously per volume via
`Gio.File.query_filesystem_info_async`, so the Shell never blocks
while stats are fetched.

## Known limitations

- Volumes mounted via MTP/gvfs (phones, cameras) aren't listed — this
  API doesn't reliably report their total capacity.
- An unreachable network mount (classic NFS/CIFS via `/proc/mounts`)
  shows "information unavailable" instead of blocking the UI.
- Network volumes mounted through Nautilus/GVfs (FTP, SFTP, SMB,
  WebDAV) are out of scope for this extension.

## Contributing

Issues and pull requests are welcome. The codebase is small and split
into three files: `extension.js` (the panel indicator, running in the
Shell process), `prefs.js` (the preferences window, running in a
separate process), and `mounts.js` (logic shared by both).

## License

*(add your license here, e.g. GPL-3.0-or-later — the convention for
GNOME Shell extensions)*
