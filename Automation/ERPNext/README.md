# Deployment strategies automation for ERPNext/frappe using Ansible
## Recreate

- Deploy Recreate

```bash
sudo ansible-playbook main.yaml -e TARGET_NODE=local -e deployment_strategy="canary"
```

## Rolling

- Deploy Rolling

```bash
sudo ansible-playbook main.yaml -e TARGET_NODE=local -e deployment_strategy="rolling"
```

## Ramped
- Deploy Ramped

```bash
sudo ansible-playbook main.yaml -e TARGET_NODE=local -e deployment_strategy="ramped"
```

## Canary 
- Deploy Canary

```bash
sudo ansible-playbook main.yaml -e TARGET_NODE=local -e deployment_strategy="canary" 
```

- Rollback Canary

```bash
sudo ansible-playbook main.yaml -e TARGET_NODE=local -e deployment_strategy="canary" -e canary_rollback=True
```

## Shadow

- Deploy Shadow

```bash
sudo ansible-playbook main.yaml -e TARGET_NODE=local -e deployment_strategy="shadow" 
```

- Rollback Canary

```bash
sudo ansible-playbook main.yaml -e TARGET_NODE=local -e deployment_strategy="shadow" -e shadow_rollback=True
```
