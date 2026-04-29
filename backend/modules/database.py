import sqlite3
import os
from typing import List, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "ai_engine.db")

def get_connection():
    return sqlite3.connect(DB_PATH)

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Context Memory Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS context_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            user_msg TEXT NOT NULL,
            ai_response TEXT NOT NULL
        )
    ''')
    
    # Adaptive Learning Topics Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_topics (
            user_id TEXT NOT NULL,
            topic TEXT NOT NULL,
            count INTEGER DEFAULT 1,
            PRIMARY KEY (user_id, topic)
        )
    ''')
    
    # Adaptive Learning Feedback Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            score REAL NOT NULL,
            timestamp TEXT NOT NULL
        )
    ''')
    
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print(f"Database initialized at {DB_PATH}")
