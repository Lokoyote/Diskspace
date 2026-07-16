import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    getRealMounts, getNautilusNamesByPath, displayNameFor, formatSize, makeBar,
} from './mounts.js';

// Continuous automatic refresh (the indicator is always visible, not
// just while the menu is open).
const REFRESH_INTERVAL_SECONDS = 30;

// One menu row: volume name + bar/values on a second line.
const DiskSpaceRow = GObject.registerClass(
class DiskSpaceRow extends PopupMenu.PopupBaseMenuItem {
    constructor(name) {
        super({
            reactive: false,
            can_focus: false,
        });

        this._box = new St.BoxLayout({vertical: true, x_expand: true});

        this._nameLabel = new St.Label({text: name});
        this._infoLabel = new St.Label({
            text: 'Calcul en cours…',
            style: 'font-family: monospace; font-size: 90%; opacity: 0.75;',
        });

        this._box.add_child(this._nameLabel);
        this._box.add_child(this._infoLabel);
        this.add_child(this._box);
    }

    setInfo(text) {
        this._infoLabel.text = text;
    }
});

const DiskSpaceIndicator = GObject.registerClass(
class DiskSpaceIndicator extends PanelMenu.Button {
    constructor(settings) {
        super(0.0, 'Espace disque', false);

        this._settings = settings;

        this._box = new St.BoxLayout({style_class: 'panel-status-menu-box'});
        this._icon = new St.Icon({
            icon_name: 'drive-harddisk-symbolic',
            style_class: 'system-status-icon',
        });
        this._label = new St.Label({
            text: '…',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style: 'padding-left: 4px;',
        });
        this._box.add_child(this._icon);
        this._box.add_child(this._label);
        this.add_child(this._box);

        this._rows = new Map();
        this._targetMountpoint = '/';
        this._refreshTimeoutId = null;
        this._cancellable = new Gio.Cancellable();

        this._volumeMonitor = Gio.VolumeMonitor.get();
        this._monitorSignalIds = [
            this._volumeMonitor.connect('mount-added', () => this._rebuild()),
            this._volumeMonitor.connect('mount-removed', () => this._rebuild()),
            this._volumeMonitor.connect('mount-changed', () => this._rebuild()),
        ];

        this._settingsSignalIds = [
            this._settings.connect('changed::selected-mountpoint', () => this._rebuild()),
        ];

        this._openStateId = this.menu.connect('open-state-changed', (menu, open) => {
            if (open)
                this._rebuild();
        });

        this._rebuild();
        this._startTimer();
    }

    _startTimer() {
        this._stopTimer();
        this._refreshTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, REFRESH_INTERVAL_SECONDS, () => {
                this._rebuild();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _stopTimer() {
        if (this._refreshTimeoutId) {
            GLib.source_remove(this._refreshTimeoutId);
            this._refreshTimeoutId = null;
        }
    }

    // Determines which mountpoint feeds the permanent panel percentage:
    // the one chosen in the preferences if still mounted, otherwise
    // automatic fallback to the system disk (/).
    _resolveTarget(mounts) {
        const selected = this._settings.get_string('selected-mountpoint');
        if (selected && mounts.some(m => m.mountpoint === selected))
            return selected;
        return '/';
    }

    _rebuild() {
        const mounts = getRealMounts();
        const namesByPath = getNautilusNamesByPath();

        this._targetMountpoint = this._resolveTarget(mounts);

        this.menu.removeAll();
        this._rows.clear();

        if (mounts.length === 0) {
            this.menu.addMenuItem(
                new PopupMenu.PopupMenuItem('Aucun volume détecté', {reactive: false}));
            this._label.text = '…';
            return;
        }

        for (const {mountpoint} of mounts) {
            const name = displayNameFor(mountpoint, namesByPath);
            const row = new DiskSpaceRow(name);
            this.menu.addMenuItem(row);
            this._rows.set(mountpoint, row);
            this._queryMount(mountpoint, row);
        }
    }

    _queryMount(mountpoint, row) {
        const gfile = Gio.File.new_for_path(mountpoint);
        gfile.query_filesystem_info_async(
            'filesystem::size,filesystem::free', GLib.PRIORITY_DEFAULT,
            this._cancellable, (source, result) => {
                let text;
                try {
                    const info = source.query_filesystem_info_finish(result);
                    const total = info.get_attribute_uint64('filesystem::size');
                    const free = info.get_attribute_uint64('filesystem::free');
                    if (total > 0) {
                        const used = total - free;
                        const fraction = used / total;
                        text = `${makeBar(fraction)}  ${formatSize(used)} / ${formatSize(total)} (${Math.round(fraction * 100)} %)`;

                        if (mountpoint === this._targetMountpoint)
                            this._updatePanelLabel(fraction);
                    } else {
                        text = 'Information indisponible';
                    }
                } catch (e) {
                    text = 'Information indisponible';
                }

                // The row may have been replaced by a _rebuild() in the meantime.
                if (this._rows.get(mountpoint) === row)
                    row.setInfo(text);
            });
    }

    _updatePanelLabel(fraction) {
        const pct = Math.round(fraction * 100);
        this._label.text = `${pct} %`;
        this._label.style = pct >= 90
            ? 'padding-left: 4px; color: #e01b24; font-weight: bold;'
            : 'padding-left: 4px;';
    }

    destroy() {
        this._stopTimer();
        this._cancellable.cancel();

        if (this._openStateId) {
            this.menu.disconnect(this._openStateId);
            this._openStateId = null;
        }

        this._settingsSignalIds.forEach(id => this._settings.disconnect(id));
        this._settingsSignalIds = [];

        this._monitorSignalIds.forEach(id => this._volumeMonitor.disconnect(id));
        this._monitorSignalIds = [];

        super.destroy();
    }
});

export default class DiskSpaceExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new DiskSpaceIndicator(this._settings);
        Main.panel.addToStatusArea('diskspace-indicator', this._indicator, 1, 'right');
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
