use std::fs;
use std::path::PathBuf;
use anyhow::Result;
use crate::models::TimeBlock;

pub struct FileService {
    data_dir: PathBuf,
    notes_dir: PathBuf,
    attachments_dir: PathBuf,
}

impl FileService {
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        let notes_dir = data_dir.join("notes");
        let attachments_dir = data_dir.join("attachments");
        
        // Create directories
        fs::create_dir_all(&notes_dir)?;
        fs::create_dir_all(&attachments_dir)?;
        
        Ok(FileService {
            data_dir,
            notes_dir,
            attachments_dir,
        })
    }
    
    pub fn save_notes(&self, time_block: &TimeBlock, content: &str) -> Result<String> {
        let date_dir = self.notes_dir.join(&time_block.date);
        fs::create_dir_all(&date_dir)?;
        
        let filename = if let Some(id) = time_block.id {
            format!("{:04}-{}.md", time_block.start_minutes, id)
        } else {
            format!("{:04}-new.md", time_block.start_minutes)
        };
        
        let file_path = date_dir.join(&filename);
        fs::write(&file_path, content)?;
        
        // Return relative path from data directory
        Ok(format!("notes/{}/{}", time_block.date, filename))
    }
    
    pub fn load_notes(&self, notes_file: &str) -> Result<String> {
        let file_path = self.data_dir.join(notes_file);
        match fs::read_to_string(&file_path) {
            Ok(content) => Ok(content),
            Err(_) => Ok(String::new()), // Return empty if file doesn't exist
        }
    }
    
    pub fn delete_notes(&self, notes_file: &str) -> Result<()> {
        let file_path = self.data_dir.join(notes_file);
        if file_path.exists() {
            fs::remove_file(file_path)?;
        }
        Ok(())
    }
    
    pub fn save_attachment(&self, time_block_id: i64, date: &str, file_data: &[u8], filename: &str) -> Result<String> {
        let date_dir = self.attachments_dir.join(date);
        fs::create_dir_all(&date_dir)?;
        
        // Create unique filename with time_block_id prefix
        let safe_filename = format!("{}_{}", time_block_id, filename);
        let file_path = date_dir.join(&safe_filename);
        
        fs::write(&file_path, file_data)?;
        
        // Return relative path from data directory
        Ok(format!("attachments/{}/{}", date, safe_filename))
    }
    
    pub fn delete_attachment(&self, file_path: &str) -> Result<()> {
        let full_path = self.data_dir.join(file_path);
        if full_path.exists() {
            fs::remove_file(full_path)?;
        }
        Ok(())
    }
    
    pub fn get_data_dir(&self) -> &PathBuf {
        &self.data_dir
    }
}