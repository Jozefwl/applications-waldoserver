# Intro
This file contains commands and additional comments to help set up KEDA and rabbitMQ queue-size autoscaling of a custom application, used to process those images.
Currently it is set up to just spin up a busybox image which sleeps for 180s as a proof of concept.

# Install KEDA
Kubernetes Event-Driven Autoscaling

## Prerequirements:
- Helm

## Installation:
[Installation page - keda.sh/deploy](https://keda.sh/docs/2.18/deploy/)

```bash
helm repo add kedacore https://kedacore.github.io/charts  

helm repo update

helm install keda kedacore/keda --namespace keda --create-namespace
```

# Install RabbitMQ

1. Create certs secret

```bash
# Extract CA cert (+other certs and/or use Lens app)
kubectl config view --raw --flatten -o jsonpath='{.clusters[0].cluster.certificate-authority-data}' | base64 -d > ca.crt

# Use existing cluster CA || project CA
# tls.crt and tls.key is server origin certs
kubectl create secret generic rabbitmq-certs \
  --from-file=ca.crt=ca.crt \
  --from-file=tls.crt=tls.crt \
  --from-file=tls.key=tls.key \
  -n messagebrokers
  ```


2. Go to `/applications/Rabbitmq` folder
Install using helm chart
```bash
helm install rabbitmq ./rabbitmq -n messagebrokers --create-namespace 
```

3. Create KEDA scaledJob

```bash
kubectl create secret generic rabbitmq-credentials \
  --from-literal=password=mypassword123 \
  -n computation
```

`kubectl apply -f keda.yaml`
