import unittest

from worker import Protocol, normalize_navigation_url


class ProtocolTests(unittest.TestCase):
    def test_command_reader_remains_on_protocol(self):
        self.assertTrue(callable(Protocol._read_commands))

    def test_cancelled_approval_wait_fails_closed(self):
        protocol = Protocol()
        protocol._cancelled.set()
        self.assertFalse(protocol.wait_for_approval("approval1"))


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
