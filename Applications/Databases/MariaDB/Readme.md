# MariaDB Deployment using Helm

Quick deployment of MariaDB using the community Helm chart with resource limits.

## Prerequisites

- Kubernetes cluster running
- `kubectl` configured
- Helm 3.x installed
- `dbs` namespace created (or will be auto-created)

## Quick Deploy

Deploy MariaDB to the `dbs` namespace with a single command:

# PRODUCTION

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami && helm repo update && helm install mariadb bitnami/mariadb --namespace dbs --create-namespace --set auth.rootPassword=MySecurePassword123 --set primary.resources.limits.cpu=500m --set primary.resources.limits.memory=3Gi --set primary.resources.requests.cpu=250m --set primary.resources.requests.memory=1Gi
```

# SHADOW

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami && helm repo update && helm install mariadb-shadow bitnami/mariadb --namespace dbs --create-namespace --set auth.rootPassword=MySecurePassword123 --set primary.resources.limits.cpu=500m --set primary.resources.limits.memory=3Gi --set primary.resources.requests.cpu=250m --set primary.resources.requests.memory=1Gi
```

# COPY TO SHADOW

## 1. Get the root password from the original deployment
ORIGINAL_PASSWORD=$(kubectl get secret --namespace dbs mariadb -o jsonpath="{.data.mariadb-root-password}" | base64 -d)

## 2. Create a dump from the original database
kubectl exec -n dbs mariadb-0 -- mysqldump -u root -p${ORIGINAL_PASSWORD} --all-databases --single-transaction --quick --lock-tables=false > mariadb-backup.sql

## 3. Get the password for the shadow deployment
SHADOW_PASSWORD=$(kubectl get secret --namespace mariadb-shadow mariadb-shadow -o jsonpath="{.data.mariadb-root-password}" | base64 -d)

## 4. Restore to the shadow database
kubectl exec -i -n mariadb-shadow mariadb-shadow-0 -- mysql -u root -p${SHADOW_PASSWORD} < mariadb-backup.sql

## What This Command Does

1. **Adds the Bitnami Helm repository** - Official repository for MariaDB chart
2. **Updates Helm repositories** - Fetches latest chart versions
3. **Creates the namespace** - Creates `dbs` namespace if it doesn't exist (via `--create-namespace`)
4. **Deploys MariaDB** with the following configuration:
   - **Root Password**: `MySecurePassword123` (change this!)
   - **CPU Limits**: 500m (0.5 CPU)
   - **Memory Limits**: 3Gi (3GB RAM)
   - **CPU Requests**: 250m (optimal performance baseline)
   - **Memory Requests**: 1Gi (optimal memory baseline)
