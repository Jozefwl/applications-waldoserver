# Install:
```bash
helm install redis.release redis/ --values redis/values.yaml --namespace apps
```

# Upgrade:
```bash
helm upgrade redis.release redis/ --values redis/values.yaml --namespace apps
```