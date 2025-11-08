# WIP

 helm upgrade --install -n nfs in-cluster nfs-ganesha-server-and-external-provisioner/nfs-server-provisioner --set 'storageClass.mountOptions={vers=4.1}' --set persistence.enabled=true --set persistence.size=8Gi 

Release "in-cluster" does not exist. Installing it now.
NAME: in-cluster
LAST DEPLOYED: Sat Nov  8 14:20:48 2025
NAMESPACE: nfs
STATUS: deployed
REVISION: 1
TEST SUITE: None
NOTES:
The NFS Provisioner service has now been installed.

A storage class named 'nfs' has now been created
and is available to provision dynamic volumes.

You can use this storageclass by creating a `PersistentVolumeClaim` with the
correct storageClassName attribute. For example:

    ---
    kind: PersistentVolumeClaim
    apiVersion: v1
    metadata:
      name: test-dynamic-volume-claim
    spec:
      storageClassName: "nfs"
      accessModes:
        - ReadWriteOnce
      resources:
        requests:
          storage: 100Mi`


kubectl create namespace erpnext
helm repo add frappe https://helm.erpnext.com
helm upgrade --install frappe-bench --namespace erpnext frappe/erpnext

helm upgrade --install frappe-bench frappe/erpnext -n erpnext \
  --set erpnext.persistence.storageClass=nfs \
  --set erpnext.persistence.accessMode=ReadWriteMany \
  --set ingress.enabled=true \
  --set ingress.className=traefik \
  --set ingress.annotations."traefik\.ingress\.kubernetes\.io/router.entrypoints"=websecure \
  --set ingress.annotations."traefik\.ingress\.kubernetes\.io/router.tls"="true" \
  --set ingress.hosts[0].host=erp.waldhauser.sk \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix \
  --set ingress.tls[0].secretName=cloudflare-origin-tls \
  --set ingress.tls[0].hosts[0]=erp.waldhauser.sk

Reason: ERPNext pods (gunicorn, workers, nginx) need shared RWX volume for site files, logs, assets. MariaDB/Redis remain on RWO local-path for performance.

Important: NFS client packages are required on all Kubernetes nodes to mount the in-cluster NFS volumes. Install one of the following on each node, then cordon/drain as needed:

- Debian/Ubuntu: nfs-common
- RHEL/CentOS/Rocky: nfs-utils

If you see errors like "bad option; ... need a /sbin/mount.nfs helper program", it means the NFS client package is missing on that node.
