use anyhow::{anyhow, Result};
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use ring::rand::{SecureRandom, SystemRandom};
use std::fs;
use std::path::PathBuf;

const KEY_SIZE: usize = 32; // 256 bits
const NONCE_SIZE: usize = 12; // 96 bits for GCM

pub struct TokenEncryption {
    key: LessSafeKey,
    random: SystemRandom,
}

impl TokenEncryption {
    /// Create a new encryption instance with a generated or loaded key
    pub fn new(data_dir: &PathBuf) -> Result<Self> {
        let key_path = data_dir.join(".encryption_key");
        
        // Load or generate encryption key
        let key_bytes = if key_path.exists() {
            // Load existing key
            let key_hex = fs::read_to_string(&key_path)?;
            hex::decode(key_hex.trim())?
        } else {
            // Generate new key
            let random = SystemRandom::new();
            let mut key_bytes = vec![0u8; KEY_SIZE];
            random.fill(&mut key_bytes)
                .map_err(|_| anyhow!("Failed to generate key"))?;
            
            // Save key for future use
            let key_hex = hex::encode(&key_bytes);
            fs::write(&key_path, key_hex)?;
            
            // Set restrictive permissions on key file (Unix-like systems)
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = fs::metadata(&key_path)?.permissions();
                perms.set_mode(0o600); // Read/write for owner only
                fs::set_permissions(&key_path, perms)?;
            }
            
            key_bytes
        };
        
        // Create encryption key
        let unbound_key = UnboundKey::new(&AES_256_GCM, &key_bytes)
            .map_err(|_| anyhow!("Failed to create encryption key"))?;
        let key = LessSafeKey::new(unbound_key);
        
        Ok(Self {
            key,
            random: SystemRandom::new(),
        })
    }
    
    /// Encrypt a token
    pub fn encrypt(&self, plaintext: &str) -> Result<String> {
        let mut in_out = plaintext.as_bytes().to_vec();
        
        // Generate random nonce
        let mut nonce_bytes = vec![0u8; NONCE_SIZE];
        self.random.fill(&mut nonce_bytes)
            .map_err(|_| anyhow!("Failed to generate nonce"))?;
        
        let nonce = Nonce::try_assume_unique_for_key(&nonce_bytes)
            .map_err(|_| anyhow!("Failed to create nonce"))?;
        
        // Encrypt in place
        self.key.seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
            .map_err(|_| anyhow!("Encryption failed"))?;
        
        // Combine nonce and ciphertext
        let mut result = nonce_bytes;
        result.append(&mut in_out);
        
        // Return as base64
        Ok(base64::encode(result))
    }
    
    /// Decrypt a token
    pub fn decrypt(&self, ciphertext: &str) -> Result<String> {
        // Decode from base64
        let data = base64::decode(ciphertext)?;
        
        if data.len() < NONCE_SIZE {
            return Err(anyhow!("Invalid ciphertext"));
        }
        
        // Split nonce and ciphertext
        let (nonce_bytes, encrypted) = data.split_at(NONCE_SIZE);
        let nonce = Nonce::try_assume_unique_for_key(nonce_bytes)
            .map_err(|_| anyhow!("Failed to create nonce"))?;
        
        let mut in_out = encrypted.to_vec();
        
        // Decrypt in place
        let decrypted = self.key.open_in_place(nonce, Aad::empty(), &mut in_out)
            .map_err(|_| anyhow!("Decryption failed"))?;
        
        // Convert to string
        String::from_utf8(decrypted.to_vec())
            .map_err(|_| anyhow!("Invalid UTF-8 in decrypted data"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    
    #[test]
    fn test_encryption_decryption() {
        let temp_dir = tempdir().unwrap();
        let crypto = TokenEncryption::new(&temp_dir.path().to_path_buf()).unwrap();
        
        let original = "my-secret-token-12345";
        let encrypted = crypto.encrypt(original).unwrap();
        let decrypted = crypto.decrypt(&encrypted).unwrap();
        
        assert_eq!(original, decrypted);
        assert_ne!(original, encrypted);
    }
    
    #[test]
    fn test_different_ciphertexts() {
        let temp_dir = tempdir().unwrap();
        let crypto = TokenEncryption::new(&temp_dir.path().to_path_buf()).unwrap();
        
        let original = "test-token";
        let encrypted1 = crypto.encrypt(original).unwrap();
        let encrypted2 = crypto.encrypt(original).unwrap();
        
        // Different nonces should produce different ciphertexts
        assert_ne!(encrypted1, encrypted2);
        
        // Both should decrypt to the same value
        assert_eq!(crypto.decrypt(&encrypted1).unwrap(), original);
        assert_eq!(crypto.decrypt(&encrypted2).unwrap(), original);
    }
}