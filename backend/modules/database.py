"""
Database module for Centralized AI Engine (AXIOM AI).
Manages SQLite connection, schema initialization, migrations with SHA-256 backups,
and identity validation.
"""

import sqlite3
import os
import shutil
import hashlib
from datetime import datetime
from typing import List, Optional, Tuple
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ai_engine.db"))

# Demo platforms and users for CA prototype
DEMO_PLATFORMS = [
    ("axiom-web", os.getenv("AXIOM_WEB_KEY", ""), "AXIOM Web Dashboard"),
    ("education-platform", os.getenv("EDUCATION_PLATFORM_KEY", ""), "Education Platform"),
]

DEMO_USERS = [
    ("ankit_user", "axiom-web", "Ankit"),
    ("ankit_user", "education-platform", "Ankit"),
    ("student-001", "education-platform", "Student 001"),
]

def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    target_path = db_path or DB_PATH
    conn = sqlite3.connect(target_path)
    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def compute_sha256(file_path: str) -> str:
    """Computes SHA-256 hash of a file for backup verification."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

def backup_database(db_path: Optional[str] = None) -> Optional[str]:
    """Creates a timestamped backup of the database with SHA-256 checksum verification."""
    target_path = db_path or DB_PATH
    if not os.path.exists(target_path):
        return None

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    dir_name = os.path.dirname(target_path)
    base_name = os.path.splitext(os.path.basename(target_path))[0]
    backup_path = os.path.join(dir_name, f"{base_name}_backup_{timestamp}.db")

    shutil.copy2(target_path, backup_path)

    # Verify backup integrity via SHA-256 checksum
    original_hash = compute_sha256(target_path)
    backup_hash = compute_sha256(backup_path)
    if original_hash != backup_hash:
        if os.path.exists(backup_path):
            os.remove(backup_path)
        raise RuntimeError(f"Backup checksum mismatch: {original_hash} != {backup_hash}")

    print(f"[Backup] Database backed up to {backup_path} (SHA-256: {original_hash[:12]}...)")
    return backup_path

def init_db(db_path: Optional[str] = None):
    """Initializes the database schema including cross-platform and identity tables."""
    conn = get_connection(db_path)
    cursor = conn.cursor()

    # 1. Registered Platforms
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS registered_platforms (
            platform_id TEXT PRIMARY KEY,
            platform_key TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    ''')

    # 2. Registered Users
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS registered_users (
            user_id TEXT NOT NULL,
            platform_id TEXT NOT NULL,
            display_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (user_id, platform_id),
            FOREIGN KEY (platform_id) REFERENCES registered_platforms(platform_id)
        )
    ''')

    # 3. Context Memory Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS context_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            user_msg TEXT NOT NULL,
            ai_response TEXT NOT NULL,
            platform_id TEXT NOT NULL DEFAULT 'axiom-web',
            memory_scope TEXT NOT NULL DEFAULT 'global' CHECK (memory_scope IN ('global', 'platform'))
        )
    ''')

    # 4. Platform Permissions Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS platform_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            owner_platform_id TEXT NOT NULL,
            requester_platform_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'denied' CHECK (status IN ('granted', 'denied', 'revoked')),
            granted_by_platform_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, owner_platform_id, requester_platform_id),
            CHECK (owner_platform_id != requester_platform_id)
        )
    ''')

    # 5. Adaptive Learning Topics Table (per user and platform)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_topics (
            user_id TEXT NOT NULL,
            platform_id TEXT NOT NULL DEFAULT 'axiom-web',
            topic TEXT NOT NULL,
            count INTEGER DEFAULT 1,
            PRIMARY KEY (user_id, platform_id, topic)
        )
    ''')

    # 6. Adaptive Learning Feedback Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            score REAL NOT NULL,
            timestamp TEXT NOT NULL
        )
    ''')

    # Seed demo platforms and users
    now = datetime.utcnow().isoformat()
    for pid, pkey, pname in DEMO_PLATFORMS:
        cursor.execute(
            "INSERT OR IGNORE INTO registered_platforms (platform_id, platform_key, display_name, created_at) VALUES (?, ?, ?, ?)",
            (pid, pkey, pname, now)
        )
    for uid, pid, uname in DEMO_USERS:
        cursor.execute(
            "INSERT OR IGNORE INTO registered_users (user_id, platform_id, display_name, created_at) VALUES (?, ?, ?, ?)",
            (uid, pid, uname, now)
        )
    # Auto-register any existing legacy users found in context_memory
    cursor.execute('''
        INSERT OR IGNORE INTO registered_users (user_id, platform_id, display_name, created_at)
        SELECT DISTINCT user_id, 'axiom-web', user_id, ?
        FROM context_memory
    ''', (now,))

    conn.commit()
    conn.close()

def migrate_db(db_path: Optional[str] = None):
    """
    Applies schema changes idempotently with pre-migration backup and automatic rollback.
    Preserves existing conversation data.
    """
    target_path = db_path or DB_PATH
    backup_path = None
    if os.path.exists(target_path):
        backup_path = backup_database(target_path)

    conn = get_connection(target_path)
    cursor = conn.cursor()

    try:
        # Check pre-migration count in context_memory if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='context_memory'")
        has_context_table = cursor.fetchone() is not None
        pre_count = 0
        if has_context_table:
            cursor.execute("SELECT COUNT(*) FROM context_memory")
            pre_count = cursor.fetchone()[0]

        # ── Step 1: Add columns to context_memory if missing ─────────────
        if has_context_table:
            cursor.execute("PRAGMA table_info(context_memory)")
            columns = [row[1] for row in cursor.fetchall()]

            if "platform_id" not in columns:
                cursor.execute(
                    "ALTER TABLE context_memory ADD COLUMN platform_id TEXT NOT NULL DEFAULT 'axiom-web'"
                )
                print("[Migration] Added context_memory.platform_id")

            if "memory_scope" not in columns:
                cursor.execute(
                    "ALTER TABLE context_memory ADD COLUMN memory_scope TEXT NOT NULL DEFAULT 'global'"
                )
                print("[Migration] Added context_memory.memory_scope")
        else:
            cursor.execute('''
                CREATE TABLE context_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    user_msg TEXT NOT NULL,
                    ai_response TEXT NOT NULL,
                    platform_id TEXT NOT NULL DEFAULT 'axiom-web',
                    memory_scope TEXT NOT NULL DEFAULT 'global' CHECK (memory_scope IN ('global', 'platform'))
                )
            ''')
            print("[Migration] Created context_memory table")

        # ── Step 2: Recreate user_topics with platform_id ─────────────────
        cursor.execute("PRAGMA table_info(user_topics)")
        topic_columns = [row[1] for row in cursor.fetchall()]
        if "platform_id" not in topic_columns:
            cursor.execute("DROP TABLE IF EXISTS user_topics")
            cursor.execute('''
                CREATE TABLE user_topics (
                    user_id TEXT NOT NULL,
                    platform_id TEXT NOT NULL DEFAULT 'axiom-web',
                    topic TEXT NOT NULL,
                    count INTEGER DEFAULT 1,
                    PRIMARY KEY (user_id, platform_id, topic)
                )
            ''')
            print("[Migration] Recreated user_topics with platform_id")

        # ── Step 3: Create platform_permissions ───────────────────────────
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS platform_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                owner_platform_id TEXT NOT NULL,
                requester_platform_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'denied' CHECK (status IN ('granted', 'denied', 'revoked')),
                granted_by_platform_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, owner_platform_id, requester_platform_id),
                CHECK (owner_platform_id != requester_platform_id)
            )
        ''')
        print("[Migration] Verified platform_permissions table")

        # ── Step 4: Create registered_platforms ───────────────────────────
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS registered_platforms (
                platform_id TEXT PRIMARY KEY,
                platform_key TEXT NOT NULL,
                display_name TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        ''')
        print("[Migration] Verified registered_platforms table")

        # ── Step 5: Create registered_users ───────────────────────────────
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS registered_users (
                user_id TEXT NOT NULL,
                platform_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (user_id, platform_id),
                FOREIGN KEY (platform_id) REFERENCES registered_platforms(platform_id)
            )
        ''')
        print("[Migration] Verified registered_users table")

        # ── Step 6: Create user_feedback if missing ───────────────────────
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                score REAL NOT NULL,
                timestamp TEXT NOT NULL
            )
        ''')

        # ── Step 7: Seed demo platforms and users ─────────────────────────
        now = datetime.utcnow().isoformat()
        for pid, pkey, pname in DEMO_PLATFORMS:
            cursor.execute(
                "INSERT OR IGNORE INTO registered_platforms (platform_id, platform_key, display_name, created_at) VALUES (?, ?, ?, ?)",
                (pid, pkey, pname, now)
            )
        for uid, pid, uname in DEMO_USERS:
            cursor.execute(
                "INSERT OR IGNORE INTO registered_users (user_id, platform_id, display_name, created_at) VALUES (?, ?, ?, ?)",
                (uid, pid, uname, now)
            )
        # Auto-register any existing legacy users found in context_memory
        cursor.execute('''
            INSERT OR IGNORE INTO registered_users (user_id, platform_id, display_name, created_at)
            SELECT DISTINCT user_id, 'axiom-web', user_id, ?
            FROM context_memory
        ''', (now,))
        print("[Migration] Seeded demo platforms and users")

        # ── Step 8: Validate migration and record preservation ────────────
        cursor.execute("SELECT COUNT(*) FROM context_memory")
        post_count = cursor.fetchone()[0]
        if post_count < pre_count:
            raise RuntimeError(f"Data loss detected: {pre_count} rows before migration, {post_count} after.")
        print(f"[Migration] context_memory has {post_count} rows (all {pre_count} preserved)")

        conn.commit()
        print("[Migration] Migration completed successfully.")

    except Exception as e:
        conn.rollback()
        conn.close()
        print(f"[Migration] ERROR during migration: {e}")
        if backup_path and os.path.exists(backup_path):
            shutil.copy2(backup_path, target_path)
            print(f"[Migration] Successfully rolled back to backup: {backup_path}")
        raise RuntimeError(f"Database migration failed and was rolled back: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass

def validate_identity(platform_id: str, platform_key: Optional[str], user_id: str, db_path: Optional[str] = None) -> Tuple[bool, str]:
    """
    Validates identity against registered_platforms and registered_users.
    
    Safeguards applied:
    - Registered platform check.
    - Platform key validation: external platforms must provide valid platform_key.
      For the first-party web UI (axiom-web), key is kept exclusively on backend
      and validated if supplied or omitted from browser.
    - User registration check for the platform.
    """
    conn = get_connection(db_path)
    cursor = conn.cursor()

    try:
        # 1. Platform registration check
        cursor.execute("SELECT platform_key FROM registered_platforms WHERE platform_id = ?", (platform_id,))
        row = cursor.fetchone()
        if not row:
            return False, "Unregistered platform"

        stored_key = row[0]

        # 2. Key check:
        # Platform key must match the registered platform credentials.
        if not platform_key or platform_key != stored_key:
            return False, "Invalid platform credentials"

        # 3. User registration for platform check
        cursor.execute(
            "SELECT 1 FROM registered_users WHERE user_id = ? AND platform_id = ?",
            (user_id, platform_id)
        )
        if not cursor.fetchone():
            return False, "User not registered on this platform"

        return True, "Identity verified"
    finally:
        conn.close()

if __name__ == "__main__":
    init_db()
    migrate_db()
    print(f"Database initialized and migrated at {DB_PATH}")
