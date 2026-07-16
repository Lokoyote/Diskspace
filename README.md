# Disk Space (panel indicator)

Displays the usage percentage of a selected filesystem in the top panel.

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

Possible errors:
```bash
journalctl --user -f | grep -i diskspace
```

## Known limitations

- Volumes mounted via MTP/gvfs (phones, cameras) are not listed: they
  generally don't report reliable total-space information through
  this API.
- An unreachable network mountpoint (classic NFS/CIFS, via
  /proc/mounts) will show "Information indisponible" rather than
  blocking the interface.
- Network volumes (FTP, SFTP, SMB, WebDAV mounted via Nautilus/GVfs)
  are not supported by this extension.
