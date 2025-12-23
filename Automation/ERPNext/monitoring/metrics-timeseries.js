const http = require('http');
const fs = require('fs');
const path = require('path');

// Helper function to format date
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

// Helper function to format ISO timestamp for CSV
function formatISO(date) {
    return date.toISOString();
}

// Configuration
const CHECK_INTERVAL = 1000; // wait time between checks in ms
const OUTPUT_FILE = process.argv[2] || `rollback_rolling1_resource_monitoring_${Date.now()}.csv`;
const PROMETHEUS_URL = process.argv[3] || 'http://localhost:9090';

// State tracking
let startTime = Date.now();
let checkCount = 0;
let cpuReadings = [];
let memoryReadings = [];
let isRunning = true;

// Create CSV header
function initializeCSV() {
    const header = 'timestamp,check_number,cpu_percent,memory_gb\n';
    fs.writeFileSync(OUTPUT_FILE, header);
}

// Append metrics to CSV file
function appendToCSV(timestamp, cpuPercent, memoryGB) {
    const line = `${timestamp},${checkCount},${cpuPercent},${memoryGB}\n`;
    fs.appendFileSync(OUTPUT_FILE, line);
}

// Query Prometheus for metrics
function queryPrometheus(query) {
    return new Promise((resolve) => {
        const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`;
        
        http.get(url, { timeout: 5000 }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.status === 'success' && result.data.result.length > 0) {
                        const value = parseFloat(result.data.result[0].value[1]);
                        resolve(value);
                    } else {
                        resolve(null);
                    }
                } catch (err) {
                    resolve(null);
                }
            });
        }).on('error', () => {
            resolve(null);
        }).on('timeout', function() {
            this.destroy();
            resolve(null);
        });
    });
}

// Get CPU and Memory metrics from Prometheus
async function getPrometheusMetrics() {
    try {
        // CPU usage percentage (average across all cores)
        const cpuQuery = '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)';
        const cpuPercent = await queryPrometheus(cpuQuery);
        
        // Memory usage in GB
        const memQuery = '(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / 1024 / 1024 / 1024';
        const memoryGB = await queryPrometheus(memQuery);
        
        return {
            cpu: cpuPercent !== null ? cpuPercent : null,
            memory: memoryGB !== null ? memoryGB : null
        };
    } catch (err) {
        return {
            cpu: null,
            memory: null
        };
    }
}

// Perform metrics check
async function performMetricsCheck() {
    const checkTimestamp = new Date();
    checkCount++;
    
    // Get Prometheus metrics
    const metrics = await getPrometheusMetrics();
    
    const cpuDisplay = metrics.cpu !== null ? metrics.cpu.toFixed(2) : 'NA';
    const memDisplay = metrics.memory !== null ? metrics.memory.toFixed(2) : 'NA';
    
    // Store readings for statistics
    if (metrics.cpu !== null) cpuReadings.push(metrics.cpu);
    if (metrics.memory !== null) memoryReadings.push(metrics.memory);
    
    process.stdout.write(`[Check ${checkCount}] CPU: ${cpuDisplay}% | RAM: ${memDisplay}GB\n`);
    
    // Append to CSV
    appendToCSV(
        formatISO(checkTimestamp),
        cpuDisplay,
        memDisplay
    );
}

// Sequential monitoring loop
async function monitoringLoop() {
    while (isRunning) {
        const loopStart = Date.now();
        
        await performMetricsCheck();
        
        // Calculate how long to wait before next check
        const elapsed = Date.now() - loopStart;
        const waitTime = Math.max(0, CHECK_INTERVAL - elapsed);
        
        if (waitTime > 0 && isRunning) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Start monitoring
initializeCSV();
console.log(`Started resource monitoring at ${formatDate(new Date())}`);
console.log(`Checking every ${CHECK_INTERVAL/1000}s (Press Ctrl+C to stop)`);
console.log(`Prometheus endpoint: ${PROMETHEUS_URL}`);
console.log(`Writing results to: ${path.resolve(OUTPUT_FILE)}\n`);

// Start the sequential monitoring loop
monitoringLoop();

// Handle termination
process.on('SIGINT', () => {
    isRunning = false;
    
    // Calculate final metrics
    const monitoringDuration = (Date.now() - startTime) / 1000;
    
    // Calculate CPU statistics
    const sortedCPU = [...cpuReadings].sort((a, b) => a - b);
    const avgCPU = cpuReadings.length > 0 
        ? (cpuReadings.reduce((a, b) => a + b, 0) / cpuReadings.length).toFixed(2)
        : 'N/A';
    const maxCPU = cpuReadings.length > 0 
        ? Math.max(...cpuReadings).toFixed(2)
        : 'N/A';
    const minCPU = cpuReadings.length > 0 
        ? Math.min(...cpuReadings).toFixed(2)
        : 'N/A';
    const medianCPU = sortedCPU.length > 0
        ? sortedCPU[Math.floor(sortedCPU.length * 0.5)].toFixed(2)
        : 'N/A';
    
    // Calculate Memory statistics
    const sortedMemory = [...memoryReadings].sort((a, b) => a - b);
    const avgMemory = memoryReadings.length > 0 
        ? (memoryReadings.reduce((a, b) => a + b, 0) / memoryReadings.length).toFixed(2)
        : 'N/A';
    const maxMemory = memoryReadings.length > 0 
        ? Math.max(...memoryReadings).toFixed(2)
        : 'N/A';
    const minMemory = memoryReadings.length > 0 
        ? Math.min(...memoryReadings).toFixed(2)
        : 'N/A';
    const medianMemory = sortedMemory.length > 0
        ? sortedMemory[Math.floor(sortedMemory.length * 0.5)].toFixed(2)
        : 'N/A';
    
    // Generate report
    console.log('\n\n--- Resource Monitoring Report ---');
    console.log(`Monitoring duration: ${monitoringDuration.toFixed(1)} seconds`);
    console.log(`Checks performed: ${checkCount}`);
    console.log(`Successful readings: ${cpuReadings.length}`);
    console.log('');
    console.log('CPU Usage:');
    console.log(`  Average: ${avgCPU}%`);
    console.log(`  Median: ${medianCPU}%`);
    console.log(`  Maximum: ${maxCPU}%`);
    console.log(`  Minimum: ${minCPU}%`);
    console.log('');
    console.log('Memory Usage:');
    console.log(`  Average: ${avgMemory} GB`);
    console.log(`  Median: ${medianMemory} GB`);
    console.log(`  Maximum: ${maxMemory} GB`);
    console.log(`  Minimum: ${minMemory} GB`);
    console.log(`\nTime series data saved to: ${path.resolve(OUTPUT_FILE)}`);
    
    // Flush stdout before exiting
    process.stdout.once('drain', () => {
        process.exit(0);
    });
    if (!process.stdout.write('')) {
        process.exit(0);
    }
});