# Third-party notices

UFI Sync Node downloads and runs Syncthing as its synchronization engine. Syncthing is
copyright The Syncthing Authors and is distributed under the Mozilla Public
License 2.0 (MPL-2.0).

- Upstream project: https://github.com/syncthing/syncthing
- License: https://github.com/syncthing/syncthing/blob/v1.30.0/LICENSE
- Pinned release: Syncthing v1.30.0, Linux ARM64

The installer preserves the `LICENSE` file shipped in the verified Syncthing
release archive at `ufisync/licenses/Syncthing-MPL-2.0.txt` on the device. For an
older installation that already has the kernel but lacks this file, the installer
can restore the complete upstream license from an embedded, SHA256-pinned copy.

This notice covers Syncthing only. When this directory is accepted into the UFI-TOOLS
repository, the plugin contribution is distributed under that repository's MIT License.
If the plugin is later distributed as a separate repository or standalone download,
add an independent license file before publishing that artifact.
