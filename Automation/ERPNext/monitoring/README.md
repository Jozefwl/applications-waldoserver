# Node.js Monitoring Scripts

Two monitoring scripts using Node.js built-in modules:

1. **downtime-multiple.js** - Pings multiple endpoints and logs response times and status
2. **metrics-timeseries.js** - Queries Prometheus for CPU and memory metrics

Both write results to CSV with statistics printed to console on shutdown (Ctrl+C).

## What They Do

These two scripts are used to monitor Frappe/ERPNext deployment on my server for the evaluation of deployment strategies.

**downtime-multiple.j**
- Makes HTTP/HTTPS requests to configured endpoints every 1 second
- Records response time, HTTP status, and connection errors
- Calculates statistics of availability, response time percentiles (p50, p95, p99)
- Tracks duration of downtime

**metrics-timeseries.js**
- Queries Prometheus API every 1 second for node metrics
- Logs CPU usage percentage and memory consumption in GB
- Calculates min/max/average/median for both metrics

## Setup

**Requirements**
- Node.js 12+
- For multitenant-monitor: HTTP/HTTPS endpoints to ping
- For resource-monitor: Prometheus server with node_exporter running

**Run downtime monitoring script**
```bash
node downtime-multiple.js
```

Edit this array to set which endpoints to monitor:
```javascript
const TENANTS = [
    'https://tenant1.erp.waldhauser.sk/api/v2/method/ping',
    'https://tenant2.erp.waldhauser.sk/api/v2/method/ping'
];
const CHECK_INTERVAL = 1000;  // milliseconds between checks
const TIMEOUT = 10000;        // milliseconds before request times out
```

**Run resource monitoring script**
```bash
node metrics-timeseries.js
```

Default Prometheus endpoint is `http://localhost:9090`
Recommendation: Port-forward prometheus using freelens to port 9090 to monitor.
You need to have node-exporter for this to work.
Change it in the file, if you so desire.

Press `Ctrl+C` to stop and print statistics.

## How They Work

**multitenant-monitor.js uses:**
- `http`/`https` modules - makes requests with configurable timeout
- `perf_hooks` - measures request latency in milliseconds
- `fs` - appends CSV rows to file
- Promises with async/await for sequential requests

Checks run one after another (async, not in parallel). Each check times out after 10 seconds.

**resource-monitor.js uses:**
- `http` module - queries Prometheus API
- `fs` - appends CSV rows to file
- Parses Prometheus JSON response for metric values

Prometheus queries used:
- CPU: `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)`
- Memory: `(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / 1024 / 1024 / 1024`


## Sources

[1] Nodejs Foundation. (2025, December). *HTTP* [online]. Nodejs.org. Available at: https://nodejs.org/api/http.html

[2] Nodejs Foundation. (2025, December). *Performance measurement APIs* [online]. Nodejs.org. Available at: https://nodejs.org/api/perf_hooks.html

[3] W3Schools. (2025, September). *Node.js Performance Hooks Module* [online]. W3Schools.com. Available at: https://www.w3schools.com/nodejs/nodejs_perf_hooks.asp

[4] DigitalOcean, Inc. (2025, November). *How To Read and Write CSV Files in Node.js Using Node-csv* [online]. DigitalOcean Community Tutorials. Available at: https://www.digitalocean.com/community/tutorials/how-to-read-and-write-csv-files-in-node-js-using-node-csv

[5] Prometheus Authors. (2024, December). *Client libraries* [online]. Prometheus.io. Available at: https://prometheus.io/docs/instrumenting/clientlibs/

[6] Better Stack Community. (2024, October). *Monitoring Node.js Apps with Prometheus* [online]. Better Stack Community Guides. Available at: https://betterstack.com/community/guides/scaling-nodejs/nodejs-prometheus/

[7] Nodejs Foundation. (2025, December). *Errors* [online]. Nodejs.org. Available at: https://nodejs.org/api/errors.html
