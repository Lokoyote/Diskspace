import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {getRealMounts, getMountNames, displayNameFor} from './mounts.js';

export default class DiskSpacePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'drive-harddisk-symbolic',
        });
        window.add(page);

        this._buildVolumeGroup(page, settings);
    }

    _buildVolumeGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Panel indicator',
            description: 'Choose which volume\u2019s usage percentage stays shown in the panel.',
        });
        page.add(group);

        // Empty value = automatic, falls back to the system disk (/).
        const mountpoints = [''];
        const stringList = new Gtk.StringList();
        stringList.append('Automatic (system disk)');

        const mounts = getRealMounts();
        const names = getMountNames();

        for (const {mountpoint} of mounts) {
            const name = displayNameFor(mountpoint, names);
            stringList.append(`${name} (${mountpoint})`);
            mountpoints.push(mountpoint);
        }

        // Keep the saved volume in the list even if it got unplugged
        // (e.g. a USB drive), so we don't silently overwrite the setting.
        const current = settings.get_string('selected-mountpoint');
        if (current && !mountpoints.includes(current)) {
            stringList.append(`${GLib.path_get_basename(current)} (${current}, not connected)`);
            mountpoints.push(current);
        }

        const row = new Adw.ComboRow({
            title: 'Displayed volume',
            subtitle: 'This volume\u2019s usage percentage stays shown in the panel',
            model: stringList,
            expression: new Gtk.PropertyExpression(Gtk.StringObject, null, 'string'),
        });

        const currentIndex = mountpoints.indexOf(current);
        row.selected = currentIndex >= 0 ? currentIndex : 0;

        row.connect('notify::selected', () => {
            settings.set_string('selected-mountpoint', mountpoints[row.selected] ?? '');
        });

        group.add(row);
    }
}
