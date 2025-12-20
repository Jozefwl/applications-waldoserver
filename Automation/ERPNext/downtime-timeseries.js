const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');


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
const TARGET_URL = process.argv[2] || 'https://tenant1.erp.waldhauser.sk';
const CHECK_INTERVAL = 2000; // enter in miliseconds 1000 = 1s
const TIMEOUT = 60000; // 60 seconds timeout (increased for slow servers)
const OUTPUT_FILE = process.argv[3] || `monitoring_${Date.now()}.csv`;


// State tracking
let startTime = Date.now();
let checkCount = 0;
let successfulChecks = 0;
let failedChecks = 0;
let totalResponseTime = 0;
let lastFailureTime = null;
let downtime = 0;
let responseTimes = []; // Store all response times


// Protocol selection
const isHTTPS = TARGET_URL.startsWith('https');
const httpModule = isHTTPS ? https : http;


// Configure agents for better resource handling
const agent = new (isHTTPS ? https.Agent : http.Agent)({
    keepAlive: true, // Enable keep-alive for connection reuse
    keepAliveMsecs: 30000, // 30 second keep-alive timeout
    timeout: TIMEOUT,
    maxSockets: 5, // Increased from 1 to handle concurrent requests better
    maxFreeSockets: 2, // Keep 2 free sockets in pool
    freeSocketTimeout: 30000, // Free sockets after 30 seconds
    socketActiveTTL: 600000 // Socket lifetime 10 minutes
});


// Create CSV header
function initializeCSV() {
    const header = 'timestamp,response_time_ms,status,check_number\n';
    fs.writeFileSync(OUTPUT_FILE, header);
}


// Append response to CSV file
function appendToCSV(timestamp, responseTime, status) {
    const line = `${timestamp},${responseTime},${status},${checkCount}\n`;
    fs.appendFileSync(OUTPUT_FILE, line);
}


function performHealthCheck() {
    const checkStart = performance.now();
    const checkTimestamp = new Date();
    checkCount++;
    
    const url = new URL(TARGET_URL);
    const options = {
        hostname: url.hostname,
        port: url.port || (isHTTPS ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        timeout: TIMEOUT,
        agent: agent,
        headers: {
            'User-Agent': 'Downtime-Checker/1.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    };
    
    const req = httpModule.request(options, (res) => {
        const responseTime = performance.now() - checkStart;
        
        // Check if status code indicates success
        if (res.statusCode >= 200 && res.statusCode < 400) {
            totalResponseTime += responseTime;
            successfulChecks++;
            responseTimes.push(responseTime);
            
            if (lastFailureTime) {
                downtime += Date.now() - lastFailureTime;
                lastFailureTime = null;
            }
            
            process.stdout.write(`✓ ${responseTime.toFixed(2)}ms | `);
            appendToCSV(formatISO(checkTimestamp), responseTime.toFixed(2), `HTTP${res.statusCode}`);
        } else {
            // Non-success status code
            failedChecks++;
            if (!lastFailureTime) lastFailureTime = Date.now();
            process.stdout.write(`✗ HTTP${res.statusCode} | `);
            appendToCSV(formatISO(checkTimestamp), 'NA', `HTTP${res.statusCode}`);
        }
        
        // Consume response to free up memory
        res.resume();
    });
    
    req.on('error', (err) => {
        failedChecks++;
        if (!lastFailureTime) lastFailureTime = Date.now();
        const errorMsg = err.code || err.message || 'Error';
        process.stdout.write(`✗ ${errorMsg} | `);
        appendToCSV(formatISO(checkTimestamp), 'NA', errorMsg);
    });
    
    req.on('timeout', () => {
        req.destroy();
        failedChecks++;
        if (!lastFailureTime) lastFailureTime = Date.now();
        process.stdout.write(`✗ Timeout | `);
        appendToCSV(formatISO(checkTimestamp), 'NA', 'Timeout');
    });
    
    req.end();
}


// Start monitoring
initializeCSV();
console.log(`Started monitoring at ${formatDate(new Date())}`);
console.log(`Monitoring ${TARGET_URL} every ${CHECK_INTERVAL/1000}s (Press Ctrl+C to stop)`);
console.log(`Writing results to: ${path.resolve(OUTPUT_FILE)}\n`);
const intervalId = setInterval(performHealthCheck, CHECK_INTERVAL);
performHealthCheck(); // Initial check


// Handle termination
process.on('SIGINT', () => {
    clearInterval(intervalId);
    
    // Calculate final metrics
    const monitoringDuration = (Date.now() - startTime) / 1000;
    const avgResponseTime = successfulChecks > 0 
        ? (totalResponseTime / successfulChecks).toFixed(2) 
        : 0;
    
    // Calculate percentiles for R analysis
    const sortedTimes = responseTimes.sort((a, b) => a - b);
    const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
    const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
    
    // Calculate final downtime
    if (lastFailureTime) {
        downtime += Date.now() - lastFailureTime;
    }
    
    const availability = ((monitoringDuration - downtime/1000) / monitoringDuration * 100).toFixed(2);
    
    // Generate report
    console.log('\n\n--- Monitoring Report ---');
    console.log(`Monitoring duration: ${monitoringDuration.toFixed(1)} seconds`);
    console.log(`Checks performed: ${checkCount}`);
    console.log(`Successful checks: ${successfulChecks}`);
    console.log(`Failed checks: ${failedChecks}`);
    console.log(`Average response time: ${avgResponseTime} ms`);
    console.log(`Median response time (p50): ${p50?.toFixed(2) || 'N/A'} ms`);
    console.log(`95th percentile (p95): ${p95?.toFixed(2) || 'N/A'} ms`);
    console.log(`99th percentile (p99): ${p99?.toFixed(2) || 'N/A'} ms`);
    console.log(`Total downtime: ${(downtime/1000).toFixed(2)} seconds`);
    console.log(`Availability: ${availability}%`);
    console.log(`\nTime series data saved to: ${path.resolve(OUTPUT_FILE)}`);
    
    // Flush stdout before exiting
    process.stdout.once('drain', () => {
        process.exit(0);
    });
    if (!process.stdout.write('')) {
        // Already flushed
        process.exit(0);
    }
});