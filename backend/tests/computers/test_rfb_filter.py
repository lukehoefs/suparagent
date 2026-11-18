"""Watch-only RFB: the handshake and screen requests pass, every input message is dropped, and
anything the filter cannot parse ends the stream instead of reaching the desktop."""
import struct

import pytest

from app.computers.rfb import RfbFilterError, ViewOnlyFilter

V38 = b"RFB 003.008\n"
V33 = b"RFB 003.003\n"

SET_PIXEL_FORMAT = bytes([0, 0, 0, 0]) + bytes(16)
SET_ENCODINGS = struct.pack(">BBH", 2, 0, 3) + struct.pack(">iii", 0, 1, -223)
UPDATE_REQUEST = struct.pack(">BBHHHH", 3, 1, 0, 0, 1280, 960)
CONTINUOUS = struct.pack(">BBHHHH", 150, 1, 0, 0, 1280, 960)
FENCE = struct.pack(">BxxxIB", 248, 0x80000000, 3) + b"abc"

KEY = struct.pack(">BBxxI", 4, 1, 0x61)
POINTER = struct.pack(">BBHH", 5, 1, 100, 200)
CUT = struct.pack(">Bxxxi", 6, 5) + b"hello"
EXTENDED_CUT = struct.pack(">Bxxxi", 6, -8) + b"\x00" * 8
XVP = struct.pack(">BxBB", 250, 1, 2)  # shut down
DESKTOP_SIZE = struct.pack(">BxHHBx", 251, 800, 600, 1) + bytes(16)
QEMU_KEY = struct.pack(">BBHII", 255, 0, 1, 0x61, 30)


def ready(minor=8) -> ViewOnlyFilter:
    """A filter past the handshake (no security), with the handshake bytes checked on the way."""
    rfb = ViewOnlyFilter()
    if minor == 8:
        rfb.server(V38)
        assert rfb.client(V38) == V38
        rfb.server(b"\x01\x01")  # one type offered: None
        assert rfb.client(b"\x01") == b"\x01"
    else:
        rfb.server(V33)
        assert rfb.client(V33) == V33
        rfb.server(struct.pack(">I", 1))
    assert rfb.client(b"\x01") == b"\x01"  # ClientInit (shared)
    return rfb


def test_screen_requests_pass_through_unchanged():
    rfb = ready()
    allowed = SET_PIXEL_FORMAT + SET_ENCODINGS + UPDATE_REQUEST + CONTINUOUS + FENCE
    assert rfb.client(allowed) == allowed
    assert rfb.dropped == 0


@pytest.mark.parametrize("message", [KEY, POINTER, CUT, EXTENDED_CUT, XVP, DESKTOP_SIZE, QEMU_KEY],
                         ids=["key", "pointer", "clipboard", "extended-clipboard", "xvp", "resize", "qemu-key"])
def test_every_input_message_is_dropped(message):
    rfb = ready()
    assert rfb.client(UPDATE_REQUEST + message + UPDATE_REQUEST) == UPDATE_REQUEST + UPDATE_REQUEST
    assert rfb.dropped == 1


def test_messages_split_at_any_byte_give_the_same_result():
    stream = KEY + UPDATE_REQUEST + CUT + SET_ENCODINGS + POINTER + EXTENDED_CUT + FENCE + QEMU_KEY + UPDATE_REQUEST
    expected = UPDATE_REQUEST + SET_ENCODINGS + FENCE + UPDATE_REQUEST
    rfb = ready()
    out = b"".join(rfb.client(stream[i:i + 1]) for i in range(len(stream)))
    assert out == expected and rfb.dropped == 5
    for cut in range(1, len(stream)):
        rfb = ready()
        assert rfb.client(stream[:cut]) + rfb.client(stream[cut:]) == expected


def test_protocol_3_3_waits_for_the_servers_security_choice():
    rfb = ViewOnlyFilter()
    rfb.server(V33)
    assert rfb.client(V33) == V33
    with pytest.raises(RfbFilterError):
        rfb.client(b"\x01")  # the client may not speak before the server picked the security type


def test_vnc_authentication_is_passed_and_the_viewer_still_cannot_type():
    rfb = ViewOnlyFilter()
    rfb.server(V38 + b"\x01\x02")
    response = bytes(range(16))
    assert rfb.client(V38 + b"\x02" + response + b"\x01") == V38 + b"\x02" + response + b"\x01"
    assert rfb.client(KEY + UPDATE_REQUEST) == UPDATE_REQUEST


def test_protocol_3_3_with_vnc_authentication():
    rfb = ViewOnlyFilter()
    rfb.server(V33)
    rfb.client(V33)
    rfb.server(struct.pack(">I", 2) + bytes(16))  # type, then the challenge
    assert rfb.client(bytes(16) + b"\x01" + POINTER) == bytes(16) + b"\x01"


@pytest.mark.parametrize("security", [16, 19, 30])
def test_a_security_type_the_filter_cannot_follow_ends_the_stream(security):
    rfb = ViewOnlyFilter()
    rfb.server(V38)
    rfb.client(V38)
    with pytest.raises(RfbFilterError):
        rfb.client(bytes([security]))


@pytest.mark.parametrize("message", [bytes([7, 0, 0, 0]), bytes([253, 0, 0, 0]), bytes([255, 1, 0, 0])],
                         ids=["unknown", "gii", "qemu-audio"])
def test_an_unknown_message_ends_the_stream_instead_of_passing(message):
    rfb = ready()
    with pytest.raises(RfbFilterError):
        rfb.client(message)


def test_not_rfb_at_all_is_refused():
    with pytest.raises(RfbFilterError):
        ViewOnlyFilter().client(b"GET / HTTP/1.1\r\n")


def test_a_huge_clipboard_message_is_refused_not_buffered():
    rfb = ready()
    with pytest.raises(RfbFilterError):
        rfb.client(struct.pack(">Bxxxi", 6, 64 * 1024 * 1024))
