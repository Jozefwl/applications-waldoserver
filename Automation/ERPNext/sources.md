https://docs.ansible.com/projects/ansible/latest/collections/kubernetes/core/helm_module.html

https://stackoverflow.com/questions/62259002/merging-yaml-files-or-variables-in-ansible-for-patching-kubernetes-deployments

https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/combine_filter.html

https://docs.ansible.com/projects/ansible/latest/collections/ansible/builtin/uri_module.html

https://docs.ansible.com/projects/ansible/latest/playbook_guide/playbooks_loops.html#registering-variables-with-a-loop


The main questions are: 
RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?

RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?

RQ4: What is the rollback time and recovery complexity for each strategy?

------------- recreate ------------------

RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?
Recreate doesn't support tenant-aware traffic routing, there is a single ingress already provided by the helm chart of the application, there is no routing granularity apart from the one provided by the application.
Implementation complexity is simple, Kubernetes' HELM supports the Recreate strategy, all that needs to be done is deploymentStrategy object has to be modified to specify it -> 'Recreate'.

RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?
Empirical evaluation has shown that downtime is significant, on the testing workload about a minute. The application's latency is not applicable here because of the downtime, the new deployed application serves requests with same comparable latency as the previously deployed version. The error rates are high, about ~80% unavilability during the duration of the deployment, which took around 2 minutes - the end users see a 503 server unavailable error. If there is an ongoing job in the background, the pod does not terminate until the job is complete. 

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?
All of the tenants are unavailable, because the application serves all the tenants. Because of the nature of the Recreate deployment, all pods are terminated, making the application unavailable for a short time for all tenants.

RQ4: What is the rollback time and recovery complexity for each strategy?
Rollback takes around a minute, and is possible by using helm rollback command, which uses the previous used helm chart, containing the deployment strategy to roll back to the previous version of the application. Recovery complexity is simple, it is as complex as deploying the application, the old version has to be deployed to roll back.

------------- rolling and ramped ------------------
RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?


RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?

RQ4: What is the rollback time and recovery complexity for each strategy?


-------------- bluegreen ---------------

- two separate environments
- network router to route traffic to preview version (with host header replacement for the application's internal routing to work)
- swapping of production and previewslot traffic (by swapping target environment of ingressRoutes and production ingress)


RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?
This strategy supports tenant aware traffic routing, as the preview ingressroute can be swapped to production using an automation (not implemented into this thesis' automation, done manually for testing purposes), meaning that routing granularity is high, if implemented correctly. In most of the overviews of blue green the environments, similar to the one implemented in the thesis, it's not very granluar, because we swap all of the tenants from preview to production and back. The implementation complexity is high, if the application doesn't support it as is the case with ERPNext, where a middleware has to be used to swap the Host header for one the application understands, because the preview tenant doesn't exist, only one without the preview in the domain, it searches for the preview.tenant1.erp.waldhauser.sk tenant and fails, because it doesn't exist, therefore we have to swap the host header (also set in the helm values ingress matching to be $Host) to remove preview. from in front of the host, to be able to find it. If the application doesn't evaluate the host header and instead uses some other differentiator for tenants, such as application workspace identifier in the URI, the preview slot can route with a simple preview ingress. In the case of this thesis, the implementation complexity is high, but it depends on the internal routing of the application.

RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?
This deployment strategy does not cause downtime, because we maintain two separate production environments at a time, latency is comparably the same in the production and preview versions, because of the external mariadb database we have to take into consideration possible data upgrades.

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?
The tenants on the same server experience a short increase in response time from ~50ms to about ~100ms for the duration of the deployment.
The latency is caused as an unintended side effect of the blue/green pods being deployed.

RQ4: What is the rollback time and recovery complexity for each strategy?
The rollback is easy, as the after changing the ingressroute selector starts routing traffic to the old version insantly. Recovery complexity is in a range of easy to difficult. It is necessary to do a database backup if we have breaking changes in things such as the database schema, so that we can roll back properly, but if such breaking changes do happen then we will have downtime.
--------------- canary -----------------
https://traefik.io/glossary/kubernetes-deployment-strategies-blue-green-canary
https://doc.traefik.io/traefik/reference/routing-configuration/http/load-balancing/service/#weighted-round-robin-wrr


RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?
This deployment strategy focuses on routing requests to a canary version, which allows for high granularity of routing by design. The implementation complexity is high, as we either have to use weighted round robin in traefik or istio for distributing the traffic based on weights. It is comparable to the blue-green with host replacement. In this implementation, i don't use the previewslot middleware used in blue-green since i'm directly distributing the traffic on the production ingress, which links to the ingressroute with weighted round robin and then distributes the requests based on weights.

RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?
There is no impact in availability, as the production environment and its ingress is not changed at until the canary deployment is finished. While it gets modified after deployment, to use the ingressRoute rules, there is no percievable downtime. The latency is caused as an unintended side effect of the canary pods being deployed.

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?
In the case of this thesis, we are running an additional replica of the environment (where as in production has 2 replicas) and the deployment causes a small increase in response times for other tenants. 

RQ4: What is the rollback time and recovery complexity for each strategy?
In this case, it is very easy to roll back and it is practically instant. If we want to stop using the canary version, we just change the weights to route 100% to the stable version.

------------- shadow -----------------

https://doc.traefik.io/traefik/reference/routing-configuration/http/load-balancing/service/#mirroring 

RQ1: To what extent do deployment strategies support tenant-aware traffic routing when evaluated by routing granularity and implementation complexity?
this strategy does not route existing tenants to the shadow deployment, as all the traffic is mirrored. There is no routing granularity, because all the traffic is mirrored. The implementation complexity is simple and can be done using traefik to mirror all the traffic to the shadow version.
The implementation complexity is high, as we have to create a copy of the production database as to not affect it, and we have to route a copy of the production traffic to the shadow version.

RQ2: How do deployment strategies differ in their impact on availability, latency, and 
error rates for a multitenant workload?
There is no impact on availability or error rates during this deployment, 

RQ3: What unintended side effects do deployment strategies introduce for non-target tenants in a multitenant SaaS environment?

RQ4: What is the rollback time and recovery complexity for each strategy?


------- common errors ------------

(PUT INTO PART WITH POSSIBLE ERRORS DURING ROLLBACK)
In case of database upgrades, the database would need to be backed up and the backup recovered before rolling back.
 example: new database merges columns and makes a new one, making the original data unavailable in the previous older version, we need to roll back to old database version to make the new app work properly
