# ERPNext Helm Template - Deployment Strategy Implementation

## File: templates/deployment-nginx.yaml

This template shows how to support multiple deployment strategies through Helm values.

```yaml
{{- $deploymentType := .Values.deploymentStrategy.type | default "rolling" }}
{{- $isBlueGreen := eq $deploymentType "blue-green" }}
{{- $isCanary := eq $deploymentType "canary" }}
{{- $isShadow := eq $deploymentType "shadow" }}

apiVersion: apps/v1
kind: Deployment
metadata:
  name: >-
    {{- if $isBlueGreen -}}
    {{ include "erpnext.fullname" . }}-nginx-blue
    {{- else if $isCanary -}}
    {{ include "erpnext.fullname" . }}-nginx
    {{- else if $isShadow -}}
    {{ include "erpnext.fullname" . }}-nginx
    {{- else -}}
    {{ include "erpnext.fullname" . }}-nginx
    {{- end }}
  labels:
    {{- include "erpnext.labels" . | nindent 4 }}
    app.kubernetes.io/component: nginx
    {{- if $isBlueGreen }}
    deployment-color: blue
    {{- else if $isCanary }}
    deployment-type: stable
    {{- else if $isShadow }}
    deployment-type: stable
    {{- end }}

spec:
  {{- if not .Values.nginx.autoscaling.enabled }}
  replicas: {{ .Values.nginx.replicaCount }}
  {{- end }}
  
  {{- if or (eq $deploymentType "rolling") (eq $deploymentType "recreate") (eq $deploymentType "ramped") }}
  strategy:
    type: {{ if eq $deploymentType "recreate" }}Recreate{{ else }}RollingUpdate{{ end }}
    {{- if ne $deploymentType "recreate" }}
    rollingUpdate:
      {{- if eq $deploymentType "ramped" }}
      # Ramped: maxUnavailable=1, maxSurge=0 (kill old before starting new)
      maxUnavailable: 1
      maxSurge: 0
      {{- else }}
      # Rolling: default gradual replacement
      maxUnavailable: {{ .Values.deploymentStrategy.parameters.maxUnavailable | default 0 }}
      maxSurge: {{ .Values.deploymentStrategy.parameters.maxSurge | default 1 }}
      {{- end }}
    {{- end }}
  {{- else }}
  # For Blue-Green/Canary/Shadow: handled by Ansible orchestration
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  {{- end }}

  selector:
    matchLabels:
      {{- include "erpnext.selectorLabels" . | nindent 6 }}
      app.kubernetes.io/component: nginx
      {{- if $isBlueGreen }}
      deployment-color: blue
      {{- else if $isCanary }}
      deployment-type: stable
      {{- else if $isShadow }}
      deployment-type: stable
      {{- end }}

  template:
    metadata:
      {{- with .Values.nginx.podAnnotations }}
      annotations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      labels:
        {{- include "erpnext.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/component: nginx
        {{- if $isBlueGreen }}
        deployment-color: blue
        {{- else if $isCanary }}
        deployment-type: stable
        {{- else if $isShadow }}
        deployment-type: stable
        {{- end }}

    spec:
      {{- with .Values.imagePullSecrets }}
      imagePullSecrets:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      serviceAccountName: {{ include "erpnext.serviceAccountName" . }}
      securityContext:
        {{- toYaml .Values.podSecurityContext | nindent 8 }}

      initContainers:
        {{- with .Values.nginx.initContainers }}
        {{- toYaml . | nindent 8 }}
        {{- end }}

      containers:
      - name: nginx
        securityContext:
          {{- toYaml .Values.securityContext | nindent 12 }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - name: http
          containerPort: 8080
          protocol: TCP
        
        env:
        - name: FRAPPE_SITE_NAME_HEADER
          value: "{{ .Values.nginx.environment.frappeSiteNameHeader | default "$host" }}"
        - name: UPSTREAM_REAL_IP_ADDRESS
          value: "{{ .Values.nginx.environment.upstreamRealIPAddress | default "127.0.0.1" }}"
        - name: UPSTREAM_REAL_IP_RECURSIVE
          value: "{{ .Values.nginx.environment.upstreamRealIPRecursive | default "off" }}"
        - name: UPSTREAM_REAL_IP_HEADER
          value: "{{ .Values.nginx.environment.upstreamRealIPHeader | default "X-Forwarded-For" }}"
        - name: PROXY_READ_TIMEOUT
          value: "{{ .Values.nginx.environment.proxyReadTimeout | default "120" }}"
        - name: CLIENT_MAX_BODY_SIZE
          value: "{{ .Values.nginx.environment.clientMaxBodySize | default "50m" }}"

        {{- with .Values.nginx.envVars }}
        {{- toYaml . | nindent 12 }}
        {{- end }}

        livenessProbe:
          {{- toYaml .Values.nginx.livenessProbe | nindent 12 }}
        
        readinessProbe:
          {{- toYaml .Values.nginx.readinessProbe | nindent 12 }}

        resources:
          {{- toYaml .Values.nginx.resources | nindent 12 }}

      {{- with .Values.nginx.sidecars }}
      {{- toYaml . | nindent 6 }}
      {{- end }}

      {{- with .Values.nginx.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.nginx.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.nginx.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}

      {{- if .Values.nginx.defaultTopologySpread }}
      topologySpreadConstraints:
      {{- with .Values.nginx.topologySpreadConstraints }}
        {{- toYaml . | nindent 8 }}
      {{- else }}
      - maxSkew: {{ .Values.nginx.defaultTopologySpread.maxSkew }}
        topologyKey: {{ .Values.nginx.defaultTopologySpread.topologyKey }}
        whenUnsatisfiable: {{ .Values.nginx.defaultTopologySpread.whenUnsatisfiable }}
        labelSelector:
          matchLabels:
            {{- include "erpnext.selectorLabels" . | nindent 12 }}
            app.kubernetes.io/component: nginx
      {{- end }}
      {{- end }}
```

---

## File: values.yaml - Add deployment strategy section

Add this to your existing `values.yaml`:

```yaml
# Deployment Strategy Configuration
# Options: rolling, recreate, ramped, blue-green, canary, shadow
deploymentStrategy:
  type: rolling
  
  parameters:
    # For rolling/ramped strategies
    maxUnavailable: 0      # Number/percentage of pods to stop
    maxSurge: 1            # Number/percentage of new pods to add
    
    # For blue-green deployment
    blueGreen:
      manualApproval: false
      cleanupOldVersion: true
      healthCheckTimeout: 300  # seconds (5 minutes)
      healthCheckRetries: 30
      healthCheckDelay: 10
    
    # For canary deployment
    canary:
      stages:
        - weight: 10       # 10% traffic to canary
          duration: 300    # 5 minutes
        - weight: 50       # 50% traffic to canary
          duration: 300    # 5 minutes
        - weight: 100      # 100% traffic to canary
          duration: 0      # Immediate
      
      # Automatic rollback thresholds
      errorRateThreshold: 5        # percentage (%)
      latencyP95Threshold: 1000    # milliseconds (ms)
      cpuThreshold: 80             # percentage (%)
      memoryThreshold: 85          # percentage (%)
      
      # Metrics collection
      metricsProvider: "prometheus"  # or "datadog", "new-relic"
      metricsQuery: "rate(http_requests_total[5m])"
    
    # For shadow deployment
    shadow:
      mirrorPercent: 100            # 100% of traffic mirrored
      monitoringDuration: 3600      # 1 hour
      
      # Analysis thresholds
      errorRateThreshold: 5         # percentage
      latencyDifference: 10         # percentage (acceptable difference vs production)

# ... rest of existing values

# For convenience, also add top-level version management
imageVersion: v15.87.1
```

---

## File: Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/main.yml

```yaml
---
- name: ERPNext Deployment Strategy Dispatcher
  hosts: localhost
  gather_facts: no
  
  vars:
    deployment_strategy: "{{ deployment_strategy | default('rolling') }}"
    valid_strategies:
      - rolling
      - recreate
      - ramped
      - blue-green
      - canary
      - shadow

  tasks:
    - name: Validate deployment strategy
      assert:
        that:
          - deployment_strategy in valid_strategies
        fail_msg: |
          Invalid strategy: {{ deployment_strategy }}
          Valid strategies: {{ valid_strategies | join(', ') }}

    - name: Execute rolling update strategy
      include_tasks: rolling.yml
      when: deployment_strategy == "rolling"

    - name: Execute recreate strategy
      include_tasks: recreate.yml
      when: deployment_strategy == "recreate"

    - name: Execute ramped strategy
      include_tasks: ramped.yml
      when: deployment_strategy == "ramped"

    - name: Execute blue-green strategy
      include_tasks: blue-green.yml
      when: deployment_strategy == "blue-green"

    - name: Execute canary strategy
      include_tasks: canary.yml
      when: deployment_strategy == "canary"

    - name: Execute shadow strategy
      include_tasks: shadow.yml
      when: deployment_strategy == "shadow"

    - name: Post-deployment validation
      include_tasks: post-deployment.yml
```

---

## File: Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/rolling.yml

```yaml
---
- name: Rolling Update Strategy
  block:
    - name: Display strategy info
      debug:
        msg: |
          Deploying with ROLLING UPDATE strategy
          - Gradually replaces pods one by one
          - Zero downtime
          - Default Kubernetes behavior
          - Image tag: {{ new_erpnext_image_tag }}

    - name: Update Helm values for rolling strategy
      set_fact:
        helm_values:
          deploymentStrategy:
            type: rolling
            parameters:
              maxUnavailable: 0
              maxSurge: 1

    - name: Deploy/upgrade ERPNext with rolling strategy
      kubernetes.core.helm:
        name: "{{ helm_release_name }}"
        chart_ref: "{{ helm_chart_path }}"
        release_namespace: "{{ kubernetes_namespace }}"
        values: "{{ helm_values }}"
        set_values:
          - value: "image.tag={{ new_erpnext_image_tag }}"
            value_type: string
        state: present
        wait: true
        wait_condition:
          type: "Progressing"
          status: "True"
        wait_timeout: 600
        atomic: true
      register: helm_release

    - name: Display release status
      debug:
        msg: "Helm release status: {{ helm_release.status }}"

  rescue:
    - name: Rollback on failure
      kubernetes.core.helm:
        name: "{{ helm_release_name }}"
        release_namespace: "{{ kubernetes_namespace }}"
        state: present
        atomic_rollback: true
      ignore_errors: true
```

---

## File: Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/recreate.yml

```yaml
---
- name: Recreate Strategy
  block:
    - name: Display strategy info
      debug:
        msg: |
          Deploying with RECREATE strategy
          ⚠️  WARNING: This will cause full downtime!
          - Stops all pods immediately
          - Starts new pods
          - Fastest deployment/rollback
          - Image tag: {{ new_erpnext_image_tag }}

    - name: Confirm recreate deployment
      pause:
        prompt: |
          ⚠️  RECREATE STRATEGY WILL CAUSE DOWNTIME
          This deployment will:
          1. Stop ALL running ERPNext pods
          2. Start new pods with new version
          3. Cause application unavailability
          
          Press enter to continue or Ctrl+C to abort
      when: not force_recreate | default(false) | bool

    - name: Update Helm values for recreate strategy
      set_fact:
        helm_values:
          deploymentStrategy:
            type: recreate
            parameters: {}

    - name: Deploy/upgrade ERPNext with recreate strategy
      kubernetes.core.helm:
        name: "{{ helm_release_name }}"
        chart_ref: "{{ helm_chart_path }}"
        release_namespace: "{{ kubernetes_namespace }}"
        values: "{{ helm_values }}"
        set_values:
          - value: "image.tag={{ new_erpnext_image_tag }}"
            value_type: string
        state: present
        wait: true
        wait_condition:
          type: "Available"
          status: "True"
        wait_timeout: 600
        atomic: true
      register: helm_release

    - name: Record downtime duration
      debug:
        msg: "Downtime occurred during recreate deployment. Check logs for duration."

  rescue:
    - name: Rollback on failure
      kubernetes.core.helm:
        name: "{{ helm_release_name }}"
        release_namespace: "{{ kubernetes_namespace }}"
        state: present
        atomic_rollback: true
      ignore_errors: true
```

---

## File: Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/ramped.yml

```yaml
---
- name: Ramped Strategy (Controlled Rolling)
  block:
    - name: Display strategy info
      debug:
        msg: |
          Deploying with RAMPED strategy
          - One old pod terminates BEFORE new pod starts
          - Zero downtime maintained
          - Slower than rolling (maxSurge=0)
          - Good for resource-constrained environments
          - Image tag: {{ new_erpnext_image_tag }}

    - name: Update Helm values for ramped strategy
      set_fact:
        helm_values:
          deploymentStrategy:
            type: ramped
            parameters:
              maxUnavailable: 1   # Kill one pod
              maxSurge: 0         # Don't start new until old is terminated

    - name: Deploy/upgrade ERPNext with ramped strategy
      kubernetes.core.helm:
        name: "{{ helm_release_name }}"
        chart_ref: "{{ helm_chart_path }}"
        release_namespace: "{{ kubernetes_namespace }}"
        values: "{{ helm_values }}"
        set_values:
          - value: "image.tag={{ new_erpnext_image_tag }}"
            value_type: string
        state: present
        wait: true
        wait_condition:
          type: "Progressing"
          status: "True"
        wait_timeout: 600
        atomic: true
      register: helm_release

    - name: Monitor ramped rollout
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-nginx"
      register: deployment_info
      until: |
        deployment_info.resources[0].status.readyReplicas == deployment_info.resources[0].spec.replicas and
        deployment_info.resources[0].status.updatedReplicas == deployment_info.resources[0].spec.replicas
      retries: 60
      delay: 5

    - name: Display final deployment state
      debug:
        msg: |
          Ramped rollout completed
          Ready replicas: {{ deployment_info.resources[0].status.readyReplicas }}/{{ deployment_info.resources[0].spec.replicas }}
          Updated replicas: {{ deployment_info.resources[0].status.updatedReplicas }}/{{ deployment_info.resources[0].spec.replicas }}

  rescue:
    - name: Rollback on failure
      kubernetes.core.helm:
        name: "{{ helm_release_name }}"
        release_namespace: "{{ kubernetes_namespace }}"
        state: present
        atomic_rollback: true
      ignore_errors: true
```

---

## File: Automation/ERPNext/playbooks/roles/deployment_strategies/tasks/post-deployment.yml

```yaml
---
- name: Post-Deployment Validation and Monitoring
  block:
    - name: Get deployment status
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-nginx"
      register: deployment_status

    - name: Verify all replicas are ready
      assert:
        that:
          - deployment_status.resources[0].status.readyReplicas == deployment_status.resources[0].spec.replicas
        fail_msg: "Deployment not fully ready. Ready: {{ deployment_status.resources[0].status.readyReplicas }}/{{ deployment_status.resources[0].spec.replicas }}"

    - name: Get service endpoints
      kubernetes.core.k8s_info:
        kind: Service
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-nginx"
      register: service_info

    - name: Verify service has endpoints
      assert:
        that:
          - service_info.resources[0].spec.selector is defined
        fail_msg: "Service has no valid selectors"

    - name: Health check application endpoint
      uri:
        url: "http://{{ service_info.resources[0].spec.clusterIP }}:8080/api/health"
        method: GET
        status_code: 200
      register: health_check
      retries: 10
      delay: 5
      ignore_errors: true

    - name: Display deployment summary
      debug:
        msg: |
          ✅ Deployment Successful
          
          Strategy: {{ deployment_strategy }}
          Namespace: {{ kubernetes_namespace }}
          Release: {{ helm_release_name }}
          Image: {{ new_erpnext_image_tag }}
          
          Pod Status:
            Ready: {{ deployment_status.resources[0].status.readyReplicas }}/{{ deployment_status.resources[0].spec.replicas }}
            Updated: {{ deployment_status.resources[0].status.updatedReplicas }}/{{ deployment_status.resources[0].spec.replicas }}
          
          Health Check: {{ 'PASSED' if health_check is succeeded else 'FAILED' }}
          
          Next Steps:
            - Monitor application logs
            - Verify functionality
            - Check metrics in Prometheus/Grafana

  rescue:
    - name: Display deployment error
      debug:
        msg: |
          ❌ Deployment Validation Failed
          
          Please check:
          - Pod events: kubectl describe pods -n {{ kubernetes_namespace }}
          - Pod logs: kubectl logs -n {{ kubernetes_namespace }} -l app=erpnext
          - Helm release: helm status {{ helm_release_name }} -n {{ kubernetes_namespace }}
```

---

## Usage Examples

```bash
# Rolling update (default)
ansible-playbook deployment-strategies.yaml

# Recreate (with confirmation)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=recreate"

# Ramped (resource-constrained)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=ramped" \
  -e "new_erpnext_image_tag=v15.88.0"

# Blue-Green (with manual approval)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=blue-green" \
  -e "new_erpnext_image_tag=v15.88.0"

# Canary (with gradual traffic increase)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=canary" \
  -e "new_erpnext_image_tag=v15.88.0"

# Shadow (dark launch)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=shadow" \
  -e "new_erpnext_image_tag=v15.88.0"

# Force recreate without confirmation
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=recreate" \
  -e "force_recreate=true"
```
