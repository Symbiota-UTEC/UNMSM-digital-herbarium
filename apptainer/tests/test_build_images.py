"""Exercise rebuild and failure behavior without a Docker daemon or SIF images."""

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

APPTAINER_DIR = Path(__file__).resolve().parents[1]
IMAGE_NAMES = ("postgres", "seaweedfs", "backend", "frontend")
OUTPUT_NAMES = (*[f"{name}.sif" for name in IMAGE_NAMES], "SHA256SUMS")


class BuildImagesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.output = self.work / "images with spaces"
        self.output.mkdir()
        docker = self.work / "docker"
        docker.write_text("#!/bin/sh\nexit 0\n")
        docker.chmod(0o755)
        apptainer = self.work / "apptainer"
        apptainer.write_text(
            f"#!{sys.executable}\n"
            """import os, sys
from pathlib import Path
assert sys.argv[1] == "build"
assert "--fakeroot" not in sys.argv, "Do not force fakeroot for sudo builds"
target = Path(sys.argv[2])
scratch = Path(os.environ["APPTAINER_TMPDIR"])
assert scratch.is_absolute() and scratch.is_dir()
assert scratch == Path(os.environ.get("EXPECTED_SCRATCH", str(target.parent / "tmp")))
if target.exists():
    sys.exit("Build target already exists")
if target.stem == os.environ.get("FAIL_IMAGE"):
    target.write_text("incomplete image")
    sys.exit(1)
target.write_text(f"{target.stem}: {os.environ['BUILD_REVISION']}\\n")
"""
        )
        apptainer.chmod(0o755)
        self.env = {
            **os.environ,
            "PATH": f"{self.work}{os.pathsep}{os.environ['PATH']}",
            "VITE_CAMERA_BASE_URL": "https://camera.example.edu",
        }
        self.env.pop("APPTAINER_TMPDIR", None)
        self.env.pop("EXPECTED_SCRATCH", None)

    def build(self, revision, fail_image=""):
        return subprocess.run(
            [str(APPTAINER_DIR / "build-images.sh"), str(self.output)],
            env={**self.env, "BUILD_REVISION": revision, "FAIL_IMAGE": fail_image},
            capture_output=True,
            text=True,
        )

    def snapshot(self):
        return {name: (self.output / name).read_bytes() for name in OUTPUT_NAMES}

    def test_rebuild_replaces_existing_images_and_valid_checksums(self):
        for revision in ("first", "second"):
            with self.subTest(revision=revision):
                result = self.build(revision)
                self.assertEqual(result.returncode, 0, result.stderr)
                for name in IMAGE_NAMES:
                    self.assertEqual(
                        (self.output / f"{name}.sif").read_text(), f"{name}: {revision}\n"
                    )
                subprocess.run(
                    ["sha256sum", "-c", "SHA256SUMS"],
                    cwd=self.output,
                    capture_output=True,
                    text=True,
                    check=True,
                )
                self.assertFalse(list(self.output.glob(".build-*")))

    def test_failure_in_any_image_build_preserves_previous_set(self):
        result = self.build("original")
        self.assertEqual(result.returncode, 0, result.stderr)
        original = self.snapshot()
        for name in IMAGE_NAMES:
            with self.subTest(failing_image=name):
                result = self.build("replacement", fail_image=name)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.snapshot(), original)
                self.assertFalse(list(self.output.glob(".build-*")))

    def test_explicit_apptainer_temp_directory_is_preserved(self):
        scratch = self.work / "custom scratch"
        self.env.update(APPTAINER_TMPDIR=str(scratch), EXPECTED_SCRATCH=str(scratch))
        result = self.build("custom-temp")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(scratch.is_dir())
        self.assertFalse(list(self.output.glob(".build-*")))


if __name__ == "__main__":
    unittest.main()
