"""Runtime credential, port, and shutdown checks; no container images needed."""

import json
import os
import shlex
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

APPTAINER_DIR = Path(__file__).resolve().parents[1]


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.capture = self.work / "calls.jsonl"
        self.password = "spaces , @:/?#% $DO_NOT_EXPAND $(false) ' \" \\"
        backend_env = self.work / "backend.env"
        backend_env.write_text("INSTITUTION_NAME=Universidad Nacional Mayor de San Marcos\n")
        self.config = self.work / "deploy.env"
        self.config.write_text(
            f"DB_USERNAME=herbarium\nDB_PASSWORD={shlex.quote(self.password)}\n"
            f"DB_DATABASE=herbarium\nBACKEND_ENV_FILE={shlex.quote(str(backend_env))}\n"
        )
        fake = self.work / "apptainer"
        fake.write_text(
            f"#!{sys.executable}\n"
            """import json, os, sys
args = sys.argv[1:]
if args[:2] == ["instance", "list"]:
    print("INSTANCE NAME PID CONTAINER IMAGE")
    for suffix in ["db", "seaweedfs", "backend", "frontend"]:
        print(f"herbarium-{suffix} 123 image.sif")
    sys.exit(0)
with open(os.environ["CAPTURE"], "a") as out:
    out.write(json.dumps({
        "args": args,
        "env": {k: v for k, v in os.environ.items() if k.startswith("APPTAINERENV_")}
    }) + "\\n")
if args[:2] == ["instance", "stop"] and args[-1] == os.environ.get("FAIL_INSTANCE"):
    sys.exit(1)
"""
        )
        fake.chmod(0o755)
        self.env = {
            **os.environ,
            "PATH": f"{self.work}{os.pathsep}{os.environ['PATH']}",
            "DEPLOY_ENV": str(self.config),
            "CAPTURE": str(self.capture),
        }

    def calls(self):
        return [json.loads(line) for line in self.capture.read_text().splitlines()]

    def run_bash(self, script, *args):
        return subprocess.run(
            ["bash", "-c", script, "runtime-check", str(APPTAINER_DIR), *args],
            env=self.env,
            capture_output=True,
            text=True,
            check=True,
        )

    def test_postgres_password_is_literal_and_not_in_command_line(self):
        self.run_bash(
            'set -euo pipefail; source "$1/lib.sh"; load_config; '
            "postgres_apptainer instance start --cleanenv --no-eval image.sif herbarium-db"
        )
        call = self.calls()[0]
        self.assertEqual(call["env"]["APPTAINERENV_POSTGRES_PASSWORD"], self.password)
        self.assertEqual(call["env"]["APPTAINERENV_POSTGRES_DB"], "herbarium")
        self.assertNotIn(self.password, " ".join(call["args"]))
        self.assertNotIn("--env-file", call["args"])
        self.assertIn("--no-eval", call["args"])

    def test_backend_exec_preserves_credentials_without_shell_parsing_dotenv(self):
        subprocess.run(
            [str(APPTAINER_DIR / "exec-backend.sh"), "python", "-c", "pass"],
            env=self.env,
            capture_output=True,
            text=True,
            check=True,
        )
        call = self.calls()[0]
        self.assertEqual(call["env"]["APPTAINERENV_PASSWORD"], self.password)
        self.assertEqual(call["env"]["APPTAINERENV_HOST"], "127.0.0.1")
        self.assertNotIn(self.password, " ".join(call["args"]))
        self.assertNotIn("--env-file", call["args"])
        self.assertIn("--no-eval", call["args"])
        self.assertIn("--userns", call["args"])
        self.assertEqual(call["args"][-3:], ["python", "-c", "pass"])

    def test_stop_attempts_database_even_when_frontend_stop_fails(self):
        result = subprocess.run(
            [str(APPTAINER_DIR / "stop.sh")],
            env={**self.env, "FAIL_INSTANCE": "herbarium-frontend"},
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)
        calls = self.calls()
        self.assertEqual(
            [call["args"][-1] for call in calls],
            ["herbarium-frontend", "herbarium-backend", "herbarium-seaweedfs", "herbarium-db"],
        )
        for call in calls:
            self.assertEqual(call["args"][2:6], ["--signal", "SIGTERM", "--timeout", "120"])

    def test_port_validation_rejects_conflicts_and_normalizes_decimal(self):
        script = (
            'set -euo pipefail; source "$1/lib.sh"; '
            'HTTPS_PORT=$2; validate_port; printf "%s" "$HTTPS_PORT"'
        )
        self.assertEqual(self.run_bash(script, "08443").stdout, "8443")
        for invalid in [
            "8000",
            "5432",
            "8888",
            "8333",
            "9333",
            "443",
            "65536",
            "999999999999",
            "x",
        ]:
            with self.subTest(port=invalid):
                result = subprocess.run(
                    ["bash", "-c", script, "runtime-check", str(APPTAINER_DIR), invalid],
                    env=self.env,
                    capture_output=True,
                    text=True,
                )
                self.assertNotEqual(result.returncode, 0)

    def test_preflight_rejects_each_occupied_service_port(self):
        script = (
            'set -euo pipefail; source "$1/lib.sh"; '
            "HTTPS_PORT=8443; occupied=$2; "
            'port_open() { [[ "$1" == "$occupied" ]]; }; '
            'check_ports_available; printf "ports available"'
        )
        self.assertEqual(self.run_bash(script, "").stdout, "ports available")
        for port in [5432, 8000, 8080, 8333, 8888, 9333, 18080, 18333, 18888, 19333, 8443]:
            with self.subTest(port=port):
                result = subprocess.run(
                    ["bash", "-c", script, "runtime-check", str(APPTAINER_DIR), str(port)],
                    env=self.env,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(result.returncode, 1)
                self.assertIn(f"Port {port} is already listening", result.stderr)
                self.assertNotIn("ports available", result.stdout)


if __name__ == "__main__":
    unittest.main()
