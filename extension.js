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
    getRealMounts, getMountNames, displayNameFor, formatSize, makeBar, readBarColor,
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

        // The usage line is split in several labels instead of one Pango
        // markup string: a CSS color on each label is reliably applied by
        // the shell, whereas markup colors get overridden by the St style.
        this._infoBox = new St.BoxLayout();
        this._barLabel = this._makeInfoLabel();
        this._sizeLabel = this._makeInfoLabel();
        this._pctLabel = this._makeInfoLabel();
        this._closeLabel = this._makeInfoLabel();
        for (const label of [this._barLabel, this._sizeLabel, this._pctLabel, this._closeLabel])
            this._infoBox.add_child(label);

        this._sizeLabel.text = 'Calculating…';

        this._box.add_child(this._nameLabel);
        this._box.add_child(this._infoBox);
        this.add_child(this._box);
    }

    _makeInfoLabel() {
        return new St.Label({
            text: '',
            style: 'font-family: monospace; font-size: 90%;',
        });
    }

    // color: '#rrggbb' or null to follow the theme. alert: usage is critical.
    setInfo({bar = '', size, pct = '', alert = false}, color) {
        const base = 'font-family: monospace; font-size: 90%;';
        const colorStyle = color ? ` color: ${color};` : '';

        this._barLabel.text = bar ? `${bar}  ` : '';
        this._sizeLabel.text = pct ? `${size} (` : size;
        this._pctLabel.text = pct;
        this._closeLabel.text = pct ? ')' : '';

        this._barLabel.style = base + colorStyle;
        this._sizeLabel.style = base + colorStyle;
        this._closeLabel.style = base + colorStyle;
        this._pctLabel.style = alert
            ? `${base} color: #e01b24; font-weight: bold;`
            : `${base} font-weight: bold;${colorStyle}`;
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
        this._volumeMonitor.connectObject(
            'mount-added', () => this._rebuild(),
            'mount-removed', () => this._rebuild(),
            'mount-changed', () => this._rebuild(),
            this);

        this._settings.connectObject(
            'changed::selected-mountpoint', () => this._rebuild(),
            'changed::bar-color', () => this._rebuild(),
            this);

        this.menu.connectObject('open-state-changed', (menu, open) => {
            if (open)
                this._rebuild();
        }, this);

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

    _getBarColor() {
        try {
            return readBarColor(this._settings);
        } catch (e) {
            return null;
        }
    }

    // Which mountpoint to show in the panel: the one picked in the preferences, or / if it's not mounted anymore.
    _pickPanelMountpoint(mounts) {
        const selected = this._settings.get_string('selected-mountpoint');
        if (selected && mounts.some(m => m.mountpoint === selected))
            return selected;
        return '/';
    }

    async _rebuild() {
        const mounts = await getRealMounts();
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
                let parts;
                try {
                    const info = source.query_filesystem_info_finish(result);
                    const total = info.get_attribute_uint64('filesystem::size');
                    const free = info.get_attribute_uint64('filesystem::free');
                    if (total > 0) {
                        const used = total - free;
                        const ratio = used / total;
                        const pct = Math.round(ratio * 100);
                        parts = {
                            bar: makeBar(ratio),
                            size: `${formatSize(used)} / ${formatSize(total)}`,
                            pct: `${pct} %`,
                            alert: pct >= 90,
                        };

                        if (mountpoint === this._panelMountpoint)
                            this._updatePanelLabel(ratio);
                    } else {
                        parts = {size: 'Info unavailable'};
                    }
                } catch (e) {
                    parts = {size: 'Info unavailable'};
                }

                // Row might be gone already if a rebuild happened meanwhile.
                if (this._rows.get(mountpoint) === row)
                    row.setInfo(parts, this._getBarColor());
            });
    }

    _updatePanelLabel(ratio) {
        const pct = Math.round(ratio * 100);
        this._label.text = `${pct} %`;
        // The custom bar color intentionally doesn't apply here: the panel
        // text keeps following the shell theme.
        this._label.style = pct >= 90
            ? 'padding-left: 4px; color: #e01b24; font-weight: bold;'
            : 'padding-left: 4px;';
    }

    destroy() {
        this._stopTimer();
        this._cancellable.cancel();

        this._volumeMonitor?.disconnectObject(this);
        this.menu?.disconnectObject(this);
        this._settings?.disconnectObject(this);

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
