"""
Adaptive Learning Engine
Tracks user topic preferences and adjusts response style per platform using SQLite.
Enforces cross-platform boundaries: only learns from authorized memories and never
leaks unauthorized topics across platforms.
"""

from typing import Dict, List, Optional
from datetime import datetime
from modules.database import get_connection

class AdaptiveLearningEngine:
    def __init__(self):
        # Stopwords list for keyword extraction
        self.stopwords = {
            "the", "a", "an", "is", "it", "i", "you", "what", "how", "can", "do",
            "and", "or", "but", "if", "then", "else", "when", "where", "why",
            "not", "for", "with", "as", "at", "by", "from", "to", "in", "on",
            "of", "that", "this", "these", "those", "be", "been", "being",
            "have", "has", "had", "do", "does", "did", "will", "would", "shall", "should"
        }

    def record_interaction(
        self,
        user_id: str,
        user_msg: str,
        ai_response: str,
        platform_id: str = "axiom-web"
    ):
        """
        Extracts keywords from user message and attributes topic counts to the originating platform.
        Prevents cross-platform topic contamination.
        """
        words = user_msg.lower().replace('?', '').replace('!', '').replace('.', '').split()
        keywords = [w for w in words if len(w) > 3 and w not in self.stopwords]

        if not keywords:
            return

        conn = get_connection()
        cursor = conn.cursor()

        for kw in keywords:
            cursor.execute('''
                INSERT INTO user_topics (user_id, platform_id, topic, count)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(user_id, platform_id, topic) DO UPDATE SET count = count + 1
            ''', (user_id, platform_id, kw))

        conn.commit()
        conn.close()

    def record_feedback(self, user_id: str, score: float):
        """Records explicit user satisfaction feedback."""
        conn = get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO user_feedback (user_id, score, timestamp)
            VALUES (?, ?, ?)
        ''', (user_id, score, datetime.utcnow().isoformat()))

        conn.commit()
        conn.close()

    def get_user_preferences(self, user_id: str, platform_id: Optional[str] = "axiom-web") -> dict:
        """
        Retrieves user topic preferences adhering to cross-platform authorization and precedence:
        - Priority 1: Platform-specific topics (originating on requesting platform).
        - Priority 2: Authorized cross-platform topics (originating on other platforms ONLY IF permission is granted).
        - Never exposes topics from platforms without an active 'granted' permission.
        - Clearly separates platform_topics from global_topics to avoid silent mixing.
        """
        conn = get_connection()
        cursor = conn.cursor()

        platform_topics = []
        global_topics = []

        if platform_id:
            # 1. Platform-specific topics (Priority 1)
            cursor.execute('''
                SELECT topic, count FROM user_topics
                WHERE user_id = ? AND platform_id = ?
                ORDER BY count DESC LIMIT 5
            ''', (user_id, platform_id))
            platform_topics = [r[0] for r in cursor.fetchall()]

            # 2. Authorized cross-platform topics (Priority 2)
            # Only includes topics from platforms that have explicitly granted permission to platform_id
            cursor.execute('''
                SELECT topic, SUM(count) as total FROM user_topics
                WHERE user_id = ? AND platform_id != ?
                AND platform_id IN (
                    SELECT owner_platform_id FROM platform_permissions
                    WHERE user_id = ? AND requester_platform_id = ? AND status = 'granted'
                )
                GROUP BY topic
                ORDER BY total DESC LIMIT 5
            ''', (user_id, platform_id, user_id, platform_id))
            raw_global_topics = [r[0] for r in cursor.fetchall()]

            # Exclude topics already present in platform_topics to preserve provenance
            seen = set(platform_topics)
            global_topics = [t for t in raw_global_topics if t not in seen]
        else:
            # Fallback across all topics if platform_id is omitted (backward compatibility)
            cursor.execute('''
                SELECT topic, SUM(count) as total FROM user_topics
                WHERE user_id = ?
                GROUP BY topic
                ORDER BY total DESC LIMIT 5
            ''', (user_id,))
            platform_topics = [r[0] for r in cursor.fetchall()]

        # Combine with platform-specific topics taking strict precedence
        top_topics = platform_topics + [t for t in global_topics if t not in platform_topics]
        top_topics = top_topics[:5]

        # Feedback score
        cursor.execute('SELECT AVG(score), COUNT(*) FROM user_feedback WHERE user_id = ?', (user_id,))
        row = cursor.fetchone()
        avg_score = row[0] if row else None

        # Total interactions tracked
        if platform_id:
            cursor.execute('SELECT SUM(count) FROM user_topics WHERE user_id = ? AND platform_id = ?', (user_id, platform_id))
        else:
            cursor.execute('SELECT SUM(count) FROM user_topics WHERE user_id = ?', (user_id,))
        total_interactions = cursor.fetchone()[0] or 0

        conn.close()

        return {
            "platform_topics": platform_topics,
            "global_topics": global_topics,
            "top_topics": top_topics,
            "average_feedback_score": avg_score,
            "total_interactions_tracked": total_interactions,
        }

    def get_response_style(self, user_id: str, platform_id: Optional[str] = "axiom-web") -> str:
        """Determines response style based on user preferences and feedback."""
        prefs = self.get_user_preferences(user_id, platform_id=platform_id)
        avg = prefs.get("average_feedback_score")

        if avg is None:
            # If user has demonstrated rich engagement on this platform, default to detailed
            if len(prefs.get("platform_topics", [])) >= 3:
                return "detailed"
            return "neutral"

        if avg >= 0.8:
            return "detailed"
        elif avg < 0.4:
            return "concise"
        return "neutral"
