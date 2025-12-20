const http = require('http');
const https = require('https');
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

// Configuration
const TARGET_URL = process.argv[2] || 'https://tenant1.erp.waldhauser.sk/api/v2/method/ping';
const CHECK_INTERVAL = 1000; // enter in miliseconds 1000 = 1s
const TIMEOUT = 10000; // 10 seconds to timeout

// State tracking
let startTime = Date.now();
let checkCount = 0;
let successfulChecks = 0;
let failedChecks = 0;
let totalResponseTime = 0;
let lastFailureTime = null;
let downtime = 0;

// Protocol selection
const isHTTPS = TARGET_URL.startsWith('https');
const httpModule = isHTTPS ? https : http;

// Configure agents for better connection handling
const agent = new (isHTTPS ? https.Agent : http.Agent)({
    keepAlive: false, // Disable connection pooling to avoid stale connections
    timeout: TIMEOUT,
    maxSockets: 1
});

function performHealthCheck() {
    const checkStart = performance.now();
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
            'Cache-Control': 'no-cache'
        }
    };
    
    const req = httpModule.request(options, (res) => {
        const responseTime = performance.now() - checkStart;
        
        // Check if status code indicates success
        if (res.statusCode >= 200 && res.statusCode < 400) {
            totalResponseTime += responseTime;
            successfulChecks++;
            
            if (lastFailureTime) {
                downtime += Date.now() - lastFailureTime;
                lastFailureTime = null;
            }
            
            process.stdout.write(`✓ ${responseTime.toFixed(2)}ms | `);
        } else {
            // Non-success status code
            failedChecks++;
            if (!lastFailureTime) lastFailureTime = Date.now();
            process.stdout.write(`✗ HTTP${res.statusCode} | `);
        }
        
        // Consume response to free up memory
        res.resume();
    });
    
    req.on('error', (err) => {
        failedChecks++;
        if (!lastFailureTime) lastFailureTime = Date.now();
        const errorMsg = err.code || err.message || 'Error';
        process.stdout.write(`✗ ${errorMsg} | `);
    });
    
    req.on('timeout', () => {
        req.destroy();
        failedChecks++;
        if (!lastFailureTime) lastFailureTime = Date.now();
        process.stdout.write(`✗ Timeout | `);
    });
    
    req.end();
}

// Start monitoring
console.log(`Started monitoring at ${formatDate(new Date())}`);
console.log(`Monitoring ${TARGET_URL} every ${CHECK_INTERVAL/1000}s (Press Ctrl+C to stop)\n`);
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
    console.log(`Total downtime: ${(downtime/1000).toFixed(2)} seconds`);
    console.log(`Availability: ${availability}%`);
    
    // Flush stdout before exiting
    process.stdout.once('drain', () => {
        process.exit(0);
    });
    if (!process.stdout.write('')) {
        // Already flushed
        process.exit(0);
    }
});
