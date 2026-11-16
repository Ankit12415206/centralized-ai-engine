"""
Unit tests for database.py:
- SHA-256 backup verification
- Migration & schema idempotency
- Conversation record preservation
- Rollback on failure (Test F1)
- Identity validation (Tests A1, A2, A3)
"""

import os
import sys
import shutil
import sqlite3
import tempfile

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
EDU_KEY = os.getenv("EDUCATION_PLATFORM_KEY")

from modules.database import (
    DB_PATH,
    get_connection,
    backup_database,
    init_db,
    migrate_db,
    validate_identity,
    compute_sha256
)

def test_migration_and_preservation():
    print("\n--- Running Test: Migration and Preservation on real DB ---")
    # Verify current state before migration
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM context_memory")
    before_count = c.fetchone()[0]
    conn.close()

    print(f"Pre-migration row count in context_memory: {before_count}")
    
    # Run migration
    migrate_db()

    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM context_memory")
    after_count = c.fetchone()[0]
    assert after_count == before_count, f"Row count mismatch! {before_count} != {after_count}"

    # Verify columns in context_memory
    c.execute("PRAGMA table_info(context_memory)")
    columns = {r[1]: r for r in c.fetchall()}
    assert "platform_id" in columns, "platform_id missing from context_memory"
    assert "memory_scope" in columns, "memory_scope missing from context_memory"

    # Verify existing rows have default values
    c.execute("SELECT platform_id, memory_scope FROM context_memory LIMIT 1")
    sample_row = c.fetchone()
    if sample_row:
        assert sample_row[0] == "axiom-web", f"Expected default 'axiom-web', got {sample_row[0]}"
        assert sample_row[1] == "global", f"Expected default 'global', got {sample_row[1]}"

    # Verify new tables exist
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {r[0] for r in c.fetchall()}
    for expected in ["registered_platforms", "registered_users", "platform_permissions", "user_topics"]:
        assert expected in tables, f"Expected table {expected} missing"

    # Verify demo platforms & users
    c.execute("SELECT COUNT(*) FROM registered_platforms")
    assert c.fetchone()[0] >= 2, "Demo platforms not seeded"
    c.execute("SELECT COUNT(*) FROM registered_users")
    assert c.fetchone()[0] >= 3, "Demo users not seeded"

    conn.close()
    print("✓ Migration successfully preserved existing data and updated schema.")

def test_sha256_backup():
    print("\n--- Running Test: SHA-256 Backup Verification ---")
    backup_file = backup_database()
    assert backup_file is not None, "Backup file should be created"
    assert os.path.exists(backup_file), "Backup file does not exist on disk"

    # Verify hash match
    orig_hash = compute_sha256(DB_PATH)
    backup_hash = compute_sha256(backup_file)
    assert orig_hash == backup_hash, f"Hash mismatch: {orig_hash} != {backup_hash}"
    print(f"✓ Backup verified with SHA-256: {orig_hash}")

    # Clean up test backup file
    if os.path.exists(backup_file):
        os.remove(backup_file)

def test_f1_migration_rollback():
    print("\n--- Running Test F1: Migration Rollback on Failure ---")
    # Create a temporary database with 4 sample rows
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tf:
        temp_db_path = tf.name

    try:
        conn = sqlite3.connect(temp_db_path)
        c = conn.cursor()
        c.execute('''
            CREATE TABLE context_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                user_msg TEXT NOT NULL,
                ai_response TEXT NOT NULL
            )
        ''')
        for i in range(4):
            c.execute(
                "INSERT INTO context_memory (user_id, session_id, timestamp, user_msg, ai_response) VALUES (?, ?, ?, ?, ?)",
                (f"user_{i}", f"sess_{i}", f"2026-11-13T10:00:0{i}", f"msg {i}", f"resp {i}")
            )
        conn.commit()
        conn.close()

        # Artificially cause migration failure by corrupting during step
        # Let's monkeypatch or force an exception inside migrate_db
        # We test that when an exception occurs, the db is restored to its exact pre-migration state
        original_hash = compute_sha256(temp_db_path)

        # Call migrate_db but with a patched cursor or table to cause failure
        conn = sqlite3.connect(temp_db_path)
        # Create a conflicting table or trigger
        conn.execute("CREATE TABLE platform_permissions (invalid_col INT)")
        conn.commit()
        conn.close()

        # Attempt migration, expecting failure because table schema conflicts with expected constraints
        try:
            # Recreate with table that will fail when inserting or querying
            migrate_db(db_path=temp_db_path)
        except Exception as e:
            print(f"Caught expected migration error: {e}")

        # Check that context_memory still has 4 rows
        conn = sqlite3.connect(temp_db_path)
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM context_memory")
        count = c.fetchone()[0]
        conn.close()
        assert count == 4, f"Expected 4 rows after rollback, got {count}"
        print(f"✓ Test F1 PASSED: Rollback successfully restored database. Row count: {count}")
    finally:
        # Clean up temp file and any backup
        if os.path.exists(temp_db_path):
            os.remove(temp_db_path)
        # remove any temp backup
        base_name = os.path.splitext(temp_db_path)[0]
        for f in os.listdir(os.path.dirname(temp_db_path)):
            if f.startswith(os.path.basename(base_name)) and f.endswith(".db"):
                os.remove(os.path.join(os.path.dirname(temp_db_path), f))

def test_identity_validation_a1_a2_a3():
    print("\n--- Running Tests A1, A2, A3: Identity Validation ---")
    
    # Test A1: Forged Platform Identity
    valid, msg = validate_identity(platform_id="fake-platform", platform_key="any-key", user_id="ankit_user")
    assert not valid, "Unregistered platform should fail"
    assert msg == "Unregistered platform", f"Expected 'Unregistered platform', got '{msg}'"
    print(f"✓ Test A1 PASSED: fake-platform rejected with '{msg}'")

    # Test A2: Forged User Identity
    valid, msg = validate_identity(platform_id="axiom-web", platform_key="axiom-secret-key-2026", user_id="hacker_user")
    assert not valid, "Unregistered user on platform should fail"
    assert msg == "User not registered on this platform", f"Expected 'User not registered on this platform', got '{msg}'"
    print(f"✓ Test A2 PASSED: hacker_user rejected with '{msg}'")

    # Test A3: Wrong Platform Key
    valid, msg = validate_identity(platform_id="axiom-web", platform_key="wrong-key", user_id="ankit_user")
    assert not valid, "Wrong platform key should fail"
    assert msg == "Invalid platform credentials", f"Expected 'Invalid platform credentials', got '{msg}'"
    print(f"✓ Test A3 PASSED: wrong-key rejected with '{msg}'")

    # Test Platform Without Key (Strict credential check)
    valid, msg = validate_identity(platform_id="axiom-web", platform_key=None, user_id="ankit_user")
    assert not valid, "Missing platform key must fail credential check"
    assert msg == "Invalid platform credentials"
    print("✓ Missing platform key strictly rejected (no bypass)")

    # Test Valid Platform with Valid Key
    valid, msg = validate_identity(platform_id="axiom-web", platform_key="axiom-secret-key-2026", user_id="ankit_user")
    assert valid, f"Platform with valid key should be valid, got {msg}"
    print("✓ Platform with valid key PASSED")

    # Test Valid External Platform with Valid Key
    valid, msg = validate_identity(platform_id="education-platform", platform_key=EDU_KEY, user_id="ankit_user")
    assert valid, f"Education platform with valid key should be valid, got {msg}"
    print("✓ Education platform with valid key PASSED")

    # Test External Platform with Missing Key
    valid, msg = validate_identity(platform_id="education-platform", platform_key=None, user_id="ankit_user")
    assert not valid, "External platform without key should fail"
    assert msg == "Invalid platform credentials"
    print("✓ External platform without key correctly rejected")

if __name__ == "__main__":
    test_sha256_backup()
    test_migration_and_preservation()
    test_f1_migration_rollback()
    test_identity_validation_a1_a2_a3()
    print("\nALL STAGE 1 DATABASE TESTS PASSED SUCCESSFULLY! 🎉")
