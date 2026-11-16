#!/bin/sh
# macOS-style dock: bottom, centered, transparent, zoom on hover.
K=/net/launchpad/plank/docks/dock1
dconf write $K/position "'bottom'"
dconf write $K/alignment "'center'"
dconf write $K/theme "'Transparent'"
dconf write $K/icon-size 44
dconf write $K/zoom-enabled true
dconf write $K/zoom-percent 140
dconf write $K/hide-mode "'none'"
dconf write $K/lock-items true
dconf write $K/dock-items "['firefox.dockitem', 'thunderbird.dockitem', '1password.dockitem', 'code.dockitem', 'terminal.dockitem', 'files.dockitem']"
exec plank
