# ERPNext Deployment Strategies - Kubernetes/Helm vs Ansible Automation

## Overview

Based on your ERPNext Helm chart structure, here's what can be automated and where Ansible fits in:

---

## 1. KUBERNETES-NATIVE (Helm Values) - Deployment Strategy Parameters

### What Kubernetes Handles Natively

These deployment strategies are **controlled at the Kubernetes Deployment/StatefulSet level** and can be configured entirely through Helm values:

| Strategy | Kubernetes Native? | Configuration | Downtime | Rollback Speed |
|----------|------------------|---------------|----------|----------------|
| **Rolling** | ✅ Yes | `strategy.type: RollingUpdate` | Zero | Fast |
| **Recreate** | ✅ Yes | `strategy.type: Recreate` | Full | Very Fast |
| **Ramped** | ⚠️ Partial | RollingUpdate with `maxSurge: 0` | Zero | Fast |
| **Blue-Green** | ❌ No | Requires Ansible + Traffic switching | Zero | Instant |
| **Canary** | ⚠️ Partial | Requires Flagger/Argo Rollouts OR manual | Minimal | Medium |
| **Shadow** | ❌ No | Requires Ansible + Duplicated Services | Zero | N/A |

### Key Point: 
- **Rolling, Recreate, Ramped** = Pure Kubernetes (Helm values only)
- **Blue-Green, Canary, Shadow** = Require Ansible orchestration + traffic management

---

## 2. KUBERNETES-NATIVE STRATEGIES (Full Helm Control)

### 2.1 Rolling Update (Default)

**What it does:** Gradually replaces pods one-by-one. Default Kubernetes behavior.

**Implemented at:** Helm `values.yaml` deployment template

**Your current setup already supports this.** The default configuration uses rolling updates.

```yaml
# templates/deployment-nginx.yaml (partial)
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0  # Keep all pods available
      maxSurge: 1        # Add 1 pod at a time
  replicas: {{ .Values.nginx.replicaCount }}
```

### 2.2 Recreate

**What it does:** Stops all pods, then starts new ones. Causes full downtime.

**Implemented at:** Helm `values.yaml` → Deployment strategy

**Implementation Example:**

```yaml
# Modify your values.yaml structure to support strategy selection
nginx:
  replicaCount: 1
  strategy:
    type: Recreate  # or RollingUpdate
    # For rolling updates:
    # rollingUpdate:
    #   maxUnavailable: 0
    #   maxSurge: 1
```

**Template usage (templates/deployment-nginx.yaml):**

```yaml
spec:
  strategy:
    type: {{ .Values.nginx.strategy.type }}
    {{- if eq .Values.nginx.strategy.type "RollingUpdate" }}
    rollingUpdate:
      maxUnavailable: {{ .Values.nginx.strategy.rollingUpdate.maxUnavailable | default 0 }}
      maxSurge: {{ .Values.nginx.strategy.rollingUpdate.maxSurge | default 1 }}
    {{- end }}
  replicas: {{ .Values.nginx.replicaCount }}
```

### 2.3 Ramped Update (Controlled Rolling)

**What it does:** Rolling update with zero surge (maxSurge: 0), meaning old pods terminate BEFORE new ones start.

**Implemented at:** Helm values

```yaml
nginx:
  replicaCount: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1    # Kill 1 old pod
      maxSurge: 0          # Don't start new pod until old is gone
```

---

## 3. ANSIBLE-REQUIRED STRATEGIES

### 3.1 Blue-Green Deployment

**What it does:** Run two complete identical deployments (Blue=current, Green=new). Switch traffic between them.

**Why Ansible is needed:**
- Kubernetes can't automate traffic switching between two deployments
- Requires orchestrated steps: deploy new version → test → switch service selector → cleanup

**High-level Ansible workflow:**

```yaml
# Ansible role structure for Blue-Green
roles/deployment_strategies/
├── tasks/
│   ├── main.yml                 # Dispatcher
│   ├── blue-green.yml           # Blue-Green logic
│   ├── canary.yml
│   └── shadow.yml
├── vars/
│   ├── deployment_be.yaml       # Backend deployment template
│   ├── deployment_fe.yaml       # Frontend deployment template
│   └── service_be.yaml          # Service template
└── templates/
    └── blue-green-values.yaml   # Values for Blue version
    └── green-values.yaml        # Values for Green version
```

**Ansible Blue-Green Implementation Example:**

```yaml
# roles/deployment_strategies/tasks/blue-green.yml
---
- name: Blue-Green Deployment Strategy
  block:
    # Step 1: Deploy Green (new version)
    - name: Deploy Green version (new)
      kubernetes.core.helm:
        name: erpnext-green
        chart_ref: ./Applications/ERPNext/erpnext-official/erpnext
        values_files:
          - ./Applications/ERPNext/erpnext-official/erpnext/values.yaml
        set_values:
          - value: "image.tag=v15.88.0"  # New version
            value_type: string
        release_namespace: "erpnext"
        state: present
        wait: true
        wait_condition:
          type: "Ready"
          status: "True"

    # Step 2: Health check Green version
    - name: Health check Green deployment
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: erpnext
        name: erpnext-green-nginx
      register: green_deployment
      until: green_deployment.resources[0].status.readyReplicas == green_deployment.resources[0].spec.replicas
      retries: 10
      delay: 10

    # Step 3: Manual approval (optional)
    - name: Wait for approval
      pause:
        prompt: "Green version healthy. Press enter to switch traffic to Green..."
      when: manual_approval | default(false) | bool

    # Step 4: Switch traffic (update service selector)
    - name: Switch traffic to Green
      kubernetes.core.k8s:
        state: present
        definition:
          apiVersion: v1
          kind: Service
          metadata:
            name: erpnext-nginx
            namespace: erpnext
          spec:
            selector:
              deployment-color: green  # Switch from 'blue' to 'green'
            ports:
              - port: 8080
                targetPort: 8080

    # Step 5: Wait and monitor
    - name: Monitor Green version for 5 minutes
      pause:
        minutes: 5
        prompt: "Monitoring Green version. Check logs/metrics. Press enter to continue..."

    # Step 6: If successful, clean up Blue
    - name: Delete Blue deployment (rollback previous)
      kubernetes.core.helm:
        name: erpnext-blue
        release_namespace: "erpnext"
        state: absent
      when: cleanup_old_version | default(true) | bool

    # Rollback if needed
  rescue:
    - name: Rollback to Blue version
      kubernetes.core.k8s:
        state: present
        definition:
          apiVersion: v1
          kind: Service
          metadata:
            name: erpnext-nginx
            namespace: erpnext
          spec:
            selector:
              deployment-color: blue  # Revert to blue
            ports:
              - port: 8080
                targetPort: 8080
      when: deployment_failed | default(true) | bool

    - name: Delete failed Green deployment
      kubernetes.core.helm:
        name: erpnext-green
        release_namespace: "erpnext"
        state: absent
```

### 3.2 Canary Deployment

**What it does:** Gradually shift traffic (e.g., 10% → 50% → 100%) to new version.

**Why Ansible is needed:**
- Kubernetes deployments alone can't control traffic percentages
- Requires traffic management tool (Istio/Flagger) OR manual Ansible orchestration

**Ansible Canary Implementation:**

```yaml
# roles/deployment_strategies/tasks/canary.yml
---
- name: Canary Deployment Strategy
  block:
    # Step 1: Deploy canary version (small replica count)
    - name: Deploy Canary version
      kubernetes.core.helm:
        name: erpnext-canary
        chart_ref: ./Applications/ERPNext/erpnext-official/erpnext
        set_values:
          - value: "image.tag=v15.88.0"
            value_type: string
          - value: "nginx.replicaCount=1"  # 1 pod for 10% traffic
            value_type: string
          - value: "worker.gunicorn.replicaCount=1"
            value_type: string
        release_namespace: "erpnext"
        state: present

    # Step 2: Configure Istio VirtualService for traffic split (requires Istio)
    - name: Configure initial traffic split (10% canary, 90% stable)
      kubernetes.core.k8s:
        state: present
        definition:
          apiVersion: networking.istio.io/v1beta1
          kind: VirtualService
          metadata:
            name: erpnext-nginx
            namespace: erpnext
          spec:
            hosts:
              - tenant1.erp.waldhauser.sk
            http:
              - match:
                  - uri:
                      prefix: "/"
                route:
                  - destination:
                      host: erpnext-nginx
                    weight: 90
                  - destination:
                      host: erpnext-canary-nginx
                    weight: 10

    # Step 3: Monitor metrics (Prometheus/metrics-server)
    - name: Monitor canary metrics for 5 minutes
      pause:
        minutes: 5
        prompt: "Monitor canary (10% traffic). Check Prometheus dashboards..."

    # Step 4: Gradual traffic increase
    - name: Increase canary traffic to 50%
      kubernetes.core.k8s:
        state: present
        definition:
          apiVersion: networking.istio.io/v1beta1
          kind: VirtualService
          metadata:
            name: erpnext-nginx
            namespace: erpnext
          spec:
            hosts:
              - tenant1.erp.waldhauser.sk
            http:
              - match:
                  - uri:
                      prefix: "/"
                route:
                  - destination:
                      host: erpnext-nginx
                    weight: 50
                  - destination:
                      host: erpnext-canary-nginx
                    weight: 50

    # Step 5: Monitor again
    - name: Monitor canary metrics at 50%
      pause:
        minutes: 5
        prompt: "Monitor canary (50% traffic). Check Prometheus dashboards..."

    # Step 6: Full traffic shift
    - name: Shift 100% traffic to canary
      kubernetes.core.k8s:
        state: present
        definition:
          apiVersion: networking.istio.io/v1beta1
          kind: VirtualService
          metadata:
            name: erpnext-nginx
            namespace: erpnext
          spec:
            hosts:
              - tenant1.erp.waldhauser.sk
            http:
              - match:
                  - uri:
                      prefix: "/"
                route:
                  - destination:
                      host: erpnext-canary-nginx
                    weight: 100

    # Step 7: Promote canary to stable (scale up, update stable deployment)
    - name: Promote canary to stable
      kubernetes.core.helm:
        name: erpnext
        chart_ref: ./Applications/ERPNext/erpnext-official/erpnext
        set_values:
          - value: "image.tag=v15.88.0"
            value_type: string
          - value: "nginx.replicaCount=3"  # Scale to full replicas
            value_type: string
        release_namespace: "erpnext"
        state: present

    # Step 8: Delete canary deployment
    - name: Delete canary deployment
      kubernetes.core.helm:
        name: erpnext-canary
        release_namespace: "erpnext"
        state: absent

  rescue:
    - name: Rollback to stable version
      kubernetes.core.k8s:
        state: present
        definition:
          apiVersion: networking.istio.io/v1beta1
          kind: VirtualService
          metadata:
            name: erpnext-nginx
            namespace: erpnext
          spec:
            hosts:
              - tenant1.erp.waldhauser.sk
            http:
              - match:
                  - uri:
                      prefix: "/"
                route:
                  - destination:
                      host: erpnext-nginx
                    weight: 100

    - name: Delete canary deployment on failure
      kubernetes.core.helm:
        name: erpnext-canary
        release_namespace: "erpnext"
        state: absent
```

### 3.3 Shadow Deployment

**What it does:** Route copy of production traffic to new version without affecting users (dark launch).

**Ansible Shadow Implementation:**

```yaml
# roles/deployment_strategies/tasks/shadow.yml
---
- name: Shadow Deployment Strategy
  block:
    # Deploy shadow version
    - name: Deploy Shadow version
      kubernetes.core.helm:
        name: erpnext-shadow
        chart_ref: ./Applications/ERPNext/erpnext-official/erpnext
        set_values:
          - value: "image.tag=v15.88.0"
            value_type: string
        release_namespace: "erpnext"
        state: present

    # Configure Istio mirroring
    - name: Configure traffic mirroring to shadow
      kubernetes.core.k8s:
        state: present
        definition:
          apiVersion: networking.istio.io/v1beta1
          kind: VirtualService
          metadata:
            name: erpnext-nginx
            namespace: erpnext
          spec:
            hosts:
              - tenant1.erp.waldhauser.sk
            http:
              - match:
                  - uri:
                      prefix: "/"
                route:
                  - destination:
                      host: erpnext-nginx
                mirror:
                  host: erpnext-shadow-nginx
                mirror_percent: 100

    # Monitor shadow version performance
    - name: Monitor shadow deployment for 1 hour
      pause:
        hours: 1
        prompt: "Shadow version running. Monitor logs/metrics in Prometheus/ELK stack..."

    # Analyze results (manual or via metrics scraping)
    - name: Compare shadow vs production metrics
      pause:
        prompt: "Review shadow deployment performance. Approve to promote or rollback..."

    # If good, promote shadow to stable
    - name: Promote shadow to production
      kubernetes.core.helm:
        name: erpnext
        chart_ref: ./Applications/ERPNext/erpnext-official/erpnext
        set_values:
          - value: "image.tag=v15.88.0"
            value_type: string
        release_namespace: "erpnext"
        state: present

    # Remove mirroring and shadow deployment
    - name: Remove traffic mirroring
      kubernetes.core.k8s:
        state: present
        definition:
          apiVersion: networking.istio.io/v1beta1
          kind: VirtualService
          metadata:
            name: erpnext-nginx
            namespace: erpnext
          spec:
            hosts:
              - tenant1.erp.waldhauser.sk
            http:
              - match:
                  - uri:
                      prefix: "/"
                route:
                  - destination:
                      host: erpnext-nginx

    - name: Delete shadow deployment
      kubernetes.core.helm:
        name: erpnext-shadow
        release_namespace: "erpnext"
        state: absent
```

---

## 4. UPDATED VALUES.YAML STRUCTURE

Add deployment strategy configuration to support all strategies:

```yaml
# values.yaml - Add to top level

# Deployment Strategy Configuration
deploymentStrategy:
  # Options: rolling, recreate, ramped, blue-green, canary, shadow
  type: rolling
  parameters:
    # Rolling/Recreate/Ramped parameters
    maxUnavailable: 0
    maxSurge: 1
    
    # Blue-Green parameters
    blueGreen:
      manualApproval: false
      cleanupOldVersion: true
      healthCheckTimeout: 300  # seconds
    
    # Canary parameters
    canary:
      stages:
        - weight: 10
          duration: 300
        - weight: 50
          duration: 300
        - weight: 100
          duration: 0
      metricsThreshold:
        errorRate: 5  # percentage
        latencyP95: 1000  # milliseconds
    
    # Shadow parameters
    shadow:
      mirrorPercent: 100
      monitoringDuration: 3600  # seconds

# Image version for deployments
image:
  repository: frappe/erpnext
  tag: v15.87.1
  pullPolicy: IfNotPresent

# ... rest of existing values
```

---

## 5. UPDATED HELM TEMPLATE

Modify `templates/deployment-nginx.yaml`:

```yaml
{{- $deploymentType := .Values.deploymentStrategy.type }}

apiVersion: apps/v1
kind: Deployment
metadata:
  name: erpnext-{{ if eq $deploymentType "blue-green" }}blue{{ else }}nginx{{ end }}
  namespace: {{ .Release.Namespace }}
  labels:
    app: erpnext
    {{- if eq $deploymentType "blue-green" }}
    deployment-color: blue
    {{- else if eq $deploymentType "canary" }}
    deployment-type: stable
    {{- end }}

spec:
  replicas: {{ .Values.nginx.replicaCount }}
  
  {{- if or (eq $deploymentType "rolling") (eq $deploymentType "recreate") (eq $deploymentType "ramped") }}
  strategy:
    type: {{ if eq $deploymentType "recreate" }}Recreate{{ else }}RollingUpdate{{ end }}
    {{- if ne $deploymentType "recreate" }}
    rollingUpdate:
      maxUnavailable: {{ .Values.deploymentStrategy.parameters.maxUnavailable }}
      maxSurge: {{ .Values.deploymentStrategy.parameters.maxSurge }}
    {{- end }}
  {{- end }}

  selector:
    matchLabels:
      app: erpnext
      {{- if eq $deploymentType "blue-green" }}
      deployment-color: blue
      {{- else if eq $deploymentType "canary" }}
      deployment-type: stable
      {{- end }}

  template:
    metadata:
      labels:
        app: erpnext
        {{- if eq $deploymentType "blue-green" }}
        deployment-color: blue
        {{- else if eq $deploymentType "canary" }}
        deployment-type: stable
        {{- end }}

    spec:
      containers:
      - name: nginx
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: 8080
          protocol: TCP
        # ... rest of container spec
```

---

## 6. ANSIBLE PLAYBOOK DISPATCHER

Main orchestration playbook:

```yaml
# Automation/ERPNext/playbooks/deployment-strategies.yaml
---
- name: ERPNext Deployment Strategy Orchestration
  hosts: kubernetes_masters
  gather_facts: yes
  vars:
    deployment_strategy: "{{ deployment_strategy | default('rolling') }}"
    erpnext_namespace: "erpnext"
    erpnext_chart_path: "{{ ansible_env.HOME }}/Applications/ERPNext/erpnext-official/erpnext"
    new_image_tag: "{{ new_image_tag | default('v15.88.0') }}"

  tasks:
    - name: Validate deployment strategy
      assert:
        that:
          - deployment_strategy in ['rolling', 'recreate', 'ramped', 'blue-green', 'canary', 'shadow']
        fail_msg: "Invalid strategy: {{ deployment_strategy }}"

    - name: Deploy using selected strategy
      include_role:
        name: deployment_strategies
        tasks_from: "{{ deployment_strategy }}.yml"
      vars:
        strategy_config: "{{ hostvars[inventory_hostname]['deployment_strategies'][deployment_strategy] }}"

    - name: Post-deployment validation
      block:
        - name: Wait for deployment to be ready
          kubernetes.core.k8s_info:
            kind: Deployment
            namespace: "{{ erpnext_namespace }}"
            name: erpnext-nginx
          register: deployment_status
          until: deployment_status.resources[0].status.readyReplicas == deployment_status.resources[0].spec.replicas
          retries: 30
          delay: 10

        - name: Verify service endpoints
          kubernetes.core.k8s_info:
            kind: Service
            namespace: "{{ erpnext_namespace }}"
            name: erpnext-nginx
          register: service_status

        - name: Health check endpoint
          uri:
            url: "http://{{ service_status.resources[0].spec.clusterIP }}:8080/app/home"
            method: GET
            status_code: 200
          retries: 5
          delay: 5
```

---

## 7. GROUP VARS CONFIGURATION

Update `Automation/ERPNext/playbooks/group_vars/all.yaml`:

```yaml
---
# Deployment Strategy Configuration
deployment_strategy: rolling  # Options: rolling, recreate, ramped, blue-green, canary, shadow

# Kubernetes cluster config
kubernetes_cluster_name: "waldhauser"
kubernetes_namespace: "erpnext"

# Image configuration
erpnext_image_repo: "frappe/erpnext"
erpnext_image_tag: "v15.87.1"
new_erpnext_image_tag: "v15.88.0"  # For deployments

# Strategy-specific parameters

# Blue-Green specific
blue_green_config:
  manual_approval: false
  cleanup_old_version: true
  health_check_timeout: 300

# Canary specific
canary_config:
  initial_weight: 10
  stage_durations:
    - weight: 10
      duration: 300
    - weight: 50
      duration: 300
    - weight: 100
      duration: 0
  error_rate_threshold: 5
  latency_p95_threshold: 1000

# Shadow specific
shadow_config:
  mirror_percent: 100
  monitoring_duration: 3600

# Helm configuration
helm_release_name: "erpnext"
helm_chart_path: "{{ playbook_dir }}/../../../Applications/ERPNext/erpnext-official/erpnext"

# Scaling configuration
replicas:
  nginx: 3
  gunicorn: 3
  workers:
    default: 2
    long: 1
    short: 2
```

---

## 8. EXECUTION EXAMPLES

### Run Rolling Update:
```bash
cd Automation/ERPNext/playbooks
ansible-playbook deployment-strategies.yaml -e "deployment_strategy=rolling"
```

### Run Blue-Green with manual approval:
```bash
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=blue-green" \
  -e "blue_green_manual_approval=true" \
  -e "new_erpnext_image_tag=v15.88.0"
```

### Run Canary:
```bash
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=canary" \
  -e "new_erpnext_image_tag=v15.88.0"
```

### Run Shadow:
```bash
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=shadow" \
  -e "new_erpnext_image_tag=v15.88.0"
```

---

## 9. DECISION MATRIX

| Strategy | K8s Native | Requires Ansible | Requires Istio | Requires Metrics | Downtime | Rollback Speed |
|----------|-----------|------------------|---------------|-----------------|---------|----|
| **Rolling** | ✅ Full | ❌ No | ❌ No | ❌ No | None | Fast |
| **Recreate** | ✅ Full | ❌ No | ❌ No | ❌ No | Full | Very Fast |
| **Ramped** | ✅ Full | ❌ No | ❌ No | ❌ No | None | Fast |
| **Blue-Green** | ⚠️ Partial | ✅ Yes | ❌ No | ❌ No | None | Instant |
| **Canary** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | Minimal | Medium |
| **Shadow** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | None | N/A |

---

## 10. NEXT STEPS

1. **Update values.yaml** with deployment strategy parameters
2. **Modify deployment templates** to support strategy selection
3. **Create Ansible role** with strategy-specific tasks
4. **Test each strategy** in dev/staging first
5. **Add metrics/monitoring** for canary and shadow strategies
6. **Implement GitOps** with ArgoCD for CD pipeline integration

---

## Additional Tools to Consider

- **Flagger** - Automated canary/blue-green with metrics analysis
- **Argo Rollouts** - Advanced progressive delivery
- **Istio** - Traffic management and mirroring for canary/shadow
- **Prometheus + AlertManager** - Metrics collection for automated rollbacks
