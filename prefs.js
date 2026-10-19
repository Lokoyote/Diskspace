import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {getRealMounts, getMountNames, displayNameFor, readBarColor} from './mounts.js';

export default class DiskSpacePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'drive-harddisk-symbolic',
        });
        window.add(page);

        this._buildVolumeGroup(page, settings);
        this._buildAppearanceGroup(page, settings);
    }

    _buildAppearanceGroup(page, settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Appearance',
        });
        page.add(group);

        const row = new Adw.ActionRow({
            title: 'Bar and text color',
            subtitle: 'Color of the progress bar and its usage text',
        });
        group.add(row);

        const colorButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: false}),
            valign: Gtk.Align.CENTER,
        });
        const resetButton = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            tooltip_text: 'Use the theme color',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        row.add_suffix(resetButton);
        row.add_suffix(colorButton);

        const toHex = rgba => '#' + [rgba.red, rgba.green, rgba.blue]
            .map(v => Math.round(v * 255).toString(16).padStart(2, '0'))
            .join('');

        // Reflect the saved value in the widgets; empty = follow the theme.
        let syncing = false;
        const sync = () => {
            const value = readBarColor(settings);
            const rgba = new Gdk.RGBA();
            const isSet = value !== null && rgba.parse(value);

            syncing = true;
            if (!isSet)
                rgba.parse('#3584e4'); // starting point for the picker
            colorButton.rgba = rgba;
            syncing = false;

            resetButton.sensitive = !!isSet;
            row.subtitle = isSet
                ? `Custom color (${value})`
                : 'Following the theme (pick a color to override it)';
        };

        // Old compiled schema without the key: show a hint instead of crashing.
        if (!settings.settings_schema.has_key('bar-color')) {
            row.subtitle = 'Schema out of date: run glib-compile-schemas on the schemas folder, then log out and back in';
            row.sensitive = false;
            return;
        }

        colorButton.connect('notify::rgba', () => {
            if (syncing)
                return;
            settings.set_string('bar-color', toHex(colorButton.rgba));
        });
        resetButton.connect('clicked', () => settings.set_string('bar-color', ''));
        settings.connect('changed::bar-color', sync);

        sync();
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

        const row = new Adw.ComboRow({
            title: 'Displayed volume',
            subtitle: 'This volume\u2019s usage percentage stays shown in the panel',
            model: stringList,
            expression: new Gtk.PropertyExpression(Gtk.StringObject, null, 'string'),
        });
        group.add(row);

        row.connect('notify::selected', () => {
            settings.set_string('selected-mountpoint', mountpoints[row.selected] ?? '');
        });

        getRealMounts().then(mounts => {
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

            const currentIndex = mountpoints.indexOf(current);
            row.selected = currentIndex >= 0 ? currentIndex : 0;
        });
    }
}
