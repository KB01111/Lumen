"""Lumen JSON-lines adapter for the Gemini Computer Use Preview agent."""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import queue
import shutil
import sys
import threading
import uuid
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse


UPSTREAM_ROOT = Path(__file__).resolve().parent / "upstream"
sys.path.insert(0, str(UPSTREAM_ROOT))

from agent import BrowserAgent  # noqa: E402
from computers import EnvState, PlaywrightComputer  # noqa: E402


SCREEN_SIZE = (1440, 900)
MAX_TASK_LENGTH = 4_000
MAX_ITERATIONS = 60
SUPPORTED_MODELS = {
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-computer-use-preview-10-2025",
    "gemini-3-flash-preview",
}


class CancelledError(RuntimeError):
    pass


class Protocol:
    def __init__(self) -> None:
        self._commands: queue.Queue[dict[str, Any]] = queue.Queue()
        self._cancelled = threading.Event()
        self._write_lock = threading.Lock()
        self._stdout = sys.stdout

    @property
    def cancelled(self) -> bool:
        return self._cancelled.is_set()

    def start(self) -> None:
        threading.Thread(target=self._read_commands, daemon=True).start()

    def emit(self, event_type: str, **payload: Any) -> None:
        event = {"type": event_type, **payload}
        with self._write_lock:
            self._stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
            self._stdout.flush()

    def wait_for_approval(self, approval_id: str) -> bool:
        while not self.cancelled:
            try:
                command = self._commands.get(timeout=0.2)
            except queue.Empty:
                continue
            if command.get("type") != "approval" or command.get("approvalId") != approval_id:
                continue
            return command.get("approved") is True
        return False

    def _read_commands(self) -> None:
        for raw_line in sys.stdin:
            try:
                command = json.loads(raw_line)
            except json.JSONDecodeError:
                continue
            if not isinstance(command, dict):
                continue
            if command.get("type") == "cancel":
                self._cancelled.set()
            self._commands.put(command)
        self._cancelled.set()


class LumenBrowserAgent(BrowserAgent):
    def __init__(self, protocol: Protocol, api_key: str, **kwargs: Any) -> None:
        os.environ["GEMINI_API_KEY"] = api_key
        try:
            super().__init__(verbose=False, **kwargs)
        finally:
            os.environ.pop("GEMINI_API_KEY", None)
        self.protocol = protocol
        self.last_error: Exception | None = None
        self.approval_denied = False

    def get_model_response(self):
        try:
            return super().get_model_response()
        except Exception as error:
            self.last_error = error
            raise

    def get_text(self, candidate):
        text = super().get_text(candidate)
        if text:
            self.protocol.emit("reasoning", text=text)
        return text

    def handle_action(self, action, use_legacy_actions: bool):
        if self.protocol.cancelled:
            raise CancelledError("Task cancelled")
        self.protocol.emit("action", action=action.name)
        result = super().handle_action(action, use_legacy_actions)
        if isinstance(result, EnvState):
            self.protocol.emit("observation", url=result.url)
        return result

    def _get_safety_confirmation(
        self, safety: dict[str, Any]
    ) -> Literal["CONTINUE", "TERMINATE"]:
        if safety.get("decision") != "require_confirmation":
            raise ValueError("Unknown Gemini safety decision")
        approval_id = uuid.uuid4().hex
        self.protocol.emit(
            "approvalRequired",
            approvalId=approval_id,
            explanation=str(safety.get("explanation") or "Gemini requires confirmation."),
        )
        approved = self.protocol.wait_for_approval(approval_id)
        if not approved:
            self.approval_denied = True
            return "TERMINATE"
        self.protocol.emit("approvalResolved", approvalId=approval_id, approved=True)
        return "CONTINUE"


def validate_initial_url(value: str) -> str:
    parsed = urlparse(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("Initial URL must be an absolute HTTP or HTTPS URL")
    return value


def edge_executable() -> Path | None:
    candidates = [
        Path(value) / "Microsoft/Edge/Application/msedge.exe"
        for name in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA")
        if (value := os.environ.get(name))
    ]
    discovered = shutil.which("msedge")
    if discovered:
        candidates.append(Path(discovered))
    return next((candidate for candidate in candidates if candidate.is_file()), None)


def parser() -> argparse.ArgumentParser:
    command = argparse.ArgumentParser(description="Run Lumen's browser-only computer agent")
    command.add_argument("--health", action="store_true")
    command.add_argument("--query")
    command.add_argument("--initial-url", default="https://www.google.com")
    command.add_argument("--model", default="gemini-3.6-flash")
    return command


def run() -> int:
    args = parser().parse_args()
    if args.health:
        available = edge_executable() is not None
        print(
            json.dumps(
                {
                    "state": "ready" if available else "unavailable",
                    "browser": "Microsoft Edge",
                }
            )
        )
        return 0 if available else 1
    task = args.query or os.environ.pop("LUMEN_COMPUTER_USE_QUERY", "")
    if not task or not task.strip():
        raise ValueError("A non-empty browser task is required")
    if len(task) > MAX_TASK_LENGTH:
        raise ValueError(f"Browser tasks are limited to {MAX_TASK_LENGTH} characters")
    if args.model not in SUPPORTED_MODELS:
        raise ValueError("Unsupported Gemini Computer Use model")
    api_key = os.environ.pop("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise ValueError("Gemini API key is not configured")

    initial_url = validate_initial_url(args.initial_url)
    protocol = Protocol()
    protocol.start()
    protocol.emit("started", model=args.model, browser="Microsoft Edge")

    try:
        with contextlib.redirect_stdout(sys.stderr):
            with PlaywrightComputer(
                screen_size=SCREEN_SIZE,
                initial_url=initial_url,
                highlight_mouse=True,
            ) as browser:
                agent = LumenBrowserAgent(
                    protocol=protocol,
                    api_key=api_key,
                    browser_computer=browser,
                    query=task.strip(),
                    model_name=args.model,
                )
                for _ in range(MAX_ITERATIONS):
                    if protocol.cancelled:
                        raise CancelledError("Task cancelled")
                    if agent.run_one_iteration() == "COMPLETE":
                        break
                else:
                    protocol.emit(
                        "failed",
                        message="The browser task reached its 60-step safety limit.",
                        code="step_limit",
                    )
                    return 1

        if protocol.cancelled or agent.approval_denied:
            protocol.emit("cancelled")
        elif agent.last_error is not None:
            protocol.emit(
                "failed",
                message=f"Gemini Computer Use failed: {agent.last_error}",
                code="provider_error",
            )
            return 1
        elif agent.final_reasoning:
            protocol.emit("completed", summary=agent.final_reasoning)
        else:
            protocol.emit(
                "failed",
                message="Gemini stopped without a final result.",
                code="empty_result",
            )
            return 1
        return 0
    except CancelledError:
        protocol.emit("cancelled")
        return 0
    except Exception as error:
        protocol.emit("failed", message=str(error), code="worker_error")
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
