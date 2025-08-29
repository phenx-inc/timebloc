use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimeBlock {
    pub id: Option<i64>,
    pub date: String,
    pub start_minutes: i32,     // Minutes from midnight (0-1439)
    pub duration_minutes: i32,  // 5, 15, 30, 60, etc.
    pub title: String,
    pub notes_file: Option<String>,
    pub color: String,
    pub tags: Vec<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Attachment {
    pub id: Option<i64>,
    pub time_block_id: i64,
    pub file_path: String,
    pub file_name: String,
    pub file_type: String,  // 'image', 'document', 'audio'
    pub file_size: Option<i64>,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Priority {
    pub id: Option<i64>,
    pub date: String,
    pub content: String,
    pub completed: bool,
    pub priority_order: i32,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BrainDump {
    pub id: Option<i64>,
    pub date: String,
    pub content: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub date: String,
    pub start_minutes: i32,
    pub duration_minutes: i32,
    pub tags: Vec<String>,
    pub score: f32,
    pub highlights: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TimeInterval {
    pub minutes: i32,
    pub label: String,  // "5 min", "15 min", "30 min", "1 hour"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CalendarConnection {
    pub id: Option<i64>,
    pub provider: String,        // 'google', 'outlook', 'apple', 'caldav'
    pub account_name: String,    // User's email or account identifier
    pub access_token: String,    // OAuth access token
    pub refresh_token: Option<String>, // OAuth refresh token
    pub calendar_list: Vec<String>,    // JSON array of enabled calendar IDs
    pub last_sync: Option<String>,     // Last successful sync timestamp
    pub enabled: bool,
    pub created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CalendarEvent {
    pub id: Option<i64>,
    pub connection_id: i64,
    pub external_id: String,     // Event ID from the calendar provider
    pub calendar_id: String,     // Calendar ID from the provider
    pub title: String,
    pub start_time: String,      // ISO 8601 datetime string
    pub end_time: String,        // ISO 8601 datetime string
    pub description: Option<String>,
    pub location: Option<String>,
    pub is_all_day: bool,
    pub attendees: Vec<String>,  // JSON array of attendee emails
    pub last_updated: String,    // When this event was last updated
}

impl TimeBlock {
    pub fn start_time_formatted(&self) -> String {
        let hours = self.start_minutes / 60;
        let minutes = self.start_minutes % 60;
        format!("{:02}:{:02}", hours, minutes)
    }
    
    pub fn end_time_formatted(&self) -> String {
        let end_minutes = self.start_minutes + self.duration_minutes;
        let hours = end_minutes / 60;
        let minutes = end_minutes % 60;
        format!("{:02}:{:02}", hours, minutes)
    }
    
    pub fn duration_formatted(&self) -> String {
        if self.duration_minutes >= 60 {
            let hours = self.duration_minutes / 60;
            let remaining_minutes = self.duration_minutes % 60;
            if remaining_minutes == 0 {
                format!("{}h", hours)
            } else {
                format!("{}h {}m", hours, remaining_minutes)
            }
        } else {
            format!("{}m", self.duration_minutes)
        }
    }
}

// Utility functions for time conversion
pub fn time_string_to_minutes(time_str: &str) -> Result<i32, String> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 2 {
        return Err("Invalid time format".to_string());
    }
    
    let hours: i32 = parts[0].parse().map_err(|_| "Invalid hour")?;
    let minutes: i32 = parts[1].parse().map_err(|_| "Invalid minute")?;
    
    if hours < 0 || hours > 23 || minutes < 0 || minutes > 59 {
        return Err("Time out of range".to_string());
    }
    
    Ok(hours * 60 + minutes)
}

pub fn minutes_to_time_string(minutes: i32) -> String {
    let hours = minutes / 60;
    let mins = minutes % 60;
    format!("{:02}:{:02}", hours, mins)
}