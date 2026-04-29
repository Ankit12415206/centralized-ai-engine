"""
Adaptive Learning Engine
Tracks user topic preferences and adjusts response style using SQLite.
"""

from typing import Dict, List
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

    def record_interaction(self, user_id: str, user_msg: str, ai_response: str):
        # Extract keywords
        words = user_msg.lower().replace('?', '').replace('!', '').replace('.', '').split()
        keywords = [w for w in words if len(w) > 3 and w not in self.stopwords]
        
        if not keywords:
            return

        conn = get_connection()
        cursor = conn.cursor()
        
        for kw in keywords:
            cursor.execute('''
                INSERT INTO user_topics (user_id, topic, count)
                VALUES (?, ?, 1)
                ON CONFLICT(user_id, topic) DO UPDATE SET count = count + 1
            ''', (user_id, kw))
            
        conn.commit()
        conn.close()

    def record_feedback(self, user_id: str, score: float):
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT INTO user_feedback (user_id, score, timestamp)
            VALUES (?, ?, ?)
        ''', (user_id, score, datetime.utcnow().isoformat()))
        
        conn.commit()
        conn.close()

    def get_user_preferences(self, user_id: str) -> dict:
        conn = get_connection()
        cursor = conn.cursor()
        
        # Get top topics
        cursor.execute('''
            SELECT topic FROM user_topics 
            WHERE user_id = ? 
            ORDER BY count DESC LIMIT 5
        ''', (user_id,))
        top_topics = [r[0] for r in cursor.fetchall()]
        
        # Get average feedback
        cursor.execute('SELECT AVG(score), COUNT(*) FROM user_feedback WHERE user_id = ?', (user_id,))
        avg_score, feedback_count = cursor.fetchone()
        
        # Get total interactions (sum of topic counts as a proxy)
        cursor.execute('SELECT SUM(count) FROM user_topics WHERE user_id = ?', (user_id,))
        total_interactions = cursor.fetchone()[0] or 0
        
        conn.close()
        
        return {
            "top_topics": top_topics,
            "average_feedback_score": avg_score,
            "total_interactions_tracked": total_interactions,
        }

    def get_response_style(self, user_id: str) -> str:
        prefs = self.get_user_preferences(user_id)
        avg = prefs["average_feedback_score"]
        
        if avg is None:
            return "neutral"
        if avg >= 0.8:
            return "detailed"
        elif avg < 0.4:
            return "concise"
        return "neutral"