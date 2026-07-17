// shared by extension.js and prefs.js

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// fake filesystems, no real volume behind them
export const IGNORED_FS_TYPES = new Set([
    'proc', 'sysfs', 'tmpfs', 'devtmpfs', 'devpts', 'cgroup', 'cgroup2',
    'pstore', 'bpf', 'tracefs', 'debugfs', 'mqueue', 'hugetlbfs', 'autofs',
    'binfmt_misc', 'configfs', 'securityfs', 'fusectl', 'overlay',
    'squashfs', 'ramfs', 'efivarfs', 'rpc_pipefs', 'nsfs',
    'fuse.gvfsd-fuse', 'fuse.portal', 'fuse.gvfs-fuse-daemon',
]);

// system/container noise, skip these mountpoints (keep /media and /run/media though, that's usually where USB drives land)
export const IGNORED_PREFIXES = [
    '/snap/', '/var/lib/docker/', '/var/lib/containers/',
    '/run/user/', '/run/lock', '/run/snapd/', '/run/credentials/',
    '/sys/', '/proc/', '/dev/',
];

export function unescapePath(str) {
    return str
        .replace(/\\040/g, ' ')
        .replace(/\\011/g, '\t')
        .replace(/\\012/g, '\n')
        .replace(/\\134/g, '\\');
}

export function formatSize(bytes) {
    let n = bytes;
    const units = ['B', 'KB', 'MB', 'GB'];
    for (const unit of units) {
        if (n < 1024)
            return unit === 'B' ? `${Math.round(n)} ${unit}` : `${n.toFixed(1)} ${unit}`;
        n /= 1024;
    }
    return `${n.toFixed(1)} TB`;
}

export function makeBar(ratio, width = 12) {
    const clamped = Math.max(0, Math.min(1, ratio));
    const filled = Math.round(clamped * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// Reads /proc/mounts, returns real volumes (internal + external), skipping virtual/technical filesystems.
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
        const mountpoint = unescapePath(parts[1]);
        const fstype = parts[2];

        if (IGNORED_FS_TYPES.has(fstype))
            continue;
        if (IGNORED_PREFIXES.some(p => mountpoint.startsWith(p)))
            continue;

        const isNetwork = ['nfs', 'nfs4', 'cifs', 'smb3', 'smbfs'].includes(fstype);
        if (!device.startsWith('/dev/') && !isNetwork && !fstype.startsWith('fuse'))
            continue;

        // Stacked mounts at the same spot: keep the last one, same as df.
        mounts.set(mountpoint, {device, fstype});
    }

    return Array.from(mounts.keys())
        .sort()
        .map(mountpoint => ({mountpoint, ...mounts.get(mountpoint)}));
}

// mountpoint -> name Nautilus shows for that volume
export function getMountNames() {
    const map = new Map();
    for (const mount of Gio.VolumeMonitor.get().get_mounts()) {
        const root = mount.get_root();
        const path = root ? root.get_path() : null;
        if (path)
            map.set(path, mount.get_name());
    }
    return map;
}

// Falls back to the folder name if Nautilus doesn't know this mount.
export function displayNameFor(mountpoint, names) {
    return names.get(mountpoint)
        || (mountpoint === '/' ? 'Root filesystem' : GLib.path_get_basename(mountpoint));
}
