"""Local reward backup/recovery tools. No signing keys or transaction submission."""
import argparse
import json
import os
from pathlib import Path

from app.db.session import SessionLocal
from app.services import reward_store as store
from app.services.reward_ledger import allocation_manifest, canonical


def write_backup(path, document):
    destination = Path(path)
    # Exclusive creation avoids silently replacing an earlier recovery point.
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(canonical(document))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def checkpoint(db, directory):
    target = Path(directory)
    if not target.is_dir():
        raise ValueError("Backup directory must already exist with restricted access.")
    # Entitlements are independent of testnet availability and its resets.
    document = store.export_book(db)
    path = target / f"{document['revision']:010d}-{document['head_hash']}.leafora-rewards.json"
    if path.exists():
        previous = json.loads(path.read_text(encoding="utf-8"))
        from app.services.reward_ledger import digest
        if previous.get("head_hash") != document["head_hash"] or previous.get("events") != document["events"] or previous.get("sha256") != digest({k: v for k, v in previous.items() if k != "sha256"}):
            raise ValueError("Existing checkpoint is corrupt; it was not overwritten.")
        document = previous
    else:
        write_backup(path, document)
    print(f"backup={path} revision={document['revision']} sha256={document['sha256']}")
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("audit")
    export = commands.add_parser("export")
    export.add_argument("--output", required=True)
    restore = commands.add_parser("restore")
    restore.add_argument("--input", required=True)
    restore.add_argument("--expected-sha256", required=True)
    allocations = commands.add_parser("allocations")
    allocations.add_argument("--output", required=True)
    periodic = commands.add_parser("checkpoint")
    periodic.add_argument("--directory", required=True)
    args = parser.parse_args()
    with SessionLocal() as db:
        try:
            if args.command == "export":
                document = store.export_book(db)
                write_backup(args.output, document)
                print(f"revision={document['revision']} sha256={document['sha256']}")
            elif args.command == "restore":
                path = Path(args.input)
                if path.stat().st_size > 64 * 1024 * 1024:
                    raise ValueError("Backup exceeds the reviewed 64 MiB limit.")
                document = json.loads(path.read_text(encoding="utf-8"))
                store.restore_book(db, document, args.expected_sha256)
                db.commit()
                print(f"Restored {document['revision']} events into the empty rewards ledger.")
            elif args.command == "allocations":
                book, state, _ = store.load(db)
                document = allocation_manifest(state, book.revision, book.head_hash)
                write_backup(args.output, document)
                print(f"revision={book.revision} total_units={document['total_units']} sha256={document['sha256']}")
            elif args.command == "checkpoint":
                checkpoint(db, args.directory)
            else:
                book, _, _ = store.load(db)
                print(f"OK revision={book.revision} head_hash={book.head_hash}")
        except Exception as error:
            db.rollback()
            parser.exit(1, f"Rewards operation failed: {error}\n")


if __name__ == "__main__":
    main()
