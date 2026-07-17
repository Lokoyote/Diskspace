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
    getRealMounts, getMountNames, displayNameFor, formatSize, makeBar,
} from './mounts.js';

const REFRESH_SECONDS = 30;

// One row in the popup menu: volume name, usage info below it.
const VolumeRow = GObject.registerClass(
class VolumeRow extends PopupMenu.PopupBaseMenuItem {
    constructor(name) {
        super({
            reactive: false,
            can_focus: false,
        });

        this._box = new St.BoxLayout({vertical: true, x_expand: true});

        this._nameLabel = new St.Label({text: name,
            style: 'color: #202020; font-weight: bold;',
        });
        this._infoLabel = new St.Label({
            text: 'Calculating…',
            style: 'font-family: monospace; font-size: 90%; opacity: 1;',
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
        super(0.0, 'Disk space', false);

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
        this._panelMountpoint = '/';
        this._timeoutId = null;
        this._cancellable = new Gio.Cancellable();

        this._volumeMonitor = Gio.VolumeMonitor.get();
        this._monitorIds = [
            this._volumeMonitor.connect('mount-added', () => this._rebuild()),
            this._volumeMonitor.connect('mount-removed', () => this._rebuild()),
            this._volumeMonitor.connect('mount-changed', () => this._rebuild()),
        ];

        this._settingsIds = [
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
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, REFRESH_SECONDS, () => {
                this._rebuild();
                return GLib.SOURCE_CONTINUE;
            });
    }

    _stopTimer() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
    }

    // Which mountpoint to show in the panel: the one picked in the preferences, or / if it's not mounted anymore.
    _pickPanelMountpoint(mounts) {
        const selected = this._settings.get_string('selected-mountpoint');
        if (selected && mounts.some(m => m.mountpoint === selected))
            return selected;
        return '/';
    }

    _rebuild() {
        const mounts = getRealMounts();
        const names = getMountNames();

        this._panelMountpoint = this._pickPanelMountpoint(mounts);

        this.menu.removeAll();
        this._rows.clear();

        if (mounts.length === 0) {
            this.menu.addMenuItem(
                new PopupMenu.PopupMenuItem('No volume detected', {reactive: false}));
            this._label.text = '…';
            return;
        }

        for (const {mountpoint} of mounts) {
            const name = displayNameFor(mountpoint, names);
            const row = new VolumeRow(name);
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
                        const ratio = used / total;
                        text = `${makeBar(ratio)}  ${formatSize(used)} / ${formatSize(total)} (${Math.round(ratio * 100)} %)`;

                        if (mountpoint === this._panelMountpoint)
                            this._updatePanelLabel(ratio);
                    } else {
                        text = 'Info unavailable';
                    }
                } catch (e) {
                    text = 'Info unavailable';
                }

                // Row might be gone already if a rebuild happened meanwhile.
                if (this._rows.get(mountpoint) === row)
                    row.setInfo(text);
            });
    }

    _updatePanelLabel(ratio) {
        const pct = Math.round(ratio * 100);
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

        this._settingsIds.forEach(id => this._settings.disconnect(id));
        this._settingsIds = [];

        this._monitorIds.forEach(id => this._volumeMonitor.disconnect(id));
        this._monitorIds = [];

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
