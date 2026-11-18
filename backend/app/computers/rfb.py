"""Watch-only RFB (VNC): pass the handshake and the screen requests, drop every input message.

A viewer that may only watch still has to speak RFB to get pictures, so its stream cannot simply
be cut: the client-to-server direction is parsed message by message (RFC 6143 plus the extensions
noVNC sends) and only what asks for pixels goes through. Keys, pointer moves, clipboard text,
remote resizes, power actions (xvp) and QEMU key events are dropped. Anything this parser does not
understand ends the connection, so an unknown message can never carry input to the desktop.

The server-to-client direction is only read, never changed: with protocol 3.3 the server, not the
client, picks the security type, and the client's next bytes depend on it.
"""

import struct

MAX_CUT_TEXT = 10 * 1024 * 1024  # a clipboard message is skipped, never buffered; this bounds one

# Client-to-server messages that ask for pixels or describe the client: (type, fixed size or None).
SET_PIXEL_FORMAT = 0
SET_ENCODINGS = 2
FRAMEBUFFER_UPDATE_REQUEST = 3
KEY_EVENT = 4
POINTER_EVENT = 5
CLIENT_CUT_TEXT = 6
ENABLE_CONTINUOUS_UPDATES = 150
FENCE = 248
XVP = 250
SET_DESKTOP_SIZE = 251
QEMU = 255

INPUT_MESSAGES = frozenset({KEY_EVENT, POINTER_EVENT, CLIENT_CUT_TEXT, XVP, SET_DESKTOP_SIZE, QEMU})

SECURITY_NONE = 1
SECURITY_VNC_AUTH = 2


class RfbFilterError(Exception):
    """The stream is not something the watch-only filter can safely pass: close the connection."""


def _version_minor(data: bytes) -> int:
    if len(data) != 12 or not data.startswith(b"RFB ") or data[7:8] != b"." or data[11:12] != b"\n":
        raise RfbFilterError("not an RFB protocol version")
    try:
        major, minor = int(data[4:7]), int(data[8:11])
    except ValueError:
        raise RfbFilterError("not an RFB protocol version") from None
    if major != 3:
        raise RfbFilterError("unsupported RFB version")
    return minor


class ViewOnlyFilter:
    """Feed it each chunk the viewer sends (`client`) and each chunk the desktop sends (`server`).
    `client` returns the bytes that may be forwarded to the desktop; it may be empty."""

    def __init__(self) -> None:
        self._state = "version"
        self._buffer = bytearray()
        self._skip = 0  # bytes of a dropped message still to come
        self._minor: int | None = None  # the version the client chose
        self._server_buffer = bytearray()
        self._server_state = "version"
        self.dropped = 0  # input messages dropped, for tests and logs

    # ------------------------------------------------------------------ server side

    def server(self, data: bytes) -> None:
        if self._server_state == "done" or not data:
            return
        self._server_buffer.extend(data)
        self._advance_server()

    def _advance_server(self) -> None:
        if self._server_state == "version":
            if len(self._server_buffer) < 12:
                return
            _version_minor(bytes(self._server_buffer[:12]))
            del self._server_buffer[:12]
            self._server_state = "security"
        if self._server_state == "security":
            if self._minor is None:
                return  # read again once the client has chosen its version
            if self._minor >= 7:
                self._server_state = "done"  # the client names the type itself
                self._server_buffer.clear()
                return
            if len(self._server_buffer) < 4:
                return
            (kind,) = struct.unpack(">I", bytes(self._server_buffer[:4]))
            self._server_state = "done"
            self._server_buffer.clear()
            if self._state != "await_server_security":
                raise RfbFilterError("unexpected security step")
            self._after_security(kind)

    # ------------------------------------------------------------------ client side

    def client(self, data: bytes) -> bytes:
        out = bytearray()
        pending = bytes(data)
        while pending:
            if self._skip:
                step = min(self._skip, len(pending))
                self._skip -= step
                pending = pending[step:]
                continue
            self._buffer.extend(pending)
            pending = b""
            while not self._skip and self._take(out):
                pass
            if self._skip and self._buffer:
                # A dropped clipboard message: what is buffered beyond its header belongs to it first.
                pending = bytes(self._buffer)
                self._buffer.clear()
        return bytes(out)

    def _after_security(self, kind: int) -> None:
        if kind == SECURITY_NONE:
            self._state = "client_init"
        elif kind == SECURITY_VNC_AUTH:
            self._state = "vnc_auth"
        else:
            raise RfbFilterError("unsupported security type for watching")

    def _take(self, out: bytearray) -> bool | None:
        """Consume one unit from the buffer. None when more bytes are needed."""
        buffer = self._buffer
        state = self._state
        if state == "version":
            if len(buffer) < 12:
                return None
            minor = _version_minor(bytes(buffer[:12]))
            if minor not in (3, 7, 8):
                raise RfbFilterError("unsupported RFB version")
            self._minor = minor
            self._forward(out, 12)
            self._state = "security_choice" if minor >= 7 else "await_server_security"
            self._advance_server()
            return True
        if state == "await_server_security":
            if buffer:
                raise RfbFilterError("client spoke before the server chose security")
            return None
        if state == "security_choice":
            if len(buffer) < 1:
                return None
            kind = buffer[0]
            self._forward(out, 1)
            self._after_security(kind)
            return True
        if state == "vnc_auth":
            if len(buffer) < 16:
                return None
            self._forward(out, 16)
            self._state = "client_init"
            return True
        if state == "client_init":
            if len(buffer) < 1:
                return None
            self._forward(out, 1)
            self._state = "messages"
            return True
        return self._message(out)

    def _message(self, out: bytearray) -> bool | None:
        buffer = self._buffer
        if not buffer:
            return None
        kind = buffer[0]
        if kind == SET_PIXEL_FORMAT:
            return self._fixed(out, 20, keep=True)
        if kind == SET_ENCODINGS:
            if len(buffer) < 4:
                return None
            (count,) = struct.unpack(">H", bytes(buffer[2:4]))
            return self._fixed(out, 4 + 4 * count, keep=True)
        if kind == FRAMEBUFFER_UPDATE_REQUEST:
            return self._fixed(out, 10, keep=True)
        if kind == ENABLE_CONTINUOUS_UPDATES:
            return self._fixed(out, 10, keep=True)
        if kind == FENCE:
            if len(buffer) < 9:
                return None
            return self._fixed(out, 9 + buffer[8], keep=True)
        if kind == KEY_EVENT:
            return self._fixed(out, 8, keep=False)
        if kind == POINTER_EVENT:
            return self._fixed(out, 6, keep=False)
        if kind == XVP:
            return self._fixed(out, 4, keep=False)
        if kind == SET_DESKTOP_SIZE:
            if len(buffer) < 8:
                return None
            return self._fixed(out, 8 + 16 * buffer[6], keep=False)
        if kind == QEMU:
            if len(buffer) < 2:
                return None
            if buffer[1] != 0:  # only the extended key event (sub-message 0) has a size this parser knows
                raise RfbFilterError("unsupported QEMU message")
            return self._fixed(out, 12, keep=False)
        if kind == CLIENT_CUT_TEXT:
            if len(buffer) < 8:
                return None
            (length,) = struct.unpack(">i", bytes(buffer[4:8]))
            length = abs(length)  # negative: the extended clipboard format, same size rule
            if length > MAX_CUT_TEXT:
                raise RfbFilterError("clipboard message too large")
            del buffer[:8]
            self.dropped += 1
            self._skip = length
            return True
        raise RfbFilterError(f"unknown RFB client message {kind}")

    def _fixed(self, out: bytearray, size: int, *, keep: bool) -> bool | None:
        if len(self._buffer) < size:
            return None
        if keep:
            self._forward(out, size)
        else:
            del self._buffer[:size]
            self.dropped += 1
        return True

    def _forward(self, out: bytearray, size: int) -> None:
        out.extend(self._buffer[:size])
        del self._buffer[:size]
