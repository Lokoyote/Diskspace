import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {getRealMounts, getNautilusNamesByPath, displayNameFor} from './mounts.js';

export default class DiskSpacePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Général',
            icon_name: 'drive-harddisk-symbolic',
        });
        window.add(page);

        this._buildPanelVolumeGroup(page, settings);
    }

    _buildPanelVolumeGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Indicateur du panel',
            description: 'Choisir le volume dont le pourcentage d\u2019occupation '
                + 'est affiché en permanence dans le panel.',
        });
        page.add(group);

        // "Automatique" corresponds to an empty value in the settings:
        // the extension then falls back to the system disk (/).
        const mountpoints = [''];
        const stringList = new Gtk.StringList();
        stringList.append('Automatique (disque système)');

        const mounts = getRealMounts();
        const namesByPath = getNautilusNamesByPath();

        for (const {mountpoint} of mounts) {
            const name = displayNameFor(mountpoint, namesByPath);
            stringList.append(`${name}  —  ${mountpoint}`);
            mountpoints.push(mountpoint);
        }

        // If the currently saved volume is no longer mounted (e.g. a USB
        // drive that got unplugged), add it to the list anyway so we
        // don't silently overwrite the user's preference.
        const current = settings.get_string('selected-mountpoint');
        if (current && !mountpoints.includes(current)) {
            stringList.append(`${GLib.path_get_basename(current)}  —  ${current}  (non connecté)`);
            mountpoints.push(current);
        }

        const row = new Adw.ComboRow({
            title: 'Volume affiché',
            subtitle: 'Le pourcentage de ce volume s\u2019affiche en permanence dans le panel',
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
