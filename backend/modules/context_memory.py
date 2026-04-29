"""
Context Memory Engine
Stores and retrieves per-user interaction history using SQLite.
"""

import uuid
from typing import Optional, List, Dict
from datetime import datetime
from modules.database import get_connection

class ContextMemoryEngine:
    def __init__(self):
        # We don't need in-memory store anymore for production, 
        # but we can keep a session cache if needed.
        pass

    def get_context(self, user_id: str, session_id: Optional[str] = None) -> List[dict]:
        conn = get_connection()
        cursor = conn.cursor()
        
        if session_id:
            cursor.execute('''
                SELECT user_msg, ai_response FROM context_memory 
                WHERE user_id = ? AND session_id = ? 
                ORDER BY timestamp DESC LIMIT 10
            ''', (user_id, session_id))
        else:
            cursor.execute('''
                SELECT user_msg, ai_response FROM context_memory 
                WHERE user_id = ? 
                ORDER BY timestamp DESC LIMIT 10
            ''', (user_id,))
            
        rows = cursor.fetchall()
        conn.close()
        
        # Convert to the format expected by ReasoningEngine (reverse to maintain chronological order)
        return [{"user": r[0], "assistant": r[1]} for r in reversed(rows)]

    def update(self, user_id: str, user_msg: str, ai_response: str, session_id: str):
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO context_memory (user_id, session_id, timestamp, user_msg, ai_response)
            VALUES (?, ?, ?, ?, ?)
        ''', (user_id, session_id, datetime.utcnow().isoformat(), user_msg, ai_response))
        
        conn.commit()
        conn.close()

    def create_session(self, user_id: str) -> str:
        return str(uuid.uuid4())

    def clear(self, user_id: str):
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM context_memory WHERE user_id = ?', (user_id,))
        conn.commit()
        conn.close()

    def get_sessions(self, user_id: str) -> List[dict]:
        conn = get_connection()
        cursor = conn.cursor()
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

    def get_user_profile(self, user_id: str) -> dict:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*), MIN(timestamp), MAX(timestamp) FROM context_memory WHERE user_id = ?', (user_id,))
        row = cursor.fetchone()
        conn.close()
        
        return {
            "total_interactions": row[0] if row else 0,
            "first_seen": row[1] if row else None,
            "last_seen": row[2] if row else None,
        }