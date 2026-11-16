"""
Context Memory Engine
Stores and retrieves per-user interaction history using SQLite.
Supports cross-platform memory isolation, selective context retrieval,
permission-based access control, and platform-specific precedence.
"""

import uuid
from typing import Optional, List, Dict
from datetime import datetime
from modules.database import get_connection, validate_identity

class ContextMemoryEngine:
    def __init__(self):
        pass

    def get_context(
        self,
        user_id: str,
        session_id: Optional[str] = None,
        platform_id: str = "axiom-web"
    ) -> List[dict]:
        """
        Retrieves context memory with SQL-level authorization filtering:
        1. Always includes the requesting platform's own memories (all scopes).
        2. Includes other platforms' memories ONLY IF:
           - memory_scope == 'global' (platform-local memories are NEVER shared)
           - An active permission with status == 'granted' exists for (user_id, owner_platform, requesting_platform)
        3. Applies conflict precedence: cross-platform memories appear first (background),
           own-platform memories appear last (foreground/precedence).
        """
        conn = get_connection()
        cursor = conn.cursor()

        # Defense-in-depth: Verify requesting user is registered on the requesting platform
        cursor.execute(
            "SELECT 1 FROM registered_users WHERE user_id = ? AND platform_id = ?",
            (user_id, platform_id)
        )
        if not cursor.fetchone():
            conn.close()
            return []

        # SQL query enforcing authorization and scope isolation at the database level
        query = '''
            SELECT cm.user_msg, cm.ai_response, cm.timestamp, cm.session_id, cm.platform_id, cm.memory_scope
            FROM context_memory cm
            WHERE cm.user_id = ?
            AND (
                -- Branch A: Own platform memories (both 'global' and 'platform' scopes)
                cm.platform_id = ?
                OR
                -- Branch B: Other platforms' GLOBAL memories ONLY if actively granted
                (
                    cm.memory_scope = 'global'
                    AND cm.platform_id IN (
                        SELECT pp.owner_platform_id
                        FROM platform_permissions pp
                        WHERE pp.user_id = ?
                          AND pp.requester_platform_id = ?
                          AND pp.status = 'granted'
                    )
                )
            )
        '''
        params = [user_id, platform_id, user_id, platform_id]

        if session_id:
            query += " AND cm.session_id = ?"
            params.append(session_id)

        query += " ORDER BY cm.timestamp DESC LIMIT 10"

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        conn.close()

        if not rows:
            return []

        # Conflict resolution / Precedence sorting:
        # Separate rows into own-platform and cross-platform
        own_rows = [r for r in rows if r[4] == platform_id]
        cross_rows = [r for r in rows if r[4] != platform_id]

        # Chronological within each group (reversed from DESC query order)
        # Cross-platform first (background context), own-platform last (direct precedence)
        ordered_rows = list(reversed(cross_rows)) + list(reversed(own_rows))

        return [
            {
                "user": r[0],
                "assistant": r[1],
                "timestamp": r[2],
                "session_id": r[3],
                "platform_id": r[4],
                "memory_scope": r[5]
            }
            for r in ordered_rows
        ]

    def update(
        self,
        user_id: str,
        user_msg: str,
        ai_response: str,
        session_id: str,
        platform_id: str = "axiom-web",
        memory_scope: str = "global"
    ):
        """
        Stores an interaction in context_memory.
        Ensures append-only storage (never silently overwrites existing records).
        """
        if memory_scope not in ("global", "platform"):
            raise ValueError(f"Invalid memory_scope '{memory_scope}'. Must be 'global' or 'platform'.")

        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO context_memory (
                user_id, session_id, timestamp, user_msg, ai_response, platform_id, memory_scope
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (user_id, session_id, datetime.utcnow().isoformat(), user_msg, ai_response, platform_id, memory_scope))

        conn.commit()
        conn.close()

    def create_session(self, user_id: str) -> str:
        return str(uuid.uuid4())

    def clear(self, user_id: str, platform_id: Optional[str] = None, scope: Optional[str] = "all"):
        """
        Clears conversation history and topics for a user with scope isolation.
        - scope == 'platform': only clears platform-local memories for that user and platform.
        - scope == 'global': only clears global memories for that user and platform.
        - scope == 'all': clears all memories and topics for that user and platform.
        - Memories belonging to other platforms are never touched.
        """
        conn = get_connection()
        cursor = conn.cursor()

        if platform_id:
            if scope == "platform":
                cursor.execute('DELETE FROM context_memory WHERE user_id = ? AND platform_id = ? AND memory_scope = "platform"', (user_id, platform_id))
            elif scope == "global":
                cursor.execute('DELETE FROM context_memory WHERE user_id = ? AND platform_id = ? AND memory_scope = "global"', (user_id, platform_id))
            else:
                cursor.execute('DELETE FROM context_memory WHERE user_id = ? AND platform_id = ?', (user_id, platform_id))
                cursor.execute('DELETE FROM user_topics WHERE user_id = ? AND platform_id = ?', (user_id, platform_id))
        else:
            if scope == "platform":
                cursor.execute('DELETE FROM context_memory WHERE user_id = ? AND memory_scope = "platform"', (user_id,))
            elif scope == "global":
                cursor.execute('DELETE FROM context_memory WHERE user_id = ? AND memory_scope = "global"', (user_id,))
            else:
                cursor.execute('DELETE FROM context_memory WHERE user_id = ?', (user_id,))
                cursor.execute('DELETE FROM user_topics WHERE user_id = ?', (user_id,))

        conn.commit()
        conn.close()

    def get_sessions(self, user_id: str, platform_id: Optional[str] = None) -> List[dict]:
        """
        Returns sessions for a user, optionally filtered by originating platform.
        """
        conn = get_connection()
        cursor = conn.cursor()

        if platform_id:
            cursor.execute('''
                SELECT session_id, user_msg, MIN(timestamp) as start_time 
                FROM context_memory 
                WHERE user_id = ? AND platform_id = ?
                GROUP BY session_id 
                ORDER BY start_time DESC
            ''', (user_id, platform_id))
        else:
            cursor.execute('''
                SELECT session_id, user_msg, MIN(timestamp) as start_time 
                FROM context_memory 
                WHERE user_id = ? 
                GROUP BY session_id 
                ORDER BY start_time DESC
            ''', (user_id,))

        rows = cursor.fetchall()
        conn.close()
        return [{"session_id": r[0], "title": r[1][:50], "timestamp": r[2]} for r in rows]

    def get_user_profile(self, user_id: str, platform_id: Optional[str] = None) -> dict:
        """
        Returns interaction stats for a user, optionally filtered by platform.
        """
        conn = get_connection()
        cursor = conn.cursor()

        if platform_id:
            cursor.execute(
                'SELECT COUNT(*), MIN(timestamp), MAX(timestamp) FROM context_memory WHERE user_id = ? AND platform_id = ?',
                (user_id, platform_id)
            )
        else:
            cursor.execute(
                'SELECT COUNT(*), MIN(timestamp), MAX(timestamp) FROM context_memory WHERE user_id = ?',
                (user_id,)
            )

        row = cursor.fetchone()
        conn.close()

        return {
            "total_interactions": row[0] if row else 0,
            "first_seen": row[1] if row else None,
            "last_seen": row[2] if row else None,
        }

    def set_permission(
        self,
        user_id: str,
        owner_platform_id: str,
        requester_platform_id: str,
        status: str,
        acting_platform_id: str,
        acting_platform_key: Optional[str] = None
    ) -> dict:
        """
        Grants, revokes, or denies cross-platform access to global memories.
        
        Authorization Rules:
        1. Only the owner platform can grant or revoke access (acting_platform_id == owner_platform_id).
        2. A platform cannot grant itself permissions (owner_platform_id != requester_platform_id).
        3. Validates identity of the acting platform.
        4. Validates that the requester platform exists.
        """
        # Rule 1: Memory-owner authorization
        if acting_platform_id != owner_platform_id:
            raise PermissionError(
                f"Platform '{acting_platform_id}' is not authorized to manage permissions for owner '{owner_platform_id}'"
            )

        # Rule 2: Prevent self-grant
        if owner_platform_id == requester_platform_id:
            raise ValueError("A platform cannot grant itself permissions")

        # Status validation
        if status not in ("granted", "denied", "revoked"):
            raise ValueError(f"Invalid status '{status}'. Must be 'granted', 'denied', or 'revoked'.")

        # Resolve acting platform key for internal axiom-web backend caller
        import os
        effective_key = acting_platform_key
        if not effective_key and acting_platform_id == "axiom-web":
            effective_key = os.getenv("AXIOM_WEB_KEY", "axiom-secret-key-2026")

        # Identity validation of acting platform
        is_valid, reason = validate_identity(acting_platform_id, effective_key, user_id)
        if not is_valid:
            raise PermissionError(f"Authentication failed for acting platform: {reason}")

        conn = get_connection()
        cursor = conn.cursor()

        # Verify requester platform exists
        cursor.execute("SELECT 1 FROM registered_platforms WHERE platform_id = ?", (requester_platform_id,))
        if not cursor.fetchone():
            conn.close()
            raise ValueError(f"Requester platform '{requester_platform_id}' is not a registered platform")

        now = datetime.utcnow().isoformat()

        cursor.execute('''
            INSERT INTO platform_permissions (
                user_id, owner_platform_id, requester_platform_id,
                status, granted_by_platform_id, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, owner_platform_id, requester_platform_id)
            DO UPDATE SET
                status = excluded.status,
                granted_by_platform_id = excluded.granted_by_platform_id,
                updated_at = excluded.updated_at
        ''', (user_id, owner_platform_id, requester_platform_id, status, acting_platform_id, now, now))

        conn.commit()

        # Fetch and return the stored record
        cursor.execute('''
            SELECT id, user_id, owner_platform_id, requester_platform_id, status, granted_by_platform_id, created_at, updated_at
            FROM platform_permissions
            WHERE user_id = ? AND owner_platform_id = ? AND requester_platform_id = ?
        ''', (user_id, owner_platform_id, requester_platform_id))
        rec = cursor.fetchone()
        conn.close()

        return {
            "id": rec[0],
            "user_id": rec[1],
            "owner_platform_id": rec[2],
            "requester_platform_id": rec[3],
            "status": rec[4],
            "granted_by_platform_id": rec[5],
            "created_at": rec[6],
            "updated_at": rec[7],
        }

    def get_permissions(self, user_id: str, platform_id: Optional[str] = None) -> List[dict]:
        """
        Retrieves permission records for a given user.
        If platform_id is specified, only returns permissions where that platform
        is the owner or the requester (preventing unauthorized cross-platform snooping).
        """
        conn = get_connection()
        cursor = conn.cursor()

        if platform_id:
            cursor.execute('''
                SELECT id, user_id, owner_platform_id, requester_platform_id, status, granted_by_platform_id, created_at, updated_at
                FROM platform_permissions
                WHERE user_id = ? AND (owner_platform_id = ? OR requester_platform_id = ?)
                ORDER BY updated_at DESC
            ''', (user_id, platform_id, platform_id))
        else:
            cursor.execute('''
                SELECT id, user_id, owner_platform_id, requester_platform_id, status, granted_by_platform_id, created_at, updated_at
                FROM platform_permissions
                WHERE user_id = ?
                ORDER BY updated_at DESC
            ''', (user_id,))
        rows = cursor.fetchall()
        conn.close()

        return [
            {
                "id": r[0],
                "user_id": r[1],
                "owner_platform_id": r[2],
                "requester_platform_id": r[3],
                "status": r[4],
                "granted_by_platform_id": r[5],
                "created_at": r[6],
                "updated_at": r[7],
            }
            for r in rows
        ]

    def get_platforms(self, user_id: str) -> List[str]:
        """
        Returns list of distinct platforms associated with the user.
        """
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT DISTINCT platform_id FROM registered_users WHERE user_id = ?
            UNION
            SELECT DISTINCT platform_id FROM context_memory WHERE user_id = ?
        ''', (user_id, user_id))
        rows = cursor.fetchall()
        conn.close()

        return [r[0] for r in rows if r[0]]
