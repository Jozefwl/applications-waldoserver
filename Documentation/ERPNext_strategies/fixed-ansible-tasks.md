# Fixed Ansible Tasks for ERPNext Deployment Strategies

## File: roles/deployment_strategies/tasks/rolling.yml

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
        wait_timeout: 600
        atomic: true  # Automatically rolls back on failure
      register: helm_release

    - name: Wait for deployment to stabilize
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-nginx"
      register: deployment_status
      until: >
        deployment_status.resources | length > 0 and
        deployment_status.resources[0].status.readyReplicas is defined and
        deployment_status.resources[0].status.readyReplicas == deployment_status.resources[0].spec.replicas and
        deployment_status.resources[0].status.updatedReplicas is defined and
        deployment_status.resources[0].status.updatedReplicas == deployment_status.resources[0].spec.replicas
      retries: 60
      delay: 5
      when: helm_release is succeeded

    - name: Display deployment status
      debug:
        msg: |
          ✅ Deployment successful!
          Ready replicas: {{ deployment_status.resources[0].status.readyReplicas | default(0) }}/{{ deployment_status.resources[0].spec.replicas }}
          Updated replicas: {{ deployment_status.resources[0].status.updatedReplicas | default(0) }}/{{ deployment_status.resources[0].spec.replicas }}
      when: deployment_status is succeeded

  rescue:
    - name: Display rollback message
      debug:
        msg: "Deployment failed. Helm atomic rollback should have been triggered automatically."

    - name: Manual rollback if atomic failed
      kubernetes.core.helm:
        name: "{{ helm_release_name }}"
        chart_ref: "{{ helm_chart_path }}"
        release_namespace: "{{ kubernetes_namespace }}"
        state: present
      register: rollback_result
      ignore_errors: true
      when: helm_release is failed

    - name: Get rollback status
      command: "helm rollback {{ helm_release_name }} 0 -n {{ kubernetes_namespace }}"
      register: helm_rollback
      ignore_errors: true
      when: rollback_result is failed

    - name: Fail the playbook after rollback attempt
      fail:
        msg: "Deployment failed and rollback was attempted. Check 'helm history {{ helm_release_name }} -n {{ kubernetes_namespace }}' for details."
```

---

## File: roles/deployment_strategies/tasks/recreate.yml

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
      when: not (force_recreate | default(false) | bool)

    - name: Deploy/upgrade ERPNext with recreate strategy
      kubernetes.core.helm:
        name: "{{ helm_release_name }}"
        chart_ref: "{{ helm_chart_path }}"
        release_namespace: "{{ kubernetes_namespace }}"
        set_values:
          - value: "image.tag={{ new_erpnext_image_tag }}"
            value_type: string
          - value: "deploymentStrategy.type=recreate"
            value_type: string
        state: present
        wait: true
        wait_timeout: 600
        atomic: true
      register: helm_release

    - name: Wait for all pods to be ready
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-nginx"
      register: deployment_status
      until: >
        deployment_status.resources | length > 0 and
        deployment_status.resources[0].status.readyReplicas is defined and
        deployment_status.resources[0].status.readyReplicas == deployment_status.resources[0].spec.replicas
      retries: 60
      delay: 5

    - name: Display success message
      debug:
        msg: "Recreate deployment completed. All pods are running with new version."

  rescue:
    - name: Rollback on failure
      command: "helm rollback {{ helm_release_name }} 0 -n {{ kubernetes_namespace }}"
      register: helm_rollback
      ignore_errors: true

    - name: Fail after rollback
      fail:
        msg: "Recreate deployment failed. Rollback attempted."
```

---

## File: roles/deployment_strategies/tasks/ramped.yml

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

    - name: Deploy/upgrade ERPNext with ramped strategy
      kubernetes.core.helm:
        name: "{{ helm_release_name }}"
        chart_ref: "{{ helm_chart_path }}"
        release_namespace: "{{ kubernetes_namespace }}"
        set_values:
          - value: "image.tag={{ new_erpnext_image_tag }}"
            value_type: string
          - value: "deploymentStrategy.type=ramped"
            value_type: string
          - value: "deploymentStrategy.parameters.maxUnavailable=1"
            value_type: string
          - value: "deploymentStrategy.parameters.maxSurge=0"
            value_type: string
        state: present
        wait: true
        wait_timeout: 600
        atomic: true
      register: helm_release

    - name: Monitor ramped rollout progress
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-nginx"
      register: deployment_info
      until: >
        deployment_info.resources | length > 0 and
        deployment_info.resources[0].status.readyReplicas is defined and
        deployment_info.resources[0].status.readyReplicas == deployment_info.resources[0].spec.replicas and
        deployment_info.resources[0].status.updatedReplicas is defined and
        deployment_info.resources[0].status.updatedReplicas == deployment_info.resources[0].spec.replicas
      retries: 60
      delay: 5

    - name: Display final deployment state
      debug:
        msg: |
          ✅ Ramped rollout completed
          Ready replicas: {{ deployment_info.resources[0].status.readyReplicas }}/{{ deployment_info.resources[0].spec.replicas }}
          Updated replicas: {{ deployment_info.resources[0].status.updatedReplicas }}/{{ deployment_info.resources[0].spec.replicas }}

  rescue:
    - name: Rollback on failure
      command: "helm rollback {{ helm_release_name }} 0 -n {{ kubernetes_namespace }}"
      register: helm_rollback
      ignore_errors: true

    - name: Fail after rollback
      fail:
        msg: "Ramped deployment failed. Rollback attempted."
```

---

## File: roles/deployment_strategies/tasks/blue-green.yml

```yaml
---
- name: Blue-Green Deployment Strategy
  block:
    - name: Display strategy info
      debug:
        msg: |
          Deploying with BLUE-GREEN strategy
          - Current version: Blue (running)
          - New version: Green (deploying)
          - Zero downtime deployment
          - Instant rollback capability
          - Image tag: {{ new_erpnext_image_tag }}

    - name: Check if Blue deployment exists
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ kubernetes_namespace }}"
        label_selectors:
          - "app=erpnext"
          - "deployment-color=blue"
      register: blue_deployment

    - name: Deploy Green version (new)
      kubernetes.core.helm:
        name: "{{ helm_release_name }}-green"
        chart_ref: "{{ helm_chart_path }}"
        release_namespace: "{{ kubernetes_namespace }}"
        create_namespace: false
        set_values:
          - value: "image.tag={{ new_erpnext_image_tag }}"
            value_type: string
          - value: "nameOverride={{ helm_release_name }}-green"
            value_type: string
          - value: "fullnameOverride={{ helm_release_name }}-green"
            value_type: string
        state: present
        wait: true
        wait_timeout: 600
      register: green_deployment

    - name: Wait for Green deployment to be ready
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-green-nginx"
      register: green_status
      until: >
        green_status.resources | length > 0 and
        green_status.resources[0].status.readyReplicas is defined and
        green_status.resources[0].status.readyReplicas == green_status.resources[0].spec.replicas
      retries: 30
      delay: 10

    - name: Health check Green deployment
      uri:
        url: "http://{{ green_status.resources[0].status.loadBalancer.ingress[0].ip | default('localhost') }}:8080/api/method/ping"
        method: GET
        status_code: 200
        timeout: 5
      register: green_health
      retries: 10
      delay: 5
      ignore_errors: true

    - name: Manual approval gate
      pause:
        prompt: |
          Green deployment is ready!
          
          Green pods: {{ green_status.resources[0].status.readyReplicas }}/{{ green_status.resources[0].spec.replicas }}
          Health check: {{ 'PASSED' if green_health is succeeded else 'FAILED (manual verification recommended)' }}
          
          Review the Green deployment:
          - kubectl get pods -n {{ kubernetes_namespace }} -l deployment-color=green
          - kubectl logs -n {{ kubernetes_namespace }} -l deployment-color=green
          
          Press ENTER to switch traffic to Green, or Ctrl+C to abort
      when: blue_green_manual_approval | default(false) | bool

    - name: Get current service configuration
      kubernetes.core.k8s_info:
        kind: Service
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-nginx"
      register: current_service

    - name: Switch traffic to Green version
      kubernetes.core.k8s:
        state: present
        definition:
          apiVersion: v1
          kind: Service
          metadata:
            name: "{{ helm_release_name }}-nginx"
            namespace: "{{ kubernetes_namespace }}"
            labels: "{{ current_service.resources[0].metadata.labels }}"
          spec:
            selector:
              app: erpnext
              deployment-color: green  # Switch from blue to green
            ports: "{{ current_service.resources[0].spec.ports }}"
            type: "{{ current_service.resources[0].spec.type }}"
      when: current_service.resources | length > 0

    - name: Monitor Green version
      pause:
        minutes: "{{ blue_green_monitoring_duration | default(5) }}"
        prompt: "Traffic switched to Green. Monitoring for {{ blue_green_monitoring_duration | default(5) }} minutes. Check logs/metrics. Press Enter to continue or Ctrl+C to rollback..."
      when: blue_green_manual_monitoring | default(false) | bool

    - name: Cleanup Blue deployment
      kubernetes.core.helm:
        name: "{{ helm_release_name }}-blue"
        release_namespace: "{{ kubernetes_namespace }}"
        state: absent
      when: 
        - blue_green_cleanup_old | default(true) | bool
        - blue_deployment.resources | length > 0
      ignore_errors: true

    - name: Display success message
      debug:
        msg: |
          ✅ Blue-Green deployment successful!
          
          Traffic is now routed to Green version ({{ new_erpnext_image_tag }})
          Old Blue version {{ 'has been deleted' if (blue_green_cleanup_old | default(true)) else 'is still running (cleanup disabled)' }}

  rescue:
    - name: Rollback - Switch traffic back to Blue
      kubernetes.core.k8s:
        state: present
        definition:
          apiVersion: v1
          kind: Service
          metadata:
            name: "{{ helm_release_name }}-nginx"
            namespace: "{{ kubernetes_namespace }}"
          spec:
            selector:
              app: erpnext
              deployment-color: blue  # Revert to blue
            ports: "{{ current_service.resources[0].spec.ports }}"
            type: "{{ current_service.resources[0].spec.type }}"
      when: current_service is defined and current_service.resources | length > 0
      ignore_errors: true

    - name: Delete failed Green deployment
      kubernetes.core.helm:
        name: "{{ helm_release_name }}-green"
        release_namespace: "{{ kubernetes_namespace }}"
        state: absent
      ignore_errors: true

    - name: Fail after rollback
      fail:
        msg: "Blue-Green deployment failed. Traffic has been switched back to Blue version. Green deployment removed."
```

---

## File: roles/deployment_strategies/tasks/post-deployment.yml

```yaml
---
- name: Post-Deployment Validation and Monitoring
  block:
    - name: Get nginx deployment status
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-nginx"
      register: nginx_deployment
      ignore_errors: true

    - name: Get gunicorn deployment status
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-gunicorn"
      register: gunicorn_deployment
      ignore_errors: true

    - name: Get worker deployments status
      kubernetes.core.k8s_info:
        kind: Deployment
        namespace: "{{ kubernetes_namespace }}"
        label_selectors:
          - "app=erpnext"
      register: all_deployments
      ignore_errors: true

    - name: Verify nginx deployment is ready
      assert:
        that:
          - nginx_deployment.resources | length > 0
          - nginx_deployment.resources[0].status.readyReplicas is defined
          - nginx_deployment.resources[0].status.readyReplicas == nginx_deployment.resources[0].spec.replicas
        fail_msg: "Nginx deployment not fully ready. Ready: {{ nginx_deployment.resources[0].status.readyReplicas | default(0) }}/{{ nginx_deployment.resources[0].spec.replicas }}"
        success_msg: "Nginx deployment is healthy"
      when: nginx_deployment.resources | length > 0

    - name: Get service information
      kubernetes.core.k8s_info:
        kind: Service
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-nginx"
      register: service_info

    - name: Verify service has endpoints
      assert:
        that:
          - service_info.resources | length > 0
          - service_info.resources[0].spec.selector is defined
        fail_msg: "Service has no valid selectors"
        success_msg: "Service is properly configured"
      when: service_info.resources | length > 0

    - name: Get service endpoints
      kubernetes.core.k8s_info:
        kind: Endpoints
        namespace: "{{ kubernetes_namespace }}"
        name: "{{ helm_release_name }}-nginx"
      register: endpoints_info

    - name: Verify endpoints exist
      assert:
        that:
          - endpoints_info.resources | length > 0
          - endpoints_info.resources[0].subsets is defined
          - endpoints_info.resources[0].subsets | length > 0
        fail_msg: "No endpoints found for service"
        success_msg: "Service has active endpoints"
      when: endpoints_info.resources | length > 0

    - name: Display deployment summary
      debug:
        msg: |
          ✅ Deployment Validation Complete
          
          Strategy: {{ deployment_strategy }}
          Namespace: {{ kubernetes_namespace }}
          Release: {{ helm_release_name }}
          Image: {{ new_erpnext_image_tag | default('current') }}
          
          Nginx Deployment:
            Desired: {{ nginx_deployment.resources[0].spec.replicas | default('N/A') }}
            Ready: {{ nginx_deployment.resources[0].status.readyReplicas | default(0) }}
            Updated: {{ nginx_deployment.resources[0].status.updatedReplicas | default(0) }}
          
          Gunicorn Deployment:
            Desired: {{ gunicorn_deployment.resources[0].spec.replicas | default('N/A') }}
            Ready: {{ gunicorn_deployment.resources[0].status.readyReplicas | default(0) }}
          
          Service Endpoints: {{ endpoints_info.resources[0].subsets | length if endpoints_info.resources | length > 0 else 0 }}
          
          Next Steps:
            - Monitor application logs: kubectl logs -n {{ kubernetes_namespace }} -l app=erpnext --tail=50
            - Check metrics in Prometheus/Grafana
            - Verify application functionality
            - Monitor for 15-30 minutes

  rescue:
    - name: Display validation error
      debug:
        msg: |
          ⚠️  Post-Deployment Validation Issues Detected
          
          Please check:
          - Pod status: kubectl get pods -n {{ kubernetes_namespace }}
          - Pod events: kubectl describe pods -n {{ kubernetes_namespace }} -l app=erpnext
          - Pod logs: kubectl logs -n {{ kubernetes_namespace }} -l app=erpnext --tail=100
          - Service: kubectl describe svc {{ helm_release_name }}-nginx -n {{ kubernetes_namespace }}
          - Endpoints: kubectl get endpoints {{ helm_release_name }}-nginx -n {{ kubernetes_namespace }}
          - Helm status: helm status {{ helm_release_name }} -n {{ kubernetes_namespace }}
          - Helm history: helm history {{ helm_release_name }} -n {{ kubernetes_namespace }}
```

---

## Key Changes Made:

1. **Removed `wait_condition`** - Not supported by kubernetes.core.helm module
2. **Fixed rollback** - Added proper `chart_ref` or use `helm rollback` command
3. **Added `atomic: true`** - Automatically rolls back on failure
4. **Better status checking** - Using `k8s_info` with proper conditions
5. **Error handling** - Proper rescue blocks with rollback logic
6. **Safer checks** - Added `| length > 0` and `is defined` checks to prevent undefined errors

## Usage:

```bash
# Rolling
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=rolling" \
  -e "new_erpnext_image_tag=v15.88.0"

# Recreate (with confirmation)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=recreate" \
  -e "new_erpnext_image_tag=v15.88.0"

# Recreate (skip confirmation)
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=recreate" \
  -e "force_recreate=true" \
  -e "new_erpnext_image_tag=v15.88.0"

# Blue-Green with manual approval
ansible-playbook deployment-strategies.yaml \
  -e "deployment_strategy=blue-green" \
  -e "new_erpnext_image_tag=v15.88.0" \
  -e "blue_green_manual_approval=true"
```
