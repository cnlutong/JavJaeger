"""Check Android TV signing failures without real credentials or Android services.

Run with JDK 21 and the Android SDK: python3 tests/android_tv_signing_check.py
"""

import os
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]


def main():
    temp_root = os.environ.get("JAVJAEGER_TV_SIGNING_TEST_TMP", "/Volumes/dev1/codex/tmp")
    with tempfile.TemporaryDirectory(prefix="javjaeger-tv-signing-", dir=temp_root) as temp:
        private = Path(temp)
        missing = private / "missing.properties"

        def gradle(config, *arguments):
            return subprocess.run(
                [str(ROOT / "android-tv/gradlew"), "--console=plain", "--quiet", *arguments],
                cwd=ROOT / "android-tv",
                env={**os.environ, "JAVJAEGER_TV_SIGNING_PROPERTIES": str(config)},
                text=True, capture_output=True, timeout=120,
            )

        def rejected(config, message):
            result = gradle(config, "help")
            assert result.returncode != 0, "Missing signing configuration must stop the build instead of generating a new key"
            assert message in result.stdout + result.stderr, "Signing failure must explain recovery without exposing secrets"

        rejected(missing, "TV signing configuration is missing")
        print("PASS: missing signing configuration stops the build", flush=True)

        fake_key = private / "other.keystore"
        password = "synthetic-signing-secret"
        subprocess.run(
            ["keytool", "-genkeypair", "-keystore", str(fake_key), "-alias", "androiddebugkey",
             "-storepass:env", "TV_SIGNING_TEST_PASSWORD", "-keypass:env", "TV_SIGNING_TEST_PASSWORD",
             "-keyalg", "RSA", "-keysize", "2048", "-validity", "1", "-dname", "CN=Synthetic TV Test"],
            env={**os.environ, "TV_SIGNING_TEST_PASSWORD": password},
            check=True, capture_output=True, timeout=30,
        )
        config = private / "signing.properties"

        def profile(store_password=password, key_password=password, alias="androiddebugkey", store_file=fake_key.name):
            config.write_text(f"storeFile={store_file}\nstorePassword={store_password}\nkeyAlias={alias}\nkeyPassword={key_password}\n")
            config.chmod(0o600)

        profile()
        rejected(config, "TV signing certificate does not match v0.3.6")
        print("PASS: a different signing certificate stops the build", flush=True)
        for changes in ({"store_password": "incorrect-secret"}, {"key_password": "incorrect-secret"}, {"alias": "missing-alias"}):
            profile(**changes)
            result = gradle(config, "help")
            output = result.stdout + result.stderr
            assert result.returncode != 0 and "Cannot unlock the TV signing identity" in output
            assert password not in output and "incorrect-secret" not in output
        print("PASS: invalid passwords and aliases fail without exposing credentials", flush=True)

        profile(store_file="missing.keystore")
        rejected(config, "TV signing keystore is missing")
        development = "-PjavjaegerTvDevelopmentSigning=true"
        result = gradle(missing, development, "help")
        assert result.returncode == 0, "Contributors must be able to explicitly choose disposable development signing"
        result = gradle(missing, development, "verifyTvSigning")
        assert result.returncode != 0 and "Development signing cannot be used for publishing" in result.stdout + result.stderr
        print("PASS: explicit development signing cannot pass the publishing check", flush=True)


if __name__ == "__main__":
    main()
