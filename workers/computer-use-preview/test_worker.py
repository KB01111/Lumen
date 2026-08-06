import io
import json
import unittest

from worker import MAX_EVENT_BYTES, Protocol, normalize_navigation_url


class ProtocolTests(unittest.TestCase):
    def test_command_reader_remains_on_protocol(self):
        self.assertTrue(callable(Protocol._read_commands))

    def test_cancelled_approval_wait_fails_closed(self):
        protocol = Protocol()
        protocol._cancelled.set()
        self.assertFalse(protocol.wait_for_approval("approval1"))

    def test_provider_text_is_sanitized_and_event_output_is_bounded(self):
        protocol = Protocol()
        output = io.StringIO()
        protocol._stdout = output
        protocol.emit("failed", message="unsafe\x07" + "🧪" * 20_000, code="provider_error")

        line = output.getvalue().rstrip("\n")
        self.assertLessEqual(len(line.encode("utf-8")), MAX_EVENT_BYTES)
        event = json.loads(line)
        self.assertEqual(event["type"], "failed")
        self.assertNotIn("\x07", event["message"])


class NavigationUrlTests(unittest.TestCase):
    def test_normalizes_bare_web_host(self):
        self.assertEqual(
            normalize_navigation_url("example.com/path"),
            "https://example.com/path",
        )

    def test_preserves_https_url(self):
        self.assertEqual(
            normalize_navigation_url("https://example.com/path"),
            "https://example.com/path",
        )

    def test_rejects_embedded_credentials(self):
        with self.assertRaisesRegex(ValueError, "embedded credentials"):
            normalize_navigation_url("https://user:secret@example.com")

    def test_rejects_non_web_scheme(self):
        with self.assertRaisesRegex(ValueError, "HTTP or HTTPS"):
            normalize_navigation_url("file:///C:/secret.txt")


if __name__ == "__main__":
    unittest.main()
