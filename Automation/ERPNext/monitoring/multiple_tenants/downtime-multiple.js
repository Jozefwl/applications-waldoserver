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
const TENANTS = [
    'https://tenant1.erp.waldhauser.sk/api/v2/method/ping',
    'https://tenant2.erp.waldhauser.sk/api/v2/method/ping',
    'https://tenant3.erp.waldhauser.sk/api/v2/method/ping'
];
const CHECK_INTERVAL = 1000; // Minimum time between complete cycles (in ms)
const TIMEOUT = 10000; // 10 seconds timeout per request
const OUTPUT_FILE = process.argv[2] || `multitenant_downtime_${Date.now()}.csv`;

// State tracking for each tenant
const tenantStats = TENANTS.map(url => ({
    url,
    checkCount: 0,
    successfulChecks: 0,
    failedChecks: 0,
    totalResponseTime: 0,
    lastFailureTime: null,
    downtime: 0,
    responseTimes: [] // Store all response times for percentiles
}));

let startTime = Date.now();
let isRunning = true;
let cycleCount = 0;

// Configure agents
const httpsAgent = new https.Agent({
    keepAlive: false,
    timeout: TIMEOUT,
    maxSockets: 1
});

const httpAgent = new http.Agent({
    keepAlive: false,
    timeout: TIMEOUT,
    maxSockets: 1
});

// Create CSV header
function initializeCSV() {
    const header = 'timestamp,cycle,tenant1_response_ms,tenant1_status,tenant2_response_ms,tenant2_status,tenant3_response_ms,tenant3_status\n';
    fs.writeFileSync(OUTPUT_FILE, header);
}

// Append cycle results to CSV
function appendToCSV(timestamp, cycle, results) {
    const tenant1 = results[0] || { responseTime: 'NA', status: 'NA' };
    const tenant2 = results[1] || { responseTime: 'NA', status: 'NA' };
    const tenant3 = results[2] || { responseTime: 'NA', status: 'NA' };
    
    const line = `${timestamp},${cycle},${tenant1.responseTime},${tenant1.status},${tenant2.responseTime},${tenant2.status},${tenant3.responseTime},${tenant3.status}\n`;
    fs.appendFileSync(OUTPUT_FILE, line);
}

function performHealthCheck(tenantUrl, tenantStat) {
    return new Promise((resolve) => {
        const checkStart = performance.now();
        tenantStat.checkCount++;
        
        const url = new URL(tenantUrl);
        const isHTTPS = tenantUrl.startsWith('https');
        const httpModule = isHTTPS ? https : http;
        const agent = isHTTPS ? httpsAgent : httpAgent;
        
        const options = {
            hostname: url.hostname,
            port: url.port || (isHTTPS ? 443 : 80),
            path: url.pathname + url.search,
            method: 'GET',
            timeout: TIMEOUT,
            agent: agent,
            headers: {
                'User-Agent': 'Tenant-Availability-Checker/1.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Cache-Control': 'no-cache'
            }
        };
        
        const req = httpModule.request(options, (res) => {
            const responseTime = performance.now() - checkStart;
            
            // Check if status code indicates success
            if (res.statusCode >= 200 && res.statusCode < 400) {
                tenantStat.totalResponseTime += responseTime;
                tenantStat.successfulChecks++;
                tenantStat.responseTimes.push(responseTime);
                
                if (tenantStat.lastFailureTime) {
                    tenantStat.downtime += Date.now() - tenantStat.lastFailureTime;
                    tenantStat.lastFailureTime = null;
                }
                
                process.stdout.write(`[SUCCESS] ${responseTime.toFixed(0)}ms `);
                resolve({ responseTime: responseTime.toFixed(2), status: `HTTP${res.statusCode}` });
            } else {
                // Non-success status code
                tenantStat.failedChecks++;
                if (!tenantStat.lastFailureTime) tenantStat.lastFailureTime = Date.now();
                process.stdout.write(`[ERROR] HTTP${res.statusCode} `);
                resolve({ responseTime: 'NA', status: `HTTP${res.statusCode}` });
            }
            
            // Consume response to free up memory
            res.on('end', () => {
                // Already resolved
            });
            res.resume();
        });
        
        req.on('error', (err) => {
            tenantStat.failedChecks++;
            if (!tenantStat.lastFailureTime) tenantStat.lastFailureTime = Date.now();
            const errorMsg = err.code || 'ERR';
            process.stdout.write(`[ERROR] ${errorMsg} `);
            resolve({ responseTime: 'NA', status: errorMsg });
        });
        
        req.on('timeout', () => {
            req.destroy();
            tenantStat.failedChecks++;
            if (!tenantStat.lastFailureTime) tenantStat.lastFailureTime = Date.now();
            process.stdout.write(`[ERROR] Timeout `);
            resolve({ responseTime: 'NA', status: 'Timeout' });
        });
        
        req.end();
    });
}

// Sequential monitoring loop - waits for each tenant response before moving to next
async function monitoringCycle() {
    cycleCount++;
    const cycleTimestamp = new Date();
    process.stdout.write(`[Cycle ${cycleCount}] `);
    
    const results = [];
    
    for (let i = 0; i < TENANTS.length; i++) {
        const tenantName = `T${i + 1}`;
        process.stdout.write(`${tenantName}: `);
        const result = await performHealthCheck(TENANTS[i], tenantStats[i]);
        results.push(result);
    }
    
    // Write results to CSV
    appendToCSV(formatISO(cycleTimestamp), cycleCount, results);
    
    process.stdout.write('\n');
}

// Main monitoring loop
async function startMonitoring() {
    while (isRunning) {
        const cycleStart = Date.now();
        
        await monitoringCycle();
        
        // Calculate how long to wait before next cycle
        const elapsed = Date.now() - cycleStart;
        const waitTime = Math.max(0, CHECK_INTERVAL - elapsed);
        
        if (waitTime > 0 && isRunning) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Start monitoring
initializeCSV();
console.log(`Started monitoring at ${formatDate(new Date())}`);
console.log(`Monitoring ${TENANTS.length} tenants sequentially (Press Ctrl+C to stop)`);
console.log(`Tenants: ${TENANTS.map((url, i) => `T${i+1}`).join(', ')}`);
console.log(`Writing results to: ${path.resolve(OUTPUT_FILE)}\n`);

startMonitoring();

// Handle termination
process.on('SIGINT', () => {
    isRunning = false;
    
    const totalDuration = (Date.now() - startTime) / 1000;
    
    // Calculate final downtime for any tenants still down
    tenantStats.forEach(stat => {
        if (stat.lastFailureTime) {
            stat.downtime += Date.now() - stat.lastFailureTime;
        }
    });
    
    // Generate report
    console.log('\n\n=== TENANT AVAILABILITY REPORT ===');
    console.log(`Monitoring duration: ${totalDuration.toFixed(1)} seconds`);
    console.log(`Total cycles: ${cycleCount}\n`);
    
    tenantStats.forEach((stat, index) => {
        const availability = stat.checkCount > 0 
            ? ((stat.successfulChecks / stat.checkCount) * 100).toFixed(2)
            : '0.00';
        const avgResponseTime = stat.successfulChecks > 0 
            ? (stat.totalResponseTime / stat.successfulChecks).toFixed(2) 
            : 'N/A';
        
        // Calculate percentiles
        const sortedTimes = stat.responseTimes.sort((a, b) => a - b);
        const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)];
        const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
        const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];
        
        console.log(`--- Tenant ${index + 1}: ${stat.url} ---`);
        console.log(`  Checks performed: ${stat.checkCount}`);
        console.log(`  Successful: ${stat.successfulChecks}`);
        console.log(`  Failed: ${stat.failedChecks}`);
        console.log(`  Availability: ${availability}%`);
        console.log(`  Avg response time: ${avgResponseTime} ms`);
        console.log(`  Median response time (p50): ${p50?.toFixed(2) || 'N/A'} ms`);
        console.log(`  95th percentile (p95): ${p95?.toFixed(2) || 'N/A'} ms`);
        console.log(`  99th percentile (p99): ${p99?.toFixed(2) || 'N/A'} ms`);
        console.log(`  Total downtime: ${(stat.downtime / 1000).toFixed(2)} seconds\n`);
    });
    
    // Overall statistics
    const totalChecks = tenantStats.reduce((sum, stat) => sum + stat.checkCount, 0);
    const totalSuccessful = tenantStats.reduce((sum, stat) => sum + stat.successfulChecks, 0);
    const overallAvailability = totalChecks > 0 
        ? ((totalSuccessful / totalChecks) * 100).toFixed(2)
        : '0.00';
    
    console.log(`=== OVERALL STATISTICS ===`);
    console.log(`Total checks across all tenants: ${totalChecks}`);
    console.log(`Total successful checks: ${totalSuccessful}`);
    console.log(`Overall availability: ${overallAvailability}%`);
    console.log(`\nTime series data saved to: ${path.resolve(OUTPUT_FILE)}`);
    
    // Flush stdout before exiting
    process.stdout.once('drain', () => {
        process.exit(0);
    });
    if (!process.stdout.write('')) {
        process.exit(0);
    }
});