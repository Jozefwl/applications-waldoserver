# ERPNext Deployment Strategies - Kubernetes vs Ansible Split

## Executive Summary

Your question: "Which deployment features are possible in Kubernetes and which require Ansible?"

**Short Answer:**
- **Kubernetes-native (Helm only):** Rolling, Recreate, Ramped
- **Ansible-required:** Blue-Green, Canary, Shadow

---

## Strategy Breakdown

### ✅ KUBERNETES NATIVE (Pure Helm/K8s)

#### 1. Rolling Update (Default)
- **What:** Gradually replace pods, one-by-one
- **Implementation:** Kubernetes Deployment native field `strategy.type: RollingUpdate`
- **Helm involvement:** Values only
- **Downtime:** Zero
- **Rollback:** Fast (reverse the change, let k8s handle it)

```yaml
# In values.yaml
deploymentStrategy:
  type: rolling
  parameters:
    maxUnavailable: 0
    maxSurge: 1

# In template (deployment-nginx.yaml)
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: {{ .Values.deploymentStrategy.parameters.maxUnavailable }}
      maxSurge: {{ .Values.deploymentStrategy.parameters.maxSurge }}
```

#### 2. Recreate
- **What:** Stop all pods, start new ones
- **Implementation:** Kubernetes Deployment native field `strategy.type: Recreate`
- **Helm involvement:** Values only
- **Downtime:** Full (all pods stopped)
- **Rollback:** Very fast (Helm rollback automatically reverts strategy)

```yaml
# In values.yaml
deploymentStrategy:
  type: recreate

# In template
spec:
  strategy:
    type: Recreate
```

#### 3. Ramped Update
- **What:** Controlled rolling (maxSurge=0, maxUnavailable=1)
- **Implementation:** Kubernetes RollingUpdate with specific parameters
- **Helm involvement:** Values only
- **Downtime:** Zero
- **Rollback:** Fast

```yaml
# In values.yaml
deploymentStrategy:
  type: ramped
  parameters:
    maxUnavailable: 1
    maxSurge: 0

# In template
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1        # One pod stops
      maxSurge: 0              # No new pod starts until old terminates
```

**Why these are Kubernetes-native:**
- Kubernetes Deployment controller handles everything
- No external coordination needed
- Helm just passes parameters to K8s
- K8s automatically manages the rollout

---

### ⚠️ ANSIBLE-REQUIRED (K8s + Orchestration)

#### 4. Blue-Green Deployment
- **What:** Two identical deployments (Blue=current, Green=new), switch traffic between them
- **Kubernetes role:** Provides deployments and service selectors
- **Ansible role:** Orchestrates the deployment flow
- **Helm involvement:** Two separate Helm releases (blue/green)
- **Downtime:** Zero
- **Rollback:** Instant (switch service selector back)

**Why it needs Ansible:**
```
Kubernetes can't do this automatically because:
1. It doesn't know about "two versions"
2. It can't decide when to switch traffic
3. No concept of "blue" vs "green"
4. No automatic approval workflows

Ansible orchestrates:
Step 1: Deploy "green" (new version) alongside "blue" (current)
Step 2: Health check green version
Step 3: Update service selector: label=blue → label=green
Step 4: Monitor green version
Step 5: Optional: Delete blue version OR keep for rollback
```

**Implementation:**
```yaml
# Ansible does this:
- Deploy erpnext-green with new version
  kubernetes.core.helm: name=erpnext-green, values={new_version}

- Wait for green to be healthy
  kubernetes.core.k8s_info: until green is ready

- Switch traffic to green
  kubernetes.core.k8s: Service.selector: deployment-color=green

- Monitor green for issues
  pause: "Watch metrics for 5 minutes"

- If good: delete blue version
- If bad: switch back to blue (instant rollback)
```

#### 5. Canary Deployment
- **What:** Gradually shift traffic from old to new (10% → 50% → 100%)
- **Kubernetes role:** Hosts two deployments
- **Ansible role:** Orchestrates traffic splitting and progression
- **Traffic control:** Requires Istio/Flagger (not built into K8s)
- **Downtime:** None/minimal
- **Rollback:** Restore old traffic weights

**Why it needs Ansible + Istio:**
```
Kubernetes can't control traffic percentages:
- Deployment controller is binary: old vs new
- Service selector is binary: route to this deployment
- No concept of "send 10% to this, 90% to that"

Istio/Flagger adds:
- VirtualService: Declarative traffic routing
- Weight-based routing: 10% canary, 90% stable
- Metrics analysis: Automatic promotion/rollback

Ansible orchestrates:
Step 1: Deploy canary (1 replica = ~10% of traffic)
Step 2: Configure Istio VirtualService: weight canary 10%, stable 90%
Step 3: Monitor metrics for 5 minutes
Step 4: Increase weights: canary 50%, stable 50%
Step 5: Monitor again
Step 6: Full promotion: canary 100%, delete old
```

**Implementation:**
```yaml
# Ansible does this with Istio:
- Deploy erpnext-canary with 1 replica
  kubernetes.core.helm: replicas=1

- Configure traffic split (10% canary, 90% stable)
  kubernetes.core.k8s:
    VirtualService:
      http.route:
        - destination: erpnext-stable, weight: 90
        - destination: erpnext-canary, weight: 10

- Monitor canary metrics
  pause: "Watch Prometheus"

- Increase traffic (50/50)
  kubernetes.core.k8s: Update VirtualService weights

- Monitor again and promote or rollback
```

#### 6. Shadow Deployment
- **What:** Route copy of production traffic to new version (dark launch)
- **Kubernetes role:** Hosts shadow deployment
- **Ansible role:** Orchestrates mirroring and cleanup
- **Traffic control:** Requires Istio/traffic mirroring
- **Downtime:** Zero
- **Rollback:** Delete shadow, remove mirroring

**Why it needs Ansible + Istio:**
```
Kubernetes can't mirror traffic:
- Service routing is single-path only
- No concept of "duplicate requests to another service"

Istio adds:
- VirtualService.mirror: Send copy of traffic elsewhere
- Only affects Istio-managed traffic
- No impact on actual user requests

Ansible orchestrates:
Step 1: Deploy shadow version
Step 2: Configure Istio to mirror 100% of traffic to shadow
Step 3: Monitor shadow for 1 hour
Step 4: Analyze shadow logs/metrics vs production
Step 5: Delete shadow and remove mirroring
```

**Implementation:**
```yaml
# Ansible does this with Istio:
- Deploy erpnext-shadow
  kubernetes.core.helm: name=erpnext-shadow

- Configure traffic mirroring
  kubernetes.core.k8s:
    VirtualService:
      http.mirror: erpnext-shadow  # Copy all traffic here
      http.route:
        - destination: erpnext-stable  # Actual traffic

- Monitor shadow for 1 hour
  pause: "Watch logs/metrics"

- Delete shadow and remove mirroring
  kubernetes.core.helm: name=erpnext-shadow, state=absent
```

---

## Decision Matrix: K8s vs Ansible

| Strategy | K8s Native? | Ansible Needed? | Istio Needed? | Prerequisites |
|----------|-----------|-----------------|--------------|----------------|
| Rolling | ✅ Yes (100%) | ❌ No | ❌ No | Just Helm |
| Recreate | ✅ Yes (100%) | ❌ No | ❌ No | Just Helm |
| Ramped | ✅ Yes (100%) | ❌ No | ❌ No | Just Helm |
| Blue-Green | ⚠️ Partial (60%) | ✅ Yes (40%) | ❌ No | Helm + Ansible |
| Canary | ❌ No (0%) | ✅ Yes (60%) | ✅ Yes (40%) | Helm + Ansible + Istio |
| Shadow | ❌ No (0%) | ✅ Yes (60%) | ✅ Yes (40%) | Helm + Ansible + Istio |

---

## What Kubernetes CANNOT Do

Kubernetes deployments are designed for **binary state transitions**:
- Old state → New state
- One version → Another version
- All-or-nothing strategy

Kubernetes deployments CANNOT do:
- ❌ Maintain two versions simultaneously and choose between them (Blue-Green)
- ❌ Control traffic percentages to specific pods (Canary needs 10% to new, 90% to old)
- ❌ Mirror traffic to multiple destinations (Shadow needs copy of traffic)
- ❌ Make deployment decisions based on metrics (Canary needs automatic rollback on errors)
- ❌ Orchestrate multi-step workflows with approvals (Blue-Green needs manual approval)

**This is not a Kubernetes limitation—it's by design.** Kubernetes focuses on running containers reliably, not on complex deployment orchestration.

---

## What Ansible ADDS

Ansible provides the **orchestration layer** that Kubernetes lacks:

1. **Multi-step workflows:** Deploy green → wait → health check → switch traffic → cleanup
2. **External traffic control:** Integrate with Istio/Flagger to control traffic routing
3. **Decision logic:** If metrics bad, rollback; if good, promote
4. **Approval gates:** Pause for manual approval before switching
5. **External system integration:** Update DNS, notify Slack, update monitoring, etc.

---

## Implementation Strategy for Your Setup

### Phase 1: Start Simple (Week 1)
```yaml
deployment_strategy: rolling  # Already works in Kubernetes
# Just needs values.yaml update
# Takes 1 hour
```

### Phase 2: Add Recreate & Ramped (Week 1)
```yaml
deployment_strategy: recreate   # or ramped
# Pure K8s values, still 1 hour
```

### Phase 3: Add Blue-Green (Weeks 2-3)
```yaml
deployment_strategy: blue-green
# Requires:
# - Ansible orchestration (new)
# - Dual Helm releases (blue + green)
# - Service selector switching (K8s)
# Takes 4-6 hours of Ansible coding
```

### Phase 4: Add Canary (Weeks 4-6)
```yaml
deployment_strategy: canary
# Requires:
# - Istio installation (if not present)
# - VirtualService configuration
# - Prometheus metrics scraping
# - Ansible orchestration for stages
# Takes 8-10 hours total
```

### Phase 5: Add Shadow (Weeks 6-8)
```yaml
deployment_strategy: shadow
# Similar to Canary but easier (no traffic routing logic)
# Takes 4-6 hours
```

---

## Your Current Position

**What you have:**
- Custom Helm chart with deployment templates ✅
- Ansible playbook framework ✅
- RKE2 cluster (Istio/Flagger optional) ✅

**What you need to add:**

**Immediately (for Phases 1-3):**
```
1. Update values.yaml with deploymentStrategy section
2. Update deployment templates to use strategy type
3. Update Ansible playbook to:
   - Validate strategy from group_vars
   - Pass strategy to Helm via set_values
   - Add post-deployment validation
4. Add role: deployment_strategies with tasks for each strategy
```

**Later (for Phases 4-5):**
```
1. Install Istio or Flagger (if needed)
2. Create Istio VirtualService templates
3. Add Prometheus metrics collection
4. Enhance Ansible with metrics-based logic
```

---

## Recommended Execution Plan

```bash
# Week 1: Phase 1 (Rolling only)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=rolling"

# Week 2: Phase 2 (Add Recreate/Ramped)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=recreate"

# Week 3: Phase 3 Start (Blue-Green groundwork)
# - Add blue-green.yml task file
# - Test dual deployments

# Week 4: Phase 3 Complete (Blue-Green working)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=blue-green" \
  -e "new_erpnext_image_tag=v15.88.0"

# Weeks 5-6: Phase 4 (Canary, requires Istio)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=canary" \
  -e "new_erpnext_image_tag=v15.88.0"

# Weeks 6-8: Phase 5 (Shadow)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=shadow" \
  -e "new_erpnext_image_tag=v15.88.0"
```

---

## Key Takeaway

**Don't try to do everything at once.**

- Start with **Rolling** (pure Helm, 1 hour)
- Add **Recreate/Ramped** (pure Helm, 2 hours)
- Then **Blue-Green** (Ansible orchestration, 6 hours)
- Finally **Canary/Shadow** (Istio + complex Ansible, 16+ hours)

Each phase is independent and provides value immediately. You can deploy production with just Rolling, then add Blue-Green when you need safer critical updates, then add Canary when you want risk management.

---

## Files to Create/Modify

### Create:
1. `Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/main.yml`
2. `Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/rolling.yml`
3. `Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/recreate.yml`
4. `Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/ramped.yml`
5. `Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/post-deployment.yml`
6. `Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/blue-green.yml` (Phase 2)
7. `Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/canary.yml` (Phase 3)
8. `Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/shadow.yml` (Phase 3)

### Modify:
1. `Applications/ERPNext/erpnext-official/erpnext/values.yaml` - Add deploymentStrategy section
2. `Applications/ERPNext/erpnext-official/erpnext/templates/deployment-nginx.yaml` - Add strategy logic
3. `Automation/ERPNext/playbooks/group_vars/all.yaml` - Add strategy config

That's it! Rest of templates remain unchanged.
