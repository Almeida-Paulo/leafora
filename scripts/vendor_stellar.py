"""Vendor fixed standalone wallet distributions; never execute package lifecycle scripts."""
import base64
import hashlib
import io
import json
import sys
from pathlib import Path
import tarfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = [
    ("@stellar/freighter-api", "6.0.1", "build/index.min.js", "freighter.js",
     "eqwakEqSg+zoLuPpSbKyrX0pG8DQFzL/J5GtbfuMCmJI+h+oiC9pQ5C6QLc80xopZQKdGt8dUAFCmDMNdAG95w=="),
    ("@walletconnect/sign-client", "2.25.0", "dist/index.umd.js", "walletconnect.js",
     "oOnOZpaoMTjzPlj+PY530zBc0wLKMH1qkFStu+UbfZ162iPQcikE29QXb0bCKiKgqiRZUWacBmsQBdLpYFVhOg=="),
    ("@walletconnect/modal", "2.7.0", "dist/cdn/bundle.js", "walletconnect-modal.js",
     "RQVt58oJ+rwqnPcIvRFeMGKuXb9qkgSmwz4noF8JZGUym3gUAzVs+uW2NQ1Owm9XOJAV+sANrtJ+VoVq1ftElw=="),
]


def main():
    manifest_path = ROOT / "docs/security/stellar-vendor.json"
    licenses_only = "--licenses-only" in sys.argv
    records = json.loads(manifest_path.read_text())["packages"] if licenses_only else []
    for package, version, member, name, integrity in ([] if licenses_only else PACKAGES):
        short = package.split("/")[-1]
        url = f"https://registry.npmjs.org/{package}/-/{short}-{version}.tgz"
        data = urlopen(url, timeout=30).read(20_000_000)
        if base64.b64encode(hashlib.sha512(data).digest()).decode() != integrity:
            raise ValueError("Archive integrity mismatch: " + package)
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            bundle = archive.extractfile("package/" + member).read()
            licenses = [m for m in archive.getmembers()
                        if m.isfile() and m.name.rsplit("/", 1)[-1].upper().startswith("LICENSE")]
            for app in ("web", "admin"):
                target = ROOT / "apps" / app / "vendor" / "stellar"
                target.mkdir(parents=True, exist_ok=True)
                (target / name).write_bytes(bundle)
                if package == "@walletconnect/modal":
                    for chunk in archive.getmembers():
                        if chunk.isfile() and chunk.name.startswith("package/dist/cdn/") and chunk.name.endswith(".js"):
                            relative = Path(chunk.name.removeprefix("package/dist/cdn/"))
                            if relative.is_absolute() or ".." in relative.parts:
                                raise ValueError("Unsafe archive member")
                            destination = target / relative
                            destination.parent.mkdir(parents=True, exist_ok=True)
                            destination.write_bytes(archive.extractfile(chunk).read())
                for index, license_file in enumerate(licenses):
                    (target / f"{short}-LICENSE-{index}.txt").write_bytes(archive.extractfile(license_file).read())
        records.append({"package": package, "version": version, "url": url,
                        "archive_integrity": "sha512-" + integrity, "file": name,
                        "sha256": hashlib.sha256(bundle).hexdigest(),
                        "sri": "sha384-" + base64.b64encode(hashlib.sha384(bundle).digest()).decode()})
    license_sources = []
    for repo, revision, filename in [
        ("stellar/freighter", "957a4b87e66e817e645a894084a2fa4cfe63586c", "freighter-LICENSE.txt"),
        ("WalletConnect/modal", "3a52ea2a8da95ad7f50db088bf73f48c953f5610", "modal-LICENSE.txt"),
    ]:
        url = f"https://api.github.com/repos/{repo}/git/blobs/{revision}"
        blob = json.load(urlopen(url, timeout=30))
        content = base64.b64decode(blob["content"])
        if hashlib.sha1(f"blob {len(content)}\0".encode() + content).hexdigest() != revision:
            raise ValueError("License blob mismatch")
        for app in ("web", "admin"):
            (ROOT / f"apps/{app}/vendor/stellar" / filename).write_bytes(content)
        license_sources.append({"file": filename, "source": url})
    manifest = {"packages": records, "license_sources": license_sources,
                "files": {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                for p in sorted((ROOT / "apps/web/vendor/stellar").iterdir()) if p.is_file()}}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("Vendored pinned wallet bundles and licenses for web and admin.")


if __name__ == "__main__":
    main()
