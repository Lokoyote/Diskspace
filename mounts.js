// Functions shared between extension.js (Shell process) and prefs.js
// (preferences window process) — two separate processes that can both
// import this local module.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// "Pseudo" filesystems to ignore (no real volume behind them).
export const EXCLUDED_FS_TYPES = new Set([
    'proc', 'sysfs', 'tmpfs', 'devtmpfs', 'devpts', 'cgroup', 'cgroup2',
    'pstore', 'bpf', 'tracefs', 'debugfs', 'mqueue', 'hugetlbfs', 'autofs',
    'binfmt_misc', 'configfs', 'securityfs', 'fusectl', 'overlay',
    'squashfs', 'ramfs', 'efivarfs', 'rpc_pipefs', 'nsfs',
    'fuse.gvfsd-fuse', 'fuse.portal', 'fuse.gvfs-fuse-daemon',
]);

// Mountpoint prefixes to ignore (system/container noise).
// Note: /run/media/ and /media/ are intentionally kept, since that's
// often where USB drives / external disks get mounted.
export const EXCLUDED_PATH_PREFIXES = [
    '/snap/', '/var/lib/docker/', '/var/lib/containers/',
    '/run/user/', '/run/lock', '/run/snapd/', '/run/credentials/',
    '/sys/', '/proc/', '/dev/',
];

export function unescapeMountPath(str) {
    return str
        .replace(/\\040/g, ' ')
        .replace(/\\011/g, '\t')
        .replace(/\\012/g, '\n')
        .replace(/\\134/g, '\\');
}

export function formatSize(bytes) {
    let n = bytes;
    const units = ['o', 'Ko', 'Mo', 'Go'];
    for (const unit of units) {
        if (n < 1024)
            return unit === 'o' ? `${Math.round(n)} ${unit}` : `${n.toFixed(1)} ${unit}`;
        n /= 1024;
    }
    return `${n.toFixed(1)} To`;
}

export function makeBar(fraction, width = 12) {
    const clamped = Math.max(0, Math.min(1, fraction));
    const filled = Math.round(clamped * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// Reads /proc/mounts and returns the list of "real" volumes (internal
// and external), excluding virtual/technical filesystems.
export function getRealMounts() {
    let contents;
    try {
        [, contents] = GLib.file_get_contents('/proc/mounts');
    } catch (e) {
        return [];
    }

    const text = new TextDecoder('utf-8').decode(contents);
    const mounts = new Map();

    for (const line of text.split('\n')) {
        if (!line.trim())
            continue;

        const parts = line.split(' ');
        if (parts.length < 3)
            continue;

        const device = parts[0];
        const mountpoint = unescapeMountPath(parts[1]);
        const fstype = parts[2];

        if (EXCLUDED_FS_TYPES.has(fstype))
            continue;
        if (EXCLUDED_PATH_PREFIXES.some(p => mountpoint.startsWith(p)))
            continue;

        const isNetworkFs = ['nfs', 'nfs4', 'cifs', 'smb3', 'smbfs'].includes(fstype);
        if (!device.startsWith('/dev/') && !isNetworkFs && !fstype.startsWith('fuse'))
            continue;

        // In case of stacked mounts at the same location, keep the last
        // one (same behaviour as the `df` command).
        mounts.set(mountpoint, {device, fstype});
    }

    return Array.from(mounts.keys())
        .sort()
        .map(mountpoint => ({mountpoint, ...mounts.get(mountpoint)}));
}

// Maps each mountpoint to the name Nautilus displays for that volume
// (mount.get_name() — this is exactly what Nautilus uses in its
// sidebar and "Other Locations").
export function getNautilusNamesByPath() {
    const map = new Map();
    for (const mount of Gio.VolumeMonitor.get().get_mounts()) {
        const root = mount.get_root();
        const path = root ? root.get_path() : null;
        if (path)
            map.set(path, mount.get_name());
    }
    return map;
}

// "Nautilus-style" name for a given mountpoint, falling back to the
// folder name if no Gio.Mount matches.
export function displayNameFor(mountpoint, namesByPath) {
    return namesByPath.get(mountpoint)
        || (mountpoint === '/' ? 'Système de fichiers racine' : GLib.path_get_basename(mountpoint));
}
