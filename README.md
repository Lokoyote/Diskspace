# Disk Space (panel indicator)

GNOME Shell extension: a permanent icon in the top panel showing the
occupancy percentage of a volume (chosen in the preferences). Clicking
it opens the detail of every mounted volume (internal and external),
with their name as displayed in Nautilus.

## Files

```
diskspace@lokoyote.eu/
├── metadata.json
├── extension.js        (panel indicator)
├── prefs.js             (preferences window)
├── mounts.js            (logic shared between the two above)
└── schemas/
    └── org.gnome.shell.extensions.diskspace.gschema.xml
```

## Installation

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/diskspace@lokoyote.eu
cp -r metadata.json extension.js prefs.js mounts.js schemas \
    ~/.local/share/gnome-shell/extensions/diskspace@lokoyote.eu/

# Required: compile the GSettings schema (otherwise the extension
# crashes on startup with a "Schema ... is not installed" error).
glib-compile-schemas ~/.local/share/gnome-shell/extensions/diskspace@lokoyote.eu/schemas/

gnome-extensions enable diskspace@lokoyote.eu
```

## Choosing the displayed volume

```bash
gnome-extensions prefs diskspace@lokoyote.eu
```
(or via the "Extensions" / "Extension Manager" app → ⚙️ icon next to
the extension). A dropdown lists every currently mounted volume;
"Automatic" falls back to the system disk (/). The change takes
effect immediately, with no need to reload the extension.

## Reloading after a code change (extension.js / mounts.js)

- **On X11**: `Alt+F2`, type `r`, then Enter.
- **On Wayland** (default on recent GNOME): this shortcut no longer
  works, you need to log out/log back in.
- The preferences window (`prefs.js`) runs in a separate process:
  there's no need to reload the Shell to test changes made there,
  just close/reopen the preferences window.
- If you modify the `.gschema.xml` file, the schema needs to be
  recompiled (`glib-compile-schemas schemas/`) before the change
  takes effect.

Possible errors:
```bash
journalctl --user -f | grep -i diskspace
```

## How it works

- `mounts.js` reads `/proc/mounts` to list the filesystems that are
  actually mounted (internal and external), filtering out technical
  mounts (tmpfs, proc, overlay, snap, containers...).
- For each volume's name, it uses `Gio.Mount.get_name()` — exactly
  what Nautilus displays in its sidebar / "Other Locations".
- The percentage permanently shown in the panel corresponds to the
  volume chosen in the preferences (`selected-mountpoint`, an empty
  string meaning "automatic" = system disk). If the chosen volume is
  no longer mounted (USB drive unplugged), the indicator automatically
  falls back to the system disk without altering the saved preference.
- It turns red past 90% occupancy.
- Refreshes: immediately on volume plug/unplug or preference change,
  when the menu is opened, and continuously every 30 seconds.

## Known limitations

- Volumes mounted via MTP/gvfs (phones, cameras) are not listed: they
  generally don't report reliable total-space information through
  this API.
- An unreachable network mountpoint (classic NFS/CIFS, via
  /proc/mounts) will show "Information indisponible" rather than
  blocking the interface.
- Network volumes (FTP, SFTP, SMB, WebDAV mounted via Nautilus/GVfs)
  are not supported by this extension.
