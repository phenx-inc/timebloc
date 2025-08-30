// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod search;
mod services;
mod commands;
mod calendar;
mod crypto;

use rusqlite::{Connection, Result as SqlResult};
use std::sync::{Arc, Mutex};
use tauri::{State, Manager};
use anyhow::Result;

use models::*;
use search::SearchService;
use services::FileService;
use commands::*;
use calendar::CalendarService;

// Application state
pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub search: Arc<SearchService>,
    pub files: Arc<FileService>,
    pub calendar: Arc<CalendarService>,
}

fn init_database(conn: &Connection) -> SqlResult<()> {
    // Enhanced time blocks with flexible intervals
    conn.execute(
        "CREATE TABLE IF NOT EXISTS time_blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            start_minutes INTEGER NOT NULL,  -- Minutes from midnight (0-1439)
            duration_minutes INTEGER NOT NULL,  -- 5, 15, 30, 60, etc.
            title TEXT NOT NULL,
            notes_file TEXT,  -- Path to markdown file
            color TEXT DEFAULT '#3b82f6',
            tags TEXT,  -- JSON array of tags
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // File attachments (images, documents)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            time_block_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,  -- 'image', 'document', 'audio'
            file_size INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(time_block_id) REFERENCES time_blocks(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Settings for time intervals and preferences
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Priorities (keeping existing structure but enhanced)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS priorities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            content TEXT NOT NULL,
            completed BOOLEAN DEFAULT FALSE,
            priority_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Brain dumps (enhanced with metadata)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS brain_dumps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Full-text search table
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS content_search USING fts5(
            title,
            content,
            tags,
            date,
            time_block_id UNINDEXED,
            content_rowid UNINDEXED
        )",
        [],
    )?;

    // Calendar connections table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS calendar_connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            account_name TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            calendar_list TEXT DEFAULT '[]',
            last_sync DATETIME,
            enabled BOOLEAN DEFAULT TRUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // Calendar events table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS calendar_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connection_id INTEGER NOT NULL,
            external_id TEXT NOT NULL,
            calendar_id TEXT NOT NULL,
            title TEXT NOT NULL,
            start_time DATETIME NOT NULL,
            end_time DATETIME NOT NULL,
            description TEXT,
            location TEXT,
            is_all_day BOOLEAN DEFAULT FALSE,
            attendees TEXT DEFAULT '[]',
            last_updated DATETIME NOT NULL,
            FOREIGN KEY(connection_id) REFERENCES calendar_connections(id) ON DELETE CASCADE,
            UNIQUE(connection_id, external_id)
        )",
        [],
    )?;

    // Insert default settings
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value) VALUES 
        ('default_time_interval', '30'),
        ('available_intervals', '[5, 15, 30, 60]'),
        ('work_hours_start', '480'),
        ('work_hours_end', '1020'),
        ('calendar_sync_interval', '5')",
        [],
    )?;

    Ok(())
}

// Keep existing brain dump and priorities functions for now
#[tauri::command]
fn get_priorities(date: String, state: State<AppState>) -> Result<Vec<Priority>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, date, content, completed, priority_order FROM priorities 
         WHERE date = ?1 ORDER BY priority_order"
    ).map_err(|e| e.to_string())?;
    
    let priorities_iter = stmt.query_map([date], |row| {
        Ok(Priority {
            id: Some(row.get(0)?),
            date: row.get(1)?,
            content: row.get(2)?,
            completed: row.get(3)?,
            priority_order: row.get(4).unwrap_or(0),
            created_at: None,
        })
    }).map_err(|e| e.to_string())?;

    let mut priorities = Vec::new();
    for priority in priorities_iter {
        priorities.push(priority.map_err(|e| e.to_string())?);
    }
    
    Ok(priorities)
}

#[tauri::command]
fn get_time_blocks(date: String, state: State<AppState>) -> Result<Vec<TimeBlock>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, date, start_minutes, duration_minutes, title, notes_file, color, tags, created_at, updated_at 
         FROM time_blocks WHERE date = ?1 ORDER BY start_minutes"
    ).map_err(|e| e.to_string())?;
    
    let blocks_iter = stmt.query_map([date], |row| {
        let tags_str: String = row.get(7).unwrap_or_default();
        let tags: Vec<String> = if tags_str.is_empty() {
            Vec::new()
        } else {
            serde_json::from_str(&tags_str).unwrap_or_default()
        };
        
        Ok(TimeBlock {
            id: Some(row.get(0)?),
            date: row.get(1)?,
            start_minutes: row.get(2)?,
            duration_minutes: row.get(3)?,
            title: row.get(4)?,
            notes_file: row.get(5)?,
            color: row.get(6).unwrap_or_else(|_| "#3b82f6".to_string()),
            tags,
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut blocks = Vec::new();
    for block in blocks_iter {
        blocks.push(block.map_err(|e| e.to_string())?);
    }
    
    Ok(blocks)
}

#[tauri::command]
fn get_brain_dump(date: String, state: State<AppState>) -> Result<String, String> {
    println!("🦀 RUST: Getting brain dump for date: {}", date);
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT content FROM brain_dumps WHERE date = ?1 ORDER BY updated_at DESC LIMIT 1")
        .map_err(|e| e.to_string())?;
    
    match stmt.query_row([&date], |row| {
        Ok(row.get::<_, String>(0)?)
    }) {
        Ok(content) => {
            println!("🦀 RUST: Found content: {}", content);
            Ok(content)
        },
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            println!("🦀 RUST: No content found for date {}", date);
            Ok(String::new())
        },
        Err(e) => {
            println!("🦀 RUST: Error getting brain dump: {}", e);
            Err(e.to_string())
        },
    }
}

#[tauri::command]
fn save_brain_dump(date: String, content: String, state: State<AppState>) -> Result<(), String> {
    println!("🦀 RUST: Saving brain dump for date: {}, content length: {}, content: {}", date, content.len(), content);
    let conn = state.db.lock().unwrap();
    
    // Delete existing brain dump for the date
    conn.execute("DELETE FROM brain_dumps WHERE date = ?1", [&date])
        .map_err(|e| e.to_string())?;
    
    // Insert new content if not empty
    if !content.is_empty() {
        println!("🦀 RUST: Inserting content into database");
        conn.execute(
            "INSERT INTO brain_dumps (date, content) VALUES (?1, ?2)",
            (date, content),
        ).map_err(|e| e.to_string())?;
        println!("🦀 RUST: Content inserted successfully");
    } else {
        println!("🦀 RUST: Content is empty, skipping insert");
    }
    
    Ok(())
}

// Calendar commands
#[tauri::command]
fn get_google_auth_url(client_id: String, redirect_uri: String, state: State<AppState>) -> Result<String, String> {
    Ok(state.calendar.get_google_auth_url(&client_id, &redirect_uri))
}

#[tauri::command]
fn start_google_oauth(
    client_id: String,
    _client_secret: String,
    state: State<AppState>
) -> Result<String, String> {
    // For now, let's use the out-of-band flow which is simpler
    let redirect_uri = "urn:ietf:wg:oauth:2.0:oob";
    
    // Get the OAuth URL
    let auth_url = state.calendar.get_google_auth_url(&client_id, redirect_uri);
    
    // Open browser with OAuth URL (platform-specific)
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open")
        .arg(&auth_url)
        .spawn();
    
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd")
        .args(["/C", "start", &auth_url])
        .spawn();
    
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open")
        .arg(&auth_url)
        .spawn();
    
    // Return the auth URL so the frontend knows the process started
    Ok(auth_url)
}

#[tauri::command]
async fn complete_google_oauth(
    authorization_code: String,
    client_id: String,
    client_secret: String,
    state: State<'_, AppState>
) -> Result<String, String> {
    let redirect_uri = "urn:ietf:wg:oauth:2.0:oob";
    
    // Exchange code for tokens
    let (access_token, refresh_token) = state.calendar
        .exchange_code_for_tokens(&authorization_code, &client_id, &client_secret, redirect_uri)
        .await
        .map_err(|e| e.to_string())?;

    // Get user info
    let account_name = state.calendar
        .get_google_user_info(&access_token)
        .await
        .map_err(|e| e.to_string())?;

    // Save connection
    let connection = CalendarConnection {
        id: None,
        provider: "google".to_string(),
        account_name: account_name.clone(),
        access_token,
        refresh_token,
        calendar_list: vec!["primary".to_string()], // Default to primary calendar
        last_sync: None,
        enabled: true,
        created_at: None,
    };

    state.calendar
        .save_connection(&connection)
        .map_err(|e| e.to_string())?;

    Ok(account_name)
}

#[tauri::command]
async fn exchange_google_code(
    code: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    state: State<'_, AppState>
) -> Result<String, String> {
    let (access_token, refresh_token) = state.calendar
        .exchange_code_for_tokens(&code, &client_id, &client_secret, &redirect_uri)
        .await
        .map_err(|e| e.to_string())?;

    // Get user info
    let account_name = state.calendar
        .get_google_user_info(&access_token)
        .await
        .map_err(|e| e.to_string())?;

    // Save connection
    let connection = CalendarConnection {
        id: None,
        provider: "google".to_string(),
        account_name: account_name.clone(),
        access_token,
        refresh_token,
        calendar_list: vec!["primary".to_string()], // Default to primary calendar
        last_sync: None,
        enabled: true,
        created_at: None,
    };

    state.calendar
        .save_connection(&connection)
        .map_err(|e| e.to_string())?;

    Ok(account_name)
}

#[tauri::command]
fn get_calendar_connections(state: State<AppState>) -> Result<Vec<CalendarConnection>, String> {
    println!("🔥 Rust: get_calendar_connections called");
    match state.calendar.get_connections() {
        Ok(connections) => {
            println!("🔥 Rust: Found {} connections in database", connections.len());
            for conn in &connections {
                println!("🔥 Rust: Connection - ID: {:?}, Provider: {}, Account: {}", 
                    conn.id, conn.provider, conn.account_name);
            }
            Ok(connections)
        },
        Err(e) => {
            println!("🔥 Rust: Error getting connections: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn get_calendar_events(date: String, state: State<AppState>) -> Result<Vec<CalendarEvent>, String> {
    // Get events for the specific date
    state.calendar
        .get_events_for_date_range(&date, &date)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_calendars(state: State<'_, AppState>) -> Result<i32, String> {
    state.calendar
        .sync_all_calendars()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_firebase_calendar_connection(connection: serde_json::Value, state: State<'_, AppState>) -> Result<(), String> {
    println!("🔥 Rust: save_firebase_calendar_connection called");
    println!("🔥 Rust: Raw connection data: {}", connection);
    
    let firebase_connection = CalendarConnection {
        id: None,
        provider: connection["provider"].as_str().unwrap_or("").to_string(),
        account_name: connection["account_name"].as_str().unwrap_or("").to_string(),
        access_token: connection["access_token"].as_str().unwrap_or("").to_string(),
        refresh_token: connection["refresh_token"].as_str().map(|s| s.to_string()),
        calendar_list: vec!["primary".to_string()],
        last_sync: None,
        enabled: true,
        created_at: None,
    };

    println!("🔥 Rust: Parsed connection - provider: {}, account: {}, token_length: {}", 
        firebase_connection.provider, 
        firebase_connection.account_name,
        firebase_connection.access_token.len()
    );

    match state.calendar.save_connection(&firebase_connection) {
        Ok(id) => {
            println!("🔥 Rust: Connection saved successfully with ID: {}", id);
            Ok(())
        },
        Err(e) => {
            println!("🔥 Rust: Failed to save connection: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn remove_calendar_connection(connection_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    
    // Parse connection ID to extract the numeric ID if needed
    let numeric_id = if let Ok(id) = connection_id.parse::<i64>() {
        id
    } else {
        // If it's in format "provider-uid", we need to find it in the database
        let mut stmt = conn.prepare(
            "SELECT id FROM calendar_connections WHERE provider || '-' || id = ?1"
        ).map_err(|e| e.to_string())?;
        
        let mut rows = stmt.query_map([&connection_id], |row| {
            Ok(row.get::<_, i64>(0)?)
        }).map_err(|e| e.to_string())?;
        
        if let Some(row) = rows.next() {
            row.map_err(|e| e.to_string())?
        } else {
            return Err(format!("Connection not found: {}", connection_id));
        }
    };
    
    // Delete the connection
    let affected = conn.execute(
        "DELETE FROM calendar_connections WHERE id = ?1",
        [numeric_id]
    ).map_err(|e| e.to_string())?;
    
    if affected == 0 {
        return Err(format!("Connection not found: {}", connection_id));
    }
    
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Get data directory
            let data_dir = app.path_resolver()
                .app_data_dir()
                .expect("Failed to get app data directory");
            
            println!("🔥 App data directory: {:?}", data_dir);
            
            std::fs::create_dir_all(&data_dir)?;
            
            // Initialize database
            let db_path = data_dir.join("timeblock.db");
            println!("🔥 Database path: {:?}", db_path);
            
            let conn = Connection::open(&db_path)
                .expect("Failed to open database");
            init_database(&conn)
                .expect("Failed to initialize database");
            
            println!("🔥 Database initialized successfully");
            
            // Wrap database connection for sharing
            let db_arc = Arc::new(Mutex::new(conn));
            
            // Initialize services
            let search_service = SearchService::new(&data_dir)
                .expect("Failed to initialize search service");
            let file_service = FileService::new(data_dir.clone())
                .expect("Failed to initialize file service");
            let calendar_service = CalendarService::new(db_arc.clone(), data_dir.clone());
            
            // Setup application state
            let app_state = AppState {
                db: db_arc,
                search: Arc::new(search_service),
                files: Arc::new(file_service),
                calendar: Arc::new(calendar_service),
            };
            
            app.manage(app_state);
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_time_blocks,
            save_time_block,
            delete_time_block,
            get_priorities,
            save_priorities,
            get_brain_dump,
            save_brain_dump,
            search_content,
            get_settings,
            update_setting,
            get_available_intervals,
            load_notes,
            save_attachment,
            get_attachments,
            load_attachment,
            get_time_block_notes,
            get_google_auth_url,
            exchange_google_code,
            start_google_oauth,
            complete_google_oauth,
            get_calendar_connections,
            get_calendar_events,
            sync_calendars,
            save_firebase_calendar_connection,
            remove_calendar_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}