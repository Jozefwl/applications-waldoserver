# Quick Reference: ERPNext Deployment Strategies

## TL;DR - Which Strategy to Use?

| Use Case | Strategy | Downtime | Complexity | Risk |
|----------|----------|----------|-----------|------|
| Regular updates | **Rolling** | None | Low | Low |
| Emergency deploy | **Recreate** | Full | Very Low | High |
| Resource-limited | **Ramped** | None | Low | Low |
| Safe critical updates | **Blue-Green** | None | Medium | Low |
| Risky changes | **Canary** | Minimal | High | Very Low |
| New features testing | **Shadow** | None | High | None |

---

## Implementation Roadmap

### Phase 1: Kubernetes-Native (Weeks 1-2)
**Goal:** Support Rolling, Recreate, Ramped through Helm values only

**Tasks:**
1. Add `deploymentStrategy` section to values.yaml
2. Update Helm templates to use strategy type
3. Update Ansible to pass strategy to Helm
4. Test each strategy in dev environment

**Effort:** 2-4 hours
**Complexity:** Low

```bash
# Test Rolling
ansible-playbook deployment-strategies.yaml -e "deployment_strategy=rolling"

# Test Recreate
ansible-playbook deployment-strategies.yaml -e "deployment_strategy=recreate"

# Test Ramped
ansible-playbook deployment-strategies.yaml -e "deployment_strategy=ramped"
```

### Phase 2: Ansible-Orchestrated (Weeks 3-4)
**Goal:** Add Blue-Green support

**Tasks:**
1. Create Ansible tasks for blue-green.yml
2. Implement traffic switching via service selectors
3. Add health check and rollback logic
4. Test with manual approval workflows

**Effort:** 4-6 hours
**Complexity:** Medium
**Prerequisites:** Phase 1 complete

```bash
# Test Blue-Green
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=blue-green" \
  -e "new_erpnext_image_tag=v15.88.0"
```

### Phase 3: Advanced Strategies (Weeks 5-8)
**Goal:** Add Canary and Shadow support

**Tasks for Canary:**
1. Install Istio or Flagger (if not present)
2. Create VirtualService templates
3. Implement gradual traffic shifting (10% → 50% → 100%)
4. Add metrics monitoring
5. Implement automatic rollback on error threshold

**Tasks for Shadow:**
1. Deploy duplicate service pod
2. Configure traffic mirroring (Istio)
3. Setup metrics comparison
4. Implement decision logic

**Effort:** 12-16 hours
**Complexity:** High
**Prerequisites:** Phase 1+2 complete, Istio installed

```bash
# Test Canary
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=canary" \
  -e "new_erpnext_image_tag=v15.88.0"

# Test Shadow
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=shadow" \
  -e "new_erpnext_image_tag=v15.88.0"
```

---

## File Structure After Implementation

```
Automation/ERPNext/
├── playbooks/
│   ├── ansible.cfg
│   ├── deployment-strategies.yaml          # Main playbook
│   ├── group_vars/
│   │   └── all.yaml                        # Strategy configuration
│   └── roles/
│       └── deployment_strategies/
│           ├── tasks/
│           │   ├── main.yml                # Dispatcher
│           │   ├── rolling.yml             # Kubernetes-native
│           │   ├── recreate.yml            # Kubernetes-native
│           │   ├── ramped.yml              # Kubernetes-native
│           │   ├── blue-green.yml          # Ansible-orchestrated
│           │   ├── canary.yml              # Istio-based (Phase 3)
│           │   ├── shadow.yml              # Istio-based (Phase 3)
│           │   └── post-deployment.yml     # Common validation
│           ├── vars/
│           │   ├── rolling.yml
│           │   ├── blue-green.yml
│           │   ├── canary.yml
│           │   └── shadow.yml
│           └── templates/
│               └── (future: custom K8s resources)

Applications/ERPNext/erpnext-official/erpnext/
├── Chart.yaml
├── values.yaml                             # Updated with deploymentStrategy
├── templates/
│   ├── deployment-nginx.yaml               # Updated with strategy logic
│   ├── deployment-gunicorn.yaml
│   ├── deployment-worker-*.yaml
│   ├── deployment-socketio.yaml
│   ├── deployment-scheduler.yaml
│   └── ... (rest of templates)
└── charts/
    └── (subdependencies: mariadb, redis, postgresql)
```

---

## Code Changes Summary

### 1. values.yaml - Add this section

```yaml
# Deployment Strategy Configuration
deploymentStrategy:
  type: rolling  # rolling, recreate, ramped, blue-green, canary, shadow
  parameters:
    maxUnavailable: 0
    maxSurge: 1
    blueGreen:
      manualApproval: false
      cleanupOldVersion: true
      healthCheckTimeout: 300
    canary:
      stages:
        - weight: 10
          duration: 300
        - weight: 50
          duration: 300
        - weight: 100
          duration: 0
      errorRateThreshold: 5
      latencyP95Threshold: 1000
    shadow:
      mirrorPercent: 100
      monitoringDuration: 3600
```

### 2. templates/deployment-nginx.yaml - Add this logic

```yaml
{{- $deploymentType := .Values.deploymentStrategy.type | default "rolling" }}

spec:
  {{- if or (eq $deploymentType "rolling") (eq $deploymentType "recreate") (eq $deploymentType "ramped") }}
  strategy:
    type: {{ if eq $deploymentType "recreate" }}Recreate{{ else }}RollingUpdate{{ end }}
    {{- if ne $deploymentType "recreate" }}
    rollingUpdate:
      {{- if eq $deploymentType "ramped" }}
      maxUnavailable: 1
      maxSurge: 0
      {{- else }}
      maxUnavailable: {{ .Values.deploymentStrategy.parameters.maxUnavailable | default 0 }}
      maxSurge: {{ .Values.deploymentStrategy.parameters.maxSurge | default 1 }}
      {{- end }}
    {{- end }}
  {{- end }}
```

### 3. Create: Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/main.yml

```yaml
---
- name: Deployment Strategy Dispatcher
  block:
    - name: Validate strategy
      assert:
        that:
          - deployment_strategy in ['rolling', 'recreate', 'ramped', 'blue-green', 'canary', 'shadow']

    - include_tasks: "{{ deployment_strategy }}.yml"
    - include_tasks: post-deployment.yml
```

### 4. Update: Automation/ERPNext/playbooks/group_vars/all.yaml

```yaml
deployment_strategy: rolling
kubernetes_namespace: erpnext
helm_release_name: erpnext
helm_chart_path: "{{ playbook_dir }}/../../../Applications/ERPNext/erpnext-official/erpnext"
new_erpnext_image_tag: v15.88.0
```

---

## Testing Checklist

### Phase 1: Kubernetes-Native

- [ ] Rolling update deployment
  - [ ] Pods update gradually
  - [ ] Zero downtime
  - [ ] All replicas become ready
  
- [ ] Recreate deployment
  - [ ] All old pods terminated
  - [ ] New pods created
  - [ ] Full downtime observed
  
- [ ] Ramped deployment
  - [ ] maxUnavailable=1, maxSurge=0
  - [ ] One pod at a time
  - [ ] Zero downtime maintained

### Phase 2: Blue-Green

- [ ] Blue version running
- [ ] Green version deployed
- [ ] Health check passes
- [ ] Traffic switched to green
- [ ] Blue version cleaned up
- [ ] Rollback works (switch back to blue)

### Phase 3: Canary

- [ ] Canary deployed with 1 replica
- [ ] 10% traffic routed to canary
- [ ] Error rate monitored
- [ ] Traffic gradually increased (10% → 50% → 100%)
- [ ] Rollback triggered on error threshold
- [ ] Promotion to stable successful

### Phase 3: Shadow

- [ ] Shadow deployment running
- [ ] 100% traffic mirrored
- [ ] No impact on production
- [ ] Metrics collected
- [ ] Shadow version deleted after monitoring

---

## Common Issues & Solutions

### Issue: Helm values not updating existing deployment

**Solution:** Use `force: true` in helm module or `--force` flag
```yaml
kubernetes.core.helm:
  name: erpnext
  ...
  force: true
```

### Issue: Blue-Green traffic not switching

**Solution:** Verify service selector label matches deployment
```bash
# Check deployment labels
kubectl get deployment erpnext-blue -o yaml | grep labels

# Check service selector
kubectl get service erpnext-nginx -o yaml | grep selector
```

### Issue: Canary metrics not being collected

**Solution:** Ensure Prometheus is scraping Istio metrics
```bash
# Verify Prometheus targets
kubectl port-forward -n prometheus svc/prometheus 9090:9090
# Visit http://localhost:9090/targets
```

### Issue: Shadow traffic not mirrored

**Solution:** Verify Istio VirtualService configuration
```bash
kubectl describe vs erpnext-nginx -n erpnext
```

---

## Monitoring During Deployments

### Check deployment progress
```bash
# Watch rollout
kubectl rollout status deployment/erpnext-nginx -n erpnext

# Get events
kubectl get events -n erpnext --sort-by='.lastTimestamp'

# Check pod status
kubectl get pods -n erpnext -l app=erpnext

# View logs
kubectl logs -n erpnext -l app=erpnext --tail=100 -f
```

### Health checks
```bash
# Check service endpoints
kubectl get endpoints erpnext-nginx -n erpnext

# Test connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -- \
  wget -O- http://erpnext-nginx.erpnext.svc.cluster.local:8080/api/health
```

### Metrics queries (Prometheus)
```promql
# Error rate
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) * 100

# Latency p95
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Request volume
rate(http_requests_total[5m])
```

---

## Environment-Specific Overrides

### Development (Rolling)
```bash
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=rolling" \
  -e "environment=dev"
```

### Staging (Canary)
```bash
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=canary" \
  -e "environment=staging"
```

### Production (Blue-Green)
```bash
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=blue-green" \
  -e "environment=prod" \
  -e "manual_approval=true"
```

---

## Resources & References

- [Kubernetes Deployment Strategies](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Istio VirtualService](https://istio.io/latest/docs/reference/config/networking/virtual-service/)
- [Flagger Canary Deployments](https://flagger.app/)
- [Helm Charts Best Practices](https://helm.sh/docs/chart_best_practices/)
- [Ansible kubernetes.core Collection](https://docs.ansible.com/ansible/latest/collections/kubernetes/core/index.html)

---

## Questions & Answers

**Q: Should I use Blue-Green or Canary?**
- Blue-Green: Use for simple updates, instant rollback is critical
- Canary: Use for risky changes, want to catch issues early with minimal impact

**Q: Do I need Istio for Canary/Shadow?**
- Technically no, but it's much easier with Istio
- Without Istio: requires custom traffic splitting logic (more complex)
- With Istio: declarative VirtualService configuration (recommended)

**Q: Can I mix strategies across components?**
- Yes! Use rolling for nginx, blue-green for gunicorn if needed
- Just specify strategy per deployment in templates

**Q: What about database migrations?**
- Plan migrations separately from app deployments
- Use `jobs.migrate` in values for pre-deployment migrations
- Consider `pre-deployment` hooks for schema changes

**Q: How do I rollback?**
- Rolling/Recreate: `helm rollback erpnext 1`
- Blue-Green: Switch service selector back to blue
- Canary: Reduce canary weight to 0%, delete canary deployment
- Shadow: Just delete shadow deployment (production unaffected)
