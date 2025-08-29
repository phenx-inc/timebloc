use crate::models::{CalendarConnection, CalendarEvent};
use crate::crypto::TokenEncryption;
use anyhow::{anyhow, Result};
use reqwest::Client;
use rusqlite::Connection;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

pub struct CalendarService {
    http_client: Client,
    db: Arc<Mutex<Connection>>,
    crypto: Option<TokenEncryption>,
}

impl CalendarService {
    pub fn new(db: Arc<Mutex<Connection>>, data_dir: PathBuf) -> Self {
        // Try to initialize encryption, but don't fail if it doesn't work
        let crypto = TokenEncryption::new(&data_dir).ok();
        
        if crypto.is_none() {
            eprintln!("Warning: Token encryption not available. Tokens will be stored in plain text.");
        }
        
        Self {
            http_client: Client::new(),
            db,
            crypto,
        }
    }

    // Google Calendar OAuth2 URL generation
    pub fn get_google_auth_url(&self, client_id: &str, redirect_uri: &str) -> String {
        let scope = "https://www.googleapis.com/auth/calendar.readonly";
        format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
            client_id,
            urlencoding::encode(redirect_uri),
            urlencoding::encode(scope)
        )
    }

    // Exchange authorization code for tokens
    pub async fn exchange_code_for_tokens(
        &self,
        code: &str,
        client_id: &str,
        client_secret: &str,
        redirect_uri: &str,
    ) -> Result<(String, Option<String>)> {
        let params = [
            ("code", code),
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("redirect_uri", redirect_uri),
            ("grant_type", "authorization_code"),
        ];

        let response = self
            .http_client
            .post("https://oauth2.googleapis.com/token")
            .form(&params)
            .send()
            .await?;

        let data: Value = response.json().await?;

        let access_token = data["access_token"]
            .as_str()
            .ok_or_else(|| anyhow!("No access token in response"))?
            .to_string();

        let refresh_token = data["refresh_token"].as_str().map(|s| s.to_string());

        Ok((access_token, refresh_token))
    }

    // Get user's Google Calendar account info
    pub async fn get_google_user_info(&self, access_token: &str) -> Result<String> {
        let response = self
            .http_client
            .get("https://www.googleapis.com/oauth2/v1/userinfo")
            .bearer_auth(access_token)
            .send()
            .await?;

        let data: Value = response.json().await?;
        let email = data["email"]
            .as_str()
            .ok_or_else(|| anyhow!("No email in user info"))?;

        Ok(email.to_string())
    }

    // Save calendar connection to database
    pub fn save_connection(&self, connection: &CalendarConnection) -> Result<i64> {
        println!("🔥 CalendarService::save_connection called");
        println!("🔥 Connection details: provider={}, account={}", 
            connection.provider, connection.account_name);
        
        let conn = self.db.lock().unwrap();
        
        // Encrypt tokens if encryption is available
        let (encrypted_access_token, encrypted_refresh_token) = if let Some(ref crypto) = self.crypto {
            let access = crypto.encrypt(&connection.access_token)?;
            let refresh = connection.refresh_token.as_ref()
                .map(|t| crypto.encrypt(t))
                .transpose()?;
            (access, refresh)
        } else {
            (connection.access_token.clone(), connection.refresh_token.clone())
        };
        
        let calendar_list_json = serde_json::to_string(&connection.calendar_list)?;
        println!("🔥 Calendar list JSON: {}", calendar_list_json);
        
        let result = conn.execute(
            "INSERT INTO calendar_connections (provider, account_name, access_token, refresh_token, calendar_list, enabled)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            (
                &connection.provider,
                &connection.account_name,
                &encrypted_access_token,
                &encrypted_refresh_token,
                calendar_list_json,
                connection.enabled,
            ),
        );

        match result {
            Ok(rows_affected) => {
                let id = conn.last_insert_rowid();
                println!("🔥 Successfully saved connection to database! Rows affected: {}, ID: {}", rows_affected, id);
                
                // Verify it was actually saved
                let verify: rusqlite::Result<i64> = conn.query_row(
                    "SELECT COUNT(*) FROM calendar_connections WHERE id = ?1",
                    [id],
                    |row| row.get(0),
                );
                
                match verify {
                    Ok(count) => println!("🔥 Verification: Found {} connections with ID {}", count, id),
                    Err(e) => println!("🔥 Verification failed: {}", e),
                }
                
                Ok(id)
            }
            Err(e) => {
                println!("🔥 ERROR saving connection to database: {}", e);
                Err(anyhow!("Failed to save connection: {}", e))
            }
        }
    }

    // Get all calendar connections
    pub fn get_connections(&self) -> Result<Vec<CalendarConnection>> {
        println!("🔥 CalendarService::get_connections called");
        let conn = self.db.lock().unwrap();
        
        // First check if there are ANY connections at all
        let total_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM calendar_connections",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        println!("🔥 Total connections in database: {}", total_count);
        
        let mut stmt = conn.prepare(
            "SELECT id, provider, account_name, access_token, refresh_token, calendar_list, last_sync, enabled, created_at 
             FROM calendar_connections WHERE enabled = TRUE"
        )?;

        let connections_iter = stmt.query_map([], |row| {
            let calendar_list_str: String = row.get(5).unwrap_or_default();
            let calendar_list: Vec<String> = if calendar_list_str.is_empty() {
                Vec::new()
            } else {
                serde_json::from_str(&calendar_list_str).unwrap_or_default()
            };

            let encrypted_access_token: String = row.get(3)?;
            let encrypted_refresh_token: Option<String> = row.get(4)?;
            
            // Decrypt tokens if encryption is available
            let (access_token, refresh_token) = if let Some(ref crypto) = self.crypto {
                let access = crypto.decrypt(&encrypted_access_token).unwrap_or(encrypted_access_token.clone());
                let refresh = encrypted_refresh_token.as_ref()
                    .map(|t| crypto.decrypt(t).unwrap_or(t.clone()));
                (access, refresh)
            } else {
                (encrypted_access_token, encrypted_refresh_token)
            };

            Ok(CalendarConnection {
                id: Some(row.get(0)?),
                provider: row.get(1)?,
                account_name: row.get(2)?,
                access_token,
                refresh_token,
                calendar_list,
                last_sync: row.get(6)?,
                enabled: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?;

        let mut connections = Vec::new();
        for connection in connections_iter {
            match connection {
                Ok(conn) => {
                    println!("🔥 Found enabled connection: provider={}, account={}", 
                        conn.provider, conn.account_name);
                    connections.push(conn);
                },
                Err(e) => {
                    println!("🔥 Error reading connection: {}", e);
                }
            }
        }

        println!("🔥 Returning {} enabled connections", connections.len());
        Ok(connections)
    }

    // Fetch events from Google Calendar
    pub async fn fetch_google_events(
        &self,
        access_token: &str,
        calendar_id: &str,
        time_min: &str,
        time_max: &str,
    ) -> Result<Vec<CalendarEvent>> {
        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events?timeMin={}&timeMax={}&singleEvents=true&orderBy=startTime",
            urlencoding::encode(calendar_id),
            urlencoding::encode(time_min),
            urlencoding::encode(time_max)
        );

        let response = self
            .http_client
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!("Failed to fetch calendar events: {}", response.status()));
        }

        let data: Value = response.json().await?;
        let empty_vec = vec![];
        let items = data["items"].as_array().unwrap_or(&empty_vec);

        let mut events = Vec::new();
        for item in items {
            if let Ok(event) = self.parse_google_event(item, calendar_id, 0) {
                events.push(event);
            }
        }

        Ok(events)
    }

    // Parse Google Calendar event JSON into our CalendarEvent struct
    fn parse_google_event(&self, item: &Value, calendar_id: &str, connection_id: i64) -> Result<CalendarEvent> {
        let external_id = item["id"]
            .as_str()
            .ok_or_else(|| anyhow!("No event ID"))?;

        let title = item["summary"]
            .as_str()
            .unwrap_or("(No Title)")
            .to_string();

        let start = &item["start"];
        let end = &item["end"];

        let (start_time, is_all_day) = if let Some(date_time) = start["dateTime"].as_str() {
            (date_time.to_string(), false)
        } else if let Some(date) = start["date"].as_str() {
            (format!("{}T00:00:00", date), true)
        } else {
            return Err(anyhow!("No start time found"));
        };

        let end_time = if let Some(date_time) = end["dateTime"].as_str() {
            date_time.to_string()
        } else if let Some(date) = end["date"].as_str() {
            format!("{}T23:59:59", date)
        } else {
            return Err(anyhow!("No end time found"));
        };

        let description = item["description"].as_str().map(|s| s.to_string());
        let location = item["location"].as_str().map(|s| s.to_string());
        
        let attendees: Vec<String> = item["attendees"]
            .as_array()
            .map(|attendees| {
                attendees
                    .iter()
                    .filter_map(|a| a["email"].as_str())
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default();

        let last_updated = item["updated"]
            .as_str()
            .unwrap_or("")
            .to_string();

        Ok(CalendarEvent {
            id: None,
            connection_id,
            external_id: external_id.to_string(),
            calendar_id: calendar_id.to_string(),
            title,
            start_time,
            end_time,
            description,
            location,
            is_all_day,
            attendees,
            last_updated,
        })
    }

    // Save events to database (upsert)
    pub fn save_events(&self, events: &[CalendarEvent]) -> Result<()> {
        let conn = self.db.lock().unwrap();
        
        for event in events {
            let attendees_json = serde_json::to_string(&event.attendees)?;
            
            conn.execute(
                "INSERT OR REPLACE INTO calendar_events 
                 (connection_id, external_id, calendar_id, title, start_time, end_time, description, location, is_all_day, attendees, last_updated)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                (
                    event.connection_id,
                    &event.external_id,
                    &event.calendar_id,
                    &event.title,
                    &event.start_time,
                    &event.end_time,
                    &event.description,
                    &event.location,
                    event.is_all_day,
                    attendees_json,
                    &event.last_updated,
                ),
            )?;
        }

        Ok(())
    }

    // Get events for a specific date range
    pub fn get_events_for_date_range(&self, start_date: &str, end_date: &str) -> Result<Vec<CalendarEvent>> {
        let conn = self.db.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, connection_id, external_id, calendar_id, title, start_time, end_time, description, location, is_all_day, attendees, last_updated
             FROM calendar_events 
             WHERE date(start_time) >= ?1 AND date(start_time) <= ?2
             ORDER BY start_time"
        )?;

        let events_iter = stmt.query_map([start_date, end_date], |row| {
            let attendees_str: String = row.get(10).unwrap_or_default();
            let attendees: Vec<String> = if attendees_str.is_empty() {
                Vec::new()
            } else {
                serde_json::from_str(&attendees_str).unwrap_or_default()
            };

            Ok(CalendarEvent {
                id: Some(row.get(0)?),
                connection_id: row.get(1)?,
                external_id: row.get(2)?,
                calendar_id: row.get(3)?,
                title: row.get(4)?,
                start_time: row.get(5)?,
                end_time: row.get(6)?,
                description: row.get(7)?,
                location: row.get(8)?,
                is_all_day: row.get(9)?,
                attendees,
                last_updated: row.get(11)?,
            })
        })?;

        let mut events = Vec::new();
        for event in events_iter {
            events.push(event?);
        }

        Ok(events)
    }

    // Sync all calendar connections
    pub async fn sync_all_calendars(&self) -> Result<i32> {
        let connections = self.get_connections()?;
        let mut total_synced = 0;

        for connection in connections {
            match self.sync_connection(&connection).await {
                Ok(count) => {
                    total_synced += count;
                    // Update last sync time
                    let conn = self.db.lock().unwrap();
                    let _ = conn.execute(
                        "UPDATE calendar_connections SET last_sync = CURRENT_TIMESTAMP WHERE id = ?1",
                        [connection.id.unwrap_or(0)],
                    );
                }
                Err(e) => {
                    eprintln!("Failed to sync calendar for {}: {}", connection.account_name, e);
                }
            }
        }

        Ok(total_synced)
    }

    // Sync a single calendar connection
    async fn sync_connection(&self, connection: &CalendarConnection) -> Result<i32> {
        if connection.provider != "google" {
            return Err(anyhow!("Only Google Calendar is supported for now"));
        }

        // Sync events for the next 30 days
        let now = chrono::Utc::now();
        let time_min = now.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let time_max = (now + chrono::Duration::days(30))
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string();

        let mut total_events = 0;

        for calendar_id in &connection.calendar_list {
            match self.fetch_google_events(
                &connection.access_token,
                calendar_id,
                &time_min,
                &time_max,
            ).await {
                Ok(mut events) => {
                    // Set the connection_id for all events
                    for event in &mut events {
                        event.connection_id = connection.id.unwrap_or(0);
                    }
                    
                    self.save_events(&events)?;
                    total_events += events.len();
                }
                Err(e) => {
                    eprintln!("Failed to fetch events from calendar {}: {}", calendar_id, e);
                }
            }
        }

        Ok(total_events as i32)
    }
}