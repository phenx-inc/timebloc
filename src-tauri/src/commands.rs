use tauri::State;
use crate::{AppState, models::*};

#[tauri::command]
pub fn save_time_block(block: TimeBlock, notes_content: Option<String>, state: State<AppState>) -> Result<i64, String> {
    let conn = state.db.lock().unwrap();
    let tags_json = serde_json::to_string(&block.tags).unwrap_or_default();
    
    let block_id = if let Some(id) = block.id {
        // Update existing
        conn.execute(
            "UPDATE time_blocks SET start_minutes = ?1, duration_minutes = ?2, title = ?3, 
             notes_file = ?4, color = ?5, tags = ?6, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?7",
            (block.start_minutes, block.duration_minutes, &block.title, 
             &block.notes_file, &block.color, tags_json, id),
        ).map_err(|e| e.to_string())?;
        id
    } else {
        // Insert new
        conn.execute(
            "INSERT INTO time_blocks (date, start_minutes, duration_minutes, title, notes_file, color, tags)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            (&block.date, block.start_minutes, block.duration_minutes, 
             &block.title, &block.notes_file, &block.color, tags_json),
        ).map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };
    
    // Save notes file if provided
    if let Some(content) = notes_content {
        let mut updated_block = block.clone();
        updated_block.id = Some(block_id);
        let notes_path = state.files.save_notes(&updated_block, &content)
            .map_err(|e| e.to_string())?;
        
        // Update notes_file path in database
        conn.execute(
            "UPDATE time_blocks SET notes_file = ?1 WHERE id = ?2",
            (notes_path, block_id),
        ).map_err(|e| e.to_string())?;
        
        // Index for search
        if let Err(e) = state.search.index_time_block(&updated_block, &content) {
            eprintln!("Failed to index time block: {}", e);
        }
    }
    
    Ok(block_id)
}

#[tauri::command]
pub fn delete_time_block(block_id: i64, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    
    // Get notes file path before deletion
    let mut stmt = conn.prepare("SELECT notes_file FROM time_blocks WHERE id = ?1")
        .map_err(|e| e.to_string())?;
    
    if let Ok(notes_file) = stmt.query_row([block_id], |row| {
        Ok(row.get::<_, Option<String>>(0)?)
    }) {
        if let Some(file_path) = notes_file {
            let _ = state.files.delete_notes(&file_path);
        }
    }
    
    // Delete attachments
    let mut stmt = conn.prepare("SELECT file_path FROM attachments WHERE time_block_id = ?1")
        .map_err(|e| e.to_string())?;
    
    let attachment_paths: Vec<String> = stmt.query_map([block_id], |row| {
        Ok(row.get(0)?)
    }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    
    for path in attachment_paths {
        let _ = state.files.delete_attachment(&path);
    }
    
    // Delete from database
    conn.execute("DELETE FROM time_blocks WHERE id = ?1", [block_id])
        .map_err(|e| e.to_string())?;
    
    // Remove from search index
    if let Err(e) = state.search.delete_time_block(block_id) {
        eprintln!("Failed to remove from search index: {}", e);
    }
    
    Ok(())
}

#[tauri::command]
pub fn save_priorities(date: String, priorities: Vec<String>, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    
    // Delete existing priorities for the date
    conn.execute("DELETE FROM priorities WHERE date = ?1", [&date])
        .map_err(|e| e.to_string())?;
    
    // Insert new priorities
    for (index, content) in priorities.iter().enumerate() {
        if !content.trim().is_empty() {
            conn.execute(
                "INSERT INTO priorities (date, content, priority_order) VALUES (?1, ?2, ?3)",
                (date.clone(), content, index as i32),
            ).map_err(|e| e.to_string())?;
        }
    }
    
    Ok(())
}

#[tauri::command]
pub fn search_content(query: String, limit: Option<usize>, state: State<AppState>) -> Result<Vec<SearchResult>, String> {
    let search_limit = limit.unwrap_or(20);
    state.search.search(&query, search_limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Result<std::collections::HashMap<String, String>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;
    
    let settings_iter = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;
    
    let mut settings = std::collections::HashMap::new();
    for setting in settings_iter {
        let (key, value) = setting.map_err(|e| e.to_string())?;
        settings.insert(key, value);
    }
    
    Ok(settings)
}

#[tauri::command]
pub fn update_setting(key: String, value: String, state: State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        (key, value),
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn load_notes(notes_file: String, state: State<AppState>) -> Result<String, String> {
    state.files.load_notes(&notes_file)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_available_intervals(state: State<AppState>) -> Result<Vec<TimeInterval>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'available_intervals'")
        .map_err(|e| e.to_string())?;
    
    let intervals_json = stmt.query_row([], |row| {
        Ok(row.get::<_, String>(0)?)
    }).map_err(|e| e.to_string())?;
    
    let intervals: Vec<i32> = serde_json::from_str(&intervals_json)
        .unwrap_or(vec![5, 15, 30, 60]);
    
    let time_intervals: Vec<TimeInterval> = intervals.into_iter().map(|minutes| {
        let label = if minutes >= 60 {
            let hours = minutes / 60;
            let remaining_minutes = minutes % 60;
            if remaining_minutes == 0 {
                format!("{} hour{}", hours, if hours > 1 { "s" } else { "" })
            } else {
                format!("{}h {}m", hours, remaining_minutes)
            }
        } else {
            format!("{} min", minutes)
        };
        
        TimeInterval { minutes, label }
    }).collect();
    
    Ok(time_intervals)
}

#[tauri::command]
pub fn save_attachment(
    time_block_id: i64,
    date: String,
    file_data: Vec<u8>,
    filename: String,
    file_type: String,
    state: State<AppState>
) -> Result<String, String> {
    // Save file to disk
    let file_path = state.files.save_attachment(time_block_id, &date, &file_data, &filename)
        .map_err(|e| e.to_string())?;
    
    // Save to database
    let conn = state.db.lock().unwrap();
    conn.execute(
        "INSERT INTO attachments (time_block_id, file_path, file_name, file_type, file_size) 
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (time_block_id, &file_path, &filename, &file_type, file_data.len() as i64)
    ).map_err(|e| e.to_string())?;
    
    Ok(file_path)
}

#[tauri::command]
pub fn get_attachments(time_block_id: i64, state: State<AppState>) -> Result<Vec<crate::models::Attachment>, String> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, time_block_id, file_path, file_name, file_type, file_size, created_at 
         FROM attachments WHERE time_block_id = ?1 ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;
    
    let attachments = stmt.query_map([time_block_id], |row| {
        Ok(crate::models::Attachment {
            id: row.get(0)?,
            time_block_id: row.get(1)?,
            file_path: row.get(2)?,
            file_name: row.get(3)?,
            file_type: row.get(4)?,
            file_size: row.get(5)?,
            created_at: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut result = Vec::new();
    for attachment in attachments {
        result.push(attachment.map_err(|e| e.to_string())?);
    }
    
    Ok(result)
}

#[tauri::command]
pub fn load_attachment(file_path: String, state: State<AppState>) -> Result<Vec<u8>, String> {
    let full_path = state.files.get_data_dir().join(&file_path);
    std::fs::read(&full_path).map_err(|e| e.to_string())
}