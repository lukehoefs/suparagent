#!/bin/sh
# macOS-style dock: bottom, centered, rounded Gtk+ background.
K=/net/launchpad/plank/docks/dock1
dconf write $K/position "'bottom'"
dconf write $K/alignment "'center'"
dconf write $K/theme "'Gtk+'"
dconf write $K/icon-size 44
# Zoom needs a tall transparent window; without a compositor (VNC) that shows as a grey band.
dconf write $K/zoom-enabled false
dconf write $K/hide-mode "'none'"
dconf write $K/lock-items true
dconf write $K/dock-items "['firefox.dockitem', 'thunderbird.dockitem', '1password.dockitem', 'code.dockitem', 'terminal.dockitem', 'files.dockitem']"
exec plank
