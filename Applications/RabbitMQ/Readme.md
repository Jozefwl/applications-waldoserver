# Custom cert creation

### Generate private key
```bash
openssl genrsa -out rabbitmq-key.pem 2048
```

### Generate self-signed certificate with internal DNS names
```bash
openssl req -new -x509 -key rabbitmq-key.pem -out rabbitmq-cert.pem -days 365 \
  -subj "/CN=rabbitmq.messagebrokers.svc.cluster.local" \
  -addext "subjectAltName=DNS:rabbitmq.messagebrokers.svc.cluster.local,DNS:rabbitmq.messagebrokers.svc,DNS:rabbitmq.messagebrokers,DNS:localhost,IP:127.0.0.1"
```

# Secrets creation

### Create RabbitMQ secret
```bash
kubectl create secret tls rabbitmq-certs \
  --cert=rabbitmq-cert.pem \
  --key=rabbitmq-key.pem \
  --namespace=messagebrokers
```

### Create KEDA secret
```bash
kubectl create secret generic rabbitmq-secret \
  -n computation \
  --from-literal=host=$(echo "amqps://myuser:mypassword123@rabbitmq.messagebrokers.svc.cluster.local:5671/" | base64) \
  --from-literal=tls=$(echo "enable" | base64) \
  --from-literal=ca=$(cat ca.b64)
```