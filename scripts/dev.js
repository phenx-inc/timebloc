#!/usr/bin/env node

const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

// Function to check if a port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

// Function to find an available port starting from 3000
async function findAvailablePort(startPort = 3000) {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
  }
  return port;
}

// Function to update tauri.conf.json with the correct port
function updateTauriConfig(port) {
  const configPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.build.devPath = `http://localhost:${port}`;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Main function
async function main() {
  try {
    console.log('🔍 Finding available port...');
    const port = await findAvailablePort(3000);
    console.log(`✅ Using port ${port}`);
    
    // Update Tauri config
    updateTauriConfig(port);
    console.log('📝 Updated Tauri configuration');
    
    // Start Next.js with the found port
    const nextProcess = spawn('npm', ['run', 'dev', '--', '--port', port.toString()], {
      stdio: 'pipe',
      shell: true
    });
    
    // Forward Next.js output
    nextProcess.stdout.on('data', (data) => {
      process.stdout.write(data);
    });
    
    nextProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    
    // Wait a bit for Next.js to start, then start Tauri
    setTimeout(() => {
      console.log('🚀 Starting Tauri...');
      const tauriProcess = spawn('npx', ['tauri', 'dev'], {
        stdio: 'inherit',
        shell: true
      });
      
      // Handle process cleanup
      process.on('SIGINT', () => {
        nextProcess.kill();
        tauriProcess.kill();
        process.exit();
      });
      
    }, 3000); // Wait 3 seconds for Next.js to start
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();