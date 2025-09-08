
# Prerequisites:
## DB Stuff
```bash
# Check if postgres user exists
kubectl exec -it $(kubectl get pods -n apps -l app=postgresql -o jsonpath='{.items[0].metadata.name}') -n apps -- psql -U postgres -c "\du"
```
```bash
# Create User planka for Postgres
kubectl exec -it $(kubectl get pods -n apps -l app=postgresql -o jsonpath='{.items[0].metadata.name}') -n apps -- psql -U postgres -c "CREATE USER planka WITH PASSWORD 'pl4nk4p4ssw0rd';" || echo "User already exists"
```
```bash
# Create Database planka for Postgres
kubectl exec -it $(kubectl get pods -n apps -l app=postgresql -o jsonpath='{.items[0].metadata.name}') -n apps -- psql -U postgres -c "CREATE DATABASE planka OWNER planka;" || echo "Database already exists"
```
```bash
# Grant privileges to user planka for Postgres
kubectl exec -it $(kubectl get pods -n apps -l app=postgresql -o jsonpath='{.items[0].metadata.name}') -n apps -- psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE planka TO planka;"
```
## Secrets
```bash
# Create the PostgreSQL secret
kubectl create secret generic planka-postgresql-secret \
  --from-literal=uri="postgresql://username:password@postgresql-service.apps.svc.cluster.local:5432/planka" \
  -n apps
```
```bash
# Create Planka admin secret
kubectl create secret generic planka-admin-secret \
  --from-literal=password=admin \
  --from-literal=username=admin \
  -n apps
```
### SecretKey
You can generate one with `openssl rand -hex 64`
```bash
# Create secret key secret
kubectl create secret generic planka-secret-key \
  --from-literal=key=CHANGEME_5as456fd4ads65f1ds56fg146sfd5g4... \
  -n apps
```
### Fill values.yaml
Or edit to what you need
Networkpolicies in templates is hardcoded that's a WIP/TODO

# Install
(in capital **P**lanka directory above lowercase **p**lanka directory)
```bash
helm install planka-release planka/ --values planka/values.yaml --namespace apps \
```
