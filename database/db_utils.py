"""
Database connection utility for Tata Attendance Insights.
Provides helper functions for connecting to MySQL and running queries.
"""

import mysql.connector
from mysql.connector import Error
from db_config import DB_CONFIG


def get_connection(use_database=True):
    """
    Create and return a MySQL connection.
    If use_database=False, connects without selecting a database (for initial setup).
    """
    try:
        config = DB_CONFIG.copy()
        if not use_database:
            config.pop("database", None)

        connection = mysql.connector.connect(**config)
        if connection.is_connected():
            return connection
    except Error as e:
        print(f"❌ Error connecting to MySQL: {e}")
        return None


def execute_query(query, params=None, fetch=False):
    """Execute a single query. Optionally fetch results."""
    connection = get_connection()
    if not connection:
        return None

    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(query, params)

        if fetch:
            result = cursor.fetchall()
            return result
        else:
            connection.commit()
            return cursor.rowcount
    except Error as e:
        print(f"❌ Query error: {e}")
        return None
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()


def execute_many(query, data_list):
    """Execute a query with multiple rows of data (batch insert)."""
    connection = get_connection()
    if not connection:
        return None

    try:
        cursor = connection.cursor()
        cursor.executemany(query, data_list)
        connection.commit()
        return cursor.rowcount
    except Error as e:
        print(f"❌ Batch query error: {e}")
        return None
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()


def execute_script(sql_script):
    """Execute a multi-statement SQL script."""
    connection = get_connection(use_database=False)
    if not connection:
        return False

    try:
        cursor = connection.cursor()
        for statement in sql_script.split(";"):
            statement = statement.strip()
            if statement and not statement.startswith("--"):
                cursor.execute(statement)
        connection.commit()
        return True
    except Error as e:
        print(f"❌ Script execution error: {e}")
        return False
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()
