```
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
```
```
helm upgrade --install postgresql-release bitnami/postgresql --version 15.4.1 --values postgresql-values.yaml --namespace apps
```