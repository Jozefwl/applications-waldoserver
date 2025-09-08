# Nextcloud Helm Chart

![Nextcloud](https://img.shields.io/badge/Nextcloud-0082C9?style=for-the-badge&logo=Nextcloud&logoColor=white)
![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)
![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)


Made to support Redis caching and PostgreSQL, you can deploy them with their respective helm charts in this repo.

## Configuration

You can find the configuration in /values file over in
`/Nextcloud/nextcloud-default/values.yaml`

## Commands

### Default multi replica
```bash
helm install nextcloud-default nextcloud-default/ --values nextcloud-default/values.yaml --namespace apps
```
### Upgrade Deployment
Change image version in `/values.yaml`

**Versions**: `30.0.14`, `31.0.8`, `31.0`

```bash
helm upgrade nextcloud-default nextcloud-default/ \
  --values nextcloud-default/values.yaml \
  --namespace apps
```

### Rollback
```bash
helm rollback nextcloud-default [revision number] --namespace apps
```

### Uninstall
```bash
helm uninstall nextcloud-default --namespace apps
```