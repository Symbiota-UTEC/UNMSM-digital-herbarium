"""IPv6 configuration and startup/rollback checks without containers or sockets."""

import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

APPTAINER_DIR = Path(__file__).resolve().parents[1]


class IPv6Tests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.capture = self.work / "calls.jsonl"
        self.state = self.work / "state"
        self.state.mkdir()
        self.config = self.work / "deploy.env"
        paths = {
            "DATA_DIR": self.work / "data",
            "RUN_DIR": self.work / "data/run",
            "SIF_DIR": self.work / "images",
            "BACKEND_ENV_FILE": self.work / "backend.env",
            "DB_INIT_DIR": self.work / "init",
            "TLS_CERT": self.work / "tls.crt",
            "TLS_KEY": self.work / "tls.key",
        }
        self.base_config = (
            "INSTANCE_PREFIX=herbarium\nDB_PASSWORD=testing-password\nHTTPS_PORT=8443\n"
            + "".join(f"{key}={shlex.quote(str(value))}\n" for key, value in paths.items())
        )
        self.config.write_text(self.base_config)
        paths["SIF_DIR"].mkdir()
        for name in ("postgres", "seaweedfs", "backend", "frontend"):
            (paths["SIF_DIR"] / f"{name}.sif").touch()
        for name in ("BACKEND_ENV_FILE", "TLS_CERT", "TLS_KEY"):
            paths[name].touch()

        # Run the real startup script, replacing only the network probes and tools.
        deployment = self.work / "deployment"
        deployment.mkdir()
        self.start_script = deployment / "start.sh"
        shutil.copyfile(APPTAINER_DIR / "start.sh", self.start_script)
        (deployment / "lib.sh").write_text(
            f"source {shlex.quote(str(APPTAINER_DIR / 'lib.sh'))}\n"
            """
port_open() {
    if [[ "$1" == "${OCCUPIED_PORT:-}" && "${2:-127.0.0.1}" == "${OCCUPIED_HOST:-}" ]]; then
        return 0
    fi
    case "$1" in
        8888) [[ -f "$STATE/herbarium-seaweedfs" ]] ;;
        8000) [[ -f "$STATE/herbarium-backend" ]] ;;
        *) return 1 ;;
    esac
}
"""
        )
        # This tool simulates instance state and a successful pg_isready command.
        self.write_tool(
            "apptainer",
            """
state = Path(os.environ["STATE"])
if args[:2] == ["instance", "list"]:
    print("INSTANCE NAME PID CONTAINER IMAGE")
    for instance in state.iterdir():
        print(f"{instance.name} 123 image.sif")
elif args[:2] == ["instance", "start"]:
    assert "--userns" in args, "Instances must avoid setuid image mounts"
    if args[-1] == os.environ.get("FAIL_START"):
        sys.exit(1)
    (state / args[-1]).touch()
elif args[:2] == ["instance", "stop"]:
    (state / args[-1]).unlink()
elif args[0] == "exec":
    assert "--userns" in args, "Readiness commands must use user namespaces"
""",
        )
        self.write_tool(
            "curl",
            """
if ("--ipv4" in args and os.environ.get("FAIL_IPV4")) or (
    "--ipv6" in args and os.environ.get("FAIL_IPV6")
):
    sys.exit(7)
""",
        )
        self.env = {
            **{key: value for key, value in os.environ.items() if key != "ENABLE_IPV6"},
            "PATH": f"{self.work}{os.pathsep}{os.environ['PATH']}",
            "DEPLOY_ENV": str(self.config),
            "CAPTURE": str(self.capture),
            "STATE": str(self.state),
        }

    def write_tool(self, name, body):
        path = self.work / name
        path.write_text(
            f"#!{sys.executable}\n"
            "import json, os, sys\nfrom pathlib import Path\nargs = sys.argv[1:]\n"
            'with open(os.environ["CAPTURE"], "a") as out:\n'
            f'    out.write(json.dumps({{"tool": {name!r}, "args": args, '
            '"dbus": os.environ.get("DBUS_SESSION_BUS_ADDRESS")}) + "\\n")\n' + body
        )
        path.chmod(0o755)

    def set_ipv6(self, value):
        self.config.write_text(self.base_config + f"ENABLE_IPV6={shlex.quote(value)}\n")

    def run_start(self, **env):
        # Advance Bash's timer instead of sleeping when a readiness probe fails.
        return subprocess.run(
            [
                "bash",
                "-c",
                'sleep() { SECONDS=$((SECONDS + 180)); }; source "$1"',
                "startup-check",
                str(self.start_script),
            ],
            env={**self.env, **env},
            capture_output=True,
            text=True,
            timeout=10,
        )

    def calls(self, tool):
        if not self.capture.exists():
            return []
        return [
            call["args"]
            for line in self.capture.read_text().splitlines()
            if (call := json.loads(line))["tool"] == tool
        ]

    def rendered_config(self):
        return (self.work / "data/run/nginx-frontend.conf").read_text()

    def assert_rollback(self, result, expected):
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ENABLE_IPV6=true", result.stderr)
        self.assertIn("stopping instances started by this run", result.stderr)
        self.assertNotIn("Herbarium is available", result.stdout)
        stops = [args[-1] for args in self.calls("apptainer") if args[:2] == ["instance", "stop"]]
        self.assertEqual(stops, [f"herbarium-{name}" for name in expected])
        self.assertFalse(list(self.state.iterdir()))

    def test_default_start_uses_only_ipv4(self):
        result = self.run_start(FAIL_IPV6="1", OCCUPIED_PORT="8443", OCCUPIED_HOST="::1")
        self.assertEqual(result.returncode, 0, result.stderr)
        rendered = self.rendered_config()
        self.assertIn("listen 8443 ssl;", rendered)
        self.assertNotIn("listen [::]", rendered)
        self.assertNotIn("@", rendered)
        calls = self.calls("curl")
        self.assertEqual(len(calls), 1)
        self.assertIn("--ipv4", calls[0])

    def test_ipv6_start_renders_both_listeners_and_checks_both_families(self):
        self.set_ipv6("true")
        result = self.run_start()
        self.assertEqual(result.returncode, 0, result.stderr)
        rendered = self.rendered_config()
        self.assertIn("listen 8443 ssl;", rendered)
        self.assertIn("listen [::]:8443 ssl ipv6only=on;", rendered)
        self.assertNotIn("@", rendered)
        calls = self.calls("curl")
        self.assertEqual(len(calls), 2)
        self.assertIn("--ipv4", calls[0])
        self.assertEqual(calls[0][-1], "https://127.0.0.1:8443/")
        self.assertIn("--ipv6", calls[1])
        self.assertEqual(calls[1][-1], "https://[::1]:8443/")
        for args in calls:
            self.assertEqual(args[args.index("--noproxy") + 1], "*")

    def test_explicit_false_uses_only_ipv4(self):
        self.set_ipv6("false")
        result = self.run_start(FAIL_IPV6="1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("listen [::]", self.rendered_config())
        self.assertEqual(len(self.calls("curl")), 1)

    def test_instance_launch_skips_optional_cgroups_without_changing_session_bus(self):
        session_bus = "unix:path=/example/user-session/bus"
        result = self.run_start(DBUS_SESSION_BUS_ADDRESS=session_bus)
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [json.loads(line) for line in self.capture.read_text().splitlines()]
        starts = [call for call in calls if call["args"][:2] == ["instance", "start"]]
        self.assertEqual(len(starts), 4)
        self.assertTrue(all(call["dbus"] == "" for call in starts))
        readiness = [call for call in calls if call["args"][0] == "exec"]
        self.assertTrue(readiness)
        self.assertTrue(all(call["dbus"] == session_bus for call in readiness))

    def test_invalid_ipv6_setting_fails_before_starting_instances(self):
        for invalid in ("", "yes", "TRUE", "0", "auto"):
            with self.subTest(value=invalid):
                self.set_ipv6(invalid)
                result = self.run_start()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("ENABLE_IPV6 must be true or false", result.stderr)
                self.assertEqual(self.calls("apptainer"), [])
                self.assertEqual(self.calls("curl"), [])

    def test_occupied_ipv6_https_port_fails_before_starting_instances(self):
        self.set_ipv6("true")
        result = self.run_start(OCCUPIED_PORT="8443", OCCUPIED_HOST="::1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Port 8443 is already listening on IPv6", result.stderr)
        self.assertEqual(self.calls("apptainer"), [])

    def test_failed_ipv6_readiness_rolls_back_without_ipv4_fallback(self):
        self.set_ipv6("true")
        result = self.run_start(FAIL_IPV6="1")
        self.assert_rollback(result, ["frontend", "backend", "seaweedfs", "db"])
        self.assertIn("--ipv6", self.calls("curl")[-1])

    def test_failed_ipv4_readiness_also_rolls_back_when_ipv6_enabled(self):
        self.set_ipv6("true")
        result = self.run_start(FAIL_IPV4="1")
        self.assert_rollback(result, ["frontend", "backend", "seaweedfs", "db"])
        self.assertEqual(len(self.calls("curl")), 1)

    def test_failed_frontend_start_stops_only_successfully_started_instances(self):
        self.set_ipv6("true")
        result = self.run_start(FAIL_START="herbarium-frontend")
        self.assert_rollback(result, ["backend", "seaweedfs", "db"])
        self.assertEqual(self.calls("curl"), [])


if __name__ == "__main__":
    unittest.main()
